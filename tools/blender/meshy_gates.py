"""The surface side of the Undermere's gates in the village walk file (meshy_walk_export.py --gates <json>).

docs/walk-areas.md, section 5 (cave mouths): each gate is a pair of door-like portals of kind `cave_mouth`. In the
village this step writes, for every gate of the data file (`meshy_gates/undermere_gates.json`):

- the mouth piece: the rock or masonry round the opening, an ink panel in it, the Company's grille and one lamp; the
  four pieces are one unlit mesh `HM_Gate_pieces` under `Area_village` (one draw call: the single village file was at
  247 of its 248), on one atlas of the cached scans (`atlas` in the data file). It is lit per vertex by the viewer's
  own light model (apps/walk/src/look.ts: the look's moon as a directional light, the sky as a hemisphere light, the
  village's kept
  lights; three's Lambert, no shadows) times a mild sky occlusion, plus the gate lamp's light painted in, so it reads
  as the lit village round it does and adds no live light. COLOR_0 never shows under the ink (#12141C) at the
  village's exposure through three r186's AgX (meshy_room_build.agx), and never lilac (green kept between red and blue);
- its collision, appended to `HM_Collision` (the one primitive the contract allows);
- `Portal_um.<gate>_in` {to undermere, toSpawn mouth_<gate>, kind cave_mouth} and the arrival from the cave,
  `Spawn_overworld_mouth_<gate>`, on the ground found by the collision after the step's own edits;
- the terrain edits the data file names (`terrain`, kind `channel`: the Adit Gate's cutting): the render ground's
  vertices in the strip lowered to the cutting's floor, the collision's ground replaced inside a patch by the floor,
  the walls, the parapets and the headwall.

After the pieces the exporter's own texture fit (fit_textures) runs again, so the file stays under its texture budget.
Without --gates nothing here runs and the exporter writes the same bytes as before. The functions above the Blender
part need only the standard library (tests/test_gates.py).
"""

from __future__ import annotations

import json
import math
import os
import re

try:
    import bmesh
    import bpy
    import numpy as np
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
except ImportError:  # the data checks run without Blender
    bpy = None

HERE = os.path.dirname(os.path.abspath(__file__))
FORMAT = "village-gates/1"
GATE_TYPES = ("notch", "slot", "adit", "arch")
BANNED = ("rope", "torch", "gallows", "crepe", "noose", "sconce", "crape", "georgette")
INK = (0x12, 0x14, 0x1C)
ATTR = "wdi_light"            # the per-vertex light, exported as COLOR_0 (the rooms' and caves' name)
MAT_NAME = "HM_Gate_kit"
KIT_NODE = "HM_Gate_pieces"     # one node for all the pieces (one draw call)
ATLAS_NAME = "HM_Gate_atlas"
STEP = 0.5                    # the lighting grid of a flat face (metres)
PORTAL_SPAWN_M = 1.0          # the contract's spawn-to-portal rule (and the exporter's)


# ================================================================ data (standard library only)


def srgb_hex(h: str) -> tuple:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def load_gates(path: str) -> dict:
    with open(path, encoding="utf-8") as fh:
        d = json.load(fh)
    bad = validate(d)
    if bad:
        raise ValueError(f"{path}: " + "; ".join(bad))
    return d


def validate(d: dict) -> list:
    """The data file's own rules: the contract's names (docs/walk-areas.md section 5), one row a gate, known kinds."""
    bad = []
    if d.get("format") != FORMAT:
        bad.append(f"format is {d.get('format')!r}, not {FORMAT!r}")
    ns, scene = d.get("portal_ns"), d.get("scene")
    seen = set()
    terrain = {t.get("key") for t in d.get("terrain", [])}
    for g in d.get("gates", []):
        gid = g.get("id", "")
        if not gid or not gid.replace("_", "").isalpha() or gid != gid.lower():
            bad.append(f"gate id {gid!r}: lower-case words")
        if gid in seen:
            bad.append(f"gate {gid}: twice")
        seen.add(gid)
        if g.get("type") not in GATE_TYPES:
            bad.append(f"gate {gid}: type {g.get('type')!r} not one of {GATE_TYPES}")
        if g.get("portal", {}).get("node") != f"Portal_{ns}.{gid}_in":
            bad.append(f"gate {gid}: its portal is not Portal_{ns}.{gid}_in")
        if g.get("arrival", {}).get("node") != f"Spawn_overworld_mouth_{gid}":
            bad.append(f"gate {gid}: its arrival is not Spawn_overworld_mouth_{gid}")
        cs = g.get("cave_side", {})
        if cs.get("portal") != f"Portal_{ns}.{gid}_out" or cs.get("arrival") != f"Spawn_{scene}_mouth_{gid}":
            bad.append(f"gate {gid}: its cave side is not Portal_{ns}.{gid}_out / Spawn_{scene}_mouth_{gid}")
        for k in ("mouth", "in_deg", "opening", "lamp", "budget_tris", "cave_area", "name", "district"):
            if k not in g:
                bad.append(f"gate {gid}: no {k}")
        if g.get("type") == "adit" and g.get("kit", {}).get("cutting") not in terrain:
            bad.append(f"gate {gid}: its cutting {g.get('kit', {}).get('cutting')!r} is not a terrain row")
        p, a = g.get("portal", {}).get("xy"), g.get("arrival", {}).get("xy")
        if p and a and math.hypot(p[0] - a[0], p[1] - a[1]) <= PORTAL_SPAWN_M:
            bad.append(f"gate {gid}: its arrival stands {math.hypot(p[0] - a[0], p[1] - a[1]):.2f} m from its portal")
    for t in d.get("terrain", []):
        if t.get("kind") != "channel":
            bad.append(f"terrain {t.get('key')}: kind {t.get('kind')!r} (only channel)")
        if len(t.get("points_m", [])) < 2:
            bad.append(f"terrain {t.get('key')}: fewer than two floor points")
    text = json.dumps(d).lower()
    for w in BANNED:
        if re.search(r"(?<![a-z])%ss?(?![a-z])" % w, text):
            bad.append(f"the banned word {w!r} is in the data")
    return bad


def frame(g: dict) -> tuple:
    """A gate's kit frame in the village (Blender) frame: origin (x, y, z), right (ex) and in (ey) unit vectors in
    plan."""
    o = g.get("kit_origin") or g["mouth"]
    a = math.radians(g["in_deg"])
    ey = (math.cos(a), math.sin(a))
    ex = (ey[1], -ey[0])
    return (float(o[0]), float(o[1]), float(o[2])), ex, ey


def to_world(g: dict, lx: float, ly: float, lz: float) -> tuple:
    (ox, oy, oz), ex, ey = frame(g)
    return (ox + lx * ex[0] + ly * ey[0], oy + lx * ex[1] + ly * ey[1], oz + lz)


def to_local(g: dict, x: float, y: float) -> tuple:
    (ox, oy, _), ex, ey = frame(g)
    dx, dy = x - ox, y - oy
    return dx * ex[0] + dy * ex[1], dx * ey[0] + dy * ey[1]


def channel_floor(row: dict, x: float, y: float):
    """The floor of a `channel` terrain row at (x, y), or None outside its strip or its clip: the nearest segment of
    the floor polyline within width / 2 of the point (projected inside the segment), its height interpolated; as the
    outskirts builder's Channel (min(h, floor) inside the strip, vertical sides)."""
    c = row.get("clip_m")
    if c and not (c[0] <= x <= c[2] and c[1] <= y <= c[3]):
        return None
    half = 0.5 * float(row["width_m"])
    best = None
    pts = row["points_m"]
    for (x0, y0, z0), (x1, y1, z1) in zip(pts, pts[1:]):
        dx, dy = x1 - x0, y1 - y0
        L2 = dx * dx + dy * dy
        if L2 <= 0:
            continue
        t = ((x - x0) * dx + (y - y0) * dy) / L2
        if t < 0.0 or t > 1.0:
            continue
        d = abs((x - x0) * dy - (y - y0) * dx) / math.sqrt(L2)
        if d <= half + 1e-9 and (best is None or d < best[0]):
            best = (d, z0 + t * (z1 - z0))
    return None if best is None else best[1]


def channel_slope_deg(row: dict) -> float:
    pts = row["points_m"]
    return max(math.degrees(math.atan2(abs(z1 - z0), math.hypot(x1 - x0, y1 - y0)))
               for (x0, y0, z0), (x1, y1, z1) in zip(pts, pts[1:]))


def facing_euler_z(theta_deg: float) -> float:
    """The exporter's spawn rotation: local +Y (glTF -Z, the viewer's forward) along the facing."""
    return math.radians(theta_deg - 90.0)


# ================================================================ Blender


def _np(v):
    return np.asarray(v, dtype=np.float64)


class Kit:
    """A gate's mouth piece in its own frame (lx right, ly in, lz up from the sill): quads, each with its own four
    vertices (so a face's light is its own), a UV in an atlas cell, a tint (the albedo's multiplier) and either the
    lit flag or a direct radiance (the ink panel, the lamp's glass)."""

    def __init__(self, g: dict, cells: dict):
        self.g, self.cells = g, cells
        (ox, oy, oz), ex, ey = frame(g)
        self.O = _np((ox, oy, oz))
        self.EX = _np((ex[0], ex[1], 0.0))
        self.EY = _np((ey[0], ey[1], 0.0))
        self.EZ = _np((0.0, 0.0, 1.0))
        self.P, self.N, self.UV, self.T, self.E, self.K = [], [], [], [], [], []   # per corner / per quad
        self.coll_boxes = []       # local boxes (lo, hi) for HM_Collision
        self.coll_tris = []        # world triangles for HM_Collision (the adit's patch)
        self.lamp_world = None
        self.flame = (1.0, 0.45, 0.1)   # the glass's radiance (add_gates sets the data file's)
        self.px = 1024                   # the atlas's size (add_gates sets the data file's)

    def w(self, p) -> np.ndarray:
        p = _np(p)
        return self.O + p[..., 0:1] * self.EX + p[..., 1:2] * self.EY + p[..., 2:3] * self.EZ

    def wd(self, d) -> np.ndarray:
        d = _np(d)
        return d[..., 0:1] * self.EX + d[..., 1:2] * self.EY + d[..., 2:3] * self.EZ

    def quad(self, corners, cell: str, tint=(1.0, 1.0, 1.0), st=None, emit=None, kind: str = "lit"):
        """corners: four local points, counter-clockwise seen from the face's front. st: four (s, t) in metres on the
        face for the UV (default: projected on the first edge and the face's up); emit: a direct radiance (linear RGB)."""
        c = _np(corners)
        Wc = self.w(c)
        m = len(Wc)
        n = sum(np.cross(Wc[i], Wc[(i + 1) % m]) for i in range(m))  # Newell's normal
        nl = np.linalg.norm(n)
        if nl < 1e-12:
            return
        n = n / nl
        if st is None:
            a = Wc[1] - Wc[0]
            a = a / max(np.linalg.norm(a), 1e-12)
            b = np.cross(n, a)
            st = [(float(np.dot(p - Wc[0], a)), float(np.dot(p - Wc[0], b))) for p in Wc]
        cm = self.cells[cell]["metres"]
        s = _np(st) / cm
        # the face sits inside one tile of the cell: shifted by the whole tiles under its corner; a face larger than a
        # tile is scaled into it (the scans tile, so faces on a grid at fractions of the tile join without a seam)
        s = s - np.floor(s.min(axis=0) + 1e-6)
        span = s.max(axis=0)
        s = np.where(span > 1.0, s / np.maximum(span, 1e-9), s)
        u0, v0, u1, v1 = self.cells[cell]["uv"]
        ins = 2.0 / self.px
        uv = np.stack([u0 + ins + s[:, 0] * (u1 - u0 - 2 * ins), v0 + ins + s[:, 1] * (v1 - v0 - 2 * ins)], axis=1)
        self.P.append(Wc)
        self.N.append(np.repeat(n[None, :], m, axis=0))
        self.UV.append(uv)
        self.T.append(np.repeat(_np(tint)[None, :], m, axis=0) if np.ndim(tint) == 1 else _np(tint))
        if emit is not None and np.ndim(emit) == 1:
            emit = np.repeat(_np(emit)[None, :], m, axis=0)
        self.E.append(None if emit is None else _np(emit))
        self.K.append(kind)

    def grid(self, o, a, b, la: float, lb: float, cell: str, tint=(1.0, 1.0, 1.0), step: float = STEP,
             emit_fn=None, tint_fn=None, kind="lit", top_fn=None):
        """A flat rectangle from local point o along local unit vectors a (length la) and b (length lb), front = a x b,
        split at fractions of `step` (lines at whole steps from o) so its light can vary. top_fn(s) clips the b extent
        (an arch's panel). emit_fn(local points (4, 3)) -> (4, 3) radiance; tint_fn likewise -> (4, 3) tint."""
        o, a, b = _np(o), _np(a), _np(b)
        na = max(1, int(math.ceil(la / step - 1e-6)))
        nb = max(1, int(math.ceil(lb / step - 1e-6)))
        sa = [min(la, i * step) for i in range(na + 1)]
        sb = [min(lb, j * step) for j in range(nb + 1)]
        for i in range(na):
            for j in range(nb):
                s0, s1, t0, t1 = sa[i], sa[i + 1], sb[j], sb[j + 1]
                if top_fn is not None:
                    h0, h1 = top_fn(s0), top_fn(s1)
                    if t0 >= max(h0, h1) - 1e-6:
                        continue
                    q = [(s0, t0), (s1, t0), (s1, min(t1, h1)), (s0, min(t1, h0))]
                else:
                    q = [(s0, t0), (s1, t0), (s1, t1), (s0, t1)]
                pts = [o + qs * a + qt * b for qs, qt in q]
                self.quad(pts, cell, tint if tint_fn is None else tint_fn(_np(pts)), st=q,
                          emit=None if emit_fn is None else emit_fn(_np(pts)), kind=kind)

    def box(self, lo, hi, cell: str, tint=(1.0, 1.0, 1.0), skip=(), step: float = STEP, collide: bool = False,
            tint_fn=None, top=None):
        """An axis-aligned box in the local frame; faces named -x +x -y +y -z +z can be skipped (buried or unseen)."""
        x0, y0, z0 = lo
        x1, y1, z1 = hi
        X, Y, Z = _np((1, 0, 0)), _np((0, 1, 0)), _np((0, 0, 1))
        faces = {
            "-y": ((x0, y0, z0), X, Z, x1 - x0, z1 - z0),
            "+y": ((x1, y1, z0), -X, Z, x1 - x0, z1 - z0),
            "-x": ((x0, y1, z0), -Y, Z, y1 - y0, z1 - z0),
            "+x": ((x1, y0, z0), Y, Z, y1 - y0, z1 - z0),
            "+z": ((x0, y0, z1), X, Y, x1 - x0, y1 - y0),
            "-z": ((x0, y1, z0), X, -Y, x1 - x0, y1 - y0),
        }
        for k, (o, a, b, la, lb) in faces.items():
            if k not in skip and la > 1e-6 and lb > 1e-6:
                c = top if (k == "+z" and top is not None) else cell
                self.grid(o, a, b, la, lb, c, tint if c == cell else (1.0, 1.0, 1.0), step=step,
                          tint_fn=tint_fn if c == cell else None)
        if collide:
            self.coll_boxes.append((tuple(lo), tuple(hi)))

    def bar_v(self, x: float, y: float, z0: float, z1: float, t: float = 0.026, cell="iron", tint=(1, 1, 1)):
        """A vertical grille bar seen from both sides: its front, back and two sides, no caps."""
        self.box((x - t / 2, y - t / 2, z0), (x + t / 2, y + t / 2, z1), cell, tint, skip=("+z", "-z"), step=10.0)

    def bar_h(self, x0: float, x1: float, y: float, z: float, t: float = 0.05, d: float = 0.03, cell="iron",
              tint=(1, 1, 1)):
        self.box((x0, y - d / 2, z - t / 2), (x1, y + d / 2, z + t / 2), cell, tint, skip=("-x", "+x"), step=10.0)

    def icicle(self, x: float, y: float, z: float, length: float, r: float = 0.035):
        """A three-sided icicle hanging from (x, y, z)."""
        tip = (x, y, z - length)
        ring = [(x + r * math.cos(a), y + r * math.sin(a), z) for a in (0.0, 2.0944, 4.18879)]
        for i in range(3):
            p0, p1 = ring[i], ring[(i + 1) % 3]
            self.quad([p1, p0, tip], "ice", (1.0, 1.0, 1.0), st=[(0.0, length), (2 * r, length), (r, 0.0)])

    def lamp(self, at, out=(0.0, -1.0, 0.0)):
        """The Company's lamp: an iron bracket from the wall, a housing (caps and corner posts) round four glass panes
        that glow at the flame's own radiance. Its light is painted in (Kit.light), at the housing's centre."""
        x, y, z = at
        oy = out[1]
        back = y - oy * 0.22
        self.box((x - 0.015, min(back, y), z + 0.08), (x + 0.015, max(back, y), z + 0.11), "iron", step=10.0,
                 skip=("-y", "+y"))
        h = 0.075
        self.box((x - h - 0.01, y - h - 0.01, z + 0.1), (x + h + 0.01, y + h + 0.01, z + 0.15), "iron", step=10.0,
                 skip=("-z",))
        self.box((x - h, y - h, z - 0.12), (x + h, y + h, z - 0.09), "iron", step=10.0)
        glass = [((x - h, y - h, z - 0.09), (x + h, y - h, z - 0.09), (x + h, y - h, z + 0.1), (x - h, y - h, z + 0.1)),
                 ((x + h, y + h, z - 0.09), (x - h, y + h, z - 0.09), (x - h, y + h, z + 0.1), (x + h, y + h, z + 0.1)),
                 ((x + h, y - h, z - 0.09), (x + h, y + h, z - 0.09), (x + h, y + h, z + 0.1), (x + h, y - h, z + 0.1)),
                 ((x - h, y + h, z - 0.09), (x - h, y - h, z - 0.09), (x - h, y - h, z + 0.1), (x - h, y + h, z + 0.1))]
        for q in glass:
            self.quad(q, "white", emit=self.flame, kind="glass")
        for sx in (-1, 1):
            for sy in (-1, 1):
                cx, cy = x + sx * h, y + sy * h
                self.box((cx - 0.008, cy - 0.008, z - 0.09), (cx + 0.008, cy + 0.008, z + 0.1), "iron", step=10.0,
                         skip=("+z", "-z"))
        self.lamp_world = self.w(_np((x, y, z)))

    def tris(self) -> int:
        return sum(len(p) - 2 for p in self.P)

    def faces(self) -> list:
        out, n = [], 0
        for p in self.P:
            out.append(tuple(range(n, n + len(p))))
            n += len(p)
        return out


# ---------------------------------------------------------------- the four kinds of mouth


def build_notch(kit: Kit, g: dict, ground):
    """The Swallow Gate: a notch in the knoll's face under an overhanging limestone lip; jambs to either side, the
    ink panel just behind the grille, two water lines, icicles at the lip, frost on the sill, the lamp on the right."""
    w, h = g["opening"]
    k = g["kit"]
    hw = w / 2
    jw, jb = k["jamb_w"], k["jamb_back"]
    lf = k["lip_front"]
    lines = k.get("water_lines", [])

    def water(pts):
        t = np.ones((len(pts), 3))
        for z in lines:
            band = np.exp(-((pts[:, 2] - z) / 0.05) ** 2)
            t += band[:, None] * _np((0.9, 0.95, 1.0))
        return t

    # jambs: from below the ground to the lip, the outer side faces buried in the slope
    for sx in (-1, 1):
        # each jamb two blocks: a broad foot to 0.9 m, a narrower block set back above it
        x0, x1 = (-hw - jw - 0.12, -hw) if sx < 0 else (hw, hw + jw + 0.12)
        kit.box((x0, -0.52, -0.6), (x1, jb, 0.9), "rock", skip=("+y", "-z"), step=0.25, collide=True,
                tint_fn=water, top="snow")
        x0, x1 = (-hw - jw, -hw) if sx < 0 else (hw, hw + jw)
        kit.box((x0, -0.42, 0.9), (x1, jb, h), "rock", skip=("+y", "-z", "+z"), step=0.25, collide=True,
                tint_fn=water)
    # the lip: overhanging the opening, its underside lit by the lamp, its back in the knoll, snow on it
    kit.box((-hw - jw - 0.25, lf, h), (hw + jw + 0.25, jb + 0.3, h + k["lip_h"]), "rock", skip=("+y",), step=0.4,
            top="snow")
    # a second, smaller lip block for an uneven skyline
    kit.box((-hw - 0.2, lf - 0.12, h + k["lip_h"] - 0.05), (hw * 0.5, jb, h + k["lip_h"] + 0.22), "rock",
            skip=("+y", "-z"), step=0.4, top="snow")
    # the ink panel just behind the grille
    kit.grid((-hw, 0.03, -0.25), (1, 0, 0), (0, 0, 1), w, h + 0.25, "white", step=0.3, kind="panel")
    # the grille: a frame of flat iron, bars at 0.15 m
    n = int(round(w / 0.15))
    for i in range(1, n):
        kit.bar_v(-hw + i * w / n, -0.03, -0.15, h)
    for z in (0.1, 1.05, h - 0.06):
        kit.bar_h(-hw, hw, -0.03, z)
    for sx in (-1, 1):
        kit.box((sx * hw - 0.03, -0.07, -0.15), (sx * hw + 0.03, 0.0, h), "iron", step=10.0, skip=("+z", "-z"))
    kit.coll_boxes.append(((-hw, -0.07, -0.3), (hw, 0.04, h)))
    # frost on the sill
    kit.box((-hw, -0.45, -0.25), (hw, 0.03, -0.02), "snow", skip=("-z", "+y"), step=0.6)
    # icicles under the lip's front edge
    rng = np.random.default_rng(1893)
    for i in range(k.get("icicles", 0)):
        x = -hw - 0.2 + (w + 0.4) * (i + 0.5) / k["icicles"] + float(rng.uniform(-0.05, 0.05))
        kit.icicle(x, lf + 0.06, h, float(rng.uniform(0.12, 0.42)))
    kit.lamp(g["lamp"])


def build_slot(kit: Kit, g: dict, ground):
    """The Cutting Gate: a slot in the face of cliff:024 (its render face 31.55 to 31.90 m east, measured): the ink
    panel just in front of the face, frost-rimmed trims round it, a timber-and-iron railway grille, ice on its floor
    and one small lamp on the right post."""
    w, h = g["opening"]
    k = g["kit"]
    hw = w / 2
    tw, tb = k["trim_w"], k["trim_back"]
    py = k["panel_ly"]
    frost = (1.25, 1.32, 1.4)
    kit.grid((-hw, py, -0.1), (1, 0, 0), (0, 0, 1), w, h + 0.1, "white", step=0.65, kind="panel")
    for sx in (-1, 1):
        x0, x1 = (-hw - tw, -hw) if sx < 0 else (hw, hw + tw)
        kit.box((x0, -0.04, -0.1), (x1, tb, h), "rock", frost, skip=("+y", "-z", "+z"), step=1.0)
    kit.box((-hw - tw, -0.06, h), (hw + tw, tb, h + 0.22), "rock", frost, skip=("+y",), step=1.0)
    # timber posts and head beam, iron bars between
    for sx in (-1, 1):
        x = sx * (hw + 0.02)
        kit.box((x - 0.06, -0.18, -0.05), (x + 0.06, -0.06, h + 0.18), "timber", skip=("-z", "+y"), step=10.0)
    kit.box((-hw - 0.14, -0.2, h + 0.06), (hw + 0.14, -0.06, h + 0.22), "timber", skip=("+y",), step=10.0)
    n = int(round(w / 0.15))
    for i in range(1, n):
        kit.bar_v(-hw + i * w / n, -0.11, 0.0, h + 0.06, t=0.024)
    for z in (0.18, 1.35, h - 0.1):
        kit.bar_h(-hw, hw, -0.11, z, t=0.045, d=0.02)
    kit.coll_boxes.append(((-hw - 0.08, -0.2, -0.3), (hw + 0.08, 0.06, h + 0.22)))
    # hoarfrost fins on the trims' inner edges and ice on the floor
    rng = np.random.default_rng(24)
    for i in range(k.get("frost_fins", 0)):
        sx = -1 if i % 2 == 0 else 1
        z = 0.25 + (h - 0.5) * (i // 2) / max(1, k["frost_fins"] // 2 - 1)
        x = sx * hw
        d = -sx * float(rng.uniform(0.05, 0.1))
        kit.quad([(x, -0.03, z), (x + d, -0.01, z + 0.05), (x + d, -0.01, z + 0.14), (x, -0.03, z + 0.2)], "snow",
                 (1.1, 1.12, 1.15), st=[(0, 0), (0.1, 0.05), (0.1, 0.14), (0, 0.2)])
    kit.box((-hw, -0.22, -0.06), (hw, py, 0.0), "ice", skip=("-z", "+y", "-x", "+x"), step=10.0)
    kit.lamp(g["lamp"])


def build_arch(kit: Kit, g: dict, ground):
    """The Old Rising Gate: a broad arch of limestone blocks at the cliff's foot, the ink panel arched under it, a
    grille across it with a narrow iron door at its middle, an icicle fringe, rough steps up the bank."""
    w, h = g["opening"]
    k = g["kit"]
    hw = w / 2
    spring = k["spring"]
    rise = h - spring
    jw, ring = k["jamb_w"], k["ring"]

    def top(s):
        x = s - hw
        return spring + rise * math.sqrt(max(0.0, 1.0 - (x / hw) ** 2))

    kit.grid((-hw, 0.05, -0.05), (1, 0, 0), (0, 0, 1), w, h + 0.05, "white", step=0.75, kind="panel",
             top_fn=lambda s: top(s) + 0.05)
    for sx in (-1, 1):
        x0, x1 = (-hw - jw, -hw) if sx < 0 else (hw, hw + jw)
        kit.box((x0, -0.35, -0.3), (x1, 1.2, spring + 0.2), "rock", skip=("+y", "-z"), step=1.2, collide=True)
    # the arch ring: blocks round the curve, each a box turned to the curve's normal
    nb = 7
    for i in range(nb):
        a0 = math.pi * i / nb
        a1 = math.pi * (i + 1) / nb
        pts = []
        for a in (a0, a1):
            cx, cz = -hw * math.cos(a), spring + rise * math.sin(a)
            nx, nz = -math.cos(a) * rise, math.sin(a) * hw
            nn = math.hypot(nx, nz)
            nx, nz = nx / nn, nz / nn
            pts.append(((cx, cz), (cx + ring * nx, cz + ring * nz)))
        (i0, o0), (i1, o1) = pts
        y0, y1 = -0.4, 1.2
        kit.quad([(o0[0], y0, o0[1]), (o1[0], y0, o1[1]), (i1[0], y0, i1[1]), (i0[0], y0, i0[1])][::-1], "rock")
        kit.quad([(i0[0], y1, i0[1]), (i1[0], y1, i1[1]), (i1[0], y0, i1[1]), (i0[0], y0, i0[1])], "rock")
        kit.quad([(o1[0], y1, o1[1]), (o0[0], y1, o0[1]), (o0[0], y0, o0[1]), (o1[0], y0, o1[1])], "rock")
    # the grille: flat bars at 0.2 m, rails, a narrow door at the middle (its frame heavier)
    n = int(round(w / 0.2))
    dw = k["door_w"] / 2
    for i in range(1, n):
        x = -hw + i * w / n
        kit.bar_v(x, -0.02, -0.05, top(x + hw) - 0.02, t=0.03)
    for z in (0.12, 1.2, spring):
        kit.bar_h(-hw, hw, -0.02, z, t=0.05, d=0.025)
    for sx in (-1, 1):
        kit.box((sx * dw - 0.03, -0.06, -0.05), (sx * dw + 0.03, 0.01, 2.0), "iron", step=10.0, skip=("+z", "-z"))
    kit.box((-dw, -0.06, 1.97), (dw, 0.01, 2.05), "iron", step=10.0)
    kit.coll_boxes.append(((-hw, -0.07, -0.3), (hw, 0.06, spring)))
    # icicles from the ring's lower edge
    rng = np.random.default_rng(1894)
    for i in range(k.get("icicles", 0)):
        a = math.pi * (i + 0.5) / k["icicles"]
        x, z = -hw * math.cos(a), spring + rise * math.sin(a)
        kit.icicle(x, -0.3, z + 0.02, float(rng.uniform(0.15, 0.55)), r=0.04)
    # rough steps up the bank from the walk's ground to the ledge
    z_lo = k["steps_from"] - kit.O[2]
    ns = k["steps"]
    for i in range(ns):
        ztop = z_lo + (i + 1) * (-z_lo) / ns
        y0 = -0.65 + 0.15 * i
        kit.box((-dw - 0.25, y0, z_lo - 0.2), (dw + 0.25, -0.05, ztop), "rock", (0.85, 0.85, 0.85),
                skip=("-z", "+y"), step=10.0, collide=True)
    kit.lamp(g["lamp"])


def build_adit(kit: Kit, g: dict, ground, row: dict, orig_coll):
    """The Adit Gate: the cutting's dry-stone walls with their coping and parapets, the headwall with its timbered
    opening, the grille at its back, the ink panel, the stone gutter and the lamp; and the collision patch that
    replaces the collision's own ground inside the terrain row's patch (floor, walls, parapets, headwall)."""
    k = g["kit"]
    wf, wt = k["wall_face"], k["wall_thick"]
    ph, pt, pfrom = k["parapet_h"], k["parapet_thick"], k["parapet_from_m"]
    hy0, hy1 = k["headwall"]
    mo, sp = k["opening_masonry"], k["set_post"]
    lz = k["lintel_z"]
    oz = kit.O[2]

    def floor_at(ly):
        x, y, _ = to_world(g, 0.0, ly, 0.0)
        f = channel_floor(row, x, y)
        return None if f is None else f - oz

    def ground_at(lx, ly):
        x, y, _ = to_world(g, lx, ly, 0.0)
        return ground(x, y) - oz

    pts = row["points_m"]
    ly_mouth = to_local(g, pts[0][0], pts[0][1])[1]
    ys = [ly_mouth + i * 0.5 for i in range(int(math.floor((hy0 - ly_mouth) / 0.5)) + 1)] + [hy0]
    ys = sorted(set(round(v, 4) for v in ys if ly_mouth - 1e-6 <= v <= hy0 + 1e-6))
    stats = dict(walls=[], parapet_m=0.0)
    for side in (-1, 1):
        xf = side * wf                     # the wall's face (toward the cutting's middle)
        xb = side * (wf + wt)              # its back, in the ground
        xp = side * (wf + pt)              # the parapet's outer face
        tops, floors = [], []
        for ly in ys:
            f = floor_at(ly)
            f = 0.0 if f is None else f
            top = max(ground_at(side * (wf + wt), ly), ground_at(xf, ly), f) + 0.05
            tops.append(top)
            floors.append(f)
        for i in range(len(ys) - 1):
            y0, y1 = ys[i], ys[i + 1]
            f0, f1, t0, t1 = floors[i], floors[i + 1], tops[i], tops[i + 1]
            if t0 - f0 < 0.06 and t1 - f1 < 0.06:
                continue
            # the face, in rows of 0.5 m or so
            nz = max(1, int(math.ceil(max(t0 - f0, t1 - f1) / 0.6)))
            for j in range(nz):
                a0, a1 = f0 + (t0 - f0) * j / nz, f0 + (t0 - f0) * (j + 1) / nz
                b0, b1 = f1 + (t1 - f1) * j / nz, f1 + (t1 - f1) * (j + 1) / nz
                q = [(xf, y0, a0), (xf, y1, b0), (xf, y1, b1), (xf, y0, a1)]
                if side > 0:
                    q = [q[1], q[0], q[3], q[2]]
                st = [(p[1], p[2]) for p in q]
                kit.quad(q, "stone", st=st)
            # the coping, from the face to the back
            q = [(xf, y0, t0), (xf, y1, t1), (xb, y1, t1), (xb, y0, t0)]
            if side > 0:
                q = q[::-1]
            kit.quad(q, "stone", (0.95, 0.95, 0.95), st=[(p[0], p[1]) for p in q])
            # the parapet where the drop is more than pfrom
            if min(t0 - f0, t1 - f1) > pfrom:
                stats["parapet_m"] += y1 - y0
                for (xa, up) in ((xf, True), (xp, False)):
                    q = [(xa, y0, t0), (xa, y1, t1), (xa, y1, t1 + ph), (xa, y0, t0 + ph)]
                    if (side > 0) == up:
                        q = [q[1], q[0], q[3], q[2]]
                    kit.quad(q, "stone", st=[(p[1], p[2]) for p in q])
                q = [(xf, y0, t0 + ph), (xf, y1, t1 + ph), (xp, y1, t1 + ph), (xp, y0, t0 + ph)]
                if side > 0:
                    q = q[::-1]
                kit.quad(q, "snow", (1.0, 1.0, 1.0), st=[(p[0], p[1]) for p in q])
        stats["walls"].append(dict(side="north" if side < 0 else "south", length_m=round(ys[-1] - ys[0], 2),
                                   highest_m=round(max(t - f for t, f in zip(tops, floors)), 2)))
    # the headwall: two piers and the masonry above the opening, its top at the ground's height (+ 5 cm) and a
    # parapet along its front edge; its back (in the ground) not drawn
    hx = wf + wt
    htop = max(ground_at(x, y) for x in (-hx, 0.0, hx) for y in (hy0, 0.0, hy1)) + 0.05
    fl = 0.0
    for x0, x1 in ((-hx, -mo), (mo, hx)):
        kit.box((x0, hy0, fl), (x1, hy1, htop), "stone", skip=("+y", "-z", "+z"), step=0.6)
    kit.box((-mo, hy0, lz + 0.22), (mo, hy1, htop), "stone", skip=("+y", "+z", "-x", "+x"), step=0.6)
    kit.box((-hx, hy0, htop), (hx, hy0 + pt, htop + ph), "stone", skip=("-z",), step=0.6)
    kit.box((-hx, hy0 + pt, htop - 0.01), (hx, hy1, htop + 0.02), "snow", skip=("-z", "-y"), step=0.8)
    kit.adit_htop = htop
    # the timber sets: a front and a back set, each two posts and a cap; the lintel over the front
    for ya, yb in ((hy0, hy0 + 0.18), (-0.2, -0.02)):
        for sx in (-1, 1):
            x0, x1 = (-mo, -mo + sp) if sx < 0 else (mo - sp, mo)
            kit.box((x0, ya, fl), (x1, yb, lz), "timber", skip=("-z",), step=1.0)
        kit.box((-mo, ya, lz), (mo, yb, lz + 0.22), "timber", skip=("+z",), step=1.0)
    # the grille at the opening's back, the ink panel behind it
    cx = mo - sp
    n = int(round(2 * cx / 0.15))
    for i in range(1, n):
        kit.bar_v(-cx + i * 2 * cx / n, 0.0, 0.0, lz)
    for z in (0.12, 1.1, lz - 0.08):
        kit.bar_h(-cx, cx, 0.0, z)
    kit.grid((-mo, 0.06, -0.02), (1, 0, 0), (0, 0, 1), 2 * mo, lz + 0.22, "white", step=0.5, kind="panel")
    # the stone gutter along the landing's middle, under the grille
    g0, g1 = k["gutter"]
    for x0, x1 in ((-0.16, -0.08), (0.08, 0.16)):
        kit.box((x0, g0, -0.02), (x1, g1, 0.04), "stone", (0.8, 0.8, 0.8), skip=("-z", "+y"), step=10.0)
    kit.quad([(-0.08, g0, -0.01), (0.08, g0, -0.01), (0.08, g1, -0.01), (-0.08, g1, -0.01)], "iron")
    kit.lamp(g["lamp"])
    stats["headwall_top_m"] = round(htop, 2)
    stats["sets_clear_m"] = round(2 * (mo - sp), 2)
    stats["walls_clear_m"] = round(2 * wf, 2)
    return stats


# ---------------------------------------------------------------- light


def look_light(final: dict) -> dict:
    m = final["moon"]
    a, e = math.radians(m["azimuth"]), math.radians(m["elevation"])
    sky = final["sky"]
    sky_avg = [0.5 * (sky["horizon"][i] + sky["zenith"][i]) for i in range(3)]
    return dict(moon_dir=_np((math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e))),
                moon=_np(m["color"]) * float(m["energy"]), sky=_np(sky_avg), ground=_np(sky["ground"]),
                hemi=float(sky["light"]))


def light_at(P: np.ndarray, N: np.ndarray, L: dict, lights: list, ao: np.ndarray) -> np.ndarray:
    """What a lit surface of albedo 1 sends to the eye under the viewer's lights (three's Lambert: BRDF albedo / pi;
    the hemisphere light at pi x sky.light, so sky.light x its colour; punctual lights at W / (4 pi), decay 2, no
    shadows), the sky's part times `ao`."""
    out = np.zeros_like(P)
    cm = np.clip(N @ L["moon_dir"], 0.0, None)
    out += cm[:, None] * L["moon"][None, :] / math.pi
    wgt = 0.5 * N[:, 2] + 0.5
    hemi = (L["ground"][None, :] * (1 - wgt[:, None]) + L["sky"][None, :] * wgt[:, None]) * L["hemi"]
    out += hemi * ao[:, None]
    for li in lights:
        d = li["p"][None, :] - P
        dist = np.maximum(np.linalg.norm(d, axis=1), li.get("near", 0.05))
        c = np.clip((N * d).sum(axis=1) / dist, 0.0, None)
        E = li["I"] * c / (dist * dist)
        if li.get("range"):
            r = li["range"]
            t = np.clip((dist - r) / (0.75 * r - r), 0.0, 1.0)
            E = E * t * t * (3 - 2 * t)
        out += E[:, None] * li["col"][None, :] / math.pi
    return out


def sky_visibility(P: np.ndarray, N: np.ndarray, bvh, rays: int, reach: float) -> np.ndarray:
    """The share of a cosine-weighted set of directions round each normal that reach `reach` metres unhit."""
    gold = math.pi * (3.0 - math.sqrt(5.0))
    dirs = []
    for i in range(rays):
        r = math.sqrt((i + 0.5) / rays)
        a = i * gold
        dirs.append((r * math.cos(a), r * math.sin(a), math.sqrt(max(0.0, 1.0 - r * r))))
    dirs = _np(dirs)
    vis = np.ones(len(P))
    for k in range(len(P)):
        n = N[k]
        t = np.cross(n, (0.0, 0.0, 1.0) if abs(n[2]) < 0.9 else (1.0, 0.0, 0.0))
        t /= np.linalg.norm(t)
        b = np.cross(n, t)
        o = Vector(P[k] + n * 0.03)
        hit = 0
        for dx, dy, dz in dirs:
            d = t * dx + b * dy + n * dz
            if bvh.ray_cast(o, Vector(d), reach)[0] is not None:
                hit += 1
        vis[k] = 1.0 - hit / rays
    return vis


def guard_texels(L: np.ndarray, ratio: np.ndarray) -> np.ndarray:
    """The lilac guard for a cell's pinkest texels (meshy_cave_build.guard_texels): where such a texel would show
    red and blue both over green, the light's blue comes down to what the texel can take (and its red up to its green),
    so the light leans warm rather than lilac."""
    L = np.array(L, dtype=np.float64)
    bad = (ratio[:, 0] * L[:, 0] > L[:, 1]) & (ratio[:, 1] * L[:, 2] > L[:, 1])
    if bad.any():
        L[bad, 2] = L[bad, 1] / np.maximum(ratio[bad, 1], 1e-9)
        L[bad, 0] = np.maximum(L[bad, 0], L[bad, 1])
    return L


def guard_light(c: np.ndarray, alb: np.ndarray) -> np.ndarray:
    """No lilac or magenta and no teal cast: what the eye gets (albedo x light) keeps its green between its red and its
    blue (the cave builder's guard_display), the light changed to suit."""
    d = c * alb
    lo, hi = np.minimum(d[:, 0], d[:, 2]), np.maximum(d[:, 0], d[:, 2])
    g = np.clip(d[:, 1], lo, hi)
    c = c.copy()
    c[:, 1] = g / np.maximum(alb[:, 1], 1e-6)
    return c


# ---------------------------------------------------------------- the step


def _atlas(cells: dict, px: int, log) -> tuple:
    """The kit's one image: the cached scans, each downscaled into its cell; flat colours for the rest. Returns the
    image and each cell's mean linear albedo."""
    cache = os.path.join(HERE, ".cache", "materials")
    a = np.ones((px, px, 3), np.float32)
    means, lows, pinks = {}, {}, {}
    for name, c in cells.items():
        u0, v0, u1, v1 = c["uv"]
        i0, i1, j0, j1 = int(round(u0 * px)), int(round(u1 * px)), int(round(v0 * px)), int(round(v1 * px))
        if c.get("scan"):
            path = os.path.join(cache, c["scan"], f"{c['scan']}_diff_1k.jpg")
            img = bpy.data.images.load(path, check_existing=True)
            w, h = img.size
            p = np.empty(w * h * 4, np.float32)
            img.pixels.foreach_get(p)
            p = p.reshape(h, w, 4)[..., :3]
            fy, fx = h // (j1 - j0), w // (i1 - i0)
            p = p[:fy * (j1 - j0), :fx * (i1 - i0)].reshape(j1 - j0, fy, i1 - i0, fx, 3).mean(axis=(1, 3))
            if "saturation" in c or "gain" in c:
                # graded in linear light: toward its own grey by `saturation`, times `gain` (rock_face, a warm brown
                # scan, becomes a pale grey limestone)
                lin = np.where(p <= 0.04045, p / 12.92, ((p + 0.055) / 1.055) ** 2.4)
                Y = (lin * _np((0.2126, 0.7152, 0.0722))).sum(axis=-1, keepdims=True)
                lin = (Y + float(c.get("saturation", 1.0)) * (lin - Y)) * float(c.get("gain", 1.0))
                lin = np.clip(lin, 0.0, 1.0)
                p = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(lin, 1 / 2.4) - 0.055)
            # the scan's dark tail eased: no texel under `lift` x the cell's mean (its mortar and cracks stay darker
            # than the rest, but the ink floor below can then hold without lifting the whole surface)
            lin = np.where(p <= 0.04045, p / 12.92, ((p + 0.055) / 1.055) ** 2.4)
            m = lin.reshape(-1, 3).mean(axis=0)
            lin = np.maximum(lin, float(c.get("lift", 0.45)) * m)
            p = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(lin, 1 / 2.4) - 0.055)
            a[j0:j1, i0:i1] = p
            bpy.data.images.remove(img)
        else:
            a[j0:j1, i0:i1] = _np(srgb_hex(c["srgb"]))
        lin = np.where(a[j0:j1, i0:i1] <= 0.04045, a[j0:j1, i0:i1] / 12.92,
                       ((a[j0:j1, i0:i1] + 0.055) / 1.055) ** 2.4).reshape(-1, 3).astype(np.float64)
        means[name] = lin.mean(axis=0)
        # its darkest texels (the ink floor's reference: their mean colour at their 1st-percentile luminance) and its
        # pinkest (red over green and blue over green at the 98th percentile: the lilac guard's)
        Y = lin @ _np((0.2126, 0.7152, 0.0722))
        dark = lin[Y <= np.percentile(Y, 1.0)]
        dm = dark.mean(axis=0)
        lows[name] = dm * (np.percentile(Y, 1.0) / max(float(dm @ _np((0.2126, 0.7152, 0.0722))), 1e-9))
        g = np.maximum(lin[:, 1], 1e-6)
        pinks[name] = _np((np.percentile(lin[:, 0] / g, 98.0), np.percentile(lin[:, 2] / g, 98.0)))
    old = bpy.data.images.get(ATLAS_NAME)
    if old is not None:
        bpy.data.images.remove(old)
    img = bpy.data.images.new(ATLAS_NAME, px, px, alpha=False, float_buffer=False)
    img.colorspace_settings.name = "sRGB"
    rgba = np.ones((px, px, 4), np.float32)
    rgba[..., :3] = np.clip(a, 0.0, 1.0)
    img.pixels.foreach_set(rgba.ravel())
    img.pack()
    log("gates: atlas", {k: [round(float(v), 3) for v in m] for k, m in means.items()})
    return img, means, lows, pinks


def _material(img):
    """The rooms' unlit tree (meshy_room_build.RMat.unlit_tree): Emission of image x COLOR_0 behind the light-path
    trick, which the glTF exporter writes as KHR_materials_unlit with the texture and COLOR_0."""
    old = bpy.data.materials.get(MAT_NAME)
    if old is not None:
        bpy.data.materials.remove(old)
    mat = bpy.data.materials.new(MAT_NAME)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    N, L = nt.nodes, nt.links
    out = N.new("ShaderNodeOutputMaterial")
    em = N.new("ShaderNodeEmission")
    em.inputs["Strength"].default_value = 1.0
    lp = N.new("ShaderNodeLightPath")
    mix = N.new("ShaderNodeMixShader")
    L.new(lp.outputs["Is Camera Ray"], mix.inputs[0])
    L.new(N.new("ShaderNodeBsdfTransparent").outputs[0], mix.inputs[1])
    L.new(em.outputs[0], mix.inputs[2])
    ti = N.new("ShaderNodeTexImage")
    ti.image = img
    ti.interpolation = "Linear"
    vc = N.new("ShaderNodeVertexColor")
    vc.layer_name = ATTR
    mul = N.new("ShaderNodeMix")
    mul.data_type, mul.blend_type = "RGBA", "MULTIPLY"
    mul.inputs[0].default_value = 1.0
    L.new(ti.outputs["Color"], mul.inputs[6])
    L.new(vc.outputs["Color"], mul.inputs[7])
    L.new(mul.outputs[2], em.inputs["Color"])
    L.new(mix.outputs[0], out.inputs["Surface"])
    mat.use_backface_culling = False
    return mat


def _mesh_bvh(objs) -> "BVHTree":
    verts, polys, n = [], [], 0
    for o in objs:
        me = o.data
        M = o.matrix_world
        co = np.empty(len(me.vertices) * 3)
        me.vertices.foreach_get("co", co)
        co = co.reshape(-1, 3)
        if not _is_identity(M):
            Mn = np.array(M)
            co = co @ Mn[:3, :3].T + Mn[:3, 3]
        verts.append(co)
        polys.extend(tuple(n + i for i in p.vertices) for p in me.polygons)
        n += len(co)
    if not verts:
        return None
    return BVHTree.FromPolygons(np.concatenate(verts).tolist(), polys)


def _is_identity(M) -> bool:
    return all(abs(M[i][j] - (1.0 if i == j else 0.0)) < 1e-9 for i in range(4) for j in range(4))


def _ground_fn(bvh):
    def ground(x, y):
        h = bvh.ray_cast(Vector((x, y, 200.0)), Vector((0.0, 0.0, -1.0)), 400.0)
        return float(h[0].z) if h[0] is not None else 0.0
    return ground


def _region_objs(names_prefix: tuple, box: tuple, pad: float = 2.0) -> list:
    out = []
    for o in bpy.context.scene.objects:
        if o.type != "MESH" or not o.name.startswith(names_prefix):
            continue
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
        if (min(v.x for v in bb) - pad <= box[2] and max(v.x for v in bb) + pad >= box[0]
                and min(v.y for v in bb) - pad <= box[3] and max(v.y for v in bb) + pad >= box[1]):
            out.append(o)
    return out


def lower_render_ground(row: dict, log) -> dict:
    """The render ground's vertices inside the channel go down to its floor (min), its overlays (paths, snow) to the
    floor plus their own lift over the ground; their normals there are set to the floor's."""
    c = row["clip_m"]
    out = {}
    floor_n = {}
    pts = row["points_m"]
    for (x0, y0, z0), (x1, y1, z1) in zip(pts, pts[1:]):
        L = math.hypot(x1 - x0, y1 - y0)
        s = (z1 - z0) / L if L else 0.0
        n = _np((-(x1 - x0) / L * s, -(y1 - y0) / L * s, 1.0))
        floor_n[(x0, x1)] = n / np.linalg.norm(n)
    for o in _region_objs(("HM_Ground",), (c[0], c[1], c[2], c[3]), pad=0.0):
        me = o.data
        if not _is_identity(o.matrix_world):
            continue
        co = np.empty(len(me.vertices) * 3)
        me.vertices.foreach_get("co", co)
        co = co.reshape(-1, 3)
        lift = 0.015 if ("Path" in o.name or "Snow" in o.name) else 0.0
        moved = []
        for i in np.nonzero((co[:, 0] >= c[0] - 1e-6) & (co[:, 0] <= c[2] + 1e-6) & (co[:, 1] >= c[1] - 1e-6)
                            & (co[:, 1] <= c[3] + 1e-6))[0]:
            f = channel_floor(row, float(co[i, 0]), float(co[i, 1]))
            if f is not None and co[i, 2] > f + lift + 1e-6:
                co[i, 2] = f + lift
                moved.append(int(i))
        if not moved:
            continue
        # the normals of the corners at the moved vertices: the floor's (the custom normals kept elsewhere)
        normals = np.empty(len(me.loops) * 3)
        me.corner_normals.foreach_get("vector", normals)
        normals = normals.reshape(-1, 3)
        lv = np.empty(len(me.loops), np.int64)
        me.loops.foreach_get("vertex_index", lv)
        mv = np.zeros(len(me.vertices), bool)
        mv[moved] = True
        for li in np.nonzero(mv[lv])[0]:
            x = co[lv[li], 0]
            n = next((nn for (x0, x1), nn in floor_n.items() if min(x0, x1) - 1e-6 <= x <= max(x0, x1) + 1e-6),
                     _np((0, 0, 1)))
            normals[li] = n
        me.vertices.foreach_set("co", co.ravel())
        me.normals_split_custom_set([tuple(v) for v in normals])
        me.update()
        out[o.name] = len(moved)
    log("gates: render ground lowered", out)
    return out


def collision_patch(coll, row: dict, kit: Kit, g: dict, log) -> dict:
    """Inside the row's collision_patch_m (on the collision's own 1 m grid) the collision's faces are taken out and a
    heightfield put in: the original ground outside the walls (bilinear in the 1 m grid, so its edges meet the faces
    left round it), the walls' coping and parapets, the cutting's floor between the walls, the headwall's top over
    its piers, the floor through its opening up to the grille; and the masonry over the opening as a box."""
    x0, y0, x1, y1 = row["collision_patch_m"]
    bm = bmesh.new()
    bm.from_mesh(coll.data)
    bm.verts.ensure_lookup_table()
    grid = {}
    for v in bm.verts:
        if x0 - 1e-4 <= v.co.x <= x1 + 1e-4 and y0 - 1e-4 <= v.co.y <= y1 + 1e-4:
            key = (round(v.co.x, 3), round(v.co.y, 3))
            grid.setdefault(key, v.co.z)
    gone = [f for f in bm.faces if all(x0 - 1e-4 <= v.co.x <= x1 + 1e-4 and y0 - 1e-4 <= v.co.y <= y1 + 1e-4
                                       for v in f.verts)]
    n_gone = sum(len(f.verts) - 2 for f in gone)
    bmesh.ops.delete(bm, geom=gone, context="FACES_ONLY")

    def orig(x, y):
        xa, ya = math.floor(x), math.floor(y)
        xb, yb = min(xa + 1, x1), min(ya + 1, y1)
        tx, ty = x - xa, y - ya
        z = [grid.get((round(a, 3), round(b, 3))) for a, b in ((xa, ya), (xb, ya), (xa, yb), (xb, yb))]
        if any(v is None for v in z):
            zz = [v for v in z if v is not None]
            return sum(zz) / len(zz) if zz else 0.0
        return (z[0] * (1 - tx) * (1 - ty) + z[1] * tx * (1 - ty) + z[2] * (1 - tx) * ty + z[3] * tx * ty)

    k = g["kit"]
    wf, wt, pt, ph, pfrom = k["wall_face"], k["wall_thick"], k["parapet_thick"], k["parapet_h"], k["parapet_from_m"]
    hy0, hy1 = k["headwall"]
    mo, sp, lz = k["opening_masonry"], k["set_post"], k["lintel_z"]
    oz = kit.O[2]

    htop = oz + kit.adit_htop

    def height(x, y):
        lx, ly = to_local(g, x, y)
        o = orig(x, y)
        f = channel_floor(row, x, y)
        ax = abs(lx)
        if ly >= hy0 - 1e-6 and ax < wf + wt - 1e-6:  # the headwall (to the patch's end)
            if ax < mo - sp - 1e-6:
                return f if f is not None else o      # the opening's floor, to the grille at the patch's edge
            return htop + (ph if ly < hy0 + pt else 0.0)
        if f is None or ax >= wf + wt - 1e-6:
            return o
        if ax < wf - 1e-6:
            return min(o, f)                          # the floor between the walls
        top = max(o, f) + 0.05
        return top + (ph if (top - f) > pfrom and ax < wf + pt else 0.0)

    lx_lines = [0.0, wf - 0.01, wf + 0.01, wf + pt - 0.01, wf + pt + 0.01, wf + wt - 0.01, wf + wt + 0.01,
                mo - sp - 0.01, mo - sp + 0.01]
    ys = set()
    for lxl in lx_lines:
        for s in (-1, 1):
            ys.add(round(to_world(g, s * lxl, 0.0, 0.0)[1], 4))
    ys |= {round(y0 + 0.5 * i, 4) for i in range(int(round((y1 - y0) / 0.5)) + 1)}
    ys = sorted(v for v in ys if y0 - 1e-6 <= v <= y1 + 1e-6)
    xs = set(round(x0 + 0.25 * i, 4) for i in range(int(round((x1 - x0) / 0.25)) + 1))
    for lyl in (hy0 - 0.01, hy0 + 0.01, hy0 + pt - 0.01, hy0 + pt + 0.01):
        xs.add(round(to_world(g, 0.0, lyl, 0.0)[0], 4))
    xs.add(round(x1 - 0.02, 4))
    xs = sorted(v for v in xs if x0 - 1e-6 <= v <= x1 + 1e-6)
    H = [[height(x, y) for y in ys] for x in xs]
    # the patch's edge meets the faces round it: on the edge the original ground exactly
    for i, x in enumerate(xs):
        for j, y in enumerate(ys):
            if (abs(x - x0) < 1e-6 or abs(x - x1) < 1e-6 or abs(y - y0) < 1e-6 or abs(y - y1) < 1e-6):
                lx, ly = to_local(g, x, y)
                if not (abs(x - x1) < 1e-6 and abs(lx) < mo - sp and ly >= hy0):
                    H[i][j] = orig(x, y)
    vid = {}
    for i, x in enumerate(xs):
        for j, y in enumerate(ys):
            vid[(i, j)] = bm.verts.new((x, y, H[i][j]))
    added = 0
    for i in range(len(xs) - 1):
        for j in range(len(ys) - 1):
            a, b, c_, d = vid[(i, j)], vid[(i + 1, j)], vid[(i + 1, j + 1)], vid[(i, j + 1)]
            bm.faces.new((a, b, c_))
            bm.faces.new((a, c_, d))
            added += 2
    # the opening's back face at the grille (the patch's edge rises there from the floor to the ground beyond)
    # and the masonry over the opening, a closed box from the lintel up
    lo = to_world(g, -(mo - sp), hy0, lz)
    hi = to_world(g, (mo - sp), 0.0, 0.0)
    xa, xb = sorted((lo[0], hi[0]))
    yb_ = sorted((lo[1], hi[1]))
    added += _bm_box(bm, (xa, yb_[0], oz + lz), (x1, yb_[1], htop))
    xp_ = to_world(g, 0.0, hy0 + pt, 0.0)[0]
    added += _bm_box(bm, (xa, yb_[0], htop), (max(xa, xp_), yb_[1], htop + ph))
    # the grille: a wall across the opening at the patch's edge, from the floor to the ground
    gy = sorted((to_world(g, -(mo - sp), 0.0, 0.0)[1], to_world(g, (mo - sp), 0.0, 0.0)[1]))
    added += _bm_box(bm, (x1 - 0.02, gy[0], oz - 0.3), (x1 + 0.1, gy[1], oz + lz + 0.3))
    bm.to_mesh(coll.data)
    bm.free()
    coll.data.update()
    log(f"gates: collision patch {row['key']}: {n_gone} triangles out, {added} in")
    return dict(removed_tris=n_gone, added_tris=added, patch_m=row["collision_patch_m"],
                floor_clear_m=round(2 * wf, 2), sets_clear_m=round(2 * (mo - sp), 2))


def _bm_box(bm, lo, hi) -> int:
    x0, y0, z0 = lo
    x1, y1, z1 = hi
    v = [bm.verts.new(p) for p in ((x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                                   (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1))]
    for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
        bm.faces.new([v[i] for i in f])
    return 12


def add_gates(X, path: str, env: dict) -> dict:
    """The step: every gate of `path` into the village of the export X (see the module's docstring). `env` is the
    exporter's namespace (its log)."""
    log = env.get("log", print)
    D = load_gates(path)
    root = X.roots.get("village") or bpy.data.objects.get("Area_village")
    if root is None:
        raise RuntimeError("gates: no Area_village in the scene")
    coll = bpy.data.objects.get("HM_Collision")
    if coll is None:
        raise RuntimeError("gates: no HM_Collision in the scene")
    exposure = float(root.get("wdi_exposure", 2.378414230005442))
    with open(os.path.join(HERE, "meshy_looks", "final.json"), encoding="utf-8") as fh:
        final = json.load(fh)
    Lk = look_light(final)
    lk = D["look"]
    import meshy_room_build as R  # three r186's AgX and the ink level (no Blender state is touched)
    ink_lin = R.ink_level() / exposure * float(D["look"].get("ink_margin", 1.0))
    lamp_col = _np([srgb_to_linear(c) for c in srgb_hex(lk["lamp_color_srgb"])])
    flame = lamp_col * float(lk["flame"])
    terrain = {t["key"]: t for t in D.get("terrain", [])}
    rep = dict(file=os.path.relpath(path, HERE).replace("\\", "/"), exposure=exposure, ink_linear=round(ink_lin, 6),
               gates=[], terrain={})
    coll_bvh0 = _mesh_bvh([coll])
    target = root.users_collection[0] if root.users_collection else bpy.context.scene.collection
    # the render ground round each gate as it is today (the walls' tops follow it), then the terrain edits, so the
    # kits' light and the spawns see the ground as it will be
    grounds = {}
    for g in D["gates"]:
        ox, oy, _ = frame(g)[0]
        rg = _mesh_bvh(_region_objs(("HM_Ground",), (ox - 12, oy - 12, ox + 12, oy + 12)))
        grounds[g["id"]] = _ground_fn(rg if rg is not None else coll_bvh0)
    for t in D.get("terrain", []):
        rep["terrain"][t["key"]] = dict(render=lower_render_ground(t, log), slope_deg=round(channel_slope_deg(t), 2))
    img, means, lows, pinks = _atlas(D["atlas"]["cells"], int(D["atlas"]["px"]), log)
    mat = _material(img)
    kits = []
    for g in D["gates"]:
        kit = Kit(g, D["atlas"]["cells"])
        kit.flame = tuple(float(v) for v in flame)
        kit.px = int(D["atlas"]["px"])
        ground = grounds[g["id"]]
        info = dict(id=g["id"], type=g["type"])
        if g["type"] == "notch":
            build_notch(kit, g, ground)
        elif g["type"] == "slot":
            build_slot(kit, g, ground)
        elif g["type"] == "arch":
            build_arch(kit, g, ground)
        elif g["type"] == "adit":
            row = terrain[g["kit"]["cutting"]]
            info["cutting"] = build_adit(kit, g, ground, row, coll_bvh0)
            info["collision_patch"] = collision_patch(coll, row, kit, g, log)
        kits.append((g, kit, info))
    # the kits' collision: boxes in their frames, into HM_Collision
    bm = bmesh.new()
    bm.from_mesh(coll.data)
    for g, kit, info in kits:
        n = 0
        for lo, hi in kit.coll_boxes:
            c = [kit.w(_np((x, y, z))) for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])]
            v = [bm.verts.new(tuple(p)) for p in c]
            for f in ((0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)):
                bm.faces.new([v[i] for i in f])
            n += 12
        info["collision_tris"] = n + info.get("collision_patch", {}).get("added_tris", 0)
    bm.to_mesh(coll.data)
    bm.free()
    coll.data.update()
    # the light: the village's kept lights near, the moon and sky, the sky's occlusion by the collision and the kits
    kept = [o for o in bpy.context.scene.objects if o.type == "LIGHT" and o.data.type in ("POINT", "SPOT")]
    occ_objs = [coll]
    tmp = []
    for g, kit, info in kits:
        P = np.concatenate(kit.P)
        me = bpy.data.meshes.new(f"HM_Gate_{g['id']}_occ")
        me.from_pydata(P.tolist(), [], kit.faces())
        o = bpy.data.objects.new(me.name, me)
        tmp.append(o)
    occ = _mesh_bvh(occ_objs + tmp)
    for o in tmp:
        me = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.meshes.remove(me)
    merged = []
    for g, kit, info in kits:
        P = np.concatenate(kit.P)
        N = np.concatenate(kit.N)
        T = np.concatenate(kit.T)
        UV = np.concatenate(kit.UV)
        cells_q = [_cell_of(kit, i) for i in range(len(kit.P))]
        cell_alb = np.concatenate([np.repeat(means[c][None, :], len(p), axis=0) for c, p in zip(cells_q, kit.P)])
        cell_low = np.concatenate([np.repeat(lows[c][None, :], len(p), axis=0) for c, p in zip(cells_q, kit.P)])
        cell_pink = np.concatenate([np.repeat(pinks[c][None, :], len(p), axis=0) for c, p in zip(cells_q, kit.P)])
        lights = []
        for o in kept:
            p = _np(o.matrix_world.translation)
            if np.linalg.norm(p - kit.O) <= float(lk["lights_reach_m"]):
                lights.append(dict(p=p, I=float(o.data.energy) / (4.0 * math.pi), col=_np(o.data.color[:3])))
        lamp = dict(p=_np(kit.lamp_world), I=float(lk["lamp_W"]) / (4.0 * math.pi), col=lamp_col,
                    range=float(lk["lamp_range_m"]), near=float(lk["lamp_near_m"]))
        vis = sky_visibility(P, N, occ, int(lk["ao_rays"]), float(lk["ao_reach_m"]))
        ao = float(lk["ao_floor"]) + (1.0 - float(lk["ao_floor"])) * vis
        C = light_at(P, N, Lk, lights + [lamp], ao) * T
        # the ink floor on the cell's darkest texels, then the lilac guards (the mean surface and the pinkest texels)
        C = np.maximum(C, ink_lin / np.maximum(cell_low, 1e-4))
        C = guard_light(C, cell_alb)
        C = guard_texels(C, cell_pink)
        offs = np.cumsum([0] + [len(p) for p in kit.P])
        for qi, kd in enumerate(kit.K):
            sl = slice(int(offs[qi]), int(offs[qi + 1]))
            if kd == "glass":
                C[sl] = kit.E[qi]
            elif kd == "panel":
                # the dark rock behind the grille: the lamp's light on a dark albedo over the ink, a hair of sky
                lp = light_at(P[sl], N[sl], Lk, [lamp], ao[sl] * 0.15) * float(lk["panel_albedo"])
                C[sl] = np.maximum(lp, ink_lin) * _np((1.0, 1.0, 1.0))
        C = np.clip(C, 0.0, 1.0)
        merged.append((P, kit.faces(), UV, C))
        disp = R.agx(C * cell_low, exposure)       # the darkest texels: the ink floor's test
        lum = R.lum(disp)
        disp_m = R.agx(C * cell_alb, exposure)     # the mean texels: the lilac test and the brightest
        ink_l = float(R.lum(np.array(INK, float) / 255.0))
        info.update(node=KIT_NODE, tris=kit.tris(), budget_tris=int(g["budget_tris"]), vertices=len(P),
                    lamp=[round(float(v), 3) for v in kit.lamp_world],
                    vertex_display=dict(dark_texel_under_ink=int((lum < ink_l - 1e-4).sum()),
                                        lilac=int(((disp_m[:, 1] + 0.004 < disp_m[:, 0])
                                                   & (disp_m[:, 1] + 0.004 < disp_m[:, 2])).sum()),
                                        brightest=[round(float(v), 3) for v in disp_m.max(axis=0)]),
                    lights_used=len(lights))
    # one node for every gate's piece: one draw call in the single village file (the village was at 247 of its 248)
    verts, faces, uvs, cols, n = [], [], [], [], 0
    for P, F, UV, C in merged:
        verts.append(P)
        faces.extend(tuple(n + i for i in f) for f in F)
        uvs.append(UV)
        cols.append(C)
        n += len(P)
    P, UV, C = np.concatenate(verts), np.concatenate(uvs), np.concatenate(cols)
    me = bpy.data.meshes.new(KIT_NODE)
    me.from_pydata(P.tolist(), [], faces)
    uvl = me.uv_layers.new(name="UVMap")
    uvl.data.foreach_set("uv", UV.astype(np.float32).ravel())
    attr = me.color_attributes.new(name=ATTR, type="FLOAT_COLOR", domain="POINT")
    rgba = np.ones((len(P), 4), np.float32)
    rgba[:, :3] = C
    attr.data.foreach_set("color", rgba.ravel())
    me.color_attributes.active_color = attr
    me.materials.append(mat)
    me.update()
    ob = bpy.data.objects.new(KIT_NODE, me)
    target.objects.link(ob)
    ob.parent = root
    ob["wdi_gate"] = ",".join(g["id"] for g in D["gates"])
    ob["wdi_cast_shadow"] = False
    ob["wdi_note"] = "unlit: lit per vertex by the viewer's light model and each gate's lamp (meshy_gates.py)"
    X.cat[ob.name] = "gate"
    # the texture memory under the exporter's budget again, by its own rule (fit_textures), with the atlas in
    if env.get("fit") is not None:
        rep["tex_fit"] = env["fit"]()
    # the portals and the arrivals, on the ground as the collision now has it
    cb = _mesh_bvh([coll])
    portals_all = [o for o in bpy.context.scene.objects if o.name.startswith("Portal_")]
    ns, scene = D["portal_ns"], D["scene"]
    for g, kit, info in kits:
        gid = g["id"]
        px, py = g["portal"]["xy"]
        zp = _stand(cb, px, py, kit.O[2])
        pe = bpy.data.objects.new(g["portal"]["node"], None)
        target.objects.link(pe)
        pe.empty_display_type = "CIRCLE"
        pe.empty_display_size = 1.0
        pe.location = (px, py, zp)
        pe.parent = root
        pe["to"], pe["toSpawn"], pe["kind"] = scene, f"mouth_{gid}", "cave_mouth"
        pe["wdi_portal_id"] = f"{ns}.{gid}_in"
        pe["wdi_scene"] = "overworld"
        pe["wdi_area"] = "village"
        pe["wdi_gate"] = gid
        pe["wdi_cave_area"] = g["cave_area"]
        X.cat[pe.name] = "portal"
        ax, ay = g["arrival"]["xy"]
        th = float(g["arrival"]["facing_deg"])
        za = _stand(cb, ax, ay, kit.O[2]) + 0.05
        se = bpy.data.objects.new(g["arrival"]["node"], None)
        target.objects.link(se)
        se.empty_display_type = "SINGLE_ARROW"
        se.empty_display_size = 0.5
        se.location = (ax, ay, za)
        se.rotation_mode = "XYZ"
        se.rotation_euler = (0.0, 0.0, facing_euler_z(th))
        se.parent = root
        se["wdi_spawn"] = g["arrival"]["label"]
        se["wdi_district"] = g["district"]
        se["wdi_facing_deg"] = th
        se["wdi_facing_note"] = "degrees counter-clockwise from east (Blender +X) in the ground plane; glTF -Z of the node"
        se["wdi_scene"] = "overworld"
        se["wdi_core"] = False
        se["wdi_area"] = "village"
        se["wdi_gate"] = gid
        X.cat[se.name] = "spawn"
        portals_all.append(pe)
        info["portal"] = dict(node=pe.name, at=[round(px, 3), round(py, 3), round(zp, 3)], to=scene,
                              toSpawn=f"mouth_{gid}", target=f"Spawn_{scene}_mouth_{gid}", cave_area=g["cave_area"])
        info["arrival"] = dict(node=se.name, at=[round(ax, 3), round(ay, 3), round(za, 3)], facing_deg=th)
        X.portals.append(dict(name=pe.name, id=f"{ns}.{gid}_in", to=scene, toSpawn=f"mouth_{gid}", kind="cave_mouth",
                              area="village", local=info["portal"]["at"], gate=gid))
        X.spawns.append(dict(name=se.name, area="village", district=g["district"], core=False, facing_deg=th,
                             local=info["arrival"]["at"], scene="overworld", label=g["arrival"]["label"], gate=gid))
    # the arrivals against every portal of the file, and the ground under each
    for g, kit, info in kits:
        a = info["arrival"]["at"]
        near = min(((math.hypot(a[0] - p.location.x, a[1] - p.location.y), p.name) for p in portals_all
                    if abs(a[2] - p.location.z) <= 2.0 and p.parent is not None), default=(1e9, None))
        info["arrival"]["nearest_portal"] = dict(node=near[1], m=round(near[0], 2))
        info["arrival"]["clear_of_portals"] = near[0] > PORTAL_SPAWN_M
        info["arrival"]["open_dirs"] = _open_dirs(cb, a)
        for k in ("portal", "arrival"):
            p = info[k]["at"]
            h = cb.ray_cast(Vector((p[0], p[1], p[2] + 1.0)), Vector((0, 0, -1)), 1.3)
            info[k]["on_ground"] = h[0] is not None
        if not info["arrival"]["clear_of_portals"]:
            X.notes.append(f"WARNING gate {g['id']}: {info['arrival']['node']} stands {near[0]:.2f} m from {near[1]}")
        rep["gates"].append(info)
        log("gates:", g["id"], {k: info[k] for k in ("tris", "budget_tris", "collision_tris", "vertex_display")})
    X.collision = dict(X.collision or {})
    X.collision["tris_with_gates"] = sum(len(p.vertices) - 2 for p in coll.data.polygons)
    rep["triangles"] = sum(i["tris"] for i in rep["gates"])
    rep["atlas"] = dict(name=ATLAS_NAME, px=int(D["atlas"]["px"]),
                        cell_albedo={k: [round(float(v), 4) for v in m] for k, m in means.items()})
    X.notes.append(f"gates: {len(kits)} from {rep['file']} ({rep['triangles']} triangles)")
    return rep


def _cell_of(kit: Kit, qi: int) -> str:
    """The cell a quad's UV lies in (its first corner's)."""
    u, v = kit.UV[qi][0]
    for name, c in kit.cells.items():
        u0, v0, u1, v1 = c["uv"]
        if u0 <= u <= u1 and v0 <= v <= v1:
            return name
    return "white"


def _stand(bvh, x: float, y: float, z_hint: float) -> float:
    h = bvh.ray_cast(Vector((x, y, z_hint + 1.5)), Vector((0, 0, -1)), 8.0)
    return float(h[0].z) if h[0] is not None else z_hint


def _open_dirs(bvh, at) -> int:
    """Of eight directions at 0.5 m and 1.2 m over a spawn, how many are open for 0.6 m (the capsule and a step)."""
    n = 0
    for k in range(8):
        a = k * math.pi / 4
        d = Vector((math.cos(a), math.sin(a), 0.0))
        ok = all(bvh.ray_cast(Vector((at[0], at[1], at[2] + h)), d, 0.6)[0] is None for h in (0.5, 1.2))
        n += ok
    return n


def write_journey(path: str, log=print) -> None:
    """The walker's file for a journey with the viewer's own controller: HM_Collision and the Area_village root with
    its spawns and portals, without Draco (the cave builder's `<area>_journey.glb` likewise)."""
    sc = bpy.context.scene
    keep = []
    root = bpy.data.objects.get("Area_village")
    for o in sc.objects:
        o.select_set(False)
    for o in [root, bpy.data.objects.get("HM_Collision")] + [c for c in root.children_recursive
                                                              if c.name.startswith(("Spawn_", "Portal_"))]:
        if o is not None:
            o.select_set(True)
            keep.append(o)
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(path), export_format="GLB", use_selection=True,
                              export_extras=True, export_yup=True, export_apply=False, export_animations=False,
                              export_cameras=False, export_lights=False, export_materials="NONE")
    for o in keep:
        o.select_set(False)
    log("gates: journey file", path, os.path.getsize(path))
