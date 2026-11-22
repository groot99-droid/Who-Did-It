#!/usr/bin/env python3
"""The cave network's geometry core: plain Python with numpy, no Blender.

One signed field for the whole network (positive is air) is evaluated on one shared 0.125 m lattice in the village
frame (x east, y north, z up, below the ground) and meshed by marching cubes in sparse 32-cell blocks. A section is
a union of lattice boxes; two neighbouring sections overlap by one cell at a seam and mesh it identically, because
the field there is the same numbers in both runs. The core also builds the collision (the same field at 0.25 m,
decimated on planes, plus proxies), 12 m chunks, cube-projected UVs, per-vertex tint attributes, a first set of
procedural formations, the traversal zones (`Trav_<id>`: crawl, sidle, climb) the viewer reads, and a walk flood with
the viewer's own bodies (walk, crawl, sidle and climb, after apps/walk/src/physics/controller.ts).

Usage (from tools/blender):
  python meshy_cave_core.py validate meshy_caves/example_section.json
  python meshy_cave_core.py build meshy_caves/example_section.json --out build/caves

`build` writes <out>/<key>.core.npz, <out>/<key>_plan.png and <out>/<key>_report.json. Geometry is repeatable: the
noise is integer hashing, no sin, exp or log enters a geometry path, positions are rounded to 1e-5 m, and the
report's `geometry_md5` is the same on every run. The input format is in meshy_caves/README.md and
meshy_caves/schema/cave.schema.json.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import struct
import sys
import time
import zlib

import numpy as np

import meshy_cave_rock as rock

CORE_VERSION = 1
HERE = os.path.dirname(os.path.abspath(__file__))
SCHEMA_PATH = os.path.join(HERE, "meshy_caves", "schema", "cave.schema.json")
SECTION_FORMAT = "cave-section/1"
NETWORK_FORMAT = "cave-network/1"

Q = 100000  # positions are rounded to 1e-5 m (integer units of 1e-5 m)
BLOCK_DEFAULT = 32
MAX_INDEX = 1 << 20  # lattice indices per axis (edge ids pack three of them into an int64)

# ---------------------------------------------------------------- the walker (apps/walk/src/config.ts)

STEP = 0.35  # WALK.stepHeight: the capsule floats this far above the feet
SNAP = 0.35  # WALK.snapDown
STAND_ROOM = 1.8  # CRAWL.standRoom
END_MARGIN = 0.3  # TRAVERSE.endMargin
EDGE = 0.01  # TRAVERSE.edge
CLIMB_REACH = 0.6
CLIMB_FOOT_BAND = 0.5
CLIMB_CATCH = 0.5
CLIMB_HOLD = 0.35
MANTLE_REACH = 0.8
LEDGE_DROP = 1.0
PORTAL_R = 0.6  # a portal counts as reached by feet this close in plan (and within 1 m in height)
PERCH = 1.0  # feet this high on a wall's foot (a ray resting on the fillet) still stand on the passage's floor

# The bodies the flood moves, as controller.ts sizes them: radius, top of the capsule above the feet. The crawling
# radius is controller.ts's min(radius, (CRAWL.bodyHeight - stepHeight) / 2) = 0.275 m. "thin" is controller.ts's
# narrow crawl: a crawler whose feet are also in a sidle zone (a crawl opening straight into a fissure, or crossing
# one) crawls with the sidling radius, min(SIDLE.radius, 0.275) = 0.18 m, and stands up from it into the sidle.
BODY = {
    "walk": (0.30, 1.75),
    "crawl": (min(0.30, (0.9 - STEP) / 2), 0.90),
    "sidle": (0.18, 1.75),
    "thin": (min(0.18, (0.9 - STEP) / 2), 0.90),
}
MODES = ("walk", "crawl", "sidle", "thin")  # walking states come first in the id space
CRAWLING = ("crawl", "thin")

# Clear cores and profile limits (the owner's traversal ruling of 2026-11-19).
WALK_PROFILES = ("tube", "canyon", "keyhole", "rift", "drift")
PROFILES = WALK_PROFILES + ("crawl", "fissure", "shaft", "climb_face")
CHAMBER_KINDS = ("hall", "dome", "breakdown", "lake", "pocket", "stope")
CORE = {"walk": (0.8, 2.1), "crawl": (0.8, 1.0), "fissure": (0.42, 1.9)}
CRAWL_CLEAR = (1.0, 1.3)
FISSURE_WIDTH = (0.42, 0.55)
FISSURE_BEND = 60.0  # degrees a fissure may turn at one bend: the viewer's sidler slides round it at half its speed
FISSURE_MIN_H = 1.9
WALK_ROUND = 1.0  # metres a walking route must get into a bent crawl or fissure, past a segment, to walk round it
CLIMB_HEIGHT = (1.0, 15.0)
CLIMB_LEDGE_MIN = 1.0
CLIMB_MAX_BATTER = 0.1405  # tan(8 deg): the face stays above 82 degrees
RAMP_WARN, RAMP_HARD_WARN, RAMP_MAX = 0.364, 0.466, 0.577  # tan 20, 25, 30 degrees
NOISE_CAP = {"crawl": 0.08, "fissure": 0.03, "climb_face": 0.0, "shaft": 0.2}
# A tube's lower wall meets its floor at least this steeply (tan 75 degrees). The viewer has no slope limit, and its
# ground rays (0.21 m out, finding ground up to 0.35 m above the feet) walk it up a curved wall of 55 to 62 degrees
# (the flood showed it in the Great Gallery's 14 m trunk, up to 1.4 m above the floor), so the old shape, an ellipse
# centred 0.4 of the height above the floor, let a walker climb the bowl of any tube lower than about 2.8 times its
# width. A tube keeps its width and height but its ellipse's centre comes down towards the floor until the wall meets
# the floor this steeply; above the floor the wall only steepens (vertical at the centre's height), so no part of
# the lower wall is walkable. The look is a phreatic tube with its foot buried in fill.
TUBE_FLOOR_SLOPE = 3.7321

CHUNK_CELLS = 96  # 12 m chunks of 0.125 m cells, each overlapping the next by one cell
COLLISION_TARGET, COLLISION_CEILING = 60000, 150000
INFLUENCE = 2.0  # metres added to a primitive's box beyond its noise and blend: outside it, it changes nothing
STUB_CLIP = 0.25  # metres past the seam window where a stub's rock closes (its box is the window plus 0.5 m)
ACTIVE_BAND = 2.0  # a block is meshed when a 1 m sample lies within this of the surface
VBAND = 0.25  # the flood keeps the collision field's node values within this of the surface, for its walls
RIM_RAYS = 24  # points round the body's rim where the flood reads the wall between lattice columns
RIM_SHIFT = 7  # a state's body may stand anywhere in its column's cell: tried on a 7 x 7 grid of positions

DEFAULT_GEOLOGY = {"tint": "#9A958A", "repeat_m": 1.5, "noise": 0.12, "bedding": [0.6, 0.04]}

# ---------------------------------------------------------------- small helpers


MAX_NUMBER = 1e6  # no length, height or coordinate in a cave is anywhere near this


def load_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def smin(a, b, k):
    """Smooth minimum (polynomial, no exp): equal to min(a, b) once they differ by k or more."""
    if k <= 0:
        return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return a * h + b * (1.0 - h) - k * h * (1.0 - h)


def hex_rgb(s):
    s = s.lstrip("#")
    c = [int(s[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]  # sRGB to linear (not geometry)


def unit2(v):
    x, y = float(v[0]), float(v[1])
    n = math.sqrt(x * x + y * y)
    if n <= 1e-12:
        raise ValueError("zero-length direction")
    return x / n, y / n


M64 = (1 << 64) - 1


class Rng:
    """splitmix64 on Python integers: the same numbers on every platform and in Blender's Python."""

    def __init__(self, *keys):
        s = 0x9E3779B97F4A7C15
        for k in keys:
            v = k if isinstance(k, int) else zlib.crc32(str(k).encode("utf-8"))
            s = self._mix((s ^ (v & M64)) & M64)
        self.s = s

    @staticmethod
    def _mix(z):
        z = ((z ^ (z >> 30)) * 0xBF58476D1CE4E5B9) & M64
        z = ((z ^ (z >> 27)) * 0x94D049BB133111EB) & M64
        return z ^ (z >> 31)

    def next(self):
        self.s = (self.s + 0x9E3779B97F4A7C15) & M64
        return self._mix(self.s)

    def uniform(self, a=0.0, b=1.0):
        return a + (b - a) * ((self.next() >> 11) * (2.0 ** -53))

    def turn(self):
        """A rotation (c, s) with no trig: the rational parametrisation of the circle, t in [-1, 1]."""
        t = self.uniform(-1.0, 1.0)
        d = 1.0 + t * t
        return (1.0 - t * t) / d, 2.0 * t / d


# ---------------------------------------------------------------- noise: integer hashing, trilinear, smoothstep

_P1, _P2, _P3 = np.uint64(0x9E3779B97F4A7C15), np.uint64(0xC2B2AE3D27D4EB4F), np.uint64(0x165667B19E3779F9)
_M1, _M2 = np.uint64(0xBF58476D1CE4E5B9), np.uint64(0x94D049BB133111EB)
NOISE_LUMP, NOISE_BIG = 4, 16  # lattice cells per noise cell: 0.5 m lumps, 2 m swells


def _hash3(i, j, k, seed):
    with np.errstate(over="ignore"):
        h = (np.asarray(i, np.int64).astype(np.uint64) * _P1) ^ (np.asarray(j, np.int64).astype(np.uint64) * _P2)
        h = h ^ (np.asarray(k, np.int64).astype(np.uint64) * _P3) ^ np.uint64(seed & M64)
        h = h ^ (h >> np.uint64(30))
        h = h * _M1
        h = h ^ (h >> np.uint64(27))
        h = h * _M2
        h = h ^ (h >> np.uint64(31))
    return (h >> np.uint64(11)).astype(np.float64) * (2.0 ** -52) - 1.0


def _smooth(t):
    return t * t * (3.0 - 2.0 * t)


def noise_block(g0, n, s, seed):
    """Value noise at the nodes g0 + (0..n-1) of the lattice, cell size s lattice cells, as an (n, n, n) [z, y, x]
    array. Each node's value depends on its own index only, so a node shared by two blocks gets the same number."""
    ax = []
    for a in range(3):
        g = int(g0[a]) + np.arange(n, dtype=np.int64)
        i = g // s
        ax.append((i, _smooth((g - i * s).astype(np.float64) / s)))
    (ix, tx), (iy, ty), (iz, tz) = ax
    lo = (int(ix.min()), int(iy.min()), int(iz.min()))
    K, J, I = np.meshgrid(np.arange(lo[2], int(iz.max()) + 2), np.arange(lo[1], int(iy.max()) + 2),
                          np.arange(lo[0], int(ix.max()) + 2), indexing="ij")
    H = _hash3(I, J, K, seed)
    a = ix - lo[0]
    hx = H[:, :, a] * (1.0 - tx) + H[:, :, a + 1] * tx
    b = iy - lo[1]
    hy = hx[:, b, :] * (1.0 - ty)[None, :, None] + hx[:, b + 1, :] * ty[None, :, None]
    c = iz - lo[2]
    return hy[c, :, :] * (1.0 - tz)[:, None, None] + hy[c + 1, :, :] * tz[:, None, None]


def noise_points(u, s, seed):
    """The same value noise at arbitrary points u (N, 3) in lattice-cell units (for attributes and checks)."""
    f = u / s
    i = np.floor(f).astype(np.int64)
    t = _smooth(f - i)
    out = np.zeros(len(u))
    for dx in (0, 1):
        wx = t[:, 0] if dx else 1.0 - t[:, 0]
        for dy in (0, 1):
            wy = t[:, 1] if dy else 1.0 - t[:, 1]
            for dz in (0, 1):
                wz = t[:, 2] if dz else 1.0 - t[:, 2]
                out += _hash3(i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz, seed) * wx * wy * wz
    return out


# ---------------------------------------------------------------- PNG (zlib, no imaging library)


def write_png(path, rgb):
    h, w, _ = rgb.shape
    raw = b"".join(b"\x00" + rgb[r].astype(np.uint8).tobytes() for r in range(h))

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    with open(path, "wb") as fh:
        fh.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
                 + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b""))


# ---------------------------------------------------------------- input: a small JSON Schema reader and the rules


def schema_errors(inst, schema, root=None, path="$"):
    """The subset of JSON Schema 2020-12 the cave schema uses: $ref, type, const, enum, properties, required,
    additionalProperties, items, min/maxItems, minimum, maximum, exclusiveMinimum, pattern, oneOf, anyOf."""
    root = schema if root is None else root
    errs = []
    if "$ref" in schema:
        ref = schema["$ref"]
        node = root
        for part in ref.lstrip("#/").split("/"):
            node = node[part]
        return schema_errors(inst, node, root, path)
    t = schema.get("type")
    if t is not None:
        types = t if isinstance(t, list) else [t]
        ok = False
        for ty in types:
            if ty == "object" and isinstance(inst, dict):
                ok = True
            elif ty == "array" and isinstance(inst, list):
                ok = True
            elif ty == "string" and isinstance(inst, str):
                ok = True
            elif ty == "boolean" and isinstance(inst, bool):
                ok = True
            elif ty == "integer" and isinstance(inst, int) and not isinstance(inst, bool):
                ok = True
            elif ty == "number" and isinstance(inst, (int, float)) and not isinstance(inst, bool):
                if not math.isfinite(inst):
                    return [f"{path}: {inst} is not a finite number"]
                if abs(inst) > MAX_NUMBER:
                    return [f"{path}: {inst} is out of range (at most {MAX_NUMBER:g} in size)"]
                ok = True
            elif ty == "null" and inst is None:
                ok = True
        if not ok:
            return [f"{path}: expected {t}"]
    if "const" in schema and inst != schema["const"]:
        errs.append(f"{path}: must be {schema['const']!r}")
    if "enum" in schema and inst not in schema["enum"]:
        errs.append(f"{path}: {inst!r} is not one of {schema['enum']}")
    if isinstance(inst, (int, float)) and not isinstance(inst, bool):
        if "minimum" in schema and inst < schema["minimum"]:
            errs.append(f"{path}: {inst} < {schema['minimum']}")
        if "maximum" in schema and inst > schema["maximum"]:
            errs.append(f"{path}: {inst} > {schema['maximum']}")
        if "exclusiveMinimum" in schema and inst <= schema["exclusiveMinimum"]:
            errs.append(f"{path}: {inst} <= {schema['exclusiveMinimum']}")
    if isinstance(inst, str) and "pattern" in schema and not re.search(schema["pattern"], inst):
        errs.append(f"{path}: {inst!r} does not match {schema['pattern']}")
    if isinstance(inst, list):
        if "minItems" in schema and len(inst) < schema["minItems"]:
            errs.append(f"{path}: fewer than {schema['minItems']} items")
        if "maxItems" in schema and len(inst) > schema["maxItems"]:
            errs.append(f"{path}: more than {schema['maxItems']} items")
        if "items" in schema:
            for i, v in enumerate(inst):
                errs += schema_errors(v, schema["items"], root, f"{path}[{i}]")
    if isinstance(inst, dict):
        props = schema.get("properties", {})
        for r in schema.get("required", []):
            if r not in inst:
                errs.append(f"{path}: missing {r!r}")
        for k, v in inst.items():
            if k in props:
                errs += schema_errors(v, props[k], root, f"{path}.{k}")
            else:
                ap = schema.get("additionalProperties", True)
                if ap is False:
                    errs.append(f"{path}: unknown key {k!r}")
                elif isinstance(ap, dict):
                    errs += schema_errors(v, ap, root, f"{path}.{k}")
    for key in ("oneOf", "anyOf"):
        if key in schema:
            hits = [s for s in schema[key] if not schema_errors(inst, s, root, path)]
            if key == "oneOf" and len(hits) != 1:
                errs.append(f"{path}: matches {len(hits)} of oneOf")
            if key == "anyOf" and not hits:
                errs.append(f"{path}: matches none of anyOf")
    return errs


_SCHEMA = None


def schema():
    global _SCHEMA
    if _SCHEMA is None:
        _SCHEMA = load_json(SCHEMA_PATH)
    return _SCHEMA


class CaveError(Exception):
    pass


def resolve_network(sec, sec_path, network_path=None):
    """The network object and the folder its section files live in."""
    if network_path:
        return load_json(network_path), os.path.dirname(os.path.abspath(network_path))
    net = sec.get("network")
    base = os.path.dirname(os.path.abspath(sec_path)) if sec_path else "."
    if isinstance(net, str):
        p = os.path.join(base, net)
        return load_json(p), os.path.dirname(os.path.abspath(p))
    return net, base


def sidle_boxes(p, pts):
    """The sidle zones make_zones writes for a fissure, as boxes counted as the viewer counts them (its end margins
    and edge): (segment, centre x, y, axis x, y, half along, half across, z low, z high)."""
    w = p["width"] if isinstance(p["width"], list) else [p["width"]]
    across = 0.5 * (max(w) + 0.3) + EDGE
    out = []
    for j in range(len(pts) - 1):
        A, B = pts[j], pts[j + 1]
        L = math.hypot(B[0] - A[0], B[1] - A[1])
        if L < 1e-9:
            continue
        ux, uy = (B[0] - A[0]) / L, (B[1] - A[1]) / L
        out.append((j, 0.5 * (A[0] + B[0]), 0.5 * (A[1] + B[1]), ux, uy, 0.5 * L + END_MARGIN + EDGE, across,
                    min(A[2], B[2]) - 0.25 - EDGE, max(A[2], B[2]) + 1.0 + EDGE,
                    0.5 * L, max(0.5 * min(w) - BODY["sidle"][0], 0.02)))
    return out


def arm_of(b):
    """Where the sidler's feet are in a fissure's segment proper: between its ends, within its width less the
    sidling radius (a box of the same form as sidle_boxes')."""
    return b[:5] + (b[9], b[10]) + b[7:]


def boxes_meet(a, b):
    """Do two sidle boxes overlap (separating axes in plan, and their heights)?"""
    if a[7] > b[8] or b[7] > a[8]:
        return False
    dx, dy = b[1] - a[1], b[2] - a[2]
    for tx, ty in ((a[3], a[4]), (-a[4], a[3]), (b[3], b[4]), (-b[4], b[3])):
        ra = a[5] * abs(a[3] * tx + a[4] * ty) + a[6] * abs(-a[4] * tx + a[3] * ty)
        rb = b[5] * abs(b[3] * tx + b[4] * ty) + b[6] * abs(-b[4] * tx + b[3] * ty)
        if abs(dx * tx + dy * ty) > ra + rb + 1e-9:
            return False
    return True


def sidle_overlap_errors(fissures):
    """controller.ts keeps a sidler in the zone it is in while its feet are in it (end margins counted) and moves it
    only along that zone's X axis; the wall slides it round a turn of at most FISSURE_BEND. So the feet may not stand
    in one zone of a fissure (its end margins counted) and already in the arm proper of another that turns more than
    FISSURE_BEND from it (two bends close together add up: two of 45 degrees need about 0.55 m between them), and the
    zones of two different fissures may not overlap at all (at a crossing or a T the sidler stays in its own fissure
    and can never turn into the other)."""
    errs = []
    boxes = [(pid, sidle_boxes(p, pts)) for pid, p, pts in fissures]
    for i, (pa, ba) in enumerate(boxes):
        for ai, a in enumerate(ba):
            for b in ba[ai + 2:]:
                # the feet still in one zone (its margins counted) while already in the other's arm proper
                if not (boxes_meet(a, arm_of(b)) or boxes_meet(arm_of(a), b)):
                    continue
                turn = math.degrees(math.acos(max(-1.0, min(1.0, a[3] * b[3] + a[4] * b[4]))))
                if turn > FISSURE_BEND + 1e-6:
                    errs.append(f"passage {pa}: segments {a[0]} and {b[0]} of the fissure turn {turn:.1f} degrees "
                                f"from each other, but a sidler still in the first's zone already stands in the "
                                f"second (at most {FISSURE_BEND:g}); the viewer moves it only along the zone it is "
                                "in, so space the bends further apart")
        for pb, bb in boxes[i + 1:]:
            hit = next(((a, b) for a in ba for b in bb if boxes_meet(a, b)), None)
            if hit is not None:
                a, b = hit
                errs.append(f"passages {pa} and {pb}: the sidle zones of two fissures overlap near "
                            f"({0.5 * (a[1] + b[1]):.1f}, {0.5 * (a[2] + b[2]):.1f}); the viewer keeps a sidler in its "
                            "own fissure's zone, so it cannot turn into the other: make them one passage with via "
                            "points, or let them meet in a chamber")
    return errs


def seam_cover_errors(sec, net, resolved):
    """Each seam's window (the opening in the shell) must hold the cross-section of every passage that crosses the
    seam plane through it, noise and bedding included: else the shell is cut open outside the opening."""
    errs = []
    geos = net.get("geology", {}) if isinstance(net, dict) else {}
    for sm in sec.get("seams", []):
        ax = 0 if sm["plane"]["axis"] == "x" else 1
        plus = sm["plane"].get("toward", "+") == "+"
        at0 = sm["plane"]["at"]
        stub = float(sm.get("stub_m", 0.0))
        u0, z0, u1, z1 = sm["window"]
        for p, pts in resolved:
            if p["profile"] in ("shaft", "climb_face"):
                continue
            g = geos.get(p.get("geology", sec.get("geology")), {})
            amp = min(p.get("noise", g.get("noise", 0.0)), NOISE_CAP.get(p["profile"], 1.0))
            bed = g.get("bedding") if p["profile"] not in ("fissure", "crawl") else None
            pad = amp + (bed[1] if bed else 0.0)
            w = p["width"] if isinstance(p["width"], list) else [p["width"]]
            h = p["clear"] if isinstance(p["clear"], list) else [p["clear"]]
            hw, top = 0.5 * max(w) + pad, max(h) + pad
            bad = None
            for at in sorted({at0, at0 + stub if plus else at0 - stub}):
                for A, B in zip(pts[:-1], pts[1:]):
                    a0, a1 = A[ax], B[ax]
                    if a0 == a1 or not (min(a0, a1) <= at <= max(a0, a1)):
                        continue
                    t = (at - a0) / (a1 - a0)
                    u = A[1 - ax] + t * (B[1 - ax] - A[1 - ax])
                    fz = A[2] + t * (B[2] - A[2])
                    lo_u, hi_u, lo_z, hi_z = u - hw, u + hw, fz - pad, fz + top
                    if hi_u < u0 - 0.5 or lo_u > u1 + 0.5 or hi_z < z0 - 0.5 or lo_z > z1 + 0.5:
                        continue  # passes the plane away from this window
                    if bad is None and (lo_u < u0 or hi_u > u1 or lo_z < z0 or hi_z > z1):
                        bad = (u, fz, lo_u, lo_z, hi_u, hi_z)
            if bad is not None:
                u, fz, lo_u, lo_z, hi_u, hi_z = bad
                errs.append(f"seam {sm['id']}: passage {p['id']} crosses the plane at {u:.2f} with its floor at "
                            f"{fz:.2f}, so its section [{lo_u:.2f}, {lo_z:.2f}, {hi_u:.2f}, {hi_z:.2f}] (noise "
                            f"included) does not fit the window {sm['window']}")
    return errs


def validate(sec, net, sec_path=None):
    """Schema and design rules: (errors, warnings)."""
    errs = schema_errors(sec, schema())
    nerrs = schema_errors(net, {"$ref": "#/$defs/network"}, schema(), "network") if isinstance(net, dict) else []
    errs += nerrs
    warns = []
    if errs:
        return errs, warns
    nodes = sec.get("nodes", {})

    def pt(v, where):
        if isinstance(v, str):
            if v not in nodes:
                errs.append(f"{where}: unknown node {v!r}")
                return None
            return nodes[v]
        return v

    for kind in ("passages", "chambers", "guards", "bridges", "drops", "spawns", "portals", "seams", "openings"):
        ids = set()
        for o in sec.get(kind, []):
            if o["id"] in ids:
                errs.append(f"{kind}: id {o['id']!r} used twice")
            ids.add(o["id"])
    resolved, fissures = [], []
    pids = {p["id"]: p for p in sec.get("passages", [])}
    chams = {c["id"]: c for c in sec.get("chambers", [])}
    for w in sec.get("water", []):
        # water is drawn by the builder (meshy_cave_build.water_surfaces): along a walking passage, or in a lake's basin
        where = f"water {w['id']}"
        if ("along" in w) == ("chamber" in w):
            errs.append(f"{where}: give either along (a stream) or chamber (a lake's basin)")
        elif "along" in w and (w["along"] not in pids or pids[w["along"]]["profile"] not in WALK_PROFILES):
            errs.append(f"{where}: along {w['along']!r} is not a walking passage of this section")
        elif "chamber" in w and (chams.get(w["chamber"], {}).get("kind") != "lake" or "level" not in w):
            errs.append(f"{where}: chamber {w['chamber']!r} is not a lake chamber of this section, or no level")
        elif "chamber" in w:
            c = chams[w["chamber"]]
            if not (c["center"][2] - c.get("basin_depth", 1.2) < w["level"] < c["center"][2]):
                errs.append(f"{where}: the level lies in the basin, under the chamber's floor and over its bottom")
    for p in sec.get("passages", []):
        for alt in p.get("alternatives", []):
            # declared alternatives: forced moves of which the walker must make one (the White Gallery's Giant's
            # Coffin climb or its Wringer squeeze). Each is checked as mandatory with the other's zones taken away too
            if alt not in pids or alt == p["id"]:
                errs.append(f"passage {p['id']}: alternative {alt!r} is not another passage of this section")
            elif pids[alt]["profile"] not in ("crawl", "fissure", "climb_face") or                     p["profile"] not in ("crawl", "fissure", "climb_face"):
                errs.append(f"passage {p['id']}: alternatives are crawls, fissures or climb faces ({alt!r})")
    for p in sec.get("passages", []):
        w = p["width"] if isinstance(p["width"], list) else [p["width"]]
        h = p["clear"] if isinstance(p["clear"], list) else [p["clear"]]
        prof, where = p["profile"], f"passage {p['id']}"
        a, b = pt(p["from"], where), pt(p["to"], where)
        if a is None or b is None:
            continue
        pts = [a] + list(p.get("via", [])) + [b]
        resolved.append((p, pts))
        if prof == "fissure":
            fissures.append((p["id"], p, pts))
        if prof in WALK_PROFILES and (min(w) < CORE["walk"][0] or min(h) < CORE["walk"][1]):
            errs.append(f"{where}: a walking passage keeps a clear core of 0.8 x 2.1 m (width {min(w)}, clear {min(h)})")
        if prof == "crawl":
            if min(w) < CORE["crawl"][0]:
                errs.append(f"{where}: a crawl is at least 0.8 m wide")
            if min(h) < CRAWL_CLEAR[0] or max(h) > CRAWL_CLEAR[1]:
                errs.append(f"{where}: a crawl's clear height is 1.0 to 1.3 m (got {h})")
        if prof == "fissure":
            if min(w) < FISSURE_WIDTH[0] or max(w) > FISSURE_WIDTH[1]:
                errs.append(f"{where}: a fissure is 0.42 to 0.55 m wide at body height (got {w})")
            if min(h) < FISSURE_MIN_H:
                errs.append(f"{where}: a fissure is at least 1.9 m tall")
            for j in range(1, len(pts) - 1):
                u = (pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1])
                v = (pts[j + 1][0] - pts[j][0], pts[j + 1][1] - pts[j][1])
                nu, nv = math.hypot(*u), math.hypot(*v)
                if nu < 1e-9 or nv < 1e-9:
                    continue  # reported below as a segment with no length
                turn = math.degrees(math.acos(max(-1.0, min(1.0, (u[0] * v[0] + u[1] * v[1]) / (nu * nv)))))
                if turn > FISSURE_BEND + 1e-6:
                    errs.append(f"{where}: a fissure turns at most {FISSURE_BEND:g} degrees at a bend (via point "
                                f"{j - 1} turns {turn:.1f}); the viewer moves a sidler only along its zone's axis, "
                                "so add a bend or a pocket")
        if prof == "climb_face":
            if len(pts) != 2:
                errs.append(f"{where}: a climb face has a foot and a top, no via points")
                continue
            hgt = b[2] - a[2]
            if not (CLIMB_HEIGHT[0] <= hgt <= CLIMB_HEIGHT[1]):
                errs.append(f"{where}: a climb face is 1 to 15 m high (got {hgt:.2f})")
            if p.get("ledge_depth", 1.5) < CLIMB_LEDGE_MIN:
                errs.append(f"{where}: the ledge at the top is at least 1.0 m deep")
            bat = p.get("batter", 0.0)
            if bat > CLIMB_MAX_BATTER and p.get("lip", 0.0) <= 0:
                errs.append(f"{where}: the face must stand above 82 degrees (batter {bat} > 0.1405) or have a lip")
            if bat * hgt > 0.25:
                errs.append(f"{where}: the face leans back {bat * hgt:.2f} m over its height; at most 0.25 m")
            if min(w) < 0.8:
                errs.append(f"{where}: a climb face is at least 0.8 m wide")
            if math.hypot(b[0] - a[0], b[1] - a[1]) < 0.5:
                errs.append(f"{where}: the top point lies on the ledge, at least 0.5 m behind the foot")
        if prof == "shaft" and math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-6:
            errs.append(f"{where}: a shaft is vertical (from and to share x and y)")
        fl = p.get("floor", {"kind": "ramp"})
        for j in range(len(pts) - 1):
            A, B = pts[j], pts[j + 1]
            L = math.hypot(B[0] - A[0], B[1] - A[1])
            dz = abs(B[2] - A[2])
            if prof in ("shaft", "climb_face"):
                continue
            if L < 1e-6:
                errs.append(f"{where}: segment {j} has no length in plan")
                continue
            if fl.get("kind") == "flat" and dz > 1e-9:
                errs.append(f"{where}: a flat floor needs equal heights")
            if fl.get("kind") == "stairs" and dz > 1e-9:
                riser, tread = fl.get("riser", 0.2), fl.get("tread", 0.3)
                n = max(1, int(round(dz / riser)))
                if dz / n > 0.25 + 1e-9:
                    (errs if dz / n >= 0.35 else warns).append(f"{where}: risers of {dz / n:.3f} m (at most 0.25)")
                if tread < 0.28:
                    errs.append(f"{where}: treads of {tread} m (at least 0.28)")
                if (n - 1) * tread > L - 0.6:
                    errs.append(f"{where}: {n} risers do not fit in segment {j} ({L:.2f} m)")
                if min(w) < 1.0:
                    errs.append(f"{where}: stairs are at least 1.0 m wide")
            elif dz > 1e-9:
                g = dz / L
                if g > RAMP_MAX:
                    errs.append(f"{where}: a ramp of {g:.3f} (over 30 degrees)")
                elif g > RAMP_WARN:
                    warns.append(f"{where}: a ramp of {g:.3f} (over {'25' if g > RAMP_HARD_WARN else '20'} degrees)")
    errs += sidle_overlap_errors(fissures)
    errs += seam_cover_errors(sec, net, resolved)
    for kind in ("chambers", "features"):
        for c in sec.get(kind, []):
            ax = c.get("axis")
            if ax is not None and math.hypot(ax[0], ax[1]) < 1e-6:
                errs.append(f"{kind[:-1]} {c.get('id', '?')}: the axis has no direction")
    geos = set(net.get("geology", {})) if isinstance(net, dict) else set()
    for gname, gd in (net.get("geology", {}) if isinstance(net, dict) else {}).items():
        bed = gd.get("bedding")
        if bed and bed[0] < 0.05:
            errs.append(f"network geology {gname}: a bed is at least 0.05 m thick (bedding {bed})")
    for where, o in [("section", sec)] + [(f"{k[:-1]} {o['id']}", o) for k in ("passages", "chambers")
                                          for o in sec.get(k, [])]:
        if o.get("geology") is not None and geos and o["geology"] not in geos:
            errs.append(f"{where}: geology {o['geology']!r} is not in the network (has {sorted(geos)})")
    for sm in sec.get("seams", []):
        if sm.get("neighbour") == sec.get("key"):
            errs.append(f"seam {sm['id']}: its neighbour is this section itself")
    known = {o["id"] for k in ("passages", "chambers") for o in sec.get(k, [])}
    for a, b in sec.get("joins", []):
        if a == b:
            errs.append(f"joins: {a!r} joined to itself")
        for v in (a, b):
            if v not in known:
                warns.append(f"joins: {v!r} is not one of this section's passages or chambers (a neighbour's?)")
    for c in sec.get("chambers", []):
        if c["kind"] == "lake" and c.get("walk", True) and c.get("basin_depth", 1.2) <= 0:
            errs.append(f"chamber {c['id']}: a lake has a basin")
    lat = net["lattice"]
    o, cell = lat["origin"], lat["cell"]
    for i, bx in enumerate(sec["region"]["boxes"]):
        for a in range(3):
            lo = (bx[a] - o[a]) / cell
            hi = (bx[a + 3] - o[a]) / cell
            if abs(lo - round(lo)) > 1e-6 or abs(hi - round(hi)) > 1e-6:
                errs.append(f"region box {i}: faces must lie on the lattice ({cell} m from the origin)")
            if lo < 0 or hi >= MAX_INDEX - BLOCK_DEFAULT or hi <= lo:
                errs.append(f"region box {i}: outside the lattice or empty")
    for s in sec.get("seams", []):
        at = s["plane"]["at"]
        a = 0 if s["plane"]["axis"] == "x" else 1
        r = (at - o[a]) / cell
        if abs(r - round(r)) > 1e-6:
            errs.append(f"seam {s['id']}: the plane must lie on the lattice")
    portals = [p["at"] for p in sec.get("portals", [])] + [s["portal"] for s in sec.get("seams", [])]
    for sp in sec.get("spawns", []):
        for q in portals:
            if math.hypot(sp["at"][0] - q[0], sp["at"][1] - q[1]) <= 1.0:
                errs.append(f"spawn {sp['id']}: within 1 m of a portal")
    if not sec.get("spawns"):
        errs.append("a section has at least one spawn")
    return errs, warns


# ---------------------------------------------------------------- primitives of the field


def floor_stairs(a, Z, zA, L, st):
    """The air above a flight of stairs on a segment, by its along-coordinate a (min of half-spaces, so it is a
    proper field: rock is z under zA, plus each step block). Returns (air, step_floor_height)."""
    n, r, T, L0 = st
    lo = zA if r > 0 else zA + n * r
    aa = a if r > 0 else L - a  # walk the flight upward
    air = Z - lo
    hstep = lo + np.zeros(np.shape(aa))
    for k in range(1, n + 1):
        ak = L0 + (k - 1) * T
        hk = lo + k * abs(r)
        air = np.minimum(air, np.maximum(Z - hk, ak - aa))
        hstep = np.where(aa >= ak, hk, hstep)
    return air, hstep


def stairs_line(a, zA, L, st):
    """The ramp through the treads' mid points (the collision under stairs and the walls' base line)."""
    n, r, T, L0 = st
    lo = zA if r > 0 else zA + n * r
    aa = a if r > 0 else L - a
    return lo + abs(r) * np.clip((aa - L0 + 0.5 * T) / T, 0.0, n)


def tube_centre_ratio(a, H):
    """r = vc / b for a tube of half width a and clear height H: 2/3 (the old shape, centre at 0.4 H) unless the wall
    would then meet the floor under TUBE_FLOOR_SLOPE. The wall's slope at the floor is (H / a) sqrt((1 - r) / (1 + r))
    / r; where that is too shallow, r solves K^2 r^3 + K^2 r^2 + r - 1 = 0 with K = TUBE_FLOOR_SLOPE a / H (Newton
    from r = 2/3: the cubic rises and is convex there, so the steps fall monotonically onto the root). Elementwise,
    arithmetic and square roots only, so it is the same on every Python."""
    a = np.asarray(a, dtype=np.float64)
    H = np.asarray(H, dtype=np.float64)
    K = TUBE_FLOOR_SLOPE * a / np.maximum(H, 1e-9)
    r0 = 2.0 / 3.0
    g0 = math.sqrt((1.0 - r0) / (1.0 + r0)) / r0
    need = K > g0
    if not np.any(need):
        return np.full(np.broadcast(a, H).shape, r0) if np.ndim(a) or np.ndim(H) else r0
    K2 = np.broadcast_to(K * K, np.broadcast(a, H).shape)
    r = np.full(K2.shape, r0)
    for _ in range(16):
        f = K2 * r * r * (1.0 + r) + r - 1.0
        fp = K2 * (3.0 * r * r + 2.0 * r) + 1.0
        r = np.where(need, r - f / fp, r0)
    return r


def prof_wall(profile, d, v, W, H, collision=False):
    """A passage's wall and roof as a field across its section: d the distance from the centre line in plan, v the
    height above the floor line; positive in the air. With collision, a tube's wall is upright from the floor to the
    ellipse's centre, where the floor meets it (see below)."""
    if profile == "tube":
        a = 0.5 * W
        r = tube_centre_ratio(a, H)
        b = H / (1.0 + r)
        vc = r * b
        ell = np.minimum(a, b) * (1.0 - np.sqrt((d / a) ** 2 + ((v - vc) / b) ** 2))
        if not collision:
            return ell
        # The viewer has no slope limit, and even a wall meeting the floor at 75 degrees, with its noise and its
        # bedding, lets a walker that moves along it (where the centre line slants across the lattice) step up it
        # 1.0 to 1.25 m (the flood found 23 such states on the Great Gallery's walls). The walker collides with this
        # field, not with the shell: here the wall is the upright cylinder through the floor's edge d0 wherever the
        # ellipse lies outside it (from the floor up to 2 vc, where the ellipse comes back to d0), so nothing on the
        # lower wall faces up and the two meet without a step. It stands at most a - d0 inside the shell's bowl, at
        # the ellipse's centre (0.25 m in the 14 m trunk), and on the floor's edge itself.
        d0 = a * np.sqrt(np.maximum(1.0 - (vc / b) ** 2, 0.0))
        return np.minimum(ell, d0 - d)
    if profile == "crawl":  # a low flat-roofed bedding plane, rounded into its walls
        return smin(0.5 * W - d, H - v, 0.35)
    if profile == "canyon":
        hw = 0.5 * W * (1.0 - 0.3 * np.clip(v / H, 0.0, 1.0))
        return smin(hw - d, H - v, 0.3)
    if profile == "rift":
        u = np.clip(v / H, 0.0, 1.0)
        hw = 0.5 * W * (0.85 + 0.15 * (1.0 - np.abs(2.0 * u - 1.0)))
        if collision:
            # The rift widens from its floor to mid height, so its lower walls lean out and face up: the viewer's
            # ground rays stood a walker 1.1 m up the Ice Rift's wall on them. The walker meets the upright wall
            # through the floor's edge instead, all the way up (at most 0.075 W inside the rock you see; a wall
            # that met the shell above mid height would leave a shelf there).
            hw = 0.5 * W * 0.85
        return smin(hw - d, H - v, 0.4)
    if profile == "keyhole":
        a, b = 0.5 * W, 0.35 * H
        vc = H - b
        tube = np.minimum(a, b) * (1.0 - np.sqrt((d / a) ** 2 + ((v - vc) / b) ** 2))
        hs = np.maximum(0.45, 0.22 * W)
        if collision:
            # The tube's lower half is a bowl on each side of the slot, about 1 m above the floor: the shoulders.
            # Where two keyholes meet on ramps, or a keyhole opens off a fissure, the viewer's ground rays found the
            # bowls and the walker ran along them and fell 1 m back into the slot (the Spar Maze: 40 falls, 1,429
            # states off the routes). The walker meets the slot's upright wall up to the tube's centre instead, and
            # the tube only above it, so the shoulders are never stood on (they lie up to a - hs behind the bowl you
            # see, where no body fits).
            return np.maximum(np.minimum(tube, v - vc), smin(hs - d, vc + 0.1 - v, 0.15))
        slot = smin(hs - d, vc + 0.2 - v, 0.15)
        return np.maximum(tube, slot)
    if profile == "drift":
        hw = 0.5 * W
        return smin(hw - d, H - 0.3 * (d / hw) ** 2 - v, 0.12)
    if profile == "fissure":
        return smin(0.5 * W - d, H - v, 0.05)
    raise ValueError(profile)


def noise_term(n, v, amp, collision=False):
    """Noise that only pushes the rock outward below about 2 m (the old builder's wall rule), freely above. The
    collision field leaves out the outward push below 2.6 m: the viewer has no slope limit, and the push's lumps and
    the bedding's steps on a lower wall are footholds its ground rays find (the flood walked 1.1 m up the Clay Hall's
    wall on them). So the walker meets the smooth wall, at most amp inside the shell, and never the rock beyond it."""
    t = np.clip((v - 1.8) / 0.8, 0.0, 1.0)
    if collision:
        return amp * t * n
    return amp * (np.maximum(n, 0.0) + t * np.minimum(n, 0.0))


def bedding(Z, bed):
    if not bed or bed[1] <= 0 or bed[0] <= 0:
        return 0.0
    f = Z / bed[0]
    f = f - np.floor(f)
    return bed[1] * (f * f - 1.0 / 3.0)


class Prim:
    cls = 1
    walk = True
    blend = 0.5
    amp = 0.0
    geo = 0
    rock = None    # the rock profile its wall detail follows (meshy_cave_rock), None for none
    rubble = None  # the rock profile its rubble edge follows, None for none

    def hits(self, box):
        b = self.box
        return not (box[3] < b[0] or box[0] > b[3] or box[4] < b[1] or box[1] > b[4] or box[5] < b[2] or box[2] > b[5])


class Passage(Prim):
    """A cross-section swept along a centre line of floor points; floors flat, ramped or stepped."""

    def __init__(self, key, d, nodes, gi, geo):
        self.id, self.sec = d["id"], key
        pts = [nodes[d["from"]] if isinstance(d["from"], str) else d["from"]]
        pts += [list(v) for v in d.get("via", [])]
        pts += [nodes[d["to"]] if isinstance(d["to"], str) else d["to"]]
        self.P = np.array(pts, dtype=np.float64)
        self.profile = d["profile"]
        self.cls = 3 if self.profile == "climb_face" else 1
        self.key = (self.cls, key, self.id)
        w, h = d["width"], d["clear"]
        self.w = (float(w), float(w)) if not isinstance(w, list) else (float(w[0]), float(w[1]))
        self.h = (float(h), float(h)) if not isinstance(h, list) else (float(h[0]), float(h[1]))
        self.geo = gi
        self.amp = min(d.get("noise", geo["noise"]), NOISE_CAP.get(self.profile, 1.0))
        self.bed = None if self.profile in ("fissure", "crawl", "climb_face") else geo.get("bedding")
        self.blend = 0.0 if self.profile == "climb_face" else float(d.get("blend", 0.5))
        self.walk = bool(d.get("walk", True)) and self.profile != "shaft"
        A, B = self.P[:-1], self.P[1:]
        self.A, self.B = A, B
        self.L = np.hypot(B[:, 0] - A[:, 0], B[:, 1] - A[:, 1])
        self.cum = np.concatenate([[0.0], np.cumsum(self.L)])
        self.S = float(self.cum[-1])
        fl = d.get("floor", {"kind": "ramp"})
        self.floor_kind = fl.get("kind", "ramp")
        self.stairs = [None] * len(A)
        if self.floor_kind == "stairs":
            riser, tread = fl.get("riser", 0.2), fl.get("tread", 0.3)
            for j in range(len(A)):
                dz = B[j, 2] - A[j, 2]
                if abs(dz) > 1e-9:
                    n = max(1, int(round(abs(dz) / riser)))
                    self.stairs[j] = (n, dz / n, tread, 0.5 * (self.L[j] - (n - 1) * tread))
        if self.profile in WALK_PROFILES:
            self.core = CORE["walk"]
        elif self.profile in ("crawl", "fissure"):
            self.core = CORE[self.profile]
        else:
            self.core = None
        if self.profile == "climb_face":
            self.ledge = float(d.get("ledge_depth", 1.5))
            self.approach = float(d.get("approach", 1.5))
            self.batter = float(d.get("batter", 0.0))
            self.lip = float(d.get("lip", 0.0))
            self.dir = unit2((B[0, 0] - A[0, 0], B[0, 1] - A[0, 1]))
            self.foot, self.top = float(A[0, 2]), float(B[0, 2])
        wmax, hmax = max(self.w), max(self.h)
        pad = INFLUENCE + self.amp + self.blend
        if self.profile == "climb_face":
            ex = max(self.ledge, self.approach) + 0.5 * wmax + pad
            self.box = (A[0, 0] - ex, A[0, 1] - ex, self.foot - pad, A[0, 0] + ex, A[0, 1] + ex, self.top + hmax + pad)
        else:
            ztop = self.P[:, 2].max() + hmax + (self.P[-1, 2] - self.P[0, 2] if self.profile == "shaft" else 0.0)
            self.box = (self.P[:, 0].min() - 0.5 * wmax - pad, self.P[:, 1].min() - 0.5 * wmax - pad,
                        self.P[:, 2].min() - pad, self.P[:, 0].max() + 0.5 * wmax + pad,
                        self.P[:, 1].max() + 0.5 * wmax + pad, ztop + pad)

    def plan(self, X, Y):
        """Nearest segment in plan: (distance, segment index, parameter along it), elementwise."""
        best = None
        for j in range(len(self.A)):
            ax, ay = self.A[j, 0], self.A[j, 1]
            dx, dy = self.B[j, 0] - ax, self.B[j, 1] - ay
            L2 = dx * dx + dy * dy
            t = np.clip(((X - ax) * dx + (Y - ay) * dy) / L2, 0.0, 1.0) if L2 > 1e-12 else np.zeros(np.shape(X + Y))
            px, py = ax + t * dx, ay + t * dy
            d2 = (X - px) ** 2 + (Y - py) ** 2
            if best is None:
                best, tj, jj = d2, t, np.zeros(np.shape(d2), dtype=np.int64)
            else:
                better = d2 < best
                best = np.where(better, d2, best)
                tj = np.where(better, t, tj)
                jj = np.where(better, j, jj)
        return np.sqrt(best), jj, tj

    def floors(self, jj, tj, Z, collision=False):
        """(floor_air, base line, step floor height) along the centre line."""
        zA, zB = self.A[jj, 2], self.B[jj, 2]
        base = zA + tj * (zB - zA)
        air = Z - base
        stepf = base
        for j, st in enumerate(self.stairs):
            if st is None:
                continue
            m = jj == j
            if not np.any(m):
                continue
            a = tj * self.L[j]
            line = stairs_line(a, self.A[j, 2], self.L[j], st)
            base = np.where(m, line, base)
            if collision:
                air = np.where(m, Z - line, air)
                stepf = np.where(m, line, stepf)
            else:
                sa, sh = floor_stairs(a, Z, self.A[j, 2], self.L[j], st)
                air = np.where(m, sa, air)
                stepf = np.where(m, sh, stepf)
        return air, base, stepf

    def size_at(self, jj, tj):
        s = (self.cum[jj] + tj * self.L[jj]) / max(self.S, 1e-9)
        return self.w[0] + (self.w[1] - self.w[0]) * s, self.h[0] + (self.h[1] - self.h[0]) * s

    def eval(self, c):
        if self.profile == "climb_face":
            return self.eval_climb(c)
        X, Y, Z = c.X, c.Y, c.Z
        d, jj, tj = self.plan(X, Y)
        W, H = self.size_at(jj, tj)
        if self.profile == "shaft":
            v = Z - self.A[0, 2]
            htot = (self.B[0, 2] - self.A[0, 2]) + H
            wall = smin(0.5 * W - d, htot - v, 0.3) + noise_term(c.n, v, self.amp, c.walls)
            return smin(wall, v, 0.2), v
        fa, base, _ = self.floors(jj, tj, Z, c.collision)
        v = Z - base
        wall = prof_wall(self.profile, d, v, W, H, c.walls)
        wall0 = wall
        if self.rock is not None:
            wall = wall + rock.detail(c, v, self.rock, self.bed)
        if self.amp > 0:
            wall = wall + noise_term(c.n + (bedding(Z, self.bed) if self.bed else 0.0), v, self.amp, c.walls)
        kf = min(0.3, 0.25 * float(min(self.w)))
        out = smin(wall, fa, kf)
        if self.rubble is not None:
            h = rock.rubble(c, wall0, self.rubble)
            if not isinstance(h, float):
                out = np.minimum(out, fa - h)
        return out, fa

    def eval_climb(self, c):
        X, Y, Z = c.X, c.Y, c.Z
        fx, fy = self.A[0, 0], self.A[0, 1]
        dx, dy = self.dir
        a = (X - fx) * dx + (Y - fy) * dy
        lat = -(X - fx) * dy + (Y - fy) * dx
        W, H = self.w[0], self.h[0]
        face = self.batter * np.maximum(Z - self.foot, 0.0)
        fa = np.minimum(Z - self.foot, np.maximum(Z - self.top, face - a))
        if self.lip > 0:
            fa = np.minimum(fa, np.maximum(np.maximum(face - self.lip - a, Z - self.top), self.top - 0.3 - Z))
        box = np.minimum(np.minimum(0.5 * W - np.abs(lat), self.top + H - Z),
                         np.minimum(self.ledge - a, a + self.approach))
        return smin(box, fa, 0.15), Z - np.where(a >= face, self.top, self.foot)

    def core_eval(self, c):
        """The clear core: a box W_c x H_c above the floor along the whole centre line."""
        hw, hc = 0.5 * self.core[0], self.core[1]
        d, jj, tj = self.plan(c.X, c.Y)
        fa, _, stepf = self.floors(jj, tj, c.Z, False)
        return np.minimum(np.minimum(hw - d, fa), stepf + hc - c.Z)

    def designed(self, x, y, z):
        if not self.walk:
            return np.zeros(len(x), bool)
        if self.profile == "climb_face":
            dx, dy = self.dir
            a = (x - self.A[0, 0]) * dx + (y - self.A[0, 1]) * dy
            lat = np.abs(-(x - self.A[0, 0]) * dy + (y - self.A[0, 1]) * dx)
            ok = lat <= 0.5 * self.w[0] + 0.5
            low = (a >= -self.approach - 0.5) & (a <= 0.5) & (np.abs(z - self.foot) <= 0.6)
            high = (a >= -0.5) & (a <= self.ledge + 0.5) & (np.abs(z - self.top) <= 0.6)
            return ok & (low | high)
        d, jj, tj = self.plan(x, y)
        W, _ = self.size_at(jj, tj)
        _, base, _ = self.floors(jj, tj, z, True)
        tol = max((abs(st[1]) for st in self.stairs if st), default=0.0)
        return (d <= 0.5 * W + 0.5) & (z - base >= -0.6 - tol) & (z - base <= PERCH + tol)


class Chamber(Prim):
    cls = 0

    def __init__(self, key, d, gi, geo):
        self.id, self.sec = d["id"], key
        self.key = (0, key, self.id)
        self.kind = d["kind"]
        self.c = np.array(d["center"], dtype=np.float64)
        self.sx, self.sy, self.h = (float(v) for v in d["size"])
        self.u = unit2(d.get("axis", [1.0, 0.0]))
        self.geo = gi
        self.amp = float(d.get("noise", geo["noise"]))
        self.bed = geo.get("bedding")
        self.blend = float(d.get("blend", 0.6))
        self.walk = bool(d.get("walk", True))
        self.basin = float(d.get("basin_depth", 1.2)) if self.kind == "lake" else 0.0
        r = 0.5 * math.hypot(self.sx, self.sy) + INFLUENCE + self.amp + self.blend + 0.6
        self.box = (self.c[0] - r, self.c[1] - r, self.c[2] - self.basin - INFLUENCE,
                    self.c[0] + r, self.c[1] + r, self.c[2] + self.h + INFLUENCE + 0.6)

    def local(self, X, Y):
        ux, uy = self.u
        dx, dy = X - self.c[0], Y - self.c[1]
        return dx * ux + dy * uy, -dx * uy + dy * ux

    def plan_sdf(self, lx, ly):
        """Signed distance to the floor outline in plan (negative inside)."""
        hx, hy = 0.5 * self.sx, 0.5 * self.sy
        if self.kind in ("dome", "pocket"):
            r = np.sqrt((lx / hx) ** 2 + (ly / hy) ** 2)
            return (r - 1.0) * min(hx, hy)
        rc = 0.3 if self.kind == "stope" else 0.25 * min(self.sx, self.sy)
        qx, qy = np.abs(lx) - (hx - rc), np.abs(ly) - (hy - rc)
        out = np.sqrt(np.maximum(qx, 0.0) ** 2 + np.maximum(qy, 0.0) ** 2)
        return out + np.minimum(np.maximum(qx, qy), 0.0) - rc

    def eval(self, c):
        lx, ly = self.local(c.X, c.Y)
        v = c.Z - self.c[2]
        hx, hy = 0.5 * self.sx, 0.5 * self.sy
        if self.kind in ("dome", "pocket"):
            m = min(hx, hy, self.h)
            wall = m * (1.0 - np.sqrt((lx / hx) ** 2 + (ly / hy) ** 2 + (v / self.h) ** 2))
        else:
            side = -self.plan_sdf(lx, ly)
            if self.kind == "stope":
                roof = self.h - v
            else:
                roof = self.h * (1.0 - 0.15 * ((lx / hx) ** 2 + (ly / hy) ** 2)) - v
            if self.kind == "breakdown":
                roof = roof + 0.6 * (np.floor(c.nb * 3.0) / 3.0)
            wall = smin(side, roof, 0.8)
        wall0 = wall
        if self.rock is not None:
            wall = wall + rock.detail(c, v, self.rock, self.bed)
        if self.amp > 0:
            wall = wall + noise_term(c.n + (bedding(c.Z, self.bed) if self.bed else 0.0), v, self.amp, c.walls)
        fa = v
        if self.basin > 0:
            inner = 1.0 - np.sqrt((lx / (0.3 * self.sx)) ** 2 + (ly / (0.3 * self.sy)) ** 2)
            fa = np.maximum(v, np.minimum(v + self.basin, inner * 0.3 * min(self.sx, self.sy)))
        out = smin(wall, fa, 0.3)
        if self.rock is not None:
            h = rock.rubble(c, wall0, self.rock)
            if not isinstance(h, float):
                out = np.minimum(out, fa - h)
        return out, v

    def designed(self, x, y, z):
        if not self.walk:
            return np.zeros(len(x), bool)
        lx, ly = self.local(x, y)
        return (self.plan_sdf(lx, ly) <= 0.5) & (z - self.c[2] >= -0.6) & (z - self.c[2] <= PERCH)

    def basin_ring(self, n=16):
        """Points around a lake's basin, 0.6 m out, for its auto guard (rational circle, no trig)."""
        pts = []
        for i in range(n):
            t = -1.0 + 2.0 * i / n  # half circle by t in [-1, 1), mirrored for the other half
            cs, sn = (1 - t * t) / (1 + t * t), 2 * t / (1 + t * t)
            pts.append((cs, sn))
        pts = pts + [(-a, -b) for a, b in pts]
        rx, ry = 0.3 * self.sx + 0.6, 0.3 * self.sy + 0.6
        ux, uy = self.u
        return [(self.c[0] + rx * a * ux - ry * b * uy, self.c[1] + rx * a * uy + ry * b * ux) for a, b in pts]


class Bulge(Prim):
    """Flowstone: a rock swelling on a wall, blended into the field."""
    cls = 2

    def __init__(self, key, d, idx):
        self.id, self.sec = d.get("id", f"flowstone_{idx}"), key
        self.key = (2, key, self.id)
        self.c = np.array(d["at"], dtype=np.float64)
        self.r = float(d.get("radius", 1.0))
        r = self.r + INFLUENCE
        self.box = (self.c[0] - r, self.c[1] - r, self.c[2] - r, self.c[0] + r, self.c[1] + r, self.c[2] + r)

    def eval(self, c):
        return np.sqrt((c.X - self.c[0]) ** 2 + (c.Y - self.c[1]) ** 2 + (c.Z - self.c[2]) ** 2) - self.r, None


class Ctx:
    """Points and their noise. collision: the walker's field (the ramp under stairs, and with walls, the default, the
    upright tube foot and the lower walls without their noise push); the rock rule takes the stairs' ramp only."""

    def __init__(self, X, Y, Z, n, nb, collision=False, walls=None, seed=1):
        self.X, self.Y, self.Z, self.n, self.nb, self.collision = X, Y, Z, n, nb, collision
        self.walls = collision if walls is None else walls
        self.seed = seed
        self._scal = None  # the scallops at these points, made once (meshy_cave_rock.detail)


def union(c, prims, shape, track=False):
    """The network's field from its primitives, in their global order: chambers and passages joined by a smooth
    maximum that keeps floors exact (no blend where both floors are near), flowstone swellings, climb faces by a hard
    maximum, then every clear core by a hard maximum."""
    acc = np.full(shape, -50.0)
    fa = np.full(shape, 50.0)
    dom = np.full(shape, -1, dtype=np.int32) if track else None
    for i, p in enumerate(prims):
        if p.cls == 2:
            b, _ = p.eval(c)
            acc = smin(acc, b, 0.35)
            continue
        b, fb = p.eval(c)
        k = p.blend
        if k <= 0:
            win = b > acc
            acc = np.maximum(acc, b)
        else:
            h = np.clip(0.5 + 0.5 * (acc - b) / k, 0.0, 1.0)
            g = np.clip(np.minimum(fa, fb) / 0.6, 0.0, 1.0)
            win = b > acc
            acc = acc * h + b * (1.0 - h) + (k * g) * h * (1.0 - h)
        fa = np.where(win, fb, fa)
        if track:
            dom = np.where(win, i, dom)
    for p in prims:
        if getattr(p, "core", None) and p.cls == 1:
            acc = np.maximum(acc, p.core_eval(c))
    return (acc, fa, dom) if track else acc


# ---------------------------------------------------------------- the section


class Section:
    """A section with its network: lattice, primitives (its own and its neighbours'), region, openings."""

    def __init__(self, sec, net, netdir, neighbours=()):
        self.d, self.net = sec, net
        self.key = sec["key"]
        lat = net["lattice"]
        self.origin = np.array(lat["origin"], dtype=np.float64)
        self.cell = float(lat["cell"])
        self.block = int(lat.get("block", BLOCK_DEFAULT))
        self.seed = int(net.get("seed", 1))
        self.geology = dict(net.get("geology", {}))
        if not self.geology:
            self.geology = {"limestone": DEFAULT_GEOLOGY}
        self.geo_names = sorted(self.geology)
        self.prims = []
        self.cores = []
        for s in [sec] + list(neighbours):
            self.prims += self.prims_of(s)
        self.prims.sort(key=lambda p: p.key)
        self.own = [p for p in self.prims if getattr(p, "sec", None) == self.key]
        # The region in lattice cells, with each seam's overlap (the cell beyond the plane on its + side) and stub.
        boxes = [self.to_cells(b) for b in sec["region"]["boxes"]]
        self.own_boxes = [[float(v) for v in b] for b in sec["region"]["boxes"]]
        self.openings = []
        self.seam_boxes = []
        self.stub_clips = []
        for sm in sec.get("seams", []):
            ax = 0 if sm["plane"]["axis"] == "x" else 1
            at = sm["plane"]["at"]
            u0, z0, u1, z1 = sm["window"]
            stub = float(sm.get("stub_m", 0.0))
            plus = sm["plane"].get("toward", "+") == "+"
            lo_a, hi_a = (at, at + stub + self.cell) if plus else (at - stub, at)
            b = [0.0] * 6
            b[ax], b[ax + 3] = lo_a, hi_a
            b[1 - ax], b[4 - ax] = u0 - 0.5, u1 + 0.5
            b[2], b[5] = z0 - 0.5, z1 + 0.5
            cb = self.to_cells(b)
            boxes.append(cb)
            self.seam_boxes.append((sm, ax, at, plus))
            if stub > 0:
                # Past the overlap cell the stub is the neighbour's rock clipped to the window's prism (below).
                c0, c1 = (at + self.cell, hi_a + 1.0) if plus else (lo_a - 1.0, at)
                ub = [self.origin[1 - ax] + cb[1 - ax] * self.cell - 0.01, self.origin[1 - ax] + cb[4 - ax] * self.cell + 0.01]
                zb = [self.origin[2] + cb[2] * self.cell - 0.01, self.origin[2] + cb[5] * self.cell + 0.01]
                self.stub_clips.append((ax, c0, c1, ub, zb, (u0 - STUB_CLIP, z0 - STUB_CLIP, u1 + STUB_CLIP, z1 + STUB_CLIP)))
            ob = [float(self.origin[a % 3] + cb[a] * self.cell) for a in range(6)]  # the box as meshed, on the lattice
            far = ob[ax + 3] if plus else ob[ax]
            ob[ax], ob[ax + 3] = far - 1e-6, far + 1e-6
            self.openings.append(ob)
        for o in sec.get("openings", []):
            self.openings.append(list(o["box"]))
        self.boxes = boxes
        lo = np.min([b[:3] for b in boxes], axis=0)
        hi = np.max([b[3:] for b in boxes], axis=0)
        self.lo, self.hi = lo.astype(np.int64), hi.astype(np.int64)

    def clip_stubs(self, X, Y, Z, acc):
        """The field in a seam's stub, past its overlap cell, clipped to the window's prism (the window plus
        STUB_CLIP on every side). The stub meshes the neighbour's rock beyond the plane in a box of the window plus
        0.5 m; wherever the neighbour's passage bends, widens or opens into a room within the stub, its air would meet
        the box's sides and leave the shell open there. The clip closes it with rock 0.25 m inside the box: a hard
        minimum, so where the neighbour's air stays inside the prism (at the plane, by validation, and down a straight
        stub) the surface is the neighbour's own. Elementwise on broadcast arrays."""
        for ax, c0, c1, ub, zb, (u0, z0, u1, z1) in self.stub_clips:
            A, U = (X, Y) if ax == 0 else (Y, X)
            inside = (A > c0) & (A < c1) & (U > ub[0]) & (U < ub[1]) & (Z > zb[0]) & (Z < zb[1])
            for b in self.own_boxes:  # never the section's own region
                inside = inside & ~((X > b[0]) & (X < b[3]) & (Y > b[1]) & (Y < b[4]) & (Z > b[2]) & (Z < b[5]))
            if not np.any(inside):
                continue
            prism = np.minimum(np.minimum(U - u0, u1 - U), np.minimum(Z - z0, z1 - Z))
            acc = np.where(inside, np.minimum(acc, prism), acc)
        return acc

    def to_cells(self, b):
        o, c = self.origin, self.cell
        return [int(round((b[a] - o[a]) / c)) for a in range(3)] + [int(round((b[a + 3] - o[a]) / c)) for a in range(3)]

    def geo_of(self, name):
        name = name or self.d.get("geology") or self.geo_names[0]
        if name not in self.geology:
            name = self.geo_names[0]
        g = dict(DEFAULT_GEOLOGY)
        g.update(self.geology[name])
        return self.geo_names.index(name), g

    def prims_of(self, s):
        out = []
        nodes = s.get("nodes", {})
        for p in s.get("passages", []):
            gi, g = self.geo_of(p.get("geology") or s.get("geology"))
            q = Passage(s["key"], p, nodes, gi, g)
            rk = rock.profile(self.geo_names[gi], g)
            if q.profile in ("tube", "canyon", "keyhole", "rift"):
                q.rock = rk  # natural passages; a mine's drift is hewn, crawls, fissures and faces keep their limits
            if q.profile in WALK_PROFILES and q.floor_kind != "stairs":
                q.rubble = rk
            out.append(q)
        for c in s.get("chambers", []):
            gi, g = self.geo_of(c.get("geology") or s.get("geology"))
            q = Chamber(s["key"], c, gi, g)
            if q.kind != "stope":
                q.rock = rk = rock.profile(self.geo_names[gi], g)
                q.rubble = rk
            out.append(q)
        for i, f in enumerate(s.get("features", [])):
            if f["kind"] == "flowstone":
                out.append(Bulge(s["key"], f, i))
        return out

    def node_xyz(self, g):
        return self.origin + np.asarray(g, dtype=np.float64) * self.cell

    def cell_mask(self, g0, n):
        """Cells of the block at lattice index g0 (x, y, z) that lie in the region, as [z, y, x]."""
        m = np.zeros((n, n, n), dtype=bool)
        for b in self.boxes:
            x0, x1 = max(b[0] - g0[0], 0), min(b[3] - g0[0], n)
            y0, y1 = max(b[1] - g0[1], 0), min(b[4] - g0[1], n)
            z0, z1 = max(b[2] - g0[2], 0), min(b[5] - g0[2], n)
            if x0 < x1 and y0 < y1 and z0 < z1:
                m[z0:z1, y0:y1, x0:x1] = True
        return m

    # ---- field evaluation

    def prims_for(self, box):
        return [p for p in self.prims if p.hits(box)]

    def field_block(self, g0, collision=False, prims=None):
        n = self.block + 1
        lo = self.node_xyz(g0)
        hi = self.node_xyz(np.asarray(g0) + self.block)
        box = (lo[0], lo[1], lo[2], hi[0], hi[1], hi[2])
        ps = self.prims_for(box) if prims is None else prims
        if not ps:
            return None
        X = (self.origin[0] + (g0[0] + np.arange(n)) * self.cell)[None, None, :]
        Y = (self.origin[1] + (g0[1] + np.arange(n)) * self.cell)[None, :, None]
        Z = (self.origin[2] + (g0[2] + np.arange(n)) * self.cell)[:, None, None]
        nl = noise_block(g0, n, NOISE_LUMP, self.seed)
        nb = noise_block(g0, n, NOISE_BIG, self.seed * 7 + 3)
        c = Ctx(X, Y, Z, 0.65 * nl + 0.35 * nb, nb, collision, seed=self.seed)
        acc = union(c, ps, (n, n, n))
        return self.clip_stubs(X, Y, Z, acc) if self.stub_clips else acc

    def field_points(self, P, track=False, collision=False, cores=True):
        """The field at points P (N, 3), per point (for checks and attributes). With track, also the floor term and
        the index of the primitive that set the value, and the field before the clear cores."""
        P = np.asarray(P, dtype=np.float64)
        N = len(P)
        acc = np.full(N, -50.0)
        fa = np.full(N, 50.0)
        dom = np.full(N, -1, dtype=np.int32)
        if N == 0:
            return (acc, fa, dom, acc.copy()) if track else acc
        u = (P - self.origin) / self.cell
        nl = noise_points(u, NOISE_LUMP, self.seed)
        nb = noise_points(u, NOISE_BIG, self.seed * 7 + 3)
        n = 0.65 * nl + 0.35 * nb
        lo, hi = P.min(axis=0), P.max(axis=0)
        ps = self.prims_for((lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]))
        for p in ps:
            b = p.box
            m = ((P[:, 0] >= b[0]) & (P[:, 0] <= b[3]) & (P[:, 1] >= b[1]) & (P[:, 1] <= b[4])
                 & (P[:, 2] >= b[2]) & (P[:, 2] <= b[5]))
            if not m.any():
                continue
            idx = np.nonzero(m)[0]
            c = Ctx(P[idx, 0], P[idx, 1], P[idx, 2], n[idx], nb[idx], collision, seed=self.seed)
            if p.cls == 2:
                bv, _ = p.eval(c)
                acc[idx] = smin(acc[idx], bv, 0.35)
                continue
            bv, fb = p.eval(c)
            a0, f0 = acc[idx], fa[idx]
            k = p.blend
            win = bv > a0
            if k <= 0:
                a1 = np.maximum(a0, bv)
            else:
                h = np.clip(0.5 + 0.5 * (a0 - bv) / k, 0.0, 1.0)
                g = np.clip(np.minimum(f0, fb) / 0.6, 0.0, 1.0)
                a1 = a0 * h + bv * (1.0 - h) + (k * g) * h * (1.0 - h)
            acc[idx] = a1
            fa[idx] = np.where(win, fb, f0)
            dom[idx] = np.where(win, self.prims.index(p), dom[idx])
        rock = acc.copy() if track else None
        for p in ps if cores else ():
            if getattr(p, "core", None) and p.cls == 1:
                b = p.box
                m = ((P[:, 0] >= b[0]) & (P[:, 0] <= b[3]) & (P[:, 1] >= b[1]) & (P[:, 1] <= b[4])
                     & (P[:, 2] >= b[2]) & (P[:, 2] <= b[5]))
                if m.any():
                    idx = np.nonzero(m)[0]
                    c = Ctx(P[idx, 0], P[idx, 1], P[idx, 2], n[idx], nb[idx], collision)
                    acc[idx] = np.maximum(acc[idx], p.core_eval(c))
        if self.stub_clips:
            acc = self.clip_stubs(P[:, 0], P[:, 1], P[:, 2], acc)
            if track:
                rock = self.clip_stubs(P[:, 0], P[:, 1], P[:, 2], rock)
        return (acc, fa, dom, rock) if track else acc

    def column(self, x, y, z_hint, zlo=None, zhi=None, step=0.03125):
        """(floor, roof) of the air around (x, y, z_hint), by scanning the field up the column."""
        zlo = z_hint - 4.0 if zlo is None else zlo
        zhi = z_hint + 16.0 if zhi is None else zhi
        zs = np.arange(zlo, zhi, step)
        f = self.field_points(np.stack([np.full(len(zs), x), np.full(len(zs), y), zs], axis=1))
        air = f > 0
        i = int(np.argmin(np.abs(zs - z_hint)))
        if not air[i]:
            up = np.nonzero(air[i:])[0]
            if not len(up):
                return None, None
            i += int(up[0])
        k0 = i
        while k0 > 0 and air[k0 - 1]:
            k0 -= 1
        k1 = i
        while k1 < len(zs) - 1 and air[k1 + 1]:
            k1 += 1
        fl = zs[k0] - step * f[k0] / (f[k0] - f[k0 - 1]) if k0 > 0 else zs[0]
        rf = zs[k1] + step * f[k1] / (f[k1] - f[k1 + 1]) if k1 < len(zs) - 1 else zs[-1]
        return float(fl), float(rf)


# ---------------------------------------------------------------- rock between passages


SEPARATION = 0.6  # metres of rock between two passages not joined: their 0.3 m dilations must not overlap


_NOISE_MEMO = []  # the last few (sec seed, points, noise): the rock rule evaluates two primitives at the same points


def prim_noise(sec, P):
    for seed, Q, nz in _NOISE_MEMO:
        if seed == sec.seed and Q.shape == P.shape and np.array_equal(Q, P):
            return nz
    u = (P - sec.origin) / sec.cell
    nl = noise_points(u, NOISE_LUMP, sec.seed)
    nb = noise_points(u, NOISE_BIG, sec.seed * 7 + 3)
    nz = (0.65 * nl + 0.35 * nb, nb)
    _NOISE_MEMO.insert(0, (sec.seed, P.copy(), nz))
    del _NOISE_MEMO[2:]
    return nz


def prim_field(sec, p, P, collision=True):
    """One primitive's own field at points P (N, 3), with the network's noise."""
    P = np.asarray(P, dtype=np.float64)
    n, nb = prim_noise(sec, P)
    return p.eval(Ctx(P[:, 0], P[:, 1], P[:, 2], n, nb, collision, walls=False))[0]


def rock_depth(sec, p, P, h=0.03):
    """How deep in rock each point lies for primitive p, in metres: -f / |grad f| (0 in its air). The fields are
    distance-like but not all unit-gradient (a tube's ellipse is scaled), so the gradient sets the metre."""
    P = np.asarray(P, dtype=np.float64)
    n = len(P)
    offs = np.array([[0, 0, 0], [h, 0, 0], [-h, 0, 0], [0, h, 0], [0, -h, 0], [0, 0, h], [0, 0, -h]], dtype=np.float64)
    f = prim_field(sec, p, (P[None, :, :] + offs[:, None, :]).reshape(-1, 3)).reshape(7, n)
    g = np.sqrt(((f[1] - f[2]) ** 2 + (f[3] - f[4]) ** 2 + (f[5] - f[6]) ** 2)) / (2 * h)
    return np.maximum(-f[0] / np.maximum(g, 0.05), 0.0)


def rock_foot(sec, p, P, iters=6, h=0.02):
    """The distance from each point in p's rock to p's air, by Newton steps onto its surface (x -= f grad / |grad|^2):
    a nearby surface point, so the length is at least the true distance and about equal to it. 0 in the air."""
    X = np.array(P, dtype=np.float64)
    n = len(X)
    offs = np.array([[0, 0, 0], [h, 0, 0], [-h, 0, 0], [0, h, 0], [0, -h, 0], [0, 0, h], [0, 0, -h]], dtype=np.float64)
    f0 = prim_field(sec, p, X)
    for _ in range(iters):
        f = prim_field(sec, p, (X[None, :, :] + offs[:, None, :]).reshape(-1, 3)).reshape(7, n)
        g = np.stack([f[1] - f[2], f[3] - f[4], f[5] - f[6]], 1) / (2 * h)
        g2 = np.maximum((g * g).sum(1), 1e-4)
        step = np.where(f[0] < 0, -f[0] / g2, 0.0)
        X = X + step[:, None] * g
    out = np.linalg.norm(X - P, axis=1)
    return np.where(f0 > 0, 0.0, out)


def _end_joins(e, q):
    """Does a passage end (floor point e) open into primitive q: inside a chamber's footprint and height, on another
    passage's centre line (a junction), at a climb face's foot or top, or in a shaft?"""
    if isinstance(q, Chamber):
        lx, ly = q.local(np.array([e[0]]), np.array([e[1]]))
        return bool(q.plan_sdf(lx, ly)[0] <= 1.0) and q.c[2] - q.basin - 1.0 <= e[2] <= q.c[2] + q.h
    if not isinstance(q, Passage):
        return False
    if q.profile == "climb_face":
        return any(float(np.linalg.norm(q.P[i] - e)) <= 0.6 for i in (0, -1))
    if q.profile == "shaft":
        d = math.hypot(e[0] - q.P[0, 0], e[1] - q.P[0, 1])
        return d <= 0.5 * max(q.w) + 0.5 and q.P[0, 2] - 0.6 <= e[2] <= q.P[-1, 2] + max(q.h)
    d, jj, tj = q.plan(np.array([e[0]]), np.array([e[1]]))
    W, _ = q.size_at(jj, tj)
    _, base, _ = q.floors(jj, tj, np.array([e[2]]), True)
    return bool(d[0] <= 0.5 * W[0] + 0.5) and abs(e[2] - float(base[0])) <= 1.0


def _cross(p, q):
    """Do two passages' centre lines cross in plan with their floors within a metre there (an X junction)?"""
    for i in range(len(p.A)):
        for j in range(len(q.A)):
            a, b, c, d = p.A[i], p.B[i], q.A[j], q.B[j]
            r = (b[0] - a[0], b[1] - a[1])
            s = (d[0] - c[0], d[1] - c[1])
            den = r[0] * s[1] - r[1] * s[0]
            if abs(den) < 1e-12:
                continue
            t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den
            u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den
            za, zc = a[2] + t * (b[2] - a[2]), c[2] + u * (d[2] - c[2])
            if 0.0 <= t <= 1.0 and 0.0 <= u <= 1.0 and abs(za - zc) <= 1.0:
                return True
    return False


def joined(sec, a, b, declared):
    """Declared in `joins`, or meeting by construction: a passage's end or via point opening into the other (a
    chamber's footprint, another passage's centre line, a climb's foot or top, a shaft), a passage's centre line
    running through a chamber's air, or two centre lines crossing at one level."""
    if frozenset((a.id, b.id)) in declared:
        return True
    return built_join(sec, a, b)


def built_join(sec, a, b):
    """Joined by construction (see joined)."""
    for p, q in ((a, b), (b, a)):
        if isinstance(p, Passage) and isinstance(q, Chamber) and p.hits(q.box):
            if bool((prim_field(sec, q, centre_line(p)[0]) > 0).any()):
                return True
    for p, q in ((a, b), (b, a)):
        if isinstance(p, Passage) and any(_end_joins(v, q) for v in p.P):
            return True
    level = ("climb_face", "shaft")
    if isinstance(a, Passage) and isinstance(b, Passage) and a.profile not in level and b.profile not in level:
        return _cross(a, b)
    return False


JUNCTION_TAPER = 1.2  # metres past a mouth's rim where the rock beside a junction may still be under SEPARATION
SHARED_MARGIN = 0.25  # metres into a shared chamber's rock before the rock between two passages opening into it counts


def _polyline(pts, step):
    pts = np.asarray(pts, dtype=np.float64)
    out = [pts[:1]]
    for a, b in zip(pts[:-1], pts[1:]):
        n = max(1, int(math.ceil(np.linalg.norm(b - a) / step)))
        out.append(a + (b - a) * (np.arange(1, n + 1) / n)[:, None])
    return np.concatenate(out)


def centre_line(p, step=0.125):
    """Points along a passage's centre line at mid height, with the passage's half size (the mouth's radius) there.
    A climb face's line runs from its approach to the foot, up the face and back over the ledge to the top; a
    shaft's up its axis."""
    r = 0.5 * max(max(p.w), max(p.h))
    if p.profile == "climb_face":
        f, t, dx, dy = p.P[0], p.P[1], p.dir[0], p.dir[1]
        hm = 0.5 * max(p.h)
        C = _polyline([(f[0] - p.approach * dx, f[1] - p.approach * dy, f[2] + hm), (f[0], f[1], f[2] + hm),
                       (f[0], f[1], t[2] + hm), (t[0], t[1], t[2] + hm)], step)
        return C, np.full(len(C), r)
    if p.profile == "shaft":
        C = _polyline([p.P[0], p.P[-1] + (0.0, 0.0, max(p.h))], step)
        return C, np.full(len(C), r)
    ss = np.r_[np.arange(0.0, p.S, step), p.S]
    j = np.clip(np.searchsorted(p.cum, ss, side="right") - 1, 0, len(p.A) - 1)
    t = np.clip((ss - p.cum[j]) / p.L[j], 0.0, 1.0)
    x = p.A[j, 0] + t * (p.B[j, 0] - p.A[j, 0])
    y = p.A[j, 1] + t * (p.B[j, 1] - p.A[j, 1])
    _, _, stepf = p.floors(j, t, np.zeros(len(j)), False)
    W, H = p.size_at(j, t)
    return np.stack([x, y, stepf + 0.5 * H], 1), 0.5 * np.maximum(W, H)


def junctions(sec, a, b):
    """Where two primitives joined by construction meet: the part of each passage's centre line inside the other's
    air, the samples either side of where it crosses in or out (a mouth), and each joining end or via point (raised
    to mid height, standing for the passage's cap), each with the passage's half size there."""
    J, R = [], []
    for p, q in ((a, b), (b, a)):
        if not isinstance(p, Passage):
            continue
        C, r = centre_line(p)
        inside = prim_field(sec, q, C) > 0
        k = np.nonzero(inside[1:] != inside[:-1])[0]
        sel = inside.copy()
        sel[k] = sel[k + 1] = True
        J.append(C[sel])
        R.append(r[sel])
        for v in p.P:
            if _end_joins(v, q):
                hm = 0.5 * max(p.h)
                J.append(np.array([v, v + (0.0, 0.0, hm)]))
                R.append(np.full(2, 0.5 * max(max(p.w), max(p.h))))
    if not J:
        return np.zeros((0, 3)), np.zeros(0)
    return np.concatenate(J), np.concatenate(R)


def separation(sec, log=print):
    """Pairs of passages and chambers (at least one of this section's) with the least rock between them. A pair that
    is not joined needs SEPARATION everywhere. A pair joined by construction needs it everywhere but at its mouths
    (within the mouth's radius plus JUNCTION_TAPER of the part of a centre line inside the other's air, or of a
    joining end) and within SHARED_MARGIN of a third primitive both open into (a shared chamber); a climb face or a
    shaft joined to the other is a mouth over its whole height and is not measured. A pair declared in `joins`, and two
    chambers whose air overlaps, are one space. Returns (errors, rows)."""
    t0 = time.time()
    declared = {frozenset(j) for j in sec.d.get("joins", [])}
    prims = [p for p in sec.prims if isinstance(p, (Passage, Chamber))]
    rows, errs = [], []
    coarse = 0.5
    for i in range(len(prims)):
        for j in range(i + 1, len(prims)):
            a, b = prims[i], prims[j]
            if a.sec != sec.key and b.sec != sec.key:
                continue
            if not a.hits(b.box) or frozenset((a.id, b.id)) in declared:
                continue
            built = built_join(sec, a, b)
            if built and any(isinstance(q, Passage) and q.profile in ("climb_face", "shaft") for q in (a, b)):
                continue  # a face or a shaft is a mouth over its whole height: joined, it is one space with the other
            JP, JR = junctions(sec, a, b) if built else (np.zeros((0, 3)), np.zeros(0))
            shared = [c for c in prims if c is not a and c is not b and c.hits(a.box) and c.hits(b.box)
                      and joined(sec, a, c, declared) and joined(sec, b, c, declared)]

            def away(P, JP=JP, JR=JR, shared=shared, slack=0.0):
                """The points that count: not at a mouth of this pair, not inside a primitive both open into. With
                slack, a coarse point is kept if any point within slack of it may count (mouths only)."""
                keep = np.ones(len(P), bool)
                for k0 in range(0, len(JP), 16):
                    jp, jr = JP[k0:k0 + 16], JR[k0:k0 + 16]
                    d = np.linalg.norm(P[:, None, :] - jp[None, :, :], axis=2)
                    keep &= (d > jr[None, :] + JUNCTION_TAPER - slack).all(1)
                if slack:
                    return keep
                for c in shared:  # a rock path through the shared space, or along its wall, is no wall between them
                    if keep.any():
                        keep[keep] = rock_depth(sec, c, P[keep]) >= SHARED_MARGIN
                return keep
            lo = np.maximum(a.box[:3], b.box[:3])
            hi = np.minimum(a.box[3:], b.box[3:])
            axes = [np.arange(lo[k], hi[k] + 1e-9, coarse) for k in range(3)]
            if any(len(v) == 0 for v in axes):
                continue
            G = np.stack(np.meshgrid(*axes, indexing="ij"), -1).reshape(-1, 3)
            if built:  # coarse points whose whole fine neighbourhood lies at a mouth are not looked at
                G = G[away(G, slack=2 * 0.125 * 1.7320508 + 1e-6)]
                if not len(G):
                    continue
            fa, fb = prim_field(sec, a, G), prim_field(sec, b, G)
            # the fields grow about a metre per metre (1.3 with noise and bedding at most), so a pair closer than
            # SEPARATION has a coarse point whose summed depth is under SEPARATION + that slope over a half diagonal
            s = np.maximum(-fa, 0.0) + np.maximum(-fb, 0.0)
            near = s < SEPARATION + 1.3 * 2.0 * coarse * 0.8660254 + 0.1
            if not near.any():
                continue
            fine = 0.125
            Gn = G[near]
            k = np.arange(-2, 3) * fine
            offs = np.stack(np.meshgrid(k, k, k, indexing="ij"), -1).reshape(-1, 3)
            Q = np.round((Gn[:, None, :] + offs[None, :, :]).reshape(-1, 3) / fine).astype(np.int64)
            q0 = Q.min(0)
            span = Q.max(0) - q0 + 1
            key = np.unique(((Q[:, 0] - q0[0]) * span[1] + (Q[:, 1] - q0[1])) * span[2] + (Q[:, 2] - q0[2]))
            P = np.stack([key // (span[1] * span[2]) + q0[0], (key // span[2]) % span[1] + q0[1],
                          key % span[2] + q0[2]], 1) * fine
            # raw depths are no more than the metric ones (slopes at most 1 away from noise), so this keeps every
            # point that could be closer than the threshold
            raw = np.maximum(-prim_field(sec, a, P), 0.0) + np.maximum(-prim_field(sec, b, P), 0.0)
            P = P[raw < SEPARATION + 0.4]
            if len(P) and (built or shared):
                P = P[away(P)]
            if not len(P):
                continue
            da, db = rock_depth(sec, a, P), rock_depth(sec, b, P)
            both_air = bool(((da <= 0) & (db <= 0)).any())
            # the first-order depths run short of the real distance away from a surface, so the closest points are
            # measured again by stepping onto each surface (an upper bound per point, the least of them the gap)
            lb = da + db
            keep = np.nonzero(lb < SEPARATION + 0.3)[0]
            if len(keep) > 1500:
                keep = keep[np.argsort(lb[keep], kind="stable")[:1500]]
            if both_air or not len(keep):
                gap, P = lb, P
            else:
                P = P[keep]
                gap = rock_foot(sec, a, P) + rock_foot(sec, b, P)
            at = int(np.argmin(gap))
            g = float(gap[at])
            chambers = isinstance(a, Chamber) and isinstance(b, Chamber)
            if chambers and both_air:
                continue
            row = {"a": a.id, "b": b.id, "rock_m": round(g, 3), "at": [round(float(v), 2) for v in P[at]],
                   "joined": bool(built)}
            rows.append(row)
            if g < SEPARATION - 0.02:
                what = "their air meets" if both_air else f"{g:.2f} m of rock between them"
                if built:
                    errs.append(f"{a.id} and {b.id} are joined, but away from their mouths {what} near {row['at']} "
                                f"(at least {SEPARATION} m once {JUNCTION_TAPER} m past a mouth's rim; move them "
                                "apart, or list the pair in `joins` if they are meant as one space)")
                else:
                    errs.append(f"{a.id} and {b.id} are not joined but {what} near {row['at']} (at least "
                                f"{SEPARATION} m; join them at a node, in a chamber, or in `joins`)")
    log(f"  rock between passages: {len(rows)} unjoined pairs within reach, {len(errs)} too close, "
        f"{time.time() - t0:.1f} s")
    return errs, rows


# ---------------------------------------------------------------- marching cubes: the table, built and checked

CORNERS = [(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0), (0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)]
EDGES = [(0, 1), (1, 2), (3, 2), (0, 3), (4, 5), (5, 6), (7, 6), (4, 7), (0, 4), (1, 5), (2, 6), (3, 7)]
FACES = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (3, 7, 6, 2), (0, 4, 7, 3), (1, 2, 6, 5)]


def _mc_table():
    """The 256-case triangle table, made from one rule applied to every cube face: a face's segments cut off its rock
    corners. Neighbouring cubes see a shared face the same way, so the surface is closed; the segments of a cube
    chain into loops, fanned into triangles, wound so that normals face the air."""
    edge_of = {frozenset(e): i for i, e in enumerate(EDGES)}
    tris = []
    for case in range(256):
        air = [(case >> i) & 1 for i in range(8)]
        nxt = {}
        for f in FACES:
            cr = []
            for k in range(4):
                a, b = f[k], f[(k + 1) % 4]
                if air[a] != air[b]:
                    cr.append((edge_of[frozenset((a, b))], air[a] == 1))
            for i, (e, a2r) in enumerate(cr):
                if a2r:
                    nxt[e] = cr[(i + 1) % len(cr)][0]
        loops, used = [], set()
        for s in sorted(nxt):
            if s in used:
                continue
            loop, cur = [s], nxt[s]
            used.add(s)
            while cur != s:
                loop.append(cur)
                used.add(cur)
                cur = nxt[cur]
            loops.append(loop)
        tl = []
        for lp in loops:
            for i in range(1, len(lp) - 1):
                tl.append((lp[0], lp[i], lp[i + 1]))
        tris.append(tl)
    nt = np.array([len(t) for t in tris], dtype=np.int64)
    T = np.full((256, max(nt.max(), 1), 3), -1, dtype=np.int64)
    for c, tl in enumerate(tris):
        for i, t in enumerate(tl):
            T[c, i] = t
    base = np.array([[min(CORNERS[a][k], CORNERS[b][k]) for k in range(3)] for a, b in EDGES], dtype=np.int64)
    axis = np.array([[k for k in range(3) if CORNERS[a][k] != CORNERS[b][k]][0] for a, b in EDGES], dtype=np.int64)
    return T, nt, base, axis


MC_TRI, MC_NT, MC_EBASE, MC_EAXIS = _mc_table()


def edge_ids(gx, gy, gz, ax):
    return (((gz << 20) | gy) << 20 | gx) << 2 | ax


def mc_block(F, mask, g0, n, cell, origin):
    """Marching cubes on one block: F the (n+1)^3 field [z, y, x], mask the (n)^3 cells to mesh. Returns triangles as
    global edge ids (T, 3), each triangle's cell (T, 3: x, y, z) and the block's vertices (ids, positions in 1e-5 m)."""
    air = F > 0
    case = np.zeros((n, n, n), dtype=np.int64)
    for i, (cx, cy, cz) in enumerate(CORNERS):
        case |= air[cz:cz + n, cy:cy + n, cx:cx + n].astype(np.int64) << i
    act = (case != 0) & (case != 255) & mask
    kz, ky, kx = np.nonzero(act)
    if not len(kz):
        return None
    cs = case[kz, ky, kx]
    nt = MC_NT[cs]
    tot = int(nt.sum())
    owner = np.repeat(np.arange(len(cs)), nt)
    first = np.cumsum(nt) - nt
    rank = np.arange(tot) - first[owner]
    le = MC_TRI[cs[owner], rank]  # (T, 3)
    bx = kx[owner][:, None] + MC_EBASE[le, 0]
    by = ky[owner][:, None] + MC_EBASE[le, 1]
    bz = kz[owner][:, None] + MC_EBASE[le, 2]
    ax = MC_EAXIS[le]
    gid = edge_ids(g0[0] + bx, g0[1] + by, g0[2] + bz, ax)
    ug, first_i = np.unique(gid.ravel(), return_index=True)
    vx, vy, vz, va = bx.ravel()[first_i], by.ravel()[first_i], bz.ravel()[first_i], ax.ravel()[first_i]
    f0 = F[vz, vy, vx]
    f1 = F[vz + (va == 2), vy + (va == 1), vx + (va == 0)]
    t = f0 / (f0 - f1)
    pos = np.stack([origin[0] + (g0[0] + vx) * cell, origin[1] + (g0[1] + vy) * cell,
                    origin[2] + (g0[2] + vz) * cell], axis=1)
    pos[np.arange(len(va)), va] += t * cell
    q = np.rint(pos * Q).astype(np.int64)
    cells = np.stack([g0[0] + kx[owner], g0[1] + ky[owner], g0[2] + kz[owner]], axis=1)
    return gid, cells, ug, q


def weld(parts):
    """Joins block meshes by their global edge ids: (vertices q (V, 3), faces (F, 3), face cells (F, 3))."""
    if not parts:
        return np.zeros((0, 3), np.int64), np.zeros((0, 3), np.int64), np.zeros((0, 3), np.int64)
    gid = np.concatenate([p[0] for p in parts])
    cells = np.concatenate([p[1] for p in parts])
    ids = np.concatenate([p[2] for p in parts])
    q = np.concatenate([p[3] for p in parts])
    uid, fi = np.unique(ids, return_index=True)
    faces = np.searchsorted(uid, gid)
    return q[fi], faces, cells


def cancel_pairs(F, cells):
    """Drops each pair of faces on the same three vertices wound opposite ways: where the field is exactly zero on
    a lattice node, the cubes either side of it can each emit the same triangle, back to back, which leaves a
    zero-area sliver and four faces on its edges (the Well Dome's shell had four such pairs). The pair encloses
    nothing, so removing both keeps the shell closed."""
    if not len(F):
        return F, cells
    S = np.sort(F, axis=1)
    n = int(F.max()) + 1
    key = (S[:, 0] * n + S[:, 1]) * n + S[:, 2]
    u, inv, cnt = np.unique(key, return_inverse=True, return_counts=True)
    inv = inv.ravel()
    dup = cnt[inv] == 2
    if not dup.any():
        return F, cells
    # orientation: the parity of the permutation that sorts the face
    r = np.argsort(F, axis=1)
    par = ((r[:, 0] > r[:, 1]).astype(int) + (r[:, 0] > r[:, 2]) + (r[:, 1] > r[:, 2])) % 2
    drop = np.zeros(len(F), bool)
    idx = np.nonzero(dup)[0]
    order = idx[np.argsort(inv[idx], kind="stable")]
    a, b = order[0::2], order[1::2]
    opp = par[a] != par[b]
    drop[a[opp]] = True
    drop[b[opp]] = True
    return F[~drop], cells[~drop]


def edges_of(F):
    e = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]])
    return np.sort(e, axis=1)


def unique_edges(F):
    """Undirected edges of a triangle list and how many faces use each (by integer keys, fast)."""
    e = edges_of(F)
    n = int(F.max()) + 1 if len(F) else 1
    u, c = np.unique(e[:, 0] * n + e[:, 1], return_counts=True)
    return np.stack([u // n, u % n], 1), c


def boundary_edges(F):
    u, c = unique_edges(F)
    return u[c == 1], int((c > 2).sum())


# ---------------------------------------------------------------- collision decimation (planar, vectorised)


def decimate_planar(V, F, angle_deg=5.0, rounds=40, seed=11):
    """Collapses vertices whose faces all lie within angle_deg of one plane onto a neighbour, in rounds of
    independent collapses (no two touching rings), keeping the link condition and refusing flips. Boundary vertices
    stay. Positions never move, so planar floors stay exact."""
    V = np.asarray(V, dtype=np.float64)
    F = np.asarray(F, dtype=np.int64)
    cosl = math.cos(math.radians(angle_deg))
    nv = len(V)
    for rnd in range(rounds):
        if len(F) == 0:
            break
        a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
        nrm = np.cross(b - a, c - a)
        ln = np.sqrt((nrm ** 2).sum(1))
        good = ln > 1e-12
        un = np.where(good[:, None], nrm / np.where(good, ln, 1.0)[:, None], 0.0)
        ue, cnt = unique_edges(F)
        bverts = np.zeros(nv, bool)
        bverts[ue[cnt != 2].ravel()] = True
        # vertex normals and flatness
        vn = np.zeros((nv, 3))
        for k in range(3):
            np.add.at(vn, F[:, k], nrm)
        vl = np.sqrt((vn ** 2).sum(1))
        vn = vn / np.where(vl > 1e-12, vl, 1.0)[:, None]
        mind = np.ones(nv)
        for k in range(3):
            np.minimum.at(mind, F[:, k], (un * vn[F[:, k]]).sum(1))
        bad = np.zeros(nv, bool)
        for k in range(3):
            bad[F[:, k][~good]] = True
        flat = (mind >= cosl) & ~bverts & ~bad & (vl > 1e-12)
        # adjacency (CSR of unique edges, both ways)
        src = np.concatenate([ue[:, 0], ue[:, 1]])
        dst = np.concatenate([ue[:, 1], ue[:, 0]])
        order = np.lexsort((dst, src))
        src, dst = src[order], dst[order]
        indptr = np.zeros(nv + 1, np.int64)
        np.add.at(indptr, src + 1, 1)
        indptr = np.cumsum(indptr)
        pri = _hash3(np.arange(nv), rnd, seed, 77)
        pri = np.where(flat, pri, -2.0)
        nbmax = np.full(nv, -3.0)
        np.maximum.at(nbmax, src, pri[dst])
        sel = flat & (pri > nbmax)  # independent: no two picked vertices touch
        # each picked vertex collapses onto a neighbour that touches no other picked vertex, so the collapses of
        # one round change disjoint sets of edges
        nsel = np.zeros(nv, np.int64)
        np.add.at(nsel, dst[sel[src]], 1)
        vs = np.nonzero(sel)[0]
        if not len(vs):
            break
        deg = indptr[vs + 1] - indptr[vs]
        rep = np.repeat(np.arange(len(vs)), deg)
        nbrs = dst[np.repeat(indptr[vs], deg) + (np.arange(deg.sum()) - np.repeat(np.cumsum(deg) - deg, deg))]
        free = nsel[nbrs] == 1
        nfree = np.bincount(rep, weights=free, minlength=len(vs)).astype(np.int64)
        rankf = np.cumsum(free) - 1 - np.repeat(np.cumsum(np.r_[0, np.bincount(rep, weights=free,
                                                                              minlength=len(vs))[:-1]]).astype(
            np.int64), deg)
        want = (rnd * 7 + vs) % np.maximum(nfree, 1)
        chosen = free & (rankf == want[rep])
        us = np.full(len(vs), -1, np.int64)
        us[rep[chosen]] = nbrs[chosen]
        has = us >= 0
        # link condition: |N(v) & N(u)| == 2
        keys = ue[:, 0] * nv + ue[:, 1]
        uu = np.where(has[rep], us[rep], nbrs)
        lo_, hi_ = np.minimum(nbrs, uu), np.maximum(nbrs, uu)
        common = np.isin(lo_ * nv + hi_, keys) & (nbrs != uu)
        ncom = np.bincount(rep, weights=common, minlength=len(vs))
        okl = (ncom == 2) & has
        # flip check on the faces of v that do not hold u
        target = np.arange(nv)
        target[vs[okl]] = us[okl]
        moved = target[F]
        changed = (moved != F).any(1)
        deg_face = (moved[:, 0] == moved[:, 1]) | (moved[:, 1] == moved[:, 2]) | (moved[:, 0] == moved[:, 2])
        chk = changed & ~deg_face
        if chk.any():
            na = np.cross(V[moved[chk, 1]] - V[moved[chk, 0]], V[moved[chk, 2]] - V[moved[chk, 0]])
            nl = np.sqrt((na ** 2).sum(1))
            okf = (nl > 1e-10) & ((na * un[chk]).sum(1) >= cosl * nl)
            badf = np.nonzero(chk)[0][~okf]
            if len(badf):
                badv = np.unique(F[badf][(moved[badf] != F[badf])])
                target[badv] = badv
                moved = target[F]
                deg_face = (moved[:, 0] == moved[:, 1]) | (moved[:, 1] == moved[:, 2]) | (moved[:, 0] == moved[:, 2])
        before = len(F)
        F = moved[~deg_face]
        if before - len(F) < max(4, 0.002 * before):
            break
    used = np.unique(F)
    remap = np.full(nv, -1, np.int64)
    remap[used] = np.arange(len(used))
    return V[used], remap[F]


# ---------------------------------------------------------------- meshes for formations and proxies


S8 = math.sqrt(0.5)
RING8 = [(1.0, 0.0), (S8, S8), (0.0, 1.0), (-S8, S8), (-1.0, 0.0), (-S8, -S8), (0.0, -1.0), (S8, -S8)]


class MeshBuf:
    def __init__(self):
        self.v, self.f, self.tag, self.geo, self.piece = [], [], [], [], []
        self.n_pieces = 0

    def add(self, verts, faces, tag, geo=-1):
        base = len(self.v)
        self.piece += [self.n_pieces] * len(faces)
        self.n_pieces += 1
        self.v += [tuple(p) for p in verts]
        self.f += [(int(a) + base, int(b) + base, int(c) + base) for a, b, c in faces]
        self.tag += [tag] * len(faces)
        self.geo += [geo] * len(faces)

    def tube(self, rings, tag, cap_top=True, tip=None, tip_top=None):
        """Rings of (cx, cy, cz, r, (c, s)) joined by quads; a tip point closes the last ring, a cap the first."""
        verts, faces, n = [], [], len(RING8)
        for cx, cy, cz, r, (rc, rs) in rings:
            for x, y in RING8:
                verts.append((cx + r * (x * rc - y * rs), cy + r * (x * rs + y * rc), cz))
        for i in range(len(rings) - 1):
            for k in range(n):
                a, b = i * n + k, i * n + (k + 1) % n
                c, d = a + n, b + n
                faces += [(a, b, d), (a, d, c)]
        if tip is not None:
            t = len(verts)
            verts.append(tip)
            last = (len(rings) - 1) * n
            faces += [(last + k, last + (k + 1) % n, t) for k in range(n)]
        if cap_top:
            t = len(verts)
            cx, cy, cz = rings[0][:3]
            verts.append((cx, cy, cz))
            faces += [(k, t, (k + 1) % n) for k in range(n)]
        self.add(verts, faces, tag)

    def box(self, centre, hx, hy, hz, ux, uy, tag):
        X = np.array([ux, uy, 0.0])
        Yv = np.array([-uy, ux, 0.0])
        Zv = np.array([0.0, 0.0, 1.0])
        c = np.asarray(centre, dtype=np.float64)
        vs = [c + sx * hx * X + sy * hy * Yv + sz * hz * Zv for sz in (-1, 1) for sy in (-1, 1) for sx in (-1, 1)]
        q = [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)]
        faces = []
        for a, b, cc, d in q:
            faces += [(a, b, cc), (a, cc, d)]
        self.add(vs, faces, tag)

    def arrays(self):
        V = np.array(self.v, dtype=np.float64).reshape(-1, 3)
        return np.rint(V * Q).astype(np.int64), np.array(self.f, dtype=np.int64).reshape(-1, 3), \
            np.array(self.tag, dtype=np.int64)

    def geos(self):
        """Each face's geology index (-1 where none was given: the hand-placed features')."""
        return np.array(self.geo, dtype=np.int64)

    def pieces(self):
        """Each face's piece number: one per `add` (a stalactite, a curtain, a block ...), for the builder's per-piece
        tint and texture coordinates."""
        return np.array(self.piece, dtype=np.int32)


def truncated_cube():
    """A convex block: the truncated cube (24 vertices, 44 triangles), wound outward."""
    xi = math.sqrt(2.0) - 1.0
    V = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                V += [(sx * xi, sy, sz), (sx, sy * xi, sz), (sx, sy, sz * xi)]
    V = np.array(V, dtype=np.float64)
    faces = []
    for ax in range(3):
        for s in (-1, 1):
            idx = [i for i in range(len(V)) if abs(V[i, ax] - s) < 1e-9]
            o = [k for k in range(3) if k != ax]
            ang = [math.atan2(V[i, o[1]], V[i, o[0]]) for i in idx]  # ordering only
            idx = [i for _, i in sorted(zip(ang, idx))]
            for k in range(1, len(idx) - 1):
                faces.append([idx[0], idx[k], idx[k + 1]])
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                tri = [i for i in range(len(V)) if V[i, 0] * sx > 0 and V[i, 1] * sy > 0 and V[i, 2] * sz > 0
                       and abs(abs(V[i]).sum() - (2 + xi)) < 1e-9]
                faces.append(tri)
    out = []
    for f in faces:
        a, b, c = V[f[0]], V[f[1]], V[f[2]]
        n = np.cross(b - a, c - a)
        out.append(tuple(f) if np.dot(n, a + b + c) > 0 else (f[0], f[2], f[1]))
    return V, out


TC_V, TC_F = truncated_cube()


def formations(sec, rows):
    """Procedural formations of the section (stalactites, stalagmites, columns, breakdown blocks; flowstone is a
    field swelling with a tint band). Returns the visual mesh buffer, collision proxies and flood solids."""
    vis, prox = MeshBuf(), MeshBuf()
    solids = []  # (kind, params..., z0, z1)
    report = []
    kinds = {"stalactites": 0, "stalagmite": 1, "column": 2, "breakdown": 3, "flowstone": 4}
    for i, f in enumerate(sec.d.get("features", [])):
        k = f["kind"]
        rng = Rng(sec.seed, sec.key, f.get("id", i), k)
        at = f["at"]
        hint = at[2] if len(at) > 2 else None
        if k == "stalactites":
            n = int(f.get("count", 6))
            rad = float(f.get("radius", 1.5))
            lmin, lmax = f.get("length", [0.3, 1.2])
            made = 0
            for j in range(n):
                cx, cy = at[0] + rng.uniform(-rad, rad), at[1] + rng.uniform(-rad, rad)
                fl, rf = sec.column(cx, cy, hint if hint is not None else rows.floor_hint(cx, cy))
                if fl is None:
                    continue
                top = rf + 0.25
                ln = min(rng.uniform(lmin, lmax), top - 0.25 - fl - 2.2)
                if ln <= 0.05:
                    continue
                rb = float(f.get("base_radius", 0.12)) * rng.uniform(0.7, 1.3)
                turn = rng.turn()
                total, rings = ln + 0.25, []
                for s in range(7):
                    t = s / 6.0
                    sway = 0.25 * rb * t
                    taper = (1.0 - t) ** 1.3 if t < 1 else 0.0
                    r = max(0.004, rb * taper * (1.0 + 0.9 * max(0.0, 0.3 - t) / 0.3) * rng.uniform(0.85, 1.15))
                    if s < 6:
                        rings.append((cx + sway * turn[0], cy + sway * turn[1], top - total * t, r, turn))
                vis.tube(rings, 0, cap_top=True, tip=(cx + 0.25 * rb * turn[0], cy + 0.25 * rb * turn[1], top - total))
                made += 1
            report.append({"kind": k, "made": made})
        elif k in ("stalagmite", "column"):
            fl, rf = sec.column(at[0], at[1], hint if hint is not None else rows.floor_hint(at[0], at[1]))
            if fl is None:
                report.append({"kind": k, "made": 0})
                continue
            rb = float(f.get("radius", 0.3))
            turn = rng.turn()
            rings = []
            if k == "stalagmite":
                h = min(float(f.get("height", 1.2)), rf - fl - 0.3)
                for s in range(6):
                    t = s / 5.0
                    rings.append((at[0], at[1], fl - 0.15 + (h + 0.15) * t, rb * (1.0 - 0.85 * t ** 1.5), turn))
                rings = rings[::-1]
                vis.tube(rings[1:], 1, cap_top=True, tip=(at[0], at[1], fl + h))
                ztop = fl + h
            else:
                for s in range(9):
                    t = s / 8.0
                    w = 1.0 - 0.35 * 4.0 * t * (1.0 - t)
                    rings.append((at[0], at[1], rf + 0.15 - (rf - fl + 0.3) * t, rb * w, turn))
                vis.tube(rings, 2, cap_top=True, tip=(at[0], at[1], fl - 0.15))
                ztop = rf
            pr = 0.9 * rb
            prox.tube([(at[0], at[1], ztop, pr, turn), (at[0], at[1], fl - 0.1, pr, turn)], kinds[k],
                      cap_top=True, tip=(at[0], at[1], fl - 0.1))
            solids.append(("disk", at[0], at[1], rb, fl - 0.2, ztop))
            report.append({"kind": k, "made": 1, "floor": round(fl, 3), "top": round(ztop, 3)})
        elif k == "breakdown":
            fl, _ = sec.column(at[0], at[1], hint if hint is not None else rows.floor_hint(at[0], at[1]))
            if fl is None:
                report.append({"kind": k, "made": 0})
                continue
            sx, sy, sz = (float(v) for v in f.get("size", [1.0, 0.8, 0.7]))
            ux, uy = unit2(f.get("axis", [1.0, 0.0]))
            j = [rng.uniform(0.9, 1.1) for _ in range(3)]
            hx, hy, hz = 0.5 * sx * j[0], 0.5 * sy * j[1], 0.5 * sz * j[2]
            cz = fl - 0.1 + hz
            Vb = np.stack([at[0] + TC_V[:, 0] * hx * ux - TC_V[:, 1] * hy * uy,
                           at[1] + TC_V[:, 0] * hx * uy + TC_V[:, 1] * hy * ux, cz + TC_V[:, 2] * hz], axis=1)
            vis.add(Vb, TC_F, 3)
            collide = max(sx, sy, sz) > 0.5
            if collide:
                prox.add(Vb, TC_F, 3)
                solids.append(("rect", at[0], at[1], hx, hy, ux, uy, fl - 0.1, fl - 0.1 + 2 * hz))
            report.append({"kind": k, "made": 1, "collides": collide})
        elif k == "flowstone":
            report.append({"kind": k, "made": 1, "field": True})
    return vis, prox, solids, report


# ---------------------------------------------------------------- the flood


DIRS = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)]
PUSH = DIRS + [(2, 0), (-2, 0), (0, 2), (0, -2), (2, 1), (2, -1), (-2, 1), (-2, -1), (1, 2), (-1, 2), (1, -2),
               (-1, -2), (2, 2), (2, -2), (-2, 2), (-2, -2)]  # the push-out's columns, nearest first


class Zone:
    """A traversal zone in the village frame: X along the passage (or the face), Up, Z = X x Up (out of a climb
    face, towards the walker)."""

    def __init__(self, zid, kind, centre, size, ax, source):
        self.id, self.kind, self.source = zid, kind, source
        self.o = np.array(centre, dtype=np.float64)
        self.size = [float(s) for s in size]
        self.half = [0.5 * s for s in self.size]
        self.X = np.array([ax[0], ax[1], 0.0])
        self.Z = np.array([ax[1], -ax[0], 0.0])  # X x Up

    def local(self, x, y, z):
        dx, dy = x - self.o[0], y - self.o[1]
        return dx * self.X[0] + dy * self.X[1], z - self.o[2], dx * self.Z[0] + dy * self.Z[1]

    def contains(self, x, y, z, end_margin=END_MARGIN):
        lx, ly, lz = self.local(x, y, z)
        return ((np.abs(lx) <= self.half[0] + end_margin + EDGE) & (np.abs(ly) <= self.half[1] + EDGE)
                & (np.abs(lz) <= self.half[2] + EDGE))

    def world(self, lx, ly, lz):
        return (self.o[0] + lx * self.X[0] + lz * self.Z[0], self.o[1] + lx * self.X[1] + lz * self.Z[1],
                self.o[2] + ly)

    def out(self):
        yaw = math.degrees(math.atan2(self.X[1], self.X[0]))  # metadata only
        return {"node": f"Trav_{self.id}", "id": self.id, "wdi_traverse": self.kind,
                "centre": [round(float(v), 5) for v in self.o], "size": [round(s, 5) for s in self.size],
                "axis_x": [round(float(v), 6) for v in self.X], "axis_y": [0.0, 0.0, 1.0],
                "axis_z": [round(float(v), 6) for v in self.Z], "yaw_deg": round(yaw, 4), "source": self.source}


def make_zones(sec):
    zones = []
    for p in sec.own:
        if not isinstance(p, Passage):
            continue
        if p.profile in ("crawl", "fissure"):
            kind = "crawl" if p.profile == "crawl" else "sidle"
            for j in range(len(p.A)):
                A, B = p.A[j], p.B[j]
                ax = unit2((B[0] - A[0], B[1] - A[1]))
                L = float(p.L[j])
                zlo = min(A[2], B[2]) - 0.25
                zhi = max(A[2], B[2]) + (max(p.h) if kind == "crawl" else 1.0)
                across = max(p.w) + (0.4 if kind == "crawl" else 0.3)
                zid = p.id if len(p.A) == 1 else f"{p.id}_{j}"
                zones.append(Zone(zid, kind, (0.5 * (A[0] + B[0]), 0.5 * (A[1] + B[1]), 0.5 * (zlo + zhi)),
                                  (L, zhi - zlo, across), ax, p.id))
        elif p.profile == "climb_face":
            dx, dy = p.dir
            ax = (dy, -dx)  # X = Up x n with n = -dir, out of the face towards the walker
            zones.append(Zone(p.id, "climb", (p.A[0, 0], p.A[0, 1], 0.5 * (p.foot + p.top)),
                              (p.w[0], p.top - p.foot, 2 * CLIMB_REACH), ax, p.id))
    return zones


class Grid:
    """The flood's columns: the lattice's node columns over the region, padded, with the air intervals of each column
    (from the meshing field, minus the collision proxies)."""

    PAD = 5

    def __init__(self, sec, ix0, iy0, nx, ny):
        self.sec = sec
        self.ix0, self.iy0, self.nx, self.ny = ix0, iy0, nx, ny
        P = self.PAD
        self.nxp, self.nyp = nx + 2 * P, ny + 2 * P
        self.NP = self.nxp * self.nyp
        cell = sec.cell
        jx = np.arange(self.NP) % self.nxp - P
        jy = np.arange(self.NP) // self.nxp - P
        self.cx = sec.origin[0] + (ix0 + jx) * cell
        self.cy = sec.origin[1] + (iy0 + jy) * cell
        self.inside = (jx >= 0) & (jx < nx) & (jy >= 0) & (jy < ny)

    def col_of(self, gx, gy):
        P = self.PAD
        return (gy - self.iy0 + P) * self.nxp + (gx - self.ix0 + P)

    def col_at(self, x, y):
        gx = np.rint((np.asarray(x) - self.sec.origin[0]) / self.sec.cell).astype(np.int64)
        gy = np.rint((np.asarray(y) - self.sec.origin[1]) / self.sec.cell).astype(np.int64)
        ok = (gx >= self.ix0) & (gx < self.ix0 + self.nx) & (gy >= self.iy0) & (gy < self.iy0 + self.ny)
        return np.where(ok, self.col_of(gx, gy), -1)

    def set_intervals(self, col, f, c):
        order = np.lexsort((f, col))
        col, f, c = col[order], f[order], c[order]
        start = np.r_[0, np.nonzero(np.diff(col))[0] + 1] if len(col) else np.zeros(0, np.int64)
        rank = np.arange(len(col)) - np.repeat(start, np.diff(np.r_[start, len(col)])) if len(col) else col
        self.L = int(rank.max()) + 1 if len(col) else 1
        self.AF = np.full((self.L, self.NP), np.nan)
        self.AC = np.full((self.L, self.NP), np.nan)
        self.AF[rank, col] = f
        self.AC[rank, col] = c
        self.icol, self.if_, self.ic = col, f, c

    def offsets(self, pts):
        return np.array([dy * self.nxp + dx for dx, dy in pts], dtype=np.int64)

    def set_nodes(self, G, v):
        """The collision field's values at nodes near the surface, keyed by column and height."""
        self.gz0 = int(self.sec.lo[2]) - 2
        self.KZ = int(self.sec.hi[2] - self.sec.lo[2]) + 5
        gx, gy = G[:, 0].astype(np.int64), G[:, 1].astype(np.int64)
        ok = (gx >= self.ix0) & (gx < self.ix0 + self.nx) & (gy >= self.iy0) & (gy < self.iy0 + self.ny)
        ok &= (G[:, 2] >= self.gz0) & (G[:, 2] < self.gz0 + self.KZ)
        key = self.col_of(gx[ok], gy[ok]) * self.KZ + (G[ok, 2].astype(np.int64) - self.gz0)
        order = np.argsort(key, kind="stable")
        self.nv_key, self.nv_val = key[order], v[ok][order]
        self.proxy = np.zeros(self.NP, bool)  # columns a collision proxy cuts (apply_solids marks them)

    def air_at(self, cols, z):
        air = np.zeros(len(cols), bool)
        for li in range(self.L):
            air |= (self.AF[li, cols] <= z) & (self.AC[li, cols] >= z)
        return air

    def node_value(self, cols, gz):
        """The field at node (column, gz): the kept value near the surface, else +-VBAND by the column's air. The
        column's air decides the sign (it also carries the collision proxies, so a node a proxy fills reads as the
        wall at most)."""
        key = cols * self.KZ + (gz - self.gz0)
        n = len(self.nv_key)
        if n:
            i = np.minimum(np.searchsorted(self.nv_key, key), n - 1)
            hit = self.nv_key[i] == key
            v = np.where(hit, self.nv_val[i], 0.0).astype(np.float64)
        else:
            hit = np.zeros(len(cols), bool)
            v = np.zeros(len(cols))
        ask = np.nonzero(~hit | self.proxy[cols])[0]  # elsewhere the kept value's sign is the column's
        if len(ask):
            air = self.air_at(cols[ask], self.sec.origin[2] + gz[ask] * self.sec.cell)
            va, ha = v[ask], hit[ask]
            v[ask] = np.where(air, np.where(ha, np.maximum(va, 0.0), VBAND), np.where(ha, np.minimum(va, 0.0), -VBAND))
        return v


class Flood:
    """The walk flood: states are (mode, level, column) with the feet on a settled level, edges are one lattice
    step of the controller's move-and-settle, plus the climb edges and the falls a climb face catches."""

    def __init__(self, sec, grid, zones, drops):
        self.sec, self.g, self.zones, self.drops = sec, grid, zones, drops
        self.portal_cache = {}
        cell = sec.cell
        self.probe, self.disk, self.top = {}, {}, {}
        for m in MODES:
            r, top = BODY[m]
            pc = int(round(0.7 * r / cell))
            self.probe_xy = getattr(self, "probe_xy", {})
            self.probe_xy[m] = [(pc, 0), (-pc, 0), (0, pc), (0, -pc)]
            self.probe[m] = grid.offsets([(0, 0)] + self.probe_xy[m])
            rr = int(math.ceil(r / cell))
            self.disk[m] = grid.offsets([(dx, dy) for dx in range(-rr, rr + 1) for dy in range(-rr, rr + 1)
                                         if (dx * dx + dy * dy) * cell * cell <= r * r + 1e-9])
            self.top[m] = top
            self.rim_setup(m, r)
        self.levels()

    def rim_setup(self, m, r):
        """The body's rim: RIM_RAYS points at the true radius, each read bilinearly from the four node columns
        round it, so the flood's body is as wide as the viewer's capsule and not only as wide as the column
        centres within its radius (0.5 m across for the 0.6 m walker). A state stands for the body anywhere in its
        column's cell (the viewer's capsule is not held to the lattice), so the core disk is the columns inside the
        body wherever it stands there, and the ring is every other column the rim reads or the radius covers."""
        cell = self.sec.cell
        self.rim = getattr(self, "rim", {})
        h = 0.5 * cell
        rc = max(r - h * math.sqrt(2.0), 0.0)
        rr = int(math.ceil(r / cell)) + 1
        core_, ring = [], {}
        for dx in range(-rr, rr + 1):
            for dy in range(-rr, rr + 1):
                d2 = (dx * dx + dy * dy) * cell * cell
                if d2 <= rc * rc + 1e-9:
                    core_.append((dx, dy))
                elif d2 <= r * r + 1e-9:
                    ring.setdefault((dx, dy), len(ring))
        corner, pts = {}, []
        for k in range(RIM_RAYS):
            th = 2.0 * math.pi * k / RIM_RAYS
            ux, uy = round(r * math.cos(th) / cell, 9), round(r * math.sin(th) / cell, 9)
            i0, j0 = math.floor(ux), math.floor(uy)
            fx, fy = ux - i0, uy - j0
            cs = []
            for (a, b, w) in ((i0, j0, (1 - fx) * (1 - fy)), (i0 + 1, j0, fx * (1 - fy)),
                              (i0, j0 + 1, (1 - fx) * fy), (i0 + 1, j0 + 1, fx * fy)):
                if w > 1e-9:
                    cs.append((a, b, w))
                    corner.setdefault((a, b), len(corner))
                    if (a, b) not in core_:
                        ring.setdefault((a, b), len(ring))
            pts.append(cs)
        W = np.zeros((RIM_RAYS, len(corner)))
        for k, cs in enumerate(pts):
            for a, b, w in cs:
                W[k, corner[(a, b)]] = w
        th = 2.0 * math.pi * np.arange(RIM_RAYS) / RIM_RAYS
        sh = np.linspace(-h, h, RIM_SHIFT)
        D = np.array([(a, b) for a in sh for b in sh])
        D = D[np.argsort(np.hypot(D[:, 0], D[:, 1]), kind="stable")]  # the column's centre first
        self.disk[m] = self.g.offsets(core_)
        self.rim[m] = {"ring": self.g.offsets(sorted(ring, key=ring.get)),
                       "corner": self.g.offsets(sorted(corner, key=corner.get)), "W": W,
                       "shift": D @ np.stack([np.cos(th), np.sin(th)])}  # (positions, rays): how far each moves out

    # ---- column queries (vectorised over columns and heights)

    def H(self, m, cols, z, lo=STEP, hi=STEP):
        """The controller's ground under the feet: the highest floor of the five probe rays in [z - lo, z + hi]."""
        g = self.g
        best = np.full(len(cols), -np.inf)
        for p in self.probe[m]:
            for li in range(g.L):
                f = g.AF[li, cols + p]
                ok = (f >= z - lo - 1e-6) & (f <= z + hi + 1e-6)
                best = np.where(ok & (f > best), f, best)
        return np.where(np.isinf(best), np.nan, best)

    def Hdown(self, m, cols, z):
        g = self.g
        best = np.full(len(cols), -np.inf)
        for p in self.probe[m]:
            for li in range(g.L):
                f = g.AF[li, cols + p]
                ok = f <= z + STEP + 1e-6
                best = np.where(ok & (f > best), f, best)
        return np.where(np.isinf(best), np.nan, best)

    def settle(self, m, cols, z):
        z = z.copy()
        for _ in range(8):
            z2 = self.H(m, cols, z)
            z2 = np.where(np.isnan(z2), z, z2)
            if np.array_equal(z2, z):
                break
            z = z2
        return z

    def clear_band(self, cols, lo, hi):
        g = self.g
        any_ = np.zeros(len(cols), bool)
        for li in range(g.L):
            any_ |= (g.AF[li, cols] <= lo) & (g.AC[li, cols] >= hi)
        return any_

    def fits(self, m, cols, z):
        """The body's solid band (STEP to its top above the feet) is clear: air over the whole band in every node
        column within the radius, and, wherever a column just outside the radius holds rock in the band, the wall
        read between the columns stays beyond the radius at every node height of the band."""
        z = np.broadcast_to(np.asarray(z, dtype=np.float64), np.shape(cols))
        cols = np.asarray(cols)
        if not len(cols):
            return np.zeros(0, bool)
        # remembered per (column, height): edges() asks much the same of every zone set's graph
        key = cols.astype(np.int64) * 10 ** 8 + np.rint((z + 2000.0) * 1e4).astype(np.int64)
        memo = self.__dict__.setdefault("fit_memo", {})
        mk, mv = memo.get(m, (np.zeros(0, np.int64), np.zeros(0, bool)))
        out = np.zeros(len(cols), bool)
        if len(mk):
            i = np.minimum(np.searchsorted(mk, key), len(mk) - 1)
            known = mk[i] == key
            out[known] = mv[i[known]]
        else:
            known = np.zeros(len(cols), bool)
        new = np.nonzero(~known)[0]
        if len(new):
            out[new] = self.fits_now(m, cols[new], z[new])
            uk, ui = np.unique(key[new], return_index=True)
            allk = np.concatenate([mk, uk])
            allv = np.concatenate([mv, out[new][ui]])
            order = np.argsort(allk, kind="stable")
            memo[m] = (allk[order], allv[order])
        return out

    def fits_now(self, m, cols, z):
        lo, hi = z + STEP + 1e-6, z + self.top[m] - 1e-6
        ok = np.ones(len(cols), bool)
        for o in self.disk[m]:
            ok &= self.clear_band(cols + o, lo, hi)
        idx = np.nonzero(ok)[0]
        if not len(idx):
            return ok
        rim = self.rim[m]
        c, zl, zh = cols[idx], lo[idx], hi[idx]
        clear = np.ones(len(c), bool)
        for o in rim["ring"]:
            clear &= self.clear_band(c + o, zl, zh)
        sel = np.nonzero(~clear)[0]
        if not len(sel):
            return ok
        # where the ring holds rock: the field at the rim points, lowest over the band's node heights; the body
        # fits if, at one of the positions in the cell, every rim point stays in the air (the field falls by the
        # distance a point moves out towards the wall)
        cell, oz = self.sec.cell, self.sec.origin[2]
        g0 = np.ceil((zl - oz) / cell - 1e-9).astype(np.int64)
        g1 = np.floor((zh - oz) / cell + 1e-9).astype(np.int64)
        nh = int((g1[sel] - g0[sel]).max()) + 1
        corner, W, shift = rim["corner"], rim["W"], rim["shift"]
        bad = np.zeros(len(c), bool)
        step = max(1, 400000 // (len(corner) * nh))
        for s0 in range(0, len(sel), step):
            ss = sel[s0:s0 + step]
            gz = g0[ss, None] + np.arange(nh)[None, :]  # (S, nh)
            act = gz <= g1[ss, None]
            cc = c[ss, None, None] + corner[None, :, None]  # (S, corners, 1)
            v = self.g.node_value(np.broadcast_to(cc, (len(ss), len(corner), nh)).ravel(),
                                  np.broadcast_to(gz[:, None, :], (len(ss), len(corner), nh)).ravel())
            v = v.reshape(len(ss), len(corner), nh)
            rv = np.einsum("kc,sch->skh", W, v)  # the field at each rim point and height
            low = np.where(act[:, None, :], rv, np.inf).min(2)  # (S, rays)
            room = (low[:, None, :] - shift[None, :, :] > 0.0).all(2)  # (S, positions)
            bad[ss] = ~room.any(1)
        ok[idx[bad]] = False
        return ok

    def room(self, cols, z, m):
        """controller.ts roomToStand: no surface within the standing room above the feet in the probe columns, and
        the standing capsule of that radius fits."""
        g = self.g
        ok = np.ones(len(cols), bool)
        for p in self.probe[m]:
            for li in range(g.L):
                for A in (g.AF, g.AC):
                    s = A[li, cols + p]
                    ok &= ~((s >= z + STEP - 1e-6) & (s <= z + STAND_ROOM + 1e-6))
        return ok & self.fits("walk" if m == "walk" else "sidle", cols, z)

    # ---- states

    def levels(self):
        g = self.g
        cols = np.nonzero(g.inside & ~np.isnan(g.AF[0]))[0]
        self.E, self.valid = {}, {}
        K = 1
        for m in MODES:
            same = [m0 for m0 in self.E if (self.probe[m0] == self.probe[m]).all()]
            if same:  # the same probe rays find the same settled levels (the thin crawl's are the sidle's)
                self.E[m] = self.E[same[0]].copy()
                continue
            cand = np.stack([g.AF[li, cols + p] for p in self.probe[m] for li in range(g.L)])  # (M, N)
            M = cand.shape[0]
            cc = np.tile(cols, M)
            zz = cand.ravel()
            fin = ~np.isnan(zz)
            fixed = np.zeros(len(zz), bool)
            hz = self.H(m, cc[fin], zz[fin])
            fixed[np.nonzero(fin)[0]] = np.abs(hz - zz[fin]) <= 1e-6
            arr = np.where(fixed, zz, np.inf).reshape(M, -1)
            s = np.sort(arr, axis=0)
            keep = np.isfinite(s)
            with np.errstate(invalid="ignore"):
                keep[1:] &= np.diff(s, axis=0) > 1e-4
            rank = np.cumsum(keep, axis=0) - 1
            Km = int(rank.max()) + 1 if keep.any() else 1
            E = np.full((Km, g.NP), np.nan)
            ri, ci = np.nonzero(keep)
            E[rank[ri, ci], cols[ci]] = s[ri, ci]
            self.E[m] = E
            K = max(K, Km)
        self.K = K
        near = self.near_masks()
        for m in MODES:
            E = self.E[m]
            if E.shape[0] < K:
                E = np.vstack([E, np.full((K - E.shape[0], g.NP), np.nan)])
                self.E[m] = E
            V = np.zeros((K, g.NP), bool)
            for k in range(K):
                cs = np.nonzero(~np.isnan(E[k]) & near[m])[0]
                if len(cs):
                    V[k, cs] = self.fits(m, cs, E[k, cs])
            self.valid[m] = V
        self.window()
        self.N = len(MODES) * K * g.NP
        self.WEDGE = self.N

    def near_masks(self):
        """Crawl and sidle states are kept near their zones (and near climb tops, where a ledge may be low); thin
        crawling states near both a crawl (or climb) zone and a sidle zone."""
        g = self.g

        def near(kinds, reach):
            out = np.zeros(g.NP, bool)
            for z in self.zones:
                if z.kind in kinds:
                    lx, _, lz = z.local(g.cx, g.cy, z.o[2])
                    out |= (np.abs(lx) <= z.half[0] + reach) & (np.abs(lz) <= z.half[2] + reach)
            return out

        crawl_near, sidle_near = near(("crawl", "climb"), 6.0), near(("sidle",), 1.5)
        return {"walk": np.ones(g.NP, bool), "crawl": crawl_near, "sidle": sidle_near,
                "thin": crawl_near & sidle_near}

    def window(self):
        near = self.near_masks()
        for m in MODES:
            self.valid[m] &= near[m][None, :]

    def sid(self, m, k, c):
        return (MODES.index(m) * self.K + k) * self.g.NP + c

    def unsid(self, s):
        NP, K = self.g.NP, self.K
        c = s % NP
        k = (s // NP) % K
        m = s // (NP * K)
        return m, k, c

    def pos(self, s):
        m, k, c = self.unsid(np.asarray(s))
        z = np.array([self.E[MODES[mi]][ki, ci] for mi, ki, ci in zip(np.atleast_1d(m), np.atleast_1d(k),
                                                                       np.atleast_1d(c))])
        return self.g.cx[c], self.g.cy[c], z, m

    def match(self, m, cols, z):
        E = self.E[m][:, cols]
        hit = np.abs(E - z[None, :]) <= 1e-4
        k = np.argmax(hit, axis=0)
        return np.where(hit.any(axis=0), k, -1)

    # ---- the physical moves (independent of zones)

    def dest_levels(self, m, rec, c2, zt):
        """The level each move lands on in every mode (k_<mode>, -1 for none). Modes with the same probe rays have the
        same levels (the thin crawl's are the sidle's), so each is settled and matched once."""
        done = {}
        for m2 in MODES:
            key = self.probe[m2].tobytes()
            if key not in done:
                z2 = zt if (self.probe[m2] == self.probe[m]).all() else self.settle(m2, c2, zt)
                done[key] = self.match(m2, c2, z2)
            rec["k_" + m2] = done[key]

    def moves(self):
        g = self.g
        out = []
        self.voids = 0
        for m in MODES:
            V = self.valid[m]
            sk, sc = np.nonzero(V)
            sz = self.E[m][sk, sc]
            for di, (dx, dy) in enumerate(DIRS):
                c2 = sc + dy * g.nxp + dx
                z1 = self.H(m, c2, sz)
                fall = np.isnan(z1)
                zt = np.full(len(sc), np.nan)
                nf = np.nonzero(~fall)[0]
                zt[nf] = self.settle(m, c2[nf], z1[nf])
                fi = np.nonzero(fall)[0]
                if len(fi):
                    okf = self.fits(m, c2[fi], sz[fi])
                    fi = fi[okf]
                    zl = self.Hdown(m, c2[fi], sz[fi])
                    vd = np.isnan(zl)
                    self.voids += int(vd.sum())
                    fi, zl = fi[~vd], zl[~vd]
                    zt[fi] = self.settle(m, c2[fi], zl)
                keep = ~np.isnan(zt)
                idx = np.nonzero(keep)[0]
                rec = {"m": MODES.index(m), "k": sk[idx], "c": sc[idx], "z": sz[idx], "c2": c2[idx], "zt": zt[idx],
                       "fall": fall[idx], "d": np.full(len(idx), di)}
                self.dest_levels(m, rec, rec["c2"], rec["zt"])
                out.append(rec)
        out += self.crack_falls()
        self.mv = {key: np.concatenate([r[key] if key != "m" else np.full(len(r["c"]), r["m"]) for r in out])
                   for key in ["m", "k", "c", "z", "c2", "zt", "fall", "d"] + ["k_" + m for m in MODES]}

    # ---- the viewer's exact probe rays (cracks narrower than the lattice can show)

    def col_floor(self, cols, z):
        """Has the lattice column a floor within [z - SNAP, z + STEP]? (One ray, on the lattice.)"""
        g = self.g
        hit = np.zeros(len(cols), bool)
        for li in range(g.L):
            f = g.AF[li, cols]
            hit |= (f >= z - SNAP - 1e-6) & (f <= z + STEP + 1e-6)
        return hit

    def ray_hits(self, x, y, z):
        """controller.ts groundBelow at exact points (x, y): a floor of the collision field (rock under air) or the top
        of a collision proxy within [z - SNAP, z + STEP]."""
        x, y, z = (np.asarray(v, dtype=np.float64) for v in (x, y, z))
        n = len(x)
        if not n:
            return np.zeros(0, bool)
        dz = 0.03125
        k = np.arange(-int(round((SNAP + dz) / dz)), int(round((STEP + dz) / dz)) + 1) * dz
        Z = z[:, None] + k[None, :]
        P = np.stack([np.repeat(x, len(k)), np.repeat(y, len(k)), Z.ravel()], 1)
        f = self.sec.field_points(P, collision=True).reshape(n, len(k))
        cross = (f[:, :-1] <= 0) & (f[:, 1:] > 0)
        t = np.where(cross, -f[:, :-1] / np.where(cross, f[:, 1:] - f[:, :-1], 1.0), 0.0)
        zc = Z[:, :-1] + dz * t
        hit = (cross & (zc >= z[:, None] - SNAP - 1e-6) & (zc <= z[:, None] + STEP + 1e-6)).any(1)
        for sd in getattr(self.g, "solids", ()):
            kind = sd[0]
            if kind == "disk":
                _, sx, sy, r, z0, z1 = sd
                inside = np.hypot(x - sx, y - sy) <= r
            elif kind == "rect":
                _, sx, sy, hx, hy, ux, uy, z0, z1 = sd
                dx, dy = x - sx, y - sy
                inside = (np.abs(dx * ux + dy * uy) <= hx) & (np.abs(-dx * uy + dy * ux) <= hy)
            elif kind == "seg":
                _, a, b, th, z0, z1 = sd
                ax, ay = b[0] - a[0], b[1] - a[1]
                t2 = np.clip(((x - a[0]) * ax + (y - a[1]) * ay) / max(ax * ax + ay * ay, 1e-12), 0.0, 1.0)
                inside = np.hypot(x - (a[0] + t2 * ax), y - (a[1] + t2 * ay)) <= 0.5 * th
            elif kind == "aabb":
                _, x0, y0, x1, y1, z0, z1 = sd
                inside = (x >= x0) & (x <= x1) & (y >= y0) & (y <= y1)
            else:
                continue
            hit |= inside & (z1 >= z - SNAP - 1e-6) & (z1 <= z + STEP + 1e-6)
        return hit

    def crack_falls(self):
        """Where the viewer's five rays (the centre and four at 0.7 of the radius along x and y) all miss although
        the lattice's rays, rounded to whole cells, hold the feet: a crack a little wider than twice the ray offset,
        enclosed on both sides within six cells. The walker falls there; the move records it like any fall, so a body
        that does not fit below wedges. Only walking and crawling bodies: the sidling rays sit on the lattice."""
        g, cell = self.g, self.sec.cell
        recs = []
        self.cracks = []
        for m in ("walk", "crawl"):
            rr = 0.7 * BODY[m][0]
            V = self.valid[m]
            sk, sc = np.nonzero(V)
            if not len(sc):
                continue
            sz = self.E[m][sk, sc]
            cand = ~self.col_floor(sc, sz)
            gaps = {}
            for ax, stride in ((0, 1), (1, g.nxp)):
                found = {}
                for sgn in (1, -1):
                    kk = np.zeros(len(sc), np.int64)
                    for k in range(6, 0, -1):
                        h = self.col_floor(sc + sgn * k * stride, sz)
                        kk = np.where(h, k, kk)
                    found[sgn] = kk
                enc = (found[1] > 0) & (found[-1] > 0) & ((found[1] + found[-1]) * cell > 2 * rr)
                gaps[ax] = (enc, found)
            cand &= gaps[0][0] | gaps[1][0]
            ci = np.nonzero(cand)[0]
            if not len(ci):
                continue
            k_, c_, z_ = sk[ci], sc[ci], sz[ci]
            x0, y0 = g.cx[c_], g.cy[c_]
            centre = {0: x0.copy(), 1: y0.copy()}
            wide = {}
            for ax in (0, 1):
                enc, found = gaps[ax]
                e = {}
                for sgn in (1, -1):
                    lo = (found[sgn][ci] - 1) * cell
                    hi = found[sgn][ci] * cell
                    for _ in range(7):  # the edge between the last cell that misses and the first that holds
                        mid = 0.5 * (lo + hi)
                        px = x0 + sgn * mid if ax == 0 else x0
                        py = y0 + sgn * mid if ax == 1 else y0
                        h = self.ray_hits(px, py, z_)
                        hi = np.where(h, mid, hi)
                        lo = np.where(h, lo, mid)
                    e[sgn] = np.where(enc[ci], hi, 0.0)
                wide[ax] = enc[ci] & (e[1] + e[-1] > 2 * rr + 1e-3)
                base = x0 if ax == 0 else y0
                centre[ax] = np.where(wide[ax], base + 0.5 * (e[1] - e[-1]), base)
            falls = np.zeros(len(ci), bool)
            fx, fy = x0.copy(), y0.copy()
            for use in ((True, False), (False, True), (True, True)):
                px = np.where(use[0] & wide[0], centre[0], x0)
                py = np.where(use[1] & wide[1], centre[1], y0)
                todo = ~falls & ((use[0] & wide[0]) | (use[1] & wide[1]))
                if not todo.any():
                    continue
                t = np.nonzero(todo)[0]
                miss = np.ones(len(t), bool)
                for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
                    miss &= ~self.ray_hits(px[t] + dx * rr, py[t] + dy * rr, z_[t])
                falls[t[miss]] = True
                fx[t[miss]], fy[t[miss]] = px[t[miss]], py[t[miss]]
            fi = np.nonzero(falls)[0]
            if not len(fi):
                continue
            c2 = g.col_at(fx[fi], fy[fi])
            c2 = np.where(c2 >= 0, c2, c_[fi])
            zf = z_[fi]
            # the feet fall past the rims: the highest floor of that column below the band
            best = np.full(len(fi), -np.inf)
            for li in range(g.L):
                f = g.AF[li, c2]
                ok = f < zf - SNAP - 1e-6
                best = np.where(ok & (f > best), f, best)
            land = np.isfinite(best)
            zt = np.where(land, best, np.nan)
            zt[land] = self.settle(m, c2[land], zt[land])
            self.cracks += [(int(self.sid(m, a, b)), float(x), float(y), float(z))
                            for a, b, x, y, z in zip(k_[fi], c_[fi], fx[fi], fy[fi], zf)]
            rec = {"m": MODES.index(m), "k": k_[fi], "c": c_[fi], "z": zf, "c2": c2,
                   "zt": np.where(land, zt, zf - 50.0), "fall": np.ones(len(fi), bool),
                   "d": np.zeros(len(fi), np.int64)}
            self.dest_levels(m, rec, c2, rec["zt"])
            for m2 in MODES:
                rec["k_" + m2] = np.where(land, rec["k_" + m2], -1)
            recs.append(rec)
        return recs

    # ---- zone-dependent edges

    def zone_masks(self, x, y, z, zones):
        cr = np.zeros(len(x), bool)
        sd = np.zeros(len(x), bool)
        sd_zone = np.full(len(x), -1)
        for i, zn in enumerate(zones):
            if zn.kind == "crawl":
                cr |= zn.contains(x, y, z)
            elif zn.kind == "sidle":
                h = zn.contains(x, y, z)
                sd_zone = np.where(h & (sd_zone < 0), i, sd_zone)
                sd |= h
        return cr, sd, sd_zone

    def edges(self, zones):
        """Edges for a set of zones: (src, dst, fall height, src for unguarded-drop checks)."""
        g, mv = self.g, self.mv
        x2, y2, z2 = g.cx[mv["c2"]], g.cy[mv["c2"]], mv["zt"]
        cr, sd, _ = self.zone_masks(x2, y2, z2, zones)
        m = mv["m"]
        crawl_i, walk_i, sidle_i = MODES.index("crawl"), MODES.index("walk"), MODES.index("sidle")
        thin_i = MODES.index("thin")
        crawling = (m == crawl_i) | (m == thin_i)
        m2 = np.where(sd, sidle_i, walk_i)
        # controller.ts chooseMode: out of every crawl zone a crawler crawls on until there is room to stand (for the
        # sidling body where the feet are in a sidle zone, else the walking one); in a crawl zone it crawls, thin
        # where the feet are also in a sidle zone.
        cont = crawling & ~cr
        if cont.any():
            ci = np.nonzero(cont)[0]
            room_w = np.zeros(len(ci), bool)
            w = ~sd[ci]
            if w.any():
                room_w[w] = self.room(mv["c2"][ci[w]], z2[ci[w]], "walk")
            if (~w).any():
                room_w[~w] = self.room(mv["c2"][ci[~w]], z2[ci[~w]], "sidle")
            m2[ci[~room_w]] = np.where(sd[ci[~room_w]], thin_i, crawl_i)
        m2 = np.where(cr, np.where(sd, thin_i, crawl_i), m2)
        k2 = np.select([m2 == i for i in range(len(MODES))], [mv["k_" + MODES[i]] for i in range(len(MODES))])
        ok = k2 >= 0
        valid = np.zeros(len(m2), bool)
        for i, mn in enumerate(MODES):
            s = ok & (m2 == i)
            valid[s] = self.valid[mn][k2[s], mv["c2"][s]]
        # A fall onto a floor where the body does not fit: controller.ts pushes the capsule out sideways (by up to
        # its radius), so it lands in a column within two cells where it fits, on that floor or one within a step
        # below it (a sidler slipping off a fissure's fillet lands on its centre line; a crawler perched on a wall's
        # foot slides off it). Only with no such column does it wedge.
        c2 = mv["c2"].copy()
        bad = np.nonzero(mv["fall"] & ~valid)[0]
        for dx, dy in PUSH:
            if not len(bad):
                break
            cn = mv["c2"][bad] + dy * g.nxp + dx
            zt = mv["zt"][bad]
            got = np.zeros(len(bad), bool)
            for i, mn in enumerate(MODES):
                sel = np.nonzero(m2[bad] == i)[0]
                if not len(sel):
                    continue
                E = self.E[mn][:, cn[sel]]
                near = (E <= zt[sel][None, :] + 0.06) & (E >= zt[sel][None, :] - STEP)
                below = np.where(near, E, -np.inf)
                kn = np.where(np.isfinite(below).any(0), np.argmax(below, 0), -1)
                gd = kn >= 0
                gd[gd] = self.valid[mn][kn[gd], cn[sel][gd]]
                idx = bad[sel[gd]]
                k2[idx], ok[idx], valid[idx], c2[idx] = kn[gd], True, True, cn[sel][gd]
                got[sel[gd]] = True
            bad = bad[~got]
        # sidling moves only along its zone's axis (a move it may not make is no move: neither an edge nor a wedge).
        # Where a fissure bends, its segments' zones overlap: pushing along the first zone's axis there, the viewer's
        # sidler slides along the next segment's wall (bends are at most FISSURE_BEND degrees), so a move along any
        # zone of the same passage that holds the feet is allowed. Another fissure's zone crossing it is not.
        barred = np.zeros(len(m2), bool)
        if (m == sidle_i).any():
            si = np.nonzero(m == sidle_i)[0]
            xs, ys, zs = g.cx[mv["c"][si]], g.cy[mv["c"][si]], mv["z"][si]
            _, _, szn = self.zone_masks(xs, ys, zs, zones)
            allow = np.zeros(len(si), bool)
            ddx = np.array([DIRS[d][0] for d in mv["d"][si]], dtype=np.float64)
            ddy = np.array([DIRS[d][1] for d in mv["d"][si]], dtype=np.float64)
            dl = np.sqrt(ddx * ddx + ddy * ddy)
            owner = np.array([zn.source for zn in zones] + [None], dtype=object)[szn]
            for i, zn in enumerate(zones):
                if zn.kind != "sidle":
                    continue
                h = (owner == zn.source) & zn.contains(xs, ys, zs)
                if h.any():
                    allow[h] |= np.abs((ddx[h] * zn.X[0] + ddy[h] * zn.X[1]) / dl[h]) >= 0.38
            valid[si[~allow]] = False
            ok[si[~allow]] = False
            barred[si[~allow]] = True
        src = (m * self.K + mv["k"]) * g.NP + mv["c"]
        dst = (m2 * self.K + np.where(ok, k2, 0)) * g.NP + c2
        fallh = np.where(mv["fall"], mv["z"] - mv["zt"], 0.0)
        wedge = mv["fall"] & ~valid & ~barred & (((m2 != crawl_i) & (m2 != thin_i)) | ok)
        keep = valid | wedge
        dst = np.where(valid, dst, self.WEDGE)
        src, dst, fallh, mvi = src[keep], dst[keep], fallh[keep], np.nonzero(keep)[0]
        # climbs
        extra_s, extra_d, extra_f = [], [], []
        caught = np.zeros(len(src), bool)
        walk_fall = (m[mvi] == walk_i) & (fallh > 0)
        for zn in zones:
            if zn.kind != "climb":
                continue
            hx, hy = zn.half[0], zn.half[1]
            # foot states: walking, in front of the face within reach, the feet near its foot
            for k in range(self.K):
                cs = np.nonzero(self.valid["walk"][k])[0]
                if not len(cs):
                    continue
                zz = self.E["walk"][k, cs]
                lx, ly, lz = zn.local(g.cx[cs], g.cy[cs], zz)
                at = (np.abs(lx) <= hx + EDGE) & (lz >= -EDGE) & (lz <= CLIMB_REACH) & (np.abs(ly + hy) <= CLIMB_FOOT_BAND)
                if not at.any():
                    continue
                t = self.landings(zn, lx[at], zones)
                good = t >= 0
                extra_s += list(self.sid("walk", k, cs[at][good]))
                extra_d += list(t[good])
                extra_f += [0.0] * int(good.sum())
            # a walker stepping off the ledge over the face is caught and climbs down to its foot
            if walk_fall.any():
                wi = np.nonzero(walk_fall)[0]
                c2 = mv["c2"][mvi[wi]]
                lx, ly, lz = zn.local(g.cx[c2], g.cy[c2], mv["z"][mvi[wi]])
                hit = (np.abs(lx) <= hx + EDGE) & (lz >= -EDGE) & (lz <= CLIMB_REACH) & (ly <= hy + EDGE) & \
                      (ly >= hy - CLIMB_CATCH)
                if hit.any():
                    t = self.feet(zn, lx[hit])
                    good = t >= 0
                    dst[wi[hit][good]] = t[good]
                    caught[wi[hit][good]] = True
        self.caught = caught
        src = np.concatenate([src, np.array(extra_s, dtype=np.int64)])
        dst = np.concatenate([dst, np.array(extra_d, dtype=np.int64)])
        fall = np.concatenate([np.where(caught, 0.0, fallh), np.array(extra_f)])
        return src, dst, fall

    def place(self, x, y, z, mode="walk", zones=None):
        """controller.ts place(): the ground under a point (from 1 m above, or the step height in a crawl zone)."""
        g = self.g
        c = int(g.col_at(x, y))
        if c < 0:
            return None
        if mode == "crawl" and any(bool(zn.contains(x, y, z)) for zn in self.zones if zn.kind == "sidle"):
            mode = "thin"  # controller.ts place(): a crawl arrival with the feet in a sidle zone crawls thin
        up = STEP if mode in CRAWLING else 1.0
        cols = np.array([c])
        zg = self.Hdown(mode, cols, np.array([z + up - STEP]))
        if np.isnan(zg[0]) or zg[0] < z - 2.0:
            return None
        zt = self.settle(mode, cols, zg)
        k = self.match(mode, cols, zt)[0]
        if k < 0 or not self.valid[mode][k, c]:
            for m2 in MODES:
                k2 = self.match(m2, cols, self.settle(m2, cols, zg))[0]
                if k2 >= 0 and self.valid[m2][k2, c]:
                    return self.sid(m2, k2, c)
            return None
        return self.sid(mode, k, c)

    def landings(self, zn, lx, zones):
        """The mantle at the top, for each lx along the face: 0.8 m behind it, the ground within a metre below (the
        centre ray); crawling if a crawl zone holds it or there is no room to stand. State ids, -1 for none."""
        lx = np.asarray(lx, dtype=np.float64)
        x, y, z = zn.world(lx, zn.half[1], -MANTLE_REACH)
        z = np.broadcast_to(z, lx.shape).astype(np.float64)
        c = self.g.col_at(x, y)
        out = np.full(len(lx), -1, np.int64)
        ok = c >= 0
        # a mantle that lands beyond a seam leaves the section: it reaches the seam's portal
        sm = seam_beyond(self.sec, float(np.mean(x)), float(np.mean(y)), float(z.flat[0])) if len(lx) else None
        if sm is not None:
            ps = self.portal_cache.setdefault(sm["id"], portal_states(self, sm["portal"]))
            out[:] = ps[0] if ps else -1
            return out
        best = np.full(len(lx), -np.inf)
        for li in range(self.g.L):
            f = np.where(ok, self.g.AF[li, np.where(ok, c, 0)], np.nan)
            hit = (f >= z - LEDGE_DROP - 1e-6) & (f <= z + STEP + 1e-6) & (f > best)
            best = np.where(hit, f, best)
        ok &= np.isfinite(best)
        i = np.nonzero(ok)[0]
        if not len(i):
            return out
        cols, zz = c[i], best[i]
        cr, sd, _ = self.zone_masks(x[i], y[i], zz, zones)
        crawl = cr | ~self.room(cols, zz, "walk")
        # landing crawling, the viewer picks the thin crawl on its next step where the feet are in a sidle zone
        for mode, sel in (("crawl", crawl & ~sd), ("thin", crawl & sd), ("walk", ~crawl)):
            if not sel.any():
                continue
            zt = self.settle(mode, cols[sel], zz[sel])
            k = self.match(mode, cols[sel], zt)
            good = k >= 0
            good[good] = self.valid[mode][k[good], cols[sel][good]]
            out[i[sel][good]] = self.sid(mode, k[good], cols[sel][good])
        return out

    def feet(self, zn, lx):
        """Letting go at the foot of the face, for each lx: the walking state, -1 for none."""
        lx = np.asarray(lx, dtype=np.float64)
        x, y, z = zn.world(lx, -zn.half[1], CLIMB_HOLD)
        z = np.broadcast_to(z, lx.shape).astype(np.float64)
        c = self.g.col_at(x, y)
        out = np.full(len(lx), -1, np.int64)
        i = np.nonzero(c >= 0)[0]
        if not len(i):
            return out
        cols = c[i]
        zg = self.H("walk", cols, z[i])
        g = ~np.isnan(zg)
        zt = self.settle("walk", cols[g], zg[g])
        k = self.match("walk", cols[g], zt)
        good = k >= 0
        good[good] = self.valid["walk"][k[good], cols[g][good]]
        out[i[g][good]] = self.sid("walk", k[good], cols[g][good])
        return out

    def landing(self, zn, lx, zones):
        s = int(self.landings(zn, [lx], zones)[0])
        return None if s < 0 else s

    def foot(self, zn, lx):
        s = int(self.feet(zn, [lx])[0])
        return None if s < 0 else s

    def slope_perch(self, src, dst):
        """Falls that start from a perch on a slope: the probe ray holding the feet rests on a surface that rises
        from the landing through the column between it and the centre (a wall's foot), not on the lip of a ledge."""
        g = self.g
        m, k, c = self.unsid(src)
        z = np.array([self.E[MODES[mi]][ki, ci] for mi, ki, ci in zip(m, k, c)])
        _, _, zl, _ = self.pos(dst)
        out = np.zeros(len(src), bool)
        for i in range(len(src)):
            for dx, dy in self.probe_xy[MODES[m[i]]]:
                sup = g.AF[:, c[i] + dy * g.nxp + dx]
                if not np.any(np.abs(sup - z[i]) <= 1e-4):
                    continue
                mid = c[i] + int(dy / 2) * g.nxp + int(dx / 2)
                f = g.AF[:, mid]
                if np.any((f > zl[i] + 0.1) & (f < z[i] - 0.1)):
                    out[i] = True
                    break
        return out

    # ---- graph searches

    @staticmethod
    def csr(src, dst, n):
        # 32-bit where it fits: the index arrays are as long as the state space, which a large section makes big
        it = np.int32 if max(n + 2, len(src) + 1) < 2 ** 31 else np.int64
        order = np.argsort(src, kind="stable")
        d = dst[order].astype(it)
        indptr = np.bincount(src + 1, minlength=n + 2).astype(it)
        return np.cumsum(indptr, dtype=it), d

    @staticmethod
    def bfs(graph, seeds, n, allow=None):
        """Every state reached from the seeds; with `allow` (a mask over states), only through allowed states."""
        indptr, ind = graph
        vis = np.zeros(n + 1, bool)
        front = np.unique(np.asarray([s for s in seeds if s is not None], dtype=np.int64))
        vis[front] = True
        while len(front):
            st, en = indptr[front], indptr[front + 1]
            cnt = en - st
            tot = int(cnt.sum())
            if tot == 0:
                break
            idx = np.repeat(st - (np.cumsum(cnt) - cnt), cnt) + np.arange(tot)
            nb = ind[idx]
            nb = np.unique(nb[~vis[nb]])
            if allow is not None:
                nb = nb[allow[nb]]
            vis[nb] = True
            front = nb
        return vis

    def graphs(self, zones):
        src, dst, fall = self.edges(zones)
        n = self.N + 1
        return self.csr(src, dst, n), self.csr(dst, src, n), (src, dst, fall)


def run_flood(sec, grid, zones, report_zones=True):
    """Seeds, reach, traps, undesigned reach, unguarded drops and the zone checks; a dict for the report and the
    pieces the plan picture draws."""
    t0 = time.time()
    fl = Flood(sec, grid, zones, sec.d.get("drops", []))
    fl.moves()
    fwd, rev, (src, dst, fall) = fl.graphs(zones)
    caught_n = int(fl.caught.sum())
    d = sec.d
    seeds, seed_info = [], []
    for sp in d.get("spawns", []):
        s = fl.place(*sp["at"], mode=sp.get("mode", "walk"))
        seeds.append(s)
        seed_info.append({"id": sp["id"], "kind": "spawn", "mode": sp.get("mode", "walk"), "found": s is not None})
    climb_nodes = []
    for sm in d.get("seams", []):
        arr = sm["arrival"]
        mode = arr.get("mode", "walk")
        if mode == "climb":
            s = None
            for zn in zones:
                if zn.kind == "climb":
                    lx, ly, lz = zn.local(*arr["at"])
                    if abs(lx) <= zn.half[0] + EDGE and -EDGE <= lz <= CLIMB_REACH and abs(ly) <= zn.half[1] + 0.6:
                        up, down = fl.landing(zn, float(lx), zones), fl.foot(zn, float(lx))
                        s = (up, down)
            climb_nodes.append(s)
            seeds += [x for x in (s or ()) if x is not None]
            seed_info.append({"id": sm["id"], "kind": "seam_arrival", "mode": mode, "found": bool(s and any(s))})
        else:
            s = fl.place(*arr["at"], mode=mode)
            seeds.append(s)
            seed_info.append({"id": sm["id"], "kind": "seam_arrival", "mode": mode, "found": s is not None})
    n = fl.N + 1
    primary = seeds[0] if seeds else None
    reach_all = Flood.bfs(fwd, [s for s in seeds if s is not None], fl.N)
    reach_p = Flood.bfs(fwd, [primary], fl.N) if primary is not None else np.zeros(n, bool)
    # portal states: reached states near each portal (seam portals and section portals)
    rs = np.nonzero(reach_all[:fl.N])[0]
    rx, ry, rz, rm = fl.pos(rs) if len(rs) else (np.zeros(0),) * 4
    targets = [(p["id"], "portal", p["at"]) for p in d.get("portals", [])]
    targets += [(s["id"], "seam_portal", s["portal"]) for s in d.get("seams", [])]
    exits = [s for s in seeds if s is not None]
    tinfo = []
    for tid, kind, at in targets:
        near = (np.hypot(rx - at[0], ry - at[1]) <= PORTAL_R) & (np.abs(rz - at[2]) <= 1.0) if len(rs) else []
        hits = rs[near] if len(rs) else np.zeros(0, np.int64)
        exits += list(hits)
        tinfo.append({"id": tid, "kind": kind, "reached": bool(len(hits)),
                      "from_primary_spawn": bool(len(hits) and reach_p[hits].any())})
    for si in seed_info:
        pass
    co = Flood.bfs(rev, exits, fl.N)
    trap_mask = reach_all[:fl.N] & ~co[:fl.N]
    traps = np.nonzero(trap_mask)[0]
    wedge = bool(reach_all[fl.WEDGE])
    # undesigned reach
    designed = np.zeros(len(rs), bool)
    for p in sec.prims:
        if hasattr(p, "designed"):
            designed |= p.designed(rx, ry, rz)
    for br in d.get("bridges", []):  # a bridge's deck is walked by design (over a crack or a shaft)
        x0, y0, x1, y1 = br["box"]
        designed |= ((rx >= x0 - 0.5) & (rx <= x1 + 0.5) & (ry >= y0 - 0.5) & (ry <= y1 + 0.5)
                     & (np.abs(rz - br["top_z"]) <= 0.6))
    und = rs[~designed]
    # drops over 0.35 m: guarded (no edge), caught by a climb, or declared. A fall whose start the walker walks
    # straight back to (a perch on a wall's foot, a probe ray resting on the fillet) is not a drop.
    drops = []
    fe = np.nonzero((fall > STEP + 1e-6) & reach_all[src] & (dst != fl.WEDGE))[0]
    if len(fe):
        back = local_return(fwd, src[fe], dst[fe], fl.N)
        fe = fe[~back]
    if len(fe):
        fe = fe[~fl.slope_perch(src[fe], dst[fe])]
    slips = 0
    if len(fe):
        # a crawler that found no room to stand after its zone may ride up a wall's foot and slip off it: counted
        # apart, it is not a ledge beside walkable floor
        sm, _, sc = fl.unsid(src[fe])
        cz = fl.pos(src[fe])[2]
        incr, _, _ = fl.zone_masks(fl.g.cx[sc], fl.g.cy[sc], cz, zones)
        slip = ((sm == MODES.index("crawl")) | (sm == MODES.index("thin"))) & ~incr
        slips = int(slip.sum())
        fe = fe[~slip]
    if len(fe):
        fx, fy, fz, _ = fl.pos(src[fe])
        ok = np.zeros(len(fe), bool)
        for dr in d.get("drops", []):
            a = dr["from"]
            ok |= (np.hypot(fx - a[0], fy - a[1]) <= dr.get("radius", 1.5)) & (np.abs(fz - a[2]) <= 0.6)
        bad = fe[~ok]
        if len(bad):
            bx, by, bz, _ = fl.pos(src[bad])
            key = np.unique(np.stack([np.round(bx), np.round(by), np.round(bz)], 1), axis=0)
            drops = [{"at": [float(v) for v in k]} for k in key[:40]]
        declared = int(ok.sum())
    else:
        declared = 0
    # falls through cracks the lattice's rounded rays would have bridged, from reached states
    cracks = [c for c in fl.cracks if reach_all[c[0]]]
    # reached modes
    per_mode = {m: int((rm == i).sum()) for i, m in enumerate(MODES)} if len(rs) else {m: 0 for m in MODES}
    seeds_reached = [bool(s is not None and reach_p[s]) for s in seeds]
    zinfo = []
    if report_zones:
        for chain in zone_chains(zones):
            res = zone_check(fl, chain, zones, fwd, reach_all)
            for zn in chain:  # each segment's zone carries its passage's result, and its own walk round
                byp = res["bypassable"] or zn.id in res["segments_walked_round"]
                zinfo.append(dict(res, id=zn.id, bypassable=byp, bypassed_end_to_end=res["bypassable"],
                                  mandatory=res["traversable"] and not byp))
    out = {
        "states": int(len(rs)),
        "reached_by_mode": per_mode,
        "levels": int(fl.K),
        "seeds": seed_info,
        "seeds_from_primary_spawn": seeds_reached,
        "targets": tinfo,
        "traps": int(len(traps)) + (1 if wedge else 0),
        "trap_samples": sample_pos(fl, traps),
        "wedged": wedge,
        "wedge_samples": sample_pos(fl, np.unique(src[(dst == fl.WEDGE) & reach_all[src]])),
        "undesigned": int(len(und)),
        "undesigned_samples": sample_pos(fl, und),
        "unguarded_drops": drops,
        "declared_drops_used": declared,
        "crawl_slips": slips,
        "falls_caught_by_climbs": caught_n,
        "voids": int(fl.voids),
        "crack_falls": len(cracks),
        "crack_samples": sorted({tuple(round(v, 2) for v in c[1:]) for c in cracks})[:20],
        "zones": zinfo,
        "seconds": round(time.time() - t0, 2),
    }
    ok = (all(si["found"] for si in seed_info) and all(seeds_reached) and all(t["from_primary_spawn"] for t in tinfo)
          and out["traps"] == 0 and out["undesigned"] == 0 and not drops
          and all(z["traversable"] and not z["bypassable"] for z in zinfo))
    out["ok"] = bool(ok)
    return out, {"flood": fl, "reach": reach_all, "traps": traps, "undesigned": und, "seeds": seeds,
                 "fwd": fwd, "primary": primary}


def local_return(graph, src, dst, n, depth=24):
    """For each fall edge: does the walker get back to its start within `depth` lattice moves of where it lands?"""
    indptr, ind = graph
    out = np.zeros(len(src), bool)
    for t in np.unique(dst):
        seen = np.array([t], dtype=np.int64)
        front = seen
        for _ in range(depth):
            st, en = indptr[front], indptr[front + 1]
            cnt = en - st
            tot = int(cnt.sum())
            if tot == 0:
                break
            nb = np.unique(ind[np.repeat(st - (np.cumsum(cnt) - cnt), cnt) + np.arange(tot)])
            nb = nb[~np.isin(nb, seen)]
            if not len(nb):
                break
            seen = np.union1d(seen, nb)
            front = nb
        sel = dst == t
        out[sel] = np.isin(src[sel], seen)
    return out


def sample_pos(fl, states, n=20):
    if not len(states):
        return []
    x, y, z, m = fl.pos(np.asarray(states)[:n])
    return [{"at": [round(float(a), 3), round(float(b), 3), round(float(c), 3)], "mode": MODES[int(mm)]}
            for a, b, c, mm in zip(x, y, z, m)]


def seam_beyond(sec, x, y, z):
    """The seam whose plane a point lies at or beyond (on the neighbour's side, within the seam's window), or None:
    a zone that runs into a seam ends there, and the neighbour holds its far end."""
    for sm, ax, at, plus in sec.seam_boxes:
        u0, z0, u1, z1 = sm["window"]
        a, u = (x, y) if ax == 0 else (y, x)
        past = (a - at) if plus else (at - a)
        if past >= -0.3 and u0 - 0.5 <= u <= u1 + 0.5 and z0 - 1.0 <= z <= z1 + 1.0:
            return sm
    return None


def zone_chains(zones):
    """The zones checked together: a crawl or a fissure with bends has one zone per straight segment, and the walker
    goes through all of them in turn, so they are one chain from the passage's first end to its last (in segment
    order); a climb is a chain of one."""
    chains, at = [], {}
    for zn in zones:
        key = (zn.kind, zn.source)
        if zn.kind == "climb" or key not in at:
            at[key] = len(chains)
            chains.append([zn])
        else:
            chains[at[key]].append(zn)
    return chains


def as_chain(zn):
    return list(zn) if isinstance(zn, (list, tuple)) else [zn]


def zone_end_points(zn):
    """Where each end of a zone (or of a chain of a passage's zones) is looked for: 0.6 m beyond the first zone's -X
    end and the last zone's +X end at the floor (crawl, sidle), or the foot (0.4 m in front of the face) and the
    mantle's landing (a climb)."""
    chain = as_chain(zn)
    first, last = chain[0], chain[-1]
    if first.kind == "climb":
        return [first.world(0.0, -first.half[1], 0.4), first.world(0.0, first.half[1], -MANTLE_REACH)]
    return [z.world(s * (z.half[0] + 0.6), 0.0, 0.0)[:2] + (z.o[2] - z.half[1] + 0.25,)
            for s, z in ((-1, first), (1, last))]


def portal_states(fl, at):
    """Every valid state (any mode) whose feet stand within PORTAL_R in plan and 1 m in height of a portal."""
    g = fl.g
    near = np.nonzero(np.hypot(g.cx - at[0], g.cy - at[1]) <= PORTAL_R)[0]
    out = []
    for m in MODES:
        for k in range(fl.K):
            e = fl.E[m][k, near]
            sel = fl.valid[m][k, near] & (np.abs(e - at[2]) <= 1.0)
            out += [int(v) for v in fl.sid(m, k, near[sel])]
    return out


def arrival_states(fl, sm, zones):
    """The states a seam's arrival puts the walker in (in its mode; hanging on a face, both ways off it)."""
    arr = sm["arrival"]
    mode = arr.get("mode", "walk")
    if mode != "climb":
        s = fl.place(*arr["at"], mode=mode)
        return [] if s is None else [s]
    out = []
    for zn in zones:
        if zn.kind == "climb":
            lx, ly, lz = zn.local(*arr["at"])
            if abs(lx) <= zn.half[0] + EDGE and -EDGE <= lz <= CLIMB_REACH and abs(ly) <= zn.half[1] + 0.6:
                out += [v for v in (fl.landing(zn, float(lx), zones), fl.foot(zn, float(lx))) if v is not None]
    return out


def states_near(fl, x, y, z, reach=4):
    """Every valid state (any mode) within `reach` lattice columns of (x, y) and 0.6 m of z."""
    g, sec = fl.g, fl.sec
    out = []
    gx0 = int(np.rint((x - sec.origin[0]) / sec.cell))
    gy0 = int(np.rint((y - sec.origin[1]) / sec.cell))
    for dx in range(-reach, reach + 1):
        for dy in range(-reach, reach + 1):
            cc = int(g.col_at(sec.origin[0] + (gx0 + dx) * sec.cell, sec.origin[1] + (gy0 + dy) * sec.cell))
            if cc < 0:
                continue
            for m in MODES:
                for k in range(fl.K):
                    if fl.valid[m][k, cc] and abs(fl.E[m][k, cc] - z) <= 0.6:
                        out.append(fl.sid(m, k, cc))
    return out


def zone_ends(fl, zn):
    """States at the two ends of a zone or a chain of zones: for crawl and sidle, 0.6 m beyond the chain's ends along
    X at the floor; for a climb, the foot (0.4 m in front of the face) and the top (the mantle's landing)."""
    chain = as_chain(zn)
    first = chain[0]

    def near(x, y, z):
        return states_near(fl, x, y, z)

    pts = zone_end_points(chain)
    seams = [seam_beyond(fl.sec, *p) for p in pts]
    ends = []
    for i, (p, sm) in enumerate(zip(pts, seams)):
        if sm is not None:  # the end lies in the neighbour: the seam's portal stands for it
            ends.append(portal_states(fl, sm["portal"]))
        elif first.kind == "climb" and i == 1:
            t = fl.landing(first, 0.0, fl.zones)
            ends.append([t] if t is not None else near(*p))
        else:
            ends.append(near(*p))
    return ends[0], ends[1]


def alternatives(d, pid):
    """The passages declared alternatives of passage pid (either way round): its bypass test takes their zones away
    too, so of a pair the walker must make one move or the other."""
    out = set()
    for p in d.get("passages", []):
        if p["id"] == pid:
            out |= set(p.get("alternatives", []))
        elif pid in p.get("alternatives", []):
            out.add(p["id"])
    out.discard(pid)
    return out


def without_graph(fl, kept, alt_climbs):
    """The walk graph with only the kept zones. A declared alternative that is a climb also loses the falls off its
    ledge: in the viewer a walker who steps off the top meets the face and climbs down it (the face catches the
    fall), so with the face's zone taken away that fall is the climb itself, not a way round the other move."""
    src, dst, fall = fl.edges(kept)
    if alt_climbs:
        drop = np.zeros(len(src), bool)
        fe = np.nonzero((fall > STEP + 1e-6) & (src < fl.N))[0]
        if len(fe):
            x, y, z, _ = fl.pos(src[fe])
            for c in alt_climbs:
                lx, ly, lz = c.local(x, y, z)
                drop[fe] |= ((np.abs(lx) <= c.half[0] + 0.6) & (lz >= -1.5) & (lz <= 0.6)
                             & (ly >= c.half[1] - 0.6))
        src, dst = src[~drop], dst[~drop]
    return fl.csr(src, dst, fl.N + 1)


def zone_check(fl, zn, zones, full, reached=None):
    """For a zone or a passage's chain of zones. Traversable: from each end of the chain to the other with every
    zone. Bypassable: from the walking states at one end to the other without the chain's zones. An end beyond a seam
    is the seam: reached at its portal, started from its arrival (in the arrival's mode), and never a walking start
    for the bypass. An end with no walking state (a crawl that opens straight into a fissure: the body there crawls
    thin or sidles) is started from the flood's reached states there, in whatever mode they are."""
    chain = as_chain(zn)
    zn = chain[0]
    a, b = zone_ends(fl, chain)
    seams = [seam_beyond(fl.sec, *p) for p in zone_end_points(chain)]
    alts = alternatives(fl.sec.d, zn.source)
    without = without_graph(fl, [z for z in zones if all(z is not c for c in chain) and z.source not in alts],
                            [z for z in zones if z.source in alts and z.kind == "climb"])

    walk_n = fl.K * fl.g.NP  # walking states come first in the id space

    def walking(s):
        return [v for v in s if v < walk_n]

    def reach(gr, s, t):
        if not s or not t:
            return False
        v = Flood.bfs(gr, s, fl.N)
        return bool(v[np.asarray(t)].any())

    def begin(e):
        w = walking(e)
        if w or reached is None:
            return w
        return [v for v in e if reached[v]]

    start = [arrival_states(fl, sm, zones) if sm is not None else begin(e) for e, sm in zip((a, b), seams)]
    walk_start = [[] if sm is not None else walking(e) for e, sm in zip((a, b), seams)]
    trav = reach(full, start[0], b) and reach(full, start[1], a)
    byp = reach(without, walk_start[0], b)
    if zn.kind != "climb":  # walking off a ledge is a plain fall, not a bypass
        byp = byp or reach(without, walk_start[1], a)
    # Each segment on its own: a walking route that joins the chain part way along (a side passage opening at a bend,
    # or part way along a straight crawl) walks round the part before it. From each end, without the chain's zones,
    # the walker gets as deep into the chain as its walking states inside the zones proper (no end margins) reach,
    # measured along the centre line. Past WALK_ROUND m in, every segment whose far end that passes is walked round,
    # and when it passes none (the route joins inside the end segment, or the passage is one straight zone), the end
    # segment is: part of it is walked round. (A room's blend lets the walking body a little way into a mouth; that
    # never counts, and neither does a chamber's floor that runs into the passage's end: the walking states the walker
    # gets to from the end without leaving the chain's zones (and the ground just beyond its ends) are the mouth's, so
    # only those reached round some other way are measured.)
    skipped = []
    deep = [0.0, 0.0]
    if zn.kind != "climb":
        cum = np.concatenate([[0.0], np.cumsum([2 * c.half[0] for c in chain])])
        S = float(cum[-1])
        for e, s_ in enumerate(walk_start):
            if not s_:
                continue
            seen = Flood.bfs(without, s_, fl.N)
            got = np.nonzero(seen[:walk_n])[0]
            if not len(got):
                continue
            x, y, z, _ = fl.pos(got)
            near = np.zeros(len(got), bool)
            for c in chain:
                near |= c.contains(x, y, z, end_margin=1.2)
            allow = np.zeros(fl.N + 1, bool)
            allow[got[near]] = True
            mouth = Flood.bfs(without, s_, fl.N, allow=allow)[got]
            best = np.full(len(got), -np.inf)
            for c, c0 in zip(chain, cum[:-1]):
                lx, ly, lz = c.local(x, y, z)
                inside = (np.abs(lx) <= c.half[0]) & (np.abs(ly) <= c.half[1] + EDGE) & (np.abs(lz) <= c.half[2] + EDGE)
                d = c0 + lx + c.half[0] if e == 0 else S - (c0 + lx + c.half[0])
                best = np.where(inside & ~mouth & (d > best), d, best)
            deep[e] = float(max(best.max(), 0.0))
        for e in (0, 1):
            if deep[e] <= WALK_ROUND:
                continue
            order = range(len(chain)) if e == 0 else range(len(chain) - 1, -1, -1)
            far = [cum[j + 1] if e == 0 else S - cum[j] for j in order]
            hit = [chain[j].id for j, f in zip(order, far) if deep[e] >= f - EDGE]
            skipped += hit or [chain[order[0]].id]
        skipped = [c.id for c in chain if c.id in skipped]
    return {"id": zn.id, "kind": zn.kind, "passage": zn.source, "segments": len(chain),
            "ends_found": [bool(a), bool(b)], "traversable": bool(trav),
            "bypassable": bool(byp), "mandatory": bool(trav and not byp),
            "segments_walked_round": skipped, "walked_in": [round(v, 2) for v in deep],
            "alternatives": sorted(alts),
            "seam_ends": [sm["id"] if sm is not None else None for sm in seams]}


# ---------------------------------------------------------------- solids (collision proxies in the flood)


def guard_segments(sec):
    out = []
    for gd in sec.d.get("guards", []):
        pts = gd["line"]
        if gd.get("closed", False):
            pts = pts + [pts[0]]
        for a, b in zip(pts[:-1], pts[1:]):
            out.append((gd["id"], a, b, gd["base_z"], gd.get("height", 1.0), gd.get("thickness", 0.12)))
    for c in sec.own:
        if isinstance(c, Chamber) and c.kind == "lake":
            ring = c.basin_ring()
            ring = ring + [ring[0]]
            for a, b in zip(ring[:-1], ring[1:]):
                out.append((f"{c.id}_basin_guard", a, b, c.c[2], 1.0, 0.12))
    return out


def apply_solids(grid, sec, solids):
    """Removes the proxies' solid spans from the columns' air intervals."""
    grid.solids = list(solids)
    col, f, c = grid.icol.copy(), grid.if_.copy(), grid.ic.copy()
    half = 0.5 * sec.cell
    for s in solids:
        kind = s[0]
        if kind == "disk":
            _, x, y, r, z0, z1 = s
            hit = np.hypot(grid.cx - x, grid.cy - y) <= r + half
        elif kind == "rect":
            _, x, y, hx, hy, ux, uy, z0, z1 = s
            dx, dy = grid.cx - x, grid.cy - y
            hit = (np.abs(dx * ux + dy * uy) <= hx + half) & (np.abs(-dx * uy + dy * ux) <= hy + half)
        elif kind == "seg":
            _, a, b, th, z0, z1 = s
            ax, ay = b[0] - a[0], b[1] - a[1]
            L2 = ax * ax + ay * ay
            t = np.clip(((grid.cx - a[0]) * ax + (grid.cy - a[1]) * ay) / L2, 0.0, 1.0)
            hit = np.hypot(grid.cx - (a[0] + t * ax), grid.cy - (a[1] + t * ay)) <= 0.5 * th + half
        elif kind == "aabb":
            _, x0, y0, x1, y1, z0, z1 = s
            hit = (grid.cx >= x0 - half) & (grid.cx <= x1 + half) & (grid.cy >= y0 - half) & (grid.cy <= y1 + half)
        else:
            continue
        hc = np.nonzero(hit)[0]
        if not len(hc):
            continue
        grid.proxy[hc] = True
        m = np.isin(col, hc) & (f < z1) & (c > z0)
        if not m.any():
            continue
        cm, fm, cmx = col[m], f[m], c[m]
        lower = fm < z0
        upper = cmx > z1
        col = np.concatenate([col[~m], cm[lower], cm[upper]])
        f2 = np.concatenate([f[~m], fm[lower], np.full(int(upper.sum()), z1)])
        c2 = np.concatenate([c[~m], np.full(int(lower.sum()), z0), cmx[upper]])
        f, c = f2, c2
    grid.set_intervals(col, f, c)


# ---------------------------------------------------------------- clearance along the routes


def clearance(sec):
    """Per passage: the narrowest width at body height and the lowest and highest roof, measured in the field along
    the centre line (every 0.25 m in crawls and fissures, 0.5 m elsewhere) where no other primitive shapes it; the
    widest width is not read within the cross-section's reach of a bend, where it runs into the next segment."""
    out = []
    for p in sec.own:
        if not isinstance(p, Passage) or p.profile in ("shaft", "climb_face"):
            continue
        band = (0.35, 0.9) if p.profile == "crawl" else (0.35, 1.75)
        fine = p.profile in ("crawl", "fissure")
        step = 0.25 if fine else 0.5
        ss = np.arange(0.5 * step, p.S, step)
        j = np.clip(np.searchsorted(p.cum, ss, side="right") - 1, 0, len(p.A) - 1)
        t = (ss - p.cum[j]) / p.L[j]
        x = p.A[j, 0] + t * (p.B[j, 0] - p.A[j, 0])
        y = p.A[j, 1] + t * (p.B[j, 1] - p.A[j, 1])
        _, base, stepf = p.floors(j, t, np.zeros(len(j)), False)
        # only where this passage alone shapes the section: away from the chambers and passages it opens into
        alone = np.ones(len(ss), bool)
        for q in sec.prims:
            if q is p or q.cls == 2:
                continue
            for h in (0.5, 1.2):
                c = Ctx(x, y, stepf + h, np.zeros(len(ss)), np.zeros(len(ss)))
                alone &= q.eval(c)[0] < -0.5
        keep = alone
        ss, j, t, x, y, base, stepf = ss[keep], j[keep], t[keep], x[keep], y[keep], base[keep], stepf[keep]
        if not len(ss):
            out.append({"id": p.id, "profile": p.profile, "samples": 0})
            continue
        nx_, ny_ = -(p.B[j, 1] - p.A[j, 1]) / p.L[j], (p.B[j, 0] - p.A[j, 0]) / p.L[j]
        zf = stepf
        hs = np.arange(0.02, max(p.h) + 1.5, 0.02)
        Pz = np.stack([np.repeat(x, len(hs)), np.repeat(y, len(hs)), (zf[:, None] + hs[None, :]).ravel()], 1)
        fz = sec.field_points(Pz).reshape(len(ss), len(hs))
        first = np.argmax(fz <= 0, axis=1)
        height = np.where((fz <= 0).any(1), hs[first], hs[-1])
        du = 0.01 if fine else 0.02
        reach = du * math.ceil((0.5 * max(p.w) + 0.4) / du)  # a whole number of steps: u = 0 is a sample
        us = np.arange(-reach, reach + 1e-9, du)
        bh = np.arange(band[0], band[1] + 1e-9, 0.1 if fine else 0.2)
        wmin = np.full(len(ss), np.inf)
        wmax = np.zeros(len(ss))
        # near a bend the cross-section runs into the next segment's air: the widest width is not read there
        bends = p.cum[1:len(p.A)]
        straight = (np.abs(ss[:, None] - bends[None, :]) > reach).all(1) if len(bends) else np.ones(len(ss), bool)
        for h in bh:
            Pw = np.stack([(x[:, None] + nx_[:, None] * us[None, :]).ravel(),
                           (y[:, None] + ny_[:, None] * us[None, :]).ravel(),
                           np.repeat(zf + h, len(us))], 1)
            fw = sec.field_points(Pw).reshape(len(ss), len(us)) > 0
            mid = len(us) // 2
            rs, ls = ~fw[:, mid:], ~fw[:, :mid + 1][:, ::-1]
            right = np.where(rs.any(1), np.argmax(rs, axis=1), rs.shape[1])
            left = np.where(ls.any(1), np.argmax(ls, axis=1), ls.shape[1])
            wd = (right + left - 1) * du
            wmin = np.minimum(wmin, wd)
            wmax = np.maximum(wmax, np.where(straight, wd, 0.0))
        need = CORE["walk"] if p.profile in WALK_PROFILES else CORE[p.profile]
        rec = {"id": p.id, "profile": p.profile, "samples": int(len(ss)), "min_width": round(float(wmin.min()), 3),
               "max_width": round(float(wmax.max()), 3), "min_height": round(float(height.min()), 3),
               "max_height": round(float(height.max()), 3), "need": list(need),
               "mode": "crawl" if p.profile == "crawl" else "sidle" if p.profile == "fissure" else "walk"}
        ok = rec["min_width"] >= need[0] - 0.02 and rec["min_height"] >= need[1] - 0.02
        if p.profile == "crawl":
            ok = ok and rec["max_height"] <= CRAWL_CLEAR[1] + 0.1
        if p.profile == "fissure":
            ok = ok and rec["max_width"] <= FISSURE_WIDTH[1] + 0.05
        rec["ok"] = bool(ok)
        out.append(rec)
    return out


# ---------------------------------------------------------------- attributes, UVs, chunks


UV_SMOOTH_CELL = 0.5    # metres: the grid whose 3 x 3 x 3 neighbourhood smooths the normal that picks a shell projection
UV_SMOOTH_AGREE = 0.3   # a face takes the smoothed axis only where its own normal agrees with the smoothed one this much
UV_SMOOTH_MIN = 0.25    # ... and its own normal's share on that axis is at least this (marching cubes' slivers lean)
UV_MODE_ROUNDS = 4      # rounds of the vote among edge neighbours that removes the last single-face islands
UV_SEAM_KEEP = 1.5      # metres: within this of a seam plane a face keeps its own axis (both files see the same faces)


def smooth_axis(Vf, F, seam_planes=(), cell: float = UV_SMOOTH_CELL, rounds: int = UV_MODE_ROUNDS):
    """Each face's projection axis from its normal smoothed over its neighbourhood (the area-weighted normals of the
    faces in the 3 x 3 x 3 cells of `cell` metres around it), so a wall's bedding, scallops and joints keep one
    projection instead of flipping between planes face by face (the rebuild's check: the Spar Maze's marble showed in
    triangular facets), then `rounds` of a vote: a face takes the axis most of its edge neighbours have (its own
    counting half). A face whose own normal disagrees with the smoothed one (a thin fin, a lip), or whose own normal
    has under UV_SMOOTH_MIN of its length on an axis, never takes that axis. A face within UV_SEAM_KEEP of a seam plane
    (`seam_planes`: (axis, at) rows; the neighbour's file has other faces beyond it) keeps its own dominant axis.
    Deterministic: world cells and the faces' edges, not their order. On the Spar Maze: axis changes across edges
    8.3 % -> 3.2 %, faces unlike two or more neighbours 3.4 % -> 0.4 % of the area."""
    a, b, c = Vf[F[:, 0]], Vf[F[:, 1]], Vf[F[:, 2]]
    n = np.cross(b - a, c - a)
    own = np.argmax(np.abs(n), axis=1)
    if not len(F):
        return own
    cen = (a + b + c) / 3.0
    key = np.floor(cen / cell).astype(np.int64)
    key -= key.min(axis=0) - 1
    span = int(key.max()) + 2
    code = (key[:, 0] * span + key[:, 1]) * span + key[:, 2]
    uk, inv = np.unique(code, return_inverse=True)
    S = np.zeros((len(uk), 3))
    np.add.at(S, inv.ravel(), n)
    acc = np.zeros((len(F), 3))
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                c2 = code + (dx * span + dy) * span + dz
                j = np.minimum(np.searchsorted(uk, c2), len(uk) - 1)
                hit = uk[j] == c2
                acc[hit] += S[j[hit]]
    nn = np.linalg.norm(n, axis=1)
    an = np.linalg.norm(acc, axis=1)
    agree = (acc * n).sum(1) >= UV_SMOOTH_AGREE * np.maximum(an * nn, 1e-30)
    sm = np.argmax(np.abs(acc), axis=1)
    share = np.abs(np.take_along_axis(n, sm[:, None], axis=1)[:, 0]) / np.maximum(nn, 1e-30)
    use = agree & (share >= UV_SMOOTH_MIN) & (an > 0)
    keep = np.zeros(len(F), bool)
    for ax, at in seam_planes:
        keep |= np.abs(cen[:, ax] - at) <= UV_SEAM_KEEP
    out = np.where(use & ~keep, sm, own)
    if rounds:
        e = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]).astype(np.int64)
        e.sort(axis=1)
        fi = np.tile(np.arange(len(F)), 3)
        ec = e[:, 0] * (int(F.max()) + 1) + e[:, 1]
        o = np.argsort(ec, kind="stable")
        ec, fi = ec[o], fi[o]
        pair = ec[1:] == ec[:-1]
        A, B = fi[:-1][pair], fi[1:][pair]
        no = np.abs(n) < UV_SMOOTH_MIN * nn[:, None]
        no[np.arange(len(F)), own] = False
        for _ in range(rounds):
            votes = np.zeros((len(F), 3))
            votes[np.arange(len(F)), out] += 0.5
            np.add.at(votes, (A, out[B]), 1.0)
            np.add.at(votes, (B, out[A]), 1.0)
            votes[no] = -1.0
            out = np.where(keep, own, np.argmax(votes, axis=1))
    return out


def face_uv(Vf, F, repeat, axis=None):
    """Cube projection per face: the face's dominant axis (or `axis`, one per face) picks the plane, UV = position /
    metres per repeat."""
    a, b, c = Vf[F[:, 0]], Vf[F[:, 1]], Vf[F[:, 2]]
    n = np.cross(b - a, c - a)
    axis = np.argmax(np.abs(n), axis=1) if axis is None else np.asarray(axis, np.int64)
    pick = np.array([[1, 2], [0, 2], [0, 1]])[axis]
    corners = np.stack([a, b, c], axis=1)  # (F, 3, 3)
    uv = np.take_along_axis(corners, pick[:, None, :].repeat(3, axis=1), axis=2) / repeat[:, None, None]
    return uv.astype(np.float32), axis.astype(np.int8)


def chunks(cells):
    """Each face's 12 m chunks (one more where its cell is the first of a chunk: the one-cell overlap)."""
    key = cells // CHUNK_CELLS
    first = (cells % CHUNK_CELLS) == 0
    rows = []
    for ox in (0, 1):
        for oy in (0, 1):
            for oz in (0, 1):
                o = np.array([ox, oy, oz])
                use = np.all(~o.astype(bool) | first, axis=1)
                if not use.any():
                    continue
                k = key[use] - o
                rows.append((np.nonzero(use)[0], k))
    fi = np.concatenate([r[0] for r in rows])
    ks = np.concatenate([r[1] for r in rows])
    uk, inv = np.unique(ks, axis=0, return_inverse=True)
    inv = inv.ravel()
    order = np.lexsort((fi, inv))
    off = np.zeros(len(uk) + 1, np.int64)
    np.add.at(off, inv + 1, 1)
    return uk.astype(np.int32), np.cumsum(off), fi[order].astype(np.int32)


def vertex_attrs(sec, Vq, bulges):
    V = Vq / Q
    acc, fa, dom, rock = sec.field_points(V, track=True)
    geo = np.zeros(len(V), np.int8)
    for i, p in enumerate(sec.prims):
        m = dom == i
        if m.any():
            geo[m] = p.geo
    u = (V - sec.origin) / sec.cell
    nb = noise_points(u, NOISE_BIG, sec.seed * 13 + 5)
    wet = np.clip(1.0 - np.clip(fa, 0.0, None) / 1.0, 0.0, 1.0)
    band = np.zeros(len(V))
    for b in bulges:
        d = np.sqrt(((V - b.c) ** 2).sum(1))
        f = V[:, 2] / 0.15
        f = f - np.floor(f)
        band = np.maximum(band, np.clip(1.0 - (d - b.r) / 0.6, 0.0, 1.0) * (0.5 + 0.5 * np.abs(2 * f - 1)))
    tints = np.array([hex_rgb(sec.geo_of(n)[1]["tint"]) for n in sec.geo_names], dtype=np.float64)
    tint = tints[geo] * (1.0 + 0.12 * nb)[:, None] * (1.0 - 0.3 * wet)[:, None]
    flow = np.array(hex_rgb("#B8A27E"))
    tint = tint * (1.0 - band[:, None]) + flow[None, :] * band[:, None]
    # where the clear core, not the rock, set the surface (the rock would have closed in)
    clip = round(float((acc - rock > 1e-3).mean()), 5) if len(V) else 0.0
    return {"tint": tint.astype(np.float32), "wet": wet.astype(np.float32), "band": band.astype(np.float32),
            "geo": geo, "core_clip": clip}


# ---------------------------------------------------------------- the build


class Rows:
    """Floor hints for formations from the section's primitives (the walking floor nearest a point)."""

    def __init__(self, sec):
        self.sec = sec

    def floor_hint(self, x, y):
        best, bz = None, None
        for p in self.sec.own:
            if isinstance(p, Chamber):
                lx, ly = p.local(np.array([x]), np.array([y]))
                d = float(p.plan_sdf(lx, ly)[0])
                z = p.c[2]
            elif isinstance(p, Passage) and p.profile not in ("shaft",):
                d, jj, tj = p.plan(np.array([x]), np.array([y]))
                d = float(d[0])
                z = float(p.floors(jj, tj, np.zeros(1), True)[1][0])
            else:
                continue
            if best is None or d < best:
                best, bz = d, z
        return (bz if bz is not None else 0.0) + 0.5


def mesh_section(sec, log=print):
    """Field, sparse marching cubes, transitions for the flood, collision field: everything that needs the field
    on the lattice."""
    B = sec.block
    t0 = time.time()
    lo, hi = sec.lo, sec.hi
    b0 = lo // B
    b1 = (hi - 1) // B
    blocks = [(bx, by, bz) for bz in range(b0[2], b1[2] + 1) for by in range(b0[1], b1[1] + 1)
              for bx in range(b0[0], b1[0] + 1)]
    # coarse activity: the field every 8 cells (1 m)
    cs = 8
    nco = B // cs + 1
    act = []
    for bk in blocks:
        g0 = np.array(bk) * B
        if not sec.cell_mask(g0, B).any():
            continue
        lo_ = sec.node_xyz(g0)
        hi_ = sec.node_xyz(g0 + B)
        if not sec.prims_for((lo_[0], lo_[1], lo_[2], hi_[0], hi_[1], hi_[2])):
            continue
        act.append(bk)
    if act:
        offs = np.stack(np.meshgrid(np.arange(nco), np.arange(nco), np.arange(nco), indexing="ij"), -1).reshape(-1, 3)
        pts = np.concatenate([sec.node_xyz(np.array(bk) * B + offs * cs) for bk in act])
        fc = sec.field_points(pts).reshape(len(act), -1)
        busy = (np.abs(fc) < ACTIVE_BAND).any(1) | ((fc > 0).any(1) & (fc <= 0).any(1))
        act = [bk for bk, b in zip(act, busy) if b]
    shell, coll, trans, nodes = [], [], [], []
    # The collision field differs from the shell's under stairs (the ramp through the treads), in tubes (the upright
    # wall foot, prof_wall) and on every lower wall (no noise push, noise_term); it is evaluated in every block.
    for bk in act:
        g0 = np.array(bk, dtype=np.int64) * B
        mask = sec.cell_mask(g0, B)
        lo_ = sec.node_xyz(g0)
        hi_ = sec.node_xyz(g0 + B)
        ps = sec.prims_for((lo_[0], lo_[1], lo_[2], hi_[0], hi_[1], hi_[2]))
        F = sec.field_block(g0, prims=ps)
        if F is None:
            continue
        r = mc_block(F, mask, g0, B, sec.cell, sec.origin)
        if r is not None:
            shell.append(r)
        Fc = sec.field_block(g0, collision=True, prims=ps)
        cm = mask.reshape(B // 2, 2, B // 2, 2, B // 2, 2).any(axis=(1, 3, 5))
        rc = mc_block(Fc[::2, ::2, ::2], cm, g0 // 2, B // 2, 2 * sec.cell, sec.origin)
        if rc is not None:
            coll.append(rc)
        # transitions up each node column (the flood's floors and roofs), from the collision field
        airc = Fc > 0
        ch = (airc[1:, :B, :B] != airc[:-1, :B, :B]) & mask
        kz, ky, kx = np.nonzero(ch)
        if len(kz):
            f0, f1 = Fc[kz, ky, kx], Fc[kz + 1, ky, kx]
            z = sec.origin[2] + (g0[2] + kz) * sec.cell + sec.cell * f0 / (f0 - f1)
            trans.append(np.stack([g0[0] + kx, g0[1] + ky, np.rint(z * Q), airc[kz + 1, ky, kx]], 1))
        # the collision field's values at the block's own nodes near the surface (the flood's walls between columns)
        Fo = Fc[:B, :B, :B]
        kz, ky, kx = np.nonzero(np.abs(Fo) < VBAND)
        if len(kz):
            nodes.append((np.stack([g0[0] + kx, g0[1] + ky, g0[2] + kz], 1).astype(np.int32),
                          Fo[kz, ky, kx].astype(np.float32)))
    Vq, Fs, cells = weld(shell)
    Fs, cells = cancel_pairs(Fs, cells)
    Cq, Cf, _ = weld(coll)
    T = np.concatenate(trans) if trans else np.zeros((0, 4))
    log(f"  field + marching cubes: {len(act)} active blocks of {len(blocks)}, {len(Fs)} triangles, "
        f"{time.time() - t0:.1f} s")
    NV = (np.concatenate([a for a, _ in nodes]) if nodes else np.zeros((0, 3), np.int32),
          np.concatenate([b for _, b in nodes]) if nodes else np.zeros(0, np.float32))
    return {"Vq": Vq, "F": Fs, "cells": cells, "Cq": Cq, "Cf": Cf, "T": T, "NV": NV,
            "blocks": (len(act), len(blocks))}


def build_grid(sec, T, NV=None):
    ix0, iy0 = int(sec.lo[0]), int(sec.lo[1])
    nx, ny = int(sec.hi[0] - sec.lo[0]), int(sec.hi[1] - sec.lo[1])
    g = Grid(sec, ix0, iy0, nx, ny)
    gx, gy = T[:, 0].astype(np.int64), T[:, 1].astype(np.int64)
    z = T[:, 2] / Q
    isfloor = T[:, 3] > 0
    col = g.col_of(gx, gy)
    order = np.lexsort((z, col))
    col, z, isfloor = col[order], z[order], isfloor[order]
    # pair each floor with the next roof in its column
    nxt_same = np.r_[col[1:] == col[:-1], False]
    pair = isfloor & nxt_same & np.r_[~isfloor[1:], False]
    fi = np.nonzero(pair)[0]
    open_top = int((isfloor & ~nxt_same).sum())
    first = np.r_[True, col[1:] != col[:-1]]
    open_bottom = int((first & ~isfloor).sum())
    g.set_intervals(col[fi], z[fi], z[fi + 1])
    g.open = {"top": open_top, "bottom": open_bottom}
    g.set_nodes(*(NV if NV is not None else (np.zeros((0, 3), np.int64), np.zeros(0, np.float32))))
    return g


def read_json(path, what):
    try:
        return load_json(path)
    except OSError as e:
        raise CaveError(f"cannot read the {what} {path}: {e.strerror or e}")
    except ValueError as e:
        raise CaveError(f"the {what} {path} is not valid JSON: {e}")
    except RecursionError:
        raise CaveError(f"the {what} {path} is nested too deeply to read")


def load_section(section_path, network_path=None):
    """Read, validate and assemble a section with its neighbours (those listed in the network and present beside
    it). Returns (Section, warnings); raises CaveError on any input error."""
    sec_d = read_json(section_path, "section")
    if not isinstance(sec_d, dict):
        raise CaveError(f"the section {section_path} is not a JSON object")
    if network_path:
        net, netdir = read_json(network_path, "network"), os.path.dirname(os.path.abspath(network_path))
    elif isinstance(sec_d.get("network"), str):
        p = os.path.join(os.path.dirname(os.path.abspath(section_path)), sec_d["network"])
        net, netdir = read_json(p, "network"), os.path.dirname(os.path.abspath(p))
    else:
        net, netdir = resolve_network(sec_d, section_path)
    if not isinstance(net, dict):
        raise CaveError("the network is not a JSON object")
    errs, warns = validate(sec_d, net, section_path)
    if errs:
        raise CaveError("invalid section:\n  " + "\n  ".join(errs))
    neighbours = []
    for key in net.get("sections", []):
        if key == sec_d["key"]:
            continue
        p = os.path.join(netdir, net.get("files", {}).get(key, f"{key}.json"))
        if os.path.exists(p):
            nd = read_json(p, f"neighbour {key}")
            e2, _ = validate(nd, net, p) if isinstance(nd, dict) else (["not a JSON object"], [])
            if e2:
                raise CaveError(f"invalid neighbour {key}:\n  " + "\n  ".join(e2))
            neighbours.append(nd)
    return Section(sec_d, net, netdir, neighbours), warns


MAX_FLOOD_COLUMNS = 4_000_000  # the flood keeps every plan column of the region's box: about 250 x 250 m


def check_size(sec):
    nx, ny = int(sec.hi[0] - sec.lo[0]), int(sec.hi[1] - sec.lo[1])
    if nx * ny > MAX_FLOOD_COLUMNS:
        raise CaveError(f"the region's plan box is {nx * sec.cell:.0f} x {ny * sec.cell:.0f} m: over the flood's "
                        f"{MAX_FLOOD_COLUMNS:,} columns; cut the section smaller")


def problems(report):
    """Why a report is not ok, one line each (empty when it is)."""
    out = []
    sh = report["shell"]
    if sh["boundary_edges_outside_openings"]:
        out.append(f"the shell is open outside the declared openings ({sh['boundary_edges_outside_openings']} boundary "
                   "edges; a seam window too small for its passage?)")
    for c in report["clearance"]:
        if not c.get("ok", True):
            out.append(f"clearance: {c['id']} misses its profile's clear core or limits")
    col = report["collision"]["total"]
    if col > COLLISION_CEILING:
        out.append(f"collision: {col} triangles, over the ceiling of {COLLISION_CEILING}")
    f = report.get("flood")
    if f:
        out += [f"flood: {s['kind']} {s['id']} not found" for s in f["seeds"] if not s["found"]]
        out += [f"flood: {s['kind']} {s['id']} not reached from the primary spawn"
                for s, r in zip(f["seeds"], f["seeds_from_primary_spawn"]) if s["found"] and not r]
        out += [f"flood: {t['kind']} {t['id']} not reached from the primary spawn" for t in f["targets"]
                if not t["from_primary_spawn"]]
        if f["traps"]:
            at = f["trap_samples"][0] if f["trap_samples"] else (f["wedge_samples"] or [None])[0]
            where = f", first at {tuple(at['at'])} ({at['mode']})" if at else ""
            out.append(f"flood: {f['traps']} trapped states" + (" (a body wedges)" if f["wedged"] else "") + where)
        if f["undesigned"]:
            out.append(f"flood: {f['undesigned']} states reached by walking where a mode was meant")
        if f["unguarded_drops"]:
            out.append(f"flood: {len(f['unguarded_drops'])} unguarded drops over {STEP} m")
        for z in f["zones"]:
            if not z["traversable"]:
                out.append(f"flood: zone {z['id']} ({z['kind']}) cannot be traversed end to end")
            elif z["bypassable"]:
                if not z.get("bypassed_end_to_end") and z["id"] in z.get("segments_walked_round", []):
                    a, b = z.get("walked_in", [0.0, 0.0])
                    how = (f"walked round without its mode (walking gets {a} m into {z['passage']} from its first "
                           f"end and {b} m from its last)")
                else:
                    how = "bypassed without its mode"
                out.append(f"flood: zone {z['id']} ({z['kind']}) can be {how}")
    return out


def build(section_path, out_dir=None, network_path=None, flood=True, zone_checks=True, write=True, log=print,
          sec_obj=None, zones_override=None, decor=True):
    """Validate, mesh, build everything; write the npz, plan and report when out_dir is given. Returns a dict with
    the report and the arrays."""
    t_all = time.time()
    if sec_obj is None:
        sec, warns = load_section(section_path, network_path)
    else:
        sec, warns = sec_obj, []
    log(f"cave core: section {sec.key}, {len(sec.prims)} primitives ({len(sec.own)} own)")
    sep_errs, sep_rows = separation(sec, log)
    if sep_errs:
        raise CaveError("passages too close:\n  " + "\n  ".join(sep_errs))
    check_size(sec)
    zones = make_zones(sec) if zones_override is None else zones_override
    bad = arrival_errors(sec, zones)
    if bad:
        raise CaveError("arrival modes: " + "; ".join(bad))
    m = mesh_section(sec, log)
    Vq, Fs, cells = m["Vq"], m["F"], m["cells"]
    # closed except at declared openings
    be, nonman = boundary_edges(Fs)
    V = Vq / Q
    mid = 0.5 * (V[be[:, 0]] + V[be[:, 1]]) if len(be) else np.zeros((0, 3))
    allowed = np.zeros(len(mid), bool)
    for ob in sec.openings:
        allowed |= np.all((mid >= np.array(ob[:3]) - 1e-6) & (mid <= np.array(ob[3:]) + 1e-6), axis=1)
    stray = int((~allowed).sum())
    # formations, proxies, zones, solids
    rows = Rows(sec)
    vis, prox, solids, frep = formations(sec, rows)
    for gid, a, b, base, h, th in guard_segments(sec):
        ux, uy = unit2((b[0] - a[0], b[1] - a[1]))
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        prox.box((0.5 * (a[0] + b[0]), 0.5 * (a[1] + b[1]), base + 0.5 * h), 0.5 * L + 0.5 * th, 0.5 * th, 0.5 * h,
                 ux, uy, 10)
        solids.append(("seg", a, b, th, base - 0.05, base + h))
    for br in sec.d.get("bridges", []):
        x0, y0, x1, y1 = br["box"]
        th = br.get("thickness", 0.2)
        prox.box((0.5 * (x0 + x1), 0.5 * (y0 + y1), br["top_z"] - 0.5 * th), 0.5 * (x1 - x0), 0.5 * (y1 - y0),
                 0.5 * th, 1.0, 0.0, 11)
        solids.append(("aabb", x0, y0, x1, y1, br["top_z"] - th, br["top_z"]))
    for sm, ax, at, plus in sec.seam_boxes:
        # the seam wall: its face toward this file's walker on the plane, its 0.1 m beyond it (the contract's
        # section 6: the row stands 0.45 m in front of the face)
        u0, z0, u1, z1 = sm["window"]
        mid = at + (0.05 if plus else -0.05)
        if ax == 0:
            prox.box((mid, 0.5 * (u0 + u1), 0.5 * (z0 + z1)), 0.05, 0.5 * (u1 - u0), 0.5 * (z1 - z0), 1.0, 0.0, 12)
            solids.append(("aabb", mid - 0.05, u0, mid + 0.05, u1, z0 - 1.0, z1 + 1.0))
        else:
            prox.box((0.5 * (u0 + u1), mid, 0.5 * (z0 + z1)), 0.5 * (u1 - u0), 0.05, 0.5 * (z1 - z0), 1.0, 0.0, 12)
            solids.append(("aabb", u0, mid - 0.05, u1, mid + 0.05, z0 - 1.0, z1 + 1.0))
    # the flood's columns, the formations, fallen rock and breakdown placed on them (meshy_cave_rock.decor), their
    # solids
    grid = build_grid(sec, m["T"], m["NV"])
    drep = None
    if decor and sec.d.get("decor", True):
        t0 = time.time()
        pieces, dprox, dsol, drep = rock.decor(sec, grid, zones, guard_segments(sec), sys.modules[__name__])
        for V_, F_, tag, gi in pieces:
            vis.add(V_, F_, tag, gi)
        for V_, F_, tag in dprox:
            prox.add(V_, F_, tag)
        solids += dsol
        drep["seconds"] = round(time.time() - t0, 2)
        log(f"  decor: {drep['pieces']} pieces ({drep['triangles']} triangles), {drep['collide']} with collision "
            f"({drep['proxy_triangles']} triangles), {drep['seconds']} s")
    apply_solids(grid, sec, solids)
    fl_rep, fl_parts = (None, None)
    if flood:
        fl_rep, fl_parts = run_flood(sec, grid, zones, report_zones=zone_checks)
        log(f"  flood: {fl_rep['states']} states reached, traps {fl_rep['traps']}, undesigned {fl_rep['undesigned']}, "
            f"unguarded drops {len(fl_rep['unguarded_drops'])}, {fl_rep['seconds']} s")
    # collision: within 3 m above reached floors and 1 m beyond, decimated on planes, plus proxies
    Cq, Cf = m["Cq"], m["Cf"]
    coll_raw = int(len(Cf))
    C = Cq / Q
    if fl_parts is not None and len(Cf):
        fl = fl_parts["flood"]
        rs = np.nonzero(fl_parts["reach"][:fl.N])[0]
        if len(rs):
            rx, ry, rz, _ = fl.pos(rs)
            res = 0.5
            ox, oy = sec.origin[0], sec.origin[1]
            ix = np.floor((rx - ox) / res).astype(np.int64)
            iy = np.floor((ry - oy) / res).astype(np.int64)
            i0, j0 = ix.min() - 3, iy.min() - 3
            W, Hh = ix.max() - i0 + 4, iy.max() - j0 + 4
            zmax = np.full((Hh, W), -np.inf)
            zmin = np.full((Hh, W), np.inf)
            np.maximum.at(zmax, (iy - j0, ix - i0), rz)
            np.minimum.at(zmin, (iy - j0, ix - i0), rz)
            for _ in range(2):  # dilate by 1 m
                zmax = np.max(np.stack([np.roll(np.roll(zmax, a, 0), b, 1) for a in (-1, 0, 1) for b in (-1, 0, 1)]), 0)
                zmin = np.min(np.stack([np.roll(np.roll(zmin, a, 0), b, 1) for a in (-1, 0, 1) for b in (-1, 0, 1)]), 0)
            cen = C[Cf].mean(1)
            ci = np.floor((cen[:, 0] - ox) / res).astype(np.int64) - i0
            cj = np.floor((cen[:, 1] - oy) / res).astype(np.int64) - j0
            inb = (ci >= 0) & (ci < W) & (cj >= 0) & (cj < Hh)
            keep = np.zeros(len(Cf), bool)
            keep[inb] = (cen[inb, 2] <= zmax[cj[inb], ci[inb]] + 3.0) & (cen[inb, 2] >= zmin[cj[inb], ci[inb]] - 1.0)
            Cf = Cf[keep]
    coll_kept = int(len(Cf))
    t0 = time.time()
    Cv, Cf = decimate_planar(C, Cf)
    Cvq = np.rint(Cv * Q).astype(np.int64)
    log(f"  collision: {coll_raw} raw, {coll_kept} near the routes, {len(Cf)} decimated ({time.time() - t0:.1f} s)")
    sample = Cv[:: max(1, len(Cv) // 20000)]
    devs = np.abs(sec.field_points(sample, collision=True)) if len(sample) else np.zeros(1)
    # attributes and UVs
    bulges = [p for p in sec.prims if isinstance(p, Bulge)]
    attrs = vertex_attrs(sec, Vq, bulges)
    repeats = np.array([float(sec.geo_of(n)[1]["repeat_m"]) for n in sec.geo_names])
    face_geo = attrs["geo"][Fs[:, 0]] if len(Fs) else np.zeros(0, np.int8)
    sax = smooth_axis(V, Fs, [(ax, at) for _sm, ax, at, _p in sec.seam_boxes]) if len(Fs) else None
    uv, uv_axis = face_uv(V, Fs, repeats[face_geo], sax) if len(Fs) else (np.zeros((0, 3, 2), np.float32),
                                                                          np.zeros(0, np.int8))
    ck, coff, cfaces = chunks(cells) if len(Fs) else (np.zeros((0, 3), np.int32), np.zeros(1, np.int64),
                                                      np.zeros(0, np.int32))
    per_chunk = np.diff(coff)
    # core clipping: where the clear core, not the rock, set the surface
    core_only = attrs["core_clip"]
    Fq, Ff, Ft = vis.arrays()
    Pq, Pf, Pt = prox.arrays()
    fuv, fax = face_uv(Fq / Q, Ff, np.full(len(Ff), repeats[0])) if len(Ff) else (np.zeros((0, 3, 2), np.float32),
                                                                                 np.zeros(0, np.int8))
    zones_out = [z.out() for z in zones]
    clear = clearance(sec)
    # seam overlap: faces in the overlap cells (the cell beyond each seam plane on its + side)
    seams = []
    for sm, ax, at, plus in sec.seam_boxes:
        gi = int(round((at - sec.origin[ax]) / sec.cell))
        sel = cells[:, ax] == gi
        seams.append({"id": sm["id"], "neighbour": sm.get("neighbour"), "overlap_faces": int(sel.sum()),
                      "arrival_mode": sm["arrival"].get("mode", "walk")})
    h = hashlib.md5()
    for arr in (Vq, Fs, Cvq, Cf, Pq, Pf, Fq, Ff):
        h.update(np.ascontiguousarray(arr, dtype=np.int64).tobytes())
    md5 = h.hexdigest()
    hs = hashlib.md5()
    for arr in (Vq, Fs):
        hs.update(np.ascontiguousarray(arr, dtype=np.int64).tobytes())
    tris = int(len(Fs))
    report = {
        "core_version": CORE_VERSION,
        "section": sec.key,
        "geometry_md5": md5,
        "shell_md5": hs.hexdigest(),
        "shell": {"vertices": int(len(Vq)), "triangles": tris, "boundary_edges": int(len(be)),
                  "boundary_edges_outside_openings": stray, "nonmanifold_edges": nonman,
                  "blocks": {"active": m["blocks"][0], "total": m["blocks"][1]}, "core_clip_fraction": core_only,
                  "chunks": int(len(ck)), "max_chunk_triangles": int(per_chunk.max()) if len(per_chunk) else 0,
                  "closed": stray == 0},
        "collision": {"raw": coll_raw, "near_routes": coll_kept, "decimated": int(len(Cf)), "proxies": int(len(Pf)),
                      "total": int(len(Cf) + len(Pf)), "target": COLLISION_TARGET, "ceiling": COLLISION_CEILING,
                      "field_deviation_m": {"max": round(float(devs.max()), 4),
                                            "p99": round(float(np.percentile(devs, 99)), 4)}},
        "formations": {"triangles": int(len(Ff)), "items": frep, "decor": drep},
        "budget": {"triangles_loaded": tris + int(len(Ff)), "target": 1500000,
                   "draw_calls_est": int(len(ck)) * max(1, len(set(face_geo.tolist()))) + 2,
                   "collision_total": int(len(Cf) + len(Pf))},
        "zones": zones_out,
        "separation": {"min_rock_m": SEPARATION, "pairs": sep_rows},
        "clearance": clear,
        "seams": seams,
        "flood": fl_rep,
        "column_openings": grid.open,
        "warnings": warns,
        "seconds": round(time.time() - t_all, 2),
    }
    report["ok"] = bool(stray == 0 and all(c.get("ok", True) for c in clear) and (fl_rep is None or fl_rep["ok"])
                        and report["collision"]["total"] <= COLLISION_CEILING)
    report["problems"] = problems(report)
    result = {"report": report, "sec": sec, "Vq": Vq, "F": Fs, "cells": cells, "grid": grid, "zones": zones,
              "flood": fl_parts, "solids": solids}
    if write and out_dir:
        os.makedirs(out_dir, exist_ok=True)
        np.savez_compressed(
            os.path.join(out_dir, f"{sec.key}.core.npz"),
            shell_verts_q=Vq, shell_faces=Fs.astype(np.int32), shell_face_cell=cells.astype(np.int32),
            shell_uv=uv, shell_uv_axis=uv_axis, shell_face_geo=face_geo, shell_tint=attrs["tint"],
            shell_wet=attrs["wet"], shell_band=attrs["band"], shell_geo=attrs["geo"],
            chunk_keys=ck, chunk_offsets=coff, chunk_faces=cfaces,
            coll_verts_q=Cvq, coll_faces=Cf.astype(np.int32), proxy_verts_q=Pq, proxy_faces=Pf.astype(np.int32),
            proxy_kind=Pt.astype(np.int8), form_verts_q=Fq, form_faces=Ff.astype(np.int32),
            form_kind=Ft.astype(np.int8), form_geo=vis.geos().astype(np.int8), form_piece=vis.pieces(), form_uv=fuv, form_uv_axis=fax,
            geology=np.array(json.dumps(sec.geo_names)), zones_json=np.array(json.dumps(zones_out)),
            report_json=np.array(json.dumps(report)))
        plan(os.path.join(out_dir, f"{sec.key}_plan.png"), sec, grid, zones, fl_parts)
        with open(os.path.join(out_dir, f"{sec.key}_report.json"), "w", encoding="utf-8") as fh:
            json.dump(report, fh, indent=2)
            fh.write("\n")
    log(f"  done: {tris} shell triangles, collision {report['collision']['total']}, md5 {md5}, "
        f"{report['seconds']} s, ok {report['ok']}")
    for line in report["problems"]:
        log(f"  problem: {line}")
    return result


def arrival_errors(sec, zones):
    """A seam arrival or spawn records its mode, and the zones must agree: crawl and sidle arrivals stand in a zone
    of their kind, a climb arrival hangs on a face (in front of it, within reach, between foot and top), and a walking
    one stands in no crawl or sidle zone (the viewer would switch it at once)."""
    errs = []
    rows = [(f"seam {sm['id']}", sm["arrival"]["at"], sm["arrival"].get("mode", "walk")) for sm in sec.d.get("seams", [])]
    rows += [(f"spawn {sp['id']}", sp["at"], sp.get("mode", "walk")) for sp in sec.d.get("spawns", [])]
    for name, at, mode in rows:
        x, y, z = (np.array([v], dtype=np.float64) for v in at)
        inside = {k: any(bool(zn.contains(x, y, z)[0]) for zn in zones if zn.kind == k) for k in ("crawl", "sidle")}
        if mode in ("crawl", "sidle") and not inside[mode]:
            errs.append(f"{name}: arrives in mode {mode} outside every {mode} zone")
        if mode == "walk" and (inside["crawl"] or inside["sidle"]):
            errs.append(f"{name}: arrives walking inside a crawl or sidle zone")
        if mode == "climb":
            on = False
            for zn in zones:
                if zn.kind == "climb":
                    lx, ly, lz = zn.local(x, y, z)
                    on |= bool(abs(lx[0]) <= zn.half[0] + EDGE and -EDGE <= lz[0] <= CLIMB_REACH
                               and abs(ly[0]) <= zn.half[1] + EDGE)
            if not on:
                errs.append(f"{name}: arrives climbing but hangs on no climb face")
    return errs


# ---------------------------------------------------------------- the plan picture


def plan(path, sec, grid, zones, parts):
    g = grid
    nx, ny, P = g.nx, g.ny, g.PAD
    img = np.zeros((ny, nx, 3), np.uint8)
    img[:] = (18, 20, 28)
    AF = g.AF.reshape(g.L, g.nyp, g.nxp)[:, P:P + ny, P:P + nx]
    has = ~np.isnan(AF[0])
    top = np.nanmax(np.where(np.isnan(AF), -np.inf, AF), axis=0)
    if has.any():
        lo, hi = top[has].min(), top[has].max()
        t = np.where(has, (top - lo) / max(hi - lo, 1e-6), 0.0)
        shade = (70 + 90 * t).astype(np.uint8)
        img[has] = np.stack([shade, shade, shade + 8], -1)[has]
    if parts is not None:
        fl = parts["flood"]
        rs = np.nonzero(parts["reach"][:fl.N])[0]
        colours = {0: (70, 165, 95), 1: (225, 145, 50), 2: (60, 190, 215)}
        if len(rs):
            m, k, c = fl.unsid(rs)
            jx = c % g.nxp - P
            jy = c // g.nxp - P
            for mi in (0, 2, 1):
                s = m == mi
                img[jy[s], jx[s]] = colours[mi]
        for arr, col in ((parts["undesigned"], (240, 220, 40)), (parts["traps"], (235, 40, 40))):
            if len(arr):
                m, k, c = fl.unsid(np.asarray(arr))
                img[c // g.nxp - P, c % g.nxp - P] = col
    s = 2
    img = img.repeat(s, 0).repeat(s, 1)
    ox = sec.origin[0] + g.ix0 * sec.cell
    oy = sec.origin[1] + g.iy0 * sec.cell
    sc = s / sec.cell

    def px(x, y):
        return (x - ox) * sc, (y - oy) * sc

    def line(a, b, col, w=1):
        (x0, y0), (x1, y1) = px(*a), px(*b)
        n = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 2
        xs = np.rint(np.linspace(x0, x1, n)).astype(int)
        ys = np.rint(np.linspace(y0, y1, n)).astype(int)
        for dx in range(-(w // 2), w // 2 + 1):
            for dy in range(-(w // 2), w // 2 + 1):
                ok = (xs + dx >= 0) & (xs + dx < img.shape[1]) & (ys + dy >= 0) & (ys + dy < img.shape[0])
                img[ys[ok] + dy, xs[ok] + dx] = col

    def dot(x, y, col, r=4):
        cx, cy = px(x, y)
        cx, cy = int(round(cx)), int(round(cy))
        img[max(cy - r, 0):max(cy + r + 1, 0), max(cx - r, 0):max(cx + r + 1, 0)] = col

    for p in sec.own:
        if isinstance(p, Passage):
            for a, b in zip(p.P[:-1], p.P[1:]):
                line(a[:2], b[:2], (90, 140, 255))
    for gid, a, b, *_ in guard_segments(sec):
        line(a, b, (230, 80, 200), 3)
    for z in zones:
        hx, hz = z.half[0], z.half[2]
        cs = [z.world(sx * hx, 0, sz * hz)[:2] for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        for i in range(4):
            line(cs[i], cs[(i + 1) % 4], (255, 255, 255))
    for sm, ax, at, plus in sec.seam_boxes:
        u0, _, u1, _ = sm["window"]
        a, b = ((at, u0), (at, u1)) if ax == 0 else ((u0, at), (u1, at))
        line(a, b, (250, 230, 60), 3)
    for sp in sec.d.get("spawns", []):
        dot(sp["at"][0], sp["at"][1], (255, 255, 255))
    for pt in sec.d.get("portals", []):
        dot(pt["at"][0], pt["at"][1], (170, 90, 255))
    for sm in sec.d.get("seams", []):
        dot(sm["portal"][0], sm["portal"][1], (170, 90, 255))
        dot(sm["arrival"]["at"][0], sm["arrival"]["at"][1], (255, 255, 255), 3)
    write_png(path, img[::-1].copy())


# ---------------------------------------------------------------- command line


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    v = sub.add_parser("validate", help="check a section (and its network) against the schema and the rules")
    v.add_argument("section")
    v.add_argument("--network")
    b = sub.add_parser("build", help="mesh a section and run its checks")
    b.add_argument("section")
    b.add_argument("--out", required=True)
    b.add_argument("--network")
    b.add_argument("--no-flood", action="store_true")
    b.add_argument("--no-zone-checks", action="store_true")
    a = ap.parse_args(argv)
    try:
        if a.cmd == "validate":
            sec, warns = load_section(a.section, a.network)
            for w in warns:
                print("warning:", w)
            errs, _ = separation(sec, log=lambda *_: None)
            check_size(sec)
            for e in errs:
                print("error:", e)
            print("ok" if not errs else f"{len(errs)} error(s)")
            return 0 if not errs else 1
        r = build(a.section, a.out, a.network, flood=not a.no_flood, zone_checks=not a.no_zone_checks)
    except CaveError as e:
        print("error:", e, file=sys.stderr)
        return 1
    return 0 if r["report"]["ok"] else 2


if __name__ == "__main__":
    sys.exit(main())
