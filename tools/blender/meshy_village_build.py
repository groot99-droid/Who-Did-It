"""HollowMere in 3D: the game's own overworld map built from the owner's Meshy models (original textures).

    blender -b --factory-startup -P tools/blender/meshy_village_build.py -- --save tools/blender/build/hollowmere_base.blend
        [--preview tools/blender/build/hm_preview] [--no-models] [--no-forest] [--no-outskirts]

The outskirts round the map (the mill, the railyard, the hideout and the woods: `meshy_village_outskirts.py`) are
built by default; `--no-outskirts` leaves the village exactly as it was without them.

Reads `packages/content/data/scenes/overworld.json` (64 x 48 tiles, y grows south) and lays out, at 1.5 m per
tile (`meshy_village_look.TILE_M`: the game's arrangement, enlarged so that human-scale buildings and a full-size
train fit): the terrain with its ground materials (cobbled square, paths, earth yards, shingle, the bank down to
the mere), the buildings on their footprints with the door on the map's door face, the props, lantern posts, fences,
the rail spur with the Daily Train at the platform, the dock, and the forest edge. World frame: x east, y north,
tile (tx, ty) has its centre at ((tx + 0.5 - 32) * 1.5, (24 - (ty + 0.5)) * 1.5).

The ground is Poly Haven (CC0), through the repo's material library (`materials/roles.py`): the same slugs the
game's ground tiles are made from (`GROUND_ROLES["harbour"]`: cobble, mud track, mud, pebbles, gravel, wood floor)
at their scanned size, under two snow textures (`snow`, `snow_field`). Fetch them once with
`python tools/blender/materials/fetch.py --roles cobble,snow,wood_floor,mud_track,mud,pebbles,gravel,snow_field --res 1k`.

The file saved here carries geometry, materials and tagged lights only. Sky, fog, light strengths, colour
management and post effects are a "look", applied by `meshy_village_look.py`; the camera path is `meshy_village_fly.py`.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys

import bpy
from mathutils import Vector, noise

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import meshy_import as mi  # noqa: E402
from materials import roles as mr  # noqa: E402  (the Poly Haven material library: roles, lock, cache)
from meshy_village_look import TILE_M as S  # noqa: E402  (metres per map tile)

SCENE_JSON = os.path.join(mi.ROOT, "packages", "content", "data", "scenes", "overworld.json")
W, H = 64, 48
WATER_Z, SHORE_Z, BED_Z = -1.9, -1.5, -2.8
FLOOR = set("glmpdcfwrs~u=")
GROUND = mr.GROUND_ROLES["harbour"]  # the game's own Poly Haven ground set for HollowMere, by material letter
GROUND_RES = "1k"  # 2 mm per texel at the scans' size: enough at eye level, and 2k overran a laptop's shared graphics memory
ANG = {"E": 0.0, "NE": 45.0, "N": 90.0, "NW": 135.0, "W": 180.0, "SW": -135.0, "S": -90.0, "SE": -45.0}
RNG = random.Random(1893)


def wx(tx: float) -> float:
    """World x of a tile-space x (tile corner units; a tile's centre is tx + 0.5)."""
    return (tx - W / 2) * S


def wy(ty: float) -> float:
    return (H / 2 - ty) * S


def tc(tx: float, ty: float) -> tuple[float, float]:
    """World position of the centre of tile (tx, ty)."""
    return wx(tx + 0.5), wy(ty + 0.5)


def _n2(x: float, y: float, s: float) -> float:
    return noise.noise(Vector((x * s, y * s, 0.37)))


def _fbm(x: float, y: float, s: float, octaves: int = 4) -> float:
    v, a, f = 0.0, 1.0, s
    for _ in range(octaves):
        v += a * noise.noise(Vector((x * f, y * f, 1.7)))
        a *= 0.5
        f *= 2.0
    return v


# ---------------------------------------------------------------- the map


class Map:
    def __init__(self, path: str = SCENE_JSON, edits: list | None = None):
        with open(path) as fh:
            self.d = json.load(fh)
        self.grid, self.mat = self.d["grid"], self.d["material"]
        self.ground = [[self._ground(x, y) for x in range(W)] for y in range(H)]
        self.rail_x = wx(next(tx for row in self.mat for tx, c in enumerate(row) if c == "=") + 0.5)
        # hook (outskirts): terrain edits f(x, y, h, wts) -> (h, wts), applied in order by sample() outside the map only
        self.edits: list = list(edits or [])
        # hook (outskirts): f(x, y) -> tile rows the shore of the mere moves by, beyond the map's east and west edges only
        self.shore = None

    def tread(self, tx: int, ty0: int, ty1: int, letter: str = "p") -> None:
        """Turn a column of tiles into trodden path (ground the map leaves as grass)."""
        for ty in range(ty0, ty1 + 1):
            self.ground[ty][tx] = letter

    def _ground(self, x: int, y: int) -> str:
        """A tile's ground letter: its own, or that of its first walkable neighbour (south, east, north, west)."""
        c = self.mat[y][x]
        if c in FLOOR or c in "OTX":
            return c
        for dx, dy in ((0, 1), (1, 0), (0, -1), (-1, 0)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H and self.mat[ny][nx] in FLOOR:
                return self.mat[ny][nx]
        return "g"

    def ext(self, tx: int, ty: int) -> str:
        """Ground letter of any tile, continued past the map: forest north, west and east, the mere south."""
        if 0 <= tx < W and 0 <= ty < H:
            return self.ground[ty][tx]
        if ty >= 45 or (ty >= 39 and tx >= W):
            return "O"
        if ty >= 37:
            return "X"
        return "T"

    def tile_h(self, tx: int, ty: int) -> float:
        c = self.ext(tx, ty)
        if ty <= 36:
            return 0.0
        if c == "O":
            return BED_Z
        if ty <= 39:  # the bank between the village and the shingle
            t = (ty - 36) / 4.0
            if c in "pg":
                return SHORE_Z * t
            if c in "w=":
                return (SHORE_Z - 0.5) * t
            return SHORE_Z * (t ** 2.2)
        if ty <= 41:
            if c == "s":
                return SHORE_Z
            return WATER_Z - 0.3
        if ty <= 44:
            return WATER_Z - 0.45 - 0.2 * (ty - 42)
        return BED_Z

    def sample(self, x: float, y: float) -> tuple[float, dict[str, float]]:
        """Bilinear height and ground-letter weights at a world point."""
        fx, fy = x / S + W / 2 - 0.5, H / 2 - y / S - 0.5
        if fy > 36.0:  # let the shore meander instead of following the tile rows (not under the dock)
            west = 1.0 - min(1.0, max(0.0, (fx - 40.0) / 3.0))
            east = min(1.0, max(0.0, (fx - 64.0) / 3.0))
            fy += 0.9 * _fbm(x, 0.0, 0.035, 3) * max(west, east) * min(1.0, (fy - 36.0) / 1.5)
            if self.shore is not None and abs(x) > W * S / 2:  # hook (outskirts): never inside the map
                fy += self.shore(x, y) * min(1.0, (fy - 36.0) / 1.5)
        x0, y0 = math.floor(fx), math.floor(fy)
        ax, ay = fx - x0, fy - y0
        h, wts = 0.0, {}
        for ix, iy, wgt in ((x0, y0, (1 - ax) * (1 - ay)), (x0 + 1, y0, ax * (1 - ay)),
                            (x0, y0 + 1, (1 - ax) * ay), (x0 + 1, y0 + 1, ax * ay)):
            if wgt <= 0.0:
                continue
            h += wgt * self.tile_h(ix, iy)
            c = self.ext(ix, iy)
            wts[c] = wts.get(c, 0.0) + wgt
        # hills beyond the north, west and east edges, fading out towards the mere
        d = max(0.0, -fx - 0.5, fx - (W - 0.5), -fy - 0.5) * S  # metres outside the map on its land sides
        if d > 0.0:
            fade = min(1.0, max(0.0, (fy - 36.5) / 7.0))
            fade = fade * fade * (3 - 2 * fade)
            hill = min(40.0, 0.018 * d + 0.0010 * d * d) + _fbm(x, y, 0.014, 4) * 3.5 * min(1.0, d / 35.0)
            cut = min(1.0, max(0.0, (abs(x - self.rail_x) - 6.0) / 24.0))  # the railway leaves in a level cutting
            hill *= cut * cut * (3 - 2 * cut)
            h += hill * (1.0 - fade)
        if self.edits and not (abs(x) <= W * S / 2 and abs(y) <= H * S / 2):  # hook (outskirts): never inside the map
            for edit in self.edits:
                h, wts = edit(x, y, h, wts)
        return h, wts

    def height(self, x: float, y: float) -> float:
        h, wts = self.sample(x, y)
        snow = wts.get("g", 0.0) + wts.get("T", 0.0)
        return h + 0.05 * snow * _fbm(x, y, 0.45, 3)

    def cells(self, letters: str):
        for ty in range(H):
            for tx in range(W):
                if self.mat[ty][tx] in letters:
                    yield tx, ty

    def runs(self, letter: str):
        """Maximal straight runs of a material letter: (tx, ty, length, 'h' | 'v'), each at least 2 tiles."""
        out, used = [], set()
        for ty in range(H):
            tx = 0
            while tx < W:
                if self.mat[ty][tx] == letter:
                    x1 = tx
                    while x1 + 1 < W and self.mat[ty][x1 + 1] == letter:
                        x1 += 1
                    if x1 > tx:
                        out.append((tx, ty, x1 - tx + 1, "h"))
                        used.update((x, ty) for x in range(tx, x1 + 1))
                    tx = x1 + 1
                else:
                    tx += 1
        for tx in range(W):
            ty = 0
            while ty < H:
                if self.mat[ty][tx] == letter:
                    y1 = ty
                    while y1 + 1 < H and self.mat[y1 + 1][tx] == letter:
                        y1 += 1
                    if y1 > ty:
                        out.append((tx, ty, y1 - ty + 1, "v"))
                    ty = y1 + 1
                else:
                    ty += 1
        return out


# ---------------------------------------------------------------- node helpers


def _new(nodes, kind: str, **props):
    n = nodes.new(kind)
    for k, v in props.items():
        setattr(n, k, v)
    return n


class G:
    """A tiny shader-graph builder: every method returns an output socket."""

    def __init__(self, tree):
        self.t, self.n, self.l = tree, tree.nodes, tree.links

    def link(self, out_socket, in_socket):
        self.l.new(out_socket, in_socket)

    def _in(self, socket, value):
        if hasattr(value, "is_output"):
            self.l.new(value, socket)
        elif value is not None:
            socket.default_value = value

    def value(self, v: float, name: str | None = None):
        n = _new(self.n, "ShaderNodeValue")
        n.outputs[0].default_value = v
        if name:
            n.name = n.label = name
        return n.outputs[0]

    def rgb(self, c, name: str | None = None):
        n = _new(self.n, "ShaderNodeRGB")
        n.outputs[0].default_value = (*c[:3], 1.0)
        if name:
            n.name = n.label = name
        return n.outputs[0]

    def math(self, op: str, a, b=None, c=None, clamp: bool = False):
        n = _new(self.n, "ShaderNodeMath", operation=op, use_clamp=clamp)
        self._in(n.inputs[0], a)
        if b is not None:
            self._in(n.inputs[1], b)
        if c is not None:
            self._in(n.inputs[2], c)
        return n.outputs[0]

    def mix(self, fac, a, b):
        """Colour mix (a where fac = 0, b where fac = 1)."""
        n = _new(self.n, "ShaderNodeMix", data_type="RGBA", blend_type="MIX")
        self._in(n.inputs[0], fac)
        self._in(n.inputs[6], a if hasattr(a, "is_output") else (*a[:3], 1.0))
        self._in(n.inputs[7], b if hasattr(b, "is_output") else (*b[:3], 1.0))
        return n.outputs[2]

    def mixf(self, fac, a, b):
        n = _new(self.n, "ShaderNodeMix", data_type="FLOAT")
        self._in(n.inputs[0], fac)
        self._in(n.inputs[2], a)
        self._in(n.inputs[3], b)
        return n.outputs[0]

    def smooth(self, v, lo: float, hi: float):
        n = _new(self.n, "ShaderNodeMapRange", interpolation_type="SMOOTHSTEP", clamp=True)
        self._in(n.inputs[0], v)
        n.inputs[1].default_value, n.inputs[2].default_value = lo, hi
        n.inputs[3].default_value, n.inputs[4].default_value = 0.0, 1.0
        return n.outputs[0]

    def noise(self, vec, scale: float, detail: float = 3.0, rough: float = 0.5):
        n = _new(self.n, "ShaderNodeTexNoise")
        self.l.new(vec, n.inputs["Vector"])
        n.inputs["Scale"].default_value = scale
        n.inputs["Detail"].default_value = detail
        n.inputs["Roughness"].default_value = rough
        return n.outputs[0]

    def voronoi(self, vec, scale: float, feature: str = "F1"):
        n = _new(self.n, "ShaderNodeTexVoronoi", feature=feature)
        self.l.new(vec, n.inputs["Vector"])
        n.inputs["Scale"].default_value = scale
        return n

    def tex(self, uv, role: str, map_name: str, res: str, zoom: float = 1.0, turn: float = 0.0):
        """A Poly Haven map of a material role, repeated at the scan's own size over world-metre UVs.

        `zoom` enlarges the repeat and `turn` (radians) rotates it: a second, larger, turned copy mixed with the
        first hides the scan's repeat.
        """
        path = mr.texture_path(role, map_name, res=res)
        if not os.path.exists(path):
            raise FileNotFoundError(f"{path}: run `python tools/blender/materials/fetch.py --roles {role} --res {res}`")
        img = bpy.data.images.load(path, check_existing=True)
        if map_name != "diff":
            img.colorspace_settings.name = "Non-Color"
        metres = ph_metres(role) * zoom
        mapping = _new(self.n, "ShaderNodeMapping", vector_type="POINT")
        mapping.inputs["Scale"].default_value = (1.0 / metres, 1.0 / metres, 1.0)
        mapping.inputs["Rotation"].default_value = (0.0, 0.0, turn)
        self.l.new(uv, mapping.inputs["Vector"])
        node = _new(self.n, "ShaderNodeTexImage")
        node.image = img
        self.l.new(mapping.outputs["Vector"], node.inputs["Vector"])
        return node.outputs["Color"]

    def gray(self, colour):
        n = _new(self.n, "ShaderNodeRGBToBW")
        self.l.new(colour, n.inputs["Color"])
        return n.outputs["Val"]

    def desat(self, colour, k: float):
        """Move a colour towards its own grey by `k` (0 = unchanged, 1 = grey)."""
        return self.mix(k, colour, self.gray(colour))

    def scale(self, colour, k: float):
        n = _new(self.n, "ShaderNodeVectorMath", operation="SCALE")
        self.l.new(colour, n.inputs[0])
        n.inputs["Scale"].default_value = k
        return n.outputs["Vector"]

    def attr_xyz(self, name: str):
        a = _new(self.n, "ShaderNodeAttribute", attribute_name=name)
        s = _new(self.n, "ShaderNodeSeparateXYZ")
        self.l.new(a.outputs["Vector"], s.inputs[0])
        return s.outputs[0], s.outputs[1], s.outputs[2]

    def position(self):
        return _new(self.n, "ShaderNodeNewGeometry").outputs["Position"]


_LOCK: dict = {}


def ph_metres(role: str) -> float:
    """The real size of one repeat of a role's texture (the scan's own dimensions, from the lock)."""
    if not _LOCK:
        with open(mr.LOCK_FILE, encoding="utf-8") as fh:
            _LOCK.update(json.load(fh))
    return _LOCK["assets"][mr.role(role).slug]["dimensionsMm"][0] / 1000.0


def uv_world(me: bpy.types.Mesh) -> None:
    """A UV map equal to world x, y in metres, so textures tile at true size and normal maps get a tangent frame."""
    layer = me.uv_layers.new(name="UVMap")
    idx = [0] * len(me.loops)
    me.loops.foreach_get("vertex_index", idx)
    co = [0.0] * (len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    uvs = [0.0] * (len(idx) * 2)
    for i, v in enumerate(idx):
        uvs[2 * i], uvs[2 * i + 1] = co[3 * v], co[3 * v + 1]
    layer.data.foreach_set("uv", uvs)


def _principled(mat):
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    return next(n for n in nodes if n.type == "BSDF_PRINCIPLED")


# ---------------------------------------------------------------- terrain


def terrain_material(layer=None) -> bpy.types.Material:
    """Snow over the game's own Poly Haven ground: each map letter's texture shows where the snow is trodden away.

    hook (outskirts): `layer(module, G, colour, roughness, normal) -> (colour, roughness, normal)` lays more ground over
    this one (the outskirts' bare earth and rock, weighted 0 inside the map); without it the material is as before."""
    m = bpy.data.materials.new("HM_Ground")
    bsdf = _principled(m)
    g = G(m.node_tree)
    pos = g.position()
    uv = _new(g.n, "ShaderNodeUVMap").outputs["UV"]
    cob, path, earth = g.attr_xyz("wdi_a")
    rock, forest, rail = g.attr_xyz("wdi_b")
    n_break = g.noise(pos, 0.9, 4.0)
    n_fine = g.noise(pos, 7.0, 5.0, 0.6)
    n_large = g.noise(pos, 0.07, 3.0)
    n_patch = g.noise(pos, 0.55, 4.0)
    n_wide = g.noise(pos, 0.18, 3.0)

    def shaped(mask, lo=0.30, hi=0.70, amount=0.55):
        v = g.math("ADD", mask, g.math("MULTIPLY", g.math("SUBTRACT", n_break, 0.5), amount))
        v = g.math("ADD", v, g.math("SUBTRACT", n_wide, 0.5))  # wander the edge by about half a metre
        return g.smooth(v, lo, hi)

    m_cob, m_path, m_earth, m_rock, m_forest, m_rail = (shaped(x) for x in (cob, path, earth, rock, forest, rail))

    # snow: the scan's grain, tinted by the look, with an aerial snowfield laid over it for drifts
    # The scan repeats every 2 m; seen from the air under a low moon its ripples line up like paving. Mix it with
    # a larger, turned copy so no straight rows survive.
    which = g.smooth(n_wide, 0.38, 0.62)
    snow_tex = g.mix(which, g.tex(uv, "snow", "diff", GROUND_RES), g.tex(uv, "snow", "diff", GROUND_RES, zoom=2.7, turn=0.62))
    snow_nor = g.mix(which, g.tex(uv, "snow", "nor_gl", GROUND_RES), g.tex(uv, "snow", "nor_gl", GROUND_RES, zoom=2.7, turn=0.62))
    field = g.tex(uv, "snow_field", "diff", "1k")
    tint = g.mix(n_large, g.rgb((0.60, 0.67, 0.80), "P_snow_shade"), g.rgb((0.86, 0.90, 0.96), "P_snow_tint"))
    grain = g.math("ADD", g.math("MULTIPLY", g.gray(snow_tex), 0.5), 0.62)       # about 1, with the scan's detail
    drift = g.math("ADD", g.math("MULTIPLY", g.gray(field), 0.55), 0.62)
    snow = g.scale(tint, 1.0)
    for factor in (grain, drift):
        mul = _new(g.n, "ShaderNodeVectorMath", operation="SCALE")
        g.link(snow, mul.inputs[0])
        g.link(factor, mul.inputs["Scale"])
        snow = mul.outputs["Vector"]

    # each trodden class: (mask, colour, normal, roughness, how much snow still lies on it). The scans' colours are
    # pulled towards grey: under a cool moon their rust and red stones read as blood on the snow.
    patch = g.smooth(n_patch, 0.56, 0.70)
    wet = g.value(0.34, "P_cobble_rough")
    cob_rough = g.math("ADD", g.math("MULTIPLY", g.gray(g.tex(uv, GROUND["c"], "rough", GROUND_RES)), 0.6), g.math("MULTIPLY", wet, 0.4))
    classes = (
        (m_forest, g.mix(g.smooth(g.noise(pos, 22.0, 2.0), 0.66, 0.74), g.scale(snow, 0.8), (0.10, 0.09, 0.07)), snow_nor, 0.6,
         g.value(0.0)),
        (m_earth, g.desat(g.scale(g.tex(uv, GROUND["d"], "diff", "1k"), 0.75), 0.35), g.tex(uv, GROUND["d"], "nor_gl", "1k"), 0.8,
         g.math("MULTIPLY", g.smooth(n_patch, 0.48, 0.64), 0.85)),
        (m_path, g.desat(g.scale(g.tex(uv, GROUND["p"], "diff", "1k"), 0.8), 0.4), g.tex(uv, GROUND["p"], "nor_gl", "1k"), 0.65,
         g.math("MULTIPLY", g.smooth(n_fine, 0.40, 0.70), 0.6)),
        (m_rock, g.desat(g.tex(uv, GROUND["s"], "diff", "1k"), 0.65), g.tex(uv, GROUND["s"], "nor_gl", "1k"), 0.5, patch),
        (m_rail, g.desat(g.scale(g.tex(uv, GROUND["="], "diff", "1k"), 0.7), 0.3), snow_nor, 0.7,
         g.math("MULTIPLY", g.smooth(n_fine, 0.40, 0.60), 0.7)),
        (m_cob, g.scale(g.tex(uv, GROUND["c"], "diff", GROUND_RES), 0.8), g.tex(uv, GROUND["c"], "nor_gl", GROUND_RES), cob_rough,
         g.math("MULTIPLY", patch, g.value(0.35, "P_joint_snow"))),
    )
    col, nor, rough, bare_all = snow, snow_nor, g.value(0.55, "P_snow_rough"), g.value(0.0)
    for mask, c_col, c_nor, c_rough, lying in classes:
        bare = g.math("MULTIPLY", mask, g.math("SUBTRACT", 1.0, lying))  # where this ground shows through the snow
        col = g.mix(bare, col, c_col)
        nor = g.mix(bare, nor, c_nor)
        rough = g.mixf(bare, rough, c_rough)
        bare_all = g.math("MAXIMUM", bare_all, bare)
    if layer is None:
        g.link(col, bsdf.inputs["Base Color"])
        g.link(rough, bsdf.inputs["Roughness"])
    nmap = _new(g.n, "ShaderNodeNormalMap", space="TANGENT", uv_map="UVMap")
    # full grain underfoot, flattened with distance: far ground then neither shows the repeat nor shimmers in motion
    far = g.smooth(_new(g.n, "ShaderNodeCameraData").outputs["View Z Depth"], 14.0, 80.0)
    g.link(g.mixf(far, 1.0, 0.3), nmap.inputs["Strength"])
    g.link(nor, nmap.inputs["Color"])
    # snow stands proud of trodden ground
    hgt = g.math("ADD", g.math("MULTIPLY", g.math("SUBTRACT", 1.0, bare_all), 0.05), g.math("MULTIPLY", n_fine, 0.006))
    bump = _new(g.n, "ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.8
    bump.inputs["Distance"].default_value = 1.0
    g.link(hgt, bump.inputs["Height"])
    g.link(nmap.outputs["Normal"], bump.inputs["Normal"])
    if layer is None:
        g.link(bump.outputs["Normal"], bsdf.inputs["Normal"])
    else:  # hook (outskirts)
        col, rough, nrm = layer(sys.modules[__name__], g, col, rough, bump.outputs["Normal"])
        g.link(col, bsdf.inputs["Base Color"])
        g.link(rough, bsdf.inputs["Roughness"])
        g.link(nrm, bsdf.inputs["Normal"])
    return m


def fine_grid(xs: list[float], ys: list[float], zones) -> tuple[list[tuple[float, float]], list[tuple[int, ...]]]:
    """hook (outskirts): the xs x ys grid with every cell that overlaps a zone (x0, x1, y0, y1, step) cut into cells of
    about `step` metres. Each edge two cells share carries the points of both sides' cuts, and a cell whose outline
    gains points from a finer neighbour is fanned from its centre, so the surface has no cracks. Returns the (x, y)
    points and the faces (quads, and triangles where fanned), counter-clockwise from above."""
    nx, ny = len(xs) - 1, len(ys) - 1
    sub = [[(1, 1)] * nx for _ in range(ny)]  # (cuts across, cuts along) per cell
    for j in range(ny):
        y0, y1 = ys[j], ys[j + 1]
        row = [z for z in zones if y0 < z[3] and y1 > z[2]]
        if not row:
            continue
        for i in range(nx):
            x0, x1 = xs[i], xs[i + 1]
            step = min((z[4] for z in row if x0 < z[1] and x1 > z[0]), default=None)
            if step:
                sub[j][i] = (max(1, round((x1 - x0) / step)), max(1, round((y1 - y0) / step)))
    index: dict[tuple[int, int], int] = {}
    pts: list[tuple[float, float]] = []
    faces: list[tuple[int, ...]] = []

    def vid(x: float, y: float) -> int:
        key = (round(x * 1000.0), round(y * 1000.0))
        k = index.get(key)
        if k is None:
            k = index[key] = len(pts)
            pts.append((x, y))
        return k

    def cuts(a: float, b: float, n: int, m: int) -> list[float]:
        return sorted({round(a + (b - a) * k / n, 6) for k in range(n + 1)} | {round(a + (b - a) * k / m, 6) for k in range(m + 1)})

    def between(vals, lo, hi):
        return [v for v in vals if lo + 1e-6 < v < hi - 1e-6]

    for j in range(ny):
        for i in range(nx):
            x0, x1, y0, y1 = xs[i], xs[i + 1], ys[j], ys[j + 1]
            n, m = sub[j][i]
            south = cuts(x0, x1, n, sub[j - 1][i][0] if j > 0 else n)
            north = cuts(x0, x1, n, sub[j + 1][i][0] if j < ny - 1 else n)
            west = cuts(y0, y1, m, sub[j][i - 1][1] if i > 0 else m)
            east = cuts(y0, y1, m, sub[j][i + 1][1] if i < nx - 1 else m)
            gx = [x0 + (x1 - x0) * k / n for k in range(n + 1)]
            gy = [y0 + (y1 - y0) * k / m for k in range(m + 1)]
            for b in range(m):
                for a in range(n):
                    xa, xb, ya, yb = gx[a], gx[a + 1], gy[b], gy[b + 1]
                    ring = [(xa, ya)]
                    if b == 0:
                        ring += [(x, ya) for x in between(south, xa, xb)]
                    ring.append((xb, ya))
                    if a == n - 1:
                        ring += [(xb, y) for y in between(east, ya, yb)]
                    ring.append((xb, yb))
                    if b == m - 1:
                        ring += [(x, yb) for x in reversed(between(north, xa, xb))]
                    ring.append((xa, yb))
                    if a == 0:
                        ring += [(xa, y) for y in reversed(between(west, ya, yb))]
                    ids = [vid(x, y) for x, y in ring]
                    if len(ids) == 4:
                        faces.append(tuple(ids))
                    else:
                        c = vid((xa + xb) / 2.0, (ya + yb) / 2.0)
                        faces.extend((c, ids[k], ids[(k + 1) % len(ids)]) for k in range(len(ids)))
    return pts, faces


def build_terrain(mp: Map, fine_zones: list | None = None, layer=None) -> bpy.types.Object:
    def axis(lo, fine_lo, fine_hi, hi, fine=0.5, coarse=4.0):
        vals, v = [], lo
        while v < fine_lo - 1e-6:
            vals.append(v)
            v += coarse
        v = fine_lo
        while v < fine_hi - 1e-6:
            vals.append(v)
            v += fine
        v = fine_hi
        while v <= hi + 1e-6:
            vals.append(v)
            v += coarse
        return vals

    xs = axis(-242.0, -58.0, 58.0, 242.0)
    ys = axis(-304.0, -48.0, 46.0, 242.0)
    if fine_zones:  # hook (outskirts): finer cells over the given zones; without zones the grid is exactly as before
        pts, faces = fine_grid(xs, ys, fine_zones)
    else:
        pts = [(x, y) for y in ys for x in xs]
        nx, ny = len(xs), len(ys)
        faces = [(j * nx + i, j * nx + i + 1, (j + 1) * nx + i + 1, (j + 1) * nx + i)
                 for j in range(ny - 1) for i in range(nx - 1)]
    verts, col_a, col_b = [], [], []
    for x, y in pts:
        h, w = mp.sample(x, y)
        snow = w.get("g", 0.0) + w.get("T", 0.0)
        verts.append((x, y, h + 0.05 * snow * _fbm(x, y, 0.45, 3)))
        col_a.extend((w.get("c", 0.0), w.get("p", 0.0), w.get("d", 0.0), 1.0))
        col_b.extend((w.get("s", 0.0) + w.get("X", 0.0) + w.get("w", 0.0), w.get("T", 0.0), w.get("=", 0.0), 1.0))
    me = bpy.data.meshes.new("HM_Ground")
    me.from_pydata(verts, [], faces)
    me.update()
    for name, data in (("wdi_a", col_a), ("wdi_b", col_b)):
        attr = me.color_attributes.new(name=name, type="FLOAT_COLOR", domain="POINT")
        attr.data.foreach_set("color", data)
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    uv_world(me)
    me.materials.append(terrain_material(layer))  # hook (outskirts): `layer`, see terrain_material
    ob = bpy.data.objects.new("HM_Ground", me)
    COL["world"].objects.link(ob)
    return ob


def build_water() -> bpy.types.Object:
    me = bpy.data.meshes.new("HM_Mere")
    y_top = wy(36.6)
    me.from_pydata([(-700, -700, WATER_Z), (700, -700, WATER_Z), (700, y_top, WATER_Z), (-700, y_top, WATER_Z)], [], [(0, 1, 2, 3)])
    m = bpy.data.materials.new("HM_Mere")
    bsdf = _principled(m)
    g = G(m.node_tree)
    pos = g.position()
    bsdf.inputs["Base Color"].default_value = (0.006, 0.010, 0.014, 1.0)
    ice = g.smooth(g.noise(pos, 0.35, 4.0), 0.60, 0.72)
    g.link(g.mixf(ice, g.value(0.06, "P_water_rough"), 0.32), bsdf.inputs["Roughness"])
    g.link(g.mix(ice, (0.006, 0.010, 0.014), (0.045, 0.06, 0.08)), bsdf.inputs["Base Color"])
    bump = _new(g.n, "ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.12
    g.link(g.noise(pos, 1.6, 3.0), bump.inputs["Height"])
    g.link(bump.outputs["Normal"], bsdf.inputs["Normal"])
    me.materials.append(m)
    ob = bpy.data.objects.new("HM_Mere", me)
    COL["world"].objects.link(ob)
    return ob


# ---------------------------------------------------------------- simple built geometry (planks, rails)


def _box(verts, faces, x0, y0, z0, x1, y1, z1):
    b = len(verts)
    verts.extend([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)])
    faces.extend([(b, b + 3, b + 2, b + 1), (b + 4, b + 5, b + 6, b + 7), (b, b + 1, b + 5, b + 4),
                  (b + 1, b + 2, b + 6, b + 5), (b + 2, b + 3, b + 7, b + 6), (b + 3, b, b + 4, b + 7)])


def plank_material(name: str = "HM_Planks") -> bpy.types.Material:
    """The map's `w` ground: Poly Haven old wood floor (the game's own plank role) with snow lying in patches."""
    m = bpy.data.materials.new(name)
    bsdf = _principled(m)
    g = G(m.node_tree)
    pos = g.position()
    uv = _new(g.n, "ShaderNodeUVMap").outputs["UV"]
    wood = g.desat(g.scale(g.tex(uv, GROUND["w"], "diff", GROUND_RES), 1.05), 0.2)  # brighter than the scan: at night a darker deck reads as a slab
    snow = g.smooth(g.noise(pos, 0.8, 4.0), 0.56, 0.68)
    snow_col = g.scale(g.tex(uv, "snow", "diff", GROUND_RES), 0.95)
    g.link(g.mix(snow, wood, snow_col), bsdf.inputs["Base Color"])
    g.link(g.mixf(snow, g.gray(g.tex(uv, GROUND["w"], "rough", GROUND_RES)), 0.6), bsdf.inputs["Roughness"])
    nmap = _new(g.n, "ShaderNodeNormalMap", space="TANGENT", uv_map="UVMap")
    g.link(g.mix(snow, g.tex(uv, GROUND["w"], "nor_gl", GROUND_RES), g.tex(uv, "snow", "nor_gl", GROUND_RES)), nmap.inputs["Color"])
    bump = _new(g.n, "ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.7
    bump.inputs["Distance"].default_value = 1.0
    g.link(g.math("MULTIPLY", snow, 0.03), bump.inputs["Height"])
    g.link(nmap.outputs["Normal"], bump.inputs["Normal"])
    g.link(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def build_dock(mp: Map) -> None:
    """Plank deck over the map's `w` tiles south of the lane, on pilings (the platform is a Meshy model)."""
    verts, faces = [], []
    cells = [(tx, ty) for tx, ty in mp.cells("wK") if ty >= 37] + \
            [(tx, ty) for ty in range(37, 45) for tx in range(44, 58) if mp.mat[ty][tx] == "P"]
    rx0, ry0, rx1, ry1 = dock_model_rect()  # the Meshy dock brings its own deck
    cells = sorted(c for c in set(cells) if not (rx0 < c[0] + 0.5 < rx1 and ry0 < c[1] + 0.5 < ry1))
    for tx, ty in cells:
        _box(verts, faces, wx(tx), wy(ty + 1), -0.10, wx(tx + 1), wy(ty), 0.0)
    cellset = set(cells)
    for tx, ty in cells:  # a piling under every other edge tile
        edge = any((tx + dx, ty + dy) not in cellset for dx, dy in ((1, 0), (-1, 0), (0, 1)))
        if edge and (tx + ty) % 2 == 0 and ty >= 38:
            cx, cy = tc(tx, ty)
            _box(verts, faces, cx - 0.14, cy - 0.14, BED_Z - 0.3, cx + 0.14, cy + 0.14, 0.55 if (tx + ty) % 4 == 0 else -0.1)
    me = bpy.data.meshes.new("HM_Dock")
    me.from_pydata(verts, [], faces)
    uv_world(me)
    me.materials.append(plank_material())
    COL["world"].objects.link(bpy.data.objects.new("HM_Dock", me))


def build_rails(mp: Map, y_north_tile: float = -70.0, y_south_tile: float = 36.6) -> tuple[float, float, float]:
    """Two rails on sleepers along the map's `=` column, continued north out of the map. Returns (x, y_north, y_south)."""
    col = next(tx for tx, ty in mp.cells("="))
    x = wx(col + 0.5)
    y0, y1 = wy(y_south_tile), wy(y_north_tile)
    verts, faces, sv, sf = [], [], [], []
    seg = 2.0
    y = y0
    while y < y1:  # rails follow the terrain in short pieces
        ya, yb = y, min(y + seg, y1)
        za, zb = mp.height(x, ya) + 0.20, mp.height(x, yb) + 0.20
        for side in (-0.7175, 0.7175):
            b = len(verts)
            xa, xb = x + side - 0.035, x + side + 0.035
            verts.extend([(xa, ya, za - 0.12), (xb, ya, za - 0.12), (xb, yb, zb - 0.12), (xa, yb, zb - 0.12),
                          (xa, ya, za), (xb, ya, za), (xb, yb, zb), (xa, yb, zb)])
            faces.extend([(b + 4, b + 5, b + 6, b + 7), (b, b + 1, b + 5, b + 4), (b + 1, b + 2, b + 6, b + 5),
                          (b + 2, b + 3, b + 7, b + 6), (b + 3, b, b + 4, b + 7)])
        y = yb
    y = y0 + 0.3
    while y < y1:
        z = mp.height(x, y) + 0.08
        _box(sv, sf, x - 1.25, y - 0.11, z - 0.14, x + 1.25, y + 0.11, z)
        y += 0.62
    steel = bpy.data.materials.new("HM_Rail")
    b = _principled(steel)
    b.inputs["Base Color"].default_value = (0.05, 0.045, 0.045, 1.0)
    b.inputs["Metallic"].default_value = 0.9
    b.inputs["Roughness"].default_value = 0.32
    for name, v, f, mat in (("HM_Rails", verts, faces, steel), ("HM_Sleepers", sv, sf, plank_material("HM_Sleeper"))):
        me = bpy.data.meshes.new(name)
        me.from_pydata(v, [], f)
        uv_world(me)
        me.materials.append(mat)
        COL["world"].objects.link(bpy.data.objects.new(name, me))
    return x, y1, y0


# ---------------------------------------------------------------- Meshy models


COL: dict[str, bpy.types.Collection] = {}
CAT: dict[str, dict] = {}
_SRC: dict[str, bpy.types.Object] = {}
KEEP_CLEAR: list[tuple[float, float, float, float]] = []  # world rectangles (x0, y0, x1, y1) the forest stays out of


def _collections(scene) -> None:
    for key, name, render in (("world", "HM_World", True), ("models", "HM_Models", True), ("forest", "HM_Forest", True),
                              ("lights", "HM_Lights", True), ("src", "HM_Sources", False)):
        c = bpy.data.collections.new(name)
        scene.collection.children.link(c)
        c.hide_render = not render
        COL[key] = c


def source(name: str, lod: float | None = None) -> bpy.types.Object:
    """The hidden master of a model (one import per model); `lod` is a decimate ratio for far or repeated pieces."""
    key = name if lod is None else f"{name}@{lod}"
    if key in _SRC:
        return _SRC[key]
    if lod is None:
        o = mi.import_meshy(name)
        for c in list(o.users_collection):
            c.objects.unlink(o)
        COL["src"].objects.link(o)
        slim_textures(o, name)
    else:
        base = source(name)
        o = base.copy()
        o.data = base.data.copy()
        bpy.context.scene.collection.objects.link(o)  # visible while the modifier is applied
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        mod = o.modifiers.new("lod", "DECIMATE")
        mod.ratio = lod
        bpy.ops.object.modifier_apply(modifier="lod")
        o.data.polygons.foreach_set("use_smooth", [True] * len(o.data.polygons))  # decimation leaves flat shards
        bpy.context.scene.collection.objects.unlink(o)
        COL["src"].objects.link(o)
        o.name = key
    _SRC[key] = o
    return o


# models the camera passes within a few metres of keep their 2K base colour; every other map is halved
HERO_2K = {"The_Drowned_Lantern", "Frostbitten_Fisherman_s_Wharf", "fisher_cottage", "emergency_bell", "Frostbound_Wishing_Well",
           "village_pump", "Frostbound_Notice_Board", "steam_locomotive", "rail_car", "station_platform", "Frontier_Bakery",
           "Mallory_Apothecary", "Tycoon_s_Manor", "Frozen_Lantern_Post", "marsh_dock_skiff", "Frostbound_Gate"}


def slim_textures(o: bpy.types.Object, name: str, side: int = 1024) -> None:
    """Halve a model's maps (2K as delivered), except the base colour of the hero models. Forty-odd models with
    three 2K maps each overrun the shared graphics memory of a laptop, and frame time then triples."""
    for slot in o.material_slots:
        mat = slot.material
        if mat is None or not mat.use_nodes:
            continue
        for n in mat.node_tree.nodes:
            if n.type != "TEX_IMAGE" or n.image is None or max(n.image.size) <= side:
                continue
            is_base = any(l.to_node.type == "BSDF_PRINCIPLED" and l.to_socket.name == "Base Color" for l in n.outputs["Color"].links)
            if not (is_base and name in HERO_2K):
                n.image.scale(side, side)
                n.image.pack()  # keep the smaller pixels in the saved file


def dims(name: str) -> Vector:
    lo, hi = mi._bounds(source(name))
    return hi - lo


def yaw_for(name: str, facing: str) -> float:
    """Radians about z that turn the model's front (catalog `front`, default S) to face `facing`."""
    return math.radians(ANG[facing] - ANG.get(CAT[name].get("front", "S"), -90.0))


def local_to_world(o: bpy.types.Object, p) -> tuple[float, float, float]:
    """A point given in a placed model's own frame (at catalog scale) in world space."""
    a, k = o.rotation_euler.z, o.scale[0]
    x, y = p[0] * k, p[1] * k
    return (o.location.x + x * math.cos(a) - y * math.sin(a), o.location.y + x * math.sin(a) + y * math.cos(a),
            o.location.z + p[2] * k)


def place(mp: Map, name: str, x: float, y: float, facing: str = "S", size: float | None = None, scale: float | None = None,
          rot: float | None = None, lod: float | None = None, z: float | None = None, col: str = "models",
          sink: float = 0.0, lamps: bool = True) -> bpy.types.Object:
    """A linked duplicate of a model standing on the terrain at a world point. `size` is its longest side in metres."""
    s = source(name, lod)
    o = s.copy()
    COL[col].objects.link(o)
    k = scale if scale is not None else (size / CAT[name]["size_m"] if size else 1.0)
    o.scale = (k, k, k)
    o.rotation_mode = "XYZ"
    o.rotation_euler = (0.0, 0.0, math.radians(rot) if rot is not None else yaw_for(name, facing))
    o.location = (x, y, (mp.height(x, y) if z is None else z) - sink)
    o["wdi_model"] = name
    if name in SELF_LIT:
        o.visible_shadow = False  # the lamp sits inside the lantern mesh
    if lamps and name in LAMPS:
        ref, items = LAMPS[name]
        f = CAT[name]["size_m"] / ref  # the table is written at `ref` metres longest side
        front_world = o.rotation_euler.z + math.radians(ANG.get(CAT[name].get("front", "S"), -90.0))
        for lx, ly, lz, kind, bulb in items:
            wxp, wyp, wzp = local_to_world(o, (lx * f, ly * f, lz * f))
            add_light(kind, wxp, wyp, wzp, bulb=bulb, aim=front_world)
    return o


def building(mp: Map, name: str, fp: dict, door: str, size: float, front_grow: float = 0.0, along: float = 0.0,
             lod: float | None = None, sink: float = 0.0) -> dict:
    """Stand a model on a map footprint (tiles x, y, w, h): `size` metres on its longest side, the facade on the
    footprint's door edge moved out by `front_grow` metres, centred along that edge (plus `along` metres)."""
    d = dims(name)
    k = size / CAT[name]["size_m"]
    front = CAT[name].get("front", "S")
    width, depth = ((d.y, d.x) if front in ("E", "W") else (d.x, d.y))
    width, depth = width * k, depth * k
    x0, x1 = wx(fp["x"]), wx(fp["x"] + fp["w"])
    y_n, y_s = wy(fp["y"]), wy(fp["y"] + fp["h"])
    if door == "S":
        cx, cy = (x0 + x1) / 2 + along, y_s - front_grow + depth / 2
    elif door == "N":
        cx, cy = (x0 + x1) / 2 + along, y_n + front_grow - depth / 2
    elif door == "E":
        cx, cy = x1 + front_grow - depth / 2, (y_s + y_n) / 2 + along
    else:
        cx, cy = x0 - front_grow + depth / 2, (y_s + y_n) / 2 + along
    o = place(mp, name, cx, cy, facing=door, scale=k, sink=sink, lod=lod)
    o["wdi_role"] = fp.get("role", "")
    hw, hd = (width / 2, depth / 2) if door in ("S", "N") else (depth / 2, width / 2)
    KEEP_CLEAR.append((cx - hw - 2.5, cy - hd - 2.5, cx + hw + 2.5, cy + hd + 2.5))
    print(f"BUILDING {fp.get('role', name)}: {name} {width:.1f} wide x {depth:.1f} deep x {d.z * k:.1f} m tall at ({cx:.1f}, {cy:.1f}) door {door}", flush=True)
    return dict(obj=o, door=door, cx=cx, cy=cy, width=width, depth=depth)


def facade_point(b: dict, along: float = 0.0, out: float = 0.8) -> tuple[float, float]:
    """A point `out` metres in front of a building's facade and `along` metres to the right, seen from outside."""
    if b["door"] == "S":
        return b["cx"] + along, b["cy"] - b["depth"] / 2 - out
    if b["door"] == "N":
        return b["cx"] - along, b["cy"] + b["depth"] / 2 + out
    if b["door"] == "E":
        return b["cx"] + b["depth"] / 2 + out, b["cy"] + along
    return b["cx"] - b["depth"] / 2 - out, b["cy"] - along


# ---------------------------------------------------------------- lights (tagged; the look sets their strength)


BULB: dict[str, object] = {}
SELF_LIT = ("Frozen_Lantern_Post", "company_lamp_post", "drowned_lantern")


def add_light(kind: str, x: float, y: float, z: float, bulb: bool = False, aim: float | None = None) -> bpy.types.Object:
    """A light tagged `wdi_light = kind`. `headlamp` is a spot along `aim` (world radians); the rest are points."""
    spot = kind == "headlamp"
    ld = bpy.data.lights.new(f"L_{kind}", "SPOT" if spot else "POINT")
    ld.energy = 120.0
    ld.color = (1.0, 0.62, 0.30)
    ld.shadow_soft_size = 0.10
    ob = bpy.data.objects.new(f"L_{kind}", ld)
    COL["lights"].objects.link(ob)
    ob.location = (x, y, z)
    ob["wdi_light"] = kind
    if spot:
        ld.spot_size = math.radians(38.0)
        ld.spot_blend = 0.30
        a = aim or 0.0
        direction = Vector((math.cos(a), math.sin(a), -0.06))
        ob.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    if bulb:
        me = BULB.get("mesh")
        if me is None:
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.075)
            tmp = bpy.context.active_object
            me = BULB["mesh"] = tmp.data
            bpy.data.objects.remove(tmp, do_unlink=True)
        mat = BULB.get(kind)
        if mat is None:
            mat = BULB[kind] = bpy.data.materials.new(f"HM_Bulb_{kind}")
            mat.use_nodes = True
            nodes, links = mat.node_tree.nodes, mat.node_tree.links
            for n in list(nodes):
                nodes.remove(n)
            em = _new(nodes, "ShaderNodeEmission")
            em.name = "Bulb"
            em.inputs["Color"].default_value = (1.0, 0.62, 0.30, 1.0)
            em.inputs["Strength"].default_value = 30.0
            links.new(em.outputs[0], _new(nodes, "ShaderNodeOutputMaterial").inputs["Surface"])
        bo = bpy.data.objects.new(f"B_{kind}", me.copy())
        bo.data.materials.append(mat)
        COL["lights"].objects.link(bo)
        bo.location = (x, y, z)
        bo["wdi_bulb"] = kind
        bo.visible_shadow = False
    return ob


# Where each model carries a lamp, from the orientation sheets: model -> (the longest side the offsets were read at,
# [(x east, y north, z up, light kind, visible bulb)]) in the model's own frame as stored.
LAMPS: dict[str, tuple[float, list[tuple[float, float, float, str, bool]]]] = {
    "Frozen_Lantern_Post": (3.2, [(0.60, 0.0, 2.35, "lantern", True)]),
    "company_lamp_post": (3.5, [(0.0, 0.0, 2.95, "lantern", True)]),
    "emergency_bell": (3.2, [(-1.25, -1.0, 1.6, "lamp", False)]),
    "Frostbound_Bell_Tower": (3.2, [(0.9, -1.0, 0.9, "lamp", False)]),
    "Frostbound_Notice_Board": (1.8, [(0.45, -0.85, 1.05, "lamp", False)]),
    "Frostbound_Wishing_Well": (2.2, [(0.85, -0.95, 1.2, "lamp", False)]),
    "Frostbound_Waymarker": (1.8, [(0.45, 0.0, 1.1, "lamp", False)]),
    "The_Witching_Lantern": (3.0, [(-0.6, 0.0, 2.0, "shrine", False)]),
    "Frostbound_Gate": (4.0, [(0.0, -0.45, 1.05, "lamp", False)]),
    "Frostbound_Warden_Gate": (4.0, [(-1.85, 0.35, 1.4, "lamp", False)]),
    "drowned_lantern": (3.0, [(-0.4, -0.6, 1.75, "drowned", True)]),
    "station_platform": (7.0, [(-2.44, -0.69, 2.73, "lantern", False)]),
    "marsh_dock_skiff": (8.0, [(0.0, -0.4, 3.1, "lamp", False)]),
    "timber_crib": (2.2, [(0.2, -1.05, 1.4, "lamp", False)]),
    "fisher_cottage": (5.0, [(0.4, -2.8, 1.3, "lamp", False)]),
    "The_Drowned_Lantern": (9.0, [(2.0, -4.7, 2.1, "lamp", False)]),
    "Frostbitten_Fisherman_s_Wharf": (8.0, [(-1.2, -3.8, 2.6, "window", False)]),
    "graveyard_set": (4.0, [(-1.5, 0.0, 1.5, "lamp", False)]),
    "Mallory_Apothecary": (6.0, [(1.2, -3.2, 1.5, "lamp", False)]),
    "Vicars_Chapel": (7.0, [(0.0, -3.9, 2.2, "window", False)]),
    "Hale_Barn": (9.0, [(1.8, -4.8, 2.4, "lamp", False)]),
    "steam_locomotive": (8.0, [(-3.25, 0.0, 2.41, "headlamp", False), (2.0, 0.0, 2.2, "lamp", False)]),
    "rail_car": (9.0, [(4.3, -0.8, 2.6, "lamp", False), (-4.3, 0.8, 2.6, "lamp", False)]),
}


# ---------------------------------------------------------------- the village


# map art -> (model, longest side in metres, placement options); sizes follow the human-scale notes in the catalog,
# held inside what the enlarged footprint and its neighbours leave free
BUILDINGS = {
    "manor": ("Tycoon_s_Manor", 14.5, dict(front_grow=2.5, sink=0.10)),          # in mourning: no light of its own
    "barn": ("Hale_Barn", 12.0, dict(front_grow=4.5, lod=0.6, sink=0.11)),       # stands forward in its yard, clear of the north wall
    "bakery": ("Frontier_Bakery", 9.5, dict(front_grow=0.5)),
    "apoth": ("Mallory_Apothecary", 7.3, dict(sink=0.09)),
    "widow": ("widow_cottage", 6.2, dict()),
    "tavern": ("The_Drowned_Lantern", 11.2, dict(front_grow=0.7, along=2.4)),    # its east wall on the alley
    "chapel": ("Vicars_Chapel", 11.2, dict(lod=0.7)),
    "netloft": ("Frostbitten_Fisherman_s_Wharf", 9.0, dict(front_grow=-6.0, sink=0.14)),  # at the head of the alley, off the quay
}
DOCK_MODEL = (52.5, 42.6, 9.5)  # the Meshy dock: tile centre x, y and its longest side in metres


def door_side(fp: dict, portals: list[dict]) -> str:
    """The footprint face a door portal sits on (the map puts every door on a south or east face)."""
    best = None
    for p in portals:
        if p.get("kind") != "door":
            continue
        if fp["x"] <= p["x"] < fp["x"] + fp["w"] and fp["y"] <= p["y"] < fp["y"] + fp["h"]:
            side = "S" if p["y"] == fp["y"] + fp["h"] - 1 else ("E" if p["x"] == fp["x"] + fp["w"] - 1 else "S")
            if best is None or side == "S":
                best = side
    return best or "S"


def dock_model_rect() -> tuple[float, float, float, float]:
    """Tile rectangle the Meshy dock covers (the plank deck leaves it free)."""
    cx, cy, _size = DOCK_MODEL
    return cx - 3.2, cy - 2.3, cx + 3.2, cy + 3.2  # the model's outline: the deck runs up to the hut's back wall


def build_village(mp: Map) -> None:
    d = mp.d
    built: dict[str, dict] = {}
    for b in d["buildings"]:
        model, size, opts = BUILDINGS[b["art"]]
        fp = dict(b["footprint"], role=b["art"])
        built[b["art"]] = building(mp, model, fp, door_side(fp, d["portals"]), size, **opts)
    # the fisher's cottage: the map's W block (greybox scene cottage_fisher), door south at (48, 36)
    built["fisher"] = building(mp, "fisher_cottage", dict(x=46, y=32, w=6, h=5, role="fisher"), "S", 7.5)

    props = {p["id"]: p for p in d["props"]}

    def at(pid: str, dx: float = 0.0, dy: float = 0.0):
        """World point of a map prop, moved by (dx east, dy south) tiles."""
        return tc(props[pid]["x"] + dx, props[pid]["y"] + dy)

    # the square: the one bell, the well and pump, the board, the kit chest, the market corner, four lantern posts
    place(mp, "emergency_bell", *at("ov.bell"), facing="S", size=3.8)
    place(mp, "Frostbound_Wishing_Well", *tc(31.9, 21.3), facing="S", lod=0.5)
    place(mp, "village_pump", *tc(34.0, 21.4), facing="W")
    place(mp, "Frostbound_Notice_Board", *at("ov.board", dx=0.6), facing="S", lod=0.5)
    place(mp, "kit_chest", *at("ov.chest"), facing="S")
    place(mp, "crates_barrels", *tc(24.4, 16.3), rot=10.0)
    place(mp, "crates_barrels", *tc(26.9, 16.2), rot=195.0)
    place(mp, "Frostbound_Waymarker", *at("ov.signpost"), facing="S", lod=0.3)
    for i in range(4):
        x, y = at(f"ov.lantern_{i}")
        place(mp, "Frozen_Lantern_Post", x, y, rot=(0.0 if x < 0 else 180.0), lod=0.4)
    # window light from the map's own light list, close in front of the right facades
    for art, kind, along, out, h in (("tavern", "window", 0.0, 0.35, 1.6), ("tavern", "window", -3.0, 0.35, 1.6),
                                     ("bakery", "window", 1.2, 0.35, 1.6), ("apoth", "teal", -1.6, -0.4, 1.4),
                                     ("chapel", "window", 1.8, 0.35, 1.6)):
        x, y = facade_point(built[art], along=along, out=out)
        add_light(kind, x, y, mp.height(x, y) + h)
    # the green north of the square and the gate road
    place(mp, "hay_cart", *tc(35.6, 12.0), rot=200.0)
    place(mp, "boulder_set", *at("ov.boulder"), rot=40.0)
    place(mp, "boulder_set", *at("ov.boulder_1"), rot=200.0, size=2.0)
    place(mp, "boulder_set", *tc(36.0, 6.0), rot=110.0, size=1.3)
    place(mp, "hollow_log", *at("ov.stump"), rot=30.0)
    place(mp, "Frostbound_Gate", *tc(32.0, 3.2), facing="S", lod=0.3)
    place(mp, "Frostbound_Warden_Gate", *tc(21.0, 10.5), facing="E", lod=0.3)
    place(mp, "Frostbound_Gate", *tc(43.0, 9.5), facing="W", size=4.4, lod=0.3)
    place(mp, "Frostbound_Warden_Gate", *tc(53.0, 15.0), facing="S", size=1.9, lod=0.3, lamps=False)  # the map's fence panel
    for tx, ty in ((4.4, 4.6), (6.2, 4.4), (7.6, 3.6), (12.6, 3.6), (14.6, 4.7)):  # pines close the gap behind the manor
        place(mp, "pine_tall", *tc(tx, ty), rot=RNG.uniform(0, 360), scale=RNG.uniform(0.9, 1.2), col="forest", sink=0.2)
    # (the manor stays unlit, in mourning; `drape()` below can hang crepe over its gable board if wanted)
    # the widow's lawn and the map's hedge
    for ty in (21.2, 23.8):
        o = place(mp, "drystone_wall", *tc(19.5, ty), rot=(90.0 if dims("drystone_wall").x >= dims("drystone_wall").y else 0.0), lod=0.3)
    place(mp, "dead_tree", *tc(13.0, 25.0), rot=70.0, scale=1.2, col="forest", sink=0.2)
    # the barn yard and paddock
    place(mp, "hay_cart", *tc(45.6, 12.6), rot=20.0)
    place(mp, "scarecrow", *tc(58.6, 13.0), facing="S")
    x, y = facade_point(built["barn"], along=2.6, out=-0.6)
    place(mp, "wolf_pelt_door", x, y, facing="S")
    # the chapel yard: graves and the wayside shrine
    place(mp, "graveyard_set", *tc(16.6, 32.0), facing="S")
    place(mp, "tombstone_tomorrow", *tc(13.6, 33.6), facing="S")
    place(mp, "The_Witching_Lantern", *at("ov.altar_shrine"), facing="S", lod=0.3)
    # the tavern, the alley and the east lane
    place(mp, "Frostbitten_Woodshed", *tc(27.4, 31.4), facing="S", lod=0.5)
    place(mp, "crates_barrels", *tc(28.4, 35.4), rot=160.0, size=1.6)
    place(mp, "crates_barrels", *tc(46.6, 23.6), rot=80.0, size=1.6)
    place(mp, "wood_stack", *tc(46.6, 18.2), rot=0.0)
    # between the lane, the apothecary and the platform
    place(mp, "hay_cart", *tc(56.8, 32.6), rot=280.0)
    place(mp, "crates_barrels", *tc(58.0, 34.6), rot=40.0)
    place(mp, "split_rail_fence", *tc(54.6, 34.9), rot=0.0)
    place(mp, "ore_cart", *tc(59.8, 35.1), rot=90.0)
    # the station and the Daily Train on the spur (a timber stop at tile row 36.6)
    rail_x = mp.rail_x
    loco_len, car_len = CAT["steam_locomotive"]["size_m"], CAT["rail_car"]["size_m"]
    loco_y = wy(36.2) + loco_len / 2
    car_y = loco_y + loco_len / 2 + 0.35 + car_len / 2
    place(mp, "steam_locomotive", rail_x, loco_y, facing="S", z=mp.height(rail_x, loco_y) + 0.20)
    place(mp, "rail_car", rail_x, car_y, facing="S", z=mp.height(rail_x, car_y) + 0.20)
    plat_depth = min(dims("station_platform").x, dims("station_platform").y)
    place(mp, "station_platform", rail_x - 1.45 - plat_depth / 2, wy(27.9), facing="E")  # beside the coach
    stop = place(mp, "timber_crib", rail_x, wy(36.6) - 1.05, facing="S")
    stop.scale.z *= 0.7
    # the quay, the dock and the mere
    dcx, dcy, dsize = DOCK_MODEL
    place(mp, "marsh_dock_skiff", *tc(dcx - 0.5, dcy - 0.5), facing="S", size=dsize, z=WATER_Z - 0.06)
    place(mp, "crates_barrels", *tc(47.6, 40.6), rot=30.0, z=0.0)
    place(mp, "crates_barrels", *tc(45.4, 43.2), rot=200.0, size=1.6, z=0.0)
    place(mp, "wood_stack", *tc(56.0, 39.6), rot=0.0, z=0.0)
    place(mp, "company_lamp_post", *at("ov.lantern_pole_1"), z=0.0)
    place(mp, "company_lamp_post", *at("ov.lantern_pole_2"), z=0.0)
    place(mp, "drowned_lantern", *tc(32.4, 42.1), rot=15.0, z=WATER_Z - 0.12)
    for tx, ty, size in ((12.0, 41.8, 2.2), (24.0, 41.9, 1.7), (38.0, 41.7, 2.0)):  # stones on the water line
        place(mp, "boulder_set", *tc(tx, ty), rot=RNG.uniform(0, 360), size=size, lod=0.3, z=WATER_Z - 0.35)
    # fences: the hedge-topped drystone wall along every F run (stopping short of the railway)
    seg = CAT["drystone_wall"]["size_m"]
    wall_long_x = dims("drystone_wall").x >= dims("drystone_wall").y
    rail_col = next(tx for tx, ty in mp.cells("="))
    runs = []
    for tx, ty, n, way in mp.runs("F"):
        if way == "h" and tx <= rail_col < tx + n:
            n = rail_col - 1 - tx
        if n >= 1:
            runs.append((tx, ty, n, way))
    runs.append((rail_col - 1, 5, 11, "v"))  # the paddock's east wall: the line runs outside it
    for tx, ty, n, way in runs:
        length = n * S
        count = max(1, round(length / (seg * 1.05)))
        for i in range(count):
            a = (i + 0.5) * n / count
            x, y = (wx(tx + a), wy(ty + 0.5)) if way == "h" else (wx(tx + 0.5), wy(ty + a))
            if any(r[0] + 2.0 < x < r[2] - 2.0 and r[1] + 2.0 < y < r[3] - 2.0 for r in KEEP_CLEAR):
                continue  # a building stands here
            o = place(mp, "drystone_wall", x, y, rot=(0.0 if (way == "h") == wall_long_x else 90.0), lod=0.3,
                      scale=(length / count) / seg)
            o.scale.z = 1.0


def drape(o: bpy.types.Object, lx: float, lz: float, width: float, height: float) -> bpy.types.Object | None:
    """Black crepe hung flat on the first surface a ray from the model's front meets at (lx, lz) of its own frame
    (catalog scale); `width` and `height` are metres in the scene."""
    bpy.context.view_layer.update()
    k = o.scale[0]
    ok, loc, _n, _i = o.ray_cast(Vector((lx, -80.0, lz)), Vector((0.0, 1.0, 0.0)), depsgraph=bpy.context.evaluated_depsgraph_get())
    if not ok:
        print("DRAPE missed", o.name, flush=True)
        return None
    w, h, t = width / k / 2, height / k / 2, 0.05 / k
    y1 = loc.y - 0.02 / k
    verts, faces = [], []
    _box(verts, faces, lx - w, y1 - t, lz - h, lx + w, y1, lz + h)
    me = bpy.data.meshes.new("HM_Crepe")
    me.from_pydata(verts, [], faces)
    mat = bpy.data.materials.get("HM_Crepe") or bpy.data.materials.new("HM_Crepe")
    b = _principled(mat)
    b.inputs["Base Color"].default_value = (0.004, 0.004, 0.005, 1.0)
    b.inputs["Roughness"].default_value = 0.92
    me.materials.append(mat)
    ob = bpy.data.objects.new("HM_Crepe", me)
    COL["models"].objects.link(ob)
    ob.matrix_world = o.matrix_world.copy()
    print(f"DRAPE on {o.name} at local y {loc.y:.2f}", flush=True)
    return ob


def build_forest(mp: Map, rail_x: float) -> None:
    trees = (("pine_tall", 5.0, (0.85, 1.25)), ("pine_short", 1.0, (0.9, 1.4)), ("dead_tree", 0.7, (1.0, 1.6)))
    names, weights = [t[0] for t in trees], [t[1] for t in trees]
    ranges = {t[0]: t[2] for t in trees}
    road_x = wx(32.5)

    def tree(x, y, lod: float | None, shadow: bool = True) -> bool:
        if abs(x - rail_x) < (10.0 if y < wy(28) else 5.0):  # the railway cutting, wider beside the engine
            return False
        if abs(x - road_x) < 3.6 and y > wy(5):  # the gate road
            return False
        if any(r[0] < x < r[2] and r[1] < y < r[3] for r in KEEP_CLEAR):
            return False
        name = RNG.choices(names, weights)[0]
        lo, hi = ranges[name]
        o = place(mp, name, x, y, rot=RNG.uniform(0, 360), scale=RNG.uniform(lo, hi), lod=lod, col="forest", sink=0.2)
        o.visible_shadow = shadow  # only the trees at the village edge throw shadows into the picture
        return True

    for tx, ty in mp.cells("T"):  # the map's own tree border
        if RNG.random() < 0.34:
            x, y = tc(tx, ty)
            tree(x + RNG.uniform(-0.6, 0.6), y + RNG.uniform(-0.6, 0.6), 0.6)  # near full detail: the camera passes these

    def outside(x, y) -> float:
        """Metres outside the map on its land sides; negative inside it or over the mere."""
        fx, fy = x / S + W / 2, H / 2 - y / S
        if fy > 37.5:
            return -1.0
        return max(-fx, fx - W, -fy, 0.0) * S

    for lo_d, hi_d, want, lod in ((1.5, 45.0, 430, 0.20), (45.0, 215.0, 380, 0.08)):  # a dense belt, then thinning hills
        count, tries = 0, 0
        while count < want and tries < 40000:
            tries += 1
            x, y = RNG.uniform(-250, 250), RNG.uniform(wy(40), 250)
            dist = outside(x, y)
            if not (lo_d <= dist < hi_d):
                continue
            if hi_d > 100 and RNG.random() > 1.0 - (dist - lo_d) / (hi_d - lo_d) * 0.85:
                continue
            if tree(x, y, lod, shadow=dist < 12.0):
                count += 1
    for tx, ty in mp.cells("X"):
        if RNG.random() < 0.07:
            x, y = tc(tx, ty)
            place(mp, "boulder_set", x, y, rot=RNG.uniform(0, 360), scale=RNG.uniform(0.6, 1.1), lod=0.3, col="forest", sink=0.25)


# ---------------------------------------------------------------- preview and entry point


def preview(scene, out: str) -> None:
    """Two daylight checks of the layout: straight down (north up) and an oblique view from the south-east."""
    r = scene.render
    r.engine = "BLENDER_EEVEE"
    r.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "Standard"
    scene.eevee.taa_render_samples = 16
    w = bpy.data.worlds.new("Preview")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.62, 0.72, 1.0)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.9
    scene.world = w
    sun = bpy.data.objects.new("PreviewSun", bpy.data.lights.new("PreviewSun", "SUN"))
    sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(50), 0.0, math.radians(140))
    scene.collection.objects.link(sun)
    for lt in COL["lights"].objects:
        lt.hide_render = True
    cam = bpy.data.objects.new("PreviewCam", bpy.data.cameras.new("PreviewCam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.data.clip_end = 2000.0
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 76.0 * S
    cam.location = (0.0, -1.0 * S, 300.0)
    cam.rotation_euler = (0.0, 0.0, 0.0)
    r.resolution_x, r.resolution_y = 1900, 1500
    r.filepath = os.path.abspath(out + "_top.png")
    bpy.ops.render.render(write_still=True)
    cam.data.type = "PERSP"
    cam.data.lens = 28.0
    cam.location = (58.0 * S, -62.0 * S, 46.0 * S)
    cam.rotation_euler = (Vector((0.0, -2.0 * S, 0.0)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    r.resolution_x, r.resolution_y = 1920, 1080
    r.filepath = os.path.abspath(out + "_oblique.png")
    bpy.ops.render.render(write_still=True)
    for lt in COL["lights"].objects:
        lt.hide_render = False
    bpy.data.objects.remove(sun, do_unlink=True)
    bpy.data.objects.remove(cam, do_unlink=True)
    print("PREVIEW", out, flush=True)


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="meshy_village_build.py")
    p.add_argument("--save")
    p.add_argument("--preview")
    p.add_argument("--no-models", action="store_true")
    p.add_argument("--no-forest", action="store_true")
    p.add_argument("--no-outskirts", action="store_true", help="the village alone, as before the outskirts")  # hook (outskirts)
    a = p.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = "HollowMere"
    scene["wdi_tile_m"] = S
    _collections(scene)
    CAT.update(mi.catalog())
    mp = Map()
    mp.tread(60, 31, 35)  # a trodden way from the platform steps to the lane
    ok = None
    if not a.no_outskirts:  # hook (outskirts): its earthworks go into Map.sample before anything stands on the ground
        import meshy_village_outskirts as ok
        mp.edits.extend(ok.terrain_edits())
        mp.shore = ok.shore_wander
    # hook (outskirts): finer ground under the districts, and bare earth and rock on its steep faces outside the map
    build_terrain(mp, fine_zones=ok.FINE_ZONES if ok else None, layer=ok.ground_layer if ok else None)
    build_water()
    build_dock(mp)
    rail_x, _, _ = build_rails(mp)
    if not a.no_models:
        build_village(mp)
        if not a.no_forest:
            build_forest(mp, rail_x)
    if ok:  # hook (outskirts): after the forest, so its random sequence is the village's own
        ok.build_outskirts(mp, sys.modules[__name__], models=not a.no_models, forest=not (a.no_models or a.no_forest))
    COL["src"].hide_viewport = True  # the masters stand at the origin: keep them out of ray casts and the viewport
    tris = sum(len(o.data.polygons) for o in scene.objects if o.type == "MESH" and not o.hide_render)
    print(f"BUILT objects {len(scene.objects)} faces {tris}", flush=True)
    if a.preview:
        preview(scene, a.preview)
    if a.save:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(a.save), compress=False)
        print("SAVED", a.save, flush=True)


if __name__ == "__main__":
    main()
