"""HollowMere's wild places in 3D: Gallows Wood, The Fenwood, the Tin Gallery mouth, the sea door and The Flooded
Gallery, built from the game's own scene maps the way `meshy_village_build.py` builds the village.

    blender -b --factory-startup -P tools/blender/meshy_wild_build.py -- --scene forest
        --save tools/blender/build/forest_base.blend [--preview tools/blender/build/forest_top.png] [--no-models] [--no-trees]

`--scene` is forest (Gallows Wood, 40 x 30 tiles), forest_deep (The Fenwood, 48 x 36), cave_entry (the Tin Gallery
mouth, 20 x 14), sea_exit (the sea door, 18 x 10) or cave_gallery (The Flooded Gallery, 40 x 28). The script reads
`packages/content/data/scenes/<scene>.json` and lays the place out at 1.5 m per tile in the village's frame: x east,
y north, z up, the map's centre on the origin, tile (tx, ty) centred at ((tx + 0.5 - W/2) * 1.5, (H/2 - (ty + 0.5)) * 1.5).
Every tile number in the tables below uses that centre convention (an integer is a tile's centre; `T(tx, ty)`).

It imports `meshy_village_build` (and never edits it) for the shader kit `G`, Poly Haven texture sampling, the Meshy
model placer (`source`, `place`, `building`: level of detail, texture slimming, LAMPS) and brings its own map class,
height fields, ground classes, a Poly Haven model placer, scatter, procedural pieces and the cave shell. The saved
file keeps the village's contract, so `meshy_village_look.py` and `meshy_village_fly.py` work on it:

- HM_Ground: the walkable floor, material HM_Ground with the look's nodes P_snow_tint, P_snow_shade, P_snow_rough;
  per-vertex classes in the point attributes wdi_c, wdi_d and wdi_s = (snow lying, open sky, wet, glow);
- HM_Mere: all still water (material HM_Mere with P_water_rough and a `wdi_depth` attribute);
- collections HM_World, HM_Models, HM_Forest, HM_Lights and HM_Sources (the hidden masters);
- models tagged `wdi_model`, lights tagged `wdi_light` = kind (and `wdi_gain`, which the look multiplies its energy
  by, where one look serves scenes whose lights of a kind differ);
- scene['wdi_map_w'], ['wdi_map_h'], ['wdi_scene'], ['wdi_biome'] ('forest' or 'cave') and ['wdi_ground_rows'].

Caves are an enclosed rock shell: the floor (HM_Ground), the walls and roof (HM_Rock, one object with two
materials, box-projected rock with a bump from luma; both carry a value node P_cut_z above which they are cut away,
for the cutaway overview) and a shadow-only hull (HM_CaveHull) that lets a sun in only where the map opens to the sky.

The run needs the cached Poly Haven textures (`python tools/blender/materials/fetch.py --roles <roles> --res 1k`) and
models (`python tools/blender/materials/fetch_models.py`); it stops at once and names whatever is missing. It saves
geometry, materials and tagged lights only: the look (`meshy_looks/wild_*.json`) and the stills
(`meshy_views/<scene>.json`, passed to the look as `--views-file`) do the rest.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector, noise

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import meshy_import as mi  # noqa: E402
import meshy_village_build as vb  # noqa: E402  (the village's shader kit, Meshy placer and lights: reused, not edited)
from materials import fetch_models as fm  # noqa: E402  (the locked Poly Haven models and their cache)
from materials import roles as mr  # noqa: E402  (the locked Poly Haven textures and their cache)

S = vb.S                  # metres per map tile (1.5)
RES = vb.GROUND_RES       # every Poly Haven map at 1k, as the village
SCENES_DIR = os.path.join(mi.ROOT, "packages", "content", "data", "scenes")
VIEWS_DIR = os.path.join(HERE, "meshy_views")
SCENES = ("forest", "forest_deep", "cave_entry", "sea_exit", "cave_gallery")
RNG = random.Random(1893)
MOON_AZ = 325.0           # the look's moon (meshy_looks/final.json): azimuth 325, elevation 19
U_MOON = (math.cos(math.radians(MOON_AZ)), math.sin(math.radians(MOON_AZ)))   # (0.8192, -0.5736): toward the moon
V_MOON = (-U_MOON[1], U_MOON[0])                                              # (0.5736, 0.8192)
INK = (0.006, 0.007, 0.012)  # #12141C, the darkest tone in every frame: never black
COL = vb.COL
LIGHTS: list = []
TREES: list = []


# ---------------------------------------------------------------- small maths and the frame


def clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return lo if v < lo else hi if v > hi else v


def sstep(e0: float, e1: float, x: float) -> float:
    """Smoothstep from e0 to e1 (e0 > e1 gives a falling step)."""
    if e1 == e0:
        return 1.0 if x >= e0 else 0.0
    t = clamp((x - e0) / (e1 - e0))
    return t * t * (3.0 - 2.0 * t)


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def fbm(x: float, y: float, s: float, octaves: int = 4) -> float:
    return vb._fbm(x, y, s, octaves)


def n3(x: float, y: float, z: float, s: float, seed: float = 0.0) -> float:
    return noise.noise(Vector((x * s + seed, y * s - seed, z * s + 0.37)))


def seg_d(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
    dx, dy = bx - ax, by - ay
    ll = dx * dx + dy * dy
    t = 0.0 if ll <= 1e-12 else clamp(((px - ax) * dx + (py - ay) * dy) / ll)
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def poly_d(px: float, py: float, pts, closed: bool = False) -> float:
    best, n = 1e9, len(pts)
    for i in range(n if closed else n - 1):
        a, b = pts[i], pts[(i + 1) % n]
        best = min(best, seg_d(px, py, a[0], a[1], b[0], b[1]))
    return best


def T(tx: float, ty: float) -> tuple[float, float]:
    """World x, y of a tile-centre coordinate (an integer is that tile's centre)."""
    return vb.tc(tx, ty)


def TF(x: float, y: float) -> tuple[float, float]:
    """Fractional tile-centre coordinates of a world point (the inverse of T)."""
    return x / S + vb.W / 2 - 0.5, vb.H / 2 - y / S - 0.5


def TR(tx0: float, ty0: float, tx1: float, ty1: float) -> tuple[float, float, float, float]:
    """A world rectangle (x0, y0, x1, y1) between two tile-centre corners."""
    (ax, ay), (bx, by) = T(tx0, ty0), T(tx1, ty1)
    return min(ax, bx), min(ay, by), max(ax, bx), max(ay, by)


def in_rect(x: float, y: float, r, pad: float = 0.0) -> bool:
    return r[0] - pad <= x <= r[2] + pad and r[1] - pad <= y <= r[3] + pad


def rect_d(x: float, y: float, r) -> float:
    """Distance from a point to a world rectangle (0 inside)."""
    return math.hypot(max(r[0] - x, 0.0, x - r[2]), max(r[1] - y, 0.0, y - r[3]))


def M4(x: float = 0.0, y: float = 0.0, z: float = 0.0, rz: float = 0.0, ry: float = 0.0, rx: float = 0.0,
       s: float = 1.0) -> Matrix:
    """A placement: scale, then turns about x, y and z (degrees), then the move."""
    m = Matrix.Translation(Vector((x, y, z))) @ Matrix.Rotation(math.radians(rz), 4, "Z") @ \
        Matrix.Rotation(math.radians(ry), 4, "Y") @ Matrix.Rotation(math.radians(rx), 4, "X")
    return m @ Matrix.Scale(s, 4) if s != 1.0 else m


def face_deg(facing: str) -> float:
    """Yaw (degrees) that turns a procedural piece built with its front to -y (south) to face `facing`."""
    return vb.ANG[facing] - vb.ANG["S"]


class Hash:
    """Points in square buckets, for 'anything within r metres' questions."""

    def __init__(self, cell: float = 3.0):
        self.c, self.d = cell, {}

    def _k(self, x: float, y: float):
        return math.floor(x / self.c), math.floor(y / self.c)

    def add(self, x: float, y: float, item=None) -> None:
        self.d.setdefault(self._k(x, y), []).append((x, y, item))

    def near(self, x: float, y: float, r: float):
        k = int(math.ceil(r / self.c))
        cx, cy = self._k(x, y)
        for i in range(cx - k, cx + k + 1):
            for j in range(cy - k, cy + k + 1):
                for px, py, it in self.d.get((i, j), ()):
                    dd = math.hypot(px - x, py - y)
                    if dd <= r:
                        yield px, py, it, dd

    def nearest(self, x: float, y: float, r: float) -> float:
        best = r
        for _px, _py, _it, dd in self.near(x, y, r):
            best = min(best, dd)
        return best

    def free(self, x: float, y: float, r: float) -> bool:
        return next(self.near(x, y, r), None) is None


class SegHash:
    """Line segments (ax, ay, bx, by, tag) in buckets: the nearest one within `pad` metres of a point."""

    def __init__(self, segs, cell: float = 4.0, pad: float = 3.0):
        self.c, self.pad, self.d = cell, pad, {}
        for s in segs:
            x0, x1 = min(s[0], s[2]) - pad, max(s[0], s[2]) + pad
            y0, y1 = min(s[1], s[3]) - pad, max(s[1], s[3]) + pad
            for i in range(math.floor(x0 / cell), math.floor(x1 / cell) + 1):
                for j in range(math.floor(y0 / cell), math.floor(y1 / cell) + 1):
                    self.d.setdefault((i, j), []).append(s)

    def nearest(self, x: float, y: float):
        """(distance, tag) of the nearest segment, (pad, None) when none is within pad."""
        best, tag = self.pad, None
        for s in self.d.get((math.floor(x / self.c), math.floor(y / self.c)), ()):
            dd = seg_d(x, y, s[0], s[1], s[2], s[3])
            if dd < best:
                best, tag = dd, s[4] if len(s) > 4 else True
        return best, tag


# ---------------------------------------------------------------- the map


class WildMap:
    """A wild scene's JSON: material letters, the walkable grid, entries by id, and the height function."""

    def __init__(self, scene_id: str):
        with open(os.path.join(SCENES_DIR, f"{scene_id}.json"), encoding="utf-8") as fh:
            self.d = json.load(fh)
        self.id = scene_id
        self.w, self.h = int(self.d["size"]["w"]), int(self.d["size"]["h"])
        self.mat = self.d["material"]
        self.walk = [[c != "#" for c in row] for row in self.d["grid"]]
        self.forest = self.d.get("biome") == "forest"
        self.floor_default = "l" if self.forest else "r"
        self.solid_default = "T" if self.forest else "X"
        self.ground = [[self._ground(x, y) for x in range(self.w)] for y in range(self.h)]
        self.hfun = lambda x, y: 0.0
        self.byid: dict[str, dict] = {}
        for key in ("portals", "spawns", "spots", "props", "lights", "nodes", "paths", "buildings", "spawners"):
            for e in self.d.get(key) or []:
                if isinstance(e, dict) and "id" in e:
                    self.byid[e["id"]] = e

    def at(self, tx: int, ty: int) -> str:
        if 0 <= tx < self.w and 0 <= ty < self.h:
            return self.mat[ty][tx]
        return self.solid_default

    def g(self, tx: int, ty: int) -> str:
        """Ground letter (solid tiles take a walkable neighbour's), the default solid beyond the map."""
        if 0 <= tx < self.w and 0 <= ty < self.h:
            return self.ground[ty][tx]
        return self.solid_default

    def is_walk(self, tx: int, ty: int) -> bool:
        return 0 <= tx < self.w and 0 <= ty < self.h and self.walk[ty][tx]

    def _ground(self, x: int, y: int) -> str:
        c = self.mat[y][x]
        if c in vb.FLOOR or c in "OTXRW":
            return c
        for dx, dy in ((0, 1), (1, 0), (0, -1), (-1, 0)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < self.w and 0 <= ny < self.h and self.mat[ny][nx] in vb.FLOOR:
                return self.mat[ny][nx]
        return self.floor_default

    def height(self, x: float, y: float) -> float:
        return self.hfun(x, y)

    def cells(self, letters: str):
        for ty in range(self.h):
            for tx in range(self.w):
                if self.mat[ty][tx] in letters:
                    yield tx, ty

    def xy(self, eid: str, dx: float = 0.0, dy: float = 0.0) -> tuple[float, float]:
        e = self.byid[eid]
        return T(e["x"] + dx, e["y"] + dy)


def view_eyes(scene_id: str) -> list[tuple[float, float]]:
    """World x, y of every still camera's eye in meshy_views/<scene>.json (corner tile units, as the look reads them)."""
    path = os.path.join(VIEWS_DIR, f"{scene_id}.json")
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as fh:
        views = json.load(fh)
    return [((v[0][0] - vb.W / 2) * S, (vb.H / 2 - v[0][1]) * S) for k, v in views.items() if not k.startswith("_")]


# ---------------------------------------------------------------- one mesh from primitives


class MB:
    """Accumulates one mesh: vertices, faces and a material for each face. Every primitive takes a placement M."""

    def __init__(self):
        self.v, self.f, self.fm, self.mats = [], [], [], []

    def mi(self, mat) -> int:
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def add(self, verts, faces, mat=None, M: Matrix | None = None, flip: bool = False) -> int:
        b = len(self.v)
        if M is not None:
            verts = [tuple(M @ Vector(p)) for p in verts]
        self.v.extend(tuple(p) for p in verts)
        k = self.mi(mat) if mat is not None else 0
        for f in faces:
            f = tuple(reversed(f)) if flip else f
            self.f.append(tuple(b + i for i in f))
            self.fm.append(k)
        return b

    def box(self, sx: float, sy: float, sz: float, M=None, mat=None, base: bool = False, flip: bool = False) -> int:
        x, y = sx / 2, sy / 2
        z0, z1 = (0.0, sz) if base else (-sz / 2, sz / 2)
        v = [(-x, -y, z0), (x, -y, z0), (x, y, z0), (-x, y, z0), (-x, -y, z1), (x, -y, z1), (x, y, z1), (-x, y, z1)]
        f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        return self.add(v, f, mat, M, flip)

    def cyl(self, r0: float, r1: float, h: float, n: int = 12, M=None, mat=None, caps: bool = True, z0: float = 0.0,
            flip: bool = False, jitter: float = 0.0) -> int:
        """A tapered cylinder along local z from z0 to z0 + h (a cone when r1 is 0)."""
        v, f = [], []
        for k in range(n):
            a = 2 * math.pi * k / n
            j = 1.0 + (RNG.uniform(-jitter, jitter) if jitter else 0.0)
            v.append((r0 * j * math.cos(a), r0 * j * math.sin(a), z0))
        if r1 <= 1e-5:
            v.append((0.0, 0.0, z0 + h))
            for k in range(n):
                f.append((k, (k + 1) % n, n))
        else:
            for k in range(n):
                a = 2 * math.pi * k / n
                v.append((r1 * math.cos(a), r1 * math.sin(a), z0 + h))
            for k in range(n):
                f.append((k, (k + 1) % n, n + (k + 1) % n, n + k))
            if caps:
                f.append(tuple(range(n, 2 * n)))
        if caps:
            f.append(tuple(reversed(range(n))))
        return self.add(v, f, mat, M, flip)

    def sphere(self, rx: float, ry: float, rz: float, nu: int = 10, nv: int = 6, M=None, mat=None, lumpy: float = 0.0) -> int:
        v = [(0.0, 0.0, -rz)]
        for j in range(1, nv):
            t = math.pi * j / nv - math.pi / 2
            for i in range(nu):
                a = 2 * math.pi * i / nu
                k = 1.0 + (RNG.uniform(-lumpy, lumpy) if lumpy else 0.0)
                v.append((rx * k * math.cos(t) * math.cos(a), ry * k * math.cos(t) * math.sin(a), rz * k * math.sin(t)))
        v.append((0.0, 0.0, rz))
        top, f = len(v) - 1, []
        for i in range(nu):
            f.append((0, 1 + (i + 1) % nu, 1 + i))
        for j in range(nv - 2):
            r0, r1 = 1 + j * nu, 1 + (j + 1) * nu
            for i in range(nu):
                f.append((r0 + i, r0 + (i + 1) % nu, r1 + (i + 1) % nu, r1 + i))
        rl = 1 + (nv - 2) * nu
        for i in range(nu):
            f.append((rl + i, rl + (i + 1) % nu, top))
        return self.add(v, f, mat, M)

    def disc(self, r: float, n: int = 16, M=None, mat=None, rough: float = 0.0) -> int:
        v = []
        for k in range(n):
            a = 2 * math.pi * k / n
            rr = r * (1.0 + (RNG.uniform(-rough, rough) if rough else 0.0))
            v.append((rr * math.cos(a), rr * math.sin(a), 0.0))
        return self.add(v, [tuple(range(n))], mat, M)

    def torus(self, big: float, small: float, nu: int = 16, nv: int = 6, M=None, mat=None) -> int:
        v, f = [], []
        for i in range(nu):
            a = 2 * math.pi * i / nu
            for j in range(nv):
                b = 2 * math.pi * j / nv
                rr = big + small * math.cos(b)
                v.append((rr * math.cos(a), rr * math.sin(a), small * math.sin(b)))
        for i in range(nu):
            for j in range(nv):
                a, b = i * nv + j, ((i + 1) % nu) * nv + j
                c, d = ((i + 1) % nu) * nv + (j + 1) % nv, i * nv + (j + 1) % nv
                f.append((a, b, c, d))
        return self.add(v, f, mat, M)

    def tube(self, pts, r, n: int = 6, mat=None, M=None, caps: bool = True) -> int:
        """A tube along a polyline of points (radius a number or one per point)."""
        pts = [Vector(p) for p in pts]
        rs = r if isinstance(r, (list, tuple)) else [r] * len(pts)
        v, f = [], []
        for k, p in enumerate(pts):
            t = (pts[min(k + 1, len(pts) - 1)] - pts[max(k - 1, 0)]).normalized()
            ref = Vector((0.0, 0.0, 1.0)) if abs(t.z) < 0.9 else Vector((1.0, 0.0, 0.0))
            side = t.cross(ref).normalized()
            up = side.cross(t).normalized()
            for i in range(n):
                a = 2 * math.pi * i / n
                v.append(tuple(p + rs[k] * (math.cos(a) * up + math.sin(a) * side)))
        for k in range(len(pts) - 1):
            for i in range(n):
                a, b = k * n + i, k * n + (i + 1) % n
                f.append((a, b, b + n, a + n))
        if caps:
            f.append(tuple(reversed(range(n))))
            f.append(tuple((len(pts) - 1) * n + i for i in range(n)))
        return self.add(v, f, mat, M)

    def quad(self, p0, p1, p2, p3, mat=None, M=None) -> int:
        return self.add([p0, p1, p2, p3], [(0, 1, 2, 3)], mat, M)

    def build(self, name: str, col: str = "models", smooth: bool = False, shadow: bool = True, **props):
        if not self.f:
            return None
        me = bpy.data.meshes.new(name)
        me.from_pydata(self.v, [], self.f)
        for m in self.mats:
            me.materials.append(m)
        if len(self.mats) > 1:
            me.polygons.foreach_set("material_index", self.fm)
        if smooth:
            me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
        me.update()
        ob = bpy.data.objects.new(name, me)
        COL[col].objects.link(ob)
        ob.visible_shadow = shadow
        for k, v in props.items():
            ob[k] = v
        return ob


# ---------------------------------------------------------------- materials


_new = vb._new
_MATS: dict[str, bpy.types.Material] = {}


def _sock(node, *names):
    for n in names:
        if n in node.inputs:
            return node.inputs[n]
    raise KeyError(f"{node.bl_idname} has none of the inputs {names}")


def attr4(g, name: str):
    """The four channels of a FLOAT_COLOR point attribute."""
    a = _new(g.n, "ShaderNodeAttribute", attribute_name=name)
    s = _new(g.n, "ShaderNodeSeparateXYZ")
    g.link(a.outputs["Vector"], s.inputs[0])
    return s.outputs[0], s.outputs[1], s.outputs[2], a.outputs["Alpha"]


def attr1(g, name: str):
    return _new(g.n, "ShaderNodeAttribute", attribute_name=name).outputs["Fac"]


def mul_rgb(g, col, tint):
    n = _new(g.n, "ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY")
    n.inputs[0].default_value = 1.0
    g._in(n.inputs[6], col)
    n.inputs[7].default_value = (*tint[:3], 1.0)
    return n.outputs[2]


def scale_by(g, col, factor):
    n = _new(g.n, "ShaderNodeVectorMath", operation="SCALE")
    g.link(col, n.inputs[0])
    g._in(n.inputs["Scale"], factor)
    return n.outputs["Vector"]


def sep3(g, vec):
    s = _new(g.n, "ShaderNodeSeparateXYZ")
    g.link(vec, s.inputs[0])
    return s.outputs[0], s.outputs[1], s.outputs[2]


def xy_dist(g, pos, cx: float, cy: float):
    """Horizontal distance of the shading point from (cx, cy)."""
    sub = _new(g.n, "ShaderNodeVectorMath", operation="SUBTRACT")
    g.link(pos, sub.inputs[0])
    sub.inputs[1].default_value = (cx, cy, 0.0)
    flat = _new(g.n, "ShaderNodeVectorMath", operation="MULTIPLY")
    g.link(sub.outputs["Vector"], flat.inputs[0])
    flat.inputs[1].default_value = (1.0, 1.0, 0.0)
    ln = _new(g.n, "ShaderNodeVectorMath", operation="LENGTH")
    g.link(flat.outputs["Vector"], ln.inputs[0])
    return ln.outputs["Value"]


def box_tex(g, role: str, map_name: str = "diff", zoom: float = 1.0, blend: float = 0.25):
    """A role's map box-projected in object space at the scan's own size (no tangent frame: pair with a bump)."""
    path = mr.texture_path(role, map_name, res=RES)
    if not os.path.exists(path):
        raise FileNotFoundError(f"{path}: run `python tools/blender/materials/fetch.py --roles {role} --res {RES}`")
    img = bpy.data.images.load(path, check_existing=True)
    if map_name != "diff":
        img.colorspace_settings.name = "Non-Color"
    tco = _new(g.n, "ShaderNodeTexCoord")
    sc = _new(g.n, "ShaderNodeVectorMath", operation="SCALE")
    sc.inputs["Scale"].default_value = 1.0 / (vb.ph_metres(role) * zoom)
    g.link(tco.outputs["Object"], sc.inputs[0])
    node = _new(g.n, "ShaderNodeTexImage")
    node.image = img
    node.projection = "BOX"
    node.projection_blend = blend
    g.link(sc.outputs["Vector"], node.inputs["Vector"])
    return node.outputs["Color"]


def _cull(m, on: bool = True) -> None:
    m.use_backface_culling = on
    if hasattr(m, "use_backface_culling_shadow"):
        m.use_backface_culling_shadow = False


def flat_mat(name: str, color, rough: float = 0.7, metal: float = 0.0, emit=None, emit_strength: float = 0.0,
             transmission: float = 0.0, cull: bool = False) -> bpy.types.Material:
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    b = vb._principled(m)
    b.inputs["Base Color"].default_value = (*color[:3], 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit is not None and emit_strength > 0:
        b.inputs["Emission Color"].default_value = (*emit[:3], 1.0)
        b.inputs["Emission Strength"].default_value = emit_strength
    if transmission > 0:
        _sock(b, "Transmission Weight", "Transmission").default_value = transmission
    if cull:
        _cull(m)
    _MATS[name] = m
    return m


def role_mat(name: str, role: str, k: float = 1.0, desat: float = 0.0, tint=None, rough: float = 0.7,
             zoom: float = 1.0, snow: float = 0.0, bump: float = 0.35, cull: bool = False, wet_below: float | None = None,
             depth_ink: tuple | None = None) -> bpy.types.Material:
    """A role's diffuse box-projected on a procedural piece, toned, with a bump from luma; `snow` lays the scene's
    snow on up-facing faces in patches (value node P_wood_snow); `wet_below` darkens and glosses everything under
    that height; `depth_ink` = (axis 'x'|'y', start, end) pulls the colour toward ink with depth (tunnels)."""
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    b = vb._principled(m)
    g = vb.G(m.node_tree)
    pos = g.position()
    col = box_tex(g, role, "diff", zoom)
    if k != 1.0:
        col = g.scale(col, k)
    if desat:
        col = g.desat(col, desat)
    if tint is not None:
        col = mul_rgb(g, col, tint)
    rough_s = g.value(rough)
    if wet_below is not None:
        _x, _y, z = sep3(g, pos)
        wet = g.math("SUBTRACT", 1.0, g.smooth(z, wet_below - 0.05, wet_below + 0.05))
        col = g.mix(wet, col, g.scale(col, 0.55))
        rough_s = g.mixf(wet, rough_s, 0.3)
    if depth_ink is not None:
        ax, d0, d1 = depth_ink
        x, y, _z = sep3(g, pos)
        col = g.mix(g.smooth(x if ax == "x" else y, d0, d1), col, INK)
    if snow > 0:
        geo = _new(g.n, "ShaderNodeNewGeometry")
        _nx, _ny, nz = sep3(g, geo.outputs["Normal"])
        up = g.smooth(nz, 0.50, 0.82)
        patch = g.smooth(g.noise(pos, 0.9, 4.0), 0.34, 0.58)
        amt = g.math("MULTIPLY", g.math("MULTIPLY", up, patch), g.value(snow, "P_wood_snow"))
        col = g.mix(amt, col, (0.80, 0.84, 0.90))
        rough_s = g.mixf(amt, rough_s, 0.6)
    g.link(col, b.inputs["Base Color"])
    g.link(rough_s, b.inputs["Roughness"])
    if bump > 0:
        bp = _new(g.n, "ShaderNodeBump")
        bp.inputs["Strength"].default_value = bump
        bp.inputs["Distance"].default_value = 0.02
        g.link(g.gray(col), bp.inputs["Height"])
        g.link(bp.outputs["Normal"], b.inputs["Normal"])
    if cull:
        _cull(m)
    _MATS[name] = m
    return m


def volume_mat(name: str, color, density: float, z0: float | None = None, fall: float | None = None,
               nscale: float = 0.0, nbase: float = 1.0, ngain: float = 0.0, anisotropy: float = 0.2,
               radial=None, top: float | None = None, emit=None, emit_strength: float = 0.0,
               node: str = "P_density", ramp_x=None, fade=None) -> bpy.types.Material:
    """A Principled Volume: density x exp(-(z - z0) / fall) x (nbase + ngain x noise), optionally faded to 0
    between r0 and r1 metres from a vertical axis (radial = (cx, cy, r0, r1)), above `top` (soft over 0.6 m), along
    x (ramp_x = (x0, x1): 0 at x0, full at x1) and with height (fade = (z0, z1): full at z0, 0 at z1)."""
    m = bpy.data.materials.new(name)
    nodes, links = m.node_tree.nodes, m.node_tree.links
    for n in list(nodes):
        nodes.remove(n)
    g = vb.G(m.node_tree)
    pos = g.position()
    x, _y, z = sep3(g, pos)
    d = g.value(density, node)
    if fall:
        zz = g.math("MAXIMUM", z, z0 or 0.0)
        d = g.math("MULTIPLY", d, g.math("EXPONENT", g.math("DIVIDE", g.math("SUBTRACT", z0 or 0.0, zz), fall)))
    if ngain:
        d = g.math("MULTIPLY", d, g.math("ADD", nbase, g.math("MULTIPLY", g.noise(pos, nscale, 3.0), ngain)))
    if radial is not None:
        cx, cy, r0, r1 = radial
        d = g.math("MULTIPLY", d, g.math("SUBTRACT", 1.0, g.smooth(xy_dist(g, pos, cx, cy), r0, r1)))
    if top is not None:
        d = g.math("MULTIPLY", d, g.math("SUBTRACT", 1.0, g.smooth(z, top - 0.6, top)))
    if ramp_x is not None:
        d = g.math("MULTIPLY", d, g.smooth(x, ramp_x[0], ramp_x[1]))
    if fade is not None:
        d = g.math("MULTIPLY", d, g.math("SUBTRACT", 1.0, g.smooth(z, fade[0], fade[1])))
    vol = _new(nodes, "ShaderNodeVolumePrincipled")
    vol.inputs["Color"].default_value = (*color[:3], 1.0)
    vol.inputs["Anisotropy"].default_value = anisotropy
    g.link(d, vol.inputs["Density"])
    if emit is not None and emit_strength > 0:
        _sock(vol, "Emission Color").default_value = (*emit[:3], 1.0)
        _sock(vol, "Emission Strength").default_value = emit_strength
    out = _new(nodes, "ShaderNodeOutputMaterial")
    links.new(vol.outputs[0], out.inputs["Volume"])
    return m


def volume_object(name: str, mb: MB, col: str = "world"):
    ob = mb.build(name, col=col, shadow=False, wdi_volume=True)
    return ob


# ---------------------------------------------------------------- Poly Haven models (fetch_models.py's cache)


_PHLOCK: dict = {}
PH_BASE: dict[str, list] = {}   # slug -> its pieces (hidden masters), in node-name order
PH_SRC: dict[tuple, bpy.types.Object] = {}
JOINED = {"wooden_lantern_01"}  # one model in several pieces: kept together
# foliage grades over the scans (decision 7: the scans stay; the season is a grade on top):
# (hue, saturation, value, multiply or None, frost share on up-facing normals)
GRADES = {
    "russet": (0.43, 0.55, 0.65, None, 0.15),                    # Gallows Wood: frost-killed bracken
    "bramble": (0.45, 0.45, 0.45, None, 0.15),                   # Gallows Wood: dark winter bramble
    "dead_fern": (0.27, 0.60, 0.70, (0.85, 0.62, 0.42), 0.12),   # The Fenwood: rust bracken
    "dead_shrub": (0.30, 0.35, 0.60, None, 0.12),                # The Fenwood: grey-brown dead bramble
    "frost_brown": (0.40, 0.50, 0.60, (0.90, 0.70, 0.50), 0.10),  # the Tin Gallery mouth
    "bleach": (0.50, 0.25, 1.30, (0.95, 0.90, 0.82), 0.0),       # salt-bleached driftwood at the sea door
    "slate": (0.50, 0.30, 0.80, (0.84, 0.88, 0.95), 0.0),         # the Flooded Gallery's heap stones (some read wine-mauve)
}


def ph_lock(slug: str) -> dict:
    if not _PHLOCK:
        with open(fm.LOCK_FILE, encoding="utf-8") as fh:
            _PHLOCK.update(json.load(fh))
    return _PHLOCK["assets"][slug]


def _pick_blend(names: list[str], pieces: list[str]) -> list[str]:
    """The objects of a Poly Haven .blend that are the model's pieces (the glTF's node names), LOD0 where it has LODs."""
    out = []
    for p in pieces:
        cand = [n for n in names if n == p] or [n for n in names if n.startswith(p) and "LOD0" in n.upper()] or \
            [n for n in names if n.startswith(p) and "LOD" not in n.upper()] or [n for n in names if n.startswith(p)]
        if cand:
            out.append(sorted(cand)[0])
    if not out:
        out = [n for n in names if not any(f"LOD{k}" in n.upper() for k in (1, 2, 3, 4))]
    return sorted(set(out))


def _fix_images(objs, folder: str) -> None:
    """Point appended images at the model's own folder when their library-relative path does not resolve."""
    for o in objs:
        for slot in o.material_slots:
            mat = slot.material
            if mat is None or mat.node_tree is None:
                continue
            for n in mat.node_tree.nodes:
                if n.type != "TEX_IMAGE" or n.image is None or n.image.packed_file is not None:
                    continue
                img = n.image
                if os.path.exists(bpy.path.abspath(img.filepath)):
                    continue
                rel = img.filepath[2:] if img.filepath.startswith("//") else os.path.basename(img.filepath)
                for cand in (os.path.join(folder, rel), os.path.join(folder, "textures", os.path.basename(rel))):
                    if os.path.exists(cand):
                        img.filepath = cand
                        img.reload()
                        break
                else:
                    print("PH image not found:", img.filepath, flush=True)


def ph_pieces(slug: str) -> list:
    """Import a Poly Haven model once: its pieces as hidden masters, each with its footprint centre on the origin and
    its base on z = 0, sized as scanned (custom props wdi_size = longest side, wdi_dims)."""
    if slug in PH_BASE:
        return PH_BASE[slug]
    path = fm.model_path(slug, must_exist=True)
    names = sorted(ph_lock(slug).get("pieces") or [slug])
    before = set(bpy.data.objects)
    if path.endswith(".gltf"):
        bpy.ops.import_scene.gltf(filepath=path)
        new = [o for o in bpy.data.objects if o not in before]
    else:
        with bpy.data.libraries.load(path, link=False) as (src, dst):
            dst.objects = _pick_blend(list(src.objects), names)
        new = [o for o in dst.objects if o is not None]
        for o in new:
            if not o.users_collection:
                bpy.context.scene.collection.objects.link(o)
        _fix_images(new, os.path.dirname(path))
    bpy.context.view_layer.update()
    meshes = [o for o in new if o.type == "MESH"]
    if not meshes:
        raise ValueError(f"Poly Haven model {slug} brought no mesh from {path}")
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        if o.data.users > 1:
            o.data = o.data.copy()
        o.modifiers.clear()
        o.data.transform(mw)
        o.matrix_world = Matrix.Identity(4)
    for o in new:
        if o.type != "MESH":
            bpy.data.objects.remove(o, do_unlink=True)
    for o in meshes:  # alpha cards and glass: their shadows follow the cut-outs
        for slot in o.material_slots:
            if slot.material is not None and hasattr(slot.material, "use_transparent_shadow"):
                slot.material.use_transparent_shadow = True
    if slug in JOINED and len(meshes) > 1:
        bpy.ops.object.select_all(action="DESELECT")
        for o in meshes:
            o.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.join()
        meshes = [bpy.context.view_layer.objects.active]
    out = []
    for o in sorted(meshes, key=lambda ob: ob.name):
        co = [0.0] * (len(o.data.vertices) * 3)
        o.data.vertices.foreach_get("co", co)
        lo = Vector((min(co[0::3]), min(co[1::3]), min(co[2::3])))
        hi = Vector((max(co[0::3]), max(co[1::3]), max(co[2::3])))
        o.data.transform(Matrix.Translation(Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))))
        size = hi - lo
        o["wdi_size"] = float(max(size))
        o["wdi_dims"] = [float(v) for v in size]
        for c in list(o.users_collection):
            c.objects.unlink(o)
        COL["src"].objects.link(o)
        o.rotation_mode = "XYZ"
        o.name = f"PH_{slug}_{len(out) + 1}"
        out.append(o)
    PH_BASE[slug] = out
    print(f"PH {slug}: {len(out)} pieces, longest " + ", ".join(f"{p['wdi_size']:.2f}" for p in out), flush=True)
    return out


def _plant_group(nodes):
    """The Poly Haven plant group (shrub_02, grass_medium_02 .blend): the Principled BSDF, the translucency and an HSV
    sit inside it, and the diffuse map comes in on its 'Diffuse' input; None for a material without one."""
    return next((n for n in nodes if n.type == "GROUP" and "Diffuse" in n.inputs), None)


def _grade_material(mat, slug: str, grade: str) -> None:
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
    grp = _plant_group(nodes)
    if grade == "dry":  # grass_medium_02's own dead-grass map instead of the green one
        if grp is not None and "Dead Amount" in grp.inputs:
            grp.inputs["Dead Amount"].default_value = 1.0   # the group's own 'Diffuse Dead' map (and its rougher blades)
            return
        dry = os.path.join(os.path.dirname(fm.model_path(slug)), "textures", f"{slug}_dry_diff_1k.png")
        if os.path.exists(dry):
            img = bpy.data.images.load(dry, check_existing=True)
            for n in nodes:
                nm = n.image.name.lower() if n.type == "TEX_IMAGE" and n.image else ""
                if "diff" in nm and "dry" not in nm:
                    n.image = img
        return
    # the colour to grade: the map on the Principled's Base Color, else the map on the plant group's Diffuse
    if bsdf is not None and bsdf.inputs["Base Color"].is_linked:
        src = bsdf.inputs["Base Color"].links[0].from_socket
    elif grp is not None and grp.inputs["Diffuse"].is_linked:
        src = grp.inputs["Diffuse"].links[0].from_socket
    else:
        return
    if grade == "tin":  # dark ore rock studded with pale blue-grey crystals that glint (the tin nodes)
        if bsdf is None or not bsdf.inputs["Base Color"].is_linked:
            return
        g = vb.G(mat.node_tree)
        vor = g.voronoi(_new(nodes, "ShaderNodeTexCoord").outputs["Object"], 14.0)
        rnd, _g2, _b2 = sep3(g, vor.outputs["Color"])
        cry = g.math("MULTIPLY", g.smooth(rnd, 0.84, 0.88), g.math("SUBTRACT", 1.0, g.smooth(vor.outputs["Distance"], 0.25, 0.35)))
        links.new(g.mix(cry, g.scale(src, 0.65), (0.36, 0.40, 0.46)), bsdf.inputs["Base Color"])
        for sock, val in (("Roughness", 0.12), ("Metallic", 0.3)):
            inp = bsdf.inputs[sock]
            mix = _new(nodes, "ShaderNodeMix", data_type="FLOAT")
            links.new(cry, mix.inputs[0])
            if inp.is_linked:
                links.new(inp.links[0].from_socket, mix.inputs[2])
            else:
                mix.inputs[2].default_value = inp.default_value
            mix.inputs[3].default_value = val
            links.new(mix.outputs[0], inp)
        return
    h, s, v, tint, frost = GRADES[grade]
    # every input the colour feeds gets the graded one: the Base Color, fern_02's Translucent BSDF (half of each frond
    # against the light), shrub_02's group Diffuse (the group's own Hue/Saturation/Value inputs are neutral, 0.5/1/1,
    # and stay so: the grade runs in the same order as on a plain Principled)
    users = [lk.to_socket for lk in src.links]
    hsv = nodes.new("ShaderNodeHueSaturation")
    hsv.inputs["Hue"].default_value = h
    hsv.inputs["Saturation"].default_value = s
    hsv.inputs["Value"].default_value = v
    links.new(src, hsv.inputs["Color"])
    out = hsv.outputs["Color"]
    g = vb.G(mat.node_tree)
    if tint is not None:
        out = mul_rgb(g, out, tint)
    if frost:
        geo = _new(nodes, "ShaderNodeNewGeometry")
        _nx, _ny, nz = sep3(g, geo.outputs["Normal"])
        out = g.mix(g.math("MULTIPLY", g.smooth(nz, 0.5, 0.85), frost), out, (0.85, 0.85, 0.82))
    for sock in users:
        links.new(out, sock)


def _decimate(o, ratio: float) -> None:
    """Apply a Decimate modifier with the object active and selected (as meshy_village_build.source does)."""
    bpy.context.scene.collection.objects.link(o)
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    mod = o.modifiers.new("lod", "DECIMATE")
    mod.ratio = ratio
    bpy.ops.object.modifier_apply(modifier="lod")
    o.data.polygons.foreach_set("use_smooth", [True] * len(o.data.polygons))
    bpy.context.scene.collection.objects.unlink(o)


def _piece_index(slug: str, piece) -> int:
    """piece: None (the first or only), an int (1-based, node-name order) or '#k' (k-th largest, #1 the largest)."""
    pieces = ph_pieces(slug)
    if piece is None:
        return 0
    if isinstance(piece, str) and piece.startswith("#"):
        rank = sorted(range(len(pieces)), key=lambda i: -pieces[i]["wdi_size"])
        return rank[min(max(int(piece[1:]), 1), len(pieces)) - 1]
    return min(max(int(piece), 1), len(pieces)) - 1


def ph_count(slug: str) -> int:
    return len(ph_pieces(slug))


def ph_source(slug: str, piece=None, lod: float | None = None, grade: str | None = None):
    """A hidden master of one piece, decimated to `lod` and graded (alpha cards: pass lod None, never decimate)."""
    i = _piece_index(slug, piece)
    lod = None if (lod is None or lod >= 0.999) else round(float(lod), 3)
    key = (slug, i, lod, grade)
    if key in PH_SRC:
        return PH_SRC[key]
    base = ph_pieces(slug)[i]
    if lod is None and grade is None:
        PH_SRC[key] = base
        return base
    o = base.copy()
    o.data = base.data.copy()
    o.name = f"{base.name}@{lod or 1}{('_' + grade) if grade else ''}"
    if grade:
        for k, slot in enumerate(o.material_slots):
            if slot.material is None:
                continue
            new = slot.material.copy()
            new.name = f"{slot.material.name}_{grade}"
            if slot.link == "OBJECT":
                slot.material = new
            else:
                o.data.materials[k] = new
            _grade_material(new, slug, grade)
    if lod is not None:
        _decimate(o, lod)
    COL["src"].objects.link(o)
    PH_SRC[key] = o
    return o


def orient(o, yaw: float, tilt: float = 0.0, toward: float | None = None) -> None:
    """Yaw (degrees) about z, then lean the top `tilt` degrees toward the azimuth `toward` (default: the yaw)."""
    o.rotation_mode = "XYZ"
    R = Matrix.Rotation(math.radians(yaw), 4, "Z")
    if tilt:
        a = math.radians(yaw if toward is None else toward)
        R = Matrix.Rotation(math.radians(tilt), 4, Vector((-math.sin(a), math.cos(a), 0.0))) @ R
    o.rotation_euler = R.to_euler("XYZ")


def ph_place(mp, slug: str, x: float, y: float, rot: float | None = None, size: float | None = None,
             scale: float | None = None, piece=None, lod: float | None = None, z: float | None = None, sink: float = 0.0,
             sink_frac: float = 0.0, col: str = "models", grade: str | None = None, tilt: float = 0.0,
             toward: float | None = None, tall: float | None = None):
    """A linked duplicate of a Poly Haven piece standing on the ground; `size` is its longest side in metres (the
    mesh's own, not the API's), `tall` its height instead, `sink_frac` sinks it by that share of its height."""
    src = ph_source(slug, piece, lod, grade)
    o = src.copy()
    COL[col].objects.link(o)
    if tall:
        k = tall / max(src["wdi_dims"][2], 1e-3)
    else:
        k = scale if scale is not None else (size / src["wdi_size"] if size else 1.0)
    o.scale = (k, k, k)
    orient(o, rot if rot is not None else RNG.uniform(0.0, 360.0), tilt, toward)
    h = src["wdi_dims"][2] * k
    base = mp.height(x, y) if z is None else z
    o.location = (x, y, base - sink - sink_frac * h)
    o["wdi_model"] = slug
    return o


def mplace(mp, name: str, x: float, y: float, tilt: float = 0.0, toward: float | None = None, **kw):
    """meshy_village_build.place plus an optional lean."""
    o = vb.place(mp, name, x, y, **kw)
    if tilt:
        orient(o, math.degrees(o.rotation_euler.z), tilt, toward)
    return o


def wbox(o) -> tuple[Vector, Vector]:
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return (Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))),
            Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts))))


def ray_down(o, x: float, y: float, z0: float = 60.0):
    """World point where a ray straight down at (x, y) first meets object o, or None."""
    bpy.context.view_layer.update()
    mw = o.matrix_world
    inv = mw.inverted()
    org = inv @ Vector((x, y, z0))
    d = (inv.to_3x3() @ Vector((0.0, 0.0, -1.0))).normalized()
    ok, loc, _n, _i = o.ray_cast(org, d, depsgraph=bpy.context.evaluated_depsgraph_get())
    return (mw @ loc) if ok else None


def cut_faces(o, test) -> int:
    """Delete the faces of a master whose centroid (catalog frame) passes test(x, y, z); returns how many."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    dead = [f for f in bm.faces if test(*f.calc_center_median())]
    if dead:
        bmesh.ops.delete(bm, geom=dead, context="FACES")
    bm.to_mesh(o.data)
    bm.free()
    o.data.update()
    return len(dead)


def warm_mask(nodes, links, g, src):
    """apply_emissive's lamp-glass mask on a colour socket: warm (R - B) and bright ((R + G) / 2)."""
    r, gg, b = sep3(g, src)
    warm = g.smooth(g.math("SUBTRACT", r, b), 0.30, 0.55)
    bright = g.smooth(g.math("MULTIPLY", g.math("ADD", r, gg), 0.5), 0.50, 0.85)
    return g.math("MULTIPLY", warm, bright)


def darken_lanterns(name: str, amount: float = 0.8) -> None:
    """Soot the painted lamp glass of a Meshy model that the data does not light: base colour x (1 - amount x warm)."""
    o = vb.source(name)
    for slot in o.material_slots:
        mat = slot.material
        if mat is None or mat.node_tree is None or "WDI_dark" in mat.node_tree.nodes:
            continue
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        bsdf = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None or not bsdf.inputs["Base Color"].is_linked:
            continue
        g = vb.G(mat.node_tree)
        src = bsdf.inputs["Base Color"].links[0].from_socket
        k = g.math("SUBTRACT", 1.0, g.math("MULTIPLY", warm_mask(nodes, links, g, src), amount))
        out = scale_by(g, src, k)
        mark = _new(nodes, "ShaderNodeValue")
        mark.name = "WDI_dark"
        links.new(out, bsdf.inputs["Base Color"])


def snow_mask_model(name: str, toward, rough: float, share: float = 0.85, up_only: bool = False,
                    sat_hi: float = 0.18, val_lo: float = 0.62, val_hi: float = 0.80) -> None:
    """Turn a Meshy model's baked snow (bright, unsaturated texels) toward another colour: wet flowstone on the
    stalagmites, salt-bleached wood on the sea logs, dark grime on the gallery's cart and crib."""
    o = vb.source(name)
    for slot in o.material_slots:
        mat = slot.material
        if mat is None or mat.node_tree is None or "WDI_desnow" in mat.node_tree.nodes:
            continue
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        bsdf = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None or not bsdf.inputs["Base Color"].is_linked:
            continue
        g = vb.G(mat.node_tree)
        src = bsdf.inputs["Base Color"].links[0].from_socket
        sep = _new(nodes, "ShaderNodeSeparateColor", mode="HSV")
        links.new(src, sep.inputs[0])
        mask = g.math("MULTIPLY", g.smooth(sep.outputs[2], val_lo, val_hi),
                      g.math("SUBTRACT", 1.0, g.smooth(sep.outputs[1], sat_hi - 0.10, sat_hi)))
        if up_only:
            geo = _new(nodes, "ShaderNodeNewGeometry")
            _nx, _ny, nz = sep3(g, geo.outputs["Normal"])
            mask = g.math("MULTIPLY", mask, g.smooth(nz, 0.45, 0.75))
        amt = g.math("MULTIPLY", mask, share)
        links.new(g.mix(amt, src, toward), bsdf.inputs["Base Color"])
        r = bsdf.inputs["Roughness"]
        mixr = _new(nodes, "ShaderNodeMix", data_type="FLOAT")
        links.new(amt, mixr.inputs[0])
        if r.is_linked:
            links.new(r.links[0].from_socket, mixr.inputs[2])
        else:
            mixr.inputs[2].default_value = r.default_value
        mixr.inputs[3].default_value = rough
        links.new(mixr.outputs[0], r)
        mark = _new(nodes, "ShaderNodeValue")
        mark.name = "WDI_desnow"


# ---------------------------------------------------------------- lights (tagged; the look sets their strength)


def _light(kind: str, lid: str, ld, loc, energy: float, color, volume: float, shadow: bool, cutoff, gain: float,
           radius: float | None = None):
    ld.energy = float(energy)
    ld.color = tuple(color[:3])
    if radius is not None and hasattr(ld, "shadow_soft_size"):
        ld.shadow_soft_size = float(radius)
    if hasattr(ld, "volume_factor"):
        ld.volume_factor = float(volume)
    ld.use_shadow = bool(shadow)
    if cutoff and hasattr(ld, "use_custom_distance"):
        ld.use_custom_distance = True
        ld.cutoff_distance = float(cutoff)
    ob = bpy.data.objects.new(f"L_{kind}_{lid}", ld)
    COL["lights"].objects.link(ob)
    ob.location = tuple(loc)
    ob["wdi_light"] = kind
    ob["wdi_light_id"] = lid
    if gain != 1.0:
        ob["wdi_gain"] = float(gain)
    LIGHTS.append(ob)
    return ob


def point_light(kind: str, lid: str, x: float, y: float, z: float, energy: float, color, radius: float = 0.1,
                volume: float = 1.0, shadow: bool = False, cutoff: float | None = None, gain: float = 1.0):
    ld = bpy.data.lights.new(f"L_{kind}_{lid}", "POINT")
    return _light(kind, lid, ld, (x, y, z), energy, color, volume, shadow, cutoff, gain, radius)


def spot_light(kind: str, lid: str, pos, target, energy: float, color, size_deg: float, blend: float,
               radius: float = 0.2, volume: float = 1.0, shadow: bool = False, cutoff: float | None = None,
               gain: float = 1.0):
    ld = bpy.data.lights.new(f"L_{kind}_{lid}", "SPOT")
    ld.spot_size = math.radians(size_deg)
    ld.spot_blend = blend
    ob = _light(kind, lid, ld, pos, energy, color, volume, shadow, cutoff, gain, radius)
    ob.rotation_euler = (Vector(target) - Vector(pos)).to_track_quat("-Z", "Y").to_euler()
    return ob


def area_light(kind: str, lid: str, pos, direction, sx: float, sy: float, energy: float, color, volume: float = 1.0,
               shadow: bool = True, cutoff: float | None = None, gain: float = 1.0):
    ld = bpy.data.lights.new(f"L_{kind}_{lid}", "AREA")
    ld.shape = "RECTANGLE"
    ld.size, ld.size_y = sx, sy
    ob = _light(kind, lid, ld, pos, energy, color, volume, shadow, cutoff, gain)
    ob.rotation_euler = Vector(direction).normalized().to_track_quat("-Z", "Y").to_euler()
    return ob


# ---------------------------------------------------------------- ground: grids, classes, snow


def grid_axis(levels) -> list[float]:
    """Coordinates along one axis: levels = [(lo, hi, step), ...] from the outermost (coarsest) to the innermost."""
    lo, hi, step = levels[-1]
    vals = [lo + i * step for i in range(int(round((hi - lo) / step)) + 1)]
    for lo2, hi2, step2 in reversed(levels[:-1]):
        left, v = [], vals[0] - step2
        while v > lo2 - 1e-6:
            left.append(v)
            v -= step2
        right, v = [], vals[-1] + step2
        while v < hi2 + 1e-6:
            right.append(v)
            v += step2
        vals = list(reversed(left)) + vals + right
    return vals


def set_attr4(me, name: str, data) -> None:
    a = me.color_attributes.new(name=name, type="FLOAT_COLOR", domain="POINT")
    a.data.foreach_set("color", data)


def set_attr1(me, name: str, data) -> None:
    a = me.attributes.new(name=name, type="FLOAT", domain="POINT")
    a.data.foreach_set("value", data)


def build_grid(name: str, xs, ys, sample, keep=None, mat=None, col: str = "world", attrs=("wdi_c", "wdi_d", "wdi_s"),
               uv: bool = True):
    """A height-field mesh over the grid xs x ys (both ascending). sample(x, y) -> (z, {attr: 4 floats or 1});
    keep(x, y) -> bool drops cells that touch a dropped point. Unused points are left out."""
    nx, ny = len(xs), len(ys)
    use = [True] * (nx * ny) if keep is None else [keep(x, y) for y in ys for x in xs]
    quads = []
    for j in range(ny - 1):
        r0, r1 = j * nx, (j + 1) * nx
        for i in range(nx - 1):
            a, b, c, d = r0 + i, r0 + i + 1, r1 + i + 1, r1 + i
            if use[a] and use[b] and use[c] and use[d]:
                quads.append((a, b, c, d))
    used = sorted({k for q in quads for k in q})
    remap = {k: n for n, k in enumerate(used)}
    verts, data = [], {a: [] for a in attrs}
    for k in used:
        x, y = xs[k % nx], ys[k // nx]
        z, vals = sample(x, y)
        verts.append((x, y, z))
        for a in attrs:
            v = vals.get(a, (0.0, 0.0, 0.0, 0.0))
            data[a].extend(v if isinstance(v, (list, tuple)) else (v,))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], [tuple(remap[k] for k in q) for q in quads])
    me.update()
    for a in attrs:
        if len(data[a]) == 4 * len(verts):
            set_attr4(me, a, data[a])
        elif len(data[a]) == len(verts):
            set_attr1(me, a, data[a])
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    if uv:
        vb.uv_world(me)
    if mat is not None:
        me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    COL[col].objects.link(ob)
    print(f"GRID {name}: {len(verts)} points, {len(quads)} quads", flush=True)
    return ob


def ground_material(cfg: dict, name: str = "HM_Ground") -> bpy.types.Material:
    """Snow over Poly Haven ground classes, in the style of meshy_village_build.terrain_material.

    cfg['base'] is the ground under everything; cfg['classes'] are laid over it in order, each
    dict(ch=(attribute, channel), role, k, desat, tint, rough, role2=(role, share), nor=role, shape). The snow lies
    where the per-vertex share wdi_s.x says (a remapped noise decides which patches), stands 5 cm proud and keeps
    the look's nodes P_snow_tint, P_snow_shade and P_snow_rough. wdi_s.z wets the bare ground (dark, glossy);
    cfg['glow'] = dict(color, strength, src=index of the class whose texture's green excess glows) lights wdi_s.w."""
    m = bpy.data.materials.new(name)
    b = vb._principled(m)
    g = vb.G(m.node_tree)
    pos = g.position()
    uv = _new(g.n, "ShaderNodeUVMap").outputs["UV"]
    n_break = g.noise(pos, 0.9, 4.0)
    n_fine = g.noise(pos, 7.0, 5.0, 0.6)
    n_large = g.noise(pos, 0.07, 3.0)
    n_patch = g.noise(pos, 0.55, 4.0)
    n_wide = g.noise(pos, 0.18, 3.0)
    chans: dict = {}

    def ch(attr: str, i: int):
        if attr not in chans:
            chans[attr] = attr4(g, attr)
        return chans[attr][i]

    def shaped(mask, amount: float):
        if amount <= 0:
            return mask
        v = g.math("ADD", mask, g.math("MULTIPLY", g.math("SUBTRACT", n_break, 0.5), amount))
        v = g.math("ADD", v, g.math("MULTIPLY", g.math("SUBTRACT", n_wide, 0.5), amount * 1.8))
        return g.smooth(v, 0.30, 0.70)

    def colour(c: dict):
        col = g.tex(uv, c["role"], "diff", RES, zoom=c.get("zoom", 1.0))
        if c.get("role2"):
            r2, share = c["role2"]
            lo = 0.62 - 0.25 * share
            col = g.mix(g.smooth(n_large, lo, lo + 0.06), col, g.tex(uv, r2, "diff", RES))
        if c.get("k", 1.0) != 1.0:
            col = g.scale(col, c["k"])
        if c.get("desat"):
            col = g.desat(col, c["desat"])
        if c.get("tint"):
            col = mul_rgb(g, col, c["tint"])
        return col

    base = cfg["base"]
    col = colour(base)
    rough = g.value(base.get("rough", 0.75))
    nor = g.tex(uv, base["nor"], "nor_gl", RES) if base.get("nor") else None
    glow_src = None
    for i, c in enumerate(cfg["classes"]):
        mask = shaped(ch(*c["ch"]), c.get("shape", 0.55))
        cc = colour(c)
        if cfg.get("glow") and cfg["glow"].get("src") == i:
            glow_src = cc
        col = g.mix(mask, col, cc)
        rough = g.mixf(mask, rough, c.get("rough", 0.75))
        if c.get("nor") and nor is not None:
            nor = g.mix(mask, nor, g.tex(uv, c["nor"], "nor_gl", RES))
    lying, _open, wet, extra = ch("wdi_s", 0), ch("wdi_s", 1), ch("wdi_s", 2), ch("wdi_s", 3)
    col = g.mix(wet, col, g.scale(col, 0.55))
    rough = g.mixf(wet, rough, cfg.get("wet_rough", 0.10))
    if cfg.get("snow", True):
        which = g.smooth(n_wide, 0.38, 0.62)
        snow_tex = g.mix(which, g.tex(uv, "snow", "diff", RES), g.tex(uv, "snow", "diff", RES, zoom=2.7, turn=0.62))
        snow_nor = g.mix(which, g.tex(uv, "snow", "nor_gl", RES), g.tex(uv, "snow", "nor_gl", RES, zoom=2.7, turn=0.62))
        tint = g.mix(n_large, g.rgb((0.60, 0.67, 0.80), "P_snow_shade"), g.rgb((0.86, 0.90, 0.96), "P_snow_tint"))
        snow = scale_by(g, tint, g.math("ADD", g.math("MULTIPLY", g.gray(snow_tex), 0.5), 0.62))
        if cfg.get("field", True):
            snow = scale_by(g, snow, g.math("ADD", g.math("MULTIPLY", g.gray(g.tex(uv, "snow_field", "diff", RES)), 0.55), 0.62))
        # the share of ground under snow is `lying`; a remapped noise decides which patches it covers
        rank = g.math("ADD", g.math("MULTIPLY", g.smooth(n_patch, 0.25, 0.75), 0.92), 0.04)
        rank = g.math("ADD", rank, g.math("MULTIPLY", g.math("SUBTRACT", n_fine, 0.5), 0.12))
        cover = g.smooth(g.math("ADD", g.math("MULTIPLY", g.math("SUBTRACT", lying, rank), 1.0 / 0.12), 0.5), 0.0, 1.0)
        col = g.mix(cover, col, snow)
        rough = g.mixf(cover, rough, g.value(0.55, "P_snow_rough"))
        nor = snow_nor if nor is None else g.mix(cover, nor, snow_nor)
        hgt = g.math("ADD", g.math("MULTIPLY", cover, 0.05), g.math("MULTIPLY", n_fine, 0.006))
    else:
        hgt = g.math("ADD", g.math("MULTIPLY", g.gray(col), 0.04), g.math("MULTIPLY", n_fine, 0.004))
    g.link(col, b.inputs["Base Color"])
    g.link(rough, b.inputs["Roughness"])
    bump = _new(g.n, "ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.8
    bump.inputs["Distance"].default_value = 1.0
    g.link(hgt, bump.inputs["Height"])
    if nor is not None:
        nmap = _new(g.n, "ShaderNodeNormalMap", space="TANGENT", uv_map="UVMap")
        far = g.smooth(_new(g.n, "ShaderNodeCameraData").outputs["View Z Depth"], 14.0, 80.0)
        g.link(g.mixf(far, 1.0, 0.3), nmap.inputs["Strength"])
        g.link(nor, nmap.inputs["Color"])
        g.link(nmap.outputs["Normal"], bump.inputs["Normal"])
    g.link(bump.outputs["Normal"], b.inputs["Normal"])
    gl = cfg.get("glow")
    if gl and glow_src is not None:
        r, gg, bb = sep3(g, glow_src)
        excess = g.math("SUBTRACT", gg, g.math("MULTIPLY", g.math("ADD", r, bb), 0.5))
        mask = g.math("MULTIPLY", g.smooth(excess, -0.01, 0.06), g.math("ADD", 0.5, g.math("MULTIPLY", g.noise(pos, 6.0, 3.0), 0.5)))
        b.inputs["Emission Color"].default_value = (*gl["color"], 1.0)
        g.link(g.math("MULTIPLY", g.math("MULTIPLY", mask, extra), g.value(gl["strength"], "P_moss_glow")), b.inputs["Emission Strength"])
    return m


# ---------------------------------------------------------------- water


def water_material(base=(0.004, 0.010, 0.011), see: float = 0.55, d0: float = 0.08, d1: float = 0.6,
                   ripple=(0.15, 0.05), swell=None, rot=None, rot_color=(0.10, 0.70, 0.55), rot_strength: float = 0.35,
                   specks: bool = False, lift=(0.02, 0.06, 0.05), rot_drift: float | None = None,
                   rot_rough: float | None = None) -> bpy.types.Material:
    """HM_Mere: dark still water whose shallows show their bed by depth (point attribute wdi_depth), the look's
    roughness node P_water_rough, a slow ripple, and an optional mere-rot film: rot = [(x, y, r0, r1), ...] glows
    teal in blotches and filaments (strength node P_rot_strength) where it lies. With `rot_drift` (degrees, the
    caves) the film is an organic slick instead of a round decal: its outline stretched 1.6 x 0.75 along that drift
    and warped by noise (x 0.4 to x 1.6), broken filaments and a few soft blotches in it; `rot_rough` roughens the water
    under the film so a light over it smears into a glint instead of a mirrored disc."""
    m = bpy.data.materials.new("HM_Mere")
    b = vb._principled(m)
    g = vb.G(m.node_tree)
    pos = g.position()
    rough = g.value(0.08, "P_water_rough")
    g.link(rough, b.inputs["Roughness"])
    col = g.rgb(base)
    hgt = g.math("MULTIPLY", g.noise(pos, ripple[0], 3.0), 1.0)
    bump = _new(g.n, "ShaderNodeBump")
    bump.inputs["Strength"].default_value = ripple[1]
    if swell:
        hgt = g.math("ADD", hgt, g.math("MULTIPLY", g.noise(pos, swell[0], 2.0), swell[1] / max(ripple[1], 1e-3)))
    g.link(hgt, bump.inputs["Height"])
    g.link(bump.outputs["Normal"], b.inputs["Normal"])
    if rot and rot_drift is not None:
        mask = halo = None
        # the outline wobbled at two scales (one slow wobble left an oval coin) and stray filaments past it
        warp = g.math("ADD", 0.38, g.math("ADD", g.math("MULTIPLY", g.noise(pos, 0.45, 3.0), 0.8),
                                           g.math("MULTIPLY", g.noise(pos, 1.4, 3.0), 0.45)))
        for cx, cy, r0, r1 in rot:
            d = _new(g.n, "ShaderNodeVectorMath", operation="SUBTRACT")
            g.link(pos, d.inputs[0])
            d.inputs[1].default_value = (cx, cy, 0.0)
            rv = _new(g.n, "ShaderNodeVectorRotate", rotation_type="Z_AXIS")
            g.link(d.outputs["Vector"], rv.inputs["Vector"])
            rv.inputs["Angle"].default_value = -math.radians(rot_drift)
            el = _new(g.n, "ShaderNodeVectorMath", operation="MULTIPLY")
            g.link(rv.outputs["Vector"], el.inputs[0])
            el.inputs[1].default_value = (1.0 / 1.6, 1.0 / 0.75, 0.0)
            ln = _new(g.n, "ShaderNodeVectorMath", operation="LENGTH")
            g.link(el.outputs["Vector"], ln.inputs[0])
            q = g.math("DIVIDE", ln.outputs["Value"], warp)
            f = g.math("SUBTRACT", 1.0, g.smooth(q, r0, r1))
            fh = g.math("SUBTRACT", 1.0, g.smooth(q, r1 * 0.9, r1 * 1.6))
            mask = f if mask is None else g.math("MAXIMUM", mask, f)
            halo = fh if halo is None else g.math("MAXIMUM", halo, fh)
        # threads and a few soft blotches (filaments stretched along the drift ran across the stope still, dense small
        # clumps seen at a slant read as evenly spaced wave bands, and the isolines of a plain noise as neon contour
        # lines): the threads are isolines of a swirled (distorted) noise, their width, brightness and run broken by
        # other noises and thickest by the blotches; the blotches soft patches of a slower swirled noise with brighter hearts
        def swirl(scale, detail, rough_, dist):
            n = _new(g.n, "ShaderNodeTexNoise")
            g.link(pos, n.inputs["Vector"])
            n.inputs["Scale"].default_value = scale
            n.inputs["Detail"].default_value = detail
            n.inputs["Roughness"].default_value = rough_
            n.inputs["Distortion"].default_value = dist
            return n.outputs[0]

        pn = swirl(0.5, 3.0, 0.55, 1.2)
        wid = g.math("ADD", 0.3, g.math("MULTIPLY", g.noise(pos, 1.6, 1.0), 0.7))
        fil = g.math("SUBTRACT", 1.0, g.smooth(g.math("DIVIDE", g.math("ABSOLUTE", g.math("SUBTRACT", swirl(0.75, 2.0, 0.5, 2.5), 0.5)),
                                                         wid), 0.002, 0.07))   # soft-edged (crisp, they read as neon lines)
        fil = g.math("MULTIPLY", fil, g.smooth(g.noise(pos, 1.2, 2.0), 0.40, 0.56))                       # broken into runs
        fil = g.math("MULTIPLY", fil, g.math("ADD", 0.5, g.math("MULTIPLY", g.noise(pos, 3.0, 2.0), 0.5)))   # uneven along them
        fil = g.math("MULTIPLY", fil, g.math("ADD", 0.45, g.math("MULTIPLY", g.smooth(pn, 0.40, 0.60), 0.55)))
        patch = g.math("ADD", g.math("MULTIPLY", g.smooth(pn, 0.53, 0.75), 1.32), g.math("MULTIPLY", g.smooth(pn, 0.71, 0.85), 0.88))
        blot = g.math("ADD", g.math("MAXIMUM", patch, g.math("MULTIPLY", fil, 0.7)), 0.03)
        e = g.math("MULTIPLY", g.math("ADD", g.math("MULTIPLY", mask, blot),
                                      g.math("MULTIPLY", g.math("MULTIPLY", g.math("SUBTRACT", halo, mask), fil), 0.28)),
                   g.value(rot_strength, "P_rot_strength"))
        # the slick's teal tint follows the threads and blotches (one even tint under the rot light read as a disc)
        liftf = g.math("MULTIPLY", mask, g.math("ADD", 0.15, g.math("MULTIPLY", blot, 0.85)))
        if rot_rough is not None:
            g.link(g.mixf(mask, rough, rot_rough), b.inputs["Roughness"])
    elif rot:
        mask = None
        for cx, cy, r0, r1 in rot:
            f = g.math("SUBTRACT", 1.0, g.smooth(xy_dist(g, pos, cx, cy), r0, r1))
            mask = f if mask is None else g.math("MAXIMUM", mask, f)
        blot = g.math("ADD", g.smooth(g.noise(pos, 0.9, 4.0), 0.42, 0.62),
                      g.math("MULTIPLY", g.smooth(g.noise(pos, 3.0, 4.0), 0.48, 0.52), 0.5))
        e = g.math("MULTIPLY", g.math("MULTIPLY", mask, blot), g.value(rot_strength, "P_rot_strength"))
        liftf = mask
    if rot:
        if specks:
            vor = g.voronoi(pos, 9.0)
            sp = g.math("SUBTRACT", 1.0, g.smooth(vor.outputs["Distance"], 0.05, 0.12))
            e = g.math("ADD", e, g.math("MULTIPLY", g.math("MULTIPLY", sp, mask), 0.8))
        col = g.mix(g.math("MULTIPLY", liftf, 0.6), col, lift)
        b.inputs["Emission Color"].default_value = (*rot_color, 1.0)
        g.link(e, b.inputs["Emission Strength"])
    g.link(col, b.inputs["Base Color"])
    nodes, links = m.node_tree.nodes, m.node_tree.links
    out = next(n for n in nodes if n.type == "OUTPUT_MATERIAL")
    depth = attr1(g, "wdi_depth")
    fac = g.math("MULTIPLY", g.math("SUBTRACT", 1.0, g.smooth(depth, d0, d1)), see)
    tr = _new(nodes, "ShaderNodeBsdfTransparent")
    mix = _new(nodes, "ShaderNodeMixShader")
    links.new(fac, mix.inputs[0])
    links.new(b.outputs[0], mix.inputs[1])
    links.new(tr.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], out.inputs["Surface"])
    return m


def ice_material(name: str = "HM_Ice", out_x: tuple[float, float] = (12.0, 16.0), see: float = 0.35) -> bpy.types.Material:
    """The frozen lake (owner, 2026-11-12: the 'sea' beyond the sea door is a frozen lake; the village's mere stays
    open). Out on the lake (x past out_x): wind-packed snow streaked along the wind (west, into the arch) over
    grey-blue lake ice, which shows in scoured patches; cracks at three scales on domain-warped cells (no honeycomb),
    white on the bare ice and dark refrozen leads through the snow, long pressure cracks, frost sparkle; no swell.
    Inside the arch: the frozen pool, frosted grey ice (not a black mirror) with white cracks, wind-blown snow toward
    the arch and a ragged rime along the shore, thin enough there to show the bed (wdi_depth)."""
    m = bpy.data.materials.new(name)
    b = vb._principled(m)
    g = vb.G(m.node_tree)
    pos = g.position()
    x, _y, _z = sep3(g, pos)
    out = g.smooth(x, out_x[0], out_x[1])                      # 0 under the arch, 1 out on the lake
    inside = g.math("SUBTRACT", 1.0, out)

    def vmul(vec, k):
        n = _new(g.n, "ShaderNodeVectorMath", operation="MULTIPLY")
        g.link(vec, n.inputs[0])
        n.inputs[1].default_value = k
        return n.outputs["Vector"]

    def warped(vec, scale, amount):
        wn = _new(g.n, "ShaderNodeTexNoise")
        g.link(vec, wn.inputs["Vector"])
        wn.inputs["Scale"].default_value = scale
        wn.inputs["Detail"].default_value = 2.0
        n = _new(g.n, "ShaderNodeVectorMath", operation="MULTIPLY_ADD")
        g.link(wn.outputs["Color"], n.inputs[0])
        n.inputs[1].default_value = (amount, amount, 0.0)
        g.link(vec, n.inputs[2])
        return n.outputs["Vector"]

    def edge_line(vec, scale, width):
        """1 on the cell edges of a voronoi, `width` metres wide."""
        e = g.voronoi(vec, scale, feature="DISTANCE_TO_EDGE").outputs["Distance"]
        return g.math("SUBTRACT", 1.0, g.smooth(e, width * scale * 0.4, width * scale))

    # snow: streaks along the wind (x), patchy, its brightness streaked too (sastrugi)
    streak = vmul(pos, (0.22, 1.0, 1.0))
    cover = g.smooth(g.noise(warped(streak, 0.05, 6.0), 0.09, 5.0, 0.6), 0.40, 0.52)
    fine = g.noise(vmul(pos, (0.3, 1.0, 1.0)), 1.1, 4.0, 0.6)
    snow = g.math("MULTIPLY", g.math("ADD", g.math("MULTIPLY", cover, 0.82), 0.12), out)
    blown = g.math("MULTIPLY", g.math("MULTIPLY", g.smooth(x, 8.5, 13.0), inside),
                   g.smooth(g.noise(warped(streak, 0.3, 1.0), 0.6, 4.0), 0.48, 0.60))   # snow blown in under the arch
    snow = g.math("MAXIMUM", snow, g.math("MULTIPLY", blown, 0.85))
    # and frost and blown snow in patches over the whole frozen pool (one bare even plane read as a tiled floor)
    snow = g.math("MAXIMUM", snow, g.math("MULTIPLY", g.math("MULTIPLY", inside, g.smooth(g.noise(warped(pos, 0.5, 1.2), 0.5, 4.0, 0.6),
                                                                                           0.52, 0.66)), 0.55))
    # cracks out on the lake: bold warped cells, two sets of long branching pressure cracks, and mid-scale cells only
    # in patches and of varying strength (a net of like cells read as tiles from above)
    wpos = warped(pos, 0.06, 7.0)
    big = g.math("MULTIPLY", edge_line(wpos, 0.085, 0.11), g.smooth(g.noise(pos, 0.03, 2.0), 0.36, 0.58))
    far = g.smooth(x, out_x[1] - 0.5, out_x[1] + 3.5)
    mid = edge_line(warped(pos, 0.2, 2.5), 0.33, 0.045)
    mid = g.math("MULTIPLY", mid, g.math("MULTIPLY", g.smooth(g.noise(pos, 0.07, 2.0), 0.42, 0.62),
                                          g.math("ADD", 0.35, g.math("MULTIPLY", g.noise(pos, 0.5, 2.0), 0.8))))
    pn = g.noise(vmul(pos, (0.35, 1.0, 1.0)), 0.035, 2.0)
    press = g.math("SUBTRACT", 1.0, g.smooth(g.math("ABSOLUTE", g.math("SUBTRACT", pn, 0.5)), 0.0015, 0.004))
    pn2 = g.noise(vmul(warped(pos, 0.05, 5.0), (1.0, 0.45, 1.0)), 0.045, 2.0)
    press2 = g.math("SUBTRACT", 1.0, g.smooth(g.math("ABSOLUTE", g.math("SUBTRACT", pn2, 0.5)), 0.001, 0.003))
    crack = g.math("MULTIPLY", g.math("MAXIMUM", g.math("MAXIMUM", big, g.math("MAXIMUM", press, g.math("MULTIPLY", press2, 0.8))),
                                      g.math("MULTIPLY", mid, 0.8)), far)
    # under the arch, seen close, no cell net (an unwarped crazing read as crazy paving, strongly warped cracks as pale
    # rivers): a few long hairline cracks (cell edges warped lightly so their width holds, broken so only some edges
    # show) and a faint crazing in a few patches
    hair = g.math("MULTIPLY", edge_line(warped(pos, 0.15, 0.7), 0.12, 0.006), g.smooth(g.noise(pos, 0.18, 2.0), 0.44, 0.56))
    hair2 = g.math("MULTIPLY", edge_line(warped(pos, 0.4, 0.45), 0.32, 0.004), g.smooth(g.noise(pos, 0.27, 2.0), 0.55, 0.64))
    craze = g.math("MULTIPLY", edge_line(warped(pos, 1.1, 0.25), 1.2, 0.004), g.smooth(g.noise(pos, 0.3, 2.0), 0.62, 0.70))
    crack_in = g.math("MAXIMUM", g.math("MULTIPLY", hair, 0.6), g.math("MAXIMUM", g.math("MULTIPLY", hair2, 0.45), g.math("MULTIPLY", craze, 0.3)))
    crack = g.math("MAXIMUM", crack, g.math("MULTIPLY", crack_in, inside))
    depth = attr1(g, "wdi_depth")
    rime = g.math("SUBTRACT", 1.0, g.smooth(g.math("ADD", depth, g.math("MULTIPLY", g.math("SUBTRACT", g.noise(pos, 3.0, 3.0), 0.5), 0.12)),
                                         0.0, 0.14))
    rime = g.math("MULTIPLY", rime, inside)
    # the bare ice: grey-blue, clouded with frozen bubbles; the pool inside frosted and paler
    cloud = g.smooth(g.noise(pos, 0.7, 4.0), 0.45, 0.70)
    ice = g.mix(cloud, (0.045, 0.068, 0.090), (0.13, 0.16, 0.19))
    pool = g.mix(g.smooth(g.noise(pos, 1.2, 4.0), 0.40, 0.65), (0.10, 0.12, 0.14), (0.24, 0.27, 0.30))
    ice = g.mix(inside, ice, pool)
    ice = g.mix(g.math("MULTIPLY", crack, 0.85), ice, (0.52, 0.57, 0.62))
    ice = g.mix(rime, ice, (0.58, 0.62, 0.68))
    snowc = g.mix(g.smooth(fine, 0.35, 0.70), (0.66, 0.71, 0.80), (0.86, 0.89, 0.94))
    col = g.mix(snow, ice, snowc)
    lead = g.math("MULTIPLY", g.math("MULTIPLY", g.math("MAXIMUM", big, press), snow), 0.9)   # refrozen leads through the snow
    col = g.mix(lead, col, (0.07, 0.09, 0.12))
    g.link(col, b.inputs["Base Color"])
    rough = g.mixf(out, 0.28, 0.14)   # the bare pool ice a little glossy: the opening's light lies softly in it
    rough = g.mixf(cloud, rough, g.mixf(out, 0.46, 0.3))
    rough = g.mixf(rime, rough, 0.7)
    g.link(g.mixf(snow, rough, 0.72), b.inputs["Roughness"])
    # frost sparkle: a few tiny bright crystals in the snow
    sv = g.voronoi(pos, 38.0)
    sr, _sg, _sb = sep3(g, sv.outputs["Color"])
    spark = g.math("MULTIPLY", g.math("SUBTRACT", 1.0, g.smooth(sv.outputs["Distance"], 0.08, 0.2)), g.smooth(sr, 0.975, 0.985))
    b.inputs["Emission Color"].default_value = (0.80, 0.88, 1.0, 1.0)
    g.link(g.math("MULTIPLY", g.math("MULTIPLY", spark, snow), 1.2), b.inputs["Emission Strength"])
    hgt = g.math("ADD", g.math("MULTIPLY", snow, g.math("ADD", g.math("MULTIPLY", fine, 0.5), 0.5)),
                 g.math("MULTIPLY", crack, -0.25))
    bump = _new(g.n, "ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.35
    bump.inputs["Distance"].default_value = 0.05
    g.link(hgt, bump.inputs["Height"])
    g.link(bump.outputs["Normal"], b.inputs["Normal"])
    nodes, links = m.node_tree.nodes, m.node_tree.links
    outn = next(n for n in nodes if n.type == "OUTPUT_MATERIAL")
    fac = g.math("MULTIPLY", g.math("MULTIPLY", g.math("SUBTRACT", 1.0, g.smooth(depth, 0.03, 0.25)), see),
                 g.math("MULTIPLY", g.math("MULTIPLY", inside, g.math("SUBTRACT", 1.0, rime)), g.math("SUBTRACT", 1.0, snow)))
    tr = _new(nodes, "ShaderNodeBsdfTransparent")
    mix = _new(nodes, "ShaderNodeMixShader")
    links.new(fac, mix.inputs[0])
    links.new(b.outputs[0], mix.inputs[1])
    links.new(tr.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], outn.inputs["Surface"])
    return m


def build_water(name: str, mat, z: float, regions, ground, keep=None):
    """Still water at height z over regions [(x0, y0, x1, y1, step)], only where the ground lies below it;
    wdi_depth = z - ground, clamped to 0..2. Returns the object (one per call; HM_Mere for the main body)."""
    verts, faces, depth = [], [], []
    for x0, y0, x1, y1, step in regions:
        xs = grid_axis([(x0, x1, step)])
        ys = grid_axis([(y0, y1, step)])
        nx = len(xs)
        b = len(verts)
        gz = [[ground(x, y) for x in xs] for y in ys]
        for j, y in enumerate(ys):
            for i, x in enumerate(xs):
                verts.append((x, y, z))
                depth.append(clamp(z - gz[j][i], 0.0, 2.0))
        for j in range(len(ys) - 1):
            for i in range(nx - 1):
                lo = min(gz[j][i], gz[j][i + 1], gz[j + 1][i], gz[j + 1][i + 1])
                if lo >= z + 0.02:
                    continue
                cx, cy = (xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2
                if keep is not None and not keep(cx, cy):
                    continue
                a = b + j * nx + i
                faces.append((a, a + 1, a + 1 + nx, a + nx))
    used = sorted({k for f in faces for k in f})
    remap = {k: n for n, k in enumerate(used)}
    me = bpy.data.meshes.new(name)
    me.from_pydata([verts[k] for k in used], [], [tuple(remap[k] for k in f) for f in faces])
    me.update()
    set_attr1(me, "wdi_depth", [depth[k] for k in used])
    vb.uv_world(me)
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    COL["world"].objects.link(ob)
    print(f"WATER {name}: z {z:.2f}, {len(me.polygons)} quads", flush=True)
    return ob


# ---------------------------------------------------------------- procedural pieces shared by the woods


def frost_mat(name: str, color, rough: float = 0.5, frost: float = 0.3, frost_color=(0.80, 0.84, 0.90)):
    """A flat colour with frost (or snow) on its up-facing faces."""
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    b = vb._principled(m)
    g = vb.G(m.node_tree)
    geo = _new(g.n, "ShaderNodeNewGeometry")
    _nx, _ny, nz = sep3(g, geo.outputs["Normal"])
    amt = g.math("MULTIPLY", g.smooth(nz, 0.45, 0.9), frost)
    g.link(g.mix(amt, tuple(color), frost_color), b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough
    _MATS[name] = m
    return m


def woods_mats() -> dict:
    """The materials of the woods' small woodwork and dressing (built once a scene)."""
    return dict(
        bark=role_mat("W_bark", "pine_bark", k=0.8, desat=0.15, snow=0.55),
        moss=role_mat("W_bark_moss", "moss", k=0.55, desat=0.25, snow=0.35),
        inner=role_mat("W_bark_inside", "pine_bark", k=0.12, rough=0.9),
        litter=role_mat("W_litter_patch", "pine_needles", k=0.6, desat=0.2),
        timber=role_mat("W_timber", "timber_rough", k=0.9, desat=0.1, snow=0.55),
        split=role_mat("W_timber_split", "timber_rough", k=1.35, tint=(1.0, 0.92, 0.80), snow=0.4),
        endgrain=role_mat("W_endgrain", "timber_rough", k=1.6, tint=(0.55, 0.47, 0.36), rough=0.8, snow=0.3),
        stake=role_mat("W_stake", "timber_rough", k=0.75, desat=0.1, snow=0.4),
        cord=flat_mat("W_cord", (0.30, 0.26, 0.20), 0.9),
        iron=flat_mat("W_iron", (0.05, 0.05, 0.055), 0.45, metal=0.8),
        ash=flat_mat("W_ash", (0.45, 0.36, 0.25), 0.6),
        brass=flat_mat("W_brass", (0.55, 0.42, 0.18), 0.35, metal=1.0),
        chips=flat_mat("W_chips", (0.62, 0.52, 0.38), 0.7),
        check=flat_mat("W_check", (0.03, 0.025, 0.02), 0.9),
        hazel=flat_mat("W_hazel", (0.30, 0.22, 0.15), 0.8),
        fur=flat_mat("W_fur", (0.22, 0.19, 0.16), 1.0),
        amber=flat_mat("W_amber", (0.55, 0.22, 0.03), 0.15, transmission=0.3),
        blaze=flat_mat("W_blaze", (0.55, 0.45, 0.30), 0.6),
        bone=flat_mat("W_bone", (0.62, 0.58, 0.50), 0.6),
    )


def chips(mp, x: float, y: float, n: int, r: float, mat, name: str = "WP_chips") -> None:
    """Pale wood chips lying on the snow within r metres."""
    mb = MB()
    for _ in range(n):
        a, d = RNG.uniform(0, 2 * math.pi), r * math.sqrt(RNG.random())
        px, py = x + d * math.cos(a), y + d * math.sin(a)
        mb.box(RNG.uniform(0.04, 0.08), RNG.uniform(0.02, 0.04), 0.008,
               M4(px, py, mp.height(px, py) + 0.012, rz=RNG.uniform(0, 180), rx=RNG.uniform(-8, 8)), mat)
    mb.build(name, col="models")


def log_mesh(mb: MB, M: Matrix, length: float, r: float, side_mat, end_mat, n: int = 12) -> None:
    """A cut log along local x, centred on M's origin: bark sides and two sawn end discs."""
    mb.cyl(r, r * 0.97, length, n, M @ M4(ry=90.0), side_mat, caps=False, z0=-length / 2, jitter=0.03)
    mb.disc(r * 0.97, n, M @ M4(x=length / 2, ry=90.0), end_mat)
    mb.disc(r, n, M @ M4(x=-length / 2, ry=-90.0), end_mat)


def log_pile(mp, x: float, y: float, axis: float, wm: dict, name: str = "WP_log_pile") -> None:
    """3 to 5 cut pine logs stacked 2 + 1 or 3 + 2 along `axis` (degrees)."""
    z = mp.height(x, y) - 0.03
    layers = [(-0.12, 0.12), (0.0,)] if RNG.random() < 0.5 else [(-0.24, 0.0, 0.24), (-0.12, 0.12)]
    a = math.radians(axis)
    mb = MB()
    zz = z
    for li, row in enumerate(layers):
        top = 0.0
        for off in row:
            r = RNG.uniform(0.09, 0.13)
            ln = RNG.uniform(1.2, 1.6)
            px, py = x - off * math.sin(a), y + off * math.cos(a)
            log_mesh(mb, M4(px, py, zz + r, rz=axis + RNG.uniform(-3, 3)), ln, r, wm["bark"], wm["split"])
            top = max(top, 2 * r)
        zz += top * 0.8
    mb.build(name, col="models", smooth=True)


def toadstools(mp, x: float, y: float, rot: float, n: int | None = None, ring=(0.45, 0.65), pad: float = 0.7,
               cap=(0.18, 0.07, 0.04), stem=(0.75, 0.72, 0.66), frost: float = 0.3, kicked: bool = True,
               cap_size=(0.03, 0.08), stem_h=(0.04, 0.09), z: float | None = None, name: str = "WP_toadstools") -> None:
    """A broken ring of toadstools on a snow-free moss pad, one kicked over."""
    if getattr(mp, "forest", True):   # out in the woods: frost-dulled, rimed in patches
        moss = role_mat("W_moss_pad", "moss", k=0.4, desat=0.45, rough=0.85, snow=0.3)
    else:                             # in the mine: no snow
        moss = role_mat("W_moss_pad_cave", "moss", k=0.6, desat=0.2)
    capm = frost_mat(f"W_cap_{cap[0]:.2f}_{cap[1]:.2f}_{frost:.1f}", cap, 0.5, frost)
    stemm = flat_mat(f"W_stem_{stem[0]:.2f}", stem, 0.6)
    z0 = mp.height(x, y) if z is None else z
    mb = MB()
    if pad:
        # a ragged patch hugging the ground, its rim sunk into the snow (the clean disc 2 cm proud read as a tray on
        # the snow); the 18 draws the disc took are still taken, so the seeded sequence after it stays as it was
        [RNG.uniform(-0.12, 0.12) for _ in range(18)]
        nseg, rings = 30, 3
        edge = [pad / 2 * (0.8 + 0.55 * fbm(x + 0.9 * math.cos(2 * math.pi * i / nseg), y + 0.9 * math.sin(2 * math.pi * i / nseg),
                                              2.2, 3)) for i in range(nseg)]
        verts = [(x, y, z0 + 0.008)]
        for j in range(1, rings + 1):
            for i in range(nseg):
                a = 2 * math.pi * i / nseg
                rr = max(edge[i], 0.08) * j / rings
                px, py = x + rr * math.cos(a), y + rr * math.sin(a)
                verts.append((px, py, mp.height(px, py) + (0.008 if j < rings else -0.006)))
        faces = [(0, 1 + i, 1 + (i + 1) % nseg) for i in range(nseg)]
        for j in range(rings - 1):
            r0, r1 = 1 + j * nseg, 1 + (j + 1) * nseg
            faces += [(r0 + i, r1 + i, r1 + (i + 1) % nseg, r0 + (i + 1) % nseg) for i in range(nseg)]
        mb.add(verts, faces, moss)
    n = n or RNG.randint(5, 9)
    rr = RNG.uniform(*ring) / 2
    for i in range(n):
        a = math.radians(rot + 360.0 * i / n + RNG.uniform(-15, 15))
        px, py = x + rr * math.cos(a) * RNG.uniform(0.7, 1.1), y + rr * math.sin(a) * RNG.uniform(0.7, 1.1)
        h, cr = RNG.uniform(*stem_h), RNG.uniform(*cap_size) / 2
        sr = RNG.uniform(0.004, 0.0075)
        if kicked and i == 0:  # kicked over: lying on its side, the stem snapped
            M = M4(px, py, z0 + 0.03 + cr * 0.4, rz=RNG.uniform(0, 360), ry=85.0)
            mb.cyl(sr, sr * 0.8, h * 0.6, 6, M, stemm)
            mb.sphere(cr, cr, cr * 0.45, 10, 5, M @ M4(z=h * 0.6), capm)
            mb.cyl(sr, sr * 0.7, h * 0.3, 6, M4(px + 0.05, py, z0 + 0.02), stemm)
            continue
        M = M4(px, py, z0 + 0.02, rz=RNG.uniform(0, 360), rx=RNG.uniform(-8, 8))
        mb.cyl(sr, sr * 0.8, h, 6, M, stemm)
        mb.sphere(cr, cr, cr * 0.45, 12, 6, M @ M4(z=h), capm)
    mb.build(name, col="models", smooth=True)


def snare(mp, x: float, y: float, along: float, wm: dict) -> None:
    """A brass-wire snare on a hazel peg at the side of a run, the noose square across it, a tuft of fur caught."""
    a = math.radians(along)
    side = (-math.sin(a), math.cos(a))
    z = mp.height(x, y)
    px, py = x + 0.14 * side[0], y + 0.14 * side[1]
    mb = MB()
    mb.cyl(0.01, 0.008, 0.32, 6, M4(px, py, z - 0.10, rx=RNG.uniform(-6, 6)), wm["hazel"])
    top = Vector((px, py, z + 0.21))
    noose = Vector((x, y, z + 0.17))
    mb.tube([top, (top + noose) / 2 + Vector((0.0, 0.0, 0.02)), noose + Vector((0.0, 0.0, 0.07))], 0.0012, 4, wm["brass"])
    mb.torus(0.07, 0.0015, 18, 4, M4(x, y, z + 0.17, rz=along, ry=90.0), wm["brass"])
    mb.sphere(0.025, 0.022, 0.02, 8, 5, M4(x + 0.05 * side[0], y + 0.05 * side[1], z + 0.24), wm["fur"], lumpy=0.25)
    mb.build("WP_snare", col="models")


def resin_drips(stump, facing_deg: float, wm: dict) -> None:
    """A blaze stripped to pale wood on a stump's side and amber resin drips running from it."""
    lo, hi = wbox(stump)
    cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    a = math.radians(facing_deg)
    r = 0.5 * max(hi.x - lo.x, hi.y - lo.y) * 0.62
    px, py = cx + r * math.cos(a), cy + r * math.sin(a)
    zt = lo.z + 0.55 * (hi.z - lo.z)
    mb = MB()
    mb.box(0.25, 0.012, 0.15, M4(px, py, zt, rz=facing_deg - 90.0), wm["blaze"])
    for _ in range(RNG.randint(6, 10)):
        u = RNG.uniform(-0.1, 0.1)
        q = RNG.uniform(0.015, 0.03)
        mb.sphere(q * 0.5, q * 0.5, q * 1.4, 6, 4,
                  M4(px - u * math.sin(a) + 0.01 * math.cos(a), py + u * math.cos(a) + 0.01 * math.sin(a),
                     zt - 0.08 - RNG.uniform(0.05, 0.22)), wm["amber"])
    mb.build("WP_resin", col="models", smooth=True)


def bucksaw(x: float, y: float, z: float, facing: str, wm: dict, length: float = 0.76) -> None:
    """An H-frame bucksaw hung flat against a post."""
    M = M4(x, y, z, rz=face_deg(facing))
    wood = flat_mat("W_saw_wood", (0.40, 0.30, 0.20), 0.7)
    blade = flat_mat("W_saw_blade", (0.16, 0.16, 0.17), 0.4, metal=0.8)
    h = length / 2 - 0.02
    mb = MB()
    for sx in (-h, h):
        mb.box(0.03, 0.03, 0.62, M @ M4(sx), wood)
    mb.box(2 * h, 0.03, 0.03, M, wood)
    mb.box(length, 0.002, 0.03, M @ M4(0.0, 0.0, -0.29), blade)
    for dy in (-0.004, 0.004):
        mb.tube([M @ Vector((-h, dy, 0.29)), M @ Vector((0.0, dy, 0.27)), M @ Vector((h, dy, 0.29))], 0.003, 4, wm["cord"])
    mb.build("WP_bucksaw", col="models")


def fern_group(mp, x: float, y: float, rot: float, size: float, grade: str | None, n: int = 3, spread: float = 0.35,
               branches: bool = False, tufts: int = 0, col: str = "forest") -> None:
    """Clumps of fern_02 (graded), optionally with a bramble of dry branches and dry grass tufts."""
    nf = ph_count("fern_02")
    for i, p in enumerate(RNG.sample(range(1, nf + 1), min(n, nf))):
        a = math.radians(rot + 360.0 * i / n)
        ph_place(mp, "fern_02", x + spread * math.cos(a), y + spread * math.sin(a), rot=rot + 97 * i,
                 size=size * RNG.uniform(0.8, 1.05), piece=p, grade=grade, col=col, sink=0.02)
    if branches:
        ph_place(mp, "dry_branches_medium_01", x + RNG.uniform(-0.3, 0.3), y + RNG.uniform(-0.3, 0.3),
                 piece=RNG.randint(1, ph_count("dry_branches_medium_01")), lod=0.25, size=RNG.uniform(0.8, 1.2),
                 sink=0.03, tilt=RNG.uniform(0, 15))
    for _ in range(tufts):
        ph_place(mp, "grass_medium_02", x + RNG.uniform(-0.6, 0.6), y + RNG.uniform(-0.6, 0.6),
                 piece=RNG.randint(1, ph_count("grass_medium_02")), grade="dry", col="forest", sink=0.01,
                 size=RNG.uniform(0.25, 0.45))


def place_trees(mp, plan) -> None:
    for t in plan:
        o = vb.place(mp, t["name"], t["x"], t["y"], rot=t.get("rot", RNG.uniform(0.0, 360.0)), scale=t["scale"],
                     lod=t["lod"], col="forest", sink=t.get("sink", 0.2), lamps=False)
        o.visible_shadow = t["shadow"]
        TREES.append(o)


def cut_dead_tree_lantern() -> None:
    """dead_tree carries a painted oil lantern the data never lights: cut it from the master before any LOD copy."""
    # the lantern hangs at x 1.0..1.4, y -0.55..-0.2, z 1.9..2.62 (bail included); the branch's underside above
    # x < 1.05 dips to z 2.60, so the box stops at 2.58 there (252 faces of the GLB's triangles)
    n = cut_faces(vb.source("dead_tree"), lambda x, y, z: 0.95 <= x <= 1.6 and -0.65 <= y <= 0.45 and 1.70 <= z <= 2.62
                  and not (x < 1.05 and z > 2.58))
    print(f"CUT dead_tree lantern: {n} faces", flush=True)


def cut_oak_noose() -> None:
    """No rope on the Hanging Oak (owner, 2026-11-12): hanging_oak has a noose baked into its east limb (catalog frame).
    The strand hangs at x 2.25..2.50, y -0.56..-0.33 from the limb's underside (z 3.5) to a frayed end at z 1.2; its
    faces go. The three coils round the limb at x 2.18..2.62 are fused into the limb's surface (cutting them cuts
    the limb in two), so they are pressed onto the limb (a round section from y -0.21, z 3.93, r 0.42 at x 2.10 to
    y -0.05, z 4.05, r 0.47 at x 2.70) and take their texture from the bark 0.5 m west along it."""
    from mathutils import kdtree
    o = vb.source("hanging_oak")
    bm = bmesh.new()
    bm.from_mesh(o.data)
    uvl = bm.loops.layers.uv.active
    strand, coil, keep = [], [], []
    for f in bm.faces:
        c = f.calc_center_median()
        if c.z < 3.42 and math.hypot(c.x - 2.37, c.y + 0.43) < 0.2:
            strand.append(f)
        elif 2.16 <= c.x <= 2.64 and c.z >= 3.1 and math.hypot(c.y + 0.33, c.z - 3.80) < 0.75:
            coil.append(f)
        elif c.z > 2.8:
            keep.append(f)
    kd = kdtree.KDTree(len(keep))
    for i, f in enumerate(keep):
        kd.insert(f.calc_center_median(), i)
    kd.balance()
    for f in coil:
        _co, i, _d = kd.find(f.calc_center_median() + Vector((-0.5, 0.0, 0.0)))
        uvs = [lp[uvl].uv.copy() for lp in keep[i].loops]
        for k, lp in enumerate(f.loops):
            lp[uvl].uv = uvs[min(k, len(uvs) - 1)]
    for v in {v for f in coil for v in f.verts}:   # the coils' rings pressed flat onto the limb
        t = clamp((v.co.x - 2.10) / 0.60)
        cy, cz, r = lerp(-0.21, -0.05, t), lerp(3.93, 4.05, t), lerp(0.42, 0.47, t)
        dy, dz = v.co.y - cy, v.co.z - cz
        d = math.hypot(dy, dz)
        if d > r:
            k = 1.0 + (r / d - 1.0) * sstep(2.16, 2.28, v.co.x) * (1.0 - sstep(2.52, 2.64, v.co.x))
            v.co.y, v.co.z = cy + dy * k, cz + dz * k
    bmesh.ops.delete(bm, geom=strand, context="FACES")
    bm.to_mesh(o.data)
    bm.free()
    o.data.update()
    print(f"CUT hanging_oak noose: {len(strand)} strand faces, {len(coil)} coil faces pressed onto the limb as bark",
          flush=True)


def tree_height(name: str, scale: float) -> float:
    return vb.CAT[name]["size_m"] * scale


def pick(mix):
    m = RNG.choices(mix, [e[1] for e in mix])[0]
    return m[0], RNG.uniform(m[2], m[3])


# ---------------------------------------------------------------- Gallows Wood (scene 'forest')


FO_OFFSET = {"l": 0.0, "p": -0.06, "g": 0.02, "u": 0.05, "m": 0.15, "T": 0.25}
FO_PORTALS = {(20, 29): "p", (0, 16): "p", (39, 20): "l", (6, 0): "m"}        # portal tiles (T in the material)
FO_TREADS = (([(20, 21), (20, 28)], 0.45, 0.5), ([(17, 23), (19, 23)], 0.45, 0.45), ([(21, 23), (23, 23)], 0.45, 0.45),
             ([(6, 8), (7, 9), (7, 10), (6, 11)], 0.2, 0.55), ([(6, 13), (4, 13), (4, 16)], 0.2, 0.55))
FO_MOON = (((0.75, -14.25), 6.0), ((-20.25, 22.0), 3.5), ((-29.25, -2.25), 1.5))  # moon windows: centre, radius
FO_MIX = {  # zone -> (model, weight, scale lo, scale hi)
    "back": (("pine_tall", 0.85, 1.0, 1.3), ("dead_tree", 0.10, 1.1, 1.6), ("pine_short", 0.05, 0.9, 1.2)),
    "front": (("pine_tall", 0.35, 0.7, 0.9), ("pine_short", 0.30, 0.8, 1.1), ("dead_tree", 0.35, 1.0, 1.4)),
    "interior": (("pine_tall", 0.70, 0.85, 1.15), ("dead_tree", 0.16, 1.0, 1.5), ("pine_short", 0.14, 0.85, 1.2)),
}
FO_FILL = {"back": 0.62, "front": 0.45, "interior": 0.55}
FO_KEEP_RECTS = ((18.6, 28.3, 22.4, 30.5), (-0.6, 14.4, 1.0, 17.6), (38.3, 19.2, 43.0, 20.8), (3.2, -40.0, 8.8, 0.6),
                 (14.9, 28.3, 17.1, 29.6), (14.6, 21.0, 17.4, 25.0))
FO_HOLLOW = (((12, 7), 4.2, "S"), ((30, 7), 3.6, "SW"), ((23, 19), 4.6, "NW"))
FO_TOADSTOOLS = ((13, 14, 0.0), (37.35, 14, 90.0), (7.35, 10.2, 200.0), (22, 5, 300.0), (18, 21, 45.0))
FO_DRIFTS = ((19, 19, 1.2), (5, 2, 1.2), (26, 9.35, 1.2), (14, 24, 1.2), (33, 27, 1.2))
FO_ADIT = (-20.05, 21.3, 28.1)   # Abandoned_Tin_Mine's tunnel (world): centre x, opening plane y, the recess's back y
# the stills' eyes (world) the seeded tree plan and scatter keep clear: those of the reviewed layout (build_forest)
FO_PLAN_EYES = ((-1.35, -19.5), (0.0, 0.3), (-7.5, 1.95), (-19.8, 12.45), (-24.15, -2.25), (-23.25, -44.25))
FO_GROUND = dict(
    base=dict(role="pine_needles", k=0.8, desat=0.25, rough=0.8, nor="pine_needles"),
    classes=[
        dict(ch=("wdi_c", 0), role="pine_needles", role2=("forest_floor", 0.3), k=0.5, desat=0.3, rough=0.85),  # T
        dict(ch=("wdi_c", 2), role="grass_dry", k=0.8, desat=0.3, rough=0.8),                                   # g
        dict(ch=("wdi_c", 3), role="forest_floor", k=0.75, desat=0.3, rough=0.85),                              # u
        dict(ch=("wdi_d", 0), role="moss_rock", k=0.7, desat=0.35, rough=0.75),                                 # m
        # black freezing mud, matt (at 0.3 it mirrored the lantern and read as running water) and brown-black (the
        # cool-lit desaturated map leaned plum under the lantern)
        dict(ch=("wdi_c", 1), role="mud_track", role2=("snow_trodden", 0.25), k=0.42, desat=0.5, rough=0.7,
             tint=(1.0, 0.94, 0.80), nor="mud_track"),                                                          # p
        dict(ch=("wdi_d", 1), role="snow_trodden", k=0.9, desat=0.2, rough=0.6, shape=0.2),                     # runs, rings
        dict(ch=("wdi_d", 2), role="pine_needles", k=0.75, desat=0.25, rough=0.85, shape=0.15),                 # drifts
    ],
    snow=True, field=True, wet_rough=0.62)


def adit_floor(h: float, x: float, y: float, adit, z: float | None) -> float:
    """Keep a hill out of a Meshy adit's open tunnel: under it (adit = (centre x, opening y, back y), world metres) the
    ground is held at or below z, the ground at the mouth the model stands on, so it lies under the model's own tunnel
    floor. Full over 2 x 1.4 m, fading out by 2.2 m and 0.4 m past the back, inside the model's rock."""
    if z is None:
        return h
    ax, y0, y1 = adit
    m = (1.0 - sstep(1.4, 2.2, abs(x - ax))) * sstep(y0 - 0.3, y0 + 0.3, y) * (1.0 - sstep(y1, y1 + 0.4, y))
    return lerp(h, min(h, z), m) if m > 0.0 else h


class Gallows:
    """Gallows Wood's ground from the map, the planned trunks and the derived marks: height and per-vertex classes."""

    def __init__(self, mp: WildMap, trunks: Hash):
        self.mp, self.trunks = mp, trunks
        self.adit_z = None
        self.L = [[mp.g(x, y) for x in range(mp.w)] for y in range(mp.h)]
        for (tx, ty), c in FO_PORTALS.items():
            self.L[ty][tx] = c
        segs = []
        self.pc, self.gc = Hash(2.0), Hash(2.0)  # trail and clearing tile centres
        for ty in range(mp.h):
            for tx in range(mp.w):
                c = self.L[ty][tx]
                if c == "g":
                    self.gc.add(*T(tx, ty))
                if c != "p":
                    continue
                ax, ay = T(tx, ty)
                self.pc.add(ax, ay)
                segs.append((ax, ay, ax, ay))
                for dx, dy in ((1, 0), (0, 1)):
                    if tx + dx < mp.w and ty + dy < mp.h and self.L[ty + dy][tx + dx] == "p":
                        bx, by = T(tx + dx, ty + dy)
                        segs.append((ax, ay, bx, by))
        self.trail_segs = [s for s in segs if s[0] != s[2] or s[1] != s[3]]
        self.trail = SegHash(segs, 4.0, 2.0)
        treads = []
        for pts, lying, hw in FO_TREADS:
            w = [T(*p) for p in pts]
            treads += [(a[0], a[1], b[0], b[1], (lying, hw)) for a, b in zip(w, w[1:])]
        # the gate road, and the village lane (snowed over at 0.65: its black mud read as a ditch from the overview)
        treads += [(0.75, -22.4, 0.75, -29.25, (0.35, 1.5)), (-90.0, -29.25, 90.0, -29.25, (0.65, 0.75))]
        self.tread_segs = treads
        self.tread = SegHash(treads, 4.0, 2.5)
        runs = []
        for p in mp.d.get("paths") or []:
            if p.get("kind") != "wolfLoop":
                continue
            w = [T(q["x"], q["y"]) for q in p["points"]]
            runs += [(a[0], a[1], b[0], b[1], (0.55, 0.25)) for a, b in zip(w, w[1:] + w[:1])]
        self.run_segs = list(runs)
        for sid, way in (("fo.snare", "NS"), ("fo.snare_1", "EW"), ("fo.snare_2", "EW")):
            if sid in mp.byid:
                x, y = mp.xy(sid)
                dx, dy = (0.0, 1.5) if way == "NS" else (1.5, 0.0)
                runs.append((x - dx, y - dy, x + dx, y + dy, (0.5, 0.15)))
        self.run = SegHash(runs, 4.0, 1.0)
        self.rings = [(*T(24, 23), 1.2, 0.35), (*T(17.3, 23), 1.4, 0.35), (*T(19, 10.05), 1.4, 0.3)]
        self.drift = Hash(3.0)
        for tx, ty, r in FO_DRIFTS:
            self.drift.add(*T(tx, ty), r)
        for (tx, ty), _h, facing in FO_HOLLOW:
            x, y = T(tx, ty)
            a = math.radians(vb.ANG[facing])
            self.drift.add(x + 1.2 * math.cos(a), y + 1.2 * math.sin(a), 1.0)
        for tx, ty, _r in FO_TOADSTOOLS:
            self.drift.add(*T(tx, ty), 0.45)
        self.adit_z = self.height(*T(6, 0.6))   # the ground the mine stands on (gallows_models takes the same point)

    def letter(self, tx: int, ty: int) -> str:
        if 0 <= tx < self.mp.w and 0 <= ty < self.mp.h:
            return self.L[ty][tx]
        return "T"

    def _bil(self, x: float, y: float):
        fx, fy = TF(x, y)
        x0, y0 = math.floor(fx), math.floor(fy)
        ax, ay = fx - x0, fy - y0
        h, wts = 0.0, {}
        for ix, iy, w in ((x0, y0, (1 - ax) * (1 - ay)), (x0 + 1, y0, ax * (1 - ay)), (x0, y0 + 1, (1 - ax) * ay),
                          (x0 + 1, y0 + 1, ax * ay)):
            if w <= 0.0:
                continue
            c = self.letter(ix, iy)
            h += w * FO_OFFSET.get(c, 0.0)
            wts[c] = wts.get(c, 0.0) + w
        return h, wts, fx, fy

    @staticmethod
    def outside(x: float, y: float) -> float:
        """Wooded hills north (with the rock step the mine is cut into), west and east; level south over the village
        fields, then a wooded ridge 100 m and more out (the horizon of the stills looking south through the gate)."""
        terms = []
        dn, dw, de, ds = y - 22.5, -30.0 - x, x - 30.0, -75.0 - y
        if dn > 0:
            t = min(30.0, 0.04 * dn + 0.0011 * dn * dn) + 3.0 * fbm(x, y, 0.015, 4) * min(1.0, dn / 30.0)
            # the rock step behind the mine; up the hill its east and west ends spread wide (sharp, they ran on up the
            # hill as two straight lines, one in the moon's shadow, in the overview)
            k = 24.0 * sstep(32.0, 70.0, y)
            t += 3.5 * sstep(25.0, 30.0, y) * (1.0 - sstep(10.0 + k, 16.0 + 2.0 * k, abs(x + 20.25)))
            terms.append(t)
        if dw > 0:
            terms.append(min(8.0, 0.025 * dw + 0.0005 * dw * dw) + 1.5 * fbm(x, y, 0.015, 4) * min(1.0, dw / 30.0))
        if de > 0:
            terms.append(min(16.0, 0.03 * de + 0.0008 * de * de) + 2.0 * fbm(x, y, 0.015, 4) * min(1.0, de / 30.0))
        if ds > 0:
            terms.append(9.0 * sstep(0.0, 60.0, ds) + 3.5 * fbm(x, y, 0.012, 3) * sstep(0.0, 40.0, ds))
        return max(terms) if terms else 0.0

    def _height(self, x: float, y: float, h: float, fx: float, fy: float) -> float:
        h += 0.10 * fbm(x, y, 0.07, 3)
        h += 0.40 * sstep(6.0, 0.5, fy) * (1.0 - sstep(9.0, 13.0, fx))  # the rise to the Tin Gallery mouth
        for _px, _py, _it, d in self.trunks.near(x, y, 1.4):
            h += 0.12 * (1.0 - d / 1.4) ** 2                              # a root mound round every trunk
        if y < -22.5:                                                    # the south strip and the village's fields
            h = lerp(h, 0.15 * fbm(x, y, 0.05, 3), sstep(-22.5, -24.5, y))
        return adit_floor(h + self.outside(x, y), x, y, FO_ADIT, self.adit_z)   # the hill stays out of the mine's tunnel

    def height(self, x: float, y: float) -> float:
        h, _w, fx, fy = self._bil(x, y)
        return self._height(x, y, h, fx, fy)

    def sample(self, x: float, y: float):
        h0, wts, fx, fy = self._bil(x, y)
        z = self._height(x, y, h0, fx, fy)
        opn = sstep(2.5, 6.0, self.trunks.nearest(x, y, 6.5))
        dout = max(-30.0 - x, x - 30.0, y - 22.5, -22.5 - y, 0.0)
        w = {c: wts.get(c, 0.0) for c in "lTpgum"}
        dc, _t = self.trail.nearest(x, y)
        ly_p = 0.08 + 0.32 * sstep(0.15, 0.7, dc)
        dt, tag = self.tread.nearest(x, y)
        if tag:
            lying_t, hw = tag
            m = 1.0 - sstep(hw - 0.25, hw + 0.15, dt + 0.12 * fbm(x, y, 1.3, 2))
            if m > 0.0:
                ly_p = (w["p"] * ly_p + m * lying_t) / (w["p"] + m)
                for c in "lTgum":
                    w[c] *= 1.0 - m
                w["p"] = max(w["p"], m)
        ly_t = 0.15 + 0.35 * sstep(35.0, 60.0, dout)
        if dout > 0.0:   # the hills outside: whiter where the belts thin out, in broad drifts (not one small fleck)
            ly_t += sstep(0.0, 12.0, dout) * (0.12 + 0.30 * opn + 0.25 * fbm(x, y, 0.02, 3))
        lying_c = {"l": 0.25 + 0.45 * opn, "T": ly_t, "p": ly_p, "g": 0.85, "u": 0.12 + 0.30 * opn, "m": 0.35 + 0.20 * opn}
        tot = sum(w.values()) or 1.0
        lying = sum(w[c] * lying_c[c] for c in w) / tot
        run, ly_r = 0.0, 0.55
        dr, rt = self.run.nearest(x, y)
        if rt:
            ly_r, hw = rt
            run = (1.0 - sstep(hw - 0.08, hw + 0.08, dr + 0.08 * fbm(x, y, 2.0, 2))) * (1.0 - min(1.0, w["p"]))
        for rx, ry, rr, rl in self.rings:
            d = math.hypot(x - rx, y - ry)
            if d < rr + 0.3:
                m = 1.0 - sstep(rr - 0.3, rr, d + 0.1 * fbm(x, y, 1.5, 2))
                if m > run:
                    run, ly_r = m, rl
        lying = lerp(lying, ly_r, run)
        drift = 0.0
        for _px, _py, r, d in self.drift.near(x, y, 1.6):
            drift = max(drift, 1.0 - sstep(r - 0.3, r, d + 0.1 * fbm(x, y, 1.7, 2)))
        lying = lerp(lying, 0.0, drift)
        yf = y + 1.6 * fbm(x, y, 0.09, 2)   # the village's open fields, their edge broken (it was ruler-straight)
        lying = lerp(lying, 1.0, sstep(-28.6, -30.2, yf) * (1.0 - min(1.0, 2.0 * w["p"])))
        wet = 0.6 * min(1.0, w["p"]) * (1.0 - drift)
        return z, {"wdi_c": (w["T"], w["p"], w["g"], w["u"]), "wdi_d": (w["m"], run, drift, 0.0),
                   "wdi_s": (clamp(lying), opn, wet, 0.0)}


def moon_hmax(x: float, y: float, targets=FO_MOON) -> float:
    """The tallest tree at (x, y) that leaves every moon window open (the low moon at azimuth 325, elevation 19)."""
    best = float("inf")
    for (cx, cy), r in targets:
        rx, ry = x - cx, y - cy
        a = rx * U_MOON[0] + ry * U_MOON[1]
        bp = max(0.0, abs(rx * V_MOON[0] + ry * V_MOON[1]) - 2.0)
        if a <= 0.0 or bp >= r:
            continue
        c = math.sqrt(r * r - bp * bp)
        if a + c < 8.7:   # only the bare trunk below 3 m can reach the target
            continue
        best = min(best, 0.344 * (a - c))
    return best


def fit_moon(name: str, scale: float, hmax: float):
    """The tree that keeps the moon windows open: the one asked for, a short pine scaled to fit, a dead tree, or None."""
    h = tree_height(name, scale)
    if h <= hmax or (name == "dead_tree" and h <= 9.0 and hmax >= 2.0):
        return name, scale
    s2 = min(1.2, hmax / vb.CAT["pine_short"]["size_m"])
    if s2 >= 0.75:
        return "pine_short", s2
    if hmax >= 2.0:
        s = scale if name == "dead_tree" else RNG.uniform(1.0, 1.5)
        return "dead_tree", min(s, 9.0 / vb.CAT["dead_tree"]["size_m"])
    return None, 0.0


def gallows_trees(mp: WildMap, eyes, trunks: Hash):
    """Gallows Wood's tree plan (seeded): trees on T cells by zone, stands kept solid from the trails, the moon
    windows, then the belts outside. Returns (trees, stumps); every trunk goes into `trunks`."""
    L = [[mp.g(x, y) for x in range(mp.w)] for y in range(mp.h)]
    for (tx, ty), c in FO_PORTALS.items():
        L[ty][tx] = c
    pc, gc = Hash(2.0), Hash(2.0)
    for ty in range(mp.h):
        for tx in range(mp.w):
            if L[ty][tx] == "p":
                pc.add(*T(tx, ty))
            elif L[ty][tx] == "g":
                gc.add(*T(tx, ty))
    points = [(T(21, 22), 1.2), (T(23, 22), 1.2), (T(24, 23), 1.2), (T(19, 10.05), 1.2)] + \
             [(T(tx, ty), 1.6) for (tx, ty), _h, _f in FO_HOLLOW] + [(e, 1.6) for e in eyes]
    rects = [TR(*r) for r in FO_KEEP_RECTS]

    def clear(x: float, y: float) -> bool:
        if not pc.free(x, y, 1.0) or not gc.free(x, y, 0.9):
            return False
        if any(math.hypot(x - p[0], y - p[1]) < r for p, r in points):
            return False
        return not any(in_rect(x, y, r) for r in rects)

    trees, stumps = [], []

    def add(x, y, mix, lod, shadow, spacing=1.6) -> bool:
        if not clear(x, y) or not trunks.free(x, y, spacing):
            return False
        name, sc = pick(mix)
        name, sc = fit_moon(name, sc, moon_hmax(x, y))
        trunks.add(x, y)
        if name is None:
            stumps.append((x, y, RNG.uniform(0.9, 1.3)))
            return True
        trees.append(dict(name=name, x=x, y=y, scale=sc, lod=lod, shadow=shadow, sink=0.2))
        return True

    def lod_in(x, y) -> float:
        near = not pc.free(x, y, 6.0) or not gc.free(x, y, 6.0) or any(math.hypot(x - e[0], y - e[1]) < 20.0 for e in eyes)
        return 0.6 if near else 0.3

    def zone(tx, ty) -> str:
        if ty == 0 or tx == 0:
            return "back"
        if ty == mp.h - 1 or tx == mp.w - 1:
            return "front"
        return "interior"

    tcells = [c for c in mp.cells("T") if c not in FO_PORTALS]
    have: dict = {}
    for tx, ty in tcells:
        z = zone(tx, ty)
        if RNG.random() < FO_FILL[z]:
            for _ in range(4):
                x, y = T(tx, ty)
                x, y = x + RNG.uniform(-0.55, 0.55), y + RNG.uniform(-0.55, 0.55)
                if add(x, y, FO_MIX[z], lod_in(x, y), True):
                    have[(tx, ty)] = True
                    break
    # every stand of 6 or more cells: at least 3 trees, and one on a corner that faces a trail
    inner = {c for c in tcells if zone(*c) == "interior"}

    def facing_trail(c) -> bool:
        return any(0 <= c[0] + dx < mp.w and 0 <= c[1] + dy < mp.h and L[c[1] + dy][c[0] + dx] in "pg"
                   for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))

    seen = set()
    for c0 in sorted(inner):
        if c0 in seen:
            continue
        stand, todo = [], [c0]
        seen.add(c0)
        while todo:
            c = todo.pop()
            stand.append(c)
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                n = (c[0] + dx, c[1] + dy)
                if n in inner and n not in seen:
                    seen.add(n)
                    todo.append(n)
        if len(stand) < 6:
            continue
        sset = set(stand)
        corners = [c for c in stand
                   if sum((c[0] + dx, c[1] + dy) in sset for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))) <= 2]
        trail_corners = [c for c in corners if facing_trail(c)]
        if trail_corners and not any(c in have for c in trail_corners):
            for c in RNG.sample(trail_corners, len(trail_corners)):
                x, y = T(*c)
                if add(x, y, FO_MIX["interior"], lod_in(x, y), True):
                    have[c] = True
                    break
        for c in sorted(stand, key=lambda q: (not facing_trail(q), RNG.random())):
            if sum(1 for s in stand if s in have) >= 3:
                break
            if c in have:
                continue
            x, y = T(*c)
            if add(x + RNG.uniform(-0.3, 0.3), y + RNG.uniform(-0.3, 0.3), FO_MIX["interior"], lod_in(x, y), True):
                have[c] = True
    inside_n, inside_s = len(trees), len(stumps)

    def dout(x, y) -> float:
        return max(-30.0 - x, x - 30.0, y - 22.5, -22.5 - y, 0.0)

    for lo, hi, want, lod in ((1.5, 8.0, 80, 0.3), (8.0, 35.0, 160, 0.2), (35.0, 160.0, 150, 0.08)):
        count = tries = 0
        while count < want and tries < 40000:
            tries += 1
            x, y = RNG.uniform(-30.0 - hi, 30.0 + hi), RNG.uniform(-28.5, 22.5 + hi)
            d = dout(x, y)
            if not lo <= d < hi:
                continue
            south = y < -22.5
            if south and (lo > 1.5 or abs(x - 0.75) < 2.6 or RNG.random() > 0.3 or abs(x) > 31.5):
                continue
            if hi > 100 and RNG.random() < 0.85 * (d - 35.0) / 125.0:
                continue
            mix = FO_MIX["front"] if south else FO_MIX["interior"] if x > 30.0 else FO_MIX["back"]
            shadow = south or (x > 30.0 and d < 45.0)
            if add(x, y, mix, lod, shadow, spacing=2.4 if lo < 35 else 4.0):
                count += 1
    print(f"TREES planned: {inside_n} in the map ({inside_s} window stumps), {len(trees) - inside_n} outside, "
          f"{len(stumps) - inside_s} outside stumps", flush=True)
    return trees, stumps


def hq_site(mp, x: float, y: float, facing: str, wm: dict) -> None:
    """The gamekeeper's lodge at tier 0: four driven stakes, a string line, two crossed planks and a blank sign."""
    yaw = face_deg(facing)
    R = Matrix.Rotation(math.radians(yaw), 4, "Z")
    corners = [R @ Vector((sx, sy, 0.0)) for sx, sy in ((-0.65, -0.65), (0.65, -0.65), (0.65, 0.65), (-0.65, 0.65))]
    mb = MB()
    tops = []
    for c in corners:
        px, py = x + c.x, y + c.y
        gz = mp.height(px, py)
        mb.box(0.05, 0.05, 1.05, M4(px, py, gz - 0.25, rz=yaw), wm["stake"], base=True)
        mb.cyl(0.035, 0.0, 0.06, 4, M4(px, py, gz + 0.80, rz=45 + yaw), wm["stake"])
        tops.append(Vector((px, py, gz + 0.35)))
    for i in range(4):
        a, b = tops[i], tops[(i + 1) % 4]
        mb.tube([a, (a + b) / 2 - Vector((0.0, 0.0, 0.03)), b], 0.002, 4, wm["cord"])
    gz = mp.height(x, y)
    for turn in (-25.0, 25.0):
        mb.box(2.0, 0.20, 0.035, M4(x, y, gz + 0.02 + (0.035 if turn > 0 else 0.0), rz=yaw + turn), wm["timber"], base=True)
    c = R @ Vector((-0.95, -0.95, 0.0))
    sx, sy = x + c.x, y + c.y
    gz = mp.height(sx, sy)
    mb.box(0.08, 0.08, 1.65, M4(sx, sy, gz - 0.3, rz=yaw), wm["stake"], base=True)
    mb.box(0.55, 0.025, 0.35, M4(sx, sy, gz + 1.15, rz=yaw - 45.0) @ M4(0.0, -0.06, 0.0), wm["stake"])
    mb.build("WP_hq_site", col="models")


def plank_stack(mp, x: float, y: float, wm: dict) -> None:
    """Sawn planks on two bearers, three split half-logs (the oven timber) leaning on the north face."""
    z = mp.height(x, y) - 0.02
    mb = MB()
    for sx in (-0.8, 0.8):
        mb.box(0.10, 1.1, 0.10, M4(x + sx, y, z), wm["timber"], base=True)
    zz = z + 0.10
    for _ in range(5):
        mb.box(2.4, 0.22, 0.04, M4(x + RNG.uniform(-0.03, 0.03), y + RNG.uniform(-0.03, 0.03), zz, rz=RNG.uniform(-2, 2)),
               wm["timber"], base=True)
        zz += 0.04 + RNG.uniform(0.0, 0.01)
    for i in range(3):
        ln = RNG.uniform(0.9, 1.1)
        bx = x - 0.6 + 0.6 * i + RNG.uniform(-0.1, 0.1)
        mb.tube([Vector((bx, y + 0.11 + 0.32, z + 0.05)), Vector((bx, y + 0.13, z + 0.05 + ln * 0.94))], 0.085, 8, wm["split"])
    mb.build("WP_plank_stack", col="models")


def chopping_block(mp, x: float, y: float, wm: dict) -> None:
    """A sawn pine round with an axe bitten into its end grain, chips on the snow round it."""
    z = mp.height(x, y) - 0.03
    mb = MB()
    mb.cyl(0.31, 0.29, 0.58, 16, M4(x, y, z), wm["bark"], caps=False, jitter=0.03)
    mb.disc(0.29, 16, M4(x, y, z + 0.58), wm["endgrain"])
    for a in (20.0, 140.0):
        mb.box(0.2, 0.008, 0.004, M4(x, y, z + 0.582, rz=a) @ M4(0.1), wm["check"])
    hx, hy, hz = x + 0.08, y, z + 0.58
    mb.box(0.17, 0.022, 0.09, M4(hx, hy, hz + 0.005, rz=90.0), wm["iron"])
    d = Vector((-math.sin(math.radians(38.0)), 0.0, math.cos(math.radians(38.0))))
    p0 = Vector((hx, hy, hz + 0.05))
    mb.tube([p0, p0 + d * 0.75], 0.0175, 8, wm["ash"])
    mb.build("WP_chopping_block", col="models", smooth=True)
    chips(mp, x, y, 15, 0.9, wm["chips"])


def stall_dressing(mp, hut, wm: dict) -> None:
    """Fit the gamekeeper's stall: counter on trestles across the open (east) front, knife, snare wire and day book
    on it, pelts on the back wall, unlit pitch torches in a stave bucket, snares on pegs, the fowling piece."""
    lo, hi = wbox(hut)
    gz = mp.height((lo.x + hi.x) / 2, (lo.y + hi.y) / 2)
    xf, xb = hi.x - 0.35, lo.x + 0.25          # just inside the open front; the back wall
    yc, yn = (lo.y + hi.y) / 2, hi.y - 0.35
    wood = role_mat("W_counter", "timber_rough", k=0.8, desat=0.15)
    pelt = flat_mat("W_pelt", (0.20, 0.17, 0.14), 1.0)
    fox = flat_mat("W_pelt_fox", (0.35, 0.13, 0.05), 1.0)
    rag = flat_mat("W_torch_rag", (0.03, 0.025, 0.02), 0.6)
    walnut = flat_mat("W_walnut", (0.16, 0.08, 0.04), 0.5)
    book = flat_mat("W_daybook", (0.18, 0.10, 0.06), 0.7)
    mb = MB()
    cw = max(1.2, min(2.6, (hi.y - lo.y) - 0.5))
    mb.box(0.35, cw, 0.05, M4(xf, yc, gz + 0.95), wood)
    for sy in (-cw / 2 + 0.2, cw / 2 - 0.2):
        for sx in (-0.12, 0.12):
            mb.box(0.04, 0.04, 0.95, M4(xf + sx, yc + sy, gz, ry=sx * 40.0), wood, base=True)
    mb.box(0.25, 0.025, 0.006, M4(xf, yc - 0.3, gz + 0.98, rz=20.0), wm["iron"])
    mb.box(0.03, 0.025, 0.012, M4(xf, yc - 0.42, gz + 0.98, rz=20.0), walnut)
    mb.torus(0.035, 0.004, 12, 4, M4(xf + 0.05, yc + 0.1, gz + 0.984), wm["brass"])
    mb.box(0.16, 0.22, 0.04, M4(xf - 0.02, yc + 0.45, gz + 0.995, rz=8.0), book)
    for py, z0, mat in ((yc - 0.7, 1.9, pelt), (yc, 2.0, fox), (yc + 0.7, 1.95, pelt)):  # pegs 1.9-2.0 m up
        verts, faces = [], []
        for j in range(4):
            for k in range(3):
                u, v = k / 2.0, j / 3.0
                verts.append((xb + 0.04 + 0.05 * math.sin(math.pi * u), py - 0.25 + 0.5 * u, gz + z0 - 0.95 + 0.95 * v))
        for j in range(3):
            for k in range(2):
                a = j * 3 + k
                faces.append((a, a + 1, a + 4, a + 3))
        mb.add(verts, faces, mat)
        mb.cyl(0.012, 0.012, 0.08, 6, M4(xb + 0.02, py, gz + z0, ry=90.0), wm["hazel"])
    bx, by = xf - 0.45, yn - 0.1
    mb.cyl(0.14, 0.13, 0.32, 14, M4(bx, by, gz), wood, caps=True)
    for zb in (0.06, 0.24):
        mb.cyl(0.143, 0.143, 0.025, 14, M4(bx, by, gz + zb), wm["iron"], caps=False)
    for i in range(5):
        a = 2 * math.pi * i / 5
        M = M4(bx + 0.06 * math.cos(a), by + 0.06 * math.sin(a), gz + 0.05, rx=6.0 * math.cos(a), ry=6.0 * math.sin(a))
        mb.cyl(0.015, 0.015, 0.6, 6, M, wm["hazel"])
        mb.cyl(0.035, 0.03, 0.12, 8, M @ M4(z=0.55), rag)
    for i in range(4):
        px = xb + 0.6 + 0.35 * i
        mb.cyl(0.01, 0.01, 0.08, 6, M4(px, hi.y - 0.2, gz + 1.5, rx=90.0), wm["hazel"])
        mb.torus(0.06, 0.0015, 14, 4, M4(px, hi.y - 0.25, gz + 1.43, rx=90.0), wm["brass"])
    M = M4(hi.x - 0.15, hi.y - 0.2, gz + 0.02, rx=-12.0)
    mb.cyl(0.011, 0.011, 0.95, 8, M @ M4(z=0.40), wm["iron"])
    mb.box(0.05, 0.10, 0.42, M @ M4(z=0.21), walnut)
    mb.build("WP_stall_dressing", col="models")


def gallows_models(mp: WildMap, gw: Gallows, wm: dict):
    """Every placement of the Gallows Wood spec. Returns the lantern pole (its lamp is added by hand)."""
    # painted lanterns and candles the data does not light (the witching lantern's is the wood's one warm light)
    for name in ("Frostbound_Waymarker", "wood_stack", "Frostbound_Gate", "Frostbound_Warden_Gate", "Frostbound_Witch_Hut"):
        darken_lanterns(name)
    # the Tin Gallery mouth: adit on tile x 6, its opening plane at world y 21.3, base set explicitly
    mine = "Abandoned_Tin_Mine"
    d = vb.dims(mine)
    mx = T(6, 0)[0]
    zf = mp.height(*T(6, 0.6))
    # no procedural void behind it: the model has its own closed recess (frame at y 23.8-24.0, a dark tunnel back to
    # a wall at y 27.3-28.1, floor z 1.05). The box built here sat 2.5 m in front of that frame and showed round the
    # Meshy mouth as a flat ink lid, a side slab and clean brown timber sets (review 2)
    mplace(mp, mine, mx, 21.3 + d.y / 2, facing="S", z=zf, sink=0.2, lod=0.7)
    ph_place(mp, "picke_dirty_01", *T(7.15, 0.35), rot=200.0, size=1.12, sink=0.02, tilt=18.0, toward=180.0)
    ph_place(mp, "rock_face_01", *T(1.8, -2.2), rot=180.0, size=5.0, sink=0.6, lod=0.7)
    ph_place(mp, "rock_face_01", *T(11, -2.6), rot=10.0, size=5.0, sink=0.8, lod=0.7)
    ph_place(mp, "rock_face_02", *T(9.4, -0.9), rot=340.0, size=2.7, sink=0.4, lod=0.7)
    ph_place(mp, "rock_face_02", *T(2.9, -0.8), rot=160.0, size=2.7, sink=0.4, lod=0.7)
    # the rock step's faces either side of the mouth (the terrain's smooth 3.5 m rise read as retaining walls)
    ph_place(mp, "rock_face_01", *T(3.4, -1.5), rot=180.0, size=6.5, sink=1.0, lod=0.7)
    ph_place(mp, "rock_face_01", *T(9.3, -1.7), rot=10.0, size=6.5, sink=1.0, lod=0.7)
    for tx, ty, s, piece in ((1.4, 1.3, 1.8, "#2"), (8.9, 1.6, 2.2, "#1"), (7.8, 3.3, 1.4, "#3"), (5.0, 3.3, 1.2, "#4")):
        x, y = T(tx, ty)
        face = math.degrees(math.atan2(0.0, mx - x))  # faces turned to the trail at x 6
        ph_place(mp, "rock_moss_set_01", x, y, rot=face + 90.0, size=s, piece=piece, sink_frac=0.3, lod=0.6)
    # the gates, the log crawl, the lantern pole, the stall, the woodpile
    mplace(mp, "Frostbound_Gate", *T(20.6, 29), facing="N", sink=0.05, lod=0.4, lamps=False)
    # sunk 0.22 (was 0.08): its baked snow base stood as a raised slab with a hard front lip (fenwood_gate, review 2)
    mplace(mp, "Frostbound_Warden_Gate", *T(0.15, 16), facing="E", sink=0.22, lod=0.6, lamps=False)
    mplace(mp, "hollow_log", *T(39.37, 20), facing="E", sink=0.12, lod=0.6)
    pole = mplace(mp, "The_Witching_Lantern", *T(21, 22), facing="S", size=2.5, sink=0.08, lod=0.6, lamps=False)
    pole.visible_shadow = False   # the lantern's own lamp sits in its glass
    # a shadow-only twin of the pole without the lantern: the pole and its base cast the moon's long shadow and
    # darken the snow they stand on (without it the base read as pasted on), and the lamp still shines out
    ref, items = vb.LAMPS["The_Witching_Lantern"]
    f = vb.CAT["The_Witching_Lantern"]["size_m"] / ref
    lamp = (items[0][0] * f, items[0][1] * f, items[0][2] * f)
    twin = pole.copy()
    twin.data = pole.data.copy()
    cut_faces(twin, lambda x, y, z: math.dist((x, y, z), lamp) < 0.32 / pole.scale[0])
    COL["models"].objects.link(twin)
    twin.name = "WP_lantern_pole_shadow"
    twin.visible_camera = twin.visible_diffuse = twin.visible_glossy = twin.visible_transmission = False
    twin.visible_volume_scatter = False
    twin.visible_shadow = True
    twin["wdi_model"] = "shadow_proxy"
    hut = mplace(mp, "Frostbound_Witch_Hut", *T(15.7, 23), facing="E", sink=0.08, lod=0.6)
    stall_dressing(mp, hut, wm)
    ph_place(mp, "wooden_lantern_01", *T(16.6, 24.2), rot=0.0, size=0.53, z=1.9)
    mplace(mp, "wood_stack", *T(23, 22), facing="SW", sink=0.03, lod=0.8)
    bx, by = T(23.5, 22.5)
    bucksaw(bx, by, mp.height(bx, by) + 1.2, "SE", wm)
    chopping_block(mp, *T(24, 23), wm)
    plank_stack(mp, *T(16, 28.85), wm)
    hq_site(mp, *T(19, 10.05), "S", wm)
    ph_place(mp, "rusted_spade_01", *T(19.35, 9.75), rot=30.0, size=1.1, sink=0.18, tilt=12.0)
    mplace(mp, "Frostbound_Waymarker", *T(21, 12), facing="S", size=2.8, sink=0.1, lod=0.4, lamps=False)
    mplace(mp, "Frostbound_Waymarker", *T(7, 12), facing="SE", size=2.6, sink=0.1, lod=0.3, lamps=False)
    # the hollow trees (fo.hollow_tree_*): the Meshy dead_tree snag (the procedural hollow trunk read as a rust
    # chimney), its top about 0.6 m over the hide spot's height; the draws the procedural trunk made are still taken,
    # so the seeded sequence of everything placed after it stays as it was
    for (tx, ty), h, facing in FO_HOLLOW:
        mplace(mp, "dead_tree", *T(tx, ty), facing=facing, scale=(h + 0.6) / max(vb.dims("dead_tree").z, 1.0), sink=0.15,
               lamps=False)
        [RNG.uniform(0.0, 1.1) for _ in range(20)]
        RNG.randrange(3, 20)
        RNG.uniform(1.4, 1.8)
        RNG.uniform(1.4, 1.8)
    for (tx, ty), rot in (((6, 26), 20.0), ((36, 20), 250.0)):  # brush hide spots: a horseshoe, the gap off the trail
        x, y = T(tx, ty)
        _d, _t = gw.trail.nearest(x, y)
        near = min(gw.pc.near(x, y, 20.0), key=lambda q: q[3], default=(x, y - 1.0, None, 1.0))
        gap = math.degrees(math.atan2(y - near[1], x - near[0]))  # away from the nearest trail
        for i, da in enumerate((90.0, 180.0, 270.0)):
            a = math.radians(gap + da)
            ph_place(mp, "shrub_02", x + 0.7 * math.cos(a), y + 0.7 * math.sin(a), rot=rot + 120 * i,
                     piece=1 + i % ph_count("shrub_02"), tall=RNG.uniform(1.2, 1.4), grade="bramble", col="forest", sink=0.05)
    for tx, ty, rot in ((9, 14, 40), (24, 14, 300), (31, 14, 120), (19, 16, 200), (7, 4, 80), (3, 18, 250), (12, 16, 10)):
        fern_group(mp, *T(tx, ty), rot, 1.3, "russet", branches=True, tufts=2)
    for tx, ty, rot in FO_TOADSTOOLS:
        toadstools(mp, *T(tx, ty), rot)
    for tx, ty, rot, slug, piece, size, sink in ((16, 12, 20, "rock_moss_set_02", 3, 1.7, 0.25),
                                                 (34, 11, 115, "rock_moss_set_02", 5, 1.9, 0.3),
                                                 (21, 18, 250, "rock_moss_set_02", 1, 1.6, 0.25),
                                                 (2, 15, 65, "rock_moss_set_01", 2, 2.0, 0.35),
                                                 (29, 21, 190, "rock_moss_set_01", 4, 2.1, 0.35)):
        ph_place(mp, slug, *T(tx, ty), rot=rot, piece=piece, size=size, sink=sink, lod=0.6 if size < 1.8 else 0.5)
    for tx, ty, rot, size in ((27, 12, 30, 1.25), (5, 8, 160, 1.1), (35, 4, 250, 1.35)):
        ph_place(mp, "tree_stump_01", *T(tx, ty), rot=rot, size=size, sink=0.08, lod=0.35)
    chips(mp, *T(27, 12), 10, 1.0, wm["chips"], "WP_chips_stump")
    for tx, ty, rot, size in ((19, 19, 0, 1.7), (5, 2, 60, 1.5), (26, 9.35, 90, 1.8), (14, 24, 140, 1.6), (33, 27, 20, 1.7)):
        # dark wet wood, in HM_Forest so the look lays no roof snow on it (pale and snowed over, the scan read as a
        # bleached bone by the trail)
        ph_place(mp, "single_root", *T(tx, ty), rot=rot, size=size, sink=0.05, lod=0.1, col="forest", grade="bramble")
    for tx, ty, rot, size in ((37.1, 22.3, 135.0, 4.5), (10, 19, 225.0, 4.0)):  # windfalls: dead trees tipped over
        o = mplace(mp, "dead_tree", *T(tx, ty), rot=rot, size=size, sink=-0.15, lod=0.5, lamps=False)
        o.rotation_euler = (0.0, math.radians(84.0), math.radians(rot))
    for sid, along in (("fo.snare", 90.0), ("fo.snare_1", 0.0), ("fo.snare_2", 0.0)):
        if sid in mp.byid:
            snare(mp, *mp.xy(sid), along, wm)
    for tx, ty, axis in ((3, 12, 90.0), (15, 5, 0.0), (28, 24, 45.0), (37.4, 17, 90.0)):
        log_pile(mp, *T(tx, ty), axis, wm)
    for tx, ty, rot, size, face in ((21.3, 9.35, 70.0, 1.0, 200.0), (12, 22, 300.0, 1.1, 90.0)):
        st = ph_place(mp, "tree_stump_01", *T(tx, ty), rot=rot, size=size, sink=0.08, lod=0.3)
        resin_drips(st, face, wm)
    for tx, ty, rot in ((17, 27, 0.0), (33, 9, 120.0)):  # the herb nodes: the only living green in the frame
        x, y = T(tx, ty)
        for _ in range(3):
            ph_place(mp, "grass_medium_02", x + RNG.uniform(-0.25, 0.25), y + RNG.uniform(-0.25, 0.25),
                     piece=RNG.randint(1, ph_count("grass_medium_02")), size=0.6 * RNG.uniform(0.6, 1.0), col="forest",
                     sink=0.01)
        ph_place(mp, "fern_02", x + 0.2, y - 0.2, rot=rot, piece=1, size=0.7, col="forest", sink=0.02)
    x, y = T(6, 24)
    for i, s in enumerate((0.45, 0.38, 0.30)):
        ph_place(mp, "rock_07", x + 0.25 * math.cos(2.1 * i), y + 0.25 * math.sin(2.1 * i), size=s, sink=0.04, lod=0.12)
    return pole


class Scatter:
    """Keeps scattered props apart and off forbidden spots; generators of candidate points."""

    def __init__(self, forbid, trunks: Hash | None = None):
        self.taken = Hash(2.0)
        self.forbid = forbid
        self.trunks = trunks

    def ok(self, x: float, y: float, r: float = 0.9, trunk: float = 0.5) -> bool:
        if not self.taken.free(x, y, r) or any(math.hypot(x - p[0], y - p[1]) < rr for p, rr in self.forbid):
            return False
        return self.trunks is None or self.trunks.free(x, y, trunk)

    def put(self, x: float, y: float) -> None:
        self.taken.add(x, y)


def gallows_scatter(mp: WildMap, gw: Gallows, trunks: Hash, eyes, wm: dict) -> None:
    """The undergrowth and the floor's small props, by the spec's scatter rows (counts approximate, seeded)."""
    forbid = [(e, 1.8) for e in eyes] + [(T(21, 22), 1.2), (T(23, 22), 1.5), (T(24, 23), 1.2), (T(16, 23), 2.0),
                                          (T(19, 10.05), 1.4), (T(16, 28.85), 1.5)]
    sc = Scatter(forbid, trunks)

    def off_trail(x, y) -> bool:
        return gw.trail.nearest(x, y)[0] >= 0.6 and gw.tread.nearest(x, y)[0] >= 0.6

    def letter_at(x, y) -> str:
        fx, fy = TF(x, y)
        return gw.letter(int(round(fx)), int(round(fy)))

    def trail_edge(n, off=(0.55, 0.8), spacing=2.0):
        segs = gw.trail_segs + [s[:4] for s in gw.tread_segs if abs(s[0]) < 40]
        out, tries, side = [], 0, 1
        while len(out) < n and tries < n * 60:
            tries += 1
            ax, ay, bx, by = RNG.choice(segs)[:4]
            t = RNG.random()
            ln = math.hypot(bx - ax, by - ay) or 1.0
            side = -side
            o = RNG.uniform(*off) * side
            x, y = ax + (bx - ax) * t - (by - ay) / ln * o, ay + (by - ay) * t + (bx - ax) / ln * o
            if abs(x) < 29.5 and abs(y) < 22.0 and letter_at(x, y) not in "pg" and sc.ok(x, y, spacing):
                out.append((x, y))
                sc.put(x, y)
        return out

    def in_cells(n, test, r=1.2, cells=None):
        cells = cells or [(tx, ty) for ty in range(mp.h) for tx in range(mp.w)]
        out, tries = [], 0
        while len(out) < n and tries < n * 80:
            tries += 1
            tx, ty = RNG.choice(cells)
            x, y = T(tx + RNG.uniform(-0.5, 0.5), ty + RNG.uniform(-0.5, 0.5))
            if test(tx, ty, x, y) and off_trail(x, y) and sc.ok(x, y, r):
                out.append((x, y))
                sc.put(x, y)
        return out

    def opn(x, y) -> float:
        return sstep(2.5, 6.0, trunks.nearest(x, y, 6.5))

    def near_stand(tx, ty) -> bool:
        return any(gw.letter(tx + dx, ty + dy) == "T" for dx in (-1, 0, 1) for dy in (-1, 0, 1))

    def tuft_group(points, group=(1, 1)):
        for x, y in points:
            for _ in range(RNG.randint(*group)):
                ph_place(mp, "grass_medium_02", x + RNG.uniform(-0.3, 0.3), y + RNG.uniform(-0.3, 0.3),
                         piece=RNG.randint(1, ph_count("grass_medium_02")), grade="dry", col="forest", sink=0.01,
                         size=RNG.uniform(0.25, 0.45))

    def branch(x, y):
        ph_place(mp, "dry_branches_medium_01", x, y, piece=RNG.randint(1, ph_count("dry_branches_medium_01")), lod=0.25,
                 size=RNG.uniform(0.8, 1.3), sink=0.03, tilt=RNG.uniform(0, 15), toward=RNG.uniform(0, 360))

    def fern(x, y, n=1):
        for _ in range(n):
            ph_place(mp, "fern_02", x + RNG.uniform(-0.3, 0.3), y + RNG.uniform(-0.3, 0.3), grade="russet", col="forest",
                     piece=RNG.randint(1, ph_count("fern_02")), size=RNG.uniform(0.5, 1.0) * RNG.uniform(1.0, 1.3), sink=0.02)

    def rock2(x, y, lod=0.3, size=(0.5, 1.4)):
        ph_place(mp, "rock_moss_set_02", x, y, piece=RNG.randint(1, ph_count("rock_moss_set_02")), lod=lod,
                 size=RNG.uniform(*size), sink_frac=0.3)

    def stump(x, y):
        ph_place(mp, "tree_stump_01", x, y, lod=0.12, size=RNG.uniform(0.8, 1.3), sink=0.08)

    def shrub(x, y):
        ph_place(mp, "shrub_02", x, y, piece=RNG.randint(1, ph_count("shrub_02")), grade="bramble", col="forest",
                 tall=RNG.uniform(1.1, 1.5), sink=0.05)

    def lit(tx, ty, x, y):
        return gw.letter(tx, ty) == "l"

    def thicket(tx, ty, x, y):
        return gw.letter(tx, ty) == "u"

    # dry grass: trail edges, the clearing (none on its trodden line), groups in open litter
    tuft_group(trail_edge(32))
    tuft_group(in_cells(25, lambda tx, ty, x, y: gw.letter(tx, ty) == "g" and gw.tread.nearest(x, y)[0] > 0.7, 0.8))
    tuft_group(in_cells(14, lambda tx, ty, x, y: lit(tx, ty, x, y) and opn(x, y) > 0.5, 2.0), (2, 4))
    # bracken: trail edges, stand edges, thickets, the log crawl, just outside the edges
    for x, y in trail_edge(14):
        fern(x, y)
    for x, y in in_cells(10, lambda tx, ty, x, y: lit(tx, ty, x, y) and near_stand(tx, ty), 2.5):
        fern(x, y, 3)
    for x, y in in_cells(8, thicket, 0.6):
        fern(x, y)
    for i in range(3):
        fern(*T(39.8 + 0.4 * i, 20 + RNG.uniform(-0.6, 0.6)))
    for _ in range(15):
        side = RNG.choice("NWE")
        x = RNG.uniform(-30, 30) if side == "N" else (-30 - RNG.uniform(1, 10)) if side == "W" else 30 + RNG.uniform(1, 10)
        y = 22.5 + RNG.uniform(1, 10) if side == "N" else RNG.uniform(-20, 20)
        if sc.ok(x, y, 1.0):
            sc.put(x, y)
            fern(x, y)
    # windfall brush: trail edges, along the wolf loops, near stands, thickets, the crawl, the felled strip, outside
    for x, y in trail_edge(14):
        branch(x, y)
    for _ in range(12):
        s = RNG.choice(gw.run_segs)
        t = RNG.random()
        ln = math.hypot(s[2] - s[0], s[3] - s[1]) or 1.0
        o = RNG.choice((-1, 1)) * RNG.uniform(0.6, 1.0)
        x, y = s[0] + (s[2] - s[0]) * t - (s[3] - s[1]) / ln * o, s[1] + (s[3] - s[1]) * t + (s[2] - s[0]) / ln * o
        if off_trail(x, y) and sc.ok(x, y, 1.0):
            sc.put(x, y)
            branch(x, y)
    for x, y in in_cells(22, lambda tx, ty, x, y: lit(tx, ty, x, y) and near_stand(tx, ty), 1.5):
        branch(x, y)
    for x, y in in_cells(6, thicket, 0.6):
        branch(x, y)
    for i in range(4):
        branch(*T(39.6 + 0.5 * i, 20 + RNG.uniform(-0.7, 0.7)))
    felled = [(tx, ty) for tx in range(23, 37) for ty in range(30, 34)]
    for x, y in in_cells(10, lambda tx, ty, x, y: True, 1.5, felled):
        branch(x, y)
    for _ in range(9):
        x, y = RNG.uniform(-38, 38), RNG.uniform(22.5, 30)
        if sc.ok(x, y, 1.5):
            sc.put(x, y)
            branch(x, y)
    # stones by the wolf runs and the stands, on the moss off the cave trail
    for _ in range(5):
        s = RNG.choice(gw.run_segs)
        t = RNG.random()
        x, y = s[0] + (s[2] - s[0]) * t + RNG.uniform(-0.8, 0.8), s[1] + (s[3] - s[1]) * t + RNG.uniform(-0.8, 0.8)
        if letter_at(x, y) not in "pg" and sc.ok(x, y, 4.0):
            sc.put(x, y)
            rock2(x, y)
    for x, y in in_cells(10, lambda tx, ty, x, y: lit(tx, ty, x, y) and near_stand(tx, ty), 4.0):
        rock2(x, y)
    for x, y in in_cells(4, lambda tx, ty, x, y: gw.letter(tx, ty) == "m" and abs(x - T(6, 0)[0]) > 1.0, 3.0):
        rock2(x, y)
    # stumps of old fellings, and the felled south-east strip the moon comes in over
    for x, y in in_cells(8, lambda tx, ty, x, y: lit(tx, ty, x, y) and gw.trail.nearest(x, y)[0] > 2.9, 3.0):
        stump(x, y)
    for x, y in in_cells(11, lambda tx, ty, x, y: True, 3.0, felled):
        stump(x, y)
    # roots at six stand edges, the long axis pointing away from the stand
    for x0, y0, x1, y1 in ((11, 10, 13, 12), (13, 16, 15, 17), (27, 17, 28, 19), (31, 22, 33, 23), (33, 14, 35, 16), (24, 3, 26, 5)):
        cx, cy = T((x0 + x1) / 2, (y0 + y1) / 2)
        near = min(gw.pc.near(cx, cy, 15.0), key=lambda q: q[3], default=(cx, cy - 3.0, None, 3.0))
        a = math.atan2(near[1] - cy, near[0] - cx)
        hx, hy = (x1 - x0 + 1) * S / 2, (y1 - y0 + 1) * S / 2
        r = min(hx / max(abs(math.cos(a)), 1e-3), hy / max(abs(math.sin(a)), 1e-3)) + 0.6
        ph_place(mp, "single_root", cx + r * math.cos(a), cy + r * math.sin(a), rot=math.degrees(a) - 90.0,
                 size=RNG.uniform(1.4, 1.8), sink=0.05, lod=0.1)
    # the thickets' shrubs; the log crawl choked
    for x, y in in_cells(8, thicket, 0.7):
        shrub(x, y)
    for i in range(4):
        shrub(*T(39.9 + 0.6 * i, 20 + RNG.choice((-0.7, 0.7))))
    # stones at the mud's edge, rubble at the trail head
    for x, y in trail_edge(10, (0.6, 0.9), 2.5):
        ph_place(mp, "rock_07", x, y, size=RNG.uniform(0.25, 0.45), sink=0.04, lod=0.12)
    head = [(5, 0), (6, 0), (7, 0), (5, 1), (6, 1), (7, 1), (6, 2)]
    for _ in range(6):
        tx, ty = RNG.choice(head)
        x, y = T(tx + RNG.uniform(-0.5, 0.5), ty + RNG.uniform(-0.5, 0.5))
        if abs(x - T(6, 0)[0]) > 0.5 and sc.ok(x, y, 0.5):
            sc.put(x, y)
            ph_place(mp, "rock_07", x, y, size=RNG.uniform(0.25, 0.45), sink=0.04, lod=0.12)
    # every tree-less T cell within 9 m of a trail or the clearing: one dark undergrowth item
    for tx, ty in mp.cells("T"):
        x, y = T(tx, ty)
        if (tx, ty) in FO_PORTALS or not trunks.free(x, y, 0.9) or not (0 < tx < mp.w - 1 and 0 < ty < mp.h - 1):
            continue
        if gw.pc.free(x, y, 9.0) and gw.gc.free(x, y, 9.0):
            continue
        x, y = x + RNG.uniform(-0.4, 0.4), y + RNG.uniform(-0.4, 0.4)
        if not sc.ok(x, y, 0.8):
            continue
        sc.put(x, y)
        r = RNG.random()
        if r < 0.25:
            shrub(x, y)
        elif r < 0.40:
            fern(x, y, 2)
        elif r < 0.65:
            branch(x, y)
        elif r < 0.75:
            stump(x, y)
        elif r < 0.85:
            rock2(x, y)


def gallows_lights(mp: WildMap, pole) -> None:
    if pole is not None:
        ref, items = vb.LAMPS["The_Witching_Lantern"]
        f = vb.CAT["The_Witching_Lantern"]["size_m"] / ref
        lx, ly, lz, _k, _b = items[0]
        x, y, z = vb.local_to_world(pole, (lx * f, ly * f, lz * f))
    else:
        x, y = 1.75, -11.25
        z = mp.height(x, y) + 1.67
    point_light("lantern", "fo.lt_gate_lantern", x, y, z, 220.0, (1.0, 0.56, 0.24), radius=0.12, volume=0.7, shadow=True,
                cutoff=16.0)
    spot_light("moon_pool", "fo.lt_moon_clearing", (20.88, -28.35, 17.21), (0.75, -14.25, 0.0), 9000.0, (0.62, 0.74, 1.0),
               26.0, 0.9, radius=2.0, volume=0.06, shadow=False)


def gallows_far_trees(mp: WildMap, trunks: Hash) -> list:
    """Trees the seeded plan leaves out, from their own random sequence (the plan's stays as it was): the belt
    north of the mine that the Tin Gallery's keep-clear strip had emptied up the hill (a firebreak from above), and a
    far treeline on the south ridge (Gallows.outside), the horizon beyond the village fields."""
    rng = random.Random(4471)
    out, mine = [], Hash(6.0)   # not in `trunks`: the ground and the scatter see the plan's trees only, as before

    def add(x, y, mix, lod, spacing, shadow):
        if not (trunks.free(x, y, spacing) and mine.free(x, y, spacing)):
            return
        m = rng.choices(mix, [e[1] for e in mix])[0]
        sc = rng.uniform(m[2], m[3])
        if tree_height(m[0], sc) > moon_hmax(x, y):
            return
        mine.add(x, y)
        out.append(dict(name=m[0], x=x, y=y, scale=sc, lod=lod, shadow=shadow, sink=0.2, rot=rng.uniform(0.0, 360.0)))

    x0, _y0, x1, y1 = TR(*FO_KEEP_RECTS[3])
    for _ in range(900):
        x, y = rng.uniform(x0, x1), rng.uniform(31.0, y1)
        add(x, y, FO_MIX["back"], 0.2 if y < 57.5 else 0.08, 2.4 if y < 57.5 else 4.0, y < 45.0)
    for _ in range(2600):
        x, y = rng.uniform(-125.0, 125.0), rng.uniform(-190.0, -105.0)
        if rng.random() < 0.85 * sstep(-105.0, -140.0, y):
            add(x, y, FO_MIX["back"], 0.08, 6.5, False)
    print(f"TREES far: {len(out)} (the belt north of the mine, the south ridge)", flush=True)
    return out


def build_forest(scene, mp: WildMap, a) -> None:
    # the plan's keep-clear eyes are the stills' eyes as the plan was laid out and reviewed (2026-11-12), not the views
    # file's: moving a camera would otherwise reshuffle every tree and scatter piece in the wood; sharpen_near_views
    # clears round the live eyes
    eyes = list(FO_PLAN_EYES)
    trunks = Hash(3.0)
    plan, stumps = ([], []) if (a.no_models or a.no_trees) else gallows_trees(mp, eyes, trunks)
    far = [] if (a.no_models or a.no_trees) else gallows_far_trees(mp, trunks)
    gw = Gallows(mp, trunks)
    mp.hfun = gw.height
    xs = grid_axis([(-260.0, 260.0, 6.0), (-90.0, 90.0, 2.0), (-36.0, 36.0, 0.5)])
    ys = grid_axis([(-200.0, 320.0, 6.0), (-60.0, 100.0, 2.0), (-29.0, 29.0, 0.5)])
    build_grid("HM_Ground", xs, ys, gw.sample, mat=ground_material(FO_GROUND))
    pole = None
    if not a.no_models:
        wm = woods_mats()
        cut_dead_tree_lantern()
        pole = gallows_models(mp, gw, wm)
        for x, y, s in stumps:
            ph_place(mp, "tree_stump_01", x, y, size=s, sink=0.08, lod=0.12)
        place_trees(mp, plan)
        gallows_scatter(mp, gw, trunks, eyes, wm)
        place_trees(mp, far)   # after the scatter: the seeded sequence above stays as it was
    gallows_lights(mp, pole)


# ---------------------------------------------------------------- The Fenwood (scene 'forest_deep')


FD_SINK = (16, 7)                 # the sinkhole (tile): ellipse 1.9 x 1.6 m cut from the ground
FD_OAK = (23.5, 15.5)             # the Hanging Oak's trunk (tile)
FD_MOON_XY = (26.4, 20.68)        # the moon pool spot's foot (tile): trees within 4 m stay under 13 m
FD_MARSH_TILES = {(3, 24), (12, 23), (5, 33), (14, 31)}
FD_SPECIAL_H = {(6, 26): -0.40, (3, 24): -0.30, (14, 31): -0.40, (12, 23): -0.25, (5, 33): -0.38, (10, 30): -0.62}
FD_TRODDEN = (  # (tile points, core half-width m, fade m, snow lying on the line)
    ([(8, 0.6), (8, 3.8), (9.5, 5.5), (12, 9), (15, 9.8), (18.5, 10), (20.5, 10.8), (20.8, 12.8), (21, 13.6)], 0.6, 0.8, 0.12),
    ([(21, 13.6), (20.4, 17), (20.6, 20.6)], 0.6, 0.8, 0.35),
    ([(21, 13.6), (26.5, 13.9), (29.6, 17.6)], 0.6, 0.8, 0.35),
    ([(20.6, 20.6), (26, 20.7), (29.6, 18.6)], 0.6, 0.8, 0.35),
    ([(29.6, 18), (46.4, 18), (47.3, 18), (63.7, 18), (70, 12)], 0.6, 0.8, 0.12),
    ([(40.2, 17.4), (40, 11), (39.2, 8.6), (37, 8.4)], 0.6, 0.8, 0.12),
    ([(39.2, 8.6), (40.5, 6.0)], 0.6, 0.8, 0.12),
    ([(26, 21), (26.4, 23.2), (27.6, 24)], 0.6, 0.8, 0.12),
    ([(28, 24), (44, 24), (44, 32), (28, 32), (28, 24)], 0.3, 0.5, 0.2),
    ([(27, 28), (33.5, 28), (35.5, 28)], 0.6, 0.8, 0.12),
    ([(3, 4), (13, 4), (13, 11), (3, 11), (3, 4)], 0.3, 0.5, 0.2),
    ([(20.5, 20.6), (20.5, 23.4)], 0.6, 0.8, 0.2),
    ([(1, 22), (19.6, 22.1)], 0.3, 0.5, 0.3),
)
FD_FORCED = ((27, 12, "pine_tall", 1.05), (30, 14, "pine_tall", 1.0), (42, 20, "pine_tall", 1.1), (26, 25, "pine_tall", 1.0),
             (14, 5, "pine_tall", 1.0), (37, 23, "pine_tall", 1.0), (31, 18, "pine_tall", 0.85), (16, 23, "pine_tall", 0.95),
             (4, 23, "dead_tree", 1.2), (28, 20, "dead_tree", 1.0), (9, 35, "dead_tree", 0.9), (14, 35, "dead_tree", 1.0),
             (19, 35, "dead_tree", 0.85))
FD_MIX = {
    "general": (("pine_tall", 6.0, 0.85, 1.25), ("pine_short", 1.2, 0.9, 1.3), ("dead_tree", 0.6, 1.0, 1.4)),
    "fen": (("pine_tall", 3.0, 0.70, 1.00), ("pine_short", 1.0, 0.9, 1.3), ("dead_tree", 2.2, 0.8, 1.2)),
    "loop": (("pine_tall", 8.0, 0.85, 1.25), ("pine_short", 1.0, 0.9, 1.3)),
}
FD_GROUND = dict(
    base=dict(role="pine_needles", k=0.75, desat=0.3, rough=0.85, nor="pine_needles"),
    classes=[
        dict(ch=("wdi_c", 0), role="pine_needles", role2=("moss", 0.15), k=0.5, desat=0.35, rough=0.85),  # T
        dict(ch=("wdi_c", 3), role="forest_floor", k=0.7, desat=0.35, rough=0.85),                        # u
        dict(ch=("wdi_c", 1), role="grass_dry", k=0.75, desat=0.35, rough=0.8),                           # g
        dict(ch=("wdi_c", 2), role="mud", k=0.45, desat=0.45, rough=0.6),                                 # d, charcoal-black
        dict(ch=("wdi_d", 3), role="mud_brown", k=0.55, desat=0.35, rough=0.3),                           # wallow, marsh, lip
        dict(ch=("wdi_d", 0), role="river_rocks", k=0.55, desat=0.35, rough=0.2, shape=0.3),              # the fen bed
        dict(ch=("wdi_d", 1), role="rock_face", k=0.7, desat=0.35, rough=0.7),                            # rock ribs, boulders
        dict(ch=("wdi_d", 2), role="mud_track", role2=("snow_trodden", 0.3), k=0.5, desat=0.4, rough=0.35, shape=0.25),
    ],
    snow=True, field=False, wet_rough=0.25)
FD_LYING = {"l": 0.35, "T": 0.3, "g": 0.75, "d": 0.15, "u": 0.4, "marsh": 0.15, "wallow": 0.05, "bed": 0.0, "rock": 0.6}
FD_ADIT = (-22.95, 24.6, 32.5)   # mine_adit's tunnel (world): centre x, opening plane y, the tunnel's back y (7.7 m in)
# the stills' eyes (world) the seeded tree plan and scatter keep clear: those of the reviewed layout (build_forest_deep)
FD_PLAN_EYES = ((-53.25, -54.75), (-4.5, -5.25), (-4.05, -8.55), (24.75, 5.85), (-22.05, 9.15), (-7.95, 10.35), (-14.25, 17.25))


def _bfs(W: int, H: int, seeds, passable=lambda x, y: True) -> list[list[int]]:
    """Chebyshev (8-neighbour) distance in tiles from the seed cells."""
    INF = 999
    d = [[INF] * W for _ in range(H)]
    todo = []
    for x, y in seeds:
        d[y][x] = 0
        todo.append((x, y))
    i = 0
    while i < len(todo):
        x, y = todo[i]
        i += 1
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                nx, ny = x + dx, y + dy
                if 0 <= nx < W and 0 <= ny < H and d[ny][nx] > d[y][x] + 1 and passable(nx, ny):
                    d[ny][nx] = d[y][x] + 1
                    todo.append((nx, ny))
    return d


class Fen:
    """The Fenwood's ground: tile classes and heights, the features the spec lists, the land and marsh outside."""

    def __init__(self, mp: WildMap):
        self.mp = mp
        self.adit_z = None
        W, H = mp.w, mp.h
        G = [[mp.g(x, y) for x in range(W)] for y in range(H)]
        for x in (23, 24):
            for y in (15, 16):
                G[y][x] = "g"
        for x in range(39, 43):
            for y in range(3, 6):
                G[y][x] = "d"
        for x in (36, 37):
            for y in (6, 7):
                G[y][x] = "d"
        G[30][10] = "~"
        G[10][4] = "X"
        self.G = G
        self.ring = _bfs(W, H, [(x, y) for y in range(H) for x in range(W) if mp.walk[y][x]])
        self.dT = _bfs(W, H, [(x, y) for y in range(H) for x in range(W) if mp.mat[y][x] == "T"])
        wet_seeds = [(x, y) for y in range(H) for x in range(W) if mp.mat[y][x] in "~O" or self._margin(x, y)]
        self.dwet = _bfs(W, H, wet_seeds)
        self.cls = [[self._cls(x, y) for x in range(W)] for y in range(H)]
        self.h0 = [[self._h0(x, y) for x in range(W)] for y in range(H)]
        self.den, self.sink, self.oak = T(8.5, 7.5), T(*FD_SINK), T(*FD_OAK)
        self.pit, self.wal, self.door = T(34, 9), T(36, 27.8), T(36.5, 8.0)
        self.spine = (*T(4, 5), *T(4, 10))
        segs = []
        for pts, core, fade, lying in FD_TRODDEN:
            w = [T(*p) for p in pts]
            segs += [(a[0], a[1], b[0], b[1], (core, fade, lying)) for a, b in zip(w, w[1:])]
        self.trodden_segs = segs
        self.trodden = SegHash(segs, 4.0, 1.6)
        self.adit_z = self.height(*T(8, 0.6))   # the ground mine_adit stands on (fen_models takes the same point)

    def _margin(self, x: int, y: int) -> bool:
        return self.mp.mat[y][x] == "u" and ((18 <= x <= 22 and 24 <= y <= 25) or (1 <= x <= 6 and 33 <= y <= 34))

    def _cls(self, x: int, y: int) -> str:
        c = self.G[y][x]
        if (x, y) in FD_MARSH_TILES or self._margin(x, y):
            return "marsh"
        if c == "d" and 34 <= x <= 38 and 26 <= y <= 29:
            return "wallow"
        if c in "~O":
            return "bed"
        if c == "w":
            return "bed" if y >= 24 else "l"
        if c in "XWR":
            return "rock"
        return c if c in "lTgdu" else "l"

    def _h0(self, x: int, y: int) -> float:
        k, c = self.cls[y][x], self.mp.mat[y][x]
        if (x, y) in FD_SPECIAL_H:
            return FD_SPECIAL_H[(x, y)]
        if c == "O":
            return -2.0 if x <= 8 else -2.2
        if k == "bed":
            return -0.62
        if k == "marsh":
            return -0.38
        if k == "T":
            near_water = any(self.mp.at(x + dx, y + dy) in "~O" for dx in (-1, 0, 1) for dy in (-1, 0, 1))
            if near_water:
                return -0.35
            return 0.18 if self.ring[y][x] <= 1 else 0.35
        if k == "g" and 1 <= x <= 22 and 21 <= y <= 23:
            return -0.25 * sstep(20.5, 23.4, y)
        if c == "R":
            return 0.1
        return 0.0

    def _bil(self, x: float, y: float):
        fx, fy = TF(x, y)
        x0, y0 = math.floor(fx), math.floor(fy)
        ax, ay = fx - x0, fy - y0
        W, H = self.mp.w, self.mp.h
        h, wts, dT = 0.0, {}, 0.0
        for ix, iy, w in ((x0, y0, (1 - ax) * (1 - ay)), (x0 + 1, y0, ax * (1 - ay)), (x0, y0 + 1, (1 - ax) * ay),
                          (x0 + 1, y0 + 1, ax * ay)):
            if w <= 0.0:
                continue
            cx, cy = min(max(ix, 0), W - 1), min(max(iy, 0), H - 1)
            h += w * self.h0[cy][cx]
            k = self.cls[cy][cx]
            wts[k] = wts.get(k, 0.0) + w
            dT += w * min(self.dT[cy][cx], 6)
        return h, wts, fx, fy, dT

    def outside(self, x: float, y: float):
        """(height, marsh share, metres beyond the edge) outside the map, or None inside it."""
        parts = []
        dn, ds, dw, de = y - 27.0, -27.0 - y, -36.0 - x, x - 36.0
        if dn > 0:
            scarp = 0.35 + 3.5 * sstep(0.0, 3.0, dn)
            gentle = 0.35 + 2.0 * sstep(0.0, 10.0, dn)
            # the scarp's east end widens up the hill (3 m by the grotto, 9 m from 30 m up): a sharp switch read as a
            # straight seam the length of the hill in the overview
            kw = 3.0 * sstep(6.0, 30.0, dn)
            wx = sstep(-36.0, -33.0, x) * (1.0 - sstep(-13.0 - kw, -10.0 + kw, x))
            t = lerp(gentle, scarp, wx) + 0.22 * max(0.0, min(dn, 60.0) - 3.0) + 0.12 * max(0.0, min(dn, 180.0) - 60.0)
            t += 1.2 * fbm(x, y, 1 / 30.0, 3) * sstep(6.0, 12.0, dn)
            parts.append((dn, t, 1.0))
        if dw > 0:
            k = sstep(-6.0, 0.0, y)
            parts.append((dw, lerp(-0.60 + 0.5 * fbm(x, y, 1 / 6.0, 3), 0.35 + min(12.0, 0.25 * dw), k), k))
        if ds > 0:
            marsh = -0.60 + 0.5 * fbm(x, y, 1 / 6.0, 3)
            if ds > 80.0:
                marsh = lerp(marsh, -1.5, sstep(80.0, 100.0, ds))
            k = sstep(12.0, 18.0, x)
            parts.append((ds, lerp(marsh, 0.3 * fbm(x, y, 0.05, 3), k), k))
        if de > 0:
            parts.append((de, 0.4 * fbm(x, y, 0.04, 3), 1.0))
        if not parts:
            return None
        tot = sum(p[0] for p in parts)
        h = sum(p[0] * p[1] for p in parts) / tot
        land = sum(p[0] * p[2] for p in parts) / tot
        far = max(p[0] for p in parts)
        h += land * sstep(150.0, 230.0, far) * (15.0 + 15.0 * clamp(0.5 + fbm(x, y, 0.01, 3)))
        return h, 1.0 - land, far

    def _features(self, x: float, y: float, fx: float, fy: float) -> float:
        h = 0.35 * sstep(3.5, 0.5, fy) * sstep(5.8, 6.6, fx) * (1.0 - sstep(9.4, 10.2, fx))   # the adit trail's rise
        h -= 0.20 * (1.0 - sstep(0.0, 5.25, math.hypot(x - self.den[0], y - self.den[1])))      # the den hollow
        h += 0.5 * (1.0 - sstep(0.75, 1.5, seg_d(x, y, *self.spine)))                          # the den's rock spine
        h -= 0.55 * (1.0 - sstep(0.95, 2.2, math.hypot(x - self.sink[0], y - self.sink[1])))    # the sinkhole funnel
        h += 0.35 * (1.0 - sstep(3.2, 5.5, math.hypot(x - self.oak[0], y - self.oak[1])))      # the oak's knoll
        r = math.hypot(x - self.pit[0], y - self.pit[1])
        if r < 0.8:
            h -= 0.35 * (1.0 - (r / 0.8) ** 2)                                                   # the charcoal pit
        e = math.hypot((x - self.wal[0]) / 3.3, (y - self.wal[1]) / 2.4)
        if e < 1.3:
            h -= 0.25 * (1.0 - sstep(0.55, 1.0, e))                                              # the boar wallow
            h += 0.08 * fbm(x, y, 2.0, 2) * (1.0 - sstep(0.8, 1.2, e))
        return h

    def _h(self, x, y, h, wts, fx, fy):
        floor = sum(wts.get(k, 0.0) for k in "lgdu") + wts.get("wallow", 0.0)
        h += floor * (0.06 * fbm(x, y, 1 / 1.2, 3) + 0.10 * fbm(x, y, 1 / 8.0, 3))
        h += wts.get("T", 0.0) * 0.15 * fbm(x, y, 1 / 3.0, 3)
        h += (wts.get("bed", 0.0) + wts.get("marsh", 0.0)) * 0.05 * fbm(x, y, 0.5, 2)
        h += self._features(x, y, fx, fy)
        out = self.outside(x, y)
        if out is not None:
            h = lerp(h, out[0], sstep(0.0, 3.0, out[2]))
        return adit_floor(h, x, y, FD_ADIT, self.adit_z), out   # the scarp stays out of mine_adit's tunnel

    def height(self, x: float, y: float) -> float:
        h, wts, fx, fy, _dT = self._bil(x, y)
        return self._h(x, y, h, wts, fx, fy)[0]

    def keep(self, x: float, y: float) -> bool:
        """The ground has one hole: the sinkhole's broken lip (1.9 x 1.6 m)."""
        dx, dy = (x - self.sink[0]) / 0.95, (y - self.sink[1]) / 0.8
        return math.hypot(dx, dy) > 1.0 + 0.12 * fbm(x, y, 2.5, 2)

    def sample(self, x: float, y: float):
        h, wts, fx, fy, dT = self._bil(x, y)
        z, out = self._h(x, y, h, wts, fx, fy)
        w = {k: wts.get(k, 0.0) for k in ("l", "T", "g", "d", "u", "marsh", "wallow", "bed", "rock")}
        if out is not None:
            k = sstep(0.0, 3.0, out[2])
            for c in w:
                w[c] *= 1.0 - k
            w["T"] += k * (1.0 - out[1])
            w["marsh"] += k * out[1]
            if out[2] > 0 and y > 27.0:  # the scarp behind the adit
                rk = k * sstep(-36.0, -33.0, x) * (1.0 - sstep(-13.0, -10.0, x)) * (1.0 - sstep(4.0, 8.0, out[2]))
                w["rock"] += rk
                w["T"] *= 1.0 - rk
        e = math.hypot((x - self.wal[0]) / 3.3, (y - self.wal[1]) / 2.4)
        if e < 1.1:
            m = 1.0 - sstep(0.85, 1.1, e)
            for c in w:
                w[c] *= 1.0 - m
            w["wallow"] += m
        opn = sstep(1.0, 2.0, dT)
        ly = dict(FD_LYING)
        ly["l"] = 0.35 + 0.25 * opn
        ly["T"] = 0.3 + 0.1 * sstep(2.0, 3.0, dT)
        if out is not None:   # the land outside: broad drifts, whiter as it opens (not one small fleck all over)
            ly["T"] += sstep(0.0, 15.0, out[2]) * (0.15 + 0.25 * fbm(x, y, 0.02, 3) + 0.15 * sstep(30.0, 90.0, out[2]))
        dd = math.hypot(x - self.door[0], y - self.door[1])
        ly["d"] = 0.15 * sstep(3.5, 4.5, dd) + 0.1 * (1.0 - sstep(0.5, 1.5, dT))
        ly["marsh"] = 0.15 * sstep(-0.42, -0.34, z)
        tot = sum(w.values()) or 1.0
        lying = sum(w[c] * ly[c] for c in w) / tot
        d, tag = self.trodden.nearest(x, y)
        trod = 0.0
        if tag:
            core, fade, lying_t = tag
            trod = 1.0 - sstep(core, core + fade, d + 0.15 * fbm(x, y, 1.1, 2))
            trod *= 1.0 - min(1.0, w["bed"] + w["rock"])
            lying = lerp(lying, lying_t + 0.25 * sstep(core * 0.6, core + fade, d), trod)
        # the den's scraped apron (round 2): bare earth and litter before its mouth, soft-edged, in the ground's own
        # classes (a decal there read as flat paper cards round the bones)
        da = math.hypot((x - FD_DEN_APRON[0]) / 1.3, (y - FD_DEN_APRON[1]) / 1.0)
        if da < 1.6:
            bare = 1.0 - sstep(0.55, 1.35, da + 0.2 * fbm(x, y, 1.8, 2))
            if bare > 0.0:
                for c in w:
                    w[c] *= 1.0 - bare
                w["u"] += 0.6 * bare
                w["d"] += 0.4 * bare
                lying *= 1.0 - 0.9 * bare
        wet = clamp(0.8 * w["wallow"] + 0.6 * w["marsh"] + 0.3 * trod + 0.15 * w["d"])
        return z, {"wdi_c": (w["T"], w["g"], w["d"], w["u"]), "wdi_d": (w["bed"], w["rock"], trod, w["wallow"] + w["marsh"]),
                   "wdi_s": (clamp(lying), opn, wet, 0.0)}


def moss_specks(origin: Vector, radius: float, rays: int, targets, name: str, mat, side_only: bool = True,
                size: float = 1.0) -> int:
    """Glowing moss specks on the faces of `targets` that a light at `origin` sees within `radius` (rays cast round
    it; a speck where one hits a target's side). A separate mesh, so the look's emissive pass never overwrites it."""
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    scene = bpy.context.scene
    keep = {o.name for o in targets if o is not None}
    mb = MB()
    n = 0
    for _ in range(rays):
        a, e = RNG.uniform(0, 2 * math.pi), math.radians(RNG.uniform(-35, 30))
        d = Vector((math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e)))
        hit, loc, nrm, _i, ob, _m = scene.ray_cast(dg, origin, d, distance=radius)
        if not hit or ob is None or ob.name not in keep or (side_only and nrm.z > 0.5):
            continue
        q = nrm.to_track_quat("Z", "Y")
        M = Matrix.Translation(loc + nrm * 0.004) @ q.to_matrix().to_4x4()
        r = RNG.uniform(0.01, 0.03) * size
        mb.sphere(r, r * RNG.uniform(0.6, 1.0), r * 0.3, 8, 4, M, mat)
        n += 1
    mb.build(name, col="models", smooth=True)
    print(f"MOSS {name}: {n} specks", flush=True)
    return n


def ground_decal(mp, name: str, x: float, y: float, r: float, mat, n: int = 20, rings: int = 3, rough: float = 0.15,
                 lift: float = 0.015, sy: float = 1.0) -> None:
    """A noisy disc hugging the terrain (bare litter patches, scraped earth, a moss pad)."""
    edge = [r * (1.0 + RNG.uniform(-rough, rough)) for _ in range(n)]
    verts, faces = [(x, y, mp.height(x, y) + lift)], []
    for j in range(1, rings + 1):
        for i in range(n):
            a = 2 * math.pi * i / n
            rr = edge[i] * j / rings
            px, py = x + rr * math.cos(a), y + rr * math.sin(a) * sy
            verts.append((px, py, mp.height(px, py) + lift))
    for i in range(n):
        faces.append((0, 1 + i, 1 + (i + 1) % n))
    for j in range(rings - 1):
        a0, a1 = 1 + j * n, 1 + (j + 1) * n
        for i in range(n):
            faces.append((a0 + i, a1 + i, a1 + (i + 1) % n, a0 + (i + 1) % n))
    mb = MB()
    mb.add(verts, faces, mat)
    mb.build(name, col="models", smooth=True)


def fen_mats() -> dict:
    wm = woods_mats()
    wm.update(
        deck=role_mat("W_deck", "wood_rough", k=0.55, rough=0.75, snow=0.45),
        posts=role_mat("W_posts", "wood_rough", k=0.35, rough=0.75, wet_below=-0.25),
        rotten=role_mat("W_rotten", "wood_rough", k=0.4, rough=0.85, snow=0.3),
        rick=role_mat("W_rick", "pine_bark", k=0.8, desat=0.15, snow=0.45),
        stile=role_mat("W_stile", "wood_rough", k=0.6, rough=0.8, snow=0.5),
        soil=role_mat("W_soil", "soil", k=0.7, desat=0.3, rough=0.95),
        peat=role_mat("W_peat", "mud_brown", k=0.17, desat=0.3, rough=0.45),   # darker, duller (read as a tan raft)
        moss=role_mat("W_moss_rim", "moss", k=0.45, desat=0.3, rough=0.9),
        shaft_rock=role_mat("W_shaft_rock", "rock_face", k=0.2, desat=0.3, rough=0.5, cull=True),   # the shaft falls to ink
        shaft_soil=role_mat("W_shaft_soil", "soil", k=0.32, desat=0.25, rough=0.7, cull=True),
        ink=flat_mat("W_ink_earth", INK, 1.0, cull=True),
        bone=bone_mat("W_den_bone"),   # gnawed, dirty off-white, earthed below (a flat 0.62, then 0.44, read as toy props)
        bone_dirt=flat_mat("W_bone_dirt", (0.24, 0.20, 0.15), 0.8),
        dark=flat_mat("W_orbit", (0.055, 0.045, 0.036), 0.9),   # the skull's orbit pits (near black read as cartoon eyes)
        rust=flat_mat("W_rust_iron", (0.20, 0.12, 0.08), 0.6, metal=0.4),
        worn_ash=flat_mat("W_worn_ash", (0.40, 0.32, 0.22), 0.6),
        cup=flat_mat("W_clay_cup", (0.28, 0.16, 0.10), 0.7),
        resin=flat_mat("W_resin", (0.35, 0.18, 0.04), 0.15, transmission=0.2),
        pale=flat_mat("W_pale_wood", (0.55, 0.45, 0.30), 0.6),
        gash=flat_mat("W_gash", (0.50, 0.42, 0.30), 0.7),
        ember=flat_mat("W_ember", (0.15, 0.05, 0.02), 0.8, emit=(1.0, 0.33, 0.07), emit_strength=6.0),
        hole=flat_mat("W_smoke_hole", (0.1, 0.03, 0.01), 0.8, emit=(1.0, 0.36, 0.08), emit_strength=9.0),
        straw=flat_mat("W_reed_straw", (0.36, 0.30, 0.20), 0.7),
        reed_grey=flat_mat("W_reed_grey", (0.22, 0.19, 0.14), 0.7),
        cattail=flat_mat("W_cattail", (0.12, 0.07, 0.04), 0.8),
        bubble=flat_mat("W_bog_bubble", (0.03, 0.025, 0.02), 0.08),
    )
    return wm


def boardwalk(mp, wm: dict) -> None:
    """The fen boardwalk: the head on sleepers on the bank, the main run and the spur on stringers and posts over the
    water, worn (missing, sagging and snapped planks), and the rotted gap through the reeds."""
    mb = MB()
    deck, posts = wm["deck"], wm["posts"]

    def plank(cx, cy, z, length, along_x, width=0.22, broken=False):
        if RNG.random() < 0.04 and not broken:
            if not along_x:   # a gap in the main run: the plank rotted and sagged a hand's breadth, dark and wet (the
                # empty slot showed the mere-rot's glow as a neon strip, review 2); no draws, so the seeded sequence stays
                mb.box(length * 0.94, width * 0.96, 0.04, M4(cx + 0.01, cy, z - 0.1, rz=91.0, rx=3.0), posts)
            return
        tilt = RNG.uniform(2.0, 4.0) * RNG.choice((-1, 1)) if RNG.random() < 0.10 else 0.0
        ln = length + RNG.uniform(-0.05, 0.05)
        rz = 0.0 if along_x else 90.0
        mb.box(ln, width, 0.05, M4(cx, cy, z - 0.025 - (0.03 if tilt else 0.0), rz=rz + RNG.uniform(-0.8, 0.8), rx=tilt), deck)

    # the head: x[-6.0, -3.0], y[-9.0, -4.5], deck top +0.12, planks E-W on three half-log sleepers N-S
    for sx in (-5.6, -4.5, -3.4):
        mb.tube([(sx, -8.85, 0.0), (sx, -4.65, 0.0)], 0.09, 8, posts)
    y = -8.85 + 0.125
    while y < -4.65:
        plank(-4.5, y, 0.12, 2.7, True)
        y += 0.25
    # the main run: x[-24.0, -3.0], y[-15.0, -12.0], deck top -0.05, planks N-S
    for sy in (-12.55, -14.45):
        mb.box(20.7, 0.12, 0.22, M4(-13.5, sy, -0.05 - 0.05 - 0.11), posts)
    x = -23.85 + 0.12
    while x < -3.15:
        snapped = any(abs(x - T(tx, 0)[0]) < 0.13 for tx in (13, 18))
        if snapped:
            mb.box(1.3, 0.22, 0.05, M4(x, -12.9, -0.12, rz=90.0, rx=-8.0), deck)
            mb.box(1.3, 0.22, 0.05, M4(x, -14.4, -0.07, rz=90.0), deck)
            # a waterlogged board under the break, ink-dark: through the gap the snapped half opens beside it the
            # fen still saw the mere-rot's glow on the water as a neon strip (review 2)
            mb.box(1.5, 1.7, 0.04, M4(x - 0.55, -13.65, -0.43, rz=4.0), wm["ink"])
        else:
            plank(x, -13.5, -0.05, 2.7, False)
        x += 0.245
    xp = -23.25
    while xp < -3.1:
        for sy in (-12.55, -14.45):
            mb.cyl(0.08, 0.08, 0.97 - 0.21, 10, M4(xp, sy, -0.97), posts)
        xp += 1.5
    # the spur: x[-22.5, -18.0], y[-18.0, -15.0], planks E-W, stringers N-S, a cross beam at the south end
    for sx in (-22.0, -20.25, -18.5):
        mb.box(0.12, 2.7, 0.22, M4(sx, -16.5, -0.21), posts)
        for sy in (-15.4, -16.5, -17.6):
            mb.cyl(0.08, 0.08, 0.76, 10, M4(sx, sy, -0.97), posts)
    mb.box(4.2, 0.12, 0.22, M4(-20.25, -17.85, -0.21), posts)
    y = -17.85 + 0.125
    while y < -15.1:
        plank(-20.25, y, -0.05, 4.2, True)
        y += 0.25
    # the rotted gap through the reeds (x[-6, -3], y[-12, -9]): loose planks askew, post stubs
    for i, (px, py, z, rz, rx) in enumerate(((-5.0, -9.8, -0.42, 80.0, 0.0), (-3.9, -10.9, -0.43, 100.0, 3.0),
                                             (-4.6, -11.2, -0.25, 70.0, 12.0), (-3.6, -9.6, -0.28, 95.0, -9.0))):
        mb.box(2.7, 0.22, 0.05, M4(px, py, z, rz=rz, rx=rx), wm["rotten"])
    for px, py, h in ((-5.6, -9.6, 0.2), (-3.4, -10.4, 0.5), (-5.6, -11.5, 0.35)):
        mb.cyl(0.08, 0.07, 0.4 + h, 10, M4(px, py, -0.4 - 0.4 + 0.0 + 0.0), posts)
    mb.build("WP_boardwalk", col="world")


def reed_clump(mb: MB, x: float, y: float, z: float, n: int, hr, radius: float, wm: dict, cattail: float = 0.15) -> None:
    """n tapered, curved reed stems (20% snapped over, some with a cattail head) standing in a clump."""
    for _ in range(n):
        a, d = RNG.uniform(0, 2 * math.pi), radius * math.sqrt(RNG.random())
        px, py = x + d * math.cos(a), y + d * math.sin(a)
        h = RNG.uniform(*hr)
        w0 = RNG.uniform(0.012, 0.020)
        bend_a = RNG.uniform(0, 2 * math.pi)
        bend = RNG.uniform(0.05, 0.25) * h
        snapped = RNG.random() < 0.2
        face = RNG.uniform(0, math.pi)
        verts = []
        for k in range(5):
            t = k / 4.0
            zz = h * t
            off = bend * t * t
            if snapped and t > 0.55:
                off += (t - 0.55) * h * 1.2
                zz = h * 0.55 + (t - 0.55) * h * 0.3
            cx, cy = px + off * math.cos(bend_a), py + off * math.sin(bend_a)
            hw = w0 * (1.0 - t) / 2
            verts.append((cx - hw * math.cos(face), cy - hw * math.sin(face), z + zz))
            verts.append((cx + hw * math.cos(face), cy + hw * math.sin(face), z + zz))
        faces = [(2 * k, 2 * k + 1, 2 * k + 3, 2 * k + 2) for k in range(3)] + [(6, 7, 8)]
        mb.add(verts, faces, wm["straw"] if RNG.random() < 0.6 else wm["reed_grey"])
        if not snapped and RNG.random() < cattail:
            top = verts[6]
            mb.cyl(0.0125, 0.0125, RNG.uniform(0.12, 0.16), 6, M4(top[0], top[1], top[2] - 0.2), wm["cattail"])


def fen_reeds(mp, fen: Fen, wm: dict) -> None:
    """The reed bed hide spot, the fen margins, water-edge fringes and the outside marsh (one mesh)."""
    mb = MB()
    x, y = T(6, 26)
    reed_clump(mb, x, y, -0.45, 240, (1.5, 2.1), 1.0, wm, cattail=0.125)
    x, y = T(3, 24)
    reed_clump(mb, x, y, mp.height(x, y), 20, (0.9, 1.5), 0.4, wm)
    for ty in range(mp.h):
        for tx in range(mp.w):
            if fen._margin(tx, ty) and not (20 <= tx <= 21 and 24 <= ty <= 25 and RNG.random() < 0.3):
                x, y = T(tx, ty)
                reed_clump(mb, x, y, mp.height(x, y) - 0.02, 45, (1.0, 1.7), 0.7, wm)
    edges, taken = [], Hash(3.0)
    for ty in range(mp.h):
        for tx in range(mp.w):
            if mp.at(tx, ty) != "~":
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                if mp.at(tx + dx, ty + dy) in "gT" and 0 <= tx + dx < mp.w and 0 <= ty + dy < mp.h:
                    x, y = T(tx + 0.4 * dx, ty + 0.4 * dy)
                    if taken.free(x, y, 3.0) and not (-24.2 < x < -2.8 and -15.2 < y < -11.8) and \
                            not (-22.7 < x < -17.8 and -18.2 < y < -14.8):
                        taken.add(x, y)
                        edges.append((x, y))
    for x, y in edges[:30]:
        reed_clump(mb, x, y, max(mp.height(x, y), -0.47), RNG.randint(12, 25), (0.8, 1.4), 0.35, wm)
    count = tries = 0
    while count < 60 and tries < 3000:
        tries += 1
        x, y = RNG.uniform(-86.0, 16.0), RNG.uniform(-77.0, -3.75)
        if abs(x) < 36.0 and abs(y) < 27.0:
            continue
        z = mp.height(x, y)
        if not -0.62 < z < -0.25:
            continue
        reed_clump(mb, x, y, z, RNG.randint(30, 60), (0.8, 1.6), 0.8, wm)
        count += 1
    mb.build("WP_reeds", col="world", shadow=True)


def shaft_mat(name: str, role: str, k: float, z0: float, z1: float, desat: float = 0.25, rough: float = 0.7):
    """A role's diffuse on a shaft wall, falling to ink from z0 down to z1 (world z): the dark of a hole starts a
    hand's breadth under its lip whatever light reaches the wall (round 2: the sinkhole's moonlit upper wall read as a
    flat brown board from the glade). Culled from behind, as the walls face the hole's axis."""
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    b = vb._principled(m)
    g = vb.G(m.node_tree)
    col = g.desat(g.scale(box_tex(g, role, "diff"), k), desat)
    _x, _y, z = sep3(g, g.position())
    col = g.mix(g.smooth(z, z0, z1), col, INK)
    g.link(col, b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough
    bp = _new(g.n, "ShaderNodeBump")
    bp.inputs["Strength"].default_value = 0.35
    bp.inputs["Distance"].default_value = 0.02
    g.link(g.gray(col), bp.inputs["Height"])
    g.link(bp.outputs["Normal"], b.inputs["Normal"])
    _cull(m)
    _MATS[name] = m
    return m


def sink_skirt(mp, fen: Fen, inner, lipr, n: int) -> None:
    """The sinkhole's lip: a skirt of the ground itself (HM_Ground's material, the terrain's own classes from
    Fen.sample) from the shaft's top ring out past the grid's cut, which drops every cell touching the hole (up to
    0.5 m beyond it, 1.75 x its radius); a narrow lip of bare, crumbling earth at the hole, the snow back by 1.4 x, so
    the dark reads against white. Round 2: the old
    1.25-1.55 x collar of flat soil read as a brown board and left gaps at the far rim, where the fog under the
    ground showed through as flat white quads."""
    cx, cy = fen.sink
    gnd = bpy.data.objects.get("HM_Ground")
    dg = bpy.context.evaluated_depsgraph_get()
    fs = (1.0, 1.16, 1.34, 1.55, 1.8, 2.05, 2.3)
    lift = (0.0, -0.03, 0.022, 0.018, 0.014, 0.01, 0.006)
    verts, rows, ff = [], [], []
    for j, f in enumerate(fs):
        row = []
        for i in range(n):
            a = 2 * math.pi * i / n
            if j == 0:
                px, py, pz = inner[i]
            else:
                k = 1.05 * f * lerp(lipr[i], 1.0, min(1.0, (f - 1.0) / 0.8))
                px, py = cx + k * 0.95 * math.cos(a), cy + k * 0.8 * math.sin(a)
                pz = mp.height(px, py)
                if gnd is not None:   # never under the grid's own surface between its points
                    ok, loc, _nn, _ii = gnd.ray_cast(Vector((px, py, pz + 5.0)), Vector((0.0, 0.0, -1.0)), depsgraph=dg)
                    if ok:
                        pz = max(pz, loc.z)
                pz += lift[j]
            row.append(len(verts))
            verts.append((px, py, pz))
            ff.append(f)
        rows.append(row)
    faces = [(rows[j][i], rows[j + 1][i], rows[j + 1][(i + 1) % n], rows[j][(i + 1) % n])
             for j in range(len(fs) - 1) for i in range(n)]
    cols = {"wdi_c": [], "wdi_d": [], "wdi_s": []}
    for (px, py, _pz), f in zip(verts, ff):
        _z, at = fen.sample(px, py)
        b = 1.0 - sstep(1.1, 1.42, f + 0.1 * fbm(px, py, 1.5, 2))   # a narrow broken lip: snow close to the dark
        c, d, s = at["wdi_c"], at["wdi_d"], at["wdi_s"]
        cols["wdi_c"] += [c[0] * (1 - b), c[1] * (1 - b), c[2] * (1 - b) + 0.35 * b, c[3] * (1 - b) + 0.65 * b]
        cols["wdi_d"] += [d[0] * (1 - b), d[1] * (1 - b), d[2] * (1 - b), d[3] * (1 - b)]
        cols["wdi_s"] += [s[0] * (1 - b), s[1], min(1.0, s[2] + 0.25 * b), s[3]]
    me = bpy.data.meshes.new("WP_sink_lip")
    me.from_pydata(verts, [], faces)
    me.update()
    for an, data in cols.items():
        set_attr4(me, an, data)
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    vb.uv_world(me)
    if gnd is not None and gnd.data.materials:
        me.materials.append(gnd.data.materials[0])
    ob = bpy.data.objects.new("WP_sink_lip", me)
    COL["world"].objects.link(ob)


def sinkhole(mp, fen: Fen, wm: dict, models: bool = True) -> None:
    """fd.sinkhole: a shaft 6 m down from the cut in the ground, soil and roots at its top, rim rocks, three rotten
    shaft timbers across and into it; an ink-dark rubble floor, unlit. Round 2: the walls fall to ink just under the
    lip and the lip is a skirt of the ground itself (sink_skirt)."""
    cx, cy = fen.sink
    n, rings = 24, 12
    mb = MB()
    lipr = [1.0 + 0.12 * fbm(cx + math.cos(2 * math.pi * i / n), cy + math.sin(2 * math.pi * i / n), 2.5, 2) for i in range(n)]
    top = [mp.height(cx + 1.05 * lipr[i] * 0.95 * math.cos(2 * math.pi * i / n), cy + 1.05 * lipr[i] * 0.8 * math.sin(2 * math.pi * i / n))
           for i in range(n)]
    ring = []
    for j in range(rings + 1):
        t = j / rings
        row = []
        for i in range(n):
            a = 2 * math.pi * i / n
            k = lerp(1.05, 1.3 / 0.95, t) * lipr[i]
            z = top[i] - 0.04 - 5.96 * t   # the lip edge just under the ground, the skirt crumbling down to it
            row.append((cx + k * 0.95 * math.cos(a) * (1 + 0.04 * n3(i, j, 0, 1.0)), cy + k * 0.8 * math.sin(a), z))
        ring.append(row)
    wall = shaft_mat("W_shaft", "soil", 0.32, max(top) - 0.04, max(top) - 0.3)   # the glade sees only the top 0.4 m
    for j in range(rings):
        for i in range(n):
            i2 = (i + 1) % n
            mb.add([ring[j][i], ring[j][i2], ring[j + 1][i2], ring[j + 1][i]], [(0, 1, 2, 3)], wall)  # faces the axis
    sink_skirt(mp, fen, ring[0], lipr, n)
    zb = ring[-1][0][2]
    mb.cyl(1.3, 0.2, 0.8, 16, M4(cx, cy, zb - 0.1), wm["ink"])
    # the timbers: one along the east lip, one fallen into the far (north) side, one down into the shaft, so the shaft
    # opens between them (across the middle they bridged it into a flat disc with planks on it); dark wet wood, eight
    # sided, hardly any snow (snow on six flat sides read as planks)
    timber = role_mat("W_sink_timber", "wood_rough", k=0.36, rough=0.85, snow=0.08)
    for name, p0, p1, sag in (("A", (cx + 0.85, cy - 1.3, top[0] + 0.05), (cx + 0.85, cy + 1.3, top[0] + 0.05), 0.15),
                              ("B", (cx - 1.1, cy + 0.55, top[0] - 0.45), (cx + 1.1, cy + 0.55, top[0] - 0.60), 0.0),
                              ("C", (cx + 0.9, cy + 0.6, top[0] + 0.1), (cx + 0.9 - 1.0, cy + 0.6 - 0.6, top[0] - 1.55), 0.0)):
        a, b = Vector(p0), Vector(p1)
        mid = (a + b) / 2 - Vector((0.0, 0.0, sag))
        mb.tube([a, mid, b], 0.11, 8, timber)
    mb.build("WP_sinkhole", col="world")
    if not models:
        return
    for i in range(6):
        a = 2 * math.pi * i / 6 + 0.3
        ph_place(mp, "rock_moss_set_02", cx + 1.25 * math.cos(a), cy + 1.05 * math.sin(a), piece=RNG.randint(1, ph_count("rock_moss_set_02")),
                 size=RNG.uniform(0.4, 0.8), lod=0.3, sink_frac=0.5)
    for a in (100.0, 160.0, 200.0):   # dark wet roots, no roof snow (pale and snowed, they read as planks on a board)
        r = math.radians(a)
        ph_place(mp, "single_root", cx + 1.1 * math.cos(r), cy + 0.9 * math.sin(r), rot=a + 90.0, size=RNG.uniform(1.2, 1.8),
                 lod=0.12, sink=0.0, tilt=25.0, toward=a + 180.0, col="forest", grade="bramble")


FD_DEN_MOUTH = ((-27.746, 10.655), (0.65, -0.76))  # the den's mouth on the big jamb rock's flat SE face: point, outward
FD_DEN_APRON = (-27.6, 10.15)                      # the scraped earth before it, round the bones (Fen.sample)
# round 3: the mouth sits 0.1 m west of round 2's, wholly on the big rock's flat SE face (round 2's ran past the rock's
# east corner onto the seam with rock #5 and read as a black egg). rw, rh: the arch's half width and height over the
# point (0.22 m above the ground); w0: how far its hidden collar reaches behind the rock round the cut; rim_d: how deep
# the lip runs before the hollow narrows back to `back` metres (w1 half wide, h1 high at its end, bent `bend` across);
# wall and floor: (albedo, depth where they start to fall to ink, depth where they are ink); fade: the floor fading in
# over the threshold; wall_look: the wall's (desaturation, bump); lump: how far the walls bulge inward from the lip
# back (by a noise); lip: the moss light spilling in over the lip (watts, depth, across, height); bones_in: (depth,
# across, length, heading, radius); ribs_in: (depth, across, heading)
FD_DEN = dict(rw=0.37, rh=0.42, w0=0.03, rim_d=0.07, rim_grow=-0.02, back=0.95, bend=-0.20, w1=0.26, h1=0.30,
              rings=8, segs=24, wall=(0.52, 0.12, 0.50), floor=(0.62, 0.10, 0.50), fade=(0.0, 0.30),
              wall_look=(0.2, 1.0), lump=0.07,
              lip=(5.0, 0.06, 0.20, 0.48),
              bones_in=[(-0.14, -0.6, 0.28, 95.0, 0.014), (0.06, -0.34, 0.24, 140.0, 0.012), (0.3, -0.14, 0.2, 75.0, 0.011),
                        (0.52, -0.04, 0.16, 120.0, 0.01)],
              ribs_in=[(-0.02, -0.5, 60.0), (0.18, -0.22, 200.0)])


def den_cavity_mat(name: str, role: str, k: float, c, n, d0: float, d1: float, desat: float = 0.25, fade=None,
                   tint=None, rough: float = 1.0, bump: float = 0.45) -> bpy.types.Material:
    """A role's diffuse, box-projected on the den's hollow, falling to ink with depth behind the mouth (along -n from
    c, d0 to d1 metres): the dark of the den starts just inside its lip whatever light reaches it. `fade` = (s0, s1)
    fades the floor in over its first stretch, so the scraped earth outside runs in under it with no seam."""
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    b = vb._principled(m)
    g = vb.G(m.node_tree)
    col = g.desat(g.scale(box_tex(g, role, "diff"), k), desat)
    if tint is not None:
        col = mul_rgb(g, col, tint)
    sub = _new(g.n, "ShaderNodeVectorMath", operation="SUBTRACT")
    g.link(g.position(), sub.inputs[0])
    sub.inputs[1].default_value = (c.x, c.y, c.z)
    dot = _new(g.n, "ShaderNodeVectorMath", operation="DOT_PRODUCT")
    g.link(sub.outputs["Vector"], dot.inputs[0])
    dot.inputs[1].default_value = (-n.x, -n.y, 0.0)
    depth = dot.outputs["Value"]
    col = g.mix(g.smooth(depth, d0, d1), col, INK)
    g.link(col, b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough
    bp = _new(g.n, "ShaderNodeBump")
    bp.inputs["Strength"].default_value = bump
    bp.inputs["Distance"].default_value = 0.02
    g.link(g.gray(col), bp.inputs["Height"])
    g.link(bp.outputs["Normal"], b.inputs["Normal"])
    if fade is not None:
        g.link(g.smooth(depth, fade[0], fade[1]), b.inputs["Alpha"])
    _MATS[name] = m
    return m


def bone_mat(name: str = "W_den_bone") -> bpy.types.Material:
    """Gnawed bone: a dirty off-white (0.46, 0.42, 0.35) mottled finely, with the earth it lay in on its down-facing
    half (a clean 0.62 white, then a flat 0.44, read as toy props under the teal light)."""
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    b = vb._principled(m)
    g = vb.G(m.node_tree)
    geo = _new(g.n, "ShaderNodeNewGeometry")
    _nx, _ny, nz = sep3(g, geo.outputs["Normal"])
    dirt = g.math("SUBTRACT", 1.0, g.smooth(nz, -0.35, 0.45))
    mottle = g.smooth(g.noise(g.position(), 38.0, 4.0), 0.45, 0.7)
    fac = g.math("MINIMUM", 1.0, g.math("ADD", g.math("MULTIPLY", dirt, 0.85), g.math("MULTIPLY", mottle, 0.3)))
    g.link(g.mix(fac, (0.46, 0.42, 0.35), (0.16, 0.12, 0.085)), b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.75
    _MATS[name] = m
    return m


def den_mouth(rock, specks, wm: dict, others=()) -> None:
    """The den's mouth, cut into the foot of its big jamb rock (rock_moss_set_01 #1) where it faces the moss light and
    the bones, with a hollow behind it (round 3: an ink body bulging out of the face read as a black egg on the rock;
    round 2: a dome behind the jambs read as a dark slab).
    1. The front ring: round a noisy arch (narrower toward the top, its foot under the ground, so the ground is the
       threshold), how deep the den rocks' faces stand just round it (rays along -n, the rocks still whole).
    2. The hollow: a short collar from behind the rock's face to just inside the arch (the lip), then rings back to a
       rounded end over a floor 2 cm above the ground, which climbs the den spine's rock rib inside; faces turned in.
       Its walls and floor fall to ink with depth and the floor fades in over the threshold, so the scraped earth runs
       in under the arch; bones lead in from the gnawed pile; the moss light spills in over the lip (a faint teal light
       linked to the hollow and the bones in it alone, so nothing outside the mouth changes).
    3. In every den rock, the faces inside the arch's prism from in front back to the lip go and the cut's edge goes
       onto the arch (the rock's own noisy edge is the whole outline), then every face with a corner inside the hollow
       goes (rock #5 stands half inside the big rock there; by their centres alone, the faces across the hollow's wall
       stood in the mouth as shards). The moss specks the light seeded inside go too. No draws: the seeded sequence
       after the den stays as it was."""
    P = FD_DEN
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    (px, py), (nx, ny) = FD_DEN_MOUTH
    n = Vector((nx, ny, 0.0)).normalized()
    gnd = bpy.data.objects.get("HM_Ground")

    def ground(x: float, y: float) -> float:
        hit = gnd.ray_cast(Vector((x, y, 50.0)), Vector((0.0, 0.0, -1.0)), depsgraph=dg) if gnd is not None else (False,)
        return hit[1].z if hit[0] else 0.0

    gz = ground(px, py)
    c = Vector((px, py, gz + 0.22))   # on the rock's face; depths below are along -n from here
    u, v = Vector((-n.y, n.x, 0.0)), Vector((0.0, 0.0, 1.0))
    rw, rh = P["rw"], P["rh"]
    rocks = [rock] + [o for o in others if o is not None]

    def kth(th: float) -> float:
        return 1.0 + 0.16 * noise.noise(Vector((2.1 * math.cos(th), 2.1 * math.sin(th), 3.7)))

    def arch_f(qu: float, qv: float) -> float:
        """Under 1 inside the arch, in the plane across the mouth."""
        k = kth(math.atan2(qv / rh, qu / rw))
        a = 1.0 - 0.22 * max(0.0, qv / rh)          # narrower toward the top: an arch, not an ellipse
        return (qu / (rw * k * a)) ** 2 + (qv / (rh * k)) ** 2

    def to_arch(q):
        """How far to scale q across the mouth (keeping its depth) to put it on the arch, or None."""
        qu, qv = q.dot(u), q.dot(v)
        if math.hypot(qu, qv) < 1e-4:
            return None
        k = kth(math.atan2(qv / rh, qu / rw))

        def f(lam):
            a = 1.0 - 0.22 * max(0.0, lam * qv / rh)
            return (lam * qu / (rw * k * a)) ** 2 + (lam * qv / (rh * k)) ** 2 - 1.0
        lo, hi = 0.2, 3.0
        if f(lo) > 0 or f(hi) < 0:
            return None
        for _ in range(30):
            mid = (lo + hi) / 2
            lo, hi = (mid, hi) if f(mid) < 0 else (lo, mid)
        return (lo + hi) / 2

    def at(s: float, du: float, z: float) -> Vector:
        return Vector((c.x, c.y, 0.0)) - n * s + u * du + Vector((0.0, 0.0, z))

    def gat(s: float, du: float) -> float:
        w = at(s, du, 0.0)
        return ground(w.x, w.y) + 0.02

    def face_s(du: float, z: float):
        """Depth (along -n from c) where a ray from in front at (du, z) first meets a den rock, or None."""
        o = at(-1.5, du, z)
        best = None
        for r in rocks:
            inv = r.matrix_world.inverted()
            okr, lr, _nn, _fi = r.ray_cast(inv @ o, (inv.to_3x3() @ -n).normalized())
            if okr:
                s = (r.matrix_world @ lr - o).dot(-n) - 1.5
                best = s if best is None else min(best, s)
        return best

    def outline(th: float, grow: float):
        """The arch (du, dz from c) at angle th, grown outward by `grow` metres."""
        for _ in range(2):
            k = kth(th)
            qv = rh * k * math.sin(th)
            arch = 1.0 - 0.22 * max(0.0, qv / rh)
            qu = rw * k * arch * math.cos(th)
            th2 = math.atan2(qv / rh, qu / rw)
            th = th2 if abs(th2 - th) < 0.5 else th
        ln = math.hypot(qu, qv)
        return qu * (ln + grow) / ln, qv * (ln + grow) / ln

    # 1. the front ring, right corner over the top to the left corner: (depth, du, z), behind the face both at the
    # arch and just outside it, so the collar hides behind the cut's edge
    M, F, K = P["segs"], 6, P["rings"]
    thr = math.asin(max(-1.0, min(1.0, (gz + 0.02 - c.z) / rh)))   # where the arch meets the floor
    ths = [thr + (math.pi - 2 * thr) * j / M for j in range(M + 1)]
    front = []
    for th in ths:
        du0, dz0 = outline(th, 0.0)
        s0 = face_s(du0, max(c.z + dz0, gat(0.1, du0) + 0.01))
        grow = P["w0"]
        for _ in range(8):
            du, dz = outline(th, grow)
            s = face_s(du, max(c.z + dz, gat(0.1, du) + 0.01))
            if s is not None and s < 0.45:
                break
            grow += 0.03
        ss = [x for x in (s, s0) if x is not None and x < 0.45]
        front.append([max(ss) if ss else 0.1, du, c.z + dz])

    def s_front(q) -> float:
        th = math.atan2(q.dot(v) / rh, q.dot(u) / rw)
        th = th + 2 * math.pi if th < -math.pi / 2 else th
        x = min(float(M), max(0.0, (th - thr) / (math.pi - 2 * thr) * M))
        j = min(M - 1, int(x))
        return front[j][0] + (front[j + 1][0] - front[j][0]) * (x - j)

    # 2. the hollow
    def rel(pts):
        """(s, du, z) -> (s, du, height above the line between the two floor corners at their own depth)"""
        zr, zlft = gat(pts[0][0], pts[0][1]), gat(pts[-1][0], pts[-1][1])
        return [(s_, du_, 0.0 if j in (0, M) else max(0.03, z_ - (zr + (zlft - zr) * j / M)))
                for j, (s_, du_, z_) in enumerate(pts)]

    def ring_at(pts):
        zr, zlft = gat(pts[0][0], pts[0][1]), gat(pts[-1][0], pts[-1][1])
        ring = []
        for j, (s_, du_, hh) in enumerate(pts):
            zb = zr + (zlft - zr) * j / M
            ring.append(at(s_, du_, max(zb + hh, gat(s_, du_) + (0.0 if j in (0, M) else 0.03))))
        L, R = ring[-1], ring[0]
        row = [L]
        for i in range(1, F):
            w = L.lerp(R, i / F)
            row.append(Vector((w.x, w.y, ground(w.x, w.y) + 0.02)))
        row.append(R)
        return ring + row[1:-1], row

    ring0 = rel([(f[0] + 0.015, f[1], f[2]) for f in front])
    rim = rel([(f[0] + P["rim_d"], *(lambda d: (d[0], c.z + d[1]))(outline(th, P["rim_grow"]))) for f, th in zip(front, ths)])
    s_back = P["back"]
    rings, floor_rows = [], []
    for pts in (ring0, rim):
        ring, row = ring_at(pts)
        rings.append(ring)
        floor_rows.append(row)
    for kk in range(1, K + 1):
        tt = (kk / K) ** 0.85
        uc = P["bend"] * tt
        pts = []
        for j, (s0, du0, h0) in enumerate(rim):
            phi = math.pi * j / M
            pts.append((s0 + (s_back - s0) * tt, (1 - tt) * du0 + tt * (uc + P["w1"] * math.cos(phi)),
                        (1 - tt) * h0 + tt * P["h1"] * math.sin(phi) ** 0.8))
        ring, row = ring_at(pts)
        rings.append(ring)
        floor_rows.append(row)
    for kk in range(1, len(rings)):   # rock, not a smooth bore: from the lip back the walls bulge inward by a noise,
        ring = rings[kk]              # growing in (inward only: pushed out, a wall came through the big rock's thin
        mid = ((ring[0] + ring[M]) / 2).lerp(ring[M // 2], 0.35)   # east flank; smooth, the left wall read as a plate)
        t = min(1.0, kk / 2.5)
        for j in range(1, M):
            p = ring[j]
            d = p - mid
            if d.length < 1e-4:
                continue
            k = min(0.0, noise.noise(p * 7.0 + Vector((3.1, 7.7, 1.3))) + 0.5 * noise.noise(p * 15.0 + Vector((9.2, 0.4, 5.5))))
            q = p + d.normalized() * (P["lump"] * 1.4 * t * k)
            q.z = max(q.z, ground(q.x, q.y) + 0.03)
            ring[j] = q
    last = rings[-1]
    cen = sum(last, Vector()) / len(last)
    cap = [cen.lerp(p, 0.55) - n * 0.10 for p in last]
    cap = [Vector((p.x, p.y, max(p.z, ground(p.x, p.y) + 0.03))) for p in cap]
    rings.append(cap)
    vs, fs, fl = [], [], []
    nl = len(rings[0])
    for ring in rings:
        vs.extend(ring)
    for kk in range(len(rings) - 1):
        r0, r1 = kk * nl, (kk + 1) * nl
        for i in range(nl):
            j = (i + 1) % nl
            fs.append((r0 + i, r0 + j, r1 + j, r1 + i))
            fl.append(i >= M)   # floor faces (between the corners, along the ground)
    ti = len(vs)
    tip = cen - n * 0.16
    vs.append(Vector((tip.x, tip.y, max(tip.z, ground(tip.x, tip.y) + 0.05))))
    r0 = (len(rings) - 1) * nl
    for i in range(nl):
        fs.append((r0 + i, r0 + (i + 1) % nl, ti))
        fl.append(False)
    # the floor's lip: a strip from ring 0's floor out over the threshold, faded in by the material
    row = floor_rows[0]
    mid = (row[0] + row[-1]) / 2
    b0 = len(vs)
    for p in row:
        q = mid.lerp(p, 0.85) + n * (0.12 + (p - c).dot(-n))
        vs.append(Vector((q.x, q.y, ground(q.x, q.y) + 0.02)))
    idx_row = [M] + list(range(M + 1, nl)) + [0]   # ring 0's floor row: left corner, the floor points, right corner
    for i in range(len(row) - 1):
        fs.append((b0 + i, b0 + i + 1, idx_row[i + 1], idx_row[i]))
        fl.append(True)
    # faces turned in, toward the hollow's axis
    f0 = fs[nl * 2 + M // 2]
    p0, p1, p2 = vs[f0[0]], vs[f0[1]], vs[f0[2]]
    axis = sum(rings[2], Vector()) / nl
    flip = (p1 - p0).cross(p2 - p0).dot(axis - (p0 + p1 + p2) / 3) < 0
    fz = fs[-1]
    q0, q1, q2 = vs[fz[0]], vs[fz[1]], vs[fz[2]]
    flip_lip = (q1 - q0).cross(q2 - q0).z < 0   # the lip strip faces up
    wall = den_cavity_mat("W_den_wall", "rock_face", P["wall"][0], c, n, P["wall"][1], P["wall"][2],
                          desat=P["wall_look"][0], tint=(1.0, 0.92, 0.82), bump=P["wall_look"][1])
    floor = den_cavity_mat("W_den_floor", "soil", P["floor"][0], c, n, P["floor"][1], P["floor"][2], desat=0.3,
                           fade=P["fade"])
    mb = MB()
    nlip = len(row) - 1
    for i, (f, isf) in enumerate(zip(fs, fl)):
        lip = i >= len(fs) - nlip
        mb.add([tuple(vs[q]) for q in f], [tuple(range(len(f)))], floor if isf else wall, flip=flip_lip if lip else flip)
    hol = mb.build("WP_den_hollow", col="models", smooth=True, shadow=False)
    bpy.context.view_layer.update()

    # 3. the rocks
    def in_prism(w) -> bool:
        q = w - c
        d = -q.dot(n)
        return -1.0 < d < s_front(q) + P["rim_d"] + 0.03 and arch_f(q.dot(u), q.dot(v)) < 1.0

    def in_hollow(w) -> bool:
        q = w - c
        if -q.dot(n) < s_front(q) + 0.012:
            return False
        okc, cl, nrm, _fi = hol.closest_point_on_mesh(w)
        return bool(okc) and nrm.dot(w - cl) > 0.0

    cut, snapped = {}, 0
    for r in rocks:
        mw = r.matrix_world
        inv = mw.inverted()
        bm = bmesh.new()
        bm.from_mesh(r.data)
        dead = [f for f in bm.faces if in_prism(mw @ f.calc_center_median())]
        bmesh.ops.delete(bm, geom=dead, context="FACES")
        edge = set()
        for bv in bm.verts:   # the cut follows the rock's triangles (a row of spikes): its edge goes onto the arch
            if not bv.is_boundary:
                continue
            w = mw @ bv.co
            q = w - c
            d = -q.dot(n)
            if w.z < gz - 0.05 or not -1.0 < d < s_front(q) + P["rim_d"] + 0.15:
                continue
            lam = to_arch(q)
            if lam is None or not 0.75 < lam < 1.35:
                continue
            bv.co = inv @ (c + lam * (u * q.dot(u) + v * q.dot(v)) + n * q.dot(n))
            edge.add(bv)
            snapped += 1
        ins = {bv: in_hollow(mw @ bv.co) for bv in bm.verts if bv not in edge}
        kill = [f for f in bm.faces if any(ins.get(bv, False) for bv in f.verts) or in_hollow(mw @ f.calc_center_median())]
        bmesh.ops.delete(bm, geom=kill, context="FACES")
        cut[r.name] = (len(dead), len(kill))
        if dead or kill:
            r.data = r.data.copy()   # its own mesh (the masters and the other pieces share theirs)
            bm.to_mesh(r.data)
            r.data.update()
        bm.free()
    bpy.context.view_layer.update()
    # bones leading in: from the gnawed pile at the lower left over the threshold into the dark
    bb = MB()
    for s, du, ln, rz, r in P["bones_in"]:
        w = at(s, du, 0.0)
        zg = ground(w.x, w.y) + (0.02 if s > s_front(w - c) else 0.0)
        mb4 = M4(w.x, w.y, zg + r * 0.25, rz=rz, ry=90.0)
        bb.cyl(r, r * 0.85, ln, 8, mb4, wm["bone"], z0=-ln / 2)
        for e, kk in ((-ln / 2, 1.3), (ln / 2, 1.15)):
            bb.sphere(r * kk, r * kk * 0.85, r * kk * 0.85, 8, 5, mb4 @ M4(z=e), wm["bone_dirt"])
    for s, du, rz in P["ribs_in"]:
        w = at(s, du, 0.0)
        zg = ground(w.x, w.y) + (0.02 if s > s_front(w - c) else 0.0)
        pts = [Vector((w.x + 0.11 * math.cos(math.radians(rz + t * 75)), w.y + 0.11 * math.sin(math.radians(rz + t * 75)),
                       zg + 0.006 + 0.018 * math.sin(math.pi * t))) for t in (0.0, 0.33, 0.66, 1.0)]
        bb.tube(pts, 0.006, 5, wm["bone"])
    bones_in = bb.build("WP_den_bones_in", col="models", smooth=True)
    # the moss light spilling in over the lip: a faint teal light on the inner wall and the floor just inside, dying
    # off toward the back. Light-linked to the hollow and the bones in it alone; its kind is no look kind, so the look
    # leaves it as built
    watts, s_l, u_l, h_l = P["lip"]
    w = at(s_l, u_l, 0.0)
    lt = point_light("den_lip", "fd.lt_den_lip", w.x, w.y, ground(w.x, w.y) + h_l, watts, (0.12, 0.86, 0.74), radius=0.06,
                     volume=0.0, shadow=False, cutoff=1.4)
    recv = bpy.data.collections.new("HM_DenLipRecv")
    recv.use_fake_user = True
    recv.objects.link(hol)
    recv.objects.link(bones_in)
    lt.light_linking.receiver_collection = recv
    gone = 0
    if specks is not None:   # no glowing moss floating in the mouth
        bm = bmesh.new()
        bm.from_mesh(specks.data)
        kill = [f for f in bm.faces if in_prism(specks.matrix_world @ f.calc_center_median()) or
                in_hollow(specks.matrix_world @ f.calc_center_median())]
        gone = len(kill)
        bmesh.ops.delete(bm, geom=kill, context="FACES")
        bm.to_mesh(specks.data)
        bm.free()
    print(f"DEN mouth at ({c.x:.2f}, {c.y:.2f}, {c.z:.2f}): rock faces cut (mouth, hollow) {cut}, {snapped} edge points "
          f"snapped, hollow {len(fs)} faces, {gone} speck faces gone", flush=True)


def den_pieces(mp, wm: dict) -> None:
    """The den's gnawed bones with the sheep skull (round 2: its mouth is cut into the jamb rock by den_mouth, and the
    scraped earth before it is in the ground's own classes, Fen.sample: a dome behind the jambs read as a dark card
    and a scrape decal as flat paper cards round the bones). Round 3: the knobs are slight swellings, the skull sits
    deeper and its orbits are shallow dark pits (balls on rods and black eye dots read as a toy skeleton)."""
    for _ in range(20):   # the draws the scrape decal took: the seeded sequence after it stays as it was
        RNG.random()
    bx, by = T(4.75, 10.9)
    mb = MB()
    for _ in range(6):
        a, d = RNG.uniform(0, 2 * math.pi), 0.55 * math.sqrt(RNG.random())
        px, py = bx + d * math.cos(a), by + d * math.sin(a)
        ln, r = RNG.uniform(0.22, 0.38), RNG.uniform(0.0125, 0.0175)
        M = M4(px, py, mp.height(px, py) + r * 0.15, rz=RNG.uniform(0, 180), ry=90.0)   # half buried (was r 0.6 up)
        mb.cyl(r, r, ln, 8, M, wm["bone"], z0=-ln / 2)
        for e in (-ln / 2, ln / 2):
            mb.sphere(r * 1.25, r * 1.15, r * 0.9, 8, 5, M @ M4(z=e), wm["bone_dirt"])
    for _ in range(4):
        a, d = RNG.uniform(0, 2 * math.pi), 0.5 * math.sqrt(RNG.random())
        px, py = bx + d * math.cos(a), by + d * math.sin(a)
        ln, ang0 = RNG.uniform(0.15, 0.25), RNG.uniform(0, 360)
        z0 = mp.height(px, py) + 0.01
        pts = [(px + 0.12 * math.cos(math.radians(ang0 + t * 70)), py + 0.12 * math.sin(math.radians(ang0 + t * 70)),
                z0 + 0.02 * math.sin(math.pi * t)) for t in (0.0, 0.33, 0.66, 1.0)]
        mb.tube(pts, 0.006, 5, wm["bone"])
    sx, sy = bx - 0.2, by + 0.15
    sz = mp.height(sx, sy) - 0.06   # the skull well sunk in the earth
    M = M4(sx, sy, sz, rz=35.0, ry=8.0)
    mb.sphere(0.075, 0.12, 0.07, 12, 7, M @ M4(0.0, 0.0, 0.05), wm["bone"])
    mb.box(0.07, 0.12, 0.06, M @ M4(0.0, -0.13, 0.04, rx=8.0), wm["bone"])
    for sxs in (-0.045, 0.045):
        mb.sphere(0.017, 0.015, 0.012, 8, 5, M @ M4(sxs * 1.08, -0.054, 0.082), wm["dark"])   # a pit just breaking the bone
        mb.tube([M @ Vector((sxs, 0.03, 0.10)), M @ Vector((sxs * 2.2, 0.06, 0.12)), M @ Vector((sxs * 2.4, 0.02, 0.07))],
                0.012, 6, wm["bone_dirt"])
    mb.build("WP_bones", col="models", smooth=True)


def bog(mp, wm: dict) -> None:
    """fd.bog: glossy black peat on the east pool's west lip, a low hump whose ragged rim runs out under the water,
    tussocks of moss round its west side, bubbles and two rotten sticks (a smooth ellipse with a clean pale rim of
    moss slabs sat on the water like a placeholder disc)."""
    cx, cy = T(14, 31)
    state = RNG.getstate()
    mb = MB()
    n = 40
    edge = [1.0 + 0.24 * fbm(cx + 1.3 * math.cos(2 * math.pi * i / n), cy + 1.3 * math.sin(2 * math.pi * i / n), 1.6, 3) +
            0.10 * fbm(cx + 3.0 * math.cos(2 * math.pi * i / n), cy + 3.0 * math.sin(2 * math.pi * i / n), 4.0, 2) for i in range(n)]
    verts = [(cx, cy, -0.395)]
    for t, z in ((0.55, -0.405), (0.85, -0.43), (1.12, -0.49)):
        for i in range(n):
            a = 2 * math.pi * i / n
            verts.append((cx + 1.2 * edge[i] * t * math.cos(a), cy + 0.95 * edge[i] * t * math.sin(a), z))
    faces = [(0, 1 + i, 1 + (i + 1) % n) for i in range(n)]
    for j in range(2):
        r0, r1 = 1 + j * n, 1 + (j + 1) * n
        faces += [(r0 + i, r1 + i, r1 + (i + 1) % n, r0 + (i + 1) % n) for i in range(n)]
    mb.add(verts, faces, wm["peat"])
    tussock = role_mat("W_bog_tussock", "moss", k=0.3, desat=0.4, rough=0.9, snow=0.25)
    for i in range(14):
        a = math.radians(80.0 + 14.0 * i + RNG.uniform(-6.0, 6.0))
        k = edge[int(round(a / (2 * math.pi) * n)) % n] * RNG.uniform(0.9, 1.05)
        px, py = cx + 1.2 * k * math.cos(a), cy + 0.95 * k * math.sin(a)
        s = RNG.uniform(0.12, 0.24)
        mb.sphere(s, s * RNG.uniform(0.6, 0.9), s * 0.45, 9, 5, M4(px, py, -0.45, rz=RNG.uniform(0, 360)), tussock, lumpy=0.3)
    for _ in range(7):
        a, d = RNG.uniform(0, 2 * math.pi), 0.8 * math.sqrt(RNG.random())
        r = RNG.uniform(0.01, 0.04)
        mb.sphere(r, r, r * 0.6, 8, 4, M4(cx + d * math.cos(a), cy + 0.8 * d * math.sin(a), -0.40), wm["bubble"])
    for _ in range(2):
        a = RNG.uniform(0, 360)
        mb.cyl(0.02, 0.015, 0.7, 6, M4(cx + RNG.uniform(-0.6, 0.6), cy + RNG.uniform(-0.5, 0.5), -0.45, rz=a, ry=70.0), wm["rotten"])
    mb.build("WP_bog", col="models", smooth=True)
    rb = MB()   # reeds on its east and south rims break the outline the fen still saw as a raft (review 2)
    for a, n in ((15.0, 24), (300.0, 18), (245.0, 14)):
        r = math.radians(a)
        reed_clump(rb, cx + 1.3 * math.cos(r), cy + 1.05 * math.sin(r), -0.46, n, (0.8, 1.4), 0.3, wm)
    rb.build("WP_bog_reeds", col="world", shadow=True)
    RNG.setstate(state)
    for _ in range(7 * 3 + 2 * 3):   # the draws the first bog took: the seeded sequence after it stays as it was
        RNG.random()


def charcoal_pit(mp, wm: dict) -> None:
    """fd.charcoal_pit: the bowl filled with charcoal fines and grey ash, embers half buried in its north-east third."""
    cx, cy = T(34, 9)
    m = bpy.data.materials.new("W_charcoal")
    b = vb._principled(m)
    g = vb.G(m.node_tree)
    pos = g.position()
    ash = g.smooth(g.noise(pos, 3.0, 4.0), 0.55, 0.62)
    g.link(g.mix(ash, (0.013, 0.012, 0.011), (0.28, 0.27, 0.26)), b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.85
    verts, faces, n, rings = [(cx, cy, mp.height(cx, cy) + 0.03)], [], 20, 4
    for j in range(1, rings + 1):
        for i in range(n):
            a = 2 * math.pi * i / n
            r = 1.05 * j / rings
            px, py = cx + r * math.cos(a), cy + r * math.sin(a)
            verts.append((px, py, mp.height(px, py) + 0.03))
    faces += [(0, 1 + i, 1 + (i + 1) % n) for i in range(n)]
    for j in range(rings - 1):
        a0, a1 = 1 + j * n, 1 + (j + 1) * n
        faces += [(a0 + i, a1 + i, a1 + (i + 1) % n, a0 + (i + 1) % n) for i in range(n)]
    mb = MB()
    mb.add(verts, faces, m)
    for _ in range(8):
        a, d = math.radians(RNG.uniform(10, 80)), RNG.uniform(0.2, 0.7)
        px, py = cx + d * math.cos(a), cy + d * math.sin(a)
        r = RNG.uniform(0.02, 0.04)
        mb.sphere(r, r * 0.8, r * 0.6, 8, 4, M4(px, py, mp.height(px, py) + 0.03), wm["ember"], lumpy=0.3)
    mb.build("WP_charcoal_pit", col="models", smooth=True)


def cordwood_rick(mp, x: float, y: float, axis: float, wm: dict, name: str) -> None:
    """1.8 m long, 1.0 m high, 1.2 m deep: billets in six courses between two pairs of end stakes, 14-sided, of
    mixed girth, each pushed in or out a little and turned on its axis, the ends fresh-cut, darker or weathered grey
    (eight-sided prisms flush in a grid with one end-grain read as a placeholder)."""
    a = math.radians(axis)
    gz = mp.height(x, y) - 0.02
    state = RNG.getstate()
    ends = (wm["split"], wm["endgrain"], role_mat("W_endgrain_grey", "timber_rough", k=1.15, desat=0.6, rough=0.85, snow=0.3))
    mb = MB()
    for side in (-0.95, 0.95):
        for depth in (-0.55, 0.55):
            px = x + side * math.cos(a) - depth * math.sin(a)
            py = y + side * math.sin(a) + depth * math.cos(a)
            mb.cyl(0.05, 0.045, 1.3, 8, M4(px, py, gz - 0.05), wm["stile"])
    for course in range(6):
        along = -0.86
        while along < 0.82:
            r = RNG.uniform(0.05, 0.10)
            along += r
            push = RNG.uniform(-0.07, 0.07)
            px = x + along * math.cos(a) - push * math.sin(a)
            py = y + along * math.sin(a) + push * math.cos(a)
            M = M4(px, py, gz + r + course * 0.165 + RNG.uniform(-0.015, 0.015), rz=axis + 90.0, rx=RNG.uniform(0.0, 360.0))
            log_mesh(mb, M, RNG.uniform(1.12, 1.3), r, wm["rick"], RNG.choice(ends), n=14)
            along += r + RNG.uniform(0.0, 0.015)
    mb.build(name, col="models", smooth=True)
    RNG.setstate(state)
    for _ in range(54 * 11):   # the draws the eight-sided rick took: the seeded sequence after it stays as it was
        RNG.random()


def stump_axe(stump, wm: dict) -> None:
    """The axe bitten into fd.stump_0's cut face, its haft rising 35 degrees toward the south-west."""
    lo, hi = wbox(stump)
    cx, cy = (lo.x + hi.x) / 2 + 0.2, (lo.y + hi.y) / 2
    p = ray_down(stump, cx, cy) or Vector((cx, cy, hi.z))
    mb = MB()
    mb.box(0.18, 0.03, 0.09, M4(p.x, p.y, p.z + 0.005, rz=45.0), wm["rust"])
    d = Vector((math.cos(math.radians(225.0)) * math.sin(math.radians(35.0)),
                math.sin(math.radians(225.0)) * math.sin(math.radians(35.0)), math.cos(math.radians(35.0))))
    mb.tube([p + Vector((0.0, 0.0, 0.04)), p + Vector((0.0, 0.0, 0.04)) + d * 0.75], 0.0175, 8, wm["worn_ash"])
    mb.build("WP_axe", col="models", smooth=True)


def stile(mp, wm: dict) -> None:
    """fd.wood: a N-S fence line at x 35.55 with a stile: split posts, rails and a step plank on each side."""
    x = 35.55
    mb = MB()
    for py in (1.55, 0.15, -1.65, -3.05):
        mb.box(0.16, 0.16, 1.65, M4(x, py, mp.height(x, py) - 0.4), wm["stile"], base=True)
    for (y0, y1) in ((1.55, 0.15), (-1.65, -3.05)):
        for h in (0.50, 0.95):
            mb.box(0.09, abs(y1 - y0), 0.14, M4(x, (y0 + y1) / 2, mp.height(x, (y0 + y1) / 2) + h), wm["stile"])
    mb.box(0.09, 1.8, 0.14, M4(x, -0.75, mp.height(x, -0.75) + 0.62), wm["stile"])
    for side in (-0.45, 0.45):
        for py in (-0.25, -1.25):
            mb.box(0.08, 0.08, 0.34, M4(x + side, py, mp.height(x + side, py) - 0.02), wm["stile"], base=True)
        mb.box(0.24, 1.0, 0.05, M4(x + side, -0.75, mp.height(x + side, -0.75) + 0.32), wm["stile"])
    mb.build("WP_stile", col="models")


def blaze(mp, x: float, y: float, facing: float, wm: dict, r: float = 0.3) -> None:
    """A resin blaze on a pine trunk: stripped pale wood, herringbone cuts, amber runs, a clay cup below."""
    a = math.radians(facing)
    px, py = x + r * math.cos(a), y + r * math.sin(a)
    gz = mp.height(x, y)
    mb = MB()
    mb.box(0.30, 0.02, 0.45, M4(px, py, gz + 0.6, rz=facing - 90.0), wm["pale"], base=True)
    for k in range(6):
        z = gz + 0.68 + 0.06 * k
        for sgn in (-1, 1):
            mb.box(0.14, 0.012, 0.012, M4(px, py, z, rz=facing - 90.0) @ M4(sgn * 0.06, 0.012, 0.0, ry=sgn * 30.0), wm["check"])
    for _ in range(5):
        u = RNG.uniform(-0.1, 0.1)
        mb.sphere(0.012, 0.012, RNG.uniform(0.03, 0.06), 6, 4,
                  M4(px - u * math.sin(a) + 0.02 * math.cos(a), py + u * math.cos(a) + 0.02 * math.sin(a), gz + RNG.uniform(0.45, 0.6)),
                  wm["resin"])
    mb.cyl(0.04, 0.035, 0.06, 10, M4(px + 0.06 * math.cos(a), py + 0.06 * math.sin(a), gz + 0.48), wm["cup"])
    mb.build("WP_resin_blaze", col="models", smooth=True)


def smoke_column(name: str, pts, radii, density: float, fall: float = 5.0) -> None:
    mb = MB()
    mat = volume_mat(f"{name}_vol", (0.40, 0.40, 0.43), density, z0=pts[0][2], fall=fall, nscale=1.2, nbase=0.35,
                     ngain=1.3, anisotropy=0.2)
    mb.tube(pts, radii, 12, mat)
    volume_object(name, mb, col="world")


# the grotto's two baked lanterns (cave_pool_rock's own frame, catalog scale): one on the cabin post, one in the niche
FD_GROTTO_LAMPS = ((-1.80, -0.64, 2.18), (1.47, 2.62, 1.46))


def soot_at(name: str, centres, r: float, amount: float = 0.9) -> None:
    """Blank a Meshy model's painted lamp glass and wick within r metres of the given points (the model's own frame):
    base colour x (1 - amount x near x (warm or very bright)). darken_lanterns' warm-and-bright mask leaves mid-amber
    glass and a white wick that still read lit up close (the grotto's lanterns, review 2)."""
    o = vb.source(name)
    for slot in o.material_slots:
        mat = slot.material
        if mat is None or mat.node_tree is None or "WDI_soot" in mat.node_tree.nodes:
            continue
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        bsdf = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None or not bsdf.inputs["Base Color"].is_linked:
            continue
        g = vb.G(mat.node_tree)
        src = bsdf.inputs["Base Color"].links[0].from_socket
        tco = _new(nodes, "ShaderNodeTexCoord")
        near = None
        for c in centres:
            dist = _new(nodes, "ShaderNodeVectorMath", operation="DISTANCE")
            links.new(tco.outputs["Object"], dist.inputs[0])
            dist.inputs[1].default_value = tuple(c)
            m = g.math("SUBTRACT", 1.0, g.smooth(dist.outputs["Value"], r * 0.6, r))
            near = m if near is None else g.math("MAXIMUM", near, m)
        r_, _g, b_ = sep3(g, src)
        lamp = g.math("MAXIMUM", g.smooth(g.math("SUBTRACT", r_, b_), 0.03, 0.15), g.smooth(g.gray(src), 0.2, 0.4))
        k = g.math("SUBTRACT", 1.0, g.math("MULTIPLY", g.math("MULTIPLY", near, lamp), amount))
        links.new(scale_by(g, src, k), bsdf.inputs["Base Color"])
        _new(nodes, "ShaderNodeValue").name = "WDI_soot"


def still_water_mat(name: str = "W_still_water") -> bpy.types.Material:
    """Black still water: a near-mirror with the faintest ripple (the grotto's pool)."""
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    b = vb._principled(m)
    g = vb.G(m.node_tree)
    b.inputs["Base Color"].default_value = (0.004, 0.009, 0.011, 1.0)
    b.inputs["Roughness"].default_value = 0.05
    bp = _new(g.n, "ShaderNodeBump")
    bp.inputs["Strength"].default_value = 0.04
    g.link(g.noise(g.position(), 6.0, 2.0), bp.inputs["Height"])
    g.link(bp.outputs["Normal"], b.inputs["Normal"])
    _MATS[name] = m
    return m


def grotto_pool(mp, grotto):
    """A still water skin on the grotto's pool (cave_pool_rock's flat pool face, found by casting down on the model
    alone) and five stones along its back shore; returns the water's z (None when no pool face is found). Review 2:
    the pool read as a flat matte black plate, its back edge meeting the sand in one clean line."""
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    lo, hi = wbox(grotto)
    mw = grotto.matrix_world
    inv = mw.inverted()
    d = (inv.to_3x3() @ Vector((0.0, 0.0, -1.0))).normalized()
    st, hits = 0.1, {}
    for j in range(int((hi.y - lo.y) / st) + 1):
        for i in range(int((hi.x - lo.x) / st) + 1):
            x, y = round(lo.x + i * st, 3), round(lo.y + j * st, 3)
            ok, loc, nrm, _i = grotto.ray_cast(inv @ Vector((x, y, hi.z + 1.0)), d, depsgraph=dg)
            if ok:
                hits[(x, y)] = ((mw @ loc).z, (mw.to_3x3() @ nrm).normalized().z)
    low = lo.z + 0.4 * (hi.z - lo.z)
    count: dict = {}
    for z, nz in hits.values():
        if nz > 0.97 and z < low:
            count[round(z, 2)] = count.get(round(z, 2), 0) + 1
    if not count:
        return None
    zp = max(count, key=count.get)
    cells = sorted(k for k, (z, nz) in hits.items() if abs(z - zp) < 0.025 and nz > 0.97)
    vid, verts, faces = {}, [], []

    def vtx(x, y):
        k = (round(x, 3), round(y, 3))
        if k not in vid:
            vid[k] = len(verts)
            verts.append((x, y, zp + 0.012))
        return vid[k]

    h = st / 2
    for x, y in cells:
        faces.append((vtx(x - h, y - h), vtx(x + h, y - h), vtx(x + h, y + h), vtx(x - h, y + h)))
    mb = MB()
    mb.add(verts, faces, still_water_mat())
    mb.build("WP_grotto_water", col="forest")
    xs = sorted({x for x, _y in cells})
    x0, x1 = xs[int(0.22 * (len(xs) - 1))], xs[int(0.78 * (len(xs) - 1))]
    for k, (t, size, rot) in enumerate(((0.0, 0.42, 20.0), (0.27, 0.3, 140.0), (0.5, 0.5, 75.0), (0.71, 0.34, 250.0),
                                        (1.0, 0.44, 310.0))):
        x = min(xs, key=lambda q: abs(q - lerp(x0, x1, t)))
        y = max(yy for xx, yy in cells if xx == x)
        ph_place(mp, "rock_moss_set_02", x, y - 0.05, rot=rot, size=size, piece="#4", lod=0.3, z=zp, sink_frac=0.45,
                 col="forest")   # dark mossy stones (pale rock_07 read as white chips under the grotto's moonbeam)
    print(f"GROTTO pool at z {zp:.2f}: {len(cells)} cells of water skin, 5 stones on its back shore", flush=True)
    return zp


def fen_models(mp: WildMap, fen: Fen, wm: dict, eyes) -> dict:
    """Every placement of the Fenwood spec except the trees. Returns the objects the lights and trees need."""
    got = {}
    for name in ("hanging_oak", "mine_adit", "Frostbound_Waymarker", "cave_pool_rock"):   # the grotto's baked lantern too
        darken_lanterns(name)
    soot_at("cave_pool_rock", FD_GROTTO_LAMPS, 0.3, 0.95)   # its two lanterns still read lit up close (review 2)
    cut_oak_noose()
    n = cut_faces(vb.source("charcoal_kiln"), lambda x, y, z: z > 2.85)
    print(f"CUT charcoal_kiln smoke puff: {n} faces", flush=True)
    # the modelled wisp: pale triangles at z 4.38..5.04 leaning east off the stovepipe (pipe top about 4.38 at
    # x -1.16, y 0.23); about 950 faces, the pipe below stays
    n = cut_faces(vb.source("mother_moll_hut"), lambda x, y, z: z > 4.38 and -1.5 <= x <= 0.35 and -0.2 <= y <= 0.55)
    print(f"CUT mother_moll_hut smoke wisp: {n} faces", flush=True)
    # the oak and the grotto stand in HM_Forest so the look lays no roof snow on them: their textures carry their own
    # snow, and the look's lit the oak's big flat root triangles as white shards and covered the grotto's dark pool
    got["oak"] = mplace(mp, "hanging_oak", 0.90, 2.37, rot=-35.0, size=9.0, sink=0.12, col="forest")
    got["hut"] = vb.building(mp, "mother_moll_hut", dict(x=39, y=3, w=4, h=3, role="mollHut"), "S", 6.3, lod=0.7, sink=0.1)
    got["kiln"] = mplace(mp, "charcoal_kiln", *T(36.5, 6.5), facing="S", size=4.4, sink=0.08, lod=0.8)
    got["lantern"] = mplace(mp, "drowned_lantern", *T(10, 30.25), facing="N", size=3.0, z=-0.57)
    # the adit's apron meets the trail's head; its rock mound merges into the scarp behind (base set explicitly)
    got["adit"] = mplace(mp, "mine_adit", *T(8, -1.82), facing="S", size=8.75, z=mp.height(*T(8, 0.6)), sink=0.1, lod=0.7,
                         lamps=False)
    # the rock grotto (Meshy cave_pool_rock: snow-capped walls north and west round a dark pool): in the pines north of
    # the sinkhole glade, its open rim facing the glade; it covers T tiles only (rows -3..2), clear of every walkable tile
    # full mesh (was lod 0.7: the near rim rocks read faceted and smeared from the grotto still, review 2)
    got["grotto"] = mplace(mp, "cave_pool_rock", *T(16, -0.5), facing="S", size=9.75, z=mp.height(*T(16, 2.5)), sink=0.15,
                           lod=None, lamps=False, col="forest")
    got["grotto_z"] = grotto_pool(mp, got["grotto"])
    mplace(mp, "Frostbound_Waymarker", *T(43, 17), facing="S", size=2.5, sink=0.05, lod=0.3, lamps=False)
    mplace(mp, "hollow_log", *T(32.5, 16), facing="E", size=3.0, sink=0.08, lod=0.8)
    got["log"] = mplace(mp, "hollow_log", *T(12, 23.05), rot=-12.0, size=2.6, sink=0.1, lod=0.8)
    # rock: the adit's flanks and scarp, the east bank, the den
    for tx, ty, rot, slug, piece, size, sink, lod in (
            (4.6, -1.3, 10.0, "rock_face_01", None, 5.4, 0.6, 0.6), (11.4, -1.3, -10.0, "rock_face_01", None, 5.4, 0.6, 0.6),
            (1.8, -1.0, 0.0, "rock_face_02", None, 2.7, 0.4, 0.6), (13.0, -0.8, -20.0, "rock_face_02", None, 3.2, 0.4, 0.6),
            (11.3, 1.5, 30.0, "rock_moss_set_01", "#5", None, 0.3, 0.6), (12.2, 2.5, 110.0, "rock_moss_set_02", "#1", None, 0.35, 0.4),
            (12.4, 1.2, 250.0, "rock_moss_set_02", "#3", None, 0.3, 0.4), (4.0, 5.5, 90.0, "rock_face_02", None, 2.7, 0.45, 0.6),
            (3.95, 8.6, 270.0, "rock_face_02", None, 2.6, 0.45, 0.6), (11, 5, 20.0, "rock_moss_set_01", "#2", None, 0.3, 0.7),
            (15, 9, 30.0, "rock_moss_set_02", "#1", None, 0.35, 0.6), (20, 11, 75.0, "rock_moss_set_01", "#4", None, 0.3, 0.7),
            (21, 18, 140.0, "rock_moss_set_01", "#2", None, 0.3, 0.7), (20, 19.1, 200.0, "rock_moss_set_02", "#2", None, 0.3, 0.6),
            (5, 33, 140.0, "rock_moss_set_02", "#1", None, 0.45, 0.6)):
        ph_place(mp, slug, *T(tx, ty), rot=rot, piece=piece, size=size, sink=sink, lod=lod)
    den = []
    for tx, ty, rot, piece, size, sink, tilt in ((4.05, 7.1, 80.0, "#3", None, 0.35, 0.0), (4.0, 9.85, 45.0, "#1", None, 0.5, 10.0),
                                                 (4.85, 9.75, 120.0, "#5", 1.2, 0.25, 0.0), (3.85, 10.75, 300.0, "#6", 1.2, 0.25, 0.0)):
        den.append(ph_place(mp, "rock_moss_set_01", *T(tx, ty), rot=rot, piece=piece, size=size, sink=sink, lod=0.7,
                            tilt=tilt, toward=-45.0))
    den_pieces(mp, wm)
    x, y = T(5, 11)
    # small specks of mixed size in teal #2EC4B6, glowing faintly (round near-white discs read as polka dots); the
    # draws are replayed as the reviewed build took them (220 rays, 25 hits), as the den's pieces round the light
    # changed in round 2 and a different hit count would reshuffle everything seeded after (the trees among them)
    state = RNG.getstate()
    moss_specks(Vector((x, y, mp.height(x, y) + 0.5)), 2.2, 220, den, "WP_den_moss",
                flat_mat("W_moss_speck", (0.02, 0.10, 0.09), 0.9, emit=(0.027, 0.55, 0.47), emit_strength=0.22), size=0.55)
    RNG.setstate(state)
    for _ in range(2 * 220 + 2 * 25):
        RNG.random()
    den_mouth(den[1], bpy.data.objects.get("WP_den_moss"), wm, others=(den[2], den[3]))
    # bracken, litter, toadstools
    for tx, ty, rot, n in ((7, 5, 40.0, 3), (27, 14, 200.0, 3), (33, 17, 110.0, 3), (26, 24, 15.0, 3), (3, 24, 300.0, 2)):
        x, y = T(tx, ty)
        for i in range(n):
            ph_place(mp, "fern_02", x + RNG.uniform(-0.4, 0.4), y + RNG.uniform(-0.4, 0.4), rot=rot + 120 * i,
                     piece=RNG.randint(1, ph_count("fern_02")), scale=RNG.uniform(2.0, 2.4) if n == 3 else 1.8,
                     grade="dead_fern", col="forest", sink=0.03)
    for i in range(2):
        x, y = T(15, 9)
        ph_place(mp, "fern_02", x + 0.9 * math.cos(2.0 + i), y + 0.9 * math.sin(2.0 + i), piece=i + 1, scale=1.6,
                 grade="dead_fern", col="forest", sink=0.03)
    for i in range(2):  # the oak's oversized baked crate and pickaxe, half hidden in bracken
        ph_place(mp, "fern_02", 0.90 + RNG.uniform(-1.6, 0.4), 2.37 - RNG.uniform(1.0, 2.2), piece=RNG.randint(1, ph_count("fern_02")),
                 scale=2.2, grade="dead_fern", col="forest", sink=0.03)
    for tx, ty, r, role in ((12, 8, 0.6, "pine_needles"), (26, 18, 0.7, "leaf_litter"), (38, 19, 0.6, "pine_needles")):
        x, y = T(tx, ty)
        # a ragged patch lying in the snow, not a slab on it (a hard round rim 1.5 cm proud)
        ground_decal(mp, f"WP_litter_{tx}_{ty}", x, y, r, role_mat(f"W_litter_{role}", role, k=0.6, desat=0.3, rough=0.85),
                     rough=0.4, lift=0.004)
        ph_place(mp, "single_root", x + 0.2, y - 0.1, rot=RNG.uniform(0, 360), scale=0.7, lod=0.12, sink=0.05)
        ph_place(mp, "dry_branches_medium_01", x - 0.3, y + 0.2, piece=RNG.randint(1, ph_count("dry_branches_medium_01")),
                 lod=0.4, size=RNG.uniform(0.8, 1.2), sink=0.03)
    for tx, ty, n, rot in ((9, 10, 9, 0.0), (21, 17, 7, 60.0), (37, 28, 8, 200.0)):
        toadstools(mp, *T(tx, ty), rot, n=n, ring=(0.4, 0.6), pad=0.6, cap=(0.22, 0.13, 0.07), stem=(0.45, 0.42, 0.36),
                   frost=0.2, kicked=(n == 9), cap_size=(0.025, 0.07), stem_h=(0.03, 0.09))
    lo, hi = wbox(got["log"])
    for k in range(6):  # along the fallen log's top
        t = (k + 0.5) / 6
        px, py = lo.x + (hi.x - lo.x) * t, (lo.y + hi.y) / 2 + RNG.uniform(-0.1, 0.1)
        top = ray_down(got["log"], px, py)
        if top is not None:
            toadstools(mp, px, py, 0.0, n=1, pad=0.0, cap=(0.22, 0.13, 0.07), stem=(0.45, 0.42, 0.36), frost=0.2, kicked=False,
                       cap_size=(0.025, 0.05), stem_h=(0.03, 0.06), z=top.z - 0.02, name="WP_log_toadstool")
    # the clearing's work: the pit, the stump and axe, the ricks, the spade, the stile
    charcoal_pit(mp, wm)
    st = ph_place(mp, "tree_stump_01", *T(37, 10), rot=200.0, size=1.35, sink=0.06, lod=0.4)
    stump_axe(st, wm)
    cordwood_rick(mp, *T(41, 10), 0.0, wm, "WP_rick_0")
    cordwood_rick(mp, *T(42, 8), 90.0, wm, "WP_rick_1")
    bx, by = T(42, 8)
    bucksaw(bx, by + 0.62, mp.height(bx, by) + 1.05, "N", wm, length=0.8)
    ph_place(mp, "rusted_spade_01", *T(37.55, 7.95), rot=135.0, lod=None, tilt=20.0, toward=135.0)
    ph_place(mp, "tree_stump_01", *T(38, 29), rot=60.0, size=1.15, sink=0.08, lod=0.4)
    stile(mp, wm)
    # the bramble hide spot
    x, y = T(45, 27)
    for i in range(3):
        a = math.radians(120.0 * i + 15.0)
        ph_place(mp, "shrub_02", x + 0.55 * math.cos(a), y + 0.55 * math.sin(a), piece=1 + i % ph_count("shrub_02"),
                 scale=RNG.uniform(1.1, 1.3), grade="dead_shrub", col="forest", sink=0.05)
        ph_place(mp, "dry_branches_medium_01", x + 0.3 * math.cos(a + 1.0), y + 0.3 * math.sin(a + 1.0),
                 piece=1 + i % ph_count("dry_branches_medium_01"), lod=0.4, size=RNG.uniform(1.0, 1.3), z=mp.height(x, y) + 0.4 * i,
                 tilt=RNG.uniform(10, 35))
    # the fallen log's root plate at its WNW end
    rx, ry = T(10.95, 22.85)
    mb = MB()
    mb.cyl(0.75, 0.72, 0.3, 16, M4(rx, ry, mp.height(rx, ry) + 0.62, rz=157.5, ry=90.0) @ M4(z=-0.15), wm["soil"], jitter=0.12)
    mb.build("WP_root_plate", col="models", smooth=True)
    for i in range(3):
        ph_place(mp, "rock_07", rx + RNG.uniform(-0.3, 0.3), ry + RNG.uniform(-0.3, 0.3), z=mp.height(rx, ry) + RNG.uniform(0.3, 1.0),
                 size=RNG.uniform(0.25, 0.4), lod=0.15)
    for i in range(4):
        a = 157.5 + RNG.uniform(-70, 70)
        ph_place(mp, "single_root", rx + 0.5 * math.cos(math.radians(a)), ry + 0.5 * math.sin(math.radians(a)), rot=a - 90.0,
                 scale=RNG.uniform(0.6, 0.8), lod=0.12, z=mp.height(rx, ry) + RNG.uniform(0.2, 0.9), tilt=RNG.uniform(20, 50),
                 toward=a)
    ground_decal(mp, "WP_torn_hollow", rx + 0.5, ry - 0.2, 0.55, wm["soil"])
    # the kiln's smoke-hole glows, its smoke and the hut's
    kiln = got["kiln"]
    klo, khi = wbox(kiln)
    kc = Vector(((klo.x + khi.x) / 2, (klo.y + khi.y) / 2, 0.0))
    kr = 0.5 * min(khi.x - klo.x, khi.y - klo.y)
    mb = MB()
    for az in (40.0, 160.0, 280.0):
        a = math.radians(az) + kiln.rotation_euler.z
        px, py = kc.x + 0.66 * kr * math.cos(a), kc.y + 0.66 * kr * math.sin(a)
        p = ray_down(kiln, px, py)
        if p is not None:
            mb.sphere(0.09, 0.09, 0.045, 10, 5, M4(p.x, p.y, p.z - 0.01), wm["hole"])
            smoke_column("WP_smoke_wisp", [p, p + Vector((0.2, -0.05, 1.2)), p + Vector((0.5, -0.1, 2.5))], [0.06, 0.09, 0.12], 0.3, 3.0)
    mb.build("WP_smoke_holes", col="models")
    c0 = Vector((19.65, 16.65, 2.0))  # the kiln's chimney top: the column leans east and south with the wind
    smoke_column("WP_smoke_clamp", [c0 + Vector((4.0 * t * t, -1.5 * t * t, 14.0 * t)) for t in (0.0, 0.2, 0.45, 0.7, 1.0)],
                 [0.25, 0.7, 1.3, 1.9, 2.5], 0.6)
    hut = got["hut"]["obj"]
    hp = Vector(vb.local_to_world(hut, (-1.16, 0.23, 4.40)))   # the stovepipe's mouth (catalog frame)
    smoke_column("WP_smoke_hut", [hp + Vector((2.5 * t * t, -1.0 * t * t, 10.0 * t)) for t in (0.0, 0.25, 0.5, 0.75, 1.0)],
                 [0.12, 0.4, 0.75, 1.1, 1.4], 0.35)
    return got


def fen_trees(mp: WildMap, fen: Fen, eyes, got: dict):
    """The Fenwood's tree plan (seeded): forced trees, then rings 1, 2 and 3+ of T cells by chance and spacing, then
    the belts outside (no tall trees over the marsh: snags and stunted pines only)."""
    trunks = Hash(3.0)
    plan = []
    W, H = mp.w, mp.h
    spawns = [T(s["x"], s["y"]) for s in mp.d.get("spawns") or []]
    avoid = [(e, 2.5) for e in eyes + spawns]
    no_tree = {(32, 16), (33, 16), (45, 27), (47, 17), (47, 19)} | {(x, 0) for x in range(4, 13)} | \
              {(x, 1) for x in range(4, 7)} | {(x, y) for x in range(10, 13) for y in range(1, 4)} | \
              {(x, 12) for x in range(23, 27)} | {(x, 35) for x in range(5, 24)} | \
              {(x, y) for x in range(14, 18) for y in range(3, 6)}   # the gap the 'grotto' still looks through
    rects = list(vb.KEEP_CLEAR)
    for key, pad in (("kiln", 1.8), ("adit", 1.5), ("grotto", 1.2)):
        if key in got:
            lo, hi = wbox(got[key])
            rects.append((lo.x - pad, lo.y - pad, hi.x + pad, hi.y + pad))
    oak = fen.oak
    moon = T(*FD_MOON_XY)
    walk_rects = [TR(x - 0.5, y - 0.5, x + 0.5, y + 0.5) for y in range(H) for x in range(W) if mp.walk[y][x]]
    wh = Hash(3.0)
    for r in walk_rects:
        wh.add((r[0] + r[2]) / 2, (r[1] + r[3]) / 2, r)

    def ok(x, y, spacing, tile=None) -> bool:
        if tile is not None and tile in no_tree:
            return False
        if math.hypot(x - oak[0], y - oak[1]) < 5.5 or any(math.hypot(x - p[0], y - p[1]) < r for p, r in avoid):
            return False
        if any(in_rect(x, y, r) for r in rects):
            return False
        if not trunks.free(x, y, spacing):
            return False
        return all(rect_d(x, y, r) >= 0.6 for _x, _y, r, _d in wh.near(x, y, 2.5))

    def walk_dir(x, y) -> float:
        best = min(wh.near(x, y, 12.0), key=lambda q: q[3], default=None)
        return math.degrees(math.atan2(best[1] - y, best[0] - x)) if best else 0.0

    def add(x, y, name, scale, lod, shadow=True, sink=None):
        if math.hypot(x - moon[0], y - moon[1]) < 4.0:
            scale = min(scale, 13.0 / vb.CAT[name]["size_m"])
        rot = walk_dir(x, y) + 180.0 + RNG.uniform(-40, 40) if name == "dead_tree" else RNG.uniform(0, 360)
        plan.append(dict(name=name, x=x, y=y, scale=scale, lod=lod, shadow=shadow, rot=rot,
                         sink=sink if sink is not None else (0.25 if name == "dead_tree" else 0.3)))
        trunks.add(x, y)

    for tx, ty, name, sc in FD_FORCED:
        x, y = T(tx, ty)
        add(x, y, name, sc, 0.6, sink=0.3 if ty == 35 else None)
    loop = lambda tx, ty: 29 <= tx <= 43 and 25 <= ty <= 31  # noqa: E731
    cells = [(tx, ty) for tx, ty in mp.cells("T")]
    RNG.shuffle(cells)
    cells.sort(key=lambda c: min(fen.ring[c[1]][c[0]], 3))
    counts = {1: 0, 2: 0, 3: 0}
    for tx, ty in cells:
        ring = min(fen.ring[ty][tx], 3)
        chance = (0.85 if loop(tx, ty) else 0.75) if ring == 1 else 0.6 if ring == 2 else 0.5
        if RNG.random() >= chance:
            continue
        spacing = 2.7 if ring == 1 else 3.0 if ring == 2 else 3.4
        mix = FD_MIX["fen"] if fen.dwet[ty][tx] <= 3 else FD_MIX["loop"] if loop(tx, ty) else FD_MIX["general"]
        for _ in range(4):
            x, y = T(tx + RNG.uniform(-0.3, 0.3), ty + RNG.uniform(-0.3, 0.3))
            if ok(x, y, spacing, (tx, ty)):
                name, sc = pick(mix)
                add(x, y, name, sc, 0.6 if ring == 1 else 0.3 if ring == 2 else 0.2)
                counts[ring] += 1
                break
    inside = len(plan)

    def dout(x, y) -> float:
        return max(-36.0 - x, x - 36.0, y - 27.0, -27.0 - y, 0.0)

    def marsh(x, y) -> bool:
        return (x < -36.0 and y < -3.75) or (y < -27.0 and x < 15.75)

    def lane(x, y) -> bool:
        return 35.0 < x < 61.0 and abs(y + 0.75) < 2.25

    for lo, hi, want, lod, shadow, spacing in ((0.5, 15.0, 120, 0.2, True, 3.0), (15.0, 60.0, 230, 0.08, False, 4.5),
                                               (60.0, 180.0, 180, 0.08, False, 7.0)):
        count = tries = 0
        while count < want and tries < 40000:
            tries += 1
            x, y = RNG.uniform(-36.0 - hi, 36.0 + hi), RNG.uniform(-27.0 - hi, 27.0 + hi)
            d = dout(x, y)
            if not lo <= d < hi or marsh(x, y) or lane(x, y):
                continue
            if hi > 100 and RNG.random() < 0.7 * (d - 60.0) / 120.0:
                continue
            if any(in_rect(x, y, r) for r in rects) or not trunks.free(x, y, spacing):
                continue
            name, sc = pick(FD_MIX["general"])
            add(x, y, name, sc, lod, shadow)
            count += 1
    for name, want, (s0, s1) in (("dead_tree", 28, (0.8, 1.2)), ("pine_short", 10, (0.6, 0.9))):
        count = tries = 0
        while count < want and tries < 20000:
            tries += 1
            x, y = RNG.uniform(-96.0, 16.0), RNG.uniform(-87.0, -3.75)
            if not marsh(x, y) or dout(x, y) > 60.0 or dout(x, y) < 1.0 or not trunks.free(x, y, 4.0):
                continue
            if fen.height(x, y) < -0.5:  # on hummocks only
                continue
            add(x, y, name, RNG.uniform(s0, s1), 0.2, True)
            count += 1
    print(f"TREES planned: {inside} in the map (rings {counts}), {len(plan) - inside} outside", flush=True)
    return plan, trunks


def fen_after_trees(mp: WildMap, fen: Fen, plan, wm: dict) -> None:
    """The resin blazes on the forced pines and the boar's tusk scores on the three trunks nearest the wallow."""
    blaze(mp, *T(14, 5), 202.5, wm)
    # that pine stands 2.3 m from the grotto still's eye and sharpen_near_views always clears it: its blaze stood alone
    # in the glade as a pale strip on a post (review 2). The draws stay taken, the pieces go
    alone = bpy.data.objects.get("WP_resin_blaze")
    if alone is not None:
        bpy.data.objects.remove(alone, do_unlink=True)
    blaze(mp, *T(37, 23), -90.0, wm)
    wx, wy = fen.wal
    near = sorted(((math.hypot((t["x"] - wx) / 3.3, (t["y"] - wy) / 2.4), t) for t in plan
                   if t["name"] == "pine_tall" and math.hypot(t["x"] - wx, t["y"] - wy) < 7.0), key=lambda q: q[0])
    mb = MB()
    for _e, t in near[:3]:
        a = math.atan2(wy - t["y"], wx - t["x"])
        r = 0.28 * t["scale"]
        gz = mp.height(t["x"], t["y"])
        for k in range(RNG.randint(3, 5)):
            aa = a + RNG.uniform(-0.4, 0.4)
            mb.box(0.03, 0.012, RNG.uniform(0.25, 0.4),
                   M4(t["x"] + r * math.cos(aa), t["y"] + r * math.sin(aa), gz + RNG.uniform(0.3, 0.6),
                      rz=math.degrees(aa) + 90.0, ry=RNG.uniform(50, 75)), wm["gash"])
    mb.build("WP_tusk_scores", col="models")


def fen_scatter(mp: WildMap, fen: Fen, trunks: Hash, eyes) -> None:
    """The Fenwood's scatter rows: stones on the trail edges, bracken, dead grass, windfalls, roots, stumps, shrubs,
    stones in the fen and outcrops in the deep wood (counts approximate, seeded)."""
    forbid = [(e, 2.5) for e in eyes] + [(T(s["x"], s["y"]), 1.5) for s in mp.d.get("spawns") or []] + \
             [(fen.oak, 3.0), (T(26.4, 20.68), 2.0), (fen.sink, 2.0)]
    sc = Scatter(forbid, trunks)

    def walkable(tx, ty) -> bool:
        return mp.is_walk(tx, ty)

    def near_T(tx, ty) -> bool:
        return any(mp.at(tx + dx, ty + dy) == "T" for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))

    def off_lines(x, y, r=0.9) -> bool:
        return fen.trodden.nearest(x, y)[0] > r and not (-24.2 < x < -2.8 and -15.2 < y < -11.8) and \
            not (-22.7 < x < -17.8 and -18.2 < y < -14.8) and not (-6.2 < x < -2.8 and -9.2 < y < -4.3)

    def points(n, test, r, cells=None):
        cells = cells or [(tx, ty) for ty in range(mp.h) for tx in range(mp.w)]
        out, tries = [], 0
        while len(out) < n and tries < n * 100:
            tries += 1
            tx, ty = RNG.choice(cells)
            x, y = T(tx + RNG.uniform(-0.5, 0.5), ty + RNG.uniform(-0.5, 0.5))
            if test(tx, ty, x, y) and sc.ok(x, y, r):
                out.append((x, y))
                sc.put(x, y)
        return out

    edge = lambda tx, ty, x, y: walkable(tx, ty) and near_T(tx, ty) and off_lines(x, y) and mp.at(tx, ty) not in "~wO"  # noqa: E731
    for x, y in points(36, edge, 6.0):
        ph_place(mp, "rock_moss_set_02", x, y, piece=RNG.randint(1, ph_count("rock_moss_set_02")), scale=RNG.uniform(0.25, 0.55),
                 lod=0.3, sink_frac=0.4)
    nf = ph_count("fern_02")
    for x, y in points(22, lambda tx, ty, x, y: mp.at(tx, ty) == "u" and not fen._margin(tx, ty), 1.0):
        for _ in range(2):
            ph_place(mp, "fern_02", x + RNG.uniform(-0.3, 0.3), y + RNG.uniform(-0.3, 0.3), piece=RNG.randint(1, nf),
                     scale=RNG.uniform(1.8, 2.4), grade="dead_fern", col="forest", sink=0.03)
    for x, y in points(5, lambda tx, ty, x, y: ty == 24 and 18 <= tx <= 22, 1.0):
        ph_place(mp, "fern_02", x, y, piece=RNG.randint(1, nf), scale=RNG.uniform(1.8, 2.4), grade="dead_fern", col="forest",
                 sink=0.03)
    ring1 = lambda tx, ty, x, y: mp.at(tx, ty) == "T" and fen.ring[ty][tx] == 1 and trunks.free(x, y, 1.0)  # noqa: E731
    for x, y in points(22, ring1, 2.0):
        for _ in range(RNG.randint(1, 3)):
            ph_place(mp, "fern_02", x + RNG.uniform(-0.4, 0.4), y + RNG.uniform(-0.4, 0.4), piece=RNG.randint(1, nf),
                     scale=RNG.uniform(1.8, 2.4), grade="dead_fern", col="forest", sink=0.03)
    ng = ph_count("grass_medium_02")
    for test, n in ((lambda tx, ty, x, y: mp.at(tx, ty) == "g" and ty < 21 and off_lines(x, y, 0.7) and
                     math.hypot(x - T(26.4, 20.68)[0], y - T(26.4, 20.68)[1]) > 2.0, 25),
                    (lambda tx, ty, x, y: mp.at(tx, ty) == "g" and ty >= 21, 25),
                    (lambda tx, ty, x, y: walkable(tx, ty) and (tx >= 37 and 6 <= ty <= 18) and near_T(tx, ty) and off_lines(x, y, 0.7), 10),
                    (lambda tx, ty, x, y: walkable(tx, ty) and tx <= 18 and ty <= 11 and near_T(tx, ty) and off_lines(x, y, 0.7), 10)):
        for x, y in points(max(1, n // 4), test, 1.5):
            for _ in range(RNG.randint(3, 7)):
                ph_place(mp, "grass_medium_02", x + RNG.uniform(-0.35, 0.35), y + RNG.uniform(-0.35, 0.35), piece=RNG.randint(1, ng),
                         grade="dry", col="forest", sink=0.01, size=RNG.uniform(0.12, 0.45))
    nb = ph_count("dry_branches_medium_01")
    for test, n in ((edge, 14), (lambda tx, ty, x, y: mp.at(tx, ty) == "T" and fen.ring[ty][tx] <= 2 and trunks.free(x, y, 0.8), 16)):
        for x, y in points(n, test, 2.0):
            ph_place(mp, "dry_branches_medium_01", x, y, piece=RNG.randint(1, nb), lod=0.4, size=RNG.uniform(0.8, 1.3),
                     sink=0.05, tilt=RNG.uniform(0, 15), toward=RNG.uniform(0, 360))
    for tx in (23, 24, 25, 26)[:2]:
        x, y = T(tx + 0.5, 12)
        ph_place(mp, "dry_branches_medium_01", x, y, piece=RNG.randint(1, nb), lod=0.4, size=1.2, sink=0.05, tilt=10.0)
    for tx, ty, n in ((22, 13, 1), (24, 13, 1), (25, 17, 1), (9, 8, 1), (13, 8, 1)):
        x, y = T(tx, ty)
        ph_place(mp, "single_root", x, y, rot=RNG.uniform(0, 360), size=RNG.uniform(1.2, 1.8), lod=0.12, sink=0.08)
    for tx, ty in ((35, 5), (31, 9), (44, 9), (43, 10), (34, 13), (1, 23)):
        x, y = T(tx, ty)
        if trunks.free(x, y, 1.2):
            ph_place(mp, "tree_stump_01", x, y, scale=RNG.uniform(0.55, 0.85), lod=0.2, sink=0.06)
    ns = ph_count("shrub_02")
    for x, y in points(12, lambda tx, ty, x, y: ring1(tx, ty, x, y) and ((tx == 18 and 15 <= ty <= 19) or (ty == 20 and 33 <= tx <= 40) or
                                                                       (tx in (38, 42) and 13 <= ty <= 15) or ty == 3), 8.0):
        ph_place(mp, "shrub_02", x, y, piece=RNG.randint(1, ns), lod=None, tall=RNG.uniform(1.2, 1.8), grade="dead_shrub",
                 col="forest", sink=0.05)
    for x, y in points(18, lambda tx, ty, x, y: mp.at(tx, ty) == "~" and off_lines(x, y, 1.0), 1.5):
        ph_place(mp, "rock_07", x, y, scale=RNG.uniform(1.5, 3.0), lod=0.1, sink_frac=0.5)
    for i in range(4):
        a = 2 * math.pi * i / 4 + 0.5
        ph_place(mp, "rock_07", fen.sink[0] + 1.6 * math.cos(a), fen.sink[1] + 1.4 * math.sin(a), scale=RNG.uniform(1.5, 2.5),
                 lod=0.1, sink_frac=0.5)
    for i in range(4):
        a = 2 * math.pi * i / 4 + 0.2
        ph_place(mp, "rock_07", fen.wal[0] + 3.4 * math.cos(a), fen.wal[1] + 2.5 * math.sin(a), scale=RNG.uniform(1.5, 3.0),
                 lod=0.1, sink_frac=0.5)
    for tx, ty in ((1, 14), (14, 15), (45, 4), (25, 33), (45, 13)):
        x, y = T(tx, ty)
        ph_place(mp, "rock_moss_set_01", x, y, piece=RNG.randint(2, ph_count("rock_moss_set_01")), lod=0.5, sink_frac=0.3)


def fen_lights(mp: WildMap, got: dict) -> None:
    spot_light("moon_pool", "fd.lt_moon_oak", (4.35, -4.77, 16.42), (0.75, -2.25, 0.0), 4300.0, (0.74, 0.85, 1.0), 39.0, 0.45,
               radius=0.6, volume=0.3, shadow=True)
    point_light("fire", "fd.lt_clamp", 19.5, 14.3, 0.55, 300.0, (1.0, 0.47, 0.16), radius=0.45, volume=0.9, shadow=True, cutoff=12.0)
    x, y = T(36.6, 6.4)   # the smoke's underglow, just under the chimney mouth (inside the column it lit a glowing pillar)
    point_light("lamp", "fd.lt_clamp_smoke", x, y, 1.75, 55.0, (1.0, 0.5, 0.18), radius=0.5, volume=0.35, shadow=False, cutoff=10.0)
    x, y = T(5.05, 10.75)
    point_light("moss", "fd.lt_moss_den", x, y, mp.height(x, y) + 0.6, 30.0, (0.12, 0.86, 0.74), radius=0.8, volume=0.8, cutoff=6.0)
    x, y = T(16, 27.75)
    point_light("moss", "fd.lt_rot_fen", x, y, -0.25, 30.0, (0.12, 0.86, 0.74), radius=0.8, volume=0.8, cutoff=7.0)
    if "grotto" in got:   # a soft cool moonbeam into the grotto's pool: it faces south, away from the moon, under the scarp
        lo, hi = wbox(got["grotto"])
        cx, cy = (lo.x + hi.x) / 2 + 0.85, (lo.y + hi.y) / 2 - 0.6   # the pool's middle (its water at lo.z + 0.25)
        spot_light("moon_pool", "fd.lt_moon_grotto", (cx + 4.5, cy - 3.5, lo.z + 16.0), (cx, cy, lo.z + 0.3), 1300.0,
                   (0.74, 0.85, 1.0), 30.0, 0.9, radius=1.5, volume=0.3, shadow=True, gain=0.3)
        # the grotto still's own moonlight (review 2: murky and flat, no focal highlight): a moonbeam on the sand and
        # snow behind the pool and a faint bounce off them onto the overhang, which the pool now mirrors. Their kind is
        # no look kind, so the look leaves them as built: out of the render (hide_render) except in the grotto still,
        # whose views-file 'show' brings them in (the glade and the overview, which see the grotto, keep it as it was)
        zp = got.get("grotto_z") or (lo.z + 0.22)
        back = Vector(((lo.x + hi.x) / 2 + 0.25, hi.y - 3.2, zp))
        catch = spot_light("grotto_moon", "fd.lt_grotto_catch", back + Vector((5.5, -7.5, 13.0)), back + Vector((0.0, -1.2, 0.0)),
                           11000.0, (0.74, 0.85, 1.0), 32.0, 0.75, radius=1.0, volume=0.0, shadow=True)
        bounce = area_light("grotto_moon", "fd.lt_grotto_bounce", back + Vector((0.0, 0.4, 0.08)), (0.0, 0.25, 1.0), 2.4, 1.6,
                            120.0, (0.62, 0.72, 0.95), volume=0.0, shadow=False)
        if hasattr(bounce.data, "specular_factor"):
            bounce.data.specular_factor = 0.0
        catch.hide_render = bounce.hide_render = True
    if "lantern" not in got:  # --no-models: the drowned lantern's own light, where place() would have put it
        x, y = T(10, 30.25)
        point_light("drowned", "fd.lt_drowned", x + 0.4, y + 0.6, 1.18, 80.0, (0.22, 0.92, 0.76), radius=0.15, volume=0.5, shadow=True)


def build_forest_deep(scene, mp: WildMap, a) -> None:
    eyes = list(FD_PLAN_EYES)   # not the views file's: moving a still would reshuffle the plan (see build_forest)
    fen = Fen(mp)
    mp.hfun = fen.height
    xs = grid_axis([(-260.0, 260.0, 6.0), (-90.0, 90.0, 2.0), (-42.0, 42.0, 0.5)])
    ys = grid_axis([(-260.0, 260.0, 6.0), (-90.0, 90.0, 2.0), (-33.0, 33.0, 0.5)])
    build_grid("HM_Ground", xs, ys, fen.sample, keep=fen.keep, mat=ground_material(FD_GROUND))
    wmat = water_material(rot=[(-11.25, -14.25, 1.5, 4.0)], rot_color=(0.10, 0.70, 0.55), rot_strength=0.35, specks=True)
    build_water("HM_Mere", wmat, -0.45, [(-36.0, -27.0, 0.5, -3.0, 0.5)], fen.height)
    build_water("HM_Water_marsh", wmat, -0.45, [(-212.0, -212.0, 16.0, -3.0, 4.0)], fen.height,
                keep=lambda x, y: not (abs(x) < 36.0 and abs(y) < 27.0))
    build_water("HM_Water_wallow", wmat, -0.22, [(15.0, -17.25, 22.5, -11.25, 0.25)], fen.height)
    mist = volume_mat("WP_fen_mist_vol", (0.66, 0.70, 0.76), 0.03, z0=-0.45, fall=0.8, nscale=0.25, nbase=0.3, ngain=1.4, top=1.6)
    mb = MB()
    mb.box(37.0, 25.0, 2.2, M4(-17.5, -15.5, 0.6), mist)
    volume_object("WP_fen_mist", mb)
    wm = fen_mats()
    boardwalk(mp, wm)
    sinkhole(mp, fen, wm, models=not a.no_models)
    fen_reeds(mp, fen, wm)
    bog(mp, wm)
    got = {}
    if not a.no_models:
        cut_dead_tree_lantern()
        got = fen_models(mp, fen, wm, eyes)
        if not a.no_trees:
            plan, trunks = fen_trees(mp, fen, eyes, got)
            place_trees(mp, plan)
            fen_after_trees(mp, fen, plan, wm)
        else:
            trunks = Hash(3.0)
        fen_scatter(mp, fen, trunks, eyes)
    fen_lights(mp, got)


# ---------------------------------------------------------------- caves: the air on a raster, the wall line, the shell


def _shift(a, dy: int, dx: int, fill: float):
    out = np.full_like(a, fill)
    ny, nx = a.shape
    out[max(dy, 0):ny + min(dy, 0), max(dx, 0):nx + min(dx, 0)] = a[max(-dy, 0):ny + min(-dy, 0), max(-dx, 0):nx + min(-dx, 0)]
    return out


def _chamfer(mask, res: float, cap: float = 12.0):
    """Distance (m) from every True cell to the nearest False cell (8-neighbour chamfer), capped at `cap`."""
    big = 1.0e6
    d = np.where(mask, big, 0.0)
    steps = [(0, 1, res), (0, -1, res), (1, 0, res), (-1, 0, res)] + \
            [(dy, dx, res * 1.41421356) for dy in (-1, 1) for dx in (-1, 1)]
    for _ in range(int(cap / res) + 2):
        prev = d
        for dy, dx, w in steps:
            d = np.minimum(d, _shift(d, dy, dx, big) + w)
        if np.array_equal(prev, d):
            break
    return np.minimum(d, cap)


def _blur(a, sigma: float):
    """Separable Gaussian blur of a raster (sigma in cells)."""
    if sigma <= 0.3:
        return a
    r = int(math.ceil(3.0 * sigma))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    p = np.pad(a, ((0, 0), (r, r)), mode="edge")
    out = sum(k[i] * p[:, i:i + a.shape[1]] for i in range(2 * r + 1))
    p = np.pad(out, ((r, r), (0, 0)), mode="edge")
    return sum(k[i] * p[i:i + a.shape[0], :] for i in range(2 * r + 1))


def _resample(pts, step: float):
    """A closed polyline resampled at an even spacing."""
    ring = pts + [pts[0]]
    acc = [0.0]
    for a, b in zip(ring, ring[1:]):
        acc.append(acc[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    total = acc[-1]
    n = max(8, int(total / step))
    out, k = [], 0
    for i in range(n):
        s = total * i / n
        while k < len(acc) - 2 and acc[k + 1] < s:
            k += 1
        seg = acc[k + 1] - acc[k] or 1e-9
        t = (s - acc[k]) / seg
        a, b = ring[k], ring[k + 1]
        out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


class Field:
    """A cave's air on a raster at `res` metres: f is the signed distance to the wall line (positive in the air),
    wobbled by noise, and the shell is grown from its zero line."""

    def __init__(self, x0: float, y0: float, x1: float, y1: float, res: float):
        self.x0, self.y0, self.res = x0, y0, res
        self.nx = int(math.ceil((x1 - x0) / res)) + 1
        self.ny = int(math.ceil((y1 - y0) / res)) + 1
        self.X = x0 + res * np.arange(self.nx)
        self.Y = y0 + res * np.arange(self.ny)
        self.air = np.zeros((self.ny, self.nx), dtype=bool)
        self.f = self.sd = None

    def _ix(self, lo: float, hi: float, origin: float, n: int):
        return (max(0, int(math.ceil((lo - origin) / self.res - 1e-6))),
                min(n - 1, int(math.floor((hi - origin) / self.res + 1e-6))))

    def _window(self, x0, y0, x1, y1):
        i0, i1 = self._ix(min(x0, x1), max(x0, x1), self.x0, self.nx)
        j0, j1 = self._ix(min(y0, y1), max(y0, y1), self.y0, self.ny)
        return i0, i1, j0, j1

    def rect(self, x0: float, y0: float, x1: float, y1: float, value: bool = True) -> None:
        i0, i1, j0, j1 = self._window(x0, y0, x1, y1)
        if i0 <= i1 and j0 <= j1:
            self.air[j0:j1 + 1, i0:i1 + 1] = value

    def poly(self, pts, value: bool = True) -> None:
        i0, i1, j0, j1 = self._window(min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts))
        if i0 > i1 or j0 > j1:
            return
        X, Y = np.meshgrid(self.X[i0:i1 + 1], self.Y[j0:j1 + 1])
        inside = np.zeros(X.shape, dtype=bool)
        for k in range(len(pts)):
            (xa, ya), (xb, yb) = pts[k], pts[(k + 1) % len(pts)]
            if ya == yb:
                continue
            inside ^= ((ya > Y) != (yb > Y)) & (X < (xb - xa) * (Y - ya) / (yb - ya) + xa)
        sub = self.air[j0:j1 + 1, i0:i1 + 1]
        sub[inside] = value

    def build(self, wobble, lo: float, hi: float, blur: float = 0.4) -> None:
        res = self.res
        self.air[0, :] = self.air[-1, :] = False
        self.air[:, 0] = self.air[:, -1] = False
        d_in, d_out = _chamfer(self.air, res), _chamfer(~self.air, res)
        sd = np.where(self.air, d_in - res / 2, -(d_out - res / 2))
        w = np.zeros_like(sd)
        for j, i in zip(*np.nonzero(np.abs(sd) < 3.0)):
            w[j, i] = wobble(float(self.X[i]), float(self.Y[j]))
        f = np.clip(_blur(sd, blur / res) + w, sd + lo, sd + hi)
        f[0, :] = f[-1, :] = -1.0
        f[:, 0] = f[:, -1] = -1.0
        self.sd, self.f = sd, f

    def at(self, x: float, y: float, grid=None, outside: float = -5.0) -> float:
        g = self.f if grid is None else grid
        fx, fy = (x - self.x0) / self.res, (y - self.y0) / self.res
        i, j = int(math.floor(fx)), int(math.floor(fy))
        if i < 0 or j < 0 or i >= self.nx - 1 or j >= self.ny - 1:
            return outside
        ax, ay = fx - i, fy - j
        return float(g[j, i] * (1 - ax) * (1 - ay) + g[j, i + 1] * ax * (1 - ay) + g[j + 1, i] * (1 - ax) * ay +
                     g[j + 1, i + 1] * ax * ay)

    def loops(self, step: float = 0.28):
        """The wall line f = 0 by marching squares: closed loops of (x, y), each with the air on its left."""
        f = self.f
        pos = (f > 0).astype(np.int8)
        c = pos[:-1, :-1] | (pos[:-1, 1:] << 1) | (pos[1:, 1:] << 2) | (pos[1:, :-1] << 3)
        adj: dict = {}

        def link(a, b):
            adj.setdefault(a, []).append(b)
            adj.setdefault(b, []).append(a)

        for j, i in zip(*np.nonzero((c > 0) & (c < 15))):
            k = int(c[j, i])
            j, i = int(j), int(i)
            B, R, Tt, L = ("h", i, j), ("v", i + 1, j), ("h", i, j + 1), ("v", i, j)
            if k in (5, 10):
                centre = (f[j, i] + f[j, i + 1] + f[j + 1, i + 1] + f[j + 1, i]) / 4.0
                if (k == 5) == (centre > 0):
                    link(B, R)
                    link(Tt, L)
                else:
                    link(L, B)
                    link(R, Tt)
                continue
            bits = [(k >> n) & 1 for n in range(4)]
            cross = [e for e, a, b in ((B, bits[0], bits[1]), (R, bits[1], bits[2]), (Tt, bits[2], bits[3]), (L, bits[3], bits[0]))
                     if a != b]
            if len(cross) == 2:
                link(*cross)

        def pt(key):
            kind, i, j = key
            if kind == "h":
                a, b = float(f[j, i]), float(f[j, i + 1])
                return self.x0 + (i + a / (a - b)) * self.res, self.y0 + j * self.res
            a, b = float(f[j, i]), float(f[j + 1, i])
            return self.x0 + i * self.res, self.y0 + (j + a / (a - b)) * self.res

        seen, out = set(), []
        for start in adj:
            if start in seen:
                continue
            loop, prev, cur = [], None, start
            while True:
                seen.add(cur)
                loop.append(pt(cur))
                nb = [n for n in adj[cur] if n != prev]
                nxt = nb[0] if nb else None
                if nxt is None or nxt == start or nxt in seen:
                    break
                prev, cur = cur, nxt
            if len(loop) < 6:
                continue
            loop = _resample(loop, step)
            (ax, ay), (bx, by) = loop[0], loop[1]
            ln = math.hypot(bx - ax, by - ay) or 1.0
            lx, ly = -(by - ay) / ln, (bx - ax) / ln
            mx, my = (ax + bx) / 2, (ay + by) / 2
            if self.at(mx + 0.08 * lx, my + 0.08 * ly) < self.at(mx - 0.08 * lx, my - 0.08 * ly):
                loop.reverse()
            out.append(loop)
        return out


def tile_weights(mp: WildMap, x: float, y: float) -> dict:
    """Bilinear weights of the material letters at a world point (tile centres; the default solid beyond the map)."""
    fx, fy = TF(x, y)
    x0, y0 = math.floor(fx), math.floor(fy)
    ax, ay = fx - x0, fy - y0
    out: dict = {}
    for ix, iy, w in ((x0, y0, (1 - ax) * (1 - ay)), (x0 + 1, y0, ax * (1 - ay)), (x0, y0 + 1, (1 - ax) * ay),
                      (x0 + 1, y0 + 1, ax * ay)):
        if w > 0.0:
            c = mp.at(ix, iy)
            out[c] = out.get(c, 0.0) + w
    return out


class CaveCfg:
    """A cave scene: which tiles are air, what is carved beyond them, the wobble of the wall line, the roof's crowns,
    the floor, and the attributes the rock and floor materials read. Subclasses fill in the scene."""

    solid = "X"
    res = 0.25
    profile = "dome"
    wob = (0.0, 0.35, 0.4, 0.12, 1.6, -0.3, 0.45)   # mean, amp 1, scale 1 (per m), amp 2, scale 2, clip in, clip out
    blur = 0.4
    crown_blur = 1.5
    C0, Zs0, R0 = 4.0, 2.8, 3.0
    portals: list = []

    def __init__(self, mp: WildMap):
        self.mp = mp
        self.fd = Field(*self.bounds(), self.res)
        solid_tiles = self.solid_tiles()
        for ty in range(mp.h):
            for tx in range(mp.w):
                if mp.mat[ty][tx] not in self.solid and (tx, ty) not in solid_tiles:
                    self.fd.rect(vb.wx(tx), vb.wy(ty + 1), vb.wx(tx + 1), vb.wy(ty))
        self.carve()
        self.fd.build(self.wobble, self.wob[5], self.wob[6], self.blur)
        self._crowns()
        self.spawns = [T(s["x"], s["y"]) for s in mp.d.get("spawns") or []]

    # -- to fill in
    def bounds(self):
        return -vb.W * S / 2 - 3.0, -vb.H * S / 2 - 3.0, vb.W * S / 2 + 3.0, vb.H * S / 2 + 3.0

    def solid_tiles(self):
        return set()

    def carve(self) -> None:
        pass

    def regions(self):
        return []

    def floor_raw(self, x: float, y: float) -> float:
        return 0.05 * fbm(x, y, 0.5, 3)

    def lean(self, x: float, y: float) -> float:
        return 0.0

    def open_wall(self, x: float, y: float) -> bool:
        return False

    def roof_hole(self, x: float, y: float) -> bool:
        return False

    def ribs(self, x: float, y: float) -> float:
        return 0.0

    def extra_disp(self, x: float, y: float, z: float) -> float:
        return 0.0

    def wall_attrs(self, x: float, y: float, z: float):
        """((wet, worked, moss, frost), (glow, lode, tide, soil)) of a rock vertex."""
        return (0.0, 0.0, 0.0, 0.0), (0.0, 0.0, 0.0, 0.0)

    # -- shared
    def wobble(self, x: float, y: float) -> float:
        m, a1, s1, a2, s2 = self.wob[:5]
        k = 1.0
        for px, py in self.portals:
            k = min(k, sstep(1.0, 2.5, math.hypot(x - px, y - py)))
        return (m + a1 * fbm(x, y, s1, 3) + (a2 * fbm(x + 31.0, y, s2, 2) if a2 else 0.0)) * k

    def _crowns(self) -> None:
        fd = self.fd
        C = np.full(fd.air.shape, self.C0)
        Z = np.full(fd.air.shape, self.Zs0)
        R = np.full(fd.air.shape, self.R0)
        for rect, c, zs, r in self.regions():
            i0, i1, j0, j1 = fd._window(*rect)
            if i0 > i1 or j0 > j1:
                continue
            X, Y = np.meshgrid(fd.X[i0:i1 + 1], fd.Y[j0:j1 + 1])
            cv = c(X, Y) if callable(c) else np.full(X.shape, float(c))
            C[j0:j1 + 1, i0:i1 + 1] = cv
            Z[j0:j1 + 1, i0:i1 + 1] = np.clip(cv - 1.4, 2.4, 4.0) if zs is None else zs
            R[j0:j1 + 1, i0:i1 + 1] = r
        sig = self.crown_blur / fd.res
        self.C, self.Zs, self.R = _blur(C, sig), _blur(Z, sig), _blur(R, sig)

    def fillet(self, f: float) -> float:
        """The talus fillet: the floor curls up 0.35 m into every wall foot and runs on under the rock."""
        if f <= -4.0:
            return 0.0
        if f >= 0.0:
            return 0.35 * (1.0 - sstep(0.0, 0.6, f))
        return 0.35 + 0.6 * min(1.0, -f)

    def floor(self, x: float, y: float) -> float:
        return self.floor_raw(x, y) + self.fillet(self.fd.at(x, y))

    def springline(self, x: float, y: float) -> float:
        # the wall's top wanders 0.3-0.4 m, so the wall never meets the roof along a level seam
        return self.fd.at(x, y, self.Zs, self.Zs0) + 0.2 * fbm(x, y, 0.3, 2) + 0.15 * fbm(x + 4.0, y, 1.1, 2)

    def roof_z(self, x: float, y: float, f: float) -> float:
        fd = self.fd
        C, Zs, R = fd.at(x, y, self.C, self.C0), fd.at(x, y, self.Zs, self.Zs0), fd.at(x, y, self.R, self.R0)
        s = max(0.0, f - self.lean(x, y))
        if self.profile == "arch":
            u = min(s, 2.4) / 2.4
            p = math.sqrt(max(0.0, 1.0 - (1.0 - u) ** 2))
        else:
            p = sstep(0.0, max(R, 0.5), s)
        zn = self.springline(x, y)   # the wall's wandering top: the roof springs from it, so no level seam runs round
        z = zn + (C - zn) * p + self.roof_noise(x, y) * min(1.0, s / 0.6) - self.ribs(x, y) * sstep(0.5, 1.5, s)
        if f > 0.3:
            z = max(z, self.floor_raw(x, y) + 2.1)
        return z

    def roof_noise(self, x: float, y: float) -> float:
        return 0.45 * fbm(x, y, 0.25, 3)

    def wall_disp(self, x: float, y: float, z: float, lean: float, zs: float) -> float:
        d = 0.25 * n3(x, y, z, 1.0 / 1.2) + 0.1 * n3(x, y, z, 1.0 / 0.5, 3.0)   # plus half-metre lumps: rock, not clay
        if z < 2.2:
            d = abs(d)
        d += 0.09 * sstep(0.62, 0.8, (z / 0.7 + 0.3 * n3(x, y, 0.0, 0.3)) % 1.0)
        d -= lean * sstep(2.2, max(zs, 2.3), z)
        return d + self.extra_disp(x, y, z)

    def clear_of_portals(self, x: float, y: float, r0: float = 2.0, r1: float = 2.5) -> float:
        k = 1.0
        for px, py in list(self.portals) + list(self.spawns):
            k = min(k, sstep(r0, r1, math.hypot(x - px, y - py)))
        return k


def rock_material(name: str, cfg: dict) -> bpy.types.Material:
    """Cave rock, box-projected at the scans' size with a bump from luma (box projection has no tangent frame for
    the normal maps): a main role (and a second by large noise), worked stone, wet stone, moss, soil, a tide band,
    hoarfrost, quartz flecks, tin lodes and glowing moss, all driven by the point attributes wdi_r and wdi_q. Above
    the value node P_cut_z the surface turns transparent (the cutaway overview)."""
    m = bpy.data.materials.new(name)
    b = vb._principled(m)
    g = vb.G(m.node_tree)
    pos = g.position()
    wet, worked, moss, frost = attr4(g, "wdi_r")
    glow, lode, tide, soil = attr4(g, "wdi_q")
    role, k, ds = cfg["main"]
    bl = cfg.get("blend", 0.4)   # a wide box blend: walls between two axes no longer smear (sea door review)
    col = g.desat(g.scale(box_tex(g, role, zoom=cfg.get("zoom", 1.0), blend=bl), k), ds)
    if cfg.get("main2"):
        r2, share = cfg["main2"]
        lo = 0.62 - 0.25 * share
        col = g.mix(g.smooth(g.noise(pos, 0.2, 3.0), lo, lo + 0.06), col, g.desat(g.scale(box_tex(g, r2, blend=bl), k), ds))
    if cfg.get("worked"):
        col = g.mix(worked, col, g.desat(g.scale(box_tex(g, cfg["worked"], blend=bl), k), ds))
    if cfg.get("wet_role"):
        col = g.mix(wet, col, g.desat(g.scale(box_tex(g, cfg["wet_role"], blend=bl), k * 0.85), ds))
    tri = None
    if cfg.get("tri_moss"):
        # inside these circles (x, y, r), up to the moss's height: the main scan box-projected with a hard blend (a
        # wide blend smeared it along a bulging wall seen edge-on into waxy, painterly streaks, and the glow's
        # crevices with it), the moss itself from 3-D noise, dry and matte
        for cx, cy, r in cfg["tri_moss"]:
            kk = g.math("SUBTRACT", 1.0, g.smooth(xy_dist(g, pos, cx, cy), r * 0.75, r))
            tri = kk if tri is None else g.math("MAXIMUM", tri, kk)
        _tx, _ty, tz = sep3(g, pos)
        tri = g.math("MULTIPLY", tri, g.math("SUBTRACT", 1.0, g.smooth(tz, 1.9, 2.5)))
        sharp = g.desat(g.scale(box_tex(g, role, zoom=cfg.get("zoom", 1.0), blend=0.06), k), ds)
        col = g.mix(tri, col, sharp)
    if cfg.get("moss_role"):
        mm = g.math("MULTIPLY", moss, g.smooth(g.noise(pos, 2.0, 4.0), 0.42, 0.58))
        mtex = g.scale(box_tex(g, cfg["moss_role"], blend=bl), cfg.get("moss_k", 0.45))
        if tri is not None:
            m3 = g.mix(g.smooth(g.noise(pos, 7.0, 5.0, 0.65), 0.35, 0.7), (0.016, 0.03, 0.02), (0.05, 0.075, 0.042))
            m3 = scale_by(g, m3, g.math("ADD", 0.6, g.math("MULTIPLY", g.noise(pos, 22.0, 3.0), 0.8)))
            mtex = g.mix(tri, mtex, m3)
        col = g.mix(mm, col, mtex)
    if cfg.get("soil_role"):
        col = g.mix(soil, col, g.scale(box_tex(g, cfg["soil_role"], blend=bl), 0.6))
    # the tide band: dark and glossy below a ragged line, a weed fringe at its top
    col = g.mix(tide, col, g.scale(col, 0.42))
    fringe = g.math("MULTIPLY", g.math("SUBTRACT", tide, g.math("MULTIPLY", tide, tide)), 2.4)
    col = g.mix(fringe, col, (0.10, 0.10, 0.04))
    geo = _new(g.n, "ShaderNodeNewGeometry")
    _nx, _ny, nz = sep3(g, geo.outputs["Normal"])
    fr = g.math("MULTIPLY", g.math("MULTIPLY", frost, g.smooth(nz, 0.3, 0.8)), g.smooth(g.noise(pos, 3.0, 3.0), 0.40, 0.60))
    col = g.mix(fr, col, (0.62, 0.68, 0.78))
    # rough rock, glossier where wet, the gloss broken by noise so a light's glint scatters instead of streaking
    rough = g.mixf(g.math("MAXIMUM", wet, tide), cfg["rough"][0], cfg["rough"][1])
    rough = g.math("ADD", rough, g.math("MULTIPLY", g.math("SUBTRACT", g.noise(pos, 1.3, 3.0), 0.5), 0.35))
    rough = g.mixf(fr, rough, 0.7)
    vq = g.voronoi(pos, 9.0)
    fl = g.math("MULTIPLY", g.math("SUBTRACT", 1.0, g.smooth(vq.outputs["Distance"], 0.02, 0.035)), 0.7)
    col = g.mix(fl, col, (0.45, 0.44, 0.42))
    rough = g.mixf(fl, rough, 0.3)
    if tri is not None:
        rough = g.mixf(tri, rough, 0.88)
    if cfg.get("lodes"):
        # the tin lodes in the shader from world position (a vertex attribute stair-stepped on the 0.25 m shell):
        # bands dipping 35 degrees, 0.25-0.4 m wide, their edges wobbled by noise (cfg lodes: (x, y, 'x'|'y'))
        px, py, pz = sep3(g, pos)
        wob = g.math("MULTIPLY", g.math("SUBTRACT", g.noise(pos, 2.2, 3.0), 0.5), 0.22)
        lode = None
        for lx, ly, axis in cfg["lodes"]:
            u = g.math("SUBTRACT", py if axis == "y" else px, ly if axis == "y" else lx)
            perp = g.math("ABSOLUTE", g.math("SUBTRACT", px if axis == "y" else py, lx if axis == "y" else ly))
            zc = g.math("ADD", g.math("MULTIPLY", u, 0.7), 1.4)
            dz = g.math("ABSOLUTE", g.math("ADD", g.math("SUBTRACT", pz, zc), wob))
            band = g.math("SUBTRACT", 1.0, g.smooth(dz, 0.11, 0.19))
            band = g.math("MULTIPLY", band, g.math("SUBTRACT", 1.0, g.smooth(g.math("ABSOLUTE", u), 0.75, 0.95)))
            band = g.math("MULTIPLY", band, g.math("SUBTRACT", 1.0, g.smooth(perp, 0.6, 0.9)))
            lode = band if lode is None else g.math("MAXIMUM", lode, band)
        lode = g.math("MULTIPLY", lode, g.smooth(g.noise(pos, 3.5, 4.0, 0.6), 0.3, 0.55))   # broken, not a smooth ribbon
        cfg = dict(cfg, lode=True)
    if cfg.get("lode"):
        vl = g.voronoi(pos, 30.0)
        rnd, _g2, _b2 = sep3(g, vl.outputs["Color"])
        cry = g.math("MULTIPLY", g.math("SUBTRACT", 1.0, g.smooth(vl.outputs["Distance"], 0.25, 0.35)), g.smooth(rnd, 0.45, 0.55))
        col = g.mix(g.math("MULTIPLY", lode, 0.65), col, (0.24, 0.23, 0.21))   # dull quartz: the cassiterite glints carry it
        cm = g.math("MULTIPLY", lode, cry)
        col = g.mix(cm, col, (0.03, 0.025, 0.02))
        rough = g.mixf(cm, rough, 0.12)
    g.link(col, b.inputs["Base Color"])
    g.link(rough, b.inputs["Roughness"])
    # fine relief from the scan's luma (the strata), broken by noise, then mid-scale relief so a wall reads as rock
    bp = _new(g.n, "ShaderNodeBump")
    bp.inputs["Strength"].default_value = cfg.get("bump", 0.3)
    bp.inputs["Distance"].default_value = 0.03
    g.link(g.math("MULTIPLY", g.gray(col), g.math("ADD", g.noise(pos, 0.9, 3.0), 0.3)), bp.inputs["Height"])
    bp2 = _new(g.n, "ShaderNodeBump")
    bp2.inputs["Strength"].default_value = cfg.get("relief", 0.55)
    bp2.inputs["Distance"].default_value = 0.2
    g.link(g.noise(pos, 0.75, 4.0, 0.55), bp2.inputs["Height"])
    g.link(bp.outputs["Normal"], bp2.inputs["Normal"])
    g.link(bp2.outputs["Normal"], b.inputs["Normal"])
    if cfg.get("glow"):
        # glowing moss in the crevices only: irregular clumps of many sizes (thresholded fractal noise on warped
        # coordinates) where the scan is dark, over a faint base; no voronoi dots
        warp = _new(g.n, "ShaderNodeTexNoise")
        g.link(pos, warp.inputs["Vector"])
        warp.inputs["Scale"].default_value = 2.5
        wv = _new(g.n, "ShaderNodeVectorMath", operation="MULTIPLY_ADD")
        g.link(warp.outputs["Color"], wv.inputs[0])
        wv.inputs[1].default_value = (0.25, 0.25, 0.25)
        g.link(pos, wv.inputs[2])
        clumps = g.smooth(g.noise(wv.outputs["Vector"], 6.0, 5.0, 0.62), 0.56, 0.64)
        crev = g.math("SUBTRACT", 1.0, g.smooth(g.gray(col), 0.05, 0.15))
        base = g.mixf(tri, 0.12, 0.03) if tri is not None else 0.12
        e = g.math("MULTIPLY", glow, g.math("ADD", base, g.math("MULTIPLY", g.math("MULTIPLY", clumps, crev), 0.88)))
        e = g.math("MULTIPLY", e, g.value(cfg.get("glow_strength", 1.8), "P_moss_strength"))
        b.inputs["Emission Color"].default_value = (*cfg["glow"], 1.0)
        g.link(e, b.inputs["Emission Strength"])
    nodes, links = m.node_tree.nodes, m.node_tree.links
    out = next(n for n in nodes if n.type == "OUTPUT_MATERIAL")
    _x, _y, z = sep3(g, pos)
    cut = g.math("GREATER_THAN", z, g.value(100.0, "P_cut_z"))
    tr = _new(nodes, "ShaderNodeBsdfTransparent")
    mix = _new(nodes, "ShaderNodeMixShader")
    links.new(cut, mix.inputs[0])
    links.new(b.outputs[0], mix.inputs[1])
    links.new(tr.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], out.inputs["Surface"])
    _cull(m)
    if hasattr(m, "use_transparent_shadow"):
        m.use_transparent_shadow = False   # the cutaway only hides the rock from the camera: it still keeps the moon out
    return m


def build_shell(cv: CaveCfg, wall_mat, roof_mat, name: str = "HM_Rock"):
    """The walls (rings up every wall loop, displaced by noise, ledges and the lean) and the roof (a height field
    over the air) as one object with two materials; per-vertex wdi_r and wdi_q for the rock material."""
    fd = cv.fd
    verts, faces, fmat, ar, aq = [], [], [], [], []
    loops = fd.loops(0.28)
    for loop in loops:
        n = len(loop)
        zb = [cv.floor_raw(x, y) - 0.6 for x, y in loop]
        zt = [cv.springline(x, y) + 0.15 for x, y in loop]
        # the ring count from the base spring line: a cave's own wander (the stope's) must not re-slice every wall
        K = max(4, int(math.ceil((max(CaveCfg.springline(cv, x, y) + 0.15 for x, y in loop) - min(zb)) / 0.25)))
        base = len(verts)
        for i in range(n):
            x, y = loop[i]
            px, py = loop[i - 1]
            qx, qy = loop[(i + 1) % n]
            ln = math.hypot(qx - px, qy - py) or 1.0
            nx, ny = (qy - py) / ln, -(qx - px) / ln   # toward the rock (the air is on the loop's left)
            lean = cv.lean(x, y)
            for k in range(K + 1):
                z = zb[i] + (zt[i] - zb[i]) * k / K
                d = cv.wall_disp(x, y, z, lean, zt[i])
                vx, vy = x + nx * d, y + ny * d
                verts.append((vx, vy, z))
                r, q = cv.wall_attrs(vx, vy, z)
                ar.extend(r)
                aq.extend(q)
        for i in range(n):
            i2 = (i + 1) % n
            if cv.open_wall(*loop[i]) or cv.open_wall(*loop[i2]):
                continue
            for k in range(K):
                a, b = base + i * (K + 1) + k, base + i2 * (K + 1) + k
                faces.append((a, a + 1, b + 1, b))
                fmat.append(0)
    idx = -np.ones(fd.f.shape, dtype=np.int64)
    for j, i in zip(*np.nonzero(fd.f > -0.45)):
        x, y = float(fd.X[i]), float(fd.Y[j])
        if cv.roof_hole(x, y):
            continue
        z = cv.roof_z(x, y, float(fd.f[j, i]))
        idx[j, i] = len(verts)
        verts.append((x, y, z))
        r, q = cv.wall_attrs(x, y, z)
        ar.extend(r)
        aq.extend(q)
    ok = (idx[:-1, :-1] >= 0) & (idx[1:, :-1] >= 0) & (idx[1:, 1:] >= 0) & (idx[:-1, 1:] >= 0)
    for j, i in zip(*np.nonzero(ok)):
        faces.append((int(idx[j, i]), int(idx[j + 1, i]), int(idx[j + 1, i + 1]), int(idx[j, i + 1])))  # facing down
        fmat.append(1)
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    set_attr4(me, "wdi_r", ar)
    set_attr4(me, "wdi_q", aq)
    me.materials.append(wall_mat)
    me.materials.append(roof_mat)
    me.polygons.foreach_set("material_index", fmat)
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    ob = bpy.data.objects.new(name, me)
    COL["world"].objects.link(ob)
    print(f"SHELL {name}: {len(loops)} wall loops, {len(verts)} points, {len(faces)} faces", flush=True)
    return ob, loops


def cliff_face(cv: CaveCfg, name: str, axis: str, at: float, u0: float, u1: float, z0: float, z1: float, outward: float,
               hole, mat, step: float = 0.3):
    """The outside face of the rock round an opening: a displaced grid in the plane axis = at (axis 'x' or 'y'),
    facing `outward` (+1 or -1) along that axis, with hole(u, z) left open."""
    us = grid_axis([(u0, u1, step)])
    zs = grid_axis([(z0, z1, step)])
    nu, nz = len(us), len(zs)
    verts, ar, aq = [], [], []
    for z in zs:
        for u in us:
            d = 0.25 * abs(n3(u, at, z, 0.8)) + 0.1 * fbm(u, z, 0.7, 2)
            p = (at + outward * d, u) if axis == "x" else (u, at + outward * d)
            verts.append((p[0], p[1], z))
            r, q = cv.wall_attrs(p[0], p[1], z)
            ar.extend(r)
            aq.extend(q)
    faces = []
    for k in range(nz - 1):
        for i in range(nu - 1):
            if hole((us[i] + us[i + 1]) / 2, (zs[k] + zs[k + 1]) / 2):
                continue
            a, b, c, d = k * nu + i, k * nu + i + 1, (k + 1) * nu + i + 1, (k + 1) * nu + i
            facing_plus = (axis == "x") == (outward > 0)
            if axis == "y":
                faces.append((a, b, c, d) if outward < 0 else (a, d, c, b))
            else:
                faces.append((a, b, c, d) if facing_plus else (a, d, c, b))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    set_attr4(me, "wdi_r", ar)
    set_attr4(me, "wdi_q", aq)
    me.materials.append(mat)
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    ob = bpy.data.objects.new(name, me)
    COL["world"].objects.link(ob)
    return ob


def build_hull(name: str, outer, t: float = 1.0, holes: dict | None = None, skip=()):
    """Closed 1 m slabs round a cave, seen only by shadows: outer = (x0, y0, z0, x1, y1, z1); holes = {side: (a0, a1,
    b0, b1)} in the slab's own two axes (S/N: x and z; E/W: y and z; top: x and y); `skip` names sides left out where
    other rock (a cliff face) closes them, so a slab never walls in ground outside. Every floor and water surface must
    lie above z0 + t and inside the side slabs: a point inside a slab is in shadow for every light."""
    holes = holes or {}
    x0, y0, z0, x1, y1, z1 = outer
    mat = flat_mat("W_hull", INK, 1.0)
    mb = MB()

    def slab(axis, c0, c1, a0, a1, b0, b1, hole):
        rects = [(a0, a1, b0, b1)] if hole is None else [(a0, hole[0], b0, b1), (hole[1], a1, b0, b1),
                                                          (hole[0], hole[1], b0, hole[2]), (hole[0], hole[1], hole[3], b1)]
        for p0, p1, q0, q1 in rects:
            if p1 - p0 < 1e-3 or q1 - q0 < 1e-3:
                continue
            if axis == "y":
                mb.box(p1 - p0, c1 - c0, q1 - q0, M4((p0 + p1) / 2, (c0 + c1) / 2, (q0 + q1) / 2), mat)
            elif axis == "x":
                mb.box(c1 - c0, p1 - p0, q1 - q0, M4((c0 + c1) / 2, (p0 + p1) / 2, (q0 + q1) / 2), mat)
            else:
                mb.box(p1 - p0, q1 - q0, c1 - c0, M4((p0 + p1) / 2, (q0 + q1) / 2, (c0 + c1) / 2), mat)

    for side, args in (("S", ("y", y0, y0 + t, x0, x1, z0, z1)), ("N", ("y", y1 - t, y1, x0, x1, z0, z1)),
                       ("W", ("x", x0, x0 + t, y0 + t, y1 - t, z0, z1)), ("E", ("x", x1 - t, x1, y0 + t, y1 - t, z0, z1)),
                       ("top", ("z", z1 - t, z1, x0 + t, x1 - t, y0 + t, y1 - t)),
                       ("bottom", ("z", z0, z0 + t, x0 + t, x1 - t, y0 + t, y1 - t))):
        if side not in skip:
            slab(*args, holes.get(side))
    ob = mb.build(name, col="world")
    ob.visible_camera = False
    ob.visible_shadow = True
    return ob


def cut_only_mat(name: str, color, emit, role: str | None = None, k: float = 1.0, noise: float = 0.0) -> bpy.types.Material:
    """A material seen only by the cutaway stills: transparent unless the look's P_cut_z is set (below 50 m), and
    faintly self-lit (`emit` = scene-linear radiance), since nothing lights the section or the land around a cave."""
    m = bpy.data.materials.new(name)
    b = vb._principled(m)
    g = vb.G(m.node_tree)
    pos = g.position()
    col = g.rgb(color)
    if role:
        col = mul_rgb(g, g.scale(box_tex(g, role, blend=0.4), k), color)
    shade = g.math("ADD", 1.0 - noise, g.math("MULTIPLY", g.noise(pos, 0.35, 3.0), 2.0 * noise)) if noise else 1.0
    g.link(col, b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.9
    b.inputs["Emission Color"].default_value = (*emit[:3], 1.0)
    g._in(b.inputs["Emission Strength"], g.math("MULTIPLY", g.math("ADD", g.gray(col), 0.5), shade) if role else shade)
    nodes, links = m.node_tree.nodes, m.node_tree.links
    out = next(n for n in nodes if n.type == "OUTPUT_MATERIAL")
    hide = g.math("GREATER_THAN", g.value(100.0, "P_cut_z"), 50.0)
    tr = _new(nodes, "ShaderNodeBsdfTransparent")
    mix = _new(nodes, "ShaderNodeMixShader")
    links.new(hide, mix.inputs[0])
    links.new(b.outputs[0], mix.inputs[1])
    links.new(tr.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], out.inputs["Surface"])
    return m


# The cutaway stills (views with cut_z) show the cave cut out of a snowy hill: the rock above the cut is hidden from
# the camera (P_cut_z); the section is a rock face (strata, joints) inside a ragged outline, ringed by the hill's skin
# of snow and soil where its flank meets the cut, and the flanks fall away into snow ground with outcrops, boulders and
# pines (a flat slab with ruler edges on a bare plain read as a CAD block on a table: reviews, 2026-11-12). All of it
# lives in the collection HM_Cutaway, left out of the render except by the cutaway stills (their views 'show' it), and
# is lit by its own moon, L_cut_moon, light-linked to the land, the section and their dressing only: the cave rock
# above the cut, the shell and the hull cast no shadow from it, and nothing inside the cave takes its light.
CUT_RES = 0.5


def cut_collections():
    """HM_Cutaway (hidden from the render; a cutaway still shows it by name) and the moon's linking collections."""
    if "cutaway" not in COL:
        c = bpy.data.collections.new("HM_Cutaway")
        bpy.context.scene.collection.children.link(c)
        c.hide_render = True
        COL["cutaway"] = c
        for key, name in (("cut_recv", "HM_CutRecv"), ("cut_block", "HM_CutBlock")):
            lc = bpy.data.collections.new(name)
            lc.use_fake_user = True   # referenced by the light's linking only
            COL[key] = lc
    return COL["cutaway"], COL["cut_recv"], COL["cut_block"]


def cut_link(o, recv: bool = True, block: bool = True) -> None:
    """Move an object into HM_Cutaway and add it to the cutaway moon's receivers and shadow blockers."""
    cc, rc, bc = cut_collections()
    for c in list(o.users_collection):
        if c is not cc:
            c.objects.unlink(o)
    if cc not in o.users_collection:
        cc.objects.link(o)
    for want, c in ((recv, rc), (block, bc)):
        if want and o.name not in c.objects:
            c.objects.link(o)


def _cv_vmul(g, vec, k):
    n = _new(g.n, "ShaderNodeVectorMath", operation="MULTIPLY")
    g.link(vec, n.inputs[0])
    n.inputs[1].default_value = k
    return n.outputs["Vector"]


def _cv_warp(g, vec, scale: float, amount: float):
    """vec moved by a noise colour (0..amount on x and y): a domain warp."""
    wn = _new(g.n, "ShaderNodeTexNoise")
    g.link(vec, wn.inputs["Vector"])
    wn.inputs["Scale"].default_value = scale
    wn.inputs["Detail"].default_value = 2.0
    n = _new(g.n, "ShaderNodeVectorMath", operation="MULTIPLY_ADD")
    g.link(wn.outputs["Color"], n.inputs[0])
    n.inputs[1].default_value = (amount, amount, 0.0)
    g.link(vec, n.inputs[2])
    return n.outputs["Vector"]


def cut_rock_mat(hair_joints: bool = False) -> bpy.types.Material:
    """C_section: the hill's rock in section: the rock_face scan (box-projected, flat on the cut, so nothing smears)
    mixed with wet rock by large noise, faint strata bands running across the cut, a few long dark joints, and at the
    hill's edge (point attribute wdi_edge, metres in from the outline; 9 on the cap itself) the hill's skin in
    section: a ragged line of snow, then dark soil, then the rock. Lit by the cutaway moon only. With `hair_joints`
    (round 3, the cave overviews) the joints are jagged hairlines broken into short runs with almost no bump (smooth,
    even and embossed they read as cables or tyre tracks looping over a slab); without it, as before (sea_exit)."""
    if "C_section" in _MATS:
        return _MATS["C_section"]
    m = bpy.data.materials.new("C_section")
    b = vb._principled(m)
    g = vb.G(m.node_tree)
    pos = g.position()
    col = g.desat(g.scale(box_tex(g, "rock_face", blend=0.4), 1.35), 0.9)
    col2 = g.desat(g.scale(box_tex(g, "wet_rock", zoom=1.7, blend=0.4), 1.2), 0.9)
    col = mul_rgb(g, g.mix(g.smooth(g.noise(pos, 0.12, 3.0), 0.48, 0.62), col, col2), (0.86, 0.92, 1.0))   # grey, not brown
    x, y, _z = sep3(g, pos)
    u = g.math("ADD", g.math("ADD", g.math("MULTIPLY", x, 0.55), g.math("MULTIPLY", y, 0.83)),
               g.math("MULTIPLY", g.math("SUBTRACT", g.noise(pos, 0.035, 2.0), 0.5), 9.0))
    strata = g.math("SINE", g.math("MULTIPLY", u, 2.0 * math.pi / 4.2))
    fine = g.math("SINE", g.math("MULTIPLY", u, 2.0 * math.pi / 0.7))
    bed = g.smooth(g.noise(_cv_vmul(g, pos, (0.83, -0.55, 1.0)), 0.5, 3.0), 0.4, 0.62)   # beds broken along their run
    body = g.smooth(g.noise(pos, 0.05, 3.0), 0.35, 0.65)                                   # large light and dark bodies
    col = scale_by(g, col, g.math("ADD", g.math("ADD", 0.6, g.math("MULTIPLY", body, 0.32)),
                                  g.math("ADD", g.math("MULTIPLY", strata, g.math("ADD", 0.1, g.math("MULTIPLY", bed, 0.16))),
                                         g.math("MULTIPLY", fine, 0.07))))
    # joints: a few long wandering cracks (isolines of two slow noises), broken so only some run
    jn = g.noise(_cv_warp(g, pos, 0.05, 2.0), 0.06, 2.0)
    jn2 = g.noise(_cv_vmul(g, pos, (0.5, 1.4, 1.0)), 0.09, 2.0)
    joint = g.math("MAXIMUM", g.math("SUBTRACT", 1.0, g.smooth(g.math("ABSOLUTE", g.math("SUBTRACT", jn, 0.5)), 0.0025, 0.006)),
                   g.math("MULTIPLY", g.math("SUBTRACT", 1.0, g.smooth(g.math("ABSOLUTE", g.math("SUBTRACT", jn2, 0.5)), 0.002, 0.005)), 0.8))
    joint = g.math("MULTIPLY", joint, g.smooth(g.noise(pos, 0.08, 2.0), 0.4, 0.58))
    if hair_joints:   # thinner, jagged at the metre scale, broken into short runs (no closed loops)
        wp = _cv_warp(g, _cv_warp(g, pos, 0.05, 2.0), 0.7, 0.35)
        hn = g.noise(wp, 0.06, 2.0)
        hn2 = g.noise(_cv_vmul(g, _cv_warp(g, pos, 0.8, 0.3), (0.5, 1.4, 1.0)), 0.09, 2.0)
        joint = g.math("MAXIMUM", g.math("SUBTRACT", 1.0, g.smooth(g.math("ABSOLUTE", g.math("SUBTRACT", hn, 0.5)), 0.0008, 0.0024)),
                       g.math("MULTIPLY", g.math("SUBTRACT", 1.0, g.smooth(g.math("ABSOLUTE", g.math("SUBTRACT", hn2, 0.5)), 0.0007, 0.002)),
                              0.8))
        joint = g.math("MULTIPLY", g.math("MULTIPLY", joint, g.smooth(g.noise(pos, 0.08, 2.0), 0.4, 0.58)),
                       g.smooth(g.noise(pos, 0.45, 2.0), 0.46, 0.56))
    col = g.mix(g.math("MULTIPLY", joint, 0.8), col, g.scale(col, 0.25))
    d = g.math("ADD", attr1(g, "wdi_edge"), g.math("MULTIPLY", g.math("SUBTRACT", g.noise(pos, 1.6, 3.0), 0.5), 0.24))
    soil = g.desat(g.scale(box_tex(g, "soil", blend=0.4), 0.42), 0.45)
    soil_m = g.math("SUBTRACT", 1.0, g.smooth(d, 0.6, 0.78))
    col = g.mix(soil_m, col, soil)
    # the snow cover in section: a thin broken line at the very edge (a full white band read as icing on a cake)
    snow_m = g.math("MULTIPLY", g.math("SUBTRACT", 1.0, g.smooth(d, 0.04, 0.1)), g.smooth(g.noise(pos, 0.9, 2.0), 0.38, 0.52))
    col = g.mix(snow_m, col, (0.78, 0.83, 0.90))
    g.link(col, b.inputs["Base Color"])
    g.link(g.mixf(snow_m, 0.86, 0.6), b.inputs["Roughness"])
    # a rough-cut relief that the low moon rakes (a flat-lit plane read as a table top)
    bp = _new(g.n, "ShaderNodeBump")
    bp.inputs["Strength"].default_value = 0.9
    bp.inputs["Distance"].default_value = 0.05
    g.link(g.math("SUBTRACT", g.math("ADD", g.math("MULTIPLY", g.gray(col), 0.6), g.math("MULTIPLY", g.noise(pos, 1.8, 4.0), 0.8)),
                  g.math("MULTIPLY", joint, 0.08 if hair_joints else 0.5)), bp.inputs["Height"])
    g.link(bp.outputs["Normal"], b.inputs["Normal"])
    _MATS["C_section"] = m
    return m


def cut_snow_mat() -> bpy.types.Material:
    """C_cut_snow: the hill and the ground round the cut: the snow scan at two scales under a cool tint broken by
    large noise, streaks along the wind, frost sparkle, and rock outcrops through it where the point attribute
    wdi_rock says, with snow lying on their up-facing tops. Lit by the cutaway moon only."""
    if "C_cut_snow" in _MATS:
        return _MATS["C_cut_snow"]
    m = bpy.data.materials.new("C_cut_snow")
    b = vb._principled(m)
    g = vb.G(m.node_tree)
    pos = g.position()
    uv = _new(g.n, "ShaderNodeUVMap").outputs["UV"]
    which = g.smooth(g.noise(pos, 0.18, 3.0), 0.38, 0.62)
    stex = g.mix(which, g.tex(uv, "snow", "diff", RES), g.tex(uv, "snow", "diff", RES, zoom=2.7, turn=0.62))
    snor = g.mix(which, g.tex(uv, "snow", "nor_gl", RES), g.tex(uv, "snow", "nor_gl", RES, zoom=2.7, turn=0.62))
    tint = g.mix(g.noise(pos, 0.05, 3.0), (0.60, 0.66, 0.78), (0.84, 0.88, 0.95))
    snow = scale_by(g, tint, g.math("ADD", g.math("MULTIPLY", g.gray(stex), 0.5), 0.62))
    snow = scale_by(g, snow, g.math("ADD", g.math("MULTIPLY", g.gray(g.tex(uv, "snow_field", "diff", RES)), 0.55), 0.62))
    streak = g.noise(_cv_vmul(g, pos, (0.22, 1.0, 1.0)), 0.8, 4.0, 0.6)
    snow = scale_by(g, snow, g.math("ADD", 0.84, g.math("MULTIPLY", streak, 0.3)))
    geo = _new(g.n, "ShaderNodeNewGeometry")
    _nx, _ny, nz = sep3(g, geo.outputs["Normal"])
    rk = g.math("ADD", attr1(g, "wdi_rock"), g.math("MULTIPLY", g.math("SUBTRACT", g.noise(pos, 1.3, 3.0), 0.5), 0.35))
    rmask = g.smooth(rk, 0.55, 0.62)
    rmask = g.math("MULTIPLY", rmask, g.math("SUBTRACT", 1.0, g.math("MULTIPLY", g.smooth(nz, 0.9, 0.97),
                                                                       g.smooth(g.noise(pos, 0.8, 3.0), 0.45, 0.6))))
    rock = mul_rgb(g, g.desat(g.scale(box_tex(g, "rock_face", blend=0.4), 0.75), 0.7), (0.86, 0.92, 1.0))
    col = g.mix(rmask, snow, rock)
    g.link(col, b.inputs["Base Color"])
    g.link(g.mixf(rmask, 0.62, 0.85), b.inputs["Roughness"])
    sv = g.voronoi(pos, 34.0)
    sr, _sg, _sb = sep3(g, sv.outputs["Color"])
    spark = g.math("MULTIPLY", g.math("SUBTRACT", 1.0, g.smooth(sv.outputs["Distance"], 0.08, 0.2)), g.smooth(sr, 0.975, 0.985))
    b.inputs["Emission Color"].default_value = (0.80, 0.88, 1.0, 1.0)
    g.link(g.math("MULTIPLY", g.math("MULTIPLY", spark, g.math("SUBTRACT", 1.0, rmask)), 0.5), b.inputs["Emission Strength"])
    nmap = _new(g.n, "ShaderNodeNormalMap", space="TANGENT", uv_map="UVMap")
    nmap.inputs["Strength"].default_value = 0.6
    g.link(snor, nmap.inputs["Color"])
    bp = _new(g.n, "ShaderNodeBump")
    bp.inputs["Strength"].default_value = 0.35
    bp.inputs["Distance"].default_value = 0.06
    g.link(g.math("ADD", g.math("MULTIPLY", streak, 0.6), g.math("MULTIPLY", rmask, g.gray(rock))), bp.inputs["Height"])
    g.link(nmap.outputs["Normal"], bp.inputs["Normal"])
    g.link(bp.outputs["Normal"], b.inputs["Normal"])
    _MATS["C_cut_snow"] = m
    return m


def _grid_eval(X, Y, fn) -> np.ndarray:
    """fn(x, y) (a scalar function) over the 1-D axes X (columns) and Y (rows)."""
    return np.array([[fn(float(x), float(y)) for x in X] for y in Y])


def _grid_at(grid, x0: float, y0: float, res: float, x: float, y: float) -> float:
    """Bilinear sample of a raster whose cell (0, 0) sits at (x0, y0)."""
    ny, nx = grid.shape
    fx, fy = (x - x0) / res, (y - y0) / res
    i, j = int(min(max(math.floor(fx), 0), nx - 2)), int(min(max(math.floor(fy), 0), ny - 2))
    ax, ay = clamp(fx - i), clamp(fy - j)
    return float(grid[j, i] * (1 - ax) * (1 - ay) + grid[j, i + 1] * ax * (1 - ay) + grid[j + 1, i] * (1 - ax) * ay +
                 grid[j + 1, i + 1] * ax * ay)


def cutaway(cv: CaveCfg, loops, z: float, extent, ground, clip=None, clamp_hole=None, drop=None, keep=None, limit=None,
            margin=(1.5, 8.0), skirt=(7.0, 11.0), fill_rect=None, fill: float = 0.3, moon=(325.0, 25.0, 0.8),
            seed: int = 0, trees: int = 60, rocks: int = 12, frame=None, tree_keep=None, skip_lights=(), cliff=None,
            inside: float = 0.0, tree_lod: float = 0.12, near_trees: bool = False, ice_below: float | None = -0.3,
            hair_joints: bool = False, tree_drop=None):
    """The cutaway still's hill, cut at height z (see CUT_RES above). On a raster over `extent` (x0, y0, x1, y1): the
    cave's footprint (its air and 0.7 m of rock) closed (concavities filled) and grown by a noisy margin is the hill's
    section; clip(x, y) caps that field (a cliff: the section ends at its line); the outline is the field's zero line
    (marching squares), the holes are the cave's wall loops at the cut (clamp_hole pulls a hole point back inside the
    outline where the cave runs out through a cliff, drop(x, y) removes the section over a mouth). Outside the outline
    the flank falls from the cut height to ground(x, y) over a noisy skirt, lumpy, with outcrops; limit(x, y) caps its
    height (a cove, the strip below a cliff) and keep(x, y) drops land cells (where the scene has its own ground), as
    does ice_below (land lower than that lies under a lake's ice; None where there is no lake);
    cliff(x, y) says where a cliff face closes the section's clipped edge (no land along its top there); `inside` > 0
    adds L_cut_moon_in, that moon at that strength on the cave itself, blocked by the props alone (in a cutaway the
    rock above is gone), so the props stand out and lay long shadows.
    Boulders and pines (their own random sequence) stand on the land inside `frame` (a polygon of the still's ground
    footprint), never closer to the section than the skirt; the pines are the `tree_lod` masters, or with `near_trees`
    the near_tree masters at that LOD (welded, smooth-shaded, base sunk); tree_drop(x, y) leaves out a pine the plan
    stands there (drawn and spaced as before, so the others keep their places); `hair_joints` gives the section's
    rock hairline joints (cut_rock_mat). moon = (azimuth, elevation, strength) of L_cut_moon;
    skip_lights names the scene's lights that must leave the cutaway alone (the look's moon HM_Moon where a scene keeps
    it on, a moon light on the strip or the lake: the hull's long shadow lay over the land). L_cut_fill (left
    out of the render; the cutaway still shows it) lights the cave floor from just under the cut, `fill` W/m2 over
    fill_rect, shadowed, with no glint and no glow in the fog. Returns the land height sampler."""
    rng = random.Random(7000 + seed)
    x0, y0, x1, y1 = extent
    hf = Field(x0, y0, x1, y1, CUT_RES)
    X, Y = hf.X, hf.Y
    X2, Y2 = np.meshgrid(X, Y)
    # the footprint: the cave's air and 0.7 m of rock (the shell and its lumps), from the cave's own raster
    fd = cv.fd
    fx, fy = (X2 - fd.x0) / fd.res, (Y2 - fd.y0) / fd.res
    inb = (fx >= 0) & (fy >= 0) & (fx < fd.nx - 1) & (fy < fd.ny - 1)
    i = np.clip(np.floor(fx).astype(int), 0, fd.nx - 2)
    j = np.clip(np.floor(fy).astype(int), 0, fd.ny - 2)
    ax, ay = np.clip(fx - i, 0, 1), np.clip(fy - j, 0, 1)
    fv = (fd.f[j, i] * (1 - ax) * (1 - ay) + fd.f[j, i + 1] * ax * (1 - ay) + fd.f[j + 1, i] * (1 - ax) * ay +
          fd.f[j + 1, i + 1] * ax * ay)
    air = inb & (fv > -0.7)
    # closed: grown 6 m and shrunk 4.5 m (fills the bays between the drifts: a hill, not a map of the tunnels)
    grown = _chamfer(~air, CUT_RES, 8.0) < 6.0
    closed = (_chamfer(grown, CUT_RES, 8.0) > 4.5) | air
    D = _chamfer(~closed, CUT_RES, 60.0)
    m = _grid_eval(X, Y, lambda x, y: margin[0] + (margin[1] - margin[0]) * clamp(0.5 + 1.1 * fbm(x, y, 0.035, 2)) +
                   1.0 * fbm(x + 3.0, y, 0.12, 2) + 0.25 * fbm(x, y + 5.0, 0.6, 2))
    F_hill = np.maximum(m, 0.9) - D
    F = F_hill if clip is None else np.minimum(F_hill, _grid_eval(X, Y, clip))
    F[0, :] = F[-1, :] = -1.0
    F[:, 0] = F[:, -1] = -1.0
    t = np.maximum(0.0, -F)
    S = _grid_eval(X, Y, lambda x, y: skirt[0] + (skirt[1] - skirt[0]) * clamp(0.5 + 0.9 * fbm(x + 11.0, y, 0.04, 2)))
    G = _grid_eval(X, Y, ground)
    u = np.clip(t / S, 0.0, 1.0)
    H = G + (z - G) * (1.0 - u) ** 1.7
    lump = _grid_eval(X, Y, lambda x, y: 0.22 * fbm(x, y, 0.35, 3) + 0.12 * fbm(x * 0.35 + 9.0, y, 0.9, 2))
    crop = _grid_eval(X, Y, lambda x, y: clamp((fbm(x + 20.0, y, 0.1, 3) + 0.05) / 0.25) * (0.7 + 0.5 * fbm(x, y, 0.8, 2)))
    near = _np_sstep(0.4, 2.5, t)
    out = _np_sstep(0.8, 2.5, t) * (1.0 - _np_sstep(S + 3.0, S + 12.0, t))
    rock = np.clip(crop, 0.0, 1.0) * out
    H = H + lump * near + 0.55 * rock
    if limit is not None:
        H = np.minimum(H, _grid_eval(X, Y, limit))
    H = np.minimum(H, z - 0.03)
    hf.f = F

    def Hat(x, y):
        return _grid_at(H, x0, y0, CUT_RES, x, y)

    # the outline: the field's zero line; the cave's wall loops at the cut height are the holes
    outs = hf.loops(0.3)
    if not outs:
        print("CUTAWAY: no section outline", flush=True)
        return Hat

    def area(lp):
        return abs(sum(a[0] * b_[1] - b_[0] * a[1] for a, b_ in zip(lp, lp[1:] + lp[:1]))) / 2.0

    outs.sort(key=area, reverse=True)
    outer = outs[0]
    holes, rims = [], []
    for loop in loops:
        n = len(loop)
        hole, rim = [], []
        for k in range(n):
            x, y = loop[k]
            px, py = loop[k - 1]
            qx, qy = loop[(k + 1) % n]
            ln = math.hypot(qx - px, qy - py) or 1.0
            nx_, ny_ = (qy - py) / ln, -(qx - px) / ln   # toward the rock
            zt = cv.springline(x, y) + 0.15
            d = cv.wall_disp(x, y, min(z, zt), cv.lean(x, y), zt) - 0.06   # 6 cm over the wall's top
            hx, hy = x + nx_ * d, y + ny_ * d
            if clamp_hole is not None:
                hx, hy = clamp_hole(hx, hy)
            hole.append((hx, hy, z))
            rx, ry = hx + nx_ * 0.3, hy + ny_ * 0.3
            if clamp_hole is not None:
                rx, ry = clamp_hole(rx, ry)
            rim.append((rx, ry))
        holes.append(hole)
        rims.append((hole, rim))
    cc, rc, bc = cut_collections()
    rockm = cut_rock_mat(hair_joints)
    rimm = cut_only_mat("C_section_rim", (0.10, 0.105, 0.12), (0.028, 0.030, 0.036), role="rock_face", k=0.7)
    outer3 = [(px, py, z) for px, py in outer]
    pts = outer3 + [p for h in holes for p in h]
    tris = mathutils_tess([outer3] + holes)
    mb = MB()
    for a, b_, c in tris:
        cx = (pts[a][0] + pts[b_][0] + pts[c][0]) / 3
        cy = (pts[a][1] + pts[b_][1] + pts[c][1]) / 3
        if drop is not None and drop(cx, cy):
            continue
        mb.add([pts[a], pts[b_], pts[c]], [(0, 1, 2)], rockm)
    cap = mb.build("HM_SectionCap", col="cutaway", shadow=True)
    if cap is not None:
        set_attr1(cap.data, "wdi_edge", [9.0] * len(cap.data.vertices))
        cut_link(cap)
    # the hill's skin along the outline where the flank meets it (not where a cliff ends the section): a strip laid
    # 3 mm over the cap, wdi_edge running from 0 at the outline to 1 at its inner edge (snow, soil, then the rock)
    n = len(outer)
    wid = []
    for k in range(n):
        px, py = outer[k]
        natural = clip is None or _grid_at(F_hill, x0, y0, CUT_RES, px, py) < 0.15
        wid.append(clamp(0.45 * (_grid_at(D, x0, y0, CUT_RES, px, py) - 0.6), 0.0, 1.5) if natural else 0.0)
    wid = [sum(wid[(k + d) % n] for d in range(-4, 5)) / 9.0 for k in range(n)]
    verts, faces, edge = [], [], []
    for k in range(n):
        px, py = outer[k]
        ax_, ay_ = outer[k - 1]
        bx_, by_ = outer[(k + 1) % n]
        ln = math.hypot(bx_ - ax_, by_ - ay_) or 1.0
        inx, iny = -(by_ - ay_) / ln, (bx_ - ax_) / ln   # inward: the section lies left of the outline
        verts += [(px, py, z + 0.003), (px + inx * wid[k], py + iny * wid[k], z + 0.003)]
        edge += [0.0, 1.0]   # 0 at the outline, 1 at the strip's inner edge: the layers scale with its width
    for k in range(n):
        k2 = (k + 1) % n
        if wid[k] < 0.05 and wid[k2] < 0.05:
            continue
        if drop is not None and drop(*outer[k]):
            continue
        faces.append((2 * k, 2 * k2, 2 * k2 + 1, 2 * k + 1))
    if faces:
        used = sorted({v for f in faces for v in f})
        remap = {v: q for q, v in enumerate(used)}
        me = bpy.data.meshes.new("HM_SectionSkin")
        me.from_pydata([verts[v] for v in used], [], [tuple(remap[v] for v in f) for f in faces])
        me.update()
        set_attr1(me, "wdi_edge", [edge[v] for v in used])
        me.materials.append(rockm)
        sk = bpy.data.objects.new("HM_SectionSkin", me)
        cc.objects.link(sk)
        cut_link(sk, block=False)
    mb = MB()
    for hole, rim in rims:
        nh = len(hole)
        for k in range(nh):
            k2 = (k + 1) % nh
            a, b_ = hole[k], hole[k2]
            if drop is not None and drop((a[0] + b_[0]) / 2, (a[1] + b_[1]) / 2):
                continue
            mb.add([(a[0], a[1], z + 0.004), (b_[0], b_[1], z + 0.004), (rim[k2][0], rim[k2][1], z + 0.004),
                    (rim[k][0], rim[k][1], z + 0.004)], [(0, 1, 2, 3)], rimm)
    rim_ob = mb.build("HM_SectionRim", col="cutaway", shadow=False)
    if rim_ob is not None:
        cut_link(rim_ob, block=False)
    # the land: the raster's own points near the hill (every 0.5 m), every 2 m beyond
    near_hill = np.nonzero((F > -28.0).any(axis=0))[0], np.nonzero((F > -28.0).any(axis=1))[0]
    ix_lo, ix_hi = int(near_hill[0].min()), int(near_hill[0].max())
    iy_lo, iy_hi = int(near_hill[1].min()), int(near_hill[1].max())

    def pick(nn, lo, hi):
        return sorted({q for q in range(nn) if lo <= q <= hi or q % 4 == 0 or q == nn - 1})

    cols, rows = pick(len(X), ix_lo, ix_hi), pick(len(Y), iy_lo, iy_hi)
    vid, verts, faces, rk = {}, [], [], []
    for jj in range(len(rows) - 1):
        for ii in range(len(cols) - 1):
            c4 = ((rows[jj], cols[ii]), (rows[jj], cols[ii + 1]), (rows[jj + 1], cols[ii + 1]), (rows[jj + 1], cols[ii]))
            if all(F[r, q] > 0.02 for r, q in c4):
                continue   # under the section
            if ice_below is not None and all(H[r, q] < ice_below for r, q in c4):
                continue   # under the lake's ice (None where there is no lake: low ground left holes, black chips)
            cx = float(X[cols[ii]] + X[cols[ii + 1]]) / 2
            cy = float(Y[rows[jj]] + Y[rows[jj + 1]]) / 2
            if keep is not None and not keep(cx, cy):
                continue
            if fd.at(cx, cy, outside=-5.0) > -0.3 and F[rows[jj], cols[ii]] < 0.0:
                continue   # never over the cave where a cliff cuts the section (the mouth, the arch)
            if cliff is not None and cliff(cx, cy) and all(F[r, q] > -1.5 and F_hill[r, q] > F[r, q] + 0.05 for r, q in c4):
                continue   # where a cliff face closes the section's edge, no strip of snow along its top (a white coping)
            for key in c4:
                if key not in vid:
                    vid[key] = len(verts)
                    verts.append((float(X[key[1]]), float(Y[key[0]]), float(H[key])))
                    rk.append(float(rock[key]))
            faces.append(tuple(vid[key] for key in c4))
    me = bpy.data.meshes.new("HM_CutLand")
    me.from_pydata(verts, [], faces)
    me.update()
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    set_attr1(me, "wdi_rock", rk)
    vb.uv_world(me)
    me.materials.append(cut_snow_mat())
    land = bpy.data.objects.new("HM_CutLand", me)
    cc.objects.link(land)
    cut_link(land)
    # boulders on the flanks and pines on the ground below them (their own sequence: RNG stays as it was)
    fpoly = frame or [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]

    def in_frame(x, y):
        inside = False
        for k in range(len(fpoly)):
            (xa, ya), (xb, yb) = fpoly[k], fpoly[(k + 1) % len(fpoly)]
            if (ya > y) != (yb > y) and x < (xb - xa) * (y - ya) / (yb - ya) + xa:
                inside = not inside
        return inside

    def tval(x, y):
        return max(0.0, -_grid_at(F, x0, y0, CUT_RES, x, y))

    placed = 0
    for _ in range(rocks * 40):
        if placed >= rocks:
            break
        x, y = rng.uniform(x0 + 2, x1 - 2), rng.uniform(y0 + 2, y1 - 2)
        tt = tval(x, y)
        if not (0.8 < tt < 14.0) or not in_frame(x, y) or (keep is not None and not keep(x, y)) or Hat(x, y) < 0.0:
            continue
        slug = rng.choice(("rock_moss_set_01", "rock_moss_set_01", "rock_moss_set_02"))
        o = ph_place(cv.mp, slug, x, y, rot=rng.uniform(0, 360), size=rng.uniform(1.4, 3.4), piece=rng.randint(1, ph_count(slug)),
                     lod=0.5, z=Hat(x, y), sink_frac=0.35, col="cutaway", tilt=rng.uniform(0, 18), toward=rng.uniform(0, 360))
        cut_link(o)
        placed += 1
    stood = []
    for _ in range(trees * 40):
        if len(stood) >= trees:
            break
        x, y = rng.uniform(x0 + 2, x1 - 2), rng.uniform(y0 + 2, y1 - 2)
        tt = tval(x, y)
        if tt < _grid_at(S, x0, y0, CUT_RES, x, y) + 2.5 or not in_frame(x, y) or (keep is not None and not keep(x, y)):
            continue
        if Hat(x, y) < 0.05 or (tree_keep is not None and not tree_keep(x, y)):
            continue
        if fbm(x + 50.0, y, 0.045, 2) < -0.12 + 0.1 * rng.random():   # clearings between the clumps
            continue
        if any(math.hypot(x - px, y - py) < 3.6 for px, py in stood):
            continue
        name = rng.choice(("pine_tall", "pine_tall", "pine_short"))
        size = rng.uniform(11.5, 16.0) if name == "pine_tall" else rng.uniform(6.5, 9.0)
        rot_ = rng.uniform(0, 360)
        stood.append((x, y))
        if tree_drop is not None and tree_drop(x, y):
            continue   # drawn and spaced as if it stood, so every other pine stands where it did
        o = vb.place(cv.mp, name, x, y, rot=rot_, size=size, lod=tree_lod, col="cutaway", z=Hat(x, y) - 0.2, lamps=False)
        if near_trees:   # welded, smooth-shaded, the baked snow skirt sunk (decimated hard, they read as heaps of shards)
            o.data = near_tree(name, tree_lod).data
        cut_link(o)
    # the cutaway's moon, linked to the land, the section and their dressing
    az, el, energy = moon
    sun = bpy.data.objects.new("L_cut_moon", bpy.data.lights.new("L_cut_moon", "SUN"))
    sun.data.energy = energy
    sun.data.color = (0.80, 0.88, 1.0)
    sun.data.angle = math.radians(2.5)
    sun.data.use_shadow = True
    if hasattr(sun.data, "volume_factor"):
        sun.data.volume_factor = 0.0
    to_moon = Vector((math.cos(math.radians(el)) * math.cos(math.radians(az)), math.cos(math.radians(el)) * math.sin(math.radians(az)),
                      math.sin(math.radians(el))))
    sun.rotation_euler = (-to_moon).to_track_quat("-Z", "Y").to_euler()
    cc.objects.link(sun)
    sun.light_linking.receiver_collection = rc
    sun.light_linking.blocker_collection = bc
    if inside > 0.0:
        sin_ = bpy.data.objects.new("L_cut_moon_in", bpy.data.lights.new("L_cut_moon_in", "SUN"))
        sin_.data.energy = inside
        sin_.data.color = (0.80, 0.88, 1.0)
        sin_.data.angle = math.radians(2.5)
        sin_.data.use_shadow = True
        if hasattr(sin_.data, "volume_factor"):
            sin_.data.volume_factor = 0.0
        sin_.rotation_euler = sun.rotation_euler
        cc.objects.link(sin_)
        blk_in = bpy.data.collections.new("HM_CutInBlock")
        blk_in.use_fake_user = True
        for o in COL["models"].all_objects:
            if o.type == "MESH":
                blk_in.objects.link(o)
        sin_.light_linking.blocker_collection = blk_in
        skip_in = bpy.data.collections.new("HM_CutInSkip")   # the land keeps its own moon only
        skip_in.use_fake_user = True
        for o in list(rc.objects):
            skip_in.objects.link(o)
        for co in skip_in.collection_objects:
            co.light_linking.link_state = "EXCLUDE"
        sin_.light_linking.receiver_collection = skip_in
    if skip_lights:
        skip = bpy.data.collections.new("HM_CutSkip")
        skip.use_fake_user = True
        for o in list(rc.objects):
            skip.objects.link(o)
        for co in skip.collection_objects:
            co.light_linking.link_state = "EXCLUDE"   # only excluded objects: the light still lights all else
        for lname in skip_lights:
            lt = bpy.data.objects.get(lname)
            if lt is None and lname == "HM_Moon":   # the look reuses it by name and keeps its linking
                lt = bpy.data.objects.new("HM_Moon", bpy.data.lights.new("HM_Moon", "SUN"))
                bpy.context.scene.collection.objects.link(lt)
            if lt is None:
                print("CUTAWAY: no light", lname, flush=True)
                continue
            lt.light_linking.receiver_collection = skip
    # the fill for the cave floor (a cutaway still shows it by name)
    fx0, fy0, fx1, fy1 = fill_rect or extent
    w, h = fx1 - fx0, fy1 - fy0
    ld = bpy.data.lights.new("L_cut_fill", "AREA")
    ld.shape = "RECTANGLE"
    ld.size, ld.size_y = w, h
    ld.energy = fill * w * h
    ld.color = (0.55, 0.70, 1.0)
    ld.use_shadow = True
    ld.specular_factor = 0.0
    ld.volume_factor = 0.0
    lo = bpy.data.objects.new("L_cut_fill", ld)
    COL["lights"].objects.link(lo)
    lo.location = ((fx0 + fx1) / 2, (fy0 + fy1) / 2, z - 0.25)
    lo.hide_render = True   # untagged (the look leaves it alone): a cutaway still's views option shows it
    print(f"CUTAWAY at z {z:.2f}: outline {len(outer)} points ({len(outs)} loops), {len(holes)} holes, land {len(faces)} quads, "
          f"{placed} boulders, {len(stood)} pines, fill {ld.energy:.0f} W", flush=True)
    return Hat


def mathutils_tess(polys):
    """Triangles (index triples into the concatenated points) filling the first polygon minus the rest (scanfill)."""
    from mathutils.geometry import tessellate_polygon
    return tessellate_polygon([[Vector(p) for p in poly] for poly in polys])


def view_cut(scene_id: str) -> float | None:
    """The cut height of the scene's cutaway still (its views file's cut_z), or None."""
    path = os.path.join(VIEWS_DIR, f"{scene_id}.json")
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as fh:
        views = json.load(fh)
    for k, v in views.items():
        if not k.startswith("_") and len(v) > 3 and isinstance(v[3], dict) and "cut_z" in v[3]:
            return float(v[3]["cut_z"])
    return None


def soft_mist(name: str, rect, z0: float, top: float, density: float, soft: float = 1.5, node: str = "P_mist_density",
              color=(0.66, 0.70, 0.76), nscale: float = 0.3, emit=None, emit_strength: float = 0.0):
    """A low mist over rect (x0, y0, x1, y1) from z0, thinning out by `top`, with its sides faded over `soft` metres
    (a mist box with hard sides showed as a ruled edge), broken by noise."""
    x0, y0, x1, y1 = rect
    m = bpy.data.materials.new(name + "_vol")
    nodes, links = m.node_tree.nodes, m.node_tree.links
    for n in list(nodes):
        nodes.remove(n)
    g = vb.G(m.node_tree)
    pos = g.position()
    x, y, z = sep3(g, pos)
    d = g.value(density, node)
    d = g.math("MULTIPLY", d, g.math("ADD", 0.3, g.math("MULTIPLY", g.noise(pos, nscale, 3.0), 1.4)))
    d = g.math("MULTIPLY", d, g.math("SUBTRACT", 1.0, g.smooth(z, z0, top)))
    for v, a, b_ in ((x, x0, x1), (y, y0, y1)):
        d = g.math("MULTIPLY", d, g.math("MULTIPLY", g.smooth(v, a, a + soft), g.math("SUBTRACT", 1.0, g.smooth(v, b_ - soft, b_))))
    vol = _new(nodes, "ShaderNodeVolumePrincipled")
    vol.inputs["Color"].default_value = (*color[:3], 1.0)
    vol.inputs["Anisotropy"].default_value = 0.2
    g.link(d, vol.inputs["Density"])
    if emit is not None and emit_strength > 0:
        _sock(vol, "Emission Color").default_value = (*emit[:3], 1.0)
        _sock(vol, "Emission Strength").default_value = emit_strength
    out = _new(nodes, "ShaderNodeOutputMaterial")
    links.new(vol.outputs[0], out.inputs["Volume"])
    mb = MB()
    mb.box(x1 - x0, y1 - y0, top - z0 + 0.4, M4((x0 + x1) / 2, (y0 + y1) / 2, z0 - 0.2), m, base=True)
    return volume_object(name, mb)


def plane_probe(name: str, x0: float, y0: float, x1: float, y1: float, z: float):
    """A planar light probe on a still water surface: a true mirror instead of screen-space reflections that fall
    back to grainy probe blobs where the reflected rock is off screen. Not used in the caves: their shells' faces are
    back-face culled, so the mirrored capture loses the roof and sees the ink hull, and the water reflects black."""
    lp = bpy.data.lightprobes.new(name, "PLANE")
    ob = bpy.data.objects.new(name, lp)
    COL["world"].objects.link(ob)
    ob.location = ((x0 + x1) / 2, (y0 + y1) / 2, z)
    ob.scale = ((x1 - x0) / 2, (y1 - y0) / 2, 1.0)
    return ob


def cave_floor(cv: CaveCfg, sample, xs, ys, keep, cfg: dict):
    return build_grid("HM_Ground", xs, ys, sample, keep=keep, mat=ground_material(cfg))


def stalactites(cv: CaveCfg, spots, mat, name: str = "WP_stalactites") -> None:
    """Lumpy flowstone hung from the roof (spots = (x, y, length, base radius)): rings narrowing to a point with a
    wobble and swellings, flared where they leave the rock and sunk 0.25 m into it (not smooth cones floating under
    the brow); every tip at least 2 m up. Draws from RNG exactly as the old cones did, so the scene's sequence holds."""
    mb = MB()
    for x, y, ln, r in spots:
        f = cv.fd.at(x, y)
        top = cv.roof_z(x, y, f) + 0.25
        ln = min(ln, top - 0.25 - cv.floor(x, y) - 2.0)
        if ln <= 0.05:
            continue
        n = RNG.randint(8, 12)
        rz = math.radians(RNG.uniform(0, 360))
        jit = [RNG.uniform(-0.18, 0.18) for _ in range(n)]
        total, k = ln + 0.25, 8
        pts, rs = [], []
        for i in range(k + 1):
            t = i / k
            sway = 0.25 * r * t
            pts.append((x + sway * math.cos(rz + 2.0 * t), y + sway * math.sin(rz + 2.0 * t), top - total * t))
            taper = (1.0 - t) ** 1.3 * (1.0 + 0.9 * max(0.0, 0.3 - t) / 0.3)   # the flare at the rock
            rs.append(max(0.004, r * taper * (1.0 + jit[i % n] * 1.4)))
        mb.tube(pts, rs, n, mat, caps=True)
    mb.build(name, col="world", smooth=True)


def cone_icicles(mb: MB, pts, mat) -> None:
    for x, y, z, ln in pts:
        mb.cyl(RNG.uniform(0.015, 0.04), 0.0, ln, 8, M4(x, y, z, rx=180.0), mat, jitter=0.15)


def cave_mats() -> dict:
    return dict(
        timber=role_mat("C_timber", "timber_rough", k=0.7, desat=0.2, rough=0.6, wet_below=0.4),
        timber_dark=role_mat("C_timber_dark", "timber_rough", k=0.5, desat=0.25, rough=0.45, wet_below=0.4),
        board=role_mat("C_board", "timber_rough", k=0.8, desat=0.3, rough=0.6, wet_below=0.55),
        stone=role_mat("C_dressed_granite", "stone_wall", k=0.6, desat=0.3, rough=0.5),
        rust=flat_mat("C_rust", (0.20, 0.10, 0.06), 0.5, metal=0.6),
        rail=flat_mat("C_rail", (0.14, 0.08, 0.05), 0.5, metal=0.6),
        iron=flat_mat("C_iron", (0.05, 0.05, 0.055), 0.45, metal=0.8),
        ice=flat_mat("C_ice", (0.75, 0.85, 0.95), 0.12, transmission=0.5),
        flowstone=role_mat("C_flowstone", "wet_rock", k=0.8, desat=0.3, tint=(1.0, 0.93, 0.82), rough=0.4, bump=0.5),
        ink=flat_mat("C_ink", INK, 1.0, cull=True),
        weed=flat_mat("C_weed", (0.10, 0.10, 0.04), 0.4),
        guano=flat_mat("C_guano", (0.04, 0.035, 0.03), 0.3),
        streak=flat_mat("C_streak", (0.42, 0.42, 0.40), 0.6),
        bone=flat_mat("C_bone", (0.62, 0.58, 0.50), 0.6),
    )


def gap_moon_mat() -> bpy.types.Material:
    """What shows between the sea door's boards from the Tin Gallery mouth: the frozen lake's cool moonlight (#7FA8FF,
    dim, uneven, brighter low down where the snow is), never teal (owner, 2026-11-12)."""
    if "C_gap_moon" in _MATS:
        return _MATS["C_gap_moon"]
    m = bpy.data.materials.new("C_gap_moon")
    b = vb._principled(m)
    g = vb.G(m.node_tree)
    pos = g.position()
    _x, _y, z = sep3(g, pos)
    b.inputs["Base Color"].default_value = (0.0, 0.0, 0.0, 1.0)
    b.inputs["Roughness"].default_value = 1.0
    b.inputs["Emission Color"].default_value = (0.45, 0.58, 0.85, 1.0)   # #7FA8FF's hue once through the grade, dim
    low = g.math("SUBTRACT", 1.0, g.math("MULTIPLY", g.smooth(z, 0.1, 2.2), 0.65))
    k = g.math("MULTIPLY", low, g.math("ADD", 0.45, g.math("MULTIPLY", g.noise(pos, 2.5, 3.0), 0.8)))
    g.link(g.math("MULTIPLY", k, g.value(0.014, "P_gap_moon")), b.inputs["Emission Strength"])
    _MATS["C_gap_moon"] = m
    return m


def moss_glow(lid: str, x: float, y: float, z: float, gain: float = 1.0, size: float = 2.6):
    """A glowing moss patch's light on its surroundings: a soft disc lying on the moss and facing up (look kind
    'moss_glow'), so the dome, the walls and the sides of the stalagmites take the teal while the floor under the
    moss is not burned into a disc; no glint, almost no glow in the fog."""
    ob = area_light("moss_glow", lid, (x, y, z), (0.0, 0.0, 1.0), size, size, 30.0, (0.30, 0.90, 0.74), volume=0.05, shadow=True,
                    cutoff=14.0, gain=gain)
    ob.data.shape = "DISK"
    ob.data.specular_factor = 0.0
    return ob


def cleft_span(cv: CaveCfg, x: float, yc: float, reach: float = 3.0) -> tuple[float, float]:
    """The rock cleft's opening across y at x (the wall line f = 0, the narrowest of three cuts 0.15 m apart)."""
    lo, hi = -1e9, 1e9
    for dx in (-0.15, 0.0, 0.15):
        lo = max(lo, wall_x(cv, x + dx, yc, 0.0, -1.0, reach)[1])
        hi = min(hi, wall_x(cv, x + dx, yc, 0.0, 1.0, reach)[1])
    return lo, hi


def timber_set(mb: MB, cx: float, cy: float, z0: float, yaw: float, half: float, leg: float, height: float, cap: float,
               mat, lag: int = 5, lag_len: float = 1.4, batter: float = 4.0) -> None:
    """Two legs `half` m either side of (cx, cy) across the facing (yaw: the set's front, degrees), a cap at
    `height`, lagging boards laid over the cap into the rock, the legs battered inward."""
    M = M4(cx, cy, z0, rz=yaw - 90.0)
    for s in (-1, 1):
        mb.box(leg, leg, height, M @ M4(s * half, 0.0, 0.0, ry=-s * batter), mat, base=True)
    mb.box(2 * half + 2 * leg + 0.3, cap, cap, M @ M4(0.0, 0.0, height + cap / 2), mat)
    for i in range(lag):
        u = -half + 2 * half * (i + 0.5) / lag
        mb.box(0.18, lag_len, 0.04, M @ M4(u, 0.0, height + cap + 0.02, rz=RNG.uniform(-3, 3)), mat)


def sea_door(cave_side: bool, x_planks: float, span: tuple[float, float], mats: dict) -> None:
    """One barricade for both files: nine weathered planks across the rock cleft (tide-stained to 0.55 m, a weed
    fringe), centred on the opening `span` (y0, y1) and running 0.4-0.5 m into the rock on both jambs, square-ended
    (no shaped outline); the X of two diagonal planks on the cave_entry face or the battens and brace on the sea_exit
    face, nails. From the Tin Gallery mouth the gaps show the frozen lake's dim cool moonlight on a card just behind
    the boards (never teal); from the sea door they show the dark cleft."""
    mb = MB()
    face = -1.0 if cave_side else 1.0           # cave_entry looks east at the planks (its face is x-), sea_exit west (x+)
    y0, y1 = span
    yc = (y0 + y1) / 2
    width = (y1 - y0) + 0.9
    rag = random.Random(5150 if cave_side else 5151)   # the ragged plank ends: their own sequence (RNG stays as it was)
    z = 0.06
    for i in range(9):
        w = 0.24
        e0, e1 = rag.uniform(0.0, 0.1), rag.uniform(0.0, 0.1)
        ln = width + e0 + e1
        mid = yc + (e1 - e0) / 2 + RNG.uniform(-0.04, 0.04)
        mb.box(0.045, ln, w, M4(x_planks, mid, z + w / 2, rx=RNG.uniform(-3, 3)), mats["board"])
        for sy in (-ln / 2 + 0.3, ln / 2 - 0.3):
            for dz in (-0.06, 0.06):
                mb.box(0.012, 0.012, 0.012, M4(x_planks + face * 0.026, mid + sy, z + w / 2 + dz), mats["rust"])
        z += w + RNG.uniform(0.02, 0.08)
    top = z
    mb.box(0.02, width - 0.2, 0.12, M4(x_planks + face * 0.03, yc, 0.12), mats["weed"])
    if cave_side:
        h = top - 0.1
        ang = math.degrees(math.atan2(width - 0.5, h))
        ln = math.hypot(width - 0.5, h)
        for s in (-1, 1):
            mb.box(0.05, 0.24, ln, M4(x_planks + face * 0.05, yc, 0.05 + h / 2, rx=s * ang), mats["board"])
        # the lake's light through the gaps, 0.15 m behind the boards and no bigger than them
        bx = x_planks - face * 0.15
        mb.quad((bx, yc - width / 2, 0.0), (bx, yc + width / 2, 0.0), (bx, yc + width / 2, top), (bx, yc - width / 2, top), gap_moon_mat())
    else:
        for sy in (-0.4, 0.4):
            mb.box(0.08, 0.12, 2.6, M4(x_planks + face * 0.065, yc + sy * (width - 0.6), 1.3), mats["board"])
        mb.box(0.08, 0.12, 2.4, M4(x_planks + face * 0.11, yc, 1.25, rx=28.0), mats["board"])
    ob = mb.build("WP_sea_door", col="models")
    ob.visible_shadow = True


# ---------------------------------------------------------------- the Tin Gallery mouth (scene 'cave_entry')


CE_MOSS = ((3, 2), (16, 5), (4, 11))
CE_WALL = dict(main=("rock_face", 0.6, 0.3), wet_role="wet_rock", worked="mine_wall", moss_role="moss_rock",
               rough=(0.78, 0.42), glow=(0.30, 0.90, 0.74), glow_strength=0.15)   # rock_face: stone_wall read as masonry
CE_ROOF = dict(main=("rock_face", 0.45, 0.3), main2=("wet_rock", 0.35), rough=(0.8, 0.45), relief=0.7)
CE_GROUND = dict(
    base=dict(role="mine_floor", k=0.65, desat=0.4, rough=0.45, nor="mine_floor"),
    classes=[
        dict(ch=("wdi_c", 3), role="rock_ground", k=0.6, desat=0.4, rough=0.5),              # near walls and boulders
        dict(ch=("wdi_c", 0), role="moss_rock", k=0.32, desat=0.0, tint=(0.62, 1.0, 0.86), rough=0.6),  # m: dark teal-green moss
        dict(ch=("wdi_c", 1), role="pebbles", k=0.7, desat=0.3, rough=0.4),                  # s: the shingle apron
        dict(ch=("wdi_c", 2), role="river_rocks", k=0.85, desat=0.35, rough=0.2),            # the pool's bed (seen through the water)
        dict(ch=("wdi_d", 0), role="snow_trodden", k=0.9, desat=0.2, rough=0.6, shape=0.2),  # the path outside
    ],
    snow=True, field=True, wet_rough=0.12, glow=dict(color=(0.30, 0.90, 0.74), strength=0.07, src=1))   # a teal glow, not white
CE_TUFT = (-12.85, -2.7)   # a moss tuft on the floor north of the pool's NW corner: it rakes the pool, lights the niche's brow
CE_NICHE = (-13.95, -5.25)   # moss low in the pool niche's back: the niche, its brow and the pool read against its glow


class EntryCave(CaveCfg):
    """The Tin Gallery mouth: a granite chamber with a 6 m dome, the mouth to Gallows Wood (south), the drift to the
    Flooded Gallery (north), the boarded sea door (east) and the pool niche (west)."""

    profile = "dome"
    C0, Zs0, R0 = 6.0, 3.0, 6.5
    wob = (0.15, 0.55, 1 / 3.5, 0.0, 1.0, 0.0, 0.75)
    crown_blur = 0.8
    portals = [(0.75, -9.75), (0.75, 9.75), (14.25, 3.75)]
    mouth = (0.75, -10.5)

    def bounds(self):
        return -17.5, -12.5, 17.5, 23.5

    def carve(self):
        fd = self.fd
        fd.poly([(-0.8, -8.8), (2.3, -8.8), (2.3, -9.35), (2.85, -10.5), (2.85, -11.4), (-1.35, -11.4), (-1.35, -10.5),
                 (-0.8, -9.35)])                                                            # the mouth's throat
        fd.poly([(-1.5, 8.8), (3.0, 8.8), (3.0, 18.0), (3.8, 21.0), (-0.7, 21.0), (-1.5, 18.0)])  # the drift north
        fd.rect(13.3, 2.9, 14.8, 4.6)                                                       # the sea-door cleft
        fd.rect(-14.4, -7.5, -13.4, -3.0)                                                   # the pool niche's recess

    def regions(self):
        return [((-13.5, 4.5, -7.5, 9.0), 3.6, 2.9, 3.0),     # the NW moss corner
                ((-3.0, -9.0, 4.5, -6.0), 3.45, 3.0, 2.5),    # over the mouth apron
                ((-1.6, -11.5, 3.1, -8.9), 3.4, 2.7, 1.5),    # the throat under the outer arch
                ((-14.4, -7.5, -12.0, -3.0), 2.3, 2.0, 1.0),  # the pool niche's brow
                ((12.0, 2.0, 14.8, 5.5), 2.6, 2.4, 1.0),      # the brow over the sea door
                ((-1.6, 8.8, 4.0, 21.5), 3.2, 2.8, 2.2)]      # the drift

    def ribs(self, x, y):
        if not -9.0 < y < 9.0:
            return 0.0
        return 0.8 * max(1.0 - sstep(0.6, 1.1, abs(x - c)) for c in (-6.0, 2.0, 8.0))

    def roof_noise(self, x, y):
        # the dome's broad swell plus a lumpy metre-scale relief, so it reads as rock and not a smooth gradient
        return 0.45 * fbm(x, y, 0.25, 3) + 0.22 * fbm(x + 11.0, y, 1.0, 3)

    def extra_disp(self, x, y, z):
        # metre-scale relief on the chamber's north wall (it read as a flat built wall behind the boulders), not round
        # the drift's portal (its timber sets) and nowhere near the sea door
        k = sstep(6.0, 8.0, y) * (1.0 - sstep(10.5, 11.5, y)) * sstep(3.5, 5.0, abs(x - 0.75)) * (1.0 - sstep(8.0, 10.0, x))
        return k * (0.5 * n3(x, y, z, 0.4, 7.0) + 0.18 * n3(x, y, z, 1.2, 11.0))

    def lean(self, x, y):
        v = 0.15 + 0.15 * fbm(x, y, 0.15, 2)
        for rect, amt in (((-13.5, 4.5, -9.0, 10.5), 0.6), ((-14.4, -7.5, -12.0, -3.0), 0.8), ((12.0, 2.0, 14.8, 5.5), 0.5)):
            v = max(v, amt * (1.0 - sstep(0.0, 1.0, rect_d(x, y, rect))))
        return v * self.clear_of_portals(x, y)

    def open_wall(self, x, y):
        return y < -10.45 and -2.0 < x < 3.5

    def roof_hole(self, x, y):
        return y < -10.5 and -2.0 < x < 3.5

    def pool_d(self, x, y):
        """Metres inside the pool's shore (negative outside): four lobes run together (the main pool, its arm along the
        niche's back, a bay south-east and one north toward the moss tuft) over the old basin (x -14.45..-9.0,
        y -7.5..-3.0, the shallows x1-3 y9-11), the outline wobbled at two scales (that rectangle, wobbled 0.3 m and
        steep-sided, read as a black slab or a coffin)."""
        d = None
        for cx, cy, rx, ry in ((-11.7, -5.25, 2.3, 1.9), (-13.55, -5.1, 0.95, 2.05), (-10.0, -6.55, 1.15, 0.9),
                               (-10.9, -3.25, 1.15, 0.8)):
            e = (math.hypot((x - cx) / rx, (y - cy) / ry) - 1.0) * min(rx, ry)
            if d is None:
                d = e
            else:   # a smooth union
                h = clamp(0.5 + 0.5 * (e - d) / 0.7)
                d = lerp(e, d, h) - 0.7 * h * (1.0 - h)
        return -d + 0.3 * fbm(x + 2.0, y, 0.55, 2) + 0.12 * fbm(x, y + 6.0, 1.6, 2)

    def pool_bed(self, x, y, z, s):
        """The floor round and under the pool, s = pool_d: just outside the shore a low rim (the floor never dips under
        the water there, so the shore is the outline); inside, a stony bed shelving gently to 0.12 m over the east and
        middle, where it shows through the water round the black hole, and steeply to 0.34 m along the niche's back,
        where the water lies black under the brow and mirrors it; uneven."""
        if s < 0.0:   # the floor crosses the water at the shore with a slope (level there, the two would fight)
            zz = lerp(-0.05, z, sstep(0.0, 0.6, -s))
            return max(zz, -0.05 + 0.12 * min(-s / 0.4, 1.0) - 0.3 * sstep(0.5, 1.0, -s))
        t = min(s / lerp(0.45, 1.3, sstep(-13.8, -12.3, x)), 1.0)
        deep = lerp(0.34, 0.12, sstep(-13.7, -12.5, x))
        return -0.05 - deep * (1.0 - (1.0 - t) ** 2) + 0.02 * fbm(x + 5.0, y, 1.4, 2) * sstep(0.1, 0.5, s)

    def floor_raw(self, x, y):
        z = 0.05 * fbm(x, y, 0.5, 3) + 0.015 * fbm(x, y, 2.5, 2)
        if y < -10.5:   # the moonlit strip outside, falling convexly
            t = clamp((-10.5 - y) / 34.5)
            return -1.0 * (1.0 - (1.0 - t) ** 2) + 0.15 * fbm(x, y, 0.2, 3) * sstep(0.0, 3.0, -10.5 - y)
        w = tile_weights(self.mp, x, y)
        z += 0.04 * w.get("m", 0.0) + (0.03 + 0.02 * fbm(x, y, 3.0, 2)) * w.get("s", 0.0)
        z += 0.18 * (1.0 - sstep(0.0, 0.5, abs(y + 9.55) - 0.35)) * (1.0 - sstep(2.0, 2.6, abs(x - 0.75)))  # the rock lip
        s = self.pool_d(x, y)   # the pool in the niche: a natural shore and a shelving bed
        if s > -1.0:
            z = self.pool_bed(x, y, z, s)
        hx, hy = T(2, 10)
        r = math.hypot(x - hx, y - hy)
        if r < 1.2:   # the black hole at B, its lip ragged
            z = lerp(z, -1.1, 1.0 - sstep(0.42, 0.72, r + 0.2 * fbm(x + 9.0, y, 1.5, 2)))
        for px, py, r in ((7.2, 9.4, 0.6), (13.4, 3.6, 0.5), (16.6, 10.3, 0.7), (9.3, 6.8, 0.45), (5.6, 7.3, 0.55)):
            cx, cy = T(px, py)
            z -= 0.04 * (1.0 - sstep(r * 0.6, r, math.hypot(x - cx, y - cy) + 0.1 * fbm(x, y, 2.0, 2)))
        if y > 10.5:     # the drift falls 0.6 m to black
            z -= 0.6 * sstep(10.5, 19.5, y)
        return z

    def wall_attrs(self, x, y, z):
        wet = max(1.0 - sstep(0.6, 0.9, z + 0.15 * fbm(x, y, 1.5, 2)),
                  (1.0 - sstep(1.0, 2.0, rect_d(x, y, (-14.6, -7.6, -9.0, -2.9)))) * (1.0 - sstep(1.0, 1.6, z)),
                  (1.0 - sstep(1.0, 2.0, math.hypot(x - 13.75, y - 3.75))))
        # worked stone (mine_wall) round the drift's portal only: across the whole north wall its rows read as masonry
        worked = max(sstep(8.8, 9.6, y) * (1.0 - sstep(3.2, 5.0, abs(x - 0.75))),
                     1.0 - sstep(0.5, 1.5, math.hypot(x - 0.75, y + 9.9)), 1.0 - sstep(0.5, 1.2, math.hypot(x - 14.0, y - 3.75)))
        moss = glow = 0.0
        for tx, ty in CE_MOSS:
            mx, my = T(tx, ty)
            near = 1.0 - sstep(1.6, 2.6, math.hypot(x - mx, y - my))
            moss = max(moss, near * (1.0 - sstep(0.8, 1.4, z)))
            glow = max(glow, 0.3 * near * (1.0 - sstep(0.6, 1.2, z)))
        near = 1.0 - sstep(0.6, 1.3, math.hypot(x - CE_TUFT[0], y - CE_TUFT[1]))   # the niche's moss tuft
        moss = max(moss, near * (1.0 - sstep(0.4, 0.9, z)))
        glow = max(glow, 0.4 * near * (1.0 - sstep(0.3, 0.7, z)))
        near = 1.0 - sstep(0.8, 1.8, math.hypot(x - CE_NICHE[0], y - CE_NICHE[1]))   # moss low in the niche
        moss = max(moss, near * (1.0 - sstep(0.5, 1.0, z)))
        glow = max(glow, 0.6 * near * (1.0 - sstep(0.2, 0.7, z)))
        # the drift's moss glimmer far down it (cave_gallery seen far off): a faint smear low on its east wall, soft on
        # every side and broken by noise (a hard box of glow read as a teal figure standing in the black drift)
        zf = z + 0.6 * sstep(10.5, 19.5, y)                   # height over the drift's falling floor
        g_ = 0.25 * (1.0 - sstep(0.8, 2.2, abs(y - 17.6))) * (1.0 - sstep(0.12, 0.45, zf)) * sstep(1.8, 2.6, x)
        glow = max(glow, g_ * clamp(0.45 + 1.2 * fbm(y, zf, 2.2, 2)))
        frost = 1.0 - sstep(2.0, 4.0, math.hypot(x - self.mouth[0], y - self.mouth[1]))
        # the knee-high tide line round the sea door: dark and glossy under a ragged top
        tide = (1.0 - sstep(0.5, 0.6, z + 0.08 * fbm(x, y, 2.5, 2))) * (1.0 - sstep(1.4, 2.8, math.hypot(x - 13.75, y - 3.75)))
        return (wet, worked, moss, frost), (glow, 0.0, tide, 0.0)

    def sample(self, x, y):
        f = self.fd.at(x, y)
        outside = y < -10.4
        z = self.floor(x, y) if not outside else self.floor_raw(x, y)
        w = tile_weights(self.mp, x, y)
        m, s = w.get("m", 0.0), w.get("s", 0.0)
        pd = self.pool_d(x, y) if not outside else -9.0
        in_pool = 1.0 - sstep(0.1, 0.5, -pd)   # the pool only
        bed = (1.0 - sstep(-0.10, -0.045, z)) * in_pool if not outside else 0.0   # the stony bed, under the water
        near = (1.0 - sstep(0.4, 1.2, f)) * (1.0 - bed) if not outside else 0.0
        path = 0.0
        if outside:
            d = poly_d(x, y, [(0.75, -10.5), (0.75, -22.5), (2.25, -25.5), (2.25, -46.0)])
            path = 1.0 - sstep(0.85, 1.25, d + 0.15 * fbm(x, y, 1.2, 2))
            lying = lerp(1.0, 0.55, path)
            mx = min(abs(x - T(7, 14)[0]), abs(x - T(12, 14)[0]))
            lying = min(lying, 0.6 + 0.4 * sstep(1.5, 3.0, mx) + 0.4 * sstep(-13.0, -15.0, y))
        else:
            mouth = 0.9 * (1.0 - sstep(0.0, 5.5, math.hypot(x - self.mouth[0], y - self.mouth[1])))
            lying = s * 0.45 * mouth / 0.9 + 0.5 * mouth * (1.0 - sstep(-9.2, -8.0, y))
        wet = 0.0
        if not outside:
            # not the bed itself (seen through the water, wet-darkened too it sat at ink), but a wet rim at the waterline
            wet = max(sstep(0.55, 0.65, 0.5 + 0.5 * fbm(x, y, 1 / 1.5, 3)) * (1.0 - bed), 1.0 - sstep(0.3, 0.6, f),
                      (1.0 - sstep(0.04, 0.12, z + 0.05)) * (1.0 - sstep(0.3, 0.9, -pd)))
        # the glowing moss: clumps of every size inside a ragged, noise-warped outline (a round mask read as a disc)
        glow = 0.0
        for tx, ty in CE_MOSS:
            mx, my = T(tx, ty)
            glow = max(glow, 1.0 - sstep(0.9, 2.6, math.hypot(x - mx, y - my) + 0.9 * fbm(x, y, 0.8, 3)))
        tuft = 1.0 - sstep(0.25, 0.65, math.hypot(x - CE_TUFT[0], y - CE_TUFT[1]) + 0.25 * fbm(x, y, 2.0, 2))
        m = max(m, tuft)
        glow = max(glow, tuft)
        glow *= (0.25 + 0.75 * sstep(-0.12, 0.22, fbm(x + 3.0, y, 2.2, 3))) * (1.0 - bed)   # no glowing moss under the water
        return z, {"wdi_c": (m, s, bed, near), "wdi_d": (path, 0.0, 0.0, 0.0), "wdi_s": (clamp(lying), 0.0, clamp(wet), m * glow)}


def cave_scatter_wall(cv: CaveCfg, loops, n: int, slug: str, size, lod: float, avoid, sink_frac: float = 0.3,
                      off=(0.2, 0.9), cluster=(3, 6), every=(2.0, 4.0), test=None) -> int:
    """Rubble in clusters along the wall feet: points on the wall loops moved off the wall into the air."""
    placed = 0
    if not loops:
        return 0
    lengths = [len(lp) for lp in loops]
    tries = 0
    while placed < n and tries < n * 30:
        tries += 1
        lp = RNG.choices(loops, lengths)[0]
        i = RNG.randrange(len(lp))
        x, y = lp[i]
        px, py = lp[i - 1]
        qx, qy = lp[(i + 1) % len(lp)]
        ln = math.hypot(qx - px, qy - py) or 1.0
        ax, ay = -(qy - py) / ln, (qx - px) / ln   # into the air
        if any(math.hypot(x - p[0], y - p[1]) < r for p, r in avoid) or cv.open_wall(x, y):
            continue
        for _ in range(RNG.randint(*cluster)):
            o = RNG.uniform(*off)
            t = RNG.uniform(-0.6, 0.6)
            sx, sy = x + ax * o + ay * t, y + ay * o - ax * t   # o into the air, t along the wall
            if cv.fd.at(sx, sy) < 0.15 or (test is not None and not test(sx, sy)):
                continue
            ph_place(cv.mp, slug, sx, sy, piece=RNG.randint(1, ph_count(slug)), size=RNG.uniform(*size), lod=lod,
                     sink_frac=sink_frac, tilt=RNG.uniform(0, 25), toward=RNG.uniform(0, 360))
            placed += 1
    return placed


def build_cave_entry(scene, mp: WildMap, a) -> None:
    cv = EntryCave(mp)
    mp.hfun = cv.floor
    # the moonlit strip runs 45 m either side and 60 m out (the overview's land meets it past the cliff's ends; the
    # far treeline seen through the mouth stands on it); the grid inside +-25 m is as it was
    xs = grid_axis([(-45.0, 45.0, 0.5), (-17.5, 17.5, 0.25)])
    ys = grid_axis([(-60.0, 23.5, 0.5), (-12.5, 23.5, 0.25)])
    cave_floor(cv, cv.sample, xs, ys, lambda x, y: cv.fd.at(x, y) > -1.0 or (y < -10.3 and -45.0 <= x <= 45.0), CE_GROUND)
    wall, roof = rock_material("HM_Rock_wall", CE_WALL), rock_material("HM_Rock_roof", CE_ROOF)
    _ob, loops = build_shell(cv, wall, roof)
    cliff_face(cv, "HM_Rock_face", "y", -10.5, -16.5, 16.5, -1.2, 8.0, -1.0,
               lambda u, z: -1.35 < u < 2.85 and z < 2.6 + 0.8 * math.sqrt(max(0.0, 1.0 - ((u - 0.75) / 2.1) ** 2)), wall)
    # the hull's floor under the black hole at B (-1.1) and the drift (-0.6); no south slab: HM_Rock_face closes the
    # south, and a slab there would wall in the moonlit ground at the cliff's foot
    build_hull("HM_CaveHull", (-16.5, -11.5, -2.5, 16.5, 22.0, 9.0), skip=("S",))
    cm = cave_mats()
    # water: the pool in the niche, five puddles, the seep under the sea door
    wmat = water_material(base=(0.008, 0.020, 0.021), see=0.8, d0=0.05, d1=0.5, ripple=(0.5, 0.02))   # the bed shows, the hole is black
    # the pool: its plane runs past the basin and is kept where the bed is low, so its edge is the shore, not a ruler
    # its own water: clear over the shelving shallows, where the stony bed shows through a dark teal tint (untinted,
    # the clear shallows read as dry floor), black over the deep strip under the brow and the hole, a still mirror of
    # the lit brow and the niche's moss (opaque all over, it hid the bed and showed the outline of a black slab). See
    # 0.62 and a fade to 0.35 m: the water darkens the whole bed a little, so the pool reads as one body with its shore
    # (at 0.82 its shelf read as dry floor), and the 0.12 m shelf stays clear enough to set off the black hole
    pool = water_material(base=(0.003, 0.007, 0.009), see=0.62, d0=0.015, d1=0.35, ripple=(0.5, 0.004))
    pool.name = "C_pool_water"
    pool.node_tree.nodes["P_water_rough"].outputs[0].default_value = 0.07
    pnodes = pool.node_tree.nodes
    next(n for n in pnodes if n.type == "BSDF_TRANSPARENT").inputs["Color"].default_value = (0.45, 0.65, 0.62, 1.0)
    # where the moss tuft's light lands on the water's north arm (from the niche's eye and from the overview) the
    # water is rough, so the light lies on it as a soft teal sheen and not as a mirrored disc (a bead)
    pg = vb.G(pool.node_tree)
    sheen = pg.math("SUBTRACT", 1.0, pg.smooth(xy_dist(pg, pg.position(), -11.3, -2.95), 0.6, 1.6))
    pg.link(pg.math("MAXIMUM", pnodes["P_water_rough"].outputs[0], pg.math("MULTIPLY", sheen, 0.4)),
            next(n for n in pnodes if n.type == "BSDF_PRINCIPLED").inputs["Roughness"])
    build_water("HM_Mere", pool, -0.05, [(-15.6, -8.6, -7.8, -1.6, 0.2)], cv.floor,
                keep=lambda x, y: cv.pool_d(x, y) > -0.6 and cv.floor(x, y) < -0.03)
    # no planar probe: the culled roof vanished from its mirrored capture and the pool reflected only black
    pud = [(T(px, py), r) for px, py, r in ((7.2, 9.4, 0.6), (13.4, 3.6, 0.5), (16.6, 10.3, 0.7), (9.3, 6.8, 0.45), (5.6, 7.3, 0.55))]
    build_water("HM_Water_puddles", wmat, -0.01, [(c[0] - r - 0.2, c[1] - r - 0.2, c[0] + r + 0.2, c[1] + r + 0.2, 0.1) for c, r in pud],
                cv.floor)
    sx, sy = T(18.2, 4.0)
    build_water("HM_Water_seep", wmat, cv.floor(sx, sy) + 0.005, [(sx - 2.6, sy - 0.45, sx + 0.7, sy + 0.45, 0.1)],
                lambda x, y: cv.floor(x, y) - 0.002 + 0.03 * sstep(0.0, 0.05, abs(y - sy) - (0.4 if x > sx - 0.65 else 0.08)))
    # the dense low fog lies only over the water, its sides soft (a box's hard side read as a ruled edge)
    soft_mist("HM_PoolMist", (-15.2, -8.4, -8.2, -2.0), -0.05, 1.0, 0.026, soft=1.4)   # thinner: the pool's mirror shows
    # the mouth: a timber set in the throat, the lip, icicles; the drift's sets and the Small-profile boards
    mb = MB()
    timber_set(mb, 0.75, -9.35, cv.floor(0.75, -9.35) - 0.05, -90.0, 1.3, 0.24, 2.55, 0.28, cm["timber"], lag=6, lag_len=1.4)
    mb.box(0.3, 0.2, 0.15, M4(1.9, -9.35, 2.95), cm["timber"])
    for i in range(3):
        y = (9.25, 10.9, 12.5)[i]
        half, height, cap = (1.35, 2.7, 0.3) if i == 0 else (2.0, 2.6, 0.3)
        timber_set(mb, 0.75, y, cv.floor(0.75, y) - 0.05, 90.0, half, 0.26, height, cap, cm["timber"], lag=5, lag_len=1.6)
    mb.build("WP_mine_timbers", col="models")
    mb = MB()
    cone_icicles(mb, [(RNG.uniform(-1.2, 2.7), -10.5 - RNG.uniform(0.0, 0.2), RNG.uniform(2.9, 3.4), RNG.uniform(0.15, 0.65))
                      for _ in range(9)], cm["ice"])
    cone_icicles(mb, [(RNG.uniform(-0.4, 1.9), -9.5, 2.55, RNG.uniform(0.08, 0.2)) for _ in range(4)], cm["ice"])
    mb.build("WP_icicles", col="models", smooth=True)
    mb = MB()
    for s in (-1, 1):
        mb.box(0.24, 0.05, 3.3, M4(0.75, 9.12, 1.5, ry=s * 38.0), cm["board"])
    gb = mb.build("HM_GalleryBoards", col="models")
    gb.hide_render = True   # the Small profile's nailed planks: show it for that still
    sea_door(True, 13.75, cleft_span(cv, 13.75, 3.75), cm)
    stalactites(cv, [(T(5, 4)[0] + RNG.uniform(-0.8, 0.8), T(5, 4)[1] + RNG.uniform(-0.8, 0.8), RNG.uniform(0.5, 0.9), 0.12) for _ in range(3)] +
                [(T(15, 8)[0] + RNG.uniform(-0.8, 0.8), T(15, 8)[1] + RNG.uniform(-0.8, 0.8), RNG.uniform(0.5, 0.9), 0.12) for _ in range(3)] +
                [(T(2.5, 2)[0] + RNG.uniform(-1.5, 1.5), T(2.5, 2)[1] + RNG.uniform(-1.0, 1.0), RNG.uniform(0.3, 0.6), 0.09) for _ in range(4)] +
                [(-13.6, -4.5, 0.25, 0.07), (-13.7, -6.0, 0.3, 0.08), (13.2, 3.3, 0.3, 0.08), (13.2, 4.2, 0.2, 0.07)], cm["flowstone"])
    toadstools(mp, *T(12, 6), 0.0, n=3, ring=(0.15, 0.3), pad=0.35, cap=(0.20, 0.12, 0.05), stem=(0.62, 0.58, 0.50), frost=0.0,
               kicked=False, cap_size=(0.09, 0.15), stem_h=(0.07, 0.13), name="WP_mushrooms")   # dull ochre caps: red went magenta
    mb = MB()
    gx, gy = T(13, 11)
    verts = []
    for i in range(16):
        aa = 2 * math.pi * i / 16
        r = 0.6 * (1.0 + 0.25 * fbm(math.cos(aa), math.sin(aa), 2.0, 2))
        verts.append((gx + r * math.cos(aa), gy + r * math.sin(aa), cv.floor(gx + r * math.cos(aa), gy + r * math.sin(aa)) + 0.01))
    mb.add(verts, [tuple(range(16))], cm["guano"])
    mb.build("WP_bat_roost", col="models")
    mb = MB()   # the streaks on the roof above it: their own object, so a cutaway still can hide them
    for i in range(5):
        px, py = gx + RNG.uniform(-0.5, 0.5), gy + RNG.uniform(-0.5, 0.5)
        # lying on the roof (free-hanging quads read as floating sticks): a strip 0.6 m long that follows the rock
        pts = [(px + 0.05 * k, py + 0.15 * k) for k in range(5)]
        zs = [cv.roof_z(qx, qy, cv.fd.at(qx, qy)) - 0.012 for qx, qy in pts]
        for k in range(4):
            (ax, ay), (bx, by) = pts[k], pts[k + 1]
            w0, w1 = 0.05 * (1.0 - 0.2 * k), 0.05 * (1.0 - 0.2 * (k + 1))
            mb.quad((ax - w0, ay, zs[k]), (ax + w0, ay, zs[k]), (bx + w1, by, zs[k + 1]), (bx - w1, by, zs[k + 1]), cm["streak"])
    mb.build("WP_bat_streaks", col="models")
    if not a.no_models:
        snow_mask_model("stalagmite_cluster", (0.30, 0.27, 0.23), 0.35, share=0.85)
        darken_lanterns("stalagmite_cluster")   # its bracket lantern: the mouth has no warm light
        mplace(mp, "stalagmite_cluster", *T(5, 4), facing="W", size=2.6, sink=0.05)
        mplace(mp, "stalagmite_cluster", *T(15, 8), facing="N", size=2.8, sink=0.05)
        # a stone breaking the pool's surface by the hole (its flat top just awash read as a scrap floating on the water)
        ph_place(mp, "rock_moss_set_02", *T(2.55, 10.45), rot=30.0, size=0.7, piece="#7", z=-0.10, sink=0.15, lod=0.7)
        for slug, tx, ty, rot, size, sink in (("rock_face_02", 17.15, 1.85, 200.0, 1.3, 0.3), ("rock_face_01", 14, 10.05, 70.0, 1.5, 0.3)):
            ph_place(mp, slug, *T(tx, ty), rot=rot, size=size, sink=sink, lod=0.8, grade="tin")
        ph_place(mp, "picke_dirty_01", *T(16.55, 2.15), rot=35.0, size=1.12, tilt=25.0, toward=35.0 + 180.0)
        ph_place(mp, "rusted_spade_01", *T(14.5, 10.35), rot=15.0, size=1.1, sink=0.12, tilt=10.0, toward=0.0)
        for tx, ty, rot, s in ((1.85, 1.95, 10.0, 0.6), (2.2, 2.2, 130.0, 0.5), (2.05, 1.7, 250.0, 0.45)):
            ph_place(mp, "rock_07", *T(tx, ty), rot=rot, size=s, sink=0.05, lod=0.4)
        for slug, tx, ty, rot, size, sink in (("rock_moss_set_01", 7.6, 4.35, 15.0, 2.8, 0.45), ("rock_moss_set_02", 7.05, 5.35, 140.0, 1.6, 0.25),
                                              ("rock_moss_set_02", 8.2, 5.2, 260.0, 1.2, 0.2), ("rock_moss_set_02", 3, 6.15, 85.0, 1.6, 0.2),
                                              ("rock_moss_set_02", 3.05, 7, 95.0, 1.8, 0.25), ("rock_moss_set_02", 2.95, 7.9, 80.0, 1.5, 0.2),
                                              ("rock_moss_set_01", 12.2, 8, 5.0, 2.0, 0.35), ("rock_moss_set_02", 13.1, 8.1, 175.0, 1.7, 0.2),
                                              ("rock_moss_set_01", 14, 7.95, 350.0, 2.1, 0.35)):
            piece = "#1" if size >= 2.5 else ("#3" if slug == "rock_moss_set_01" else RNG.randint(1, ph_count(slug)))
            ph_place(mp, slug, *T(tx, ty), rot=rot, size=size, piece=piece, sink=sink, lod=0.7)
        for i, (tx, ty) in enumerate(((8.7, 12.4), (12.1, 12.3))):   # roots hanging through the roof inside the mouth
            x, y = T(tx, ty)
            hang_root(mp, cv, x, y, cv.roof_z(x, y, cv.fd.at(x, y)) + 0.1, 1.6 if tx < 10 else 1.4, 20.0 if tx < 10 else 200.0,
                      lod=0.35, name=f"WP_hanging_root_{i}")
        # the moonlit strip of Gallows Wood beyond the mouth. The four pines that stood at tiles x 4-8 just south-west of
        # the mouth filled the overview's left third (shards at that size, over the pool niche) and showed as shards left
        # of the opening from inside: they stand 6 m further west, out of both. The path-axis clump that the mouth framed
        # (its snow clumps read as crumpled shards in the focal point, and its trunks as one dark column) and the pine
        # 12 m under the overview's lens (its lower crown shards in the corner) stand 8-12 m further east and south, out
        # of the mouth and out of the overview, their shadows still on the strip; through the mouth a treeline 30-45 m
        # out frames the path in the haze (world x, y)
        for tx, ty, name, rot, size, lod in ((0.2, 15.0, "pine_tall", 40, 14.0, 0.3), (2.0, 16.6, "pine_short", 200, 7.7, 0.3),
                                             (-0.8, 17.2, "pine_tall", 300, 12.6, 0.3), (-1.6, 14.9, "pine_tall", 110, 16.1, 0.3),
                                             (16.9, 24.8, "pine_tall", 140, 13.0, 0.2),
                                             (4.2, 18.6, "pine_tall", 330, 14.4, 0.3), (4.5, 21.0, "pine_tall", 215, 12.9, 0.2)):
            x, y = T(tx, ty)
            o = vb.place(mp, name, x, y, rot=float(rot), size=size, lod=lod, col="forest", sink=0.2, lamps=False)
            o.visible_shadow = True   # they throw their moon shadows across the strip (ce.lt_moon_strip)
            TREES.append(o)
        for x, y, name, rot, size, lod in ((14.2, -28.6, "pine_tall", 160, 14.7, 0.2), (16.4, -31.6, "pine_short", 20, 8.4, 0.2),
                                           (11.0, -32.5, "pine_tall", 250, 13.3, 0.2), (17.0, -27.6, "dead_tree", 75, 7.2, 0.3),
                                           (13.5, -35.2, "pine_tall", 5, 15.4, 0.2),
                                           (-4.0, -41.0, "pine_tall", 70, 14.0, 0.3), (-6.5, -47.0, "pine_tall", 190, 15.2, 0.3),
                                           (-3.0, -52.0, "pine_tall", 300, 13.6, 0.3), (5.5, -45.5, "pine_tall", 120, 13.0, 0.3),
                                           (4.0, -53.0, "pine_tall", 230, 14.8, 0.3), (7.5, -40.0, "pine_short", 340, 8.6, 0.3)):
            if name == "dead_tree" and "dead_tree@0.3" not in vb._SRC:
                cut_dead_tree_lantern()
            o = vb.place(mp, name, x, y, rot=float(rot), size=size, lod=lod, col="forest", sink=0.2, lamps=False)
            o.visible_shadow = True
            TREES.append(o)
        for tx, ty, rot, size in ((7.4, 14.2, 160.0, 2.3), (14, 14.3, 20.0, 2.0)):
            mplace(mp, "boulder_set", *T(tx, ty), rot=rot, size=size, sink=0.25, lod=0.5)
        # rubble: wall feet, skirts round the boulders, the shallows, the apron, the path's edges
        avoid = [(c, 1.6) for c in cv.portals] + [(s, 0.8) for s in cv.spawns] + [((T(5, 6)[0], T(5, 6)[1]), 0.8)]
        cave_scatter_wall(cv, loops, 46, "rock_07", (0.15, 0.45), 0.15, avoid, sink_frac=0.3)
        for tx, ty in ((7.5, 4.5), (3, 7), (13, 8), (5, 4), (15, 8)):
            cx, cy = T(tx, ty)
            for _ in range(3):
                aa = RNG.uniform(0, 2 * math.pi)
                ph_place(mp, "rock_07", cx + 1.3 * math.cos(aa), cy + 1.3 * math.sin(aa), size=RNG.uniform(0.18, 0.35), lod=0.15, sink_frac=0.3)
        for _ in range(6):
            x, y = T(RNG.uniform(1, 3), RNG.uniform(9, 11))
            if math.hypot(x - T(2, 10)[0], y - T(2, 10)[1]) > 0.9:
                ph_place(mp, "rock_07", x, y, size=RNG.uniform(0.2, 0.4), lod=0.15, sink_frac=0.5)
        for _ in range(9):
            x, y = T(RNG.uniform(8, 12), RNG.uniform(11, 12.4))
            if abs(x - 0.75) > 1.4 and math.hypot(x - T(10, 12)[0], y - T(10, 12)[1]) > 0.8:
                ph_place(mp, "rock_07", x, y, size=RNG.uniform(0.15, 0.3), lod=0.15, sink_frac=0.5)
        for i in range(10):
            y = -11.0 - RNG.uniform(0.0, 10.0)
            ph_place(mp, "rock_07", 0.75 + RNG.choice((-1, 1)) * RNG.uniform(0.8, 1.4), y, size=RNG.uniform(0.15, 0.35), lod=0.15, sink_frac=0.3)
        for tx, ty in ((18.4, 1.3), (18.3, 12.2), (8.7, 0.9), (11.4, 0.9), (18.5, 2.7), (18.6, 5.3), (8.2, 12.4), (12.0, 12.5)):
            ph_place(mp, "rock_moss_set_02", *T(tx, ty), piece=RNG.randint(1, ph_count("rock_moss_set_02")), size=RNG.uniform(0.6, 1.1),
                     lod=0.7, sink_frac=0.3)
        for tx, ty in ((6.4, 0.4), (19.3, 9.6), (0.3, 4.6)):
            ph_place(mp, "rock_moss_set_01", *T(tx, ty), piece=RNG.randint(2, ph_count("rock_moss_set_01")), size=RNG.uniform(1.4, 2.0),
                     lod=0.7, sink=RNG.uniform(0.4, 0.6))
        for tx, ty in ((8.6, 12.3), (11.4, 11.8), (10.9, 12.6)):
            ph_place(mp, "dry_branches_medium_01", *T(tx, ty), piece=RNG.randint(1, ph_count("dry_branches_medium_01")),
                     size=RNG.uniform(0.8, 1.2), lod=0.4, sink=0.03)
        for _ in range(16):
            x = 0.75 + RNG.uniform(-2.2, 2.2)
            y = -10.5 + RNG.uniform(-1.5, 1.5) if RNG.random() < 0.6 else -11.0 - RNG.uniform(0.0, 9.0)
            if abs(x - 0.75) < 0.9 and y < -10.5:
                x += 1.6 * (1 if x >= 0.75 else -1)
            ph_place(mp, "grass_medium_02", x, y, piece=RNG.randint(1, ph_count("grass_medium_02")), grade="dry", col="forest",
                     size=RNG.uniform(0.15, 0.35), sink=0.01)
        for tx, ty in ((8.7, 13.9), (12.1, 14.0), (8.0, 14.7), (12.9, 14.9)):
            ph_place(mp, "fern_02", *T(tx, ty), piece=RNG.randint(1, ph_count("fern_02")), grade="frost_brown", col="forest",
                     size=RNG.uniform(0.5, 0.8), sink=0.02)
    # lights: three moss pools, a moss tuft at the pool niche, a cool fill in at the mouth over the apron, the moon on
    # the strip outside. The pools' lights stand 1.1 m up (0.8 m gave a hard spotlight disc) with a soft reach and
    # little glint; all three are shadowed, so the stalagmites and boulders lay their shadows over the floor
    for i, (tx, ty) in enumerate(CE_MOSS):
        x, y = T(tx, ty)
        ob = point_light("moss", f"ce.lt_moss_{i}", x, y, cv.floor(x, y) + 1.6, 24.0, (0.30, 0.90, 0.74), radius=0.5,
                         volume=0.3, shadow=True, cutoff=16.0, gain=0.42 if i == 2 else 1.0)
        ob.data.specular_factor = 0.35
        moss_glow(f"ce.lt_moss_glow_{i}", x, y, cv.floor(x, y) + 0.25, gain=0.5 if i == 2 else 1.0)
    ob = point_light("moss", "ce.lt_moss_tuft", CE_TUFT[0], CE_TUFT[1], cv.floor(*CE_TUFT) + 0.75, 24.0, (0.30, 0.90, 0.74),
                     radius=0.5, volume=0.3, shadow=True, cutoff=8.0, gain=0.22)   # rakes the pool, lights the niche's brow
    ob.data.specular_factor = 0.35   # kept off the water: over the pool's mirror its glint was a white disc
    moss_glow("ce.lt_moss_glow_niche", CE_NICHE[0], CE_NICHE[1], max(cv.floor(*CE_NICHE), -0.05) + 0.06, gain=0.35, size=1.2)
    # the mosses' glow on the pool's bed (under the water it sat at ink, so the water showed no depth and the hole could
    # not be told from the pool): a soft teal disc over the pool facing down that lights only the floor and the stones
    # in the pool (light-linked; not the water, so no glint, and not the walls), no glow in the mist, a short reach
    ob = area_light("moss_glow", "ce.lt_pool_bed", (-11.9, -5.3, 1.4), (0.0, 0.0, -1.0), 3.4, 3.4, 30.0, (0.30, 0.90, 0.74),
                    volume=0.0, shadow=True, cutoff=4.2, gain=0.4)
    ob.data.shape = "DISK"
    ob.data.specular_factor = 0.0
    ob["wdi_vgain"] = 0.0
    recv = bpy.data.collections.new("HM_PoolBedRecv")
    recv.use_fake_user = True
    sx_, sy_ = T(2.55, 10.45)   # not the stone breaking the surface by the hole: 1.4 m under this light it lit up yellow
    for o in [bpy.data.objects["HM_Ground"]] + [o for o in COL["models"].all_objects
                                                 if o.type == "MESH" and cv.pool_d(o.location.x, o.location.y) > -0.5
                                                 and math.hypot(o.location.x - sx_, o.location.y - sy_) > 0.35]:
        recv.objects.link(o)
    ob.light_linking.receiver_collection = recv
    # out past the outer arch and narrower: from 1 m outside between the posts it outlined them in white
    ob = area_light("shaft", "ce.lt_mouth", (0.75, -11.6, 1.7), (0.0, 0.966, -0.259), 2.0, 1.6, 30.0, (0.55, 0.70, 1.0), volume=0.6,
                    shadow=True, cutoff=13.0)
    ob.data.specular_factor = 0.08   # its glint still lined the posts' inner faces and the lintel in white
    # the moonlit snow's faint bounce in at the threshold onto the floor and walls either side of the mouth (they were
    # flat ink from inside): a soft panel on the apron facing up and in, no glint, no glow in the air (look kind 'bounce')
    ob = area_light("bounce", "ce.lt_apron_bounce", (0.75, -8.6, 0.12), (0.0, 0.45, 0.89), 3.4, 2.2, 80.0, (0.62, 0.76, 1.0),
                    volume=0.0, shadow=True, cutoff=9.0, gain=0.12)
    ob.data.specular_factor = 0.0
    # the moon on the strip outside (the cave look turns the sky and the moon sun off): a 4 m area light 32 m out along
    # the village moon (azimuth 325, elevation 19) from the strip's middle, past every tree, shadowed, so the pines lay
    # long shadows over the snow; through the arch it lights the throat's west wall and a slanting patch of the throat
    # and apron floor, and the cliff, the shell and the hull keep it out of the rest of the cave.
    # The look's moon_pool energy (40 W) x gain 70 = 2.8 kW, about 0.87 W/m2 across the beam (the village moon: 1.1)
    to_moon = Vector((math.cos(math.radians(19.0)) * U_MOON[0], math.cos(math.radians(19.0)) * U_MOON[1], math.sin(math.radians(19.0))))
    src = Vector((1.0, -18.0, 0.0)) + to_moon * 32.0
    area_light("moon_pool", "ce.lt_moon_strip", src, -to_moon, 7.0, 7.0, 2800.0, (0.55, 0.70, 1.0), volume=0.3, shadow=True,
               cutoff=75.0, gain=70.0)   # 7 m: a broader moon softens the pines' snow facets
    # a thin moonlit haze over the strip: depth outside the mouth, and it softens the pines' facets
    soft_mist("HM_StripMist", (-24.0, -58.0, 24.0, -11.2), -1.1, 9.0, 0.022, soft=4.0, nscale=0.12)   # past the treeline, over its crowns
    cut = view_cut("cave_entry")
    if cut is not None:
        lip = -10.5 - 0.36   # the cliff face's outermost bulge: the section and the land overhang its top a little

        def ce_clip(x, y):   # the section ends at the cliff; past the cliff's ends it draws back from the strip
            return (y - lip) - 9.5 * sstep(21.0, 24.5, abs(x))

        def ce_limit(x, y):  # past the cliff's ends the land comes down to the strip's level at the lip
            return 0.12 + 0.45 * max(0.0, y - lip) + 9.0 * (1.0 - sstep(20.5, 23.5, abs(x)))

        land_h = cutaway(cv, loops, cut, (-66.0, -12.0, 34.0, 66.0),
                         lambda x, y: 0.05 + 0.35 * fbm(x, y, 0.03, 3) + 0.12 * fbm(x, y, 0.15, 2),
                         clip=ce_clip, clamp_hole=lambda x, y: (x, max(y, lip + 0.03)),
                         drop=lambda x, y: y < -10.3 and -2.2 < x < 3.7, keep=lambda x, y: y > lip, limit=ce_limit,
                         fill_rect=(-20.0, -10.5, 20.0, 26.0), fill=0.3, moon=(325.0, 19.0, 0.9), seed=1, trees=70, rocks=14,
                         frame=[(-61.8, -5.2), (7.6, 61.1), (28.4, -1.7), (-0.1, -28.8)],
                         skip_lights=("L_moon_pool_ce.lt_moon_strip",), cliff=lambda x, y: abs(x) < 24.5, inside=0.12,
                         tree_lod=0.6, near_trees=True,   # at 0.12 the pines round the cut showed hard, flat snow planes
                         hair_joints=True)
        # the cliff runs on under the section's lip past the shell's face (x +-16.5) until the land is down at the strip
        for nm, u0, u1 in (("HM_CutCliff_W", -24.6, -16.5), ("HM_CutCliff_E", 16.5, 24.6)):
            o = cliff_face(cv, nm, "y", -10.5, u0, u1, -1.2, 3.3, -1.0, lambda u, zz: zz > land_h(u, lip + 0.1) + 0.1, wall)
            cut_link(o, recv=False, block=False)


def hang_root(mp, cv: CaveCfg, x: float, y: float, top: float, size: float, yaw: float, lod: float = 0.35,
              name: str | None = None) -> None:
    """A single_root hanging straight down from `top` (a roof or a shaft lip); `name` names the object (the views'
    cutaway stills hide the roots by name)."""
    src = ph_source("single_root", None, lod)
    k = size / src["wdi_size"]
    o = ph_place(mp, "single_root", x, y, rot=0.0, scale=k, lod=lod, z=top)
    o.rotation_euler = (Matrix.Rotation(math.radians(yaw), 4, "Z") @ Matrix.Rotation(math.radians(-90.0), 4, "X")).to_euler("XYZ")
    o.location.z = top - src["wdi_dims"][1] * k / 2
    if name:
        o.name = name


# ---------------------------------------------------------------- the sea door (scene 'sea_exit')


SE_MOSS = (3, 7)
SE_WALL = dict(main=("wet_rock", 0.6, 0.3), worked="stone_wall", moss_role="moss_rock", rough=(0.78, 0.42),
               glow=(0.30, 0.90, 0.74), glow_strength=0.15)   # rough rock: the jambs' glossy creases caught the light as zigzags
SE_ROOF = dict(main=("rock_face", 0.45, 0.3), main2=("wet_rock", 0.35), rough=(0.8, 0.45), relief=0.75)
SE_GROUND = dict(
    base=dict(role="rock_ground", role2=("mine_floor", 0.3), k=0.6, desat=0.35, rough=0.5, nor="rock_ground"),
    classes=[
        dict(ch=("wdi_c", 0), role="moss_rock", k=0.32, desat=0.0, tint=(0.62, 1.0, 0.86), rough=0.6, shape=0.3),  # the moss
        dict(ch=("wdi_c", 1), role="pebbles", k=0.6, desat=0.3, rough=0.25),               # s: wet shingle
        dict(ch=("wdi_c", 2), role="river_rocks", k=0.5, desat=0.35, rough=0.2),           # the shallows' bed
    ],
    snow=False, wet_rough=0.14, glow=dict(color=(0.30, 0.90, 0.74), strength=0.07, src=0))


class SeaCave(CaveCfg):
    """The sea door: a water-worn chamber with a 4.8 m dome, the boarded cleft back to the Tin Gallery mouth (west) and
    the arch (east) onto the frozen lake (owner, 2026-11-12: the 'sea' is a frozen lake)."""

    profile = "dome"
    C0, Zs0, R0 = 4.8, 2.8, 5.0
    wob = (0.1, 0.35, 0.3, 0.0, 1.0, 0.0, 0.5)
    crown_blur = 0.8
    portals = [(-12.75, -0.75), (12.75, -0.75)]

    def bounds(self):
        return -16.0, -10.0, 17.0, 10.0

    def carve(self):
        self.fd.rect(-14.4, -1.6, -11.9, 0.1)   # the boarded cleft, closed by rock 1 m behind the planks
        self.fd.rect(11.9, -2.25, 14.4, 0.75)   # the sea arch through the east wall

    def regions(self):
        return [((9.0, -3.5, 14.5, 2.0), 3.2, 2.8, 1.5), ((-14.5, -2.0, -11.0, 0.5), 2.6, 2.3, 0.8)]

    def lean(self, x, y):
        return (0.15 + 0.1 * fbm(x, y, 0.2, 2)) * self.clear_of_portals(x, y)

    def open_wall(self, x, y):
        return x > 13.45 and -2.6 < y < 1.1

    def roof_hole(self, x, y):
        return x > 13.5 and -2.6 < y < 1.1

    def extra_disp(self, x, y, z):
        return 0.3 * sstep(0.2, 0.3, z) * (1.0 - sstep(0.6, 0.7, z)) * sstep(-0.5, 0.5, x)   # the wave-cut notch

    def roof_noise(self, x, y):
        # the vault's swell plus metre-scale lumps, and a ragged rock lip hanging under the arch's lintel (it read as
        # a smooth sagging membrane)
        lip = 0.4 * sstep(11.6, 13.2, x) * (1.0 - sstep(1.2, 2.4, abs(y + 0.75))) * (0.55 + 0.6 * fbm(x, y, 1.6, 3))
        return 0.45 * fbm(x, y, 0.25, 3) + 0.2 * fbm(x + 11.0, y, 1.0, 3) - lip

    def floor_raw(self, x, y):
        z = 0.05 * fbm(x, y, 0.5, 3) + 0.015 * fbm(x, y, 2.5, 2) + 0.10 * sstep(-6.0, -12.5, x)
        if x > 3.0:
            z = lerp(z, -0.12 + 0.02 * fbm(x, y, 3.0, 2), sstep(3.0, 6.0, x))
        if x > 6.0:
            z = lerp(-0.15, -0.35, clamp((x - 6.0) / 6.0)) + 0.03 * fbm(x, y, 1.0, 2)
        if x > 12.75:
            z = lerp(z, -2.5, sstep(12.75, 15.75, x))
        for px, py, r in ((9.6, 6.4, 0.5), (10.2, 3.3, 0.4), (8.7, 7.6, 0.35)):
            cx, cy = T(px, py)
            z -= 0.04 * (1.0 - sstep(r * 0.6, r, math.hypot(x - cx, y - cy)))
        return z

    def wall_attrs(self, x, y, z):
        # the arch onto the frozen lake is rimed, not wet: no glossy tide band on its jambs either (their feet shone)
        tide = (1.0 - sstep(0.5, 0.6, z + 0.08 * fbm(x, y, 2.0, 2))) * (1.0 - sstep(10.5, 12.0, x))
        wet = tide
        mx, my = T(*SE_MOSS)
        near = 1.0 - sstep(1.4, 2.2, math.hypot(x - mx, y - my))
        moss = near * (1.0 - sstep(0.5, 0.8, z))
        frost = sstep(11.0, 13.2, x) * (0.55 + 0.45 * sstep(2.0, 3.0, z))
        return (wet, sstep(2.0, 2.4, z), moss, frost), (0.3 * moss, 0.0, tide, 0.0)

    def sample(self, x, y):
        z = self.floor(x, y)
        w = tile_weights(self.mp, x, y)
        mx, my = T(*SE_MOSS)
        d = math.hypot(x - mx, y - my) + 0.8 * fbm(x, y, 0.8, 3)   # a ragged patch (a round one read as a spotlight)
        moss = 1.0 - sstep(1.0, 2.1, d)
        bed = clamp(w.get("~", 0.0) + w.get("P", 0.0) * 0.5 + sstep(12.0, 13.0, x))
        f = self.fd.at(x, y)
        wet = max(sstep(-0.5, 0.5, x) * (1.0 - sstep(3.0, 3.5, x)), 1.0 - sstep(0.3, 0.6, f), w.get("s", 0.0) * 0.6, bed)
        glow = moss * (1.0 - sstep(0.8, 2.4, d)) * (0.25 + 0.75 * sstep(-0.12, 0.22, fbm(x + 3.0, y, 2.2, 3)))
        return z, {"wdi_c": (moss, w.get("s", 0.0), bed, 0.0), "wdi_d": (0.0, 0.0, 0.0, 0.0),
                   "wdi_s": (0.0, 0.0, clamp(wet), glow)}


def far_shore(mp: WildMap, x0: float = 70.0, no_trees: bool = False) -> None:
    """The frozen lake's far shore, east beyond the arch: a low snowy bank rising to about 6 m under black pines, so
    the arch opens on a lake and not on a sea. HM_FogBank thins it; it is seen only through the arch."""
    rng = random.Random(4593)   # its own sequence: the cave's scatter keeps its own

    def h(x, y):
        t = clamp((x - x0) / 30.0)
        return -0.12 + 6.0 * t * t * (3.0 - 2.0 * t) + 1.2 * fbm(x, y, 0.03, 3) * t

    xs = grid_axis([(x0, x0 + 45.0, 3.0)])
    ys = grid_axis([(-80.0, 80.0, 3.0)])
    nx = len(xs)
    me = bpy.data.meshes.new("HM_FarShore")
    me.from_pydata([(x, y, h(x, y)) for y in ys for x in xs], [],
                   [(j * nx + i, j * nx + i + 1, (j + 1) * nx + i + 1, (j + 1) * nx + i) for j in range(len(ys) - 1) for i in range(nx - 1)])
    me.update()
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    vb.uv_world(me)
    me.materials.append(flat_mat("C_shore_snow", (0.62, 0.67, 0.75), 0.8))
    COL["world"].objects.link(bpy.data.objects.new("HM_FarShore", me))
    if no_trees:
        return
    placed = []
    for _ in range(900):
        if len(placed) >= 90:
            break
        x, y = rng.uniform(x0 + 5.0, x0 + 44.0), rng.uniform(-78.0, 78.0)
        if any(math.hypot(x - px, y - py) < 3.5 for px, py in placed):
            continue
        o = mplace(mp, rng.choice(("pine_tall", "pine_tall", "pine_short")), x, y, rot=rng.uniform(0.0, 360.0),
                   scale=rng.uniform(0.9, 1.35), lod=0.08, z=h(x, y) - 0.2, col="forest")
        o.visible_shadow = False
        placed.append((x, y))
    print(f"FAR SHORE {len(placed)} pines from x {x0:.0f} m", flush=True)


def lake_relief(z_ice: float = -0.06) -> None:
    """Out on the frozen lake past the arch: wind drifts lying on the ice, long and low along the wind (west, into
    the arch), so from the arch their moonlit and shadowed flanks run toward the eye; snow banked unevenly against the
    cliff's foot; and a pressure ridge 14-21 m out: jumbled shards of pale lake ice (irregular slabs, not boxes)
    shoved up at many angles and heights, stacked, with ice rubble, half-buried in drifted snow, the ridge zigzagging
    and broken by gaps (a straight row of dark flat-topped slabs read as a wall of crates across the arch). Seen from
    the arch they are what reads as ice and not as water."""
    rng = random.Random(4711)
    m = bpy.data.materials.new("C_lake_snow")
    b = vb._principled(m)
    g = vb.G(m.node_tree)
    pos = g.position()
    x_, _y, _z = sep3(g, pos)
    st = _new(g.n, "ShaderNodeVectorMath", operation="MULTIPLY")
    g.link(pos, st.inputs[0])
    st.inputs[1].default_value = (0.3, 1.0, 1.0)
    fine = g.noise(st.outputs["Vector"], 1.4, 4.0, 0.6)
    col = g.mix(g.smooth(fine, 0.3, 0.7), (0.70, 0.75, 0.84), (0.88, 0.91, 0.96))
    # the apron at the threshold lies in the moon pool's light: a little greyer (it was the brightest thing in frame)
    col = scale_by(g, col, g.mixf(g.smooth(x_, 14.2, 18.0), 0.66, 1.0))
    g.link(col, b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.72
    sv = g.voronoi(pos, 40.0)
    sr, _sg, _sb = sep3(g, sv.outputs["Color"])
    spark = g.math("MULTIPLY", g.math("SUBTRACT", 1.0, g.smooth(sv.outputs["Distance"], 0.08, 0.2)), g.smooth(sr, 0.975, 0.985))
    b.inputs["Emission Color"].default_value = (0.80, 0.88, 1.0, 1.0)
    g.link(g.math("MULTIPLY", spark, 1.2), b.inputs["Emission Strength"])
    bp = _new(g.n, "ShaderNodeBump")
    bp.inputs["Strength"].default_value = 0.4
    bp.inputs["Distance"].default_value = 0.04
    g.link(fine, bp.inputs["Height"])
    g.link(bp.outputs["Normal"], b.inputs["Normal"])
    # the ridge's ice: pale blue-grey broken faces, a little glossy, snow lying on the up-facing ones
    slab = bpy.data.materials.new("C_lake_slab")
    b = vb._principled(slab)
    g = vb.G(slab.node_tree)
    pos = g.position()
    geo = _new(g.n, "ShaderNodeNewGeometry")
    _nx, _ny, nz = sep3(g, geo.outputs["Normal"])
    top = g.math("MULTIPLY", g.smooth(nz, 0.15, 0.6), g.smooth(g.noise(pos, 2.0, 3.0), 0.22, 0.42))
    side = g.mix(g.smooth(g.noise(pos, 1.1, 3.0), 0.3, 0.7), (0.38, 0.46, 0.53), (0.56, 0.63, 0.70))
    g.link(g.mix(top, side, (0.84, 0.88, 0.93)), b.inputs["Base Color"])
    g.link(g.mixf(top, 0.32, 0.72), b.inputs["Roughness"])
    # seen against the moon its faces are in shadow: lake ice lets a little cold light through (they read as slate)
    b.inputs["Emission Color"].default_value = (0.55, 0.68, 0.82, 1.0)
    g.link(g.math("MULTIPLY", g.math("SUBTRACT", 1.0, top), 0.045), b.inputs["Emission Strength"])
    bp = _new(g.n, "ShaderNodeBump")
    bp.inputs["Strength"].default_value = 0.3
    bp.inputs["Distance"].default_value = 0.02
    g.link(g.noise(pos, 6.0, 3.0), bp.inputs["Height"])
    g.link(bp.outputs["Normal"], b.inputs["Normal"])
    ridge = [(38.5, -45.0), (35.0, -26.0), (39.5, -14.0), (36.0, -5.5), (41.5, 2.5), (37.0, 12.0), (40.5, 26.0), (38.0, 42.0)]

    def h(x, y):
        u = fbm(x * 0.12 + 3.0 * fbm(x, y, 0.05, 2), y, 0.55, 3)   # long and low along the wind (x)
        crest = math.exp(-(u * 4.2) ** 2)                            # a rounded crest (a sharp one zigzagged on the grid)
        cover = sstep(-0.15, 0.2, fbm(x + 40.0, y, 0.06, 2)) * sstep(14.5, 19.0, x)
        x_b = 15.6 + 1.1 * fbm(y, 3.0, 0.45, 2)                      # the bank at the cliff's foot: ragged, uneven
        x_in = 13.75 + 0.45 * fbm(y, 7.0, 0.8, 2)                     # its near edge ragged too (not the grid's start)
        bank = 0.12 * sstep(x_in, x_in + 0.5, x) * (1.0 - sstep(14.6, x_b, x)) * clamp(0.2 + 1.2 * fbm(x, y, 0.6, 2))
        berm = 0.5 * (1.0 - sstep(0.3, 2.8, poly_d(x, y, ridge))) * (0.6 + 0.6 * fbm(x, y, 0.9, 2))
        return 0.17 * crest * cover + bank + berm + 0.03 * fbm(x, y, 1.6, 2)

    # a finer grid near the arch, so the drifts' outlines are smooth curves and not cut-paper steps
    xs = grid_axis([(13.6, 75.0, 0.6), (13.6, 40.0, 0.3), (13.6, 26.0, 0.15)])
    ys = grid_axis([(-42.0, 42.0, 0.6), (-18.0, 18.0, 0.3), (-8.0, 8.0, 0.15)])
    nx = len(xs)
    hh = [[h(x, y) for x in xs] for y in ys]
    verts, faces, idx = [], [], {}
    for j in range(len(ys) - 1):
        for i in range(nx - 1):
            if max(hh[j][i], hh[j][i + 1], hh[j + 1][i], hh[j + 1][i + 1]) < 0.035:
                continue
            ks = ((j, i), (j, i + 1), (j + 1, i + 1), (j + 1, i))
            for k in ks:
                if k not in idx:
                    idx[k] = len(verts)
                    verts.append((xs[k[1]], ys[k[0]], z_ice - 0.035 + hh[k[0]][k[1]]))
            faces.append(tuple(idx[k] for k in ks))
    me = bpy.data.meshes.new("HM_LakeDrifts")
    me.from_pydata(verts, [], faces)
    me.update()
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    me.materials.append(m)
    COL["world"].objects.link(bpy.data.objects.new("HM_LakeDrifts", me))
    # the pressure ridge: irregular shards of ice shoved up along the line at many angles, some stacked on others,
    # rubble round them, with gaps where it is only a snowed-over crack
    mb = MB()
    pts = _resample(ridge, 0.45)
    plates = 0
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        if fbm(ax, ay, 0.11, 2) < -0.16:
            continue   # a gap
        ang = math.degrees(math.atan2(by - ay, bx - ax))
        nxv, nyv = -(by - ay), (bx - ax)
        ln = math.hypot(nxv, nyv) or 1.0
        for _ in range(rng.choice((1, 2, 2, 3))):
            t = rng.uniform(0.0, 1.0)
            off = rng.uniform(-0.5, 0.5)
            px, py = ax + (bx - ax) * t + off * nxv / ln, ay + (by - ay) * t + off * nyv / ln
            w, d, th = rng.uniform(0.35, 1.5), rng.uniform(0.3, 1.0), rng.uniform(0.07, 0.16)
            k = rng.randint(5, 7)
            ring = []
            for q in range(k):
                a = 2 * math.pi * (q + rng.uniform(-0.3, 0.3)) / k
                r = rng.uniform(0.62, 1.0)
                ring.append((0.5 * w * r * math.cos(a), 0.5 * d * r * math.sin(a)))
            v = [(qx, qy, th / 2) for qx, qy in ring] + [(qx, qy, -th / 2) for qx, qy in ring]
            f = [tuple(range(k)), tuple(reversed(range(k, 2 * k)))] + [(q, (q + 1) % k, k + (q + 1) % k, k + q) for q in range(k)]
            z0 = z_ice + rng.uniform(-0.08, 0.2) + (rng.uniform(0.1, 0.35) if rng.random() < 0.25 else 0.0)   # some stacked
            M = M4(px, py, z0, rz=ang + rng.uniform(-70.0, 70.0), ry=rng.uniform(-20.0, 20.0),
                   rx=rng.choice((-1, 1)) * rng.uniform(10.0, 75.0))
            mb.add(v, f, slab, M)
            plates += 1
            for _r in range(rng.choice((0, 1, 2))):   # ice rubble
                s = rng.uniform(0.08, 0.28)
                mb.box(s, s * rng.uniform(0.6, 1.2), s * rng.uniform(0.4, 0.9),
                       M4(px + rng.uniform(-0.6, 0.6), py + rng.uniform(-0.6, 0.6), z_ice + 0.02, rz=rng.uniform(0, 360),
                          rx=rng.uniform(-30, 30)), slab)
    mb.build("HM_LakeRidge", col="world", smooth=False)
    print(f"LAKE drifts {len(faces)} quads, pressure ridge {plates} shards", flush=True)


def build_sea_exit(scene, mp: WildMap, a) -> None:
    cv = SeaCave(mp)
    mp.hfun = cv.floor
    xs = grid_axis([(-16.0, 17.0, 0.25)])
    ys = grid_axis([(-10.0, 10.0, 0.25)])
    cave_floor(cv, cv.sample, xs, ys, lambda x, y: cv.fd.at(x, y) > -1.0 or (x > 13.0 and abs(y + 0.75) < 3.2), SE_GROUND)
    wall, roof = rock_material("HM_Rock_wall", SE_WALL), rock_material("HM_Rock_roof", SE_ROOF)
    _ob, loops = build_shell(cv, wall, roof)
    # the arch's outline ragged (an even curve read as a doorway) and the cliff across the whole cutaway section
    cliff_face(cv, "HM_Rock_face", "x", 13.5, -13.5, 13.5, -2.6, 7.0, 1.0,
               lambda u, z: (abs(u + 0.75) < 1.6 + 0.2 * fbm(z, 0.0, 1.3, 2) and
                             z < 2.3 + 0.9 * math.sqrt(max(0.0, 1.0 - ((u + 0.75) / 1.6) ** 2)) + 0.3 * fbm(u, 1.0, 1.2, 2)), wall)
    build_hull("HM_CaveHull", (-15.0, -8.5, -3.6, 14.5, 8.5, 7.5), holes={"E": (-2.5, 1.0, -3.6, 3.5)})   # under the arch's floor
    cm = cave_mats()
    wmat = ice_material()   # the frozen lake (owner, 2026-11-12), not open water
    # from the shingle's west edge (x 3): the floor sinks under -0.06 near x 4.5, so the shore follows the floor;
    # out past the arch the ice runs to the far shore (which rises through it from x 70)
    build_water("HM_Mere", wmat, -0.06, [(3.0, -7.6, 13.0, 7.6, 0.25), (13.0, -70.0, 101.0, 70.0, 2.0)], cv.floor)
    lake_relief(-0.06)
    far_shore(mp, no_trees=a.no_models or a.no_trees)
    pools = [(T(px, py), r) for px, py, r in ((9.6, 6.4, 0.5), (10.2, 3.3, 0.4), (8.7, 7.6, 0.35))]
    build_water("HM_Water_pools", wmat, -0.01, [(c[0] - r - 0.2, c[1] - r - 0.2, c[0] + r + 0.2, c[1] + r + 0.2, 0.1) for c, r in pools],
                cv.floor)
    # thinner than over open water: the far shore's pines should show faintly through it, 60-110 m out; clear over
    # the first 20 m past the arch, so the near ice, its drifts and the ridge read
    fog = volume_mat("HM_FogBank_vol", (0.70, 0.78, 0.92), 0.016, z0=0.0, fall=6.0, nscale=0.05, nbase=0.6, ngain=1.6,
                     anisotropy=0.3, ramp_x=(22.0, 46.0), emit=(0.62, 0.72, 0.92), emit_strength=0.0012, node="P_fogbank_density")
    mb = MB()
    mb.box(81.5, 90.0, 15.0, M4(54.25, 0.0, 6.5), fog)
    volume_object("HM_FogBank", mb)
    # a thin low mist over the frozen pool inside, its sides soft
    soft_mist("HM_ShallowsMist", (5.5, -7.6, 12.6, 7.6), -0.06, 0.9, 0.012, soft=1.6)
    sea_door(False, -13.25, cleft_span(cv, -13.25, -0.75), cm)
    stalactites(cv, [(T(4, 2)[0] + RNG.uniform(-0.8, 0.8), T(4, 2)[1] + RNG.uniform(-0.8, 0.8), RNG.uniform(0.3, 0.6), 0.1) for _ in range(3)] +
                [(T(RNG.uniform(3, 9), 1.2)[0], T(0, 1.2)[1], RNG.uniform(0.3, 0.6), 0.09) for _ in range(5)], cm["flowstone"])
    if not a.no_models:
        snow_mask_model("stalagmite_cluster", (0.30, 0.27, 0.23), 0.35, share=0.85)
        snow_mask_model("hollow_log", (0.34, 0.31, 0.27), 0.7, share=0.8)
        for name in ("stalagmite_cluster", "crates_barrels"):   # their lanterns: the sea door has no warm light
            darken_lanterns(name)
        mplace(mp, "stalagmite_cluster", *T(4, 2), facing="W", size=2.6, sink=0.05)
        mplace(mp, "crates_barrels", *T(12, 7), facing="W", size=2.0, sink=0.04)
        mplace(mp, "hollow_log", *T(9, 2), rot=20.0, size=3.2, sink=0.12, lod=0.8)
        mplace(mp, "hollow_log", *T(14.1, 8.05), rot=8.0, size=2.6, z=-0.06, sink=0.08, lod=0.8)   # frozen into the pool's ice
        for tx, ty, rot, size in ((22, 3.5, 60.0, 3.4), (27, 7, 190.0, 3.8), (33, 2, 300.0, 4.2)):
            ph_place(mp, "rock_moss_set_01", *T(tx, ty), rot=rot, size=size, piece=RNG.choice(("#1", "#2", "#3")), z=-1.6, lod=0.4)
        for tx, ty, size in ((18.3, 2, 6.0), (18.3, 8, 6.5)):
            ph_place(mp, "rock_face_01", *T(tx, ty), rot=90.0, size=size, z=-1.2, lod=0.6)
        ph_place(mp, "rock_moss_set_01", *T(0.5, 0.6), rot=40.0, size=1.8, piece="#2", sink=0.5, lod=0.7)
        avoid = [(c, 1.6) for c in cv.portals] + [(s, 0.8) for s in cv.spawns]
        cave_scatter_wall(cv, loops, 26, "rock_07", (0.15, 0.45), 0.15, avoid, sink_frac=0.3,
                          test=lambda x, y: x < 5.5)
        for _ in range(10):
            x, y = T(RNG.uniform(13, 16), RNG.uniform(1, 8))
            if abs(y + 0.75 - 0.3 * (x - 9.0)) > 0.8:   # keep the moonbeam's line on the water clean
                ph_place(mp, "rock_07", x, y, size=RNG.uniform(0.2, 0.5), lod=0.15, sink_frac=0.5)
        for _ in range(6):
            x, y = T(12.6, 0)[0] + RNG.uniform(0.0, 0.6), T(0, RNG.uniform(1, 8))[1]
            ph_place(mp, "rock_07", x, y, size=RNG.uniform(0.15, 0.3), lod=0.15, sink_frac=0.4)
        for tx, ty in ((13.3, 1.2), (16.4, 1.6), (16.5, 3.6), (16.4, 6.6), (15.5, 8.4), (13.4, 8.5)):
            ph_place(mp, "rock_moss_set_02", *T(tx, ty), piece=RNG.randint(1, ph_count("rock_moss_set_02")), size=RNG.uniform(0.6, 1.2),
                     lod=0.6, sink_frac=0.4)
        for _ in range(5):
            x, y = T(RNG.uniform(11.0, 12.5), RNG.uniform(1, 8))
            # driftwood on the shingle or lying on the ice, never sunk through it (one stood up out of the ice)
            ph_place(mp, "dry_branches_medium_01", x, y, piece=RNG.randint(1, ph_count("dry_branches_medium_01")), grade="bleach",
                     lod=0.4, size=RNG.uniform(0.8, 1.3), z=max(cv.floor(x, y), -0.06) - 0.02)
    x, y = T(*SE_MOSS)
    ob = point_light("moss", "se.lt_moss", x, y, cv.floor(x, y) + 1.6, 24.0, (0.30, 0.90, 0.74), radius=0.5, volume=0.3, shadow=True,
                     cutoff=16.0)   # lifted, softer reach: at 0.8 m it lit a hard disc
    ob.data.specular_factor = 0.35
    moss_glow("se.lt_moss_glow", x, y, cv.floor(x, y) + 0.25)
    x, y = T(15, 5)
    sh = area_light("shaft", "se.lt_sea", (x, y, 3.0), (-0.906, 0.0, -0.423), 3.0, 3.0, 60.0, (0.55, 0.70, 1.0), volume=0.6,
                    shadow=False, cutoff=12.0, gain=0.0)
    sh["wdi_phases"] = "day,dusk"   # 0 at night: give it wdi_gain 2 (60 W) for a dusk still
    # the moon on the lake spilling in: outside the arch, aimed down onto the ice inside, a soft ellipse, shadowed (so
    # only the arch lets it in), and no glint (its rectangle lay on the floor as a white slab)
    ob = area_light("moon_pool", "se.lt_moon", (15.6, -0.75, 2.6), (-0.935, 0.0, -0.354), 3.2, 2.6, 40.0, (0.55, 0.70, 1.0), volume=0.8,
                    shadow=True, cutoff=18.0)
    ob.data.shape = "ELLIPSE"
    ob.data.specular_factor = 0.0
    ob["wdi_vgain"] = 0.35   # its glow in the shallows' mist stood by the right jamb as a pale column
    # the moonlit ice's faint bounce onto the jambs and the vault (they were one flat ink mass): a soft panel on the ice
    # inside the arch, aimed up and in, no glint, no glow in the mist (look kind 'bounce')
    ob = area_light("bounce", "se.lt_ice_bounce", (11.6, -0.75, 0.12), (-0.45, 0.0, 0.89), 2.6, 3.2, 80.0, (0.62, 0.76, 1.0),
                    volume=0.0, shadow=True, cutoff=10.0, gain=0.12)
    ob.data.specular_factor = 0.0
    cut = view_cut("sea_exit")
    if cut is not None:
        lip = 13.5 + 0.36   # the cliff face's outermost bulge: the section overhangs its top a little

        def se_limit(x, y):   # the cove: the lake runs in to the cliff, its sides banked with snow up to the hill
            if x < 13.0:
                return 99.0
            w = 5.2 + 0.55 * max(0.0, x - 13.5) + 1.2 * fbm(x, y, 0.15, 2)
            return -0.25 + 0.55 * max(0.0, abs(y + 0.75) - w)

        cutaway(cv, loops, cut, (-36.0, -36.0, 40.0, 68.0),
                lambda x, y: 0.25 + 0.15 * fbm(x, y, 0.03, 3) + 0.06 * fbm(x, y, 0.15, 2) - 0.85 * sstep(14.5, 24.0, x),
                clip=lambda x, y: lip - x, clamp_hole=lambda x, y: (min(x, lip - 0.03), y),
                drop=lambda x, y: x > 13.3 and -2.9 < y < 1.4, limit=se_limit, fill_rect=(-19.0, -13.0, 13.5, 13.0), fill=0.3,
                moon=(325.0, 19.0, 1.1), seed=2, trees=30, rocks=12, frame=[(-22.3, 63.6), (73.9, 9.8), (15.9, -29.9), (-25.8, -6.6)],
                tree_keep=lambda x, y: y > -17.0 or x < -18.0, skip_lights=("HM_Moon", "L_moon_pool_se.lt_moon"))


# ---------------------------------------------------------------- The Flooded Gallery (scene 'cave_gallery')


CG_NICHES = ((15, 13), (23, 13), (2, 15), (29, 2))
CG_LODES = ((-9.0, 14.25, "y"), (-7.5, 14.25, "y"), (-3.75, 18.0, "x"), (3.75, 18.0, "x"), (7.5, 11.25, "y"))
CG_SHAFT = (17.25, 10.8)
CG_LAMP = (19.25, 4.3)   # the dropped miner's lamp (tile): tipped 78 degrees over, turned 35
CG_CRIB_MOSS = (16.2, -3.0)   # the collapse pocket's moss (world), on its north wall directly north of the crib
CG_WALL = dict(main=("mine_wall", 0.55, 0.3), wet_role="wet_rock", moss_role="moss_rock", moss_k=0.25, soil_role="soil",
               rough=(0.72, 0.38), glow=(0.12, 0.85, 0.66), glow_strength=0.12, lodes=CG_LODES,   # lodes in the shader
               tri_moss=((16.2, -3.0, 2.6),))   # the collapse pocket's moss: 3-D noise only (the scans smeared there)
CG_ROOF = dict(main=("rock_face", 0.45, 0.3), rough=(0.75, 0.4), soil_role="soil", wet_role="wet_rock", relief=0.7)
CG_GROUND = dict(
    base=dict(role="mine_floor", role2=("rock_ground", 0.3), k=0.65, desat=0.4, rough=0.42, nor="mine_floor"),
    classes=[
        dict(ch=("wdi_c", 0), role="river_rocks", k=0.55, desat=0.35, rough=0.2, shape=0.3),                   # the bed
        dict(ch=("wdi_c", 1), role="gravel", k=0.6, desat=0.3, rough=0.5, shape=0.2),                         # ballast
        dict(ch=("wdi_c", 2), role="rocky_gravel", role2=("mine_floor", 0.5), k=0.6, desat=0.35, rough=0.6),  # the rockfall
        # the heap: wet leaf litter and soil pulled toward slate (it read as clean pink sand under the beam)
        dict(ch=("wdi_c", 3), role="leaf_litter", role2=("soil", 0.4), k=0.32, desat=0.55, tint=(0.80, 0.88, 1.0), rough=0.75,
             shape=0.25, nor="leaf_litter"),
    ],
    snow=True, field=False, wet_rough=0.06)


def tile_mask(fd: Field, tiles) -> np.ndarray:
    m = np.zeros(fd.air.shape, dtype=bool)
    for tx, ty in tiles:
        i0, i1, j0, j1 = fd._window(vb.wx(tx), vb.wy(ty + 1), vb.wx(tx + 1), vb.wy(ty))
        if i0 <= i1 and j0 <= j1:
            m[j0:j1 + 1, i0:i1 + 1] = True
    return m


class GalleryCave(CaveCfg):
    """The Flooded Gallery: drifts under 3.9 m, the 4.6 m junction, the ore and engine chambers, the stope over black
    water, the collapse pocket and the rockfall, the sinkhole shaft over the engine chamber; arched roofs."""

    profile = "arch"
    C0, Zs0, R0 = 4.6, 3.2, 2.4
    wob = (0.0, 0.35, 0.4, 0.12, 1.6, -0.3, 0.45)
    crown_blur = 1.5
    portals = [(0.75, -19.5), (-28.5, -9.75)]

    def __init__(self, mp: WildMap):
        super().__init__(mp)
        fd = self.fd
        o = tile_mask(fd, list(mp.cells("O")))
        self.dO = np.where(o, -_chamfer(o, fd.res, 4.0), _chamfer(~o, fd.res, 4.0))
        block = [(tx, ty) for tx, ty in mp.cells("R") if (28 <= tx <= 36 and 19 <= ty <= 24) or (34 <= tx <= 36 and 16 <= ty <= 18)]
        r = tile_mask(fd, block)
        # metres from the nearest walkable tile (rock counts as not walkable), so the mound piles up against the back walls
        self.dR = np.where(r, _chamfer(r | tile_mask(fd, list(mp.cells("X"))), fd.res, 9.0), 0.0)
        self.heap, self.pit = T(31.0, 6.7), T(12.0, 16.85)
        self.ore = T(23, 3)

    def bounds(self):
        return -39.0, -32.5, 33.5, 24.0

    def solid_tiles(self):
        return set(CG_NICHES)

    def carve(self):
        fd = self.fd
        for tx, ty in CG_NICHES:      # the pit props' wall slots: 1.6 m wide, 0.6 m deep from the floor side
            x, ys = T(tx, ty)[0], vb.wy(ty + 1)
            fd.rect(x - 0.8, ys - 0.05, x + 0.8, ys + 0.6)
        fd.rect(7.4, 13.55, 8.4, 14.95)            # the ore chute's recess in 25,4, from its west face
        fd.rect(-12.0, -5.3, -10.5, -4.4)          # the sump's alcove in 12,17, from its north face
        fd.poly([(-0.55, -19.0), (2.05, -19.0), (2.05, -28.5), (4.8, -28.5), (4.8, -31.1), (-0.55, -31.1)])   # cg.upper
        fd.poly([(-28.4, -8.75), (-28.4, -10.75), (-36.5, -10.75), (-36.5, -5.75), (-34.5, -5.75), (-34.5, -8.75)])  # cg.fen

    def regions(self):
        def r(tx0, ty0, tx1, ty1):
            return TR(tx0 - 0.5, ty0 - 0.5, tx1 + 0.5, ty1 + 0.5)

        def ty(Y):
            return 13.5 - Y / 1.5

        def tx(X):
            return X / 1.5 + 19.5

        return [
            (r(14, 1, 25, 8), 5.4, None, 2.4),                                                       # the ore chamber
            (r(26, 2, 38, 13), 6.6, None, 2.4),                                                      # the engine chamber
            (r(14, 14, 28, 21), 4.6, None, 2.4),                                                     # the junction
            (r(17, 9, 22, 13), 3.9, None, 2.4),                                                      # the rail drift
            (r(2, 3, 13, 15), lambda X, Y: 9.0 - 2.0 * np.clip((ty(Y) - 3.0) / 13.0, 0.0, 1.0), None, 2.4),  # the stope
            (r(5, 16, 13, 16), 7.0, None, 2.4),
            (r(0, 16, 4, 23), 4.0, None, 2.4),                                                       # the fen landing
            (r(5, 19, 5, 20), 4.0, None, 2.4),
            (r(18, 21, 22, 26), 3.9, None, 2.4),                                                     # the entry passage
            (r(28, 19, 36, 24), lambda X, Y: 5.0 - 1.2 * np.clip(np.maximum((ty(Y) - 19.0) / 5.0, (tx(X) - 28.0) / 8.0), 0.0, 1.0),
             None, 2.4),                                                                             # the rockfall's void
            (r(34, 16, 36, 18), lambda X, Y: 5.0 - 1.2 * np.clip((tx(X) - 33.0) / 3.0, 0.0, 1.0), None, 2.4),
            (r(29, 16, 33, 18), lambda X, Y: 2.6 - 0.5 * np.clip((tx(X) - 29.0) / 4.0, 0.0, 1.0), None, 2.4),  # the squeeze
            ((-0.6, -31.2, 4.9, -19.0), 2.8, None, 2.4),                                            # cg.upper's drift
            ((-36.6, -10.9, -28.0, -5.6), 2.2, None, 2.4),                                          # cg.fen's adit
        ]

    def roof_noise(self, x, y):
        big = 0.8 * fbm(x + 13.0, y, 0.07, 2) * (1.0 - sstep(3.8, 5.2, 9.0 - self.fd.at(x, y, self.C, 4.6)))
        return 0.35 * fbm(x, y, 0.35, 3) + big

    def roof_hole(self, x, y):
        return ((x - CG_SHAFT[0]) / 1.4) ** 2 + ((y - CG_SHAFT[1]) / 1.7) ** 2 < 1.0

    def heap_shape(self, x, y):
        """The landing heap: a lumpy distance from its off-centre peak, and the distance from its spill tongue."""
        hx, hy = self.heap
        rh = math.hypot((x - hx - 0.3) * 0.85, (y - hy + 0.2) * 1.12) + 0.32 * fbm(x, y, 0.9, 2)
        return rh, seg_d(x, y, hx - 0.2, hy - 0.3, hx - 1.9, hy - 1.6)

    def springline(self, x, y):
        # in the stope the wall's top wanders a metre (a level spring line read as a long straight ledge)
        z = super().springline(x, y)
        k = 1.0 - sstep(-12.0, -10.0, x)
        return z + k * 0.9 * fbm(x + 7.0, y, 0.11, 2) if k > 0.0 else z

    def floor_raw(self, x, y):
        fd = self.fd
        z = 0.06 * fbm(x, y, 0.5, 3) + 0.12 * fbm(x, y, 0.08, 2)
        rp = math.hypot((x - 22.4) * 0.8, (y - 9.75) * 1.2) + 0.25 * fbm(x, y, 1.1, 2)
        if rp < 1.4:
            z -= 0.09 * (1.0 - sstep(0.5, 1.3, rp))   # the hollow at the engine's foot that holds standing water
        w = tile_weights(self.mp, x, y)
        wet = w.get("~", 0.0) + w.get("O", 0.0) + w.get("w", 0.0)
        if wet > 0.0:
            d = fd.at(x, y, self.dO, 9.0) + 0.3 * fbm(x, y, 0.7, 2)   # the drop line wobbles (a ruled kerb read as a pool)
            bed = -0.20 if d > 0.45 else lerp(-1.5, -0.20, d / 0.45) if d > 0.0 else lerp(-1.5, -3.0, min(1.0, -d))
            if w.get("w", 0.0) > 0.4:
                bed = max(bed, -1.2)   # the drowned rib under the walkway
            z = lerp(z, bed, min(1.0, wet))
        dr = fd.at(x, y, self.dR, 0.0)
        if dr > 0.0:
            z += min(4.2, 0.55 * dr) + 0.35 * fbm(x, y, 0.6, 2) * sstep(0.0, 1.0, dr)
        rh, tg = self.heap_shape(x, y)
        if rh < 2.7 or tg < 1.0:   # a lumpy cone, its peak off-centre, a spill tongue (a long flat-crested ridge read as a grave)
            cone = max(0.62 * max(0.0, 1.0 - rh / 2.55) ** 1.5, 0.2 * max(0.0, 1.0 - tg / 0.95) ** 1.2)
            z += cone + 0.1 * fbm(x, y, 2.4, 2) * sstep(0.0, 0.3, cone)
        r = math.hypot(x - self.ore[0], y - self.ore[1])
        if r < 0.75:
            z += 0.45 * math.cos(math.pi * r / 1.5) ** 2
        z += 0.08 * (1.0 - sstep(0.15, 0.6, seg_d(x, y, *self.ore, 7.35, 14.25)))   # the crushed-ore skirt to the chute lip
        for tx_, ty_ in ((33, 5), (33, 6), (33, 7), (34, 7), (35, 7), (36, 5), (36, 6)):
            cx, cy = T(tx_, ty_)
            z -= 0.08 * (1.0 - sstep(0.5, 1.1, math.hypot(x - cx, y - cy))) * (1.0 - sstep(1.6, 2.4, math.hypot(x - self.heap[0], y - self.heap[1])))
        z -= 0.02 * (1.0 - sstep(0.15, 0.3, poly_d(x, y, [(-22.575, -6.75), (-28.35, -9.75), (-30.35, -9.75)])))   # the rot seep
        px, py = self.pit
        inside = min(0.5 - abs(x - px), 0.55 - abs(y - py))
        z = lerp(z, -2.0, sstep(0.0, 0.12, inside))                                  # the sump pit
        inside = min(0.65 - abs(x - 22.5), 0.65 - abs(y - 14.25))
        z = lerp(z, -2.5, sstep(0.0, 0.1, inside))                                   # the pump shaft
        if y < -19.0 and -1.5 < x < 5.5:
            z += 0.5 * sstep(-19.5, -28.5, y)                                         # cg.upper rises toward the Tin Gallery
        return z

    def wall_attrs(self, x, y, z):
        near_water = 1.0 - sstep(1.0, 1.5, rect_d(x, y, (-25.5, -4.5, -9.0, 15.0)))
        wet = max(1.0 - sstep(1.0, 1.4, z + 0.1 * fbm(x, y, 1.0, 2)), near_water * (1.0 - sstep(2.0, 3.0, z)))
        soil = 1.0 - sstep(-29.0, -28.2, x) if -11.0 < y < -5.0 else 0.0
        glow = moss = 0.0
        # the two moss patches, about 1.0 x 1.4 m with seams to 1.6 m (the entry passage's east wall; the collapse
        # pocket's north wall, directly north of the crib)
        for (gx, gy), (z0, z1), (hw, reach) in (((3.0, -14.25), (0.5, 1.9), (0.5, 1.6)), (CG_CRIB_MOSS, (0.3, 1.6), (0.45, 1.5))):
            d = math.hypot(x - gx, y - gy)
            band = sstep(z0 - 0.2, z0 + 0.1, z) * (1.0 - sstep(z1 - 0.1, z1 + 0.2, z))
            glow = max(glow, band * (1.0 - sstep(hw * 0.6, hw, d)) + 0.3 * band * (1.0 - sstep(hw, reach, d)) * sstep(0.4, 0.6, 0.5 + fbm(x, z, 2.0, 2)))
            moss = max(moss, (1.0 - sstep(1.2, 2.0, d)) * (1.0 - sstep(1.5, 2.5, z)))
        lode = 0.0
        for lx, ly, axis in CG_LODES:
            u, perp = (y - ly, abs(x - lx)) if axis == "y" else (x - lx, abs(y - ly))
            zc = 1.4 + 0.7 * u
            lode = max(lode, (1.0 - sstep(0.12, 0.2, abs(z - zc))) * (1.0 - sstep(0.8, 0.95, abs(u))) * (1.0 - sstep(0.6, 0.9, perp)))
        return (wet, 0.0, moss, 0.0), (glow, lode, 0.0, soil)

    def sample(self, x, y):
        z = self.floor(x, y)
        w = tile_weights(self.mp, x, y)
        bed = clamp((w.get("~", 0.0) + w.get("O", 0.0) + w.get("w", 0.0)) * 1.3)
        rails = (1.0 - sstep(0.5, 0.6, abs(x - 0.75))) * w.get("=", 0.0) * 1.2
        rock = clamp(1.6 * sstep(0.0, 0.8, self.fd.at(x, y, self.dR, 0.0)))
        rh, tg = self.heap_shape(x, y)
        heap = max(1.0 - sstep(2.1, 2.55, rh), 1.0 - sstep(0.75, 1.05, tg))
        dust = 0.35 * (1.0 - sstep(1.6, 2.4, math.hypot(x - CG_SHAFT[0], y - (CG_SHAFT[1] + 0.15)))) * heap
        # snow on the slope facing the engine still, its edge ragged (a hard line read as spilled paint from above)
        dust = max(dust, 0.36 * heap * (1.0 - sstep(0.9, 1.8, rh)) * sstep(0.5, -1.0, y - self.heap[1] + 0.45 * fbm(x, y, 1.3, 2)))
        f = self.fd.at(x, y)
        wet = max(sstep(0.58, 0.68, 0.5 + 0.5 * fbm(x, y, 1.0, 3)), 1.0 - sstep(0.2, 0.5, f), bed,
                  1.0 - sstep(0.15, 0.4, poly_d(x, y, [(-22.575, -6.75), (-28.35, -9.75), (-30.35, -9.75)])))
        return z, {"wdi_c": (bed, clamp(rails), rock, heap), "wdi_d": (0.0, 0.0, 0.0, 0.0), "wdi_s": (dust, 0.0, clamp(wet) * 0.8, 0.0)}


def lamp_frame(cv: CaveCfg):
    """The dropped lamp (wooden_lantern_01 at 0.38 m): its rotation, its base centre and its flame. The flame stands
    upright on the candle's wick, 0.40 of the lantern's height up its axis (the .blend's candle top is 0.213 m up a
    0.530 m lantern), so it burns inside the glass of the tipped lamp; the lamp's light sits in it."""
    fx, fy = T(*CG_LAMP)
    R = Matrix.Rotation(math.radians(35.0), 4, "Z") @ Matrix.Rotation(math.radians(78.0), 4, "X")
    base = Vector((fx, fy, cv.floor(fx, fy) + 0.08))
    wick = base + R.to_3x3() @ Vector((0.0, 0.0, 0.40 * 0.38))
    return R, base, wick + Vector((0.0, 0.0, 0.025))


def wall_x(cv: CaveCfg, x: float, y: float, dx: float, dy: float, reach: float = 4.0) -> tuple[float, float]:
    """March from (x, y) along (dx, dy) to the wall line; the point just before it."""
    s = 0.0
    while s < reach and cv.fd.at(x + dx * s, y + dy * s) > 0.0:
        s += 0.05
    return x + dx * s, y + dy * s


def splintered_end(mb: MB, M: Matrix, w: float, h: float, rng, outer_mat, inner_mat, reach: float = 0.34,
                   cols: int = 6, rows: int = 8) -> None:
    """The snapped end of a squared timber w x h, at the origin of M and facing +y: the pale face of the break, and
    over it a ragged brush of torn fibres (pale fresh wood inside, the dark wet skin round the outside), each tapering
    to a sliver and kinked once, set off a regular grid, of many lengths, some torn out, the break running long on
    one side, a few long slivers and a few bent out (cone splinters read as the spikes of a club; a grid of blunt
    prisms as stacked blocks)."""
    mb.box(w * 0.97, 0.02, h * 0.97, M, inner_mat)
    tongue = rng.choice((-1, 1))
    for i in range(cols):
        for j in range(rows):
            if rng.random() < 0.18:
                continue   # torn out
            u = -w / 2 + w * (i + 0.5 + rng.uniform(-0.3, 0.3)) / cols
            v = -h / 2 + h * (j + 0.5 + rng.uniform(-0.3, 0.3)) / rows
            fw, fh = w / cols * rng.uniform(0.75, 1.2), h / rows * rng.uniform(0.75, 1.2)
            edge = i in (0, cols - 1) or j in (0, rows - 1)
            ln = reach * (0.2 + 0.8 * (0.5 + tongue * u / w)) * rng.uniform(0.1, 1.0) ** 0.8
            if rng.random() < 0.12:
                ln *= 1.6   # a long sliver
            if ln < 0.02:
                continue
            bend = 0.45 if rng.random() < 0.2 else 0.15
            du, dv = rng.uniform(-bend, bend) * ln, rng.uniform(-bend, bend) * ln
            tip, mid = rng.uniform(0.08, 0.3), rng.uniform(0.55, 0.8)
            v0 = [(u - fw / 2, 0.0, v - fh / 2), (u + fw / 2, 0.0, v - fh / 2), (u + fw / 2, 0.0, v + fh / 2), (u - fw / 2, 0.0, v + fh / 2)]
            v1 = [(u + 0.35 * du + (p[0] - u) * mid, 0.55 * ln, v + 0.35 * dv + (p[2] - v) * mid) for p in v0]
            v2 = [(u + du + (p[0] - u) * tip, ln, v + dv + (p[2] - v) * tip) for p in v0]
            mb.add(v0 + v1 + v2, [(0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0),
                                  (4, 8, 9, 5), (5, 9, 10, 6), (6, 10, 11, 7), (7, 11, 8, 4), (11, 10, 9, 8)],
                   outer_mat if edge else inner_mat, M)


def cast_rust_mat() -> bpy.types.Material:
    """C_cast_rust: old cast iron in a wet mine: near-black iron, half metallic, with rust running down it in streaks
    and gathering low down, rough where rusted, pitted."""
    if "C_cast_rust" in _MATS:
        return _MATS["C_cast_rust"]
    m = bpy.data.materials.new("C_cast_rust")
    b = vb._principled(m)
    g = vb.G(m.node_tree)
    pos = g.position()
    _x, _y, z = sep3(g, pos)
    streak = g.smooth(g.noise(_cv_vmul(g, pos, (2.6, 2.6, 0.4)), 2.0, 4.0, 0.6), 0.6, 0.72)
    low = g.math("MULTIPLY", g.math("SUBTRACT", 1.0, g.smooth(z, 0.45, 1.1)), g.smooth(g.noise(pos, 3.0, 3.0), 0.45, 0.62))
    rust = g.math("MAXIMUM", streak, g.math("MULTIPLY", low, 0.6))
    iron = g.mix(g.noise(pos, 4.0, 3.0), (0.03, 0.031, 0.034), (0.07, 0.07, 0.072))
    rc = g.mix(g.noise(pos, 7.0, 3.0), (0.075, 0.045, 0.03), (0.16, 0.08, 0.04))
    g.link(g.mix(rust, iron, rc), b.inputs["Base Color"])
    g.link(g.mixf(rust, 0.65, 0.0), b.inputs["Metallic"])
    g.link(g.mixf(rust, 0.42, 0.88), b.inputs["Roughness"])
    bp = _new(g.n, "ShaderNodeBump")
    bp.inputs["Strength"].default_value = 0.35
    bp.inputs["Distance"].default_value = 0.01
    g.link(g.math("ADD", g.math("MULTIPLY", g.noise(pos, 22.0, 4.0), 0.6), g.math("MULTIPLY", rust, 0.4)), bp.inputs["Height"])
    g.link(bp.outputs["Normal"], b.inputs["Normal"])
    _MATS["C_cast_rust"] = m
    return m


def sharp_by_angle(ob, deg: float = 35.0) -> None:
    """Smooth-shaded round parts with their rims kept sharp (caps and flanges did not smear into the sides)."""
    if ob is not None and hasattr(ob.data, "set_sharp_from_angle"):
        ob.data.set_sharp_from_angle(angle=math.radians(deg))


def rubble_mound(mb: MB, x: float, y: float, r: float, hgt: float, floor, mat, rng, n: int = 14) -> None:
    """A low heap of broken rock under the loose stones: a lumpy cone of r and hgt, sunk at its rim."""
    rings = 4
    pts = []
    for j in range(rings + 1):
        t = j / rings
        row = []
        for i in range(n):
            a = 2 * math.pi * i / n
            rr = r * (1.0 - t) * (0.75 + 0.35 * rng.random())
            px, py = x + rr * math.cos(a), y + rr * math.sin(a)
            zz = floor(px, py) - 0.05 + hgt * (1.0 - (1.0 - t) ** 1.6) * (0.8 + 0.4 * rng.random())
            row.append((px, py, zz))
        pts.append(row)
    for j in range(rings):
        for i in range(n):
            i2 = (i + 1) % n
            mb.add([pts[j][i], pts[j][i2], pts[j + 1][i2], pts[j + 1][i]], [(0, 1, 2, 3)], mat)


def gallery_props(cv: GalleryCave, cm: dict, models: bool, loops) -> None:
    """The beam engine, the ore chute, the timber sets, the rails, the walkway, the sump, the shaft and its haze,
    flakes and roots, the mist on the stope, the mere-rot seep, and (with models) the cart, the crate, the crib, the
    dropped lamp and the rubble."""
    mp = cv.mp
    oak = role_mat("C_oak", "timber_rough", k=0.5, desat=0.2, rough=0.5, wet_below=0.6)
    fresh = flat_mat("C_fresh_wood", (0.55, 0.45, 0.32), 0.7)
    # the broken beam pumping engine on its granite bed (tiles x34-35, y4-6; the beam runs north-south): the dressed
    # granite bob wall under a coping, the oak beam strapped in iron on its gudgeon between two plummer blocks, its
    # south arm snapped into a ragged break with a chain hanging from it, the arm itself lying by the bed in a puddle,
    # and the cast-iron cylinder (flanged, ribbed, bolted, streaked with rust) with its bent piston rod and valve chest
    # (a block-out with cone splinters beside a plain grey slab read as a spiked trap, not a ruined engine: review)
    rusty = cast_rust_mat()
    srng = random.Random(3141)   # the engine's own sequence: RNG stays as it was
    for _ in range(25):
        RNG.random()             # the 25 draws the old cone splinters made
    mb = MB()
    # the granite bed (x 21.1..23.9, y 10.65..14.85) wraps the pump shaft's 1.3 m hole (x 21.85..23.15, y 13.6..14.9)
    # on three sides and leaves it open: the south slab and the two flanks
    mb.box(2.8, 2.95, 0.35, M4(22.5, 12.125, -0.05), cm["stone"], base=True)
    for sx in (-1.025, 1.025):
        mb.box(0.75, 1.25, 0.35, M4(22.5 + sx, 14.225, -0.05), cm["stone"], base=True)
    bx, by = 22.5, 12.9
    mb.box(2.2, 1.2, 2.6, M4(bx, by, 0.3), cm["stone"], base=True)
    mb.box(2.34, 1.32, 0.15, M4(bx, by, 2.9), cm["stone"], base=True)              # the coping
    pivot = Vector((bx, by, 3.45))
    for sx in (-0.47, 0.47):                                                        # the plummer blocks and their caps
        mb.box(0.3, 0.44, 0.34, M4(bx + sx, by, 3.05), rusty, base=True)
        mb.box(0.34, 0.3, 0.1, M4(bx + sx, by, 3.39), rusty, base=True)
        for sy in (-0.16, 0.16):
            mb.box(0.05, 0.05, 0.06, M4(bx + sx, by + sy, 3.49), cm["iron"], base=True)
    arm = Vector((0.0, math.cos(math.radians(14.0)), -math.sin(math.radians(14.0))))
    c = pivot + arm * 1.075
    mb.box(0.42, 2.15, 0.6, M4(c.x, c.y, c.z, rx=-14.0), oak)                      # the north arm over the pump shaft
    for d in (0.55, 1.35):                                                          # its iron straps
        p = pivot + arm * d
        mb.box(0.46, 0.07, 0.64, M4(p.x, p.y, p.z, rx=-14.0), rusty)
    mb.box(0.42, 0.82, 0.6, M4(bx, by - 0.41, 3.45), oak)                           # the stub of the snapped south arm,
    mb.box(0.46, 0.07, 0.64, M4(bx, by - 0.25, 3.45), rusty)                        # out past the coping
    splintered_end(mb, M4(bx, by - 0.82, 3.45, rz=180.0), 0.42, 0.6, srng, oak, fresh, reach=0.36)
    # the arm that broke away: on the floor by the bed's south-west corner, its own break toward the stub
    th = math.radians(215.0)
    fx, fy = 20.5, 9.75
    fz = cv.floor(fx, fy) + 0.26
    FM = M4(fx, fy, fz, rz=math.degrees(th) - 90.0)
    mb.box(0.42, 2.3, 0.6, FM, oak)
    mb.box(0.3, 0.04, 0.3, FM @ M4(0.0, -1.17, 0.0), rusty)                         # the end plate of its old joint
    splintered_end(mb, FM @ M4(0.0, 1.15, 0.0), 0.42, 0.6, srng, oak, fresh, reach=0.42)
    for _ in range(9):                                                              # torn chips round the break
        a = srng.uniform(0.0, 2.0 * math.pi)
        cx_, cy_ = fx + 1.45 * math.cos(th) + srng.uniform(0.1, 0.8) * math.cos(a), fy + 1.45 * math.sin(th) + srng.uniform(0.1, 0.8) * math.sin(a)
        mb.box(srng.uniform(0.03, 0.06), srng.uniform(0.12, 0.3), 0.02, M4(cx_, cy_, cv.floor(cx_, cy_) + 0.01, rz=srng.uniform(0, 180)), fresh)
    pin = pivot + arm * (1.35 / math.cos(math.radians(14.0)))
    mb.box(0.22, 0.22, pin.z + 1.6, M4(pin.x, pin.y, -1.6), oak, base=True)   # the pump rod into the flooded shaft
    for k in range(int((pin.z + 1.6) / 0.5)):
        mb.box(0.25, 0.25, 0.04, M4(pin.x, pin.y, -1.6 + 0.5 * k + 0.25), cm["rust"])
    # the 0.25 m timber collar round the shaft: the south, east and west boards on the bed's top (z 0.30), the north
    # board, past the bed's end, on the floor
    for sx, sy, lx, ly in ((0.0, 0.775, 1.8, 0.25), (0.0, -0.775, 1.8, 0.25), (0.775, 0.0, 0.25, 1.3), (-0.775, 0.0, 0.25, 1.3)):
        mb.box(lx, ly, 0.25, M4(22.5 + sx, 14.25 + sy, -0.1 if sy > 0.0 else 0.30), oak, base=True)
    ccx, ccy = 22.575, 11.25
    for zz, nb in ((0.40, 16), (2.50, 16)):                                         # the flange bolts
        for k in range(nb):
            a = 2 * math.pi * (k + 0.5) / nb
            mb.box(0.05, 0.05, 0.045, M4(ccx + 0.62 * math.cos(a), ccy + 0.62 * math.sin(a), zz, rz=math.degrees(a)), cm["iron"], base=True)
    mb.box(0.42, 0.55, 0.95, M4(ccx + 0.78, ccy, 0.3), rusty, base=True)           # the valve chest, flanged
    mb.box(0.5, 0.63, 0.06, M4(ccx + 0.78, ccy, 1.25), rusty, base=True)
    mb.box(0.03, 0.06, 0.55, M4(ccx - 0.1, ccy - 0.1, 3.0, ry=24.0), cm["iron"])  # the snapped link off the piston rod
    for start, n, step in ((Vector((pin.x, pin.y + 0.1, pin.z - 0.1)), 20, Vector((0.0, 0.0, -0.06))),
                           (Vector((bx + 0.12, by - 0.76, 3.12)), 22, Vector((0.0, 0.0, -0.06)))):   # the chains
        for i in range(n):
            p = start + step * i
            mb.torus(0.03, 0.007, 8, 4, M4(p.x, p.y, p.z, rx=90.0 if i % 2 else 0.0, rz=90.0 if i % 2 else 0.0), cm["rust"])
    mb.build("WP_beam_engine", col="models", smooth=False)
    # the round iron, smooth-shaded (a flat-shaded 20-gon read as a grey slab): the gudgeon, the cylinder with its base
    # and top flanges, two cast ribs and a cover, the stuffing box and gland, the piston rod bent where its link
    # snapped, and the steam pipe to the wall with its flanges
    mb = MB()
    mb.cyl(0.075, 0.075, 1.36, 20, M4(bx - 0.68, by, 3.45, ry=90.0), rusty)
    for r0, r1, h, z0 in ((0.66, 0.66, 0.10, 0.30), (0.55, 0.55, 2.0, 0.40), (0.585, 0.585, 0.05, 1.05), (0.585, 0.585, 0.05, 1.75),
                          (0.66, 0.66, 0.10, 2.40), (0.60, 0.52, 0.10, 2.50), (0.15, 0.15, 0.18, 2.60), (0.19, 0.19, 0.04, 2.78)):
        mb.cyl(r0, r1, h, 40, M4(ccx, ccy, z0), rusty)
    mb.tube([(ccx, ccy, 2.82), (ccx, ccy, 3.25), (ccx - 0.08, ccy - 0.05, 3.42), (ccx - 0.22, ccy - 0.13, 3.5)], 0.05, 12, cm["iron"])
    ex, _ey = wall_x(cv, ccx + 1.0, ccy, 1.0, 0.0, 6.0)
    mb.tube([(ccx + 0.95, ccy, 1.0), (ex + 0.3, ccy, 1.0)], 0.075, 16, rusty)
    xf = ccx + 1.5
    while xf < ex - 0.2:
        mb.cyl(0.11, 0.11, 0.035, 16, M4(xf, ccy, 1.0, ry=90.0), rusty)
        xf += 1.2
    sharp_by_angle(mb.build("WP_engine_iron", col="models", smooth=True))
    # the timber ore chute in its recess (opening west into 24,4), a gate half open, the trough climbing east
    mb = MB()
    x0, yc = 7.45, 14.25
    for sy in (-0.45, 0.45):
        mb.box(0.12, 0.12, 0.35, M4(x0 + 0.5, yc + sy, 0.0), oak, base=True)
    mb.box(0.95, 1.1, 0.05, M4(x0 + 0.5, yc, 0.35), oak, base=True)
    mb.box(0.05, 1.1, 1.3, M4(x0 + 0.95, yc, 0.35), oak, base=True)
    for sy in (-0.55, 0.55):
        mb.box(0.95, 0.05, 1.3, M4(x0 + 0.5, yc + sy, 0.35), oak, base=True)
    mb.box(0.04, 0.9, 0.5, M4(x0 - 0.12, yc, 1.4, ry=-50.0), oak)
    for sy in (-0.42, 0.42):
        mb.box(0.03, 0.02, 0.08, M4(x0 + 0.02, yc + sy * 0.9, 1.6), cm["rust"])
    for t in range(4):
        mb.box(0.6, 0.8, 0.04, M4(x0 + 1.0 + 0.45 * t, yc, 1.65 + 0.64 * t, ry=-55.0), oak)
    mb.build("WP_ore_chute", col="models")
    # timber: four wall-niche sets, the drift sets, the portal sets down both drifts
    mb = MB()
    tag = flat_mat("C_tin_tag", (0.35, 0.36, 0.37), 0.5, metal=0.6)
    for tx, ty in CG_NICHES:
        x, y = T(tx, ty + 0.25)
        y = vb.wy(ty + 1) + 0.375
        timber_set(mb, x, y, cv.floor(x, y) - 0.05, -90.0, 0.75, 0.22, 3.0, 0.24, cm["timber_dark"], lag=5, lag_len=0.3, batter=3.0)
        mb.box(0.08, 0.01, 0.05, M4(x - 0.75, y - 0.12, cv.floor(x, y) + 1.5), tag)
    for ty in (23.9, 21.3, 12.9, 10.9):
        x, y = T(20, ty)
        wl, _ = wall_x(cv, x, y, -1.0, 0.0)
        wr, _ = wall_x(cv, x, y, 1.0, 0.0)
        half = max(0.6, (wr - wl) / 2 - 0.4)
        mid = (wl + wr) / 2
        cap = min(3.1, cv.roof_z(mid, y, cv.fd.at(mid, y)) - 0.15 - cv.floor(mid, y))
        timber_set(mb, mid, y, cv.floor(mid, y) - 0.05, 90.0, half, 0.26, max(2.2, cap - 0.3), 0.30, cm["timber"], lag=5, lag_len=1.0)
    for k in range(5):
        y = -19.65 - 1.8 * k
        timber_set(mb, 0.75, y, cv.floor(0.75, y) - 0.05, 90.0, 1.3, 0.26, 2.6, 0.30, cm["timber"], lag=5, lag_len=1.0)
    for k in range(4):
        x = -28.5 - 1.8 * k
        timber_set(mb, x, -9.75, cv.floor(x, -9.75) - 0.05, 0.0, 1.0, 0.24, 2.2, 0.28, cm["timber"], lag=4, lag_len=1.0)
    mb.build("WP_timber_sets", col="models")
    # the tram rails from the cart's own stub to the stop block
    mb = MB()
    y0, y1 = 0.15, 11.9
    for sx in (-0.24, 0.24):
        mb.box(0.045, y1 - y0, 0.075, M4(0.75 + sx, (y0 + y1) / 2, 0.07), cm["rail"], base=True)
    rot = set(RNG.sample(range(26), 3))
    for k in range(26):
        y = y0 + 0.2 + 0.45 * k
        if y > y1:
            break
        mb.box(0.80, 0.14, 0.07, M4(0.75, y, 0.0, rz=RNG.uniform(-12, 12) if k in rot else 0.0), cm["timber_dark"], base=True)
    mb.box(0.9, 0.25, 0.25, M4(0.75, y0 - 0.05, 0.0), cm["timber_dark"], base=True)
    for sx in (-0.3, 0.3):
        mb.cyl(0.02, 0.02, 0.45, 6, M4(0.75 + sx, y0 - 0.2, -0.1), cm["iron"])
    mb.build("WP_rails", col="models")
    # the plank walkway across the stope, row 10 (two boards missing, one split and sagging, posts, a rope handline)
    mb = MB()
    x = -25.5 + 0.13
    while x < -9.1:
        tx = x / 1.5 + 19.5
        if abs(tx - 8.0) < 0.12 or abs(tx - 8.18) < 0.12:
            x += 0.255
            continue
        sag = 0.04 if abs(tx - 12.0) < 0.15 else 0.0
        mb.box(0.24 + RNG.uniform(-0.03, 0.03), 1.2, 0.05, M4(x, 5.25, 0.07 - sag + RNG.uniform(-0.008, 0.008), rz=RNG.uniform(-1.2, 1.2)),
               cm["board"])
        x += 0.255
    for sy in (4.75, 5.75):
        mb.box(16.5, 0.14, 0.20, M4(-17.25, sy, -0.15), cm["timber_dark"])
    for k in range(10):
        px = -24.0 + 1.5 * k
        for sy in (4.75, 5.75):
            mb.box(0.18, 0.18, 1.2, M4(px, sy, -1.2), cm["timber_dark"], base=True)
        mb.box(0.06, 1.2, 0.06, M4(px, 5.25, -0.6, rx=40.0), cm["timber_dark"])
    stakes = [-25.0 + 3.0 * k for k in range(6)]
    for px in stakes:
        mb.box(0.06, 0.06, 1.0, M4(px, 5.8, 0.1), cm["timber_dark"], base=True)
    rope = flat_mat("C_rope", (0.28, 0.24, 0.17), 0.9)
    for a0, a1 in zip(stakes, stakes[1:]):
        mb.tube([(a0, 5.8, 1.08), ((a0 + a1) / 2, 5.8, 0.95), (a1, 5.8, 1.08)], 0.0125, 6, rope)
    mb.build("WP_walkway", col="world")
    # the flooded sump: a rim of stones, an old board collar, the grate half fallen in
    px, py = cv.pit
    mb = MB()
    mb.box(1.2, 0.18, 0.05, M4(px, py - 0.62, cv.floor(px, py - 0.62)), cm["board"], base=True)
    mb.box(1.2, 0.18, 0.05, M4(px, py + 0.62, cv.floor(px, py + 0.62)), cm["board"], base=True)
    grate = M4(px + 0.1, py, -0.25, rx=55.0)
    for k in range(6):
        mb.box(0.03, 0.6, 0.03, grate @ M4(-0.45 + 0.18 * k, 0.0, 0.0), cm["rust"])
    for sy in (-0.3, 0.3):
        mb.box(0.9, 0.03, 0.03, grate @ M4(0.0, sy, 0.0), cm["rust"])
    mb.build("WP_sump", col="models")
    # the sinkhole shaft: from the roof's hole up to the glade at 9 m, rock then soil, a leaf-litter lip
    sx, sy = CG_SHAFT
    zb = cv.roof_z(sx + 1.5, sy, cv.fd.at(sx + 1.5, sy)) - 0.4
    n, rings = 40, 8
    ring = []
    for j in range(rings + 1):
        t = j / rings
        z = zb + (9.4 - zb) * t
        ax_, ay_ = lerp(1.55, 1.15, t), lerp(1.85, 1.3, t)
        row = []
        for i in range(n):
            a = 2 * math.pi * i / n
            k = 1.0 + 0.22 * n3(1.6 * math.cos(a), 1.6 * math.sin(a), 0.4 * z, 1.0, 5.0)   # ragged: it read as a round pipe
            if j <= 1:
                k = max(k, 1.0)   # the bottom rings still cover the roof's hole
            row.append((sx + ax_ * k * math.cos(a), sy + ay_ * k * math.sin(a), z))
        ring.append(row)
    rockm = role_mat("C_shaft_rock", "rock_face", k=0.45, rough=0.4, cull=True)
    soilm = role_mat("C_shaft_soil", "soil", k=0.55, rough=0.6, cull=True)
    litter = role_mat("C_glade_litter", "leaf_litter", k=0.6, rough=0.85, snow=0.5)
    mb = MB()
    for j in range(rings):
        for i in range(n):
            i2 = (i + 1) % n
            mb.add([ring[j][i], ring[j + 1][i], ring[j + 1][i2], ring[j][i2]], [(0, 1, 2, 3)], soilm if ring[j][i][2] > 8.0 else rockm)
    for i in range(n):
        i2 = (i + 1) % n
        out = [(sx + 3.5 * math.cos(2 * math.pi * k / n), sy + 3.5 * math.sin(2 * math.pi * k / n), 9.4) for k in (i, i2)]
        mb.add([ring[-1][i], ring[-1][i2], out[1], out[0]], [(0, 1, 2, 3)], litter)
    mb.build("WP_shaft", col="world")
    haze = volume_mat("HM_ShaftHaze_vol", (0.70, 0.75, 0.82), 0.035, nscale=0.5, nbase=0.6, ngain=0.8, anisotropy=0.2,
                      radial=(sx, sy, 1.0, 1.7), node="P_shaft_haze")
    mb = MB()
    mb.cyl(1.7, 1.7, 9.2, 24, M4(sx, sy, 0.0), haze)
    volume_object("HM_ShaftHaze", mb)
    flake = flat_mat("C_flake", (0.9, 0.9, 0.9), 0.8, emit=(0.9, 0.9, 0.95), emit_strength=0.15)
    mb = MB()
    for k in range(235):
        if k < 220:
            a, r = RNG.uniform(0, 2 * math.pi), 1.4 * math.sqrt(RNG.random())
            z = RNG.uniform(4.0, 8.8) if RNG.random() < 0.6 else RNG.uniform(0.5, 4.0)
            p = (sx + r * math.cos(a), sy + r * math.sin(a), z)
        else:
            a, r = RNG.uniform(0, 2 * math.pi), 0.9 * math.sqrt(RNG.random())
            hx, hy = cv.heap
            p = (hx + r * math.cos(a), hy + r * math.sin(a), cv.floor(hx + r * math.cos(a), hy + r * math.sin(a)) + 0.005)
        q = RNG.uniform(0.006, 0.010)
        mb.sphere(q, q, q, 6, 4, M4(*p), flake)
    fl = mb.build("HM_ShaftFlakes", col="world", smooth=True)
    fl.visible_shadow = False
    # the low mists, their sides soft (box sides showed as ruled edges); the stope's a little thicker round the glows
    soft_mist("HM_StopeMist", (-25.5, -4.5, -9.0, 15.0), -0.05, 1.6, 0.04, soft=1.5, nscale=0.25)   # thinner: the water shows
    soft_mist("HM_LandingMist", (-28.5, -14.25, -21.0, -2.25), -0.05, 0.9, 0.022, soft=1.2, nscale=0.25)
    # no planar probe: the culled roof vanished from its mirrored capture and the water reflected nothing. A sphere
    # probe instead, left out of the render (the stope still's views option shows it): where screen-space reflection
    # finds nothing (the frame's left edge, behind the rock column) the water fell back to the world's light and showed
    # a pale strip and a pale panel; with the probe it falls back to the stope's own dark
    pd = bpy.data.lightprobes.new("HM_StopeProbe", "SPHERE")
    pd.influence_distance, pd.falloff, pd.clip_start = 14.0, 0.3, 0.1
    po = bpy.data.objects.new("HM_StopeProbe", pd)
    COL["world"].objects.link(po)
    po.location = (-16.0, 4.0, 1.2)
    po.hide_render = True
    seep = bpy.data.materials.new("C_rot_seep")
    b = vb._principled(seep)
    g = vb.G(seep.node_tree)
    x_, _y, _z = sep3(g, g.position())
    b.inputs["Base Color"].default_value = (0.02, 0.06, 0.05, 1.0)
    b.inputs["Roughness"].default_value = 0.2
    b.inputs["Emission Color"].default_value = (0.10, 0.85, 0.66, 1.0)
    pulse = g.math("ADD", 0.35, g.math("MULTIPLY", g.smooth(g.noise(g.position(), 1.3, 3.0), 0.35, 0.65), 0.9))   # uneven along its run
    g.link(g.math("MULTIPLY", g.math("MULTIPLY", g.mixf(g.smooth(x_, -22.6, -30.4), 0.45, 0.25), pulse), g.value(0.12, "P_rot_strength")),
           b.inputs["Emission Strength"])
    path = [(-22.575, -6.75), (-25.0, -8.4), (-28.35, -9.75), (-30.35, -9.75)]
    mb = MB()
    pts = []
    for (ax_, ay_), (bx_, by_) in zip(path, path[1:]):
        for k in range(8):
            t = k / 8.0
            pts.append((ax_ + (bx_ - ax_) * t, ay_ + (by_ - ay_) * t))
    pts.append(path[-1])
    for (ax_, ay_), (bx_, by_) in zip(pts, pts[1:]):
        ln = math.hypot(bx_ - ax_, by_ - ay_) or 1.0
        nx_, ny_ = -(by_ - ay_) / ln, (bx_ - ax_) / ln
        wa, wb = max(0.07, 0.17 + 0.2 * fbm(ax_, ay_, 0.8, 2)), max(0.07, 0.17 + 0.2 * fbm(bx_, by_, 0.8, 2))   # widening, narrowing
        quad = [(ax_ - nx_ * wa, ay_ - ny_ * wa), (bx_ - nx_ * wb, by_ - ny_ * wb), (bx_ + nx_ * wb, by_ + ny_ * wb), (ax_ + nx_ * wa, ay_ + ny_ * wa)]
        mb.add([(qx, qy, cv.floor(qx, qy) + 0.012) for qx, qy in quad], [(0, 1, 2, 3)], seep)
    mb.disc(0.45, 16, M4(-22.575, -6.75, cv.floor(-22.575, -6.75) + 0.012), seep, rough=0.15)
    mb.build("HM_Water_seep", col="world", smooth=True)
    toadstools(mp, *T(16, 18), 0.0, n=3, ring=(0.15, 0.25), pad=0.4, cap=(0.28, 0.08, 0.05), stem=(0.55, 0.52, 0.46), frost=0.0,
               kicked=False, cap_size=(0.05, 0.09), stem_h=(0.06, 0.11), name="WP_toadstools")
    if not models:
        return
    # the cart at the head of the rails, the VANE TIN CO crate turned to the lamp, the crib in the squeeze
    for name in ("ore_cart", "crates_barrels", "timber_crib"):
        snow_mask_model(name, (0.09, 0.08, 0.07), 0.5, share=0.85, up_only=True)
        darken_lanterns(name)   # their painted lanterns: the dropped lamp is the gallery's one warm light
    mplace(mp, "ore_cart", *T(20, 5), rot=-90.0, size=1.7)
    crate = mplace(mp, "crates_barrels", *T(16.2, 3.1), rot=45.0, size=1.7, sink=0.02)
    mplace(mp, "timber_crib", *T(30, 17), rot=90.0, size=1.65, sink=0.03, lamps=False)
    lx, ly = T(16.1, 3.3)
    top = ray_down(crate, lx, ly)
    if top is not None:
        mb = MB()
        M = M4(top.x, top.y, top.z + 0.02, rz=45.0) @ M4(0.0, 0.08, 0.0, rx=25.0) @ M4(0.0, -0.08, 0.0)
        mb.box(0.9, 0.16, 0.025, M, cm["board"])
        for k in range(3):
            mb.box(0.006, 0.006, 0.07, M @ M4(-0.3 + 0.3 * k, -0.06, 0.04, rx=-30.0), cm["rust"])
        mb.build("WP_crate_lid", col="models")
    # the dropped lamp, still alight: tipped over against a stone, its flame upright; the pick and the oil bottle
    fx, fy = T(*CG_LAMP)
    gz = cv.floor(fx, fy)
    lamp = ph_place(mp, "wooden_lantern_01", fx, fy, rot=35.0, size=0.38, z=gz)
    R, lamp_base, flame_at = lamp_frame(cv)
    lamp.rotation_euler = R.to_euler("XYZ")
    lamp.location.z = lamp_base.z
    lamp.visible_shadow = False
    ph_place(mp, "rock_07", fx - 0.15, fy + 0.18, size=0.18, lod=0.3, sink_frac=0.3)
    flame = flat_mat("C_flame", (1.0, 0.62, 0.30), 0.5, emit=(1.0, 0.62, 0.30), emit_strength=60.0)
    mb = MB()
    mb.sphere(0.0175, 0.0175, 0.035, 8, 6, M4(flame_at.x, flame_at.y, flame_at.z), flame)   # upright on the wick
    mb.cyl(0.003, 0.003, 0.02, 6, M4(flame_at.x, flame_at.y, flame_at.z - 0.033), cm["iron"])
    ob = mb.build("WP_lamp_flame", col="models", smooth=True)
    ob.visible_shadow = False
    pick = ph_place(mp, "picke_dirty_01", *T(18.85, 4.55), rot=-135.0, size=1.0, z=gz)
    pick.rotation_euler = (Matrix.Rotation(math.radians(-135.0), 4, "Z") @ Matrix.Rotation(math.radians(90.0), 4, "X")).to_euler("XYZ")
    pick.location.z = gz + 0.03
    bx_, by_ = T(19, 3.85)
    glass = flat_mat("C_bottle", (0.03, 0.04, 0.02), 0.1, transmission=0.4)
    mb = MB()
    mb.cyl(0.035, 0.035, 0.15, 12, M4(bx_, by_, gz + 0.036, rz=200.0, ry=90.0) @ M4(z=-0.075), glass)
    mb.cyl(0.015, 0.015, 0.05, 8, M4(bx_, by_, gz + 0.036, rz=200.0, ry=90.0) @ M4(z=0.075), glass)
    mb.disc(0.2, 14, M4(bx_ + 0.05, by_, gz + 0.006), flat_mat("C_oil_stain", (0.01, 0.01, 0.01), 0.15), rough=0.25)
    mb.build("WP_oil_bottle", col="models", smooth=True)
    # the broken ore heaped under the chute and the shovel in it
    ox, oy = cv.ore
    for _ in range(40):
        a, r = RNG.uniform(0, 2 * math.pi), 0.75 * math.sqrt(RNG.random())
        px_, py_ = ox + r * math.cos(a), oy + r * math.sin(a)
        ph_place(mp, "rock_07", px_, py_, size=RNG.uniform(0.12, 0.35), lod=0.15, z=cv.floor(px_, py_) + RNG.uniform(0.0, 0.3), sink_frac=0.4)
    ph_place(mp, "rusted_spade_01", *T(23.15, 2.9), rot=225.0, size=1.1, z=cv.floor(*T(23.15, 2.9)) - 0.3 + 0.3, sink=0.3,
             tilt=22.0, toward=225.0)
    # fallen roof stones, the two rubble heaps with snapped timbers, the rockfall's slabs and crushed sets
    for slug, tx, ty, rot, size, sink in (("rock_moss_set_02", 32, 4, 40.0, 1.5, 0.25), ("rock_face_02", 22.05, 6.95, 110.0, 1.3, 0.25),
                                          ("rock_moss_set_02", 34, 10, 200.0, 1.4, 0.25), ("rock_face_02", 28, 11, 300.0, 1.5, 0.3),
                                          ("rock_moss_set_01", 21, 18, 15.0, 1.6, 0.3)):
        ph_place(mp, slug, *T(tx, ty), rot=rot, size=size, sink=sink, lod=0.5, piece="#1" if slug != "rock_face_02" else None,
                 tilt=15.0 if slug == "rock_face_02" else 0.0)
    mb = MB()
    rrng = random.Random(2718)   # the heaps' own sequence: RNG stays as it was
    rubble = role_mat("C_rubble", "rocky_gravel", k=0.5, desat=0.35, rough=0.75)
    mbh = MB()
    for tx, ty, tdir in ((31, 18, 135.0), (33, 17, 45.0)):
        x, y = T(tx, ty)
        ph_place(mp, "rock_face_02", x, y, size=0.8, lod=0.5, sink_frac=0.3)
        for _ in range(7):
            ph_place(mp, "rock_07", x + RNG.uniform(-0.6, 0.6), y + RNG.uniform(-0.6, 0.6), size=RNG.uniform(0.2, 0.45), lod=0.15, sink_frac=0.3)
        rubble_mound(mbh, x, y, 1.05, 0.38, cv.floor, rubble, rrng)   # a heap of broken rock, not single blocks
        M = M4(x, y, cv.floor(x, y) + 0.3, rz=tdir, rx=55.0)
        mb.box(0.2, 0.2, 0.7, M, cm["timber_dark"])
        splintered_end(mb, M @ M4(0.0, 0.0, 0.35, rx=90.0), 0.2, 0.2, rrng, cm["timber_dark"], fresh, reach=0.24, cols=4, rows=4)
    for tx, ty in ((30.2, 19.4), (33.6, 18.9), (34.0, 21.5)):
        x, y = T(tx, ty)
        ln = RNG.uniform(1.2, 2.0)
        M = M4(x, y, cv.floor(x, y) - 0.3, rz=RNG.uniform(0, 360), rx=RNG.uniform(50, 70))
        mb.box(0.22, 0.22, ln, M, cm["timber_dark"])
        splintered_end(mb, M @ M4(0.0, 0.0, ln / 2, rx=90.0), 0.22, 0.22, rrng, cm["timber_dark"], fresh, reach=0.26, cols=4, rows=4)
    mb.build("WP_rubble_timbers", col="models")
    mbh.build("WP_rubble_heaps", col="models", smooth=True)
    for tx, ty in ((29.6, 20.3), (32.4, 19.6), (35.3, 20.6), (33.8, 23.0), (30.5, 22.6)):
        ph_place(mp, "rock_moss_set_01", *T(tx, ty), piece=RNG.randint(1, 3), size=RNG.uniform(1.4, 2.4), lod=0.5,
                 sink=RNG.uniform(0.4, 0.8), tilt=RNG.uniform(10, 30))
    for tx, ty, sink in ((31.5, 21.2, 1.2), (34.6, 22.4, 1.5), (35.4, 17.7, 1.0)):
        ph_place(mp, "rock_face_01", *T(tx, ty), size=RNG.uniform(3.0, 4.0), lod=0.6, sink=sink, tilt=RNG.uniform(10, 25))
    for tx, ty, rot in ((38.2, 7.3, 90.0), (2.1, 7.0, 270.0)):
        size = RNG.uniform(3.0, 4.0)   # drawn for both, so RNG's sequence holds
        if tx < 3.0:
            continue   # not the one on the stope's far west wall: lit from the rot below it hung pale before its own shadow
        ph_place(mp, "rock_face_01", *T(tx, ty), rot=rot, size=size, lod=0.6, sink=0.4)
    for tx, ty, rot in ((2.2, 12.5, 270.0), (6.0, 3.2, 90.0), (11.0, 3.2, 90.0), (14.4, 6.5, 270.0), (16.0, 20.7, 270.0),
                        (24.0, 20.7, 270.0), (18.4, 24.8, 0.0), (21.7, 10.4, 180.0), (0.35, 18.4, 0.0)):
        size = RNG.uniform(1.6, 2.6)   # drawn for every one, so RNG's sequence holds
        if ty < 4.0 or (tx < 3.0 and ty < 16.0):
            continue   # not the two in the stope's north wall nor the one on its west wall: lit from the rot below they
            #            floated as pale slabs over the water
        ph_place(mp, "rock_face_02", *T(tx, ty), rot=rot, size=size, lod=0.5, sink=0.3)
    # the landing heap's dressing: fallen branches, a torn root, dead turf, stones
    hx, hy = cv.heap
    for k, (tx, ty) in enumerate(((30.5, 7.1), (31.6, 6.4), (31.2, 7.6))):
        ph_place(mp, "dry_branches_medium_01", *T(tx, ty), piece=1 + k % ph_count("dry_branches_medium_01"), lod=0.6,
                 size=RNG.uniform(0.8, 1.3), sink=0.03, tilt=30.0 if k == 0 else RNG.uniform(0, 10))
    for tx, ty in ((1.2, 19.5), (1.6, 21.0)):
        ph_place(mp, "dry_branches_medium_01", *T(tx, ty), piece=RNG.randint(1, ph_count("dry_branches_medium_01")), lod=0.6,
                 size=RNG.uniform(0.8, 1.3), sink=0.03)
    ph_place(mp, "single_root", *T(31.4, 7.3), rot=RNG.uniform(0, 360), size=1.2, lod=0.3, sink=0.08)
    for tx, ty in ((30.3, 6.3), (31.8, 7.2)):
        ph_place(mp, "grass_medium_02", *T(tx, ty), piece="#1", grade="dry", size=RNG.uniform(0.3, 0.43), sink=0.02)
    for _ in range(8):
        a, r = RNG.uniform(0, 2 * math.pi), RNG.uniform(0.6, 1.9)
        ph_place(mp, "rock_07", hx + r * math.cos(a), hy + r * math.sin(a), size=RNG.uniform(0.15, 0.4), lod=0.15, sink_frac=0.5,
                 grade="slate")
    for i, (tx, ty, top, size, yaw) in enumerate(((30.3, 6.1, 8.9, 1.5, 70.0), (31.6, 6.9, 8.7, 1.2, 250.0))):   # roots down the shaft
        x, y = T(tx, ty)
        hang_root(mp, cv, x, y, top, size, yaw, lod=0.3, name=f"WP_shaft_root_{i}")
    # rubble: the wall feet of every drift and chamber, the rockfall's slopes, against the walls
    avoid = [(c, 1.2) for c in cv.portals] + [(s, 0.7) for s in cv.spawns] + [((0.75, 6.0), 0.8)]
    cave_scatter_wall(cv, loops, 150, "rock_07", (0.15, 0.45), 0.08, avoid, sink_frac=0.15, cluster=(2, 5),
                      test=lambda x, y: abs(x - 0.75) > 0.7 or not -1.0 < y < 12.5)
    count = 0
    while count < 70:
        tx, ty = RNG.uniform(27.5, 36.5), RNG.uniform(15.5, 24.5)
        x, y = T(tx, ty)
        if cv.fd.at(x, y) < 0.2 or math.hypot(x - T(30, 17)[0], y - T(30, 17)[1]) < 1.8:
            continue
        ph_place(mp, "rock_07", x, y, size=RNG.uniform(0.25, 0.7), lod=0.08, sink_frac=0.3, tilt=RNG.uniform(0, 30))
        count += 1
    for _ in range(14):   # none in the stope: lit from below over black water they read as floating blobs
        cave_scatter_wall(cv, loops, 1, "rock_moss_set_02", (0.9, 1.6), 0.5, avoid, sink_frac=0.4, off=(0.2, 0.5), cluster=(1, 1),
                          test=lambda x, y: not in_rect(x, y, (-25.5, -4.9, -9.0, 15.1), 0.6))


def build_cave_gallery(scene, mp: WildMap, a) -> None:
    cv = GalleryCave(mp)
    mp.hfun = cv.floor
    xs = grid_axis([(-39.0, 33.5, 0.25)])
    ys = grid_axis([(-32.5, 24.0, 0.25)])
    cave_floor(cv, cv.sample, xs, ys, lambda x, y: cv.fd.at(x, y) > -1.0, CG_GROUND)
    wall, roof = rock_material("HM_Rock_wall", CG_WALL), rock_material("HM_Rock_roof", CG_ROOF)
    _ob, loops = build_shell(cv, wall, roof)
    build_hull("HM_CaveHull", (-38.0, -32.5, -4.5, 32.5, 23.5, 10.5),   # its floor slab under the stope's -3.0 bed
               holes={"top": (CG_SHAFT[0] - 1.8, CG_SHAFT[0] + 1.8, CG_SHAFT[1] - 1.8, CG_SHAFT[1] + 1.8)})
    cm = cave_mats()
    # the mere-rot: an organic slick drifting along the stope (35 degrees), broken threads and a few blotches, faint
    # and gathered round the two rot points (2.3 m and 0.14 spread it over both basins as neon bands; its soft broken
    # threads take 0.13), the water under it roughened (a round, evenly lit film read as a decal; a mirror under it
    # showed the light as an orb). The ripple barely shows (the bump's distance is 0.001): the bands were the film's own
    # pattern, not the water's reflection
    wmat = water_material(base=(0.006, 0.010, 0.014), see=1.0, d0=0.05, d1=0.6, ripple=(3.0, 0.1),   # rippled: it read as a floor
                          rot=[(-20.25, 9.75, 0.4, 1.7), (-14.25, 0.75, 0.4, 1.7)], rot_color=(0.10, 0.85, 0.66), rot_strength=0.13,
                          rot_drift=35.0, rot_rough=0.25)
    build_water("HM_Mere", wmat, -0.05, [(-25.6, -4.9, -8.9, 15.1, 0.25)], cv.floor)   # the stope and the sump pit
    build_water("HM_Water_pump", wmat, -1.6, [(21.85, 13.6, 23.15, 14.9, 0.1)], cv.floor)
    build_water("HM_Water_engine", wmat, 0.0, [(19.5, 9.0, 25.0, 15.5, 0.2)], cv.floor,
                keep=lambda x, y: math.hypot(x - cv.heap[0], y - cv.heap[1]) > 2.0 and math.hypot(x - 22.5, y - 12.75) < 2.8
                and not (abs(x - 22.5) < 0.8 and abs(y - 14.25) < 0.8))
    # the standing water at the engine's foot in front of the bed: a near mirror (its own material; the gallery's
    # water is see-through where shallow, and showed none)
    pud = water_material(base=(0.004, 0.008, 0.011), see=0.12, d0=0.02, d1=0.12, ripple=(2.2, 0.008))
    pud.name = "C_engine_puddle"
    pud.node_tree.nodes["P_water_rough"].outputs[0].default_value = 0.04
    build_water("HM_Water_enginefoot", pud, cv.floor(22.4, 9.75) + 0.05, [(20.8, 8.5, 24.2, 11.0, 0.1)], cv.floor)
    gallery_props(cv, cm, not a.no_models, loops)
    # the gallery's own light kinds ('sinkhole' and 'rot'), so the one cave look sets them as built: the 'shaft' and
    # 'moss' kinds carry the Tin Gallery mouth's colours, radii and scatter
    # the beam widened to 70 degrees with a soft edge, so its rim reaches the engine's west face and the puddle
    spot_light("sinkhole", "cg.lt_shaft", (17.25, 10.95, 8.5), (17.25, 10.95, 0.0), 2400.0, (0.80, 0.88, 1.0), 70.0, 0.8, radius=0.8,
               volume=1.8, shadow=True, cutoff=16.0)
    # the pool's bounce off the heap (EEVEE has no bounce without a bake): a soft moon-coloured panel lying on the heap,
    # aimed up and east at the engine, no glint and no glow in the haze (look kind 'bounce')
    ob = area_light("bounce", "cg.lt_heap_bounce", (cv.heap[0] + 0.3, cv.heap[1] + 0.4, cv.floor(*cv.heap) + 0.65),
                    (0.72, 0.28, 0.64), 2.5, 2.5, 50.0, (0.62, 0.76, 1.0), volume=0.0, shadow=True, cutoff=12.0)
    ob.data.specular_factor = 0.0
    _R, _base, flame_at = lamp_frame(cv)   # in the tipped lamp's glass (with or without the models)
    point_light("lamp", "cg.lt_lamp_ore", flame_at.x, flame_at.y, flame_at.z, 110.0, (1.0, 0.56, 0.24), radius=0.04, volume=0.6,
                shadow=True, cutoff=8.0)
    # mere-rot and moss: small sources (the look's radius 0.1: a 0.7 m sphere just over the water mirrored as an orb, and
    # cut into the wall and burned it out), little glint, longer reach and all shadowed (so the reach cannot leak
    # through the one-tile wall at x14); the two moss lights 0.7 m off their walls and far weaker, moss_crib moved
    # directly north of the crib so its lattice shadow falls over the rubble
    wx_, _wy = wall_x(cv, 0.75, -14.25, 1.0, 0.0, 5.0)
    _wx, wy_ = wall_x(cv, CG_CRIB_MOSS[0], -5.0, 0.0, 1.0, 5.0)
    # (the two over the stope 0.75 m up: at 0.45 m their light pooled on the slick's tint as a bright disc)
    for lid, (x, y, z), cut, gain in (("cg.lt_rot_0", (-20.25, 9.75, 0.75), 8.0, 1.0), ("cg.lt_rot_1", (-14.25, 0.75, 0.75), 8.0, 1.0),
                                      ("cg.lt_rot_2", (-23.25, -6.75, 0.8), 7.0, 0.8),   # 0.3 m up: a white-hot spot
                                      ("cg.lt_moss_upper", (wx_ - 0.7, -14.25, 1.25), 6.0, 0.3),
                                      ("cg.lt_moss_crib", (CG_CRIB_MOSS[0], wy_ - 1.25, 1.2), 7.5, 0.55)):
        ob = point_light("rot", lid, x, y, z, 32.0, (0.22, 0.92, 0.76), radius=0.1, volume=0.35, shadow=True, cutoff=cut, gain=gain)
        # no glint over the water (it showed as an orb, even rippled): the water now reflects the lit rock instead
        ob.data.specular_factor = 0.0 if lid.startswith("cg.lt_rot") else 0.1
        if lid in ("cg.lt_rot_2", "cg.lt_moss_crib"):
            ob["wdi_vgain"] = 0.0   # its glow in the mist read as a white ball (the seep) or a band of light (the crib)
    # the rot films' glow on the stope's walls and the mist from below (the tall stope did not read)
    for lid, (x, y), gain in (("cg.lt_rot_glow_0", (-20.25, 9.75), 7.0), ("cg.lt_rot_glow_1", (-14.25, 0.75), 7.0),
                              ("cg.lt_rot_glow_2", (-23.25, -6.75), 0.5)):
        ob = moss_glow(lid, x, y, max(cv.floor(x, y), -0.05) + 0.06, gain=gain, size=3.0)
        ob.data.color = (0.22, 0.92, 0.76)
    # the moss's light down the collapse pocket onto the rockfall mound (it sat at ink): a soft panel by the patch facing
    # south-east, shadowed, no glint, no glow in the air
    ob = area_light("moss_glow", "cg.lt_crib_fill", (CG_CRIB_MOSS[0] + 0.5, wy_ - 0.9, 1.3), (0.45, -0.86, -0.22), 1.4, 1.0, 30.0,
                    (0.30, 0.90, 0.74), volume=0.0, shadow=True, cutoff=11.0, gain=0.9)
    ob.data.specular_factor = 0.0
    ob["wdi_vgain"] = 0.0
    # the pool's bounce off the heap onto the chamber's west wall and the timber set there (they sat at ink)
    ob = area_light("bounce", "cg.lt_heap_bounce_w", (cv.heap[0] - 0.5, cv.heap[1] + 0.1, cv.floor(*cv.heap) + 0.6),
                    (-0.78, -0.15, 0.6), 2.5, 2.5, 50.0, (0.62, 0.76, 1.0), volume=0.0, shadow=True, cutoff=12.0, gain=0.6)
    ob.data.specular_factor = 0.0
    cut = view_cut("cave_gallery")
    if cut is not None:
        cutaway(cv, loops, cut, (-100.0, -50.0, 70.0, 80.0), lambda x, y: 0.3 * fbm(x, y, 0.025, 3) + 0.12 * fbm(x, y, 0.12, 2),
                fill_rect=(-42.0, -35.5, 36.5, 27.0), fill=0.5, moon=(325.0, 25.0, 0.8), seed=3, trees=150, rocks=26,
                frame=[(-95.1, 29.6), (64.7, 76.4), (57.7, -18.2), (-38.2, -46.2)], inside=0.25,   # 0.15: props at ink
                tree_lod=0.6, near_trees=True,   # at 0.12 the pines round the cut read as heaps of shards
                ice_below=None,   # no lake here: the land's low spots were left out as black chips on the snow
                hair_joints=True,
                # none in the frame's near bottom-left corner: seen from right above, even the 0.6 near master's crown
                # there read as flat white shards
                tree_drop=lambda x, y: x < -14.0 and y < -24.0)


# ---------------------------------------------------------------- the scenes, the checks, the preview and the entry point


PH_WOODS = ("rock_moss_set_01", "rock_moss_set_02", "rock_face_01", "rock_face_02", "tree_stump_01", "single_root",
            "dry_branches_medium_01", "fern_02", "grass_medium_02", "shrub_02", "rock_07", "picke_dirty_01", "rusted_spade_01")
SPECS = {
    "forest": dict(
        build=build_forest, hero=set(),
        roles=("snow", "snow_field", "pine_needles", "forest_floor", "mud_track", "snow_trodden", "grass_dry", "moss_rock",
               "pine_bark", "moss", "timber_rough", "stone_wall"),
        ph=PH_WOODS + ("wooden_lantern_01",),
        meshy=("pine_tall", "pine_short", "dead_tree", "Abandoned_Tin_Mine", "Frostbound_Gate", "Frostbound_Warden_Gate",
               "hollow_log", "The_Witching_Lantern", "Frostbound_Witch_Hut", "wood_stack", "Frostbound_Waymarker")),
    "forest_deep": dict(
        build=build_forest_deep, hero={"hanging_oak", "mother_moll_hut", "charcoal_kiln", "drowned_lantern", "cave_pool_rock"},
        roles=("snow", "pine_needles", "moss", "forest_floor", "grass_dry", "mud", "mud_brown", "river_rocks", "rock_face",
               "mud_track", "snow_trodden", "pine_bark", "timber_rough", "wood_rough", "soil", "leaf_litter"),
        ph=tuple(s for s in PH_WOODS if s != "picke_dirty_01"),
        meshy=("pine_tall", "pine_short", "dead_tree", "hanging_oak", "mother_moll_hut", "charcoal_kiln", "drowned_lantern",
               "mine_adit", "Frostbound_Waymarker", "hollow_log", "cave_pool_rock")),
    "cave_entry": dict(
        build=build_cave_entry, hero={"stalagmite_cluster"},
        roles=("mine_floor", "rock_ground", "moss_rock", "pebbles", "river_rocks", "snow_trodden", "snow", "snow_field",
               "stone_wall", "wet_rock", "mine_wall", "rock_face", "timber_rough", "moss", "soil"),
        ph=("rock_moss_set_01", "rock_moss_set_02", "rock_face_01", "rock_face_02", "rock_07", "single_root",
            "dry_branches_medium_01", "grass_medium_02", "fern_02", "picke_dirty_01", "rusted_spade_01"),
        meshy=("stalagmite_cluster", "pine_tall", "pine_short", "dead_tree", "boulder_set")),
    "sea_exit": dict(
        build=build_sea_exit, hero={"crates_barrels"},
        roles=("rock_ground", "mine_floor", "moss_rock", "pebbles", "river_rocks", "wet_rock", "stone_wall", "rock_face",
               "timber_rough", "snow", "snow_field", "soil"),
        ph=("rock_moss_set_01", "rock_moss_set_02", "rock_face_01", "rock_07", "dry_branches_medium_01"),
        meshy=("stalagmite_cluster", "crates_barrels", "hollow_log", "pine_tall", "pine_short")),   # pines: the lake's far shore
    "cave_gallery": dict(
        build=build_cave_gallery, hero={"ore_cart", "crates_barrels", "timber_crib"},
        roles=("mine_floor", "rock_ground", "river_rocks", "gravel", "rocky_gravel", "leaf_litter", "soil", "snow", "mine_wall",
               "wet_rock", "moss_rock", "rock_face", "timber_rough", "stone_wall", "moss", "snow_field"),
        ph=("wooden_lantern_01", "picke_dirty_01", "rusted_spade_01", "rock_07", "rock_moss_set_01", "rock_moss_set_02",
            "rock_face_01", "rock_face_02", "single_root", "dry_branches_medium_01", "grass_medium_02"),
        meshy=("ore_cart", "crates_barrels", "timber_crib", "pine_tall", "pine_short")),   # pines: the cutaway's wood
}


def preflight(spec: dict, models: bool) -> None:
    """Stop before any work if a texture, Poly Haven model or Meshy model the scene needs is not on disk."""
    missing = []
    for role in spec["roles"]:
        for m in ("diff", "nor_gl"):
            path = mr.texture_path(role, m, res=RES)
            if not os.path.exists(path):
                missing.append(f"texture {role} {m}: {path}")
    if models:
        for slug in spec["ph"]:
            if not os.path.exists(fm.model_path(slug)):
                missing.append(f"Poly Haven model {slug}: {fm.model_path(slug)}")
        for name in spec["meshy"]:
            try:
                mi.meshy_path(name)
            except (FileNotFoundError, KeyError) as e:
                missing.append(f"Meshy model {name}: {e}")
    if missing:
        raise SystemExit("meshy_wild_build: missing inputs\n  " + "\n  ".join(missing) +
                         f"\nfetch with: python tools/blender/materials/fetch.py --roles <roles> --res {RES}"
                         "\n            python tools/blender/materials/fetch_models.py --slugs <slugs>")


def set_cut(z: float) -> dict:
    """Set every P_cut_z (the cave rock's cutaway height); returns the old values."""
    old = {}
    for mat in bpy.data.materials:
        if mat.node_tree is not None and "P_cut_z" in mat.node_tree.nodes:
            out = mat.node_tree.nodes["P_cut_z"].outputs[0]
            old[mat.name] = out.default_value
            out.default_value = z
    return old


def preview(scene, path: str, mp: WildMap) -> None:
    """A daylight check of the layout straight down, north up (the rock cut at 2.4 m, lights, volumes and the hull off)."""
    r = scene.render
    r.engine = "BLENDER_EEVEE"
    if hasattr(r.image_settings, "media_type"):
        r.image_settings.media_type = "IMAGE"
    r.image_settings.file_format = "PNG"
    vt = scene.view_settings.view_transform
    scene.view_settings.view_transform = "Standard"
    scene.eevee.taa_render_samples = 16
    old_world = scene.world
    w = bpy.data.worlds.new("Preview")
    w.use_nodes = True
    bg = w.node_tree.nodes.get("Background")
    if bg is None:
        bg = w.node_tree.nodes.new("ShaderNodeBackground")
        out = w.node_tree.nodes.get("World Output") or w.node_tree.nodes.new("ShaderNodeOutputWorld")
        w.node_tree.links.new(bg.outputs[0], out.inputs["Surface"])
    bg.inputs[0].default_value = (0.55, 0.62, 0.72, 1.0)
    bg.inputs[1].default_value = 0.9
    scene.world = w
    sun = bpy.data.objects.new("PreviewSun", bpy.data.lights.new("PreviewSun", "SUN"))
    sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(50.0), 0.0, math.radians(140.0))
    scene.collection.objects.link(sun)
    hidden = []
    for ob in scene.objects:
        if ob is sun:
            continue
        if ob.type == "LIGHT" or ob.get("wdi_volume") or ob.name == "HM_CaveHull":
            if not ob.hide_render:
                ob.hide_render = True
                hidden.append(ob)
    cuts = set_cut(2.4)
    cam = bpy.data.objects.new("PreviewCam", bpy.data.cameras.new("PreviewCam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.data.type = "ORTHO"
    cam.data.clip_end = 2000.0
    cam.data.ortho_scale = max(mp.w, mp.h) * S * 1.1
    cam.location = (0.0, 0.0, 300.0)
    cam.rotation_euler = (0.0, 0.0, 0.0)
    r.resolution_x = 1600
    r.resolution_y = int(round(1600 * min(1.0, mp.h / mp.w)))
    r.resolution_percentage = 100
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    r.filepath = os.path.abspath(path)
    bpy.ops.render.render(write_still=True)
    for ob in hidden:
        ob.hide_render = False
    for name, v in cuts.items():
        bpy.data.materials[name].node_tree.nodes["P_cut_z"].outputs[0].default_value = v
    scene.world = old_world
    scene.view_settings.view_transform = vt
    bpy.data.objects.remove(sun, do_unlink=True)
    bpy.data.objects.remove(cam, do_unlink=True)
    print("PREVIEW", path, flush=True)


def summary(scene, scene_id: str) -> None:
    """Objects, faces and triangles that render (each linked duplicate counted), trees, and every light."""
    faces = tris = 0
    seen: dict = {}
    for o in scene.objects:
        if o.type != "MESH" or o.hide_render or any(c.hide_render for c in o.users_collection):
            continue
        me = o.data
        if me.name not in seen:
            n = len(me.polygons)
            lt = np.empty(n, dtype=np.int32)
            me.polygons.foreach_get("loop_total", lt)
            seen[me.name] = (n, int((lt - 2).sum()))
        faces += seen[me.name][0]
        tris += seen[me.name][1]
    kinds: dict = {}
    for ob in LIGHTS:
        k = str(ob["wdi_light"])
        kinds[k] = kinds.get(k, 0) + 1
    print(f"BUILT {scene_id} objects {len(scene.objects)} faces {faces} triangles {tris} trees {len(TREES)} "
          f"lights {len(LIGHTS)} {kinds}", flush=True)
    for ob in LIGHTS:
        d, loc = ob.data, tuple(float(ob.location[i]) for i in range(3))
        print(f"  LIGHT {str(ob['wdi_light']):10s} {str(ob.name):28s} ({loc[0]:7.2f}, {loc[1]:7.2f}, {loc[2]:6.2f}) "
              f"{str(d.type):5s} {float(d.energy):7.1f} W gain {float(ob.get('wdi_gain', 1.0)):6.2f} "
              f"shadow {bool(d.use_shadow)}", flush=True)


TREE_MODELS = ("pine_tall", "pine_short", "dead_tree")
# The Meshy pines stand on a baked base: a snow disc 7 m (pine_tall) or 5 m (pine_short) across at catalog scale, a
# mound up to about 1 m high against the trunk and dark spiky tufts on it, all in big flat triangles. Near an eye-level
# still it reads as a crumpled sheet of shards (the 'opaque grey triangles' of fenwood_gate and tin_gallery_mouth), so
# the near masters push it under the ground (catalog metres): everything below za (the mound and the snow collar on
# the trunk) sinks `drop`, the bare trunk between za and zb stretches down to meet the ground (zb, under the lowest
# boughs, stays put), and the mound beyond r0..r1 of the axis sinks `drop_r` up to zr.
TREE_BASE = {"pine_tall": dict(za=1.3, zb=2.4, drop=1.5, r0=0.8, r1=1.0, zr=1.9, drop_r=2.2),
             "pine_short": dict(za=0.75, zb=1.15, drop=0.9, r0=0.6, r1=0.85, zr=1.05, drop_r=1.6)}
_NEAR_TREES: dict = {}


def _np_sstep(e0: float, e1: float, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def near_tree(name: str, lod: float | None = None):
    """The master of a tree near an eye-level still: welded and smooth-shaded (the GLB's triangles come unwelded with
    flat normals, about five vertices a face, and read as facets up close), its baked base sunk (TREE_BASE)."""
    key = (name, lod)
    if key in _NEAR_TREES:
        return _NEAR_TREES[key]
    src = vb.source(name, lod)
    o = src.copy()
    o.data = src.data.copy()
    o.name = f"{name}@near{'' if lod is None else lod}"
    me = o.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bm.to_mesh(me)
    bm.free()
    p = TREE_BASE.get(name)
    if p:
        co = np.empty(len(me.vertices) * 3)
        me.vertices.foreach_get("co", co)
        co = co.reshape(-1, 3)
        r, z = np.hypot(co[:, 0], co[:, 1]), co[:, 2].copy()
        za, zb, d = p["za"], p["zb"], p["drop"]
        zz = np.where(z < za, z - d, np.where(z < zb, zb - (zb - z) * (zb - za + d) / (zb - za), z))
        wr = _np_sstep(p["r0"], p["r1"], r) * (1.0 - _np_sstep(p["zr"] - 0.2, p["zr"], z))
        co[:, 2] = np.minimum(zz, z - p["drop_r"] * wr)
        me.vertices.foreach_set("co", co.ravel())
    if "custom_normal" in me.attributes:
        me.attributes.remove(me.attributes["custom_normal"])
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    me.update()
    COL["src"].objects.link(o)
    _NEAR_TREES[key] = o
    return o


def sharpen_near_views(scene_id: str, near: float = 16.0, mid: float = 30.0, clear: float = 3.6, cone: float = 4.5) -> None:
    """Trees near an eye-level still camera (eye under 6 m) get the near masters (near_tree): full detail within
    `near` metres of the eye, the 0.6 master within `mid`. No tree stands within `clear` metres of the lens, nor
    within `cone` metres inside the frame's width (a trunk that near fills a third of it; the woods only, a cave's
    stills keep their trees unless a view asks). Runs after the scene's own tree plan, so the plan's random sequence
    does not change. Options a view may carry in the views file (the look ignores them): "clear": [[tile x, tile y,
    r], ...] removes the trees within r metres of those points (corner tile units, as the eye), "cone": its own `cone`,
    and for a high view "lod_r": the trees within that many metres of the eye, in the frame's width, get at least the
    0.6 master. Round 2 (the woods): "full_r" gives the trees within that many metres of a low eye, in its frame, the
    full near master (the fen's pines 27-34 m out read as papercraft at 0.6); "veil": [[tile x, tile y, r], ...]
    renames the trees within r of those points HM_veil_<view>_<k>, so the view's "hide" can take them out of that one
    still (their shadows stay) without removing them from the others; "cone_lens" keeps the cone at the lens it was
    worked out for when a still's lens changes (the trees it removes stay the same)."""
    path = os.path.join(VIEWS_DIR, f"{scene_id}.json")
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as fh:
        views = {k: v for k, v in json.load(fh).items() if not k.startswith("_")}
    cams = []
    for vname, v in views.items():
        (ex, ey, eh), (tx, ty, _tz), lens = v[:3]
        x, y = (ex - vb.W / 2) * S, (vb.H / 2 - ey) * S
        lx, ly = (tx - vb.W / 2) * S, (vb.H / 2 - ty) * S
        opts = v[3] if len(v) > 3 and isinstance(v[3], dict) else {}
        cams.append(dict(name=vname, x=x, y=y, low=eh < 6.0, head=math.atan2(ly - y, lx - x),
                         half=math.atan(18.0 / float(opts.get("cone_lens", lens))), opts=opts))
    low = [c for c in cams if c["low"]]
    eyes = [(c["x"], c["y"]) for c in low]
    if not eyes:
        return
    circles = [((cx - vb.W / 2) * S, (vb.H / 2 - cy) * S, r) for c in cams for cx, cy, r in c["opts"].get("clear", [])]
    if bpy.context.scene.get("wdi_biome") != "forest":
        cone = 0.0

    def in_frame(c, x, y, margin):
        a = (math.atan2(y - c["y"], x - c["x"]) - c["head"] + math.pi) % (2 * math.pi) - math.pi
        return abs(a) < c["half"] + margin

    full = half = gone = up = 0
    # Poly Haven scatter right at the lens (scanned rocks decimated hard, grass and fern blades a metre tall in frame)
    # reads as shards: filler, so it goes
    scatter = {"rock_moss_set_01", "rock_moss_set_02", "rock_07", "dry_branches_medium_01", "grass_medium_02", "fern_02",
               "shrub_02", "single_root", "tree_stump_01"}   # not the rock faces (scarps, adit flanks) or the story's tools
    swept = 0
    for o in list(bpy.context.scene.objects):
        if o.get("wdi_model") in scatter and o.type == "MESH":
            if min(math.hypot(o.location.x - ex, o.location.y - ey) for ex, ey in eyes) < 2.8:
                bpy.data.objects.remove(o, do_unlink=True)
                swept += 1
    print(f"SWEPT {swept} scatter pieces within 2.8 m of an eye-level camera", flush=True)
    for o in list(COL["forest"].all_objects):
        name = o.get("wdi_model")
        if name not in TREE_MODELS:
            continue
        x, y = o.location.x, o.location.y
        d = min(math.hypot(x - ex, y - ey) for ex, ey in eyes)
        if d < clear or any(math.hypot(x - cx, y - cy) < r for cx, cy, r in circles) or \
                any(math.hypot(x - c["x"], y - c["y"]) < c["opts"].get("cone", cone) and in_frame(c, x, y, math.radians(8.0))
                    for c in low):
            print(f"  GONE {name} at ({x:.2f}, {y:.2f}), {d:.2f} m from the nearest low eye", flush=True)
            bpy.data.objects.remove(o, do_unlink=True)
            gone += 1
        elif d < near or any(c["opts"].get("full_r") and math.hypot(x - c["x"], y - c["y"]) < float(c["opts"]["full_r"])
                             and in_frame(c, x, y, math.radians(8.0)) for c in low):
            o.data = near_tree(name).data
            full += 1
        elif d < mid:
            o.data = near_tree(name, 0.6).data
            half += 1
        else:
            for c in cams:
                if not c["low"] and math.hypot(x - c["x"], y - c["y"]) < c["opts"].get("lod_r", 0.0) and in_frame(c, x, y, 0.2):
                    m = vb.source(name, 0.6)
                    if len(o.data.polygons) < len(m.data.polygons):
                        o.data = m.data
                        up += 1
                    break
    print(f"SHARPEN trees by the eye-level views: {full} near full, {half} near 0.6, {gone} removed; {up} raised to 0.6 "
          f"by the high views", flush=True)
    for c in cams:   # the trees one still hides (views file "veil" + "hide"), named so the look can find them
        k = 0
        for vx, vy, r in c["opts"].get("veil", []):
            px, py = (vx - vb.W / 2) * S, (vb.H / 2 - vy) * S
            hit = [o for o in COL["forest"].all_objects if o.get("wdi_model") in TREE_MODELS
                   and math.hypot(o.location.x - px, o.location.y - py) < r]
            for o in sorted(hit, key=lambda o: math.hypot(o.location.x - px, o.location.y - py)):
                o.name = f"HM_veil_{c['name']}_{k}"
                print(f"VEIL {o.name}: {o['wdi_model']} at ({o.location.x:.2f}, {o.location.y:.2f})", flush=True)
                k += 1


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="meshy_wild_build.py")
    p.add_argument("--scene", required=True, choices=SCENES)
    p.add_argument("--save")
    p.add_argument("--preview")
    p.add_argument("--no-models", action="store_true", help="ground, water, rock and procedural pieces only")
    p.add_argument("--no-trees", action="store_true", help="everything but the trees (the woods)")
    a = p.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    mp = WildMap(a.scene)
    vb.W, vb.H = mp.w, mp.h          # before any wx / wy / tc / building call
    scene.name = f"HollowMere_{a.scene}"
    scene["wdi_tile_m"] = S
    scene["wdi_map_w"], scene["wdi_map_h"] = mp.w, mp.h
    scene["wdi_scene"] = a.scene
    scene["wdi_biome"] = "forest" if mp.forest else "cave"
    scene["wdi_ground_rows"] = 9999.0  # the look's stills: every eye under 25 m stands on the ground
    vb._collections(scene)
    vb.CAT.update(mi.catalog())
    spec = SPECS[a.scene]
    preflight(spec, models=not a.no_models)
    vb.HERO_2K.update(spec["hero"])
    spec["build"](scene, mp, a)
    if not (a.no_models or a.no_trees):
        sharpen_near_views(a.scene)
    COL["src"].hide_viewport = True   # the masters stand at the origin: keep them out of ray casts and the viewport
    summary(scene, a.scene)
    if a.preview:
        preview(scene, a.preview, mp)
    if a.save:
        os.makedirs(os.path.dirname(os.path.abspath(a.save)), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(a.save), compress=False)
        print("SAVED", a.save, flush=True)


if __name__ == "__main__":
    main()
