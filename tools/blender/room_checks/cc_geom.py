"""Room checks 2, 3 and the bake data of check 4 (the contract and the collision), in Blender. Read-only.

Usage: bash tools/blender/bl.sh -b --factory-startup -P tools/blender/room_checks/cc_geom.py --
           <roomId> [--glb F] [--scene F] [--out DIR] [--config F] [--quick]                       (roomcfg.py)

The GLB is decoded here, not imported: its own GLB/JSON parser and the glTF add-on's Draco bridge
(io_scene_gltf2/bf_intern_draco_bridge.dll, the Google Draco decoder Blender's importer calls; the name is the Windows
build's). bpy.ops.import_scene.gltf stores COLOR_0 as an 8-bit BYTE_COLOR (io_scene_gltf2/blender/imp/mesh.py), which
clamps it to 0..1 and quantizes the dark end, so it is not used for the bake data.
Frames: Blender room metres (x east, y north, z up) = glTF (x, -z, y); the area's origin is the floor centre.
The viewer's walker (apps/walk/src/physics on origin/claude/v2-walk): feet on the ground; a capsule of radius 0.30 whose
axis runs from 0.65 to 1.45 m above the feet (stepHeight + radius .. bodyHeight - radius); five ground rays (centre and
+-0.21 m) from 0.35 m above the feet, 0.70 m down (stepHeight + snapDown); push-out from HM_Collision_room_<id> only.
The room file gives the ceiling's height, the door's size and wall, and the window's wall and the part of it searched
for the cut. Still the bedroom's own in this script: the first spawn and the first portal only, the door in the south
wall and the window in the north wall (`roomcfg.need_walls` stops any other room file), shell boxes wider than 9 m as
the floor and ceiling, the origins of the wall rays (inside a 10 x 7 m room), the curtains and the swag as one piece.
--quick is a coarse run (10 cm cells, 12 fan points, 24 eyes); walls_closed_collision_fans wants 20 fan points, so a
quick run always fails it.
Writes <out>/cc_geom.json, cc_reach.png, cc_grid.npz, cc_vertices.npz. cc_cracks.py and r7_extra.py run this file's
sections above `collision boxes` and above `shell measures` (`roomcfg.cc_geom_head`): keep those two header lines.
"""
import json
import math
import os
import struct
import sys
import time
import zlib
from collections import deque
from ctypes import c_bool, c_char_p, c_size_t, c_uint32, c_void_p, cdll, create_string_buffer

import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import roomcfg  # noqa: E402

ARGS = roomcfg.parse()
GLB, SCENE, OUTD = ARGS.glb, ARGS.scene, ARGS.out
QUICK = ARGS.quick
ROOM = roomcfg.load(ARGS.config)
os.makedirs(OUTD, exist_ok=True)
T0 = time.time()
R = {"file": roomcfg.shown(GLB), "quick": QUICK, "checks": {}}
FAILS = []


def log(*a):
    print(f"[cc {time.time() - T0:7.1f}s]", *a, flush=True)


def check(name, ok, **info):
    R["checks"][name] = dict(ok=bool(ok), **info)
    if not ok:
        FAILS.append(name)
    log(("PASS " if ok else "FAIL ") + name, json.dumps(info, default=str)[:500])


def r4(v):
    return [round(float(x), 4) for x in v]


scene = json.load(open(SCENE, encoding="utf-8"))
SID = scene["id"]
PFX = scene["prefix"]
WT, HT = scene["size"]["w"], scene["size"]["h"]
FX0, FX1 = -(WT - 2) / 2.0, (WT - 2) / 2.0     # interior floor, 1 m per tile, origin at the floor centre
FY0, FY1 = -(HT - 2) / 2.0, (HT - 2) / 2.0
CEIL = float(ROOM["ceiling_m"])
RADIUS, STEP, BODY, SNAP, EYE = 0.30, 0.35, 1.75, 0.35, 1.6
AX0, AX1 = STEP + RADIUS, BODY - RADIUS          # 0.65 .. 1.45 above the feet


def tile_centre(tx, ty):
    return FX0 + (tx - 1) + 0.5, FY1 - (ty - 1) - 0.5


# ---------------------------------------------------------------------------------------------------- GLB + Draco
raw = open(GLB, "rb").read()
_magic, _ver, _len = struct.unpack_from("<4sII", raw, 0)
CH = {}
off = 12
while off + 8 <= len(raw):
    cl, ct = struct.unpack_from("<I4s", raw, off)
    CH[ct] = (off + 8, cl)
    off += 8 + cl
J = json.loads(raw[CH[b"JSON"][0]:CH[b"JSON"][0] + CH[b"JSON"][1]])
BIN = raw[CH[b"BIN\x00"][0]:CH[b"BIN\x00"][0] + CH[b"BIN\x00"][1]]


def bview(i):
    bv = J["bufferViews"][i]
    s = bv.get("byteOffset", 0)
    return BIN[s:s + bv["byteLength"]]


import io_scene_gltf2  # noqa: E402  (the add-on ships the Draco bridge)

DLL = cdll.LoadLibrary(os.path.join(os.path.dirname(io_scene_gltf2.__file__), "bf_intern_draco_bridge.dll"))
for fn, (rt, at) in {
        "decoderCreate": (c_void_p, []), "decoderRelease": (None, [c_void_p]),
        "decoderDecode": (c_bool, [c_void_p, c_void_p, c_size_t]),
        "decoderReadAttribute": (c_bool, [c_void_p, c_uint32, c_size_t, c_char_p]),
        "decoderGetVertexCount": (c_uint32, [c_void_p]), "decoderGetIndexCount": (c_uint32, [c_void_p]),
        "decoderAttributeIsNormalized": (c_bool, [c_void_p, c_uint32]),
        "decoderGetAttributeByteLength": (c_size_t, [c_void_p, c_uint32]),
        "decoderCopyAttribute": (None, [c_void_p, c_uint32, c_void_p]),
        "decoderReadIndices": (c_bool, [c_void_p, c_size_t]), "decoderGetIndicesByteLength": (c_size_t, [c_void_p]),
        "decoderCopyIndices": (None, [c_void_p, c_void_p])}.items():
    f = getattr(DLL, fn)
    f.restype, f.argtypes = rt, at
NPT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def decode(prim):
    ext = prim["extensions"]["KHR_draco_mesh_compression"]
    buf = bview(ext["bufferView"])
    dec = DLL.decoderCreate()
    if not DLL.decoderDecode(dec, buf, len(buf)):
        raise RuntimeError("Draco decode failed")
    ia = J["accessors"][prim["indices"]]
    if not DLL.decoderReadIndices(dec, ia["componentType"]):
        raise RuntimeError("Draco indices failed")
    nb = DLL.decoderGetIndicesByteLength(dec)
    ob = create_string_buffer(nb)
    DLL.decoderCopyIndices(dec, ob)
    out = dict(_idx=np.frombuffer(ob.raw, NPT[ia["componentType"]]).astype(np.int64),
               _nv=int(DLL.decoderGetVertexCount(dec)), _ni=int(DLL.decoderGetIndexCount(dec)), _norm={}, _ct={})
    for name, did in ext["attributes"].items():
        acc = J["accessors"][prim["attributes"][name]]
        if not DLL.decoderReadAttribute(dec, did, acc["componentType"], acc["type"].encode()):
            raise RuntimeError("Draco attribute failed: " + name)
        nb = DLL.decoderGetAttributeByteLength(dec, did)
        ob = create_string_buffer(nb)
        DLL.decoderCopyAttribute(dec, did, ob)
        a = np.frombuffer(ob.raw, NPT[acc["componentType"]]).reshape(-1, NCOMP[acc["type"]]).astype(np.float64)
        if acc.get("normalized") and acc["componentType"] != 5126:
            a = a / float(np.iinfo(NPT[acc["componentType"]]).max)
        out[name] = a
        out["_norm"][name] = bool(DLL.decoderAttributeIsNormalized(dec, did))
        out["_ct"][name] = (acc["componentType"], acc["type"], bool(acc.get("normalized", False)), acc["count"])
    DLL.decoderRelease(dec)
    return out


nodes = J["nodes"]
PARENT = {c: i for i, n in enumerate(nodes) for c in n.get("children", [])}


def qmat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def local_m(n):
    if "matrix" in n:
        return np.array(n["matrix"], float).reshape(4, 4).T
    M = np.eye(4)
    M[:3, :3] = qmat(n.get("rotation", [0, 0, 0, 1])) @ np.diag(n.get("scale", [1, 1, 1]))
    M[:3, 3] = n.get("translation", [0, 0, 0])
    return M


_WM = {}


def world_m(i):
    if i not in _WM:
        M = local_m(nodes[i])
        _WM[i] = world_m(PARENT[i]) @ M if i in PARENT else M
    return _WM[i]


G2B = np.array([[1.0, 0, 0], [0, 0, -1.0], [0, 1.0, 0]])     # Blender = G2B @ glTF
MATN = [m.get("name", "") for m in J["materials"]]
PR = []
dec_dev = 0.0
for i, n in enumerate(nodes):
    if "mesh" not in n:
        continue
    M = world_m(i)
    for k, p in enumerate(J["meshes"][n["mesh"]]["primitives"]):
        d = decode(p)
        pa = J["accessors"][p["attributes"]["POSITION"]]
        dec_dev = max(dec_dev, float(np.abs(d["POSITION"].min(0) - pa["min"]).max()),
                      float(np.abs(d["POSITION"].max(0) - pa["max"]).max()))
        P = (d["POSITION"] @ M[:3, :3].T + M[:3, 3]) @ G2B.T
        mat = MATN[p["material"]] if "material" in p else None
        ex = n.get("extras", {})
        PR.append(dict(node=i, name=n.get("name", ""), prim=k, P=P, T=d["_idx"].reshape(-1, 3), C=d.get("COLOR_0"),
                       UV=d.get("TEXCOORD_0"), mat=mat, mat_i=p.get("material"), what=ex.get("wdi_what"),
                       wid=str(ex.get("wdi_id", "")), nv=d["_nv"], acc_nv=pa["count"], ct=d["_ct"], norm=d["_norm"],
                       attrs=sorted(k2 for k2 in d if not k2.startswith("_"))))
R["decode"] = dict(primitives=len(PR), vertices=int(sum(len(x["P"]) for x in PR)),
                   triangles=int(sum(len(x["T"]) for x in PR)),
                   position_vs_accessor_minmax_max_dev=round(dec_dev, 7),
                   vertex_counts_match=all(x["nv"] == x["acc_nv"] for x in PR),
                   seconds=round(time.time() - T0, 1))
log("decoded", R["decode"])

COLN = f"HM_Collision_room_{SID}"
COL = [x for x in PR if x["name"] == COLN]
GLASS = [x for x in PR if x["what"] == "glass"]
OUTSIDE = [x for x in PR if x["what"] in ("outside", "sky") or x["wid"] in ("lit_window", "moon_disc")]
VIS = [x for x in PR if x not in COL and x not in GLASS]            # what the eye sees (the glass is 10 % alpha)
INTERIOR = [x for x in VIS if x not in OUTSIDE]


def bvh_of(prims):
    vs, ts, own = [], [], []
    base = 0
    for x in prims:
        vs.append(x["P"])
        ts.append(x["T"] + base)
        own += [x["name"]] * len(x["T"])
        base += len(x["P"])
    V = np.concatenate(vs)
    T = np.concatenate(ts)
    return BVHTree.FromPolygons([Vector(v) for v in V], T.tolist(), all_triangles=True), own, V, T


BV_C, OWN_C, VC, TC = bvh_of(COL)
BV_V, OWN_V, _, _ = bvh_of(VIS)
BV_I, OWN_I, _, _ = bvh_of(INTERIOR)
log("bvh", len(TC), len(OWN_V), len(OWN_I))


def ray(bvh, o, d, dist=1e4):
    h = bvh.ray_cast(Vector(o), Vector(d).normalized(), dist)
    return h if h[0] is not None else None


# ---------------------------------------------------------------------------------------------------- collision boxes
# boxes = connected components over the mesh's own vertex indices (boxes that touch share positions, not vertices)
weld = np.arange(len(VC))
par = list(range(len(VC)))


def find(a):
    while par[a] != a:
        par[a] = par[par[a]]
        a = par[a]
    return a


for a, b, c in weld[TC]:
    for u, v in ((a, b), (b, c)):
        ru, rv = find(u), find(v)
        if ru != rv:
            par[ru] = rv
comp = {}
for t_i, (a, b, c) in enumerate(weld[TC]):
    comp.setdefault(find(a), []).append(t_i)
BOX = []
for root, tris in sorted(comp.items(), key=lambda kv: min(kv[1])):
    vid = np.unique(TC[tris].ravel())
    Pv = VC[vid]
    mn, mx = Pv.min(0), Pv.max(0)
    corner = np.all((np.abs(Pv - mn) < 1e-4) | (np.abs(Pv - mx) < 1e-4), axis=1)
    ncorner = len(np.unique(np.round(Pv / 1e-4).astype(np.int64), axis=0))
    BOX.append(dict(min=mn, max=mx, tris=len(tris), aabb=bool(corner.all() and ncorner == 8 and len(tris) == 12)))


def kind_of(b):
    mn, mx = b["min"], b["max"]
    if mx[2] <= 0.001 and mx[0] - mn[0] > 9:
        return "floor"
    if mn[2] >= CEIL - 0.001 and mx[0] - mn[0] > 9:
        return "ceiling"
    if mn[0] < FX0 - 0.01 or mx[0] > FX1 + 0.01 or mn[1] < FY0 - 0.01 or mx[1] > FY1 + 0.01:
        return "wall"
    return "furniture"


for b in BOX:
    b["kind"] = kind_of(b)
BMIN = np.array([b["min"] for b in BOX])
BMAX = np.array([b["max"] for b in BOX])
R["collision"] = dict(triangles=int(len(TC)), boxes=[dict(id=k, kind=b["kind"], min=r4(b["min"]), max=r4(b["max"]),
                                                         tris=b["tris"], aabb=b["aabb"]) for k, b in enumerate(BOX)])
check("collision_is_closed_axis_aligned_boxes", all(b["aabb"] for b in BOX), boxes=len(BOX), triangles=int(len(TC)),
      kinds={k: sum(1 for b in BOX if b["kind"] == k) for k in ("floor", "ceiling", "wall", "furniture")})
# box faces: 12 triangles each; are the normals outward? (the viewer uses DoubleSide rays and unsigned distances)


def seg_box_dist(x, y, z0, z1):
    """Exact distance from the vertical segment (x, y, z0..z1) to every box (solid), vectorized over boxes."""
    dx = np.maximum(np.maximum(BMIN[:, 0] - x, x - BMAX[:, 0]), 0)
    dy = np.maximum(np.maximum(BMIN[:, 1] - y, y - BMAX[:, 1]), 0)
    dz = np.maximum(np.maximum(BMIN[:, 2] - z1, z0 - BMAX[:, 2]), 0)
    return np.sqrt(dx * dx + dy * dy + dz * dz)


# ---------------------------------------------------------------------------------------------------- shell measures
byname = {}
for x in PR:
    byname.setdefault(x["name"], []).append(x)


def pts(name):
    return np.concatenate([x["P"] for x in byname[name]])


roomcfg.need_walls(ROOM, "cc_geom.py")
DOOR, WINDOW = ROOM["door"], ROOM["window"]
fl = byname[f"{SID}_Floor"][0]
fP, fT = fl["P"], fl["T"]
farea = 0.5 * np.linalg.norm(np.cross(fP[fT[:, 1]] - fP[fT[:, 0]], fP[fT[:, 2]] - fP[fT[:, 0]]), axis=1).sum()
check(f"floor_{WT - 2}x{HT - 2}_at_1m_per_tile",
      abs(fP[:, 0].min() - FX0) < 0.005 and abs(fP[:, 0].max() - FX1) < 0.005 and abs(fP[:, 1].min() - FY0) < 0.005
      and abs(fP[:, 1].max() - FY1) < 0.005 and abs(farea - (FX1 - FX0) * (FY1 - FY0)) < 0.05 and np.ptp(fP[:, 2]) < 1e-3,
      visible_floor_x=r4([fP[:, 0].min(), fP[:, 0].max()]), visible_floor_y=r4([fP[:, 1].min(), fP[:, 1].max()]),
      z=r4([fP[:, 2].min(), fP[:, 2].max()]), area_m2=round(float(farea), 3),
      grid_floor_tiles=f"{WT - 2} x {HT - 2}", expected_m=f"{FX1 - FX0:.0f} x {FY1 - FY0:.0f}")
cP = pts(f"{SID}_Ceiling")
ceil_boxes = [b for b in BOX if b["kind"] == "ceiling"]
floor_boxes = [b for b in BOX if b["kind"] == "floor"]
check("ceiling_at_" + f"{CEIL:.1f}".replace(".", "_"),
      abs(cP[:, 2].min() - CEIL) < 0.002 and abs(cP[:, 2].max() - CEIL) < 0.002
      and len(ceil_boxes) == 1 and abs(ceil_boxes[0]["min"][2] - CEIL) < 0.002,
      visible_ceiling_z=r4([cP[:, 2].min(), cP[:, 2].max()]),
      collision_ceiling_bottom=r4([b["min"][2] for b in ceil_boxes]),
      collision_floor_top=r4([b["max"][2] for b in floor_boxes]))
walls = {s: byname[f"{SID}_Wall_{s}"] for s in "NESW"}
BV_W, _, _, _ = bvh_of(sum(walls.values(), []))
spans, cspans = {}, {}
for lab, d in (("E", (1, 0, 0)), ("W", (-1, 0, 0)), ("N", (0, 1, 0)), ("S", (0, -1, 0))):
    vals, cvals = [], []
    for z in (0.5, 1.0, 1.6, 2.4):
        for s in (-0.7, 0.0, 0.7):
            o = (0, s * 3, z) if lab in "EW" else (s * 4.2, 0, z)
            h = ray(BV_W, o, d)
            hc = ray(BV_C, o, d)
            if h:
                vals.append(abs(h[0].x) if lab in "EW" else abs(h[0].y))
            if hc and OWN_C[hc[2]]:
                cvals.append(abs(hc[0].x) if lab in "EW" else abs(hc[0].y))
    spans[lab] = r4([min(vals), max(vals)]) if vals else None
    cspans[lab] = r4([min(cvals), max(cvals)]) if cvals else None
R["wall_faces"] = dict(visible=spans, collision_first_hit=cspans)
check("inner_walls_on_tile_boundaries",
      all(spans[s] and abs(spans[s][0] - e) < 0.003 and abs(spans[s][1] - e) < 0.003
          for s, e in (("E", FX1), ("W", -FX0), ("N", FY1), ("S", -FY0))),
      visible_wall_faces_from_origin=spans, expected={"E": FX1, "W": -FX0, "N": FY1, "S": -FY0})


def opening(prims, plane, axis_y, inward, u0, u1, z0, z1, step):
    """The hole in a wall: a grid over the wall plane, rays perpendicular to it from inside; cells with no face hit."""
    b, _, _, _ = bvh_of(prims)
    us = np.arange(u0, u1 + 1e-9, step)
    zs = np.arange(z0, z1 + 1e-9, step)
    hole = np.zeros((len(zs), len(us)), bool)
    for a_, z in enumerate(zs):
        for b_, u in enumerate(us):
            o = (u, plane + inward * 0.4, z)
            hole[a_, b_] = b.ray_cast(Vector(o), Vector((0, -inward, 0)), 0.8)[0] is None
    if not hole.any():
        return None
    ii, jj = np.nonzero(hole)
    return dict(u=[round(float(us[jj.min()] - step / 2), 4), round(float(us[jj.max()] + step / 2), 4)],
                z=[round(float(max(zs[ii.min()] - step / 2, 0.0)), 4), round(float(zs[ii.max()] + step / 2), 4)],
                width=round(float(us[jj.max()] - us[jj.min()] + step), 4),
                height=round(float(zs[ii.max()] + step / 2 - max(zs[ii.min()] - step / 2, 0.0)), 4),
                cells=int(hole.sum()), full=int(hole.size), step=step)


door = scene["portals"][0]
DCX, _ = tile_centre(door["x"], door["y"])
st_o = 0.01 if QUICK else 0.0025
dop = opening(walls[DOOR["wall"]], FY0, True, +1, DCX - 0.8, DCX + 0.8, 0.0025, 2.6, st_o)
R["door_rough_opening_in_Wall_" + DOOR["wall"]] = dop
door_parts = [x for x in PR if x["wid"].startswith(door["id"])]
BV_D, OWN_D, VD, _ = bvh_of(door_parts)
# the leaf, seen from the room: rays toward -y over the doorway; hits behind the wall's face are the leaf (and stops)
us = np.arange(DCX - 0.6, DCX + 0.6 + 1e-9, 0.005)
zs = np.arange(0.005, 2.4, 0.005)
leaf_y = []
leaf_cells = []
for z in zs:
    for u in us:
        h = BV_D.ray_cast(Vector((u, FY0 + 0.3, z)), Vector((0, -1, 0)), 0.8)
        if h[0] is not None and h[0].y < FY0 - 0.012:
            leaf_cells.append((u, z))
            leaf_y.append(h[0].y)
leaf = None
if leaf_cells:
    L = np.array(leaf_cells)
    LY = np.array(leaf_y)
    deep = LY < np.median(LY) + 0.004                       # the leaf's face (the stops sit a little deeper or shallower)
    leaf = dict(face_y=round(float(np.median(LY)), 4), u=r4([L[deep, 0].min(), L[deep, 0].max()]),
                z=r4([L[deep, 1].min(), L[deep, 1].max()]),
                width=round(float(L[deep, 0].max() - L[deep, 0].min() + 0.005), 3),
                height=round(float(L[deep, 1].max() - L[deep, 1].min() + 0.005), 3))
# the clear passage: the lining's inner faces at the leaf's face (just in front of it) and the head above it
clear_w = []
for z in np.arange(0.1, 2.0, 0.05):
    a = ray(BV_D, (DCX, FY0 - 0.02, z), (1, 0, 0), 1.0)
    b = ray(BV_D, (DCX, FY0 - 0.02, z), (-1, 0, 0), 1.0)
    if a and b:
        clear_w.append(a[0].x - b[0].x)
head = ray(BV_D, (DCX, FY0 - 0.02, 1.0), (0, 0, 1), 3.0)
# the joinery's own opening: the lining's outer faces (the Door mesh inside the wall's thickness)
inwall = VD[(VD[:, 1] <= FY0 - 0.005) & (VD[:, 1] >= FY0 - 0.30 - 1e-3) & (np.abs(VD[:, 0] - DCX) < 0.6)]
joinery = dict(x=r4([inwall[:, 0].min(), inwall[:, 0].max()]), z_top=round(float(inwall[:, 2].max()), 4),
               width=round(float(inwall[:, 0].max() - inwall[:, 0].min()), 4)) if len(inwall) else None


def first_hits(o_y, d_y, xs_, zs_):
    """What the eye meets first, looking straight at a wall opening from the room (visible meshes, no glass)."""
    rows = []
    for z in zs_:
        names_ = set()
        ys_ = []
        for x in xs_:
            h = BV_V.ray_cast(Vector((x, o_y, z)), Vector((0, d_y, 0)), 2.0)
            names_.add(OWN_V[h[2]] if h[0] is not None else None)
            ys_.append(round(h[0].y, 4) if h[0] is not None else None)
        rows.append(dict(z=round(float(z), 4), first=sorted(str(n) for n in names_), y=sorted({v for v in ys_ if v is not None})))
    return rows


door_strip = first_hits(FY0 + 1.0, -1.0, np.arange(DCX - 0.43, DCX + 0.431, 0.02), np.arange(2.0, 2.2001, 0.005))
R["door"] = dict(leaf=leaf, clear_width_inside_lining=r4([min(clear_w), max(clear_w)]) if clear_w else None,
                 clear_head_z=round(float(head[0].z), 4) if head else None, rough_opening_in_wall=dop,
                 joinery_opening=joinery, door_mesh_bbox=[r4(VD.min(0)), r4(VD.max(0))], head_first_hits=door_strip)
check(f"door_about_{roomcfg.tag(DOOR['width_m'])}_x_{roomcfg.tag(DOOR['height_m'])}",
      joinery is not None and abs(joinery["width"] - DOOR["width_m"]) <= 0.03
      and abs(joinery["z_top"] - DOOR["height_m"]) <= 0.03,
      joinery_opening=joinery, wall_cut=dop and dict(x=dop["u"], z=dop["z"], width=dop["width"], height=dop["height"]),
      leaf=leaf, clear_width_inside_lining=R["door"]["clear_width_inside_lining"], clear_head_z=R["door"]["clear_head_z"])
wall_strip_d = [r["z"] for r in door_strip if any(f.endswith("_Wall_" + DOOR["wall"]) for f in r["first"])]
check("door_wall_cut_matches_joinery", dop is not None and joinery is not None and abs(dop["z"][1] - joinery["z_top"]) <= 0.01
      and not wall_strip_d,
      wall_cut_top=dop and dop["z"][1], joinery_top=joinery and joinery["z_top"],
      wall_plaster_seen_in_the_doorway_z=[min(wall_strip_d), max(wall_strip_d)] if wall_strip_d else None)
WSX, WSZ = WINDOW["search"]["x"], WINDOW["search"]["z"]
wop = opening(walls[WINDOW["wall"]], FY1, True, -1, WSX[0], WSX[1], WSZ[0], WSZ[1], 0.01 if QUICK else 0.005)
R["window_rough_opening_in_Wall_" + WINDOW["wall"]] = wop
if wop:
    wx = np.arange(wop["u"][0] + 0.03, wop["u"][1] - 0.029, 0.02)
    win_strip = first_hits(FY1 - 1.0, 1.0, wx, np.concatenate([np.arange(0.6, 0.9001, 0.005), np.arange(2.2, 2.4001, 0.005)]))
    R["window_first_hits"] = win_strip
    wall_strip_w = [r["z"] for r in win_strip if any(f.endswith("_Wall_" + WINDOW["wall"]) for f in r["first"])]
    check("window_wall_cut_matches_joinery", not wall_strip_w, wall_cut=dict(x=wop["u"], z=wop["z"]),
          wall_plaster_seen_in_the_window_z=[min(wall_strip_w), max(wall_strip_w)] if wall_strip_w else None)

# ---------------------------------------------------------------------------------------------------- capsule grid
CELL = 0.10 if QUICK else 0.05
xs = np.round(np.arange(FX0 - 1.0, FX1 + 1.0 + 1e-9, CELL), 4)
ys = np.round(np.arange(FY0 - 1.0, FY1 + 1.0 + 1e-9, CELL), 4)
NX, NY = len(xs), len(ys)
low = [k for k, b in enumerate(BOX) if b["max"][2] <= STEP + 1e-6]
R["steppable_boxes"] = [dict(id=k, kind=BOX[k]["kind"], top=round(float(BOX[k]["max"][2]), 4)) for k in low]


def ground_at(x, y, feet=0.0):
    """The viewer's settle(): five rays from feet + 0.35 down 0.70 (on the ground); the highest hit, or None."""
    g = None
    top = feet + STEP
    for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
        px, py = x + dx * 0.21, y + dy * 0.21
        inside = (BMIN[:, 0] <= px) & (px <= BMAX[:, 0]) & (BMIN[:, 1] <= py) & (py <= BMAX[:, 1])
        for k in np.nonzero(inside)[0]:
            for zf in (BMAX[k, 2], BMIN[k, 2]):            # a downward ray from inside a box hits its bottom face
                if top - (STEP + SNAP) <= zf <= top and (g is None or zf > g):
                    g = float(zf)
                    break
    return g


GROUND = np.full((NY, NX), np.nan)
DC = np.full((NY, NX), np.inf)
DCB = np.full((NY, NX), -1, np.int64)
for j, y in enumerate(ys):
    for i, x in enumerate(xs):
        g = ground_at(x, y)
        if g is None:
            continue
        GROUND[j, i] = g
        d = seg_box_dist(x, y, g + AX0, g + AX1)
        k = int(np.argmin(d))
        DC[j, i], DCB[j, i] = d[k], k
FREE = (DC >= RADIUS - 1e-6) & ~np.isnan(GROUND)
SP = scene["spawns"][0]
spn = [x for x in nodes if x.get("name") == f"Spawn_{SID}_{SP['id']}"]
sp_i = [i for i, x in enumerate(nodes) if x.get("name") == f"Spawn_{SID}_{SP['id']}"][0]
spw = G2B @ world_m(sp_i)[:3, 3]
SX, SY = float(spw[0]), float(spw[1])
si, sj = int(round((SX - xs[0]) / CELL)), int(round((SY - ys[0]) / CELL))
REACH = np.zeros((NY, NX), bool)
if FREE[sj, si]:
    REACH[sj, si] = True
    q = deque([(sj, si)])
    while q:
        j, i = q.popleft()
        for dj, di in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            jj, ii = j + dj, i + di
            if not (0 <= jj < NY and 0 <= ii < NX) or REACH[jj, ii] or not FREE[jj, ii]:
                continue
            if dj and di and not (FREE[j, ii] and FREE[jj, i]):
                continue
            if GROUND[jj, ii] - GROUND[j, i] > STEP + 1e-6:
                continue
            REACH[jj, ii] = True
            q.append((jj, ii))
check("spawn_free_on_the_floor", bool(FREE[sj, si]) and abs(GROUND[sj, si] - spw[2]) < 1e-3, spawn=r4([SX, SY, spw[2]]),
      capsule_clearance_m=round(float(DC[sj, si]), 4), ground_z=float(GROUND[sj, si]))
rj, ri = np.nonzero(REACH)
RX, RY = xs[ri], ys[rj]
R["reach"] = dict(cell=CELL, cells=int(REACH.sum()), area_m2=round(float(REACH.sum()) * CELL * CELL, 3),
                  floor_share=round(float(REACH.sum()) * CELL * CELL / ((FX1 - FX0) * (FY1 - FY0)), 3),
                  x=r4([RX.min(), RX.max()]), y=r4([RY.min(), RY.max()]),
                  ground=r4([np.nanmin(GROUND[REACH]), np.nanmax(GROUND[REACH])]))
inside = (RX >= FX0 + RADIUS - 1e-6) & (RX <= FX1 - RADIUS + 1e-6) & (RY >= FY0 + RADIUS - 1e-6) & (RY <= FY1 - RADIUS + 1e-6)
outer_free = FREE & ~((xs[None, :] > FX0) & (xs[None, :] < FX1) & (ys[:, None] > FY0) & (ys[:, None] < FY1))
check("nothing_outside_the_room_reachable", bool(inside.all()), reachable_outside_cells=int((~inside).sum()),
      reach_x=R["reach"]["x"], reach_y=R["reach"]["y"],
      free_cells_outside_the_walls=int(outer_free.sum()),
      note="the grid runs 1 m past the walls; a cell is free when the capsule clears every box and the rays find ground")
pi_ = [i for i, x in enumerate(nodes) if x.get("name") == f"Portal_{door['id']}"][0]
pw = G2B @ world_m(pi_)[:3, 3]
PX, PY = float(pw[0]), float(pw[1])
pdist = np.hypot(RX - PX, RY - PY)
kmin = int(np.argmin(pdist))
check("portal_fires_walking_in", pdist.min() <= 1.0 and (pdist > 1.0).any() and abs(pw[2]) <= 2.0,
      portal=r4(pw), nearest_reachable_feet=r4([RX[kmin], RY[kmin]]), nearest_m=round(float(pdist.min()), 4),
      spawn_to_portal_m=round(math.hypot(SX - PX, SY - PY), 3), can_leave_1m_to_arm=bool((pdist > 1.0).any()),
      reachable_within_1m_cells=int((pdist <= 1.0).sum()), use_within_2m=bool((pdist <= 2.0).any()))

grid = scene["grid"]
WALK = [(x, y) for y in range(HT) for x in range(WT) if grid[y][x] in ".S"]
tiles = {}
for (tx, ty) in WALK:
    cx, cy = tile_centre(tx, ty)
    m = (RX > cx - 0.5 + 1e-6) & (RX < cx + 0.5 - 1e-6) & (RY > cy - 0.5 + 1e-6) & (RY < cy + 0.5 - 1e-6)
    ci, cj = int(round((cx - xs[0]) / CELL)), int(round((cy - ys[0]) / CELL))
    tiles[(tx, ty)] = dict(centre=bool(REACH[cj, ci]), share=round(float(m.sum()) / ((1.0 / CELL - 1) ** 2), 3))
stand = [t for t in WALK if tiles[t]["share"] > 0]
centre_ok = [t for t in WALK if tiles[t]["centre"]]
R["tiles"] = {f"{x},{y}": v for (x, y), v in tiles.items()}
R["walk_tiles"] = dict(total=len(WALK), stand_anywhere=len(stand), centre_reached=len(centre_ok),
                       never=[list(t) for t in WALK if tiles[t]["share"] == 0],
                       centre_not_reached=[dict(tile=list(t), share=tiles[t]["share"]) for t in WALK if not tiles[t]["centre"]])
check("walkable_tiles_standable", len(stand) == len(WALK), **R["walk_tiles"])
log("reach", R["reach"])

# ---------------------------------------------------------------------------------------------------- visible vs collision
AXZ = np.linspace(AX0, AX1, 9 if QUICK else 41)


def vis_dist(x, y, cap=0.7):
    best, who = cap, -1
    for z in AXZ:
        h = BV_I.find_nearest(Vector((x, y, z)), cap)
        if h[0] is not None and h[3] < best:
            best, who = h[3], h[2]
    return best, who


DV = np.full((NY, NX), np.inf)
DVW = np.full((NY, NX), -1, np.int64)
near = REACH.copy()
for dj in range(-2, 3):                                   # reachable cells and a 2-cell ring around them
    for di in range(-2, 3):
        near |= np.roll(np.roll(REACH, dj, 0), di, 1)
for j, i in zip(*np.nonzero(near)):
    DV[j, i], DVW[j, i] = vis_dist(xs[i], ys[j])
log("visible distances done")
pen = np.where(REACH, RADIUS - DV, -np.inf)
bad = pen > 0.05


def by_object(mask, val):
    out = {}
    for j, i in zip(*np.nonzero(mask)):
        nm = OWN_I[DVW[j, i]] if DVW[j, i] >= 0 else None
        e = out.setdefault(nm, dict(cells=0, max=0.0, at=None))
        e["cells"] += 1
        if val[j, i] > e["max"]:
            e["max"], e["at"] = round(float(val[j, i]), 4), [float(xs[i]), float(ys[j])]
    return dict(sorted(out.items(), key=lambda kv: -kv[1]["max"]))


R["walk_into_visible"] = dict(over_0=by_object(REACH & (pen > 0), pen), over_5cm=by_object(bad, pen))
check("no_walk_into_visible_over_5cm", not bad.any(), cells_over_5cm=int(bad.sum()),
      max_penetration_m=round(float(pen[REACH].max()), 4), by_object=R["walk_into_visible"]["over_5cm"])
# invisible walls: reachable cells next to a cell blocked by collision; the capsule touches collision (DC ~ 0.30)
# while the nearest visible surface is DV away; DV - DC > 0.05 is a wall of air
bnd = np.zeros_like(REACH)
for j, i in zip(rj, ri):
    for dj, di in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        if not FREE[j + dj, i + di]:
            bnd[j, i] = True
            break
gap = np.where(bnd, DV - DC, -np.inf)
inv_by = {}
for j, i in zip(*np.nonzero(bnd & (gap > 0.05))):
    k = int(DCB[j, i])
    e = inv_by.setdefault(k, dict(kind=BOX[k]["kind"], box=r4(list(BOX[k]["min"]) + list(BOX[k]["max"])), cells=0,
                                  max_gap=0.0, at=None, x=[9e9, -9e9], y=[9e9, -9e9]))
    e["cells"] += 1
    e["x"] = [min(e["x"][0], float(xs[i])), max(e["x"][1], float(xs[i]))]
    e["y"] = [min(e["y"][0], float(ys[j])), max(e["y"][1], float(ys[j]))]
    if gap[j, i] > e["max_gap"]:
        e["max_gap"], e["at"] = round(float(gap[j, i]), 4), [float(xs[i]), float(ys[j])]
R["invisible_walls"] = {str(k): v for k, v in sorted(inv_by.items(), key=lambda kv: -kv[1]["max_gap"])}
gb = gap[bnd]
check("no_invisible_walls_over_5cm", not inv_by, boundary_cells=int(bnd.sum()), over_5cm=int((gb > 0.05).sum()),
      gap_p50=round(float(np.median(gb)), 4), gap_p95=round(float(np.percentile(gb, 95)), 4),
      gap_max=round(float(gb.max()), 4), by_box=R["invisible_walls"])

# per-piece footprints: the visible cross-section in a height band vs the piece's collision boxes (2D)


def band_pts(prims, z0, z1):
    out = []
    for x in prims:
        P, T = x["P"], x["T"]
        m = (P[:, 2] >= z0) & (P[:, 2] <= z1)
        out.append(P[m][:, :2])
        e = np.concatenate([T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]])
        a, b = P[e[:, 0]], P[e[:, 1]]
        for zc in (z0, z1):
            s = (a[:, 2] - zc) * (b[:, 2] - zc) < 0
            if s.any():
                f = ((zc - a[s, 2]) / (b[s, 2] - a[s, 2]))[:, None]
                out.append((a[s] + f * (b[s] - a[s]))[:, :2])
    return np.concatenate(out) if out else np.zeros((0, 2))


def out_of_boxes(P2, ks):
    d = np.full(len(P2), np.inf)
    for k in ks:
        dx = np.maximum(np.maximum(BMIN[k, 0] - P2[:, 0], P2[:, 0] - BMAX[k, 0]), 0)
        dy = np.maximum(np.maximum(BMIN[k, 1] - P2[:, 1], P2[:, 1] - BMAX[k, 1]), 0)
        d = np.minimum(d, np.hypot(dx, dy))
    return d


groups = {}
for x in INTERIOR:
    if x["wid"].startswith(PFX + ".") or x["wid"] in ("curtains", "swag"):
        gid = x["wid"].split(":")[0]
        if gid == "swag":
            gid = "curtains"
        groups.setdefault(gid, []).append(x)
FURN = [k for k, b in enumerate(BOX) if b["kind"] == "furniture"]
owner = {}
for k in FURN:                                             # each furniture box goes to the piece it overlaps most
    best, bid = 0.0, None
    for gid, prims in groups.items():
        P2 = band_pts(prims, 0.0, CEIL)
        if not len(P2):
            continue
        lo, hi = P2.min(0), P2.max(0)
        ov = max(0.0, min(hi[0], BMAX[k, 0]) - max(lo[0], BMIN[k, 0])) * max(0.0, min(hi[1], BMAX[k, 1]) - max(lo[1], BMIN[k, 1]))
        if ov > best:
            best, bid = ov, gid
    owner[k] = bid
PIECES = {}
for gid, prims in sorted(groups.items()):
    ks = [k for k in FURN if owner[k] == gid]
    e = dict(objects=sorted({x["name"] for x in prims}), boxes=ks,
             box_xy=[r4(BMIN[k][:2]) + r4(BMAX[k][:2]) for k in ks], box_z=[r4([BMIN[k][2], BMAX[k][2]]) for k in ks])
    for band, (z0, z1) in (("capsule_0.35_1.75", (STEP, BODY)), ("feet_0_0.35", (0.0, STEP)), ("full_0_3", (0.0, CEIL))):
        P2 = band_pts(prims, z0, z1)
        if not len(P2):
            e[band] = None
            continue
        vb = [r4(P2.min(0)), r4(P2.max(0))]
        if ks:
            d = out_of_boxes(P2, ks)
            far = P2[d > 0.05]
            e[band] = dict(visible_xy=vb, max_outside_m=round(float(d.max()), 4), points=int(len(P2)),
                           points_over_5cm=int((d > 0.05).sum()),
                           where_over_5cm=[r4(far.min(0)), r4(far.max(0))] if len(far) else None)
        else:
            e[band] = dict(visible_xy=vb, max_outside_m=None)
    PIECES[gid] = e
R["pieces"] = PIECES
cov = {g: v["capsule_0.35_1.75"]["max_outside_m"] for g, v in PIECES.items()
       if v.get("capsule_0.35_1.75") and v["capsule_0.35_1.75"].get("max_outside_m") is not None}
check("collision_covers_each_piece_within_5cm", all(v <= 0.05 for v in cov.values()),
      band="0.35-1.75 m (what the capsule can touch)", max_outside_by_piece=cov,
      without_boxes=[g for g, v in PIECES.items() if not v["boxes"]])
log("pieces done")

# ---------------------------------------------------------------------------------------------------- ray fans
NF = 512 if QUICK else 2048
fi = np.arange(NF) + 0.5
phi = np.arccos(1 - 2 * fi / NF)
th = math.pi * (1 + 5 ** 0.5) * fi
DIRS = np.stack([np.cos(th) * np.sin(phi), np.sin(th) * np.sin(phi), np.cos(phi)], 1)
cand = np.stack([RX, RY], 1)
pick = [int(np.argmin(np.hypot(RX - SX, RY - SY)))]
dmin = np.hypot(cand[:, 0] - cand[pick[0], 0], cand[:, 1] - cand[pick[0], 1])
NPTS = 12 if QUICK else 40
while len(pick) < NPTS:
    k = int(np.argmax(dmin))
    pick.append(k)
    dmin = np.minimum(dmin, np.hypot(cand[:, 0] - cand[k, 0], cand[:, 1] - cand[k, 1]))
FAN = [(float(cand[k, 0]), float(cand[k, 1])) for k in pick]
TOL = 1e-3
st = dict(rays=0, col_miss=0, col_beyond_inner_faces=0, col_max_beyond_m=0.0, vis_void=0, vis_out_window=0,
          vis_out_elsewhere=0)
col_bad, vis_bad = [], []
win = wop
for (x, y) in FAN:
    for z in (0.3, 1.0, 1.6, 2.4):
        o = Vector((x, y, z))
        for dv in DIRS:
            d = Vector(dv)
            st["rays"] += 1
            h = BV_C.ray_cast(o, d, 1e4)
            if h[0] is None:
                st["col_miss"] += 1
                col_bad.append([x, y, z] + r4(dv))
            else:
                p = h[0]
                beyond = max(FX0 - p.x, p.x - FX1, FY0 - p.y, p.y - FY1, -p.z, p.z - CEIL, 0.0)
                st["col_max_beyond_m"] = max(st["col_max_beyond_m"], beyond)
                if beyond > TOL:
                    st["col_beyond_inner_faces"] += 1
                    col_bad.append([x, y, z] + r4(dv) + [round(p.x, 3), round(p.y, 3), round(p.z, 3)])
            g = BV_V.ray_cast(o, d, 1e4)
            if g[0] is None:
                st["vis_void"] += 1
                vis_bad.append(dict(o=[x, y, z], d=r4(dv)))
            else:
                p = g[0]
                if FX0 - 0.31 <= p.x <= FX1 + 0.31 and FY0 - 0.31 <= p.y <= FY1 + 0.31 and -0.31 <= p.z <= CEIL + 0.31:
                    continue
                ok = False
                if d.y > 1e-6 and win:
                    t = (FY1 - y) / d.y
                    cx, cz = x + t * d.x, z + t * d.z
                    ok = win["u"][0] - 0.01 <= cx <= win["u"][1] + 0.01 and win["z"][0] - 0.01 <= cz <= win["z"][1] + 0.01
                if ok:
                    st["vis_out_window"] += 1
                else:
                    st["vis_out_elsewhere"] += 1
                    vis_bad.append(dict(o=[x, y, z], d=r4(dv), hit=OWN_V[g[2]], at=r4(p)))
st["col_max_beyond_m"] = round(st["col_max_beyond_m"], 6)
R["fans"] = dict(points=len(FAN), heights=[0.3, 1.0, 1.6, 2.4], directions=NF, origins=[r4(p) for p in FAN], **st)
check("walls_closed_collision_fans", st["col_miss"] == 0 and st["col_beyond_inner_faces"] == 0 and len(FAN) >= 20,
      points=len(FAN), heights=[0.3, 1.0, 1.6, 2.4], rays=st["rays"], miss=st["col_miss"],
      beyond_inner_faces=st["col_beyond_inner_faces"], max_beyond_m=st["col_max_beyond_m"], examples=col_bad[:5])
check("visible_shell_closed_fans", st["vis_void"] == 0 and st["vis_out_elsewhere"] == 0, rays=st["rays"],
      void=st["vis_void"], out_through_window=st["vis_out_window"], out_elsewhere=st["vis_out_elsewhere"],
      examples=vis_bad[:6])
log("fans done")

# ---------------------------------------------------------------------------------------------------- bake data
CPR = [x for x in PR if x["C"] is not None]
nan_total = 0
stats = {}
for x in CPR:
    C = x["C"]
    Lm = 0.2126 * C[:, 0] + 0.7152 * C[:, 1] + 0.0722 * C[:, 2]
    fin = np.isfinite(C).all(1)
    nan_total += int((~fin).sum())
    stats[f"{x['name']}#{x['prim']}"] = dict(
        mat=x["mat"], verts=int(len(C)), nonfinite=int((~fin).sum()), negative=int((C < 0).any(1).sum()),
        black=int((C.max(1) <= 1e-6).sum()), min=r4(C.min(0)), max=r4(C.max(0)),
        lum_p0=round(float(Lm.min()), 6), lum_p1=round(float(np.percentile(Lm, 1)), 6),
        lum_p50=round(float(np.median(Lm)), 5), lum_max=round(float(Lm.max()), 5),
        over_1=int((C > 1).any(1).sum()), ct=x["ct"].get("COLOR_0"), draco_normalized=x["norm"].get("COLOR_0"))
allC = np.concatenate([x["C"] for x in CPR])
R["color0"] = dict(primitives=len(CPR), vertices=int(len(allC)), nonfinite=nan_total,
                   negative=int((allC < 0).sum()), black_vertices=int((allC.max(1) <= 1e-6).sum()),
                   min=r4(allC.min(0)), max=r4(allC.max(0)), over_1_vertices=int((allC > 1).any(1).sum()),
                   accessor_types=sorted({str(x["ct"].get("COLOR_0")) for x in CPR}), per_primitive=stats)
log("color0", {k: v for k, v in R["color0"].items() if k != "per_primitive"})
# quantization: the colour lattice step inside one primitive (Draco stores ints over the attribute's range)
qs = {}
for x in CPR:
    C = x["C"]
    if len(C) < 200:
        continue
    steps = []
    for c in range(3):
        dd = np.diff(np.unique(C[:, c]))
        dd = dd[dd > 1e-12]
        if len(dd):
            steps.append(float(dd.min()))
    rng = float((C.max(0) - C.min(0)).max())
    if steps and rng > 0:
        qs[f"{x['name']}#{x['prim']}"] = dict(step=float(min(steps)), range=round(rng, 5),
                                              bits=round(math.log2(rng / min(steps) + 1), 2))
R["color0"]["lattice"] = qs
R["color0"]["lattice_bits_min"] = min(v["bits"] for v in qs.values()) if qs else None

# eyes over the reachable floor (farthest-point sampling), at the viewer's eye height
NE = 24 if QUICK else 96
epick = [int(np.argmin(np.hypot(RX - SX, RY - SY)))]
dmin = np.hypot(cand[:, 0] - cand[epick[0], 0], cand[:, 1] - cand[epick[0], 1])
while len(epick) < NE:
    k = int(np.argmax(dmin))
    epick.append(k)
    dmin = np.minimum(dmin, np.hypot(cand[:, 0] - cand[k, 0], cand[:, 1] - cand[k, 1]))
EYES = np.array([[cand[k, 0], cand[k, 1], EYE] for k in epick])
R["eyes"] = dict(count=NE, z=EYE, max_gap_m=round(float(dmin.max()), 3))
vis_rows = []
t_v = time.time()
for pi_x, x in enumerate(CPR):
    P = x["P"]
    flag = np.zeros(len(P), bool)
    eye_of = np.full(len(P), -1, np.int64)
    for v in range(len(P)):
        p = P[v]
        d = EYES - p
        dist = np.sqrt((d * d).sum(1))
        for e in np.argsort(dist)[:NE]:
            de = Vector(-d[e] / dist[e])                 # from the eye to the vertex
            h = BV_V.ray_cast(Vector(EYES[e]), de, float(dist[e]) - 0.003)
            if h[0] is None:
                flag[v] = True
                eye_of[v] = e
                break
    vis_rows.append((pi_x, flag, eye_of))
    stats[f"{x['name']}#{x['prim']}"]["visible"] = int(flag.sum())
    if x is CPR[0] or (pi_x % 10 == 0):
        log("visibility", x["name"], int(flag.sum()), "/", len(P), round(time.time() - t_v, 1))
VISF = np.concatenate([f for _, f, _ in vis_rows])
R["color0"]["visible_vertices"] = int(VISF.sum())
vb = (allC.max(1) <= 1e-6) & VISF
R["color0"]["visible_black_vertices"] = int(vb.sum())
check("color0_finite_nonnegative_no_black_on_visible", nan_total == 0 and int((allC < 0).sum()) == 0 and not vb.any(),
      nonfinite=nan_total, negative=int((allC < 0).sum()), black_all=int((allC.max(1) <= 1e-6).sum()),
      black_visible=int(vb.sum()), range_min=r4(allC.min(0)), range_max=r4(allC.max(0)),
      visible_vertices=int(VISF.sum()), vertices=int(len(allC)))
np.savez_compressed(os.path.join(OUTD, "cc_vertices.npz"),
                    prim=np.concatenate([np.full(len(CPR[p]["P"]), p) for p, _, _ in vis_rows]),
                    vid=np.concatenate([np.arange(len(CPR[p]["P"])) for p, _, _ in vis_rows]),
                    P=np.concatenate([x["P"] for x in CPR]), C=allC,
                    UV=np.concatenate([x["UV"] if x["UV"] is not None else np.full((len(x["P"]), 2), np.nan) for x in CPR]),
                    visible=VISF, eye=np.concatenate([e for _, _, e in vis_rows]), eyes=EYES,
                    mat=np.array([x["mat_i"] if x["mat_i"] is not None else -1 for x in CPR]),
                    names=np.array([x["name"] for x in CPR]), what=np.array([str(x["what"]) for x in CPR]))

# ---------------------------------------------------------------------------------------------------- map
img = np.zeros((NY, NX, 3))
img[:] = (30, 30, 36)
img[~FREE] = (70, 70, 80)
img[DC < 0.02] = (120, 120, 130)
img[REACH] = (205, 215, 225)
img[REACH & (pen > 0.0)] = (240, 200, 60)
img[REACH & (pen > 0.05)] = (255, 110, 0)
img[bnd & (gap > 0.05)] = (220, 30, 200)
for tx in range(WT + 1):
    i = int(round((FX0 + tx - 1 - xs[0]) / CELL))
    if 0 <= i < NX:
        img[:, i] *= 0.6
for ty in range(HT + 1):
    j = int(round((FY1 - (ty - 1) - ys[0]) / CELL))
    if 0 <= j < NY:
        img[j, :] *= 0.6
img[sj - 1:sj + 2, si - 1:si + 2] = (40, 200, 60)
pi2, pj2 = int(round((PX - xs[0]) / CELL)), int(round((PY - ys[0]) / CELL))
img[pj2 - 1:pj2 + 2, pi2 - 1:pi2 + 2] = (40, 120, 255)
for e in EYES:
    img[int(round((e[1] - ys[0]) / CELL)), int(round((e[0] - xs[0]) / CELL))] = (0, 160, 160)
big = np.repeat(np.repeat(img, 4, 0), 4, 1).clip(0, 255).astype(np.uint8)
h_, w_, _ = big.shape
rows = b"".join(b"\x00" + big[y].tobytes() for y in range(h_ - 1, -1, -1))


def chunk(t, d):
    return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)


open(os.path.join(OUTD, "cc_reach.png"), "wb").write(
    b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w_, h_, 8, 2, 0, 0, 0))
    + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b""))
np.savez_compressed(os.path.join(OUTD, "cc_grid.npz"), xs=xs, ys=ys, DC=DC, DV=DV, GROUND=GROUND, REACH=REACH, FREE=FREE)
R["fails"] = FAILS
R["pass"] = not FAILS
R["seconds"] = round(time.time() - T0, 1)
json.dump(R, open(os.path.join(OUTD, "cc_geom.json"), "w"), indent=1,
          default=lambda o: o.tolist() if hasattr(o, "tolist") else str(o))
log("done", "PASS" if not FAILS else f"FAIL {FAILS}")
