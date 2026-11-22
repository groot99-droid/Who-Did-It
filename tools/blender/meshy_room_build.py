"""HollowMere's rooms in 3D for the first-person walk viewer (`apps/walk`, interiors plan 4 step 8, owner 2026-11-14:
"the rooms should have walls on all sides, the new view of the game is first person"): one closed room per scene at
1 m per tile, its light baked, ready to append into `build/hollowmere_walk.glb` and testable on its own.

Blender (one Blender at a time on the laptop; --factory-startup is required):

    blender -b --factory-startup -P tools/blender/meshy_room_build.py -- --scene widow_bedroom
        [--out tools/blender/build/rooms] [--samples 1024] [--no-bake] [--glb] [--preview] [--preview-res 1920]
        [--bake-groups] [--save-raw F.npz] [--raw F.npz] [--mix fill=1.3] [--tint fill=#F2EDE4]
        [--layout mapped] [--light last|midway|first] [--sweep "fill=0.5,moon=1.2;fill=0.7"]

`--layout` picks the room's arrangement from its file (`layouts` in meshy_rooms/<id>.json); the default is the file's
own (widow_bedroom: `bed_north`, the owner's first-person layout of 2026-11-16, the bed's head against the north wall
under his photographs; `mapped` is the room as the game's map has it, kept buildable). `--light` picks one of the
look file's light settings (`settings`: weights on the candle, the moon and the fill; the default is the look's
own): on a group bake it is a mix of the saved groups, on a single bake it scales the lamps. `--sweep` (with a
group bake or --raw) prints the light numbers of several mixes and writes nothing.

Plain Python with Pillow (no Blender), after a `--preview` run (the Blender run tries it itself last):

    python tools/blender/meshy_room_build.py --scene widow_bedroom [--out DIR] --step plan

The room comes from `packages/content/data/scenes/<id>.json` through `meshy_interior_build.Room` (the grid, props,
spots, portals, spawns and lights) and the per-room choices in the room's own file, `meshy_rooms/<id>.json`, read by
`load_room` below (wall colours, door and window, the night outside, the first-person placement of every piece, the
light, the views). No room's data stands in this script: adding a room adds a file. Furniture is the round-3 kit:
`meshy_interior_build`'s prop table and Poly Haven piece builders (`ph_master`, `ph_kit`, `assemble`), which import
`meshy_wild_build` and `meshy_village_build` (neither is edited); here every piece stands at real size against its
wall, facing into the room. The Meshy blanket chest keeps its own textures.

Frame: Blender Z up, x east, y north; tile (tx, ty) centred at (tx + 0.5 - W / 2, H / 2 - ty - 0.5) metres (the grid's
centre on the origin). The room hangs under `Area_room_<id>`, an empty on the floor's centre; in glTF Blender's
(x, y, z) is (x, z, -y), so north is -Z.

The shell: a wooden floor, walls on all four sides at `height` with their inner faces on the tile boundary, a ceiling,
skirting, a picture rail and a cornice; the walls and ceiling in a Poly Haven plaster toned per room. Each portal is a
real opening with a frame and architrave and a closed panelled door (procedural: Poly Haven has no fitting door);
the window prop is a real opening with a box frame, two sashes with glazing bars, glass, a window board, the
round-3 curtains, rod and black swag. Behind the window, the night outside: snow ground, a fence, the village's own
Meshy cottages and pines and the sky dome in the village look's colours (`meshy_looks/final.json`).

The light is BAKED (the viewer draws rooms without shadows and without the moon or sky light): Cycles bakes the
diffuse light (direct + indirect, no colour) of the candle, the moon through the window, the faint night outside and
a faint fill into a point-domain FLOAT colour attribute `wdi_light` on every room mesh, after the shell is gridded
at 5 cm and long furniture edges are split to 15 cm. post_bake then grades that light per vertex: darker where an AO
bake finds the open sky hidden (the contact shadows the viewer cannot draw), never under the ink floor (the light
that shows the material's darkest texels at ink, in the night's ambient colour, a little higher where the vertex
sees open sky, so a dim piece keeps its shape), eased where candle-lit wood would turn salmon. The scans' own
textures are prepared for that floor: their dark tail lifted, their darkest texels' chroma noise smoothed, no texel
left magenta, a dark scan's contrast held, the woods graded toward an umber walnut (SCAN_GRADE); a Meshy texture
is kept, its dark tail eased the same way. Every material is then exported unlit (KHR_materials_unlit):
baseColor = albedo texture x baseColorFactor x COLOR_0. Blender's exporter writes an RGB colour attribute as a FLOAT
VEC3 accessor (linear, not clamped); COLOR_0 still holds the bake times `k` (the 99.9th percentile of the room's
light at 1), and 1 / k is folded into the area's `wdi_exposure`, so a normalized export would clip only the
flame-side hot spots. The flame, the glass and the outside are unlit at their own colours. The scene's night lights
(the candle, the moon) are also exported as KHR_lights_punctual in COMPAT units, their energies times k, for lit
objects added later. Draco colour quantization is 16 bits (the walk export's default 10 bands the dark corners).

Outputs (`--out`, default `tools/blender/build/rooms/`): `<id>.blend` (collection `Room_<id>`: `Area_room_<id>` with
every mesh, light, spawn and portal under it; `HM_Collision_room_<id>` beside it at the root; every datablock named
`<id>_...`; images packed), `<id>.glb` (`--glb`: the room alone at the origin under the walk contract), `<id>.json`
(the manifest), `<id>_<view>.png` stills at eye height (`--preview`: the baked unlit room rendered scene-linear and
shown through three r186's AgX at wdi_exposure, the viewer's own tone mapping) and `<id>_plan.png` (top down,
ceiling hidden, with the tile grid, spawn, portal and collision drawn over it).
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys
import time

try:
    import bpy
    import bmesh
    import numpy as np
    from mathutils import Matrix, Vector
    from mathutils.bvhtree import BVHTree
except ImportError:  # plain Python: the plan step (Pillow)
    bpy = None
    import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT_DIR = os.path.join(HERE, "build", "rooms")
FINAL_LOOK = os.path.join(HERE, "meshy_looks", "final.json")
FP_LOOK = os.path.join(HERE, "meshy_looks", "interior_fp.json")
sys.path.insert(0, HERE)
import meshy_interior_build as mib  # noqa: E402  (the scene parser, the prop table, the Poly Haven piece builders)
import meshy_room_file as rf  # noqa: E402  (the room files' loader and rules: plain Python)

ATTR = "wdi_light"          # the baked light: a POINT-domain FLOAT_COLOR attribute, exported as COLOR_0
INK = (0x12, 0x14, 0x1C)    # palette ink: the darkest value of any pixel (never black)
EYE = 1.6                   # the viewer's eye height (apps/walk/src/config.ts WALK.eyeHeight)
CAPSULE_R, STEP_H, BODY_H = 0.3, 0.35, 1.75   # WALK.radius, stepHeight, bodyHeight
VFOV = 70.0                 # RENDER.fov (vertical, degrees); the room files' views carry EYE and VFOV as numbers
GAP = 0.02                  # a piece stands this far off the wall behind it
REF_PCT_DEFAULT = 0.5       # the ink floor's reference texel: a material's 0.5th percentile (luminance)
MESHY_REF_PCT = 0.5         # ... a Meshy texture's too, once its dark tail is eased (the look's ink_lift.meshy_lift)
DRACO = dict(export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
             export_draco_position_quantization=18, export_draco_texcoord_quantization=16,
             export_draco_color_quantization=16)

# ---------------------------------------------------------------- the per-room choices
#
# One file a room: meshy_rooms/<sceneId>.json (JSON: a room's row is plain data, so the checks and the exporter can
# read it without Blender). Until 2026-11-16 the rows stood here as a table, ROOMS, and every new room changed this
# script's md5, which every saved bake and every manifest records. Now a room's file has its own md5 (the manifest's
# `source`) and this script's md5 changes only when shared code does. After such a change
# `bash tools/blender/room_checks/regress.sh <roomId>` rebuilds a finished room from its saved bake and compares its
# GLB with the golden value in meshy_rooms/golden.json. (room_checks/rooms/<sceneId>.json is another file, the
# checks' own numbers for the room: the two are kept apart until a later step merges them.)
#
# In a room file colours are sRGB hex (converted to linear); positions are room metres (x east, y north, z up, the
# grid's centre on the origin). A piece's `place` is one of: ["wall", side, along] its back GAP off that wall (N, E,
# S, W), centred at `along` on the wall's axis, or snapped GAP off the named end wall when `along` is a side letter;
# ["at", x, y] its footprint centred there; ["beside", piece id, side, along] its back GAP off that side of another
# piece. `face` is the way its front looks (S, E, N, W). `key` names the round-3 prop table entry
# (meshy_interior_build.PROP_MODELS / SPOT_MODELS); `spec` overrides it for first person (real sizes: the iso tile
# rule is gone; null removes a key). A view is [eye x, y, z], [target x, y, z], the vertical field of view in
# degrees (the viewer's EYE and VFOV as numbers). `layout` names the arrangement that `pieces` and `views` hold;
# `layouts` holds the others as overrides by piece id and by view name (apply_layout). A key named `note`, or
# `<key>_note` beside `<key>`, is a comment: it never reaches the builder.
ROOMS_DIR = rf.ROOMS_DIR    # tests rebind it: the wrappers below read it at call time
ROOM_KEYS = rf.ROOM_KEYS    # what the builder reads without a default (door, window, outside, moon: legacy path only)
is_note, apply_layout, from_root = rf.is_note, rf.apply_layout, rf.from_root
_room_object, _room_value = rf._room_object, rf._room_value
SPEC: dict = {}             # the room's derived reading (meshy_room_file.derive): never written into CFG


def room_path(scene_id: str) -> str:
    return rf.room_path(scene_id, ROOMS_DIR)


def load_room(scene_id: str, path: str | None = None) -> dict:
    """The per-room choices of `scene_id` from its file (meshy_room_file.load_room: notes dropped, arrays as tuples,
    `pieces` a list, the keys held to the rules), from `path` or from ROOMS_DIR as it stands now."""
    return rf.load_room(scene_id, rooms_dir=ROOMS_DIR, path=path)


def lin1(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_lin(h: str) -> tuple[float, float, float]:
    h = h.lstrip("#")
    return tuple(lin1(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4))


def file_md5(path: str) -> str:
    import hashlib
    with open(path, "rb") as fh:
        return hashlib.md5(fh.read()).hexdigest()


BAKE_LOOK_DROP, BAKE_ROOM_DROP = rf.BAKE_LOOK_DROP, rf.BAKE_ROOM_DROP
bake_look_md5, bake_room_md5 = rf.bake_look_md5, rf.bake_room_md5    # what a saved bake records of the data


def shown_argv(argv: list) -> list:
    """The builder's arguments as the manifest records them: every path from the repo root, a path outside the repo
    as its file name only (a scratch folder's absolute path would carry the local user's folders)."""
    out, take = [], False
    for x in argv:
        out.append(from_root(x) if take else x)
        take = x in PATH_ARGS
    return out


PATH_ARGS = ("--out", "--raw", "--save-raw", "--room-file", "--look", "--rig-print")


# ---------------------------------------------------------------- three.js r186's AgX (the viewer's tone mapping)

_SRGB_TO_2020 = np.array([[0.6274, 0.3293, 0.0433], [0.0691, 0.9195, 0.0113], [0.0164, 0.0880, 0.8956]])
_2020_TO_SRGB = np.array([[1.6605, -0.5876, -0.0728], [-0.1246, 1.1329, -0.0083], [-0.0182, -0.1006, 1.1187]])
_INSET = np.array([[0.856627153315983, 0.0951212405381588, 0.0482516061458583],
                   [0.137318972929847, 0.761241990602591, 0.101439036467562],
                   [0.11189821299995, 0.0767994186031903, 0.811302368396859]])
_OUTSET = np.array([[1.1271005818144368, -0.11060664309660323, -0.016493938717834573],
                    [-0.1413297634984383, 1.157823702216272, -0.016493938717834257],
                    [-0.14132976349843826, -0.11060664309660294, 1.2519364065950405]])


def agx(rgb, exposure: float = 1.0):
    """three r186 AgXToneMapping (src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js) then the sRGB
    output encoding: linear Rec.709 in (N x 3), display sRGB 0..1 out."""
    c = np.atleast_2d(np.asarray(rgb, float)) * exposure
    c = c @ _SRGB_TO_2020.T
    c = c @ _INSET.T
    c = np.log2(np.maximum(c, 1e-10))
    c = np.clip((c + 12.47393) / (4.026069 + 12.47393), 0.0, 1.0)
    x2 = c * c
    x4 = x2 * x2
    c = 15.5 * x4 * x2 - 40.14 * x4 * c + 31.96 * x4 - 6.868 * x2 * c + 0.4298 * x2 + 0.1191 * c - 0.00232
    c = c @ _OUTSET.T
    c = np.power(np.maximum(c, 0.0), 2.2)
    c = np.clip(c @ _2020_TO_SRGB.T, 0.0, 1.0)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def lum(rgb):
    rgb = np.asarray(rgb, float)
    return 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]


def ink_level() -> float:
    """The scene-linear grey D whose AgX display luminance equals ink's (#12141C)."""
    target = lum(np.array(INK) / 255.0)
    lo, hi = 1e-6, 1.0
    for _ in range(60):
        mid = math.sqrt(lo * hi)
        if lum(agx([mid, mid, mid]))[0] < target:
            lo = mid
        else:
            hi = mid
    return math.sqrt(lo * hi)


# ================================================================ Blender

vb = wb = mi = None
COL: dict = {}
P = ""                      # the room's datablock prefix: "<sceneId>_"
CFG: dict = {}
MATS: dict = {}             # name -> RMat
OBJS: list = []             # every room render object: dict(obj, what, id, ...)
NOTES: list = []


def nm(s: str) -> str:
    return f"{P}{s}"


def is_v2() -> bool:
    """A room file with `openings` (the v2 path: its node names carry the openings' ids); the legacy path (`door` and
    `window`: the bedroom's) keeps every name, number and order it was built with."""
    return SPEC.get("schema") == "v2"


def sfx(oid: str) -> str:
    """A v2 opening's node-name suffix (`_<id with . as _>`, room_file_v2 section 11)."""
    return "_" + oid.replace(".", "_")


def log(*a) -> None:
    print("ROOM", *a, flush=True)


def _load() -> None:
    global vb, wb, mi, COL
    mib.set_tile_m(1.0)
    mib._load()
    vb, wb, mi = mib.vb, mib.wb, mib.mi
    COL = vb.COL


def room_col():
    return COL["room"]


def link(ob, col: str = "room"):
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    COL[col].objects.link(ob)
    return ob


def register(ob, what: str, id_: str, **extra) -> dict:
    rec = dict(obj=ob, what=what, id=id_, **extra)
    OBJS.append(rec)
    ob["wdi_what"] = what
    ob["wdi_id"] = id_
    return rec


def world_bbox(ob) -> tuple:
    bpy.context.view_layer.update()
    me = ob.data
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    M = np.array(ob.matrix_world)
    w = co @ M[:3, :3].T + M[:3, 3]
    lo, hi = w.min(0), w.max(0)
    return (float(lo[0]), float(lo[1]), float(lo[2]), float(hi[0]), float(hi[1]), float(hi[2]))


def apply_transform(ob) -> None:
    """Bake the object's transform into its mesh (a single user copy), leaving it at the identity."""
    if ob.data.users > 1:
        ob.data = ob.data.copy()
    ob.data.transform(ob.matrix_world)
    ob.matrix_world = Matrix.Identity(4)
    if ob.matrix_world.determinant() < 0:
        pass


def mesh_from(name: str, verts, faces, uvs=None, mats=None, fmat=None, smooth: bool = False, col: str = "room"):
    """A mesh object from numpy-able verts (N x 3), faces (list of index tuples), per-loop uvs (L x 2) in face order,
    a material list and per-face material indices."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(map(float, v)) for v in verts], [], [tuple(int(i) for i in f) for f in faces])
    if uvs is not None:
        layer = me.uv_layers.new(name="UVMap")
        layer.data.foreach_set("uv", np.asarray(uvs, np.float32).ravel())
    for m in (mats or []):
        me.materials.append(m.mat if isinstance(m, RMat) else m)
    if fmat is not None and len(me.polygons):
        me.polygons.foreach_set("material_index", np.asarray(fmat, np.int32))
    if smooth:
        me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    me.update()
    ob = bpy.data.objects.new(name, me)
    COL[col].objects.link(ob)
    return ob


class Builder:
    """Accumulates one mesh: quads and triangles with per-loop UVs and a material per face (by RMat)."""

    def __init__(self):
        self.v, self.f, self.uv, self.fm, self.mats = [], [], [], [], []

    def _mi(self, mat) -> int:
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def face(self, pts, uvs, mat) -> None:
        b = len(self.v)
        self.v.extend(tuple(map(float, p)) for p in pts)
        self.f.append(tuple(range(b, b + len(pts))))
        self.uv.extend(tuple(map(float, u)) for u in uvs)
        self.fm.append(self._mi(mat))

    def quad_grid(self, origin, du, dv, nu: int, nv: int, mat, uv0=(0.0, 0.0), uv_scale=(1.0, 1.0), skip=None,
                  uv_fn=None, flip: bool = False, us=None, vs=None) -> None:
        """A grid of nu x nv quads spanning origin + s du + t dv (s, t in 0..1), shared vertices, its normal du x dv
        (dv x du with `flip`); UVs in metres along du and dv divided by uv_scale (or uv_fn(point)). `us` / `vs` give
        the grid lines as fractions 0..1 instead of nu / nv equal steps (a wall's lines through its openings' edges)."""
        o, du, dv = np.asarray(origin, float), np.asarray(du, float), np.asarray(dv, float)
        lu, lv = np.linalg.norm(du), np.linalg.norm(dv)
        us = [i / nu for i in range(nu + 1)] if us is None else [float(u) for u in us]
        vs = [j / nv for j in range(nv + 1)] if vs is None else [float(v) for v in vs]
        nu, nv = len(us) - 1, len(vs) - 1
        base = len(self.v)
        idx = {}
        for j in range(nv + 1):
            for i in range(nu + 1):
                p = o + du * us[i] + dv * vs[j]
                idx[(i, j)] = len(self.v)
                self.v.append(tuple(p))
        k = self._mi(mat)
        for j in range(nv):
            for i in range(nu):
                if skip is not None and skip(i, j):
                    continue
                corners = ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))
                if flip:
                    corners = corners[::-1]
                self.f.append(tuple(idx[c] for c in corners))
                for (a, b) in corners:
                    if uv_fn is not None:
                        self.uv.append(uv_fn(np.asarray(self.v[idx[(a, b)]])))
                    else:
                        self.uv.append((uv0[0] + lu * us[a] / uv_scale[0], uv0[1] + lv * vs[b] / uv_scale[1]))
                self.fm.append(k)
        del base

    def box(self, lo, hi, mat, uv_scale: float = 1.0, skip=(), M=None, vgrain: bool = False) -> None:
        """An axis-aligned box (local lo..hi, then placed by M), box-projected UVs in metres / uv_scale (`vgrain`: the
        texture's u runs up the sides, so a wood's grain is vertical, as on a stile)."""
        (x0, y0, z0), (x1, y1, z1) = lo, hi
        faces = {"bottom": ((x0, y0, z0), (x0, y1, z0), (x1, y1, z0), (x1, y0, z0), "xy"),
                 "top": ((x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1), "xy"),
                 "S": ((x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1), "xz"),
                 "N": ((x1, y1, z0), (x0, y1, z0), (x0, y1, z1), (x1, y1, z1), "xz"),
                 "W": ((x0, y1, z0), (x0, y0, z0), (x0, y0, z1), (x0, y1, z1), "yz"),
                 "E": ((x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1), "yz")}
        for key, (*pts, plane) in faces.items():
            if key in skip:
                continue
            wp = [tuple(M @ Vector(p)) if M is not None else p for p in pts]
            ax = {"xy": (0, 1), "xz": (0, 2), "yz": (1, 2)}[plane]
            if vgrain and plane != "xy":
                ax = (ax[1], ax[0])
            uvs = [(p[ax[0]] / uv_scale, p[ax[1]] / uv_scale) for p in pts]
            self.face(wp, uvs, mat)

    def sweep(self, profile, path, mat, closed: bool = False, uv_scale: float = 1.0, caps: bool = True,
              step: float = 0.1) -> None:
        """Sweep a 2D profile [(out, up), ...] (out: along the path's left normal, up: +z) along a horizontal polyline
        `path` [(x, y, z), ...]; mitred joints; each segment split to `step` metres for the bake; UVs (length, profile
        arc) in metres / uv_scale."""
        path = [np.asarray(p, float) for p in path]
        n = len(path)
        segs = n if closed else n - 1
        dirs = []
        for i in range(segs):
            d = path[(i + 1) % n] - path[i]
            d[2] = 0.0
            dirs.append(d / max(np.linalg.norm(d), 1e-9))

        def left(d):
            return np.array([-d[1], d[0], 0.0])

        def miter(i):
            if not closed and i == 0:
                return left(dirs[0]), 1.0
            if not closed and i == n - 1:
                return left(dirs[-1]), 1.0
            a, b = dirs[(i - 1) % segs], dirs[i % segs]
            m = left(a) + left(b)
            m = m / max(np.linalg.norm(m), 1e-9)
            return m, 1.0 / max(np.dot(m, left(b)), 1e-3)

        arc = [0.0]
        for i in range(1, len(profile)):
            arc.append(arc[-1] + math.dist(profile[i], profile[i - 1]))
        rings_pts = []
        ts = []
        for i in range(segs):
            a, b = path[i], path[(i + 1) % n]
            L = float(np.linalg.norm((b - a)[:2]))
            cuts = max(1, int(math.ceil(L / step)))
            for c in range(cuts + (1 if (i == segs - 1 and not closed) else 0)):
                t = c / cuts
                ts.append((i, t, L))
        acc = 0.0
        last = None
        for (i, t, L) in ts:
            a, b = path[i], path[(i + 1) % n]
            p = a + (b - a) * t
            if t == 0.0:
                m, s = miter(i)
            elif t == 1.0:
                m, s = miter(i + 1 if (closed or i + 1 < n) else i)
            else:
                m, s = left(dirs[i]), 1.0
            if last is not None:
                acc += float(np.linalg.norm((p - last)[:2]))
            last = p
            ring = [p + m * (o * s) + np.array([0.0, 0.0, u]) for (o, u) in profile]
            rings_pts.append((ring, acc))
        if closed:
            rings_pts.append((rings_pts[0][0], acc + float(np.linalg.norm((path[0] - last)[:2]))))
        # faces ordered profile-first then along the path: their normals are (profile direction) x (path direction),
        # which faces the room for a profile drawn out from the wall and up (the path keeps the room on its left)
        for r in range(len(rings_pts) - 1):
            ra, la = rings_pts[r]
            rb, lb = rings_pts[r + 1]
            for k in range(len(profile) - 1):
                self.face([ra[k], ra[k + 1], rb[k + 1], rb[k]],
                          [(la / uv_scale, arc[k] / uv_scale), (la / uv_scale, arc[k + 1] / uv_scale),
                           (lb / uv_scale, arc[k + 1] / uv_scale), (lb / uv_scale, arc[k] / uv_scale)], mat)
        if caps and not closed:
            # the profile ring (closed back along the wall face) faces along the path: the end cap as it is, the
            # start cap reversed
            for ring, end in ((rings_pts[0][0], False), (rings_pts[-1][0], True)):
                pts = list(ring) if end else list(ring)[::-1]
                if len(pts) >= 3:
                    self.face(pts, [(p[0] / uv_scale + p[1] / uv_scale, p[2] / uv_scale) for p in pts], mat)

    def build(self, name: str, col: str = "room", smooth: bool = False):
        if not self.f:
            return None
        ob = mesh_from(name, self.v, self.f, self.uv, self.mats, self.fm, smooth=smooth, col=col)
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bm.to_mesh(ob.data)
        bm.free()
        ob.data.update()
        return ob


# ---------------------------------------------------------------- materials (one spec, two node trees)


class RMat:
    """A room material: albedo = image x factor (or factor alone), lit for the bake (a Principled BSDF, normal maps
    and metal left out so the vertex bake stays smooth) and unlit for the export (Emission of albedo x COLOR_0 behind
    the light-path trick; the glTF exporter writes KHR_materials_unlit with the factor and COLOR_0). Kinds: surface
    (baked), emit (unlit at its own colour: the flame, the sky), glass (transparent, unlit colour), cloth (surface,
    two-sided)."""

    def __init__(self, name: str, image=None, factor=(1.0, 1.0, 1.0), kind: str = "surface", rough: float = 0.8,
                 alpha: float = 1.0, emit=(0.0, 0.0, 0.0), spec: float = 0.25, albedo=None, note: str = ""):
        self.name, self.image, self.factor, self.kind = nm(name), image, tuple(factor), kind
        self.rough, self.alpha, self.emit, self.spec, self.note = rough, alpha, tuple(emit), spec, note
        self.albedo = albedo        # the mean linear albedo (image mean x factor), for the exposure
        self.albedo_low = None      # the ink floor's reference texel's luminance (its `ref_pct` percentile)
        self.hot = None             # (knee, max) display luminance of its highlight ease (the look's `hot` otherwise)
        self.purple_rgb = None      # its texels nearest purple (most red and blue for their green): their mean colour
        self.dark = {}              # percentile -> (luminance, RGB): the texels at and under it, their mean colour
        self.ref_pct = REF_PCT_DEFAULT
        if image is not None:
            px = (_srgb_to_lin(_pixels(image)[..., :3]) * np.array(self.factor)).reshape(-1, 3)
            y = lum(px)
            order = np.argsort(y)
            for p in (0.5, 1.0, 3.0, 10.0, 25.0, 50.0):
                n = max(1, int(len(y) * p / 100.0))
                sel = px[order[:n]]
                yl = float(y[order[n - 1]])
                rgb = sel.mean(0)
                rgb = rgb * (yl / max(float(lum(rgb)), 1e-9))
                self.dark[p] = (yl, tuple(float(v) for v in rgb))
            if self.albedo is None:
                self.albedo = tuple(float(v) for v in px.mean(0))
            # the texels that would turn purple first under a bluish light (the moon's bounce, blue up to 2.5 times
            # its green): the 0.5 % with the most red, and 2.5 times blue, for their green (the darkest tenth left
            # out), for post_bake's lilac guard
            lit = y >= np.percentile(y, 10)
            pq = np.where(lit, np.minimum(px[:, 0], 2.5 * px[:, 2]) / np.maximum(px[:, 1], 1e-6), 0.0)
            top = np.argsort(pq)[-max(1, len(pq) // 200):]
            self.purple_rgb = tuple(float(v) for v in px[top].mean(0))
        elif albedo is not None:
            c = tuple(float(v) for v in albedo)
            self.dark = {p: (float(lum(np.array(c))), c) for p in (0.5, 1.0, 3.0, 10.0, 25.0, 50.0)}
            self.purple_rgb = c
        self.set_ref(self.ref_pct)
        self.mat = bpy.data.materials.get(self.name) or bpy.data.materials.new(self.name)
        self.mat.use_backface_culling = False
        MATS[self.name] = self
        self.bake_tree()

    def set_ref(self, pct: float, deep: tuple | None = None) -> None:
        """The ink floor's reference: the texel at the `pct` percentile (luminance) and the mean colour of the texels
        under it. 1 for the scans (their dark tail is already eased by lift_dark); a Meshy texture keeps its own
        baked crevices (owner: keep the Meshy textures), so its reference sits higher (MESHY_REF_PCT), with `deep`
        = (percentile, display luma): those darker texels kept at least that bright (never black)."""
        self.ref_pct = pct
        self.deep_rgb, self.deep_luma = None, None
        if self.dark:
            keys = sorted(self.dark)
            p = min(keys, key=lambda q: abs(q - pct))
            self.albedo_low, self.dark_rgb = self.dark[p][0], self.dark[p][1]
            if deep:
                q = min(keys, key=lambda k_: abs(k_ - deep[0]))
                self.deep_rgb, self.deep_luma = self.dark[q][1], float(deep[1])
        else:
            self.albedo_low, self.dark_rgb = None, None

    def _clear(self):
        m = self.mat
        try:
            m.use_nodes = True
        except (AttributeError, TypeError):
            pass
        m.node_tree.nodes.clear()
        return m.node_tree

    def _albedo_socket(self, nt, with_vc: bool):
        """image x factor (x the colour attribute), in the exporter's shape: Mix(MULTIPLY) of the texture and the
        attribute, then a Mix(MULTIPLY) by the constant factor."""
        N, L = nt.nodes, nt.links
        out = None
        if self.image is not None:
            ti = N.new("ShaderNodeTexImage")
            ti.image = self.image
            ti.interpolation = "Linear"
            out = ti.outputs["Color"]
        if with_vc:
            vc = N.new("ShaderNodeVertexColor")
            vc.layer_name = ATTR
            mul = N.new("ShaderNodeMix")
            mul.data_type, mul.blend_type = "RGBA", "MULTIPLY"
            mul.inputs[0].default_value = 1.0
            if out is not None:
                L.new(out, mul.inputs[6])
                L.new(vc.outputs["Color"], mul.inputs[7])
                out = mul.outputs[2]
                if self.factor != (1.0, 1.0, 1.0):
                    fm = N.new("ShaderNodeMix")
                    fm.data_type, fm.blend_type = "RGBA", "MULTIPLY"
                    fm.inputs[0].default_value = 1.0
                    L.new(out, fm.inputs[6])
                    fm.inputs[7].default_value = (*self.factor, 1.0)
                    out = fm.outputs[2]
            else:
                mul.inputs[6].default_value = (*self.factor, 1.0)
                L.new(vc.outputs["Color"], mul.inputs[7])
                out = mul.outputs[2]
            return out
        if out is None:
            return None
        if self.factor != (1.0, 1.0, 1.0):
            fm = N.new("ShaderNodeMix")
            fm.data_type, fm.blend_type = "RGBA", "MULTIPLY"
            fm.inputs[0].default_value = 1.0
            L.new(out, fm.inputs[6])
            fm.inputs[7].default_value = (*self.factor, 1.0)
            out = fm.outputs[2]
        return out

    def bake_tree(self) -> None:
        nt = self._clear()
        N, L = nt.nodes, nt.links
        out = N.new("ShaderNodeOutputMaterial")
        if self.kind == "glass":
            tr = N.new("ShaderNodeBsdfTransparent")
            tr.inputs["Color"].default_value = (0.93, 0.94, 0.95, 1.0)
            L.new(tr.outputs[0], out.inputs["Surface"])
            return
        if self.kind == "emit":
            # unlit at its own colour: in the bake it neither lights nor shadows (the scene's lights do that)
            tr = N.new("ShaderNodeBsdfTransparent")
            L.new(tr.outputs[0], out.inputs["Surface"])
            return
        b = N.new("ShaderNodeBsdfPrincipled")
        col = self._albedo_socket(nt, with_vc=False)
        if col is not None:
            L.new(col, b.inputs["Base Color"])
        else:
            b.inputs["Base Color"].default_value = (*self.factor, 1.0)
        b.inputs["Roughness"].default_value = max(self.rough, 0.45)
        b.inputs["Metallic"].default_value = 0.0
        for key in ("Specular IOR Level", "Specular"):
            if key in b.inputs:
                b.inputs[key].default_value = self.spec
                break
        L.new(b.outputs[0], out.inputs["Surface"])

    def unlit_tree(self, k_emit: float = 1.0) -> None:
        """The export tree. Surfaces: albedo x COLOR_0. emit: its colour x k_emit. glass: a constant colour at its
        alpha, no COLOR_0."""
        nt = self._clear()
        N, L = nt.nodes, nt.links
        out = N.new("ShaderNodeOutputMaterial")
        em = N.new("ShaderNodeEmission")
        em.inputs["Strength"].default_value = 1.0
        lp = N.new("ShaderNodeLightPath")
        mix = N.new("ShaderNodeMixShader")
        L.new(lp.outputs["Is Camera Ray"], mix.inputs[0])
        L.new(N.new("ShaderNodeBsdfTransparent").outputs[0], mix.inputs[1])
        L.new(em.outputs[0], mix.inputs[2])
        if self.kind in ("emit", "glass"):
            em.inputs["Color"].default_value = (*[min(1.0, c * k_emit) for c in self.emit], 1.0)
            self.exported = [min(1.0, c * k_emit) for c in self.emit]
            # (an emitter no mesh of the room uses is not under its emit cap: no note for it)
            if any(c * k_emit > 1.0 for c in self.emit) and self.mat.users:
                NOTES.append(f"{self.name}: emitted colour clamped at 1 (the glTF factor's range)")
        else:
            L.new(self._albedo_socket(nt, with_vc=True), em.inputs["Color"])
        if self.kind == "glass" or self.alpha < 1.0:
            ma = N.new("ShaderNodeMixShader")
            ma.inputs[0].default_value = self.alpha
            L.new(N.new("ShaderNodeBsdfTransparent").outputs[0], ma.inputs[1])
            L.new(mix.outputs[0], ma.inputs[2])
            L.new(ma.outputs[0], out.inputs["Surface"])
            try:
                self.mat.surface_render_method = "BLENDED"
            except (AttributeError, TypeError):
                pass
        else:
            L.new(mix.outputs[0], out.inputs["Surface"])


# ---------------------------------------------------------------- images (derived from the cached scans)

TEX_DIR = ""                # <out>/<id>_textures: the derived images (packed into the .blend)


def _img_load(path: str, colorspace: str = "sRGB"):
    img = bpy.data.images.load(path, check_existing=True)
    img.colorspace_settings.name = colorspace
    return img


def _pixels(img) -> np.ndarray:
    a = np.empty(img.size[0] * img.size[1] * 4, np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(img.size[1], img.size[0], 4)


def _srgb_to_lin(a):
    return np.where(a <= 0.04045, a / 12.92, np.power((np.maximum(a, 0) + 0.055) / 1.055, 2.4))


def _lin_to_srgb(a):
    a = np.clip(a, 0.0, 1.0)
    return np.where(a <= 0.0031308, 12.92 * a, 1.055 * np.power(a, 1 / 2.4) - 0.055)


def _resize(a: np.ndarray, w: int, h: int) -> np.ndarray:
    """Area-average resize of an H x W x C array by an integer factor, else bilinear."""
    H, W = a.shape[:2]
    if (W, H) == (w, h):
        return a
    if W % w == 0 and H % h == 0:
        fx, fy = W // w, H // h
        return a.reshape(h, fy, w, fx, -1).mean(axis=(1, 3))
    ys = np.linspace(0, H - 1, h)
    xs = np.linspace(0, W - 1, w)
    y0 = np.floor(ys).astype(int)
    x0 = np.floor(xs).astype(int)
    y1, x1 = np.minimum(y0 + 1, H - 1), np.minimum(x0 + 1, W - 1)
    wy, wx = (ys - y0)[:, None, None], (xs - x0)[None, :, None]
    return (a[y0][:, x0] * (1 - wy) * (1 - wx) + a[y0][:, x1] * (1 - wy) * wx + a[y1][:, x0] * wy * (1 - wx) +
            a[y1][:, x1] * wy * wx)


def save_image(name: str, lin_rgb: np.ndarray, alpha=None):
    """A derived image (linear RGB array, top row first as numpy reads, i.e. Blender's bottom row first) saved as
    PNG in TEX_DIR and loaded as an sRGB image datablock named <id>_<name>."""
    h, w = lin_rgb.shape[:2]
    rgba = np.ones((h, w, 4), np.float32)
    rgba[..., :3] = _lin_to_srgb(lin_rgb)
    if alpha is not None:
        rgba[..., 3] = alpha
    full = nm(name)
    img = bpy.data.images.get(full)
    if img is not None:
        bpy.data.images.remove(img)
    img = bpy.data.images.new(full, w, h, alpha=alpha is not None)
    img.colorspace_settings.name = "sRGB"
    img.pixels.foreach_set(rgba.ravel())
    os.makedirs(TEX_DIR, exist_ok=True)
    path = os.path.join(TEX_DIR, f"{full}.png")
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    img.reload()
    return img


def scan_mean(img) -> np.ndarray:
    a = _pixels(img)[..., :3]
    return _srgb_to_lin(a).reshape(-1, 3).mean(0)


def detail_image(name: str, path: str, size: int, gain: float = 1.0, mean: float = 0.82, mottle: float = 0.0,
                 seed: int = 3):
    """A neutral detail map from a scan: its luminance about its mean, times `gain`, around `mean` (linear), plus an
    optional low-frequency mottle; tinted by the material's factor (glTF factors stay within 0..1)."""
    src = _img_load(path)
    a = _srgb_to_lin(_pixels(src)[..., :3])
    a = _resize(a, size, size) if a.shape[0] == a.shape[1] else _resize(a, size, int(size * a.shape[0] / a.shape[1]))
    y = lum(a)
    d = 1.0 + gain * (y / max(y.mean(), 1e-6) - 1.0)
    if mottle:
        rng = np.random.default_rng(seed)
        h, w = d.shape
        m = np.zeros_like(d)
        for f, amp in ((2, 1.0), (4, 0.5), (8, 0.25)):
            g = rng.normal(size=(f + 1, f + 1))
            g[-1, :], g[:, -1] = g[0, :], g[:, 0]   # tileable
            yy, xx = np.linspace(0, f, h, endpoint=False), np.linspace(0, f, w, endpoint=False)
            iy, ix = np.floor(yy).astype(int), np.floor(xx).astype(int)
            fy, fx = (yy - iy)[:, None], (xx - ix)[None, :]
            fy, fx = fy * fy * (3 - 2 * fy), fx * fx * (3 - 2 * fx)
            m += amp * (g[iy][:, ix] * (1 - fy) * (1 - fx) + g[iy][:, ix + 1] * (1 - fy) * fx +
                        g[iy + 1][:, ix] * fy * (1 - fx) + g[iy + 1][:, ix + 1] * fy * fx)
        d = d * (1.0 + mottle * m / max(np.abs(m).max(), 1e-6))
    out = np.clip(d * mean, 0.0, 1.0)
    bpy.data.images.remove(src)
    return save_image(name, np.clip(lift_dark(np.repeat(out[..., None], 3, axis=2)), 0.0, 1.0))


def lift_dark(a: np.ndarray, frac: float = 0.45) -> np.ndarray:
    """A texture's darkest texels lifted toward `frac` of its mean luminance (sqrt(l^2 + (frac m)^2), hue kept), so the
    light's ink floor (set from the texture's own 3rd percentile) never shows a texel under ink."""
    y = lum(a)
    m = float(y.mean())
    yf = frac * m
    new = np.sqrt(y * y + yf * yf)
    chroma = a.reshape(-1, 3).sum(0) / max(float(a.sum()), 1e-9) * 3.0
    chroma = chroma / max(float(lum(chroma)), 1e-9)
    s = np.where(y > 1e-7, new / np.maximum(y, 1e-9), 0.0)
    out = a * s[..., None]
    zero = y <= 1e-7
    out[zero] = chroma[None, :] * yf
    return out


def dark_chroma_smooth(a: np.ndarray, lo: float = 0.02, hi: float = 0.05, r: int = 2) -> np.ndarray:
    """A scan's darkest texels take their colour from the (2 r + 1)^2 texels round them, their own luminance kept:
    fully under `lo` (linear luminance), not at all over `hi`. A dark scan's shadows are chroma noise (single texels
    of pure red, blue and green in the console's and the mantel clock's scans); the room's grade brightens them,
    and the GLB's lossy WebP and the viewer's mip maps average them to purple speckles."""
    y = lum(a)
    w = np.clip((hi - y) / (hi - lo), 0.0, 1.0)
    if not (w > 0).any():
        return a
    pad = np.pad(a, ((r, r), (r, r), (0, 0)), mode="wrap")
    H, W = y.shape
    acc = np.zeros_like(a)
    for dy in range(2 * r + 1):
        for dx in range(2 * r + 1):
            acc += pad[dy:dy + H, dx:dx + W]
    acc /= (2 * r + 1) ** 2
    sm = acc * (y / np.maximum(lum(acc), 1e-9))[..., None]
    return a * (1.0 - w[..., None]) + sm * w[..., None]


def grade_scan(a: np.ndarray, g: dict | None) -> np.ndarray:
    """A Poly Haven scan's grade for the candle-lit room (SCAN_GRADE): its colour moved `w` of the way toward
    `toward`'s hue and saturation at its own luminance, then times `gain`. The mahogany-red scans read salmon under
    the amber candle (three's AgX turns a bright red-orange peach): a walnut brown reads amber. (`gamma`, the
    scan's contrast, is applied by scan_image after the dark tail's lift.)"""
    if not g:
        return a
    y = lum(a)
    t = np.array(hex_lin(g["toward"])) if g.get("toward") else None
    if t is not None and g.get("w", 0.0) > 0:
        ca = a / np.maximum(y, 1e-9)[..., None]
        ct = t / max(float(lum(t)), 1e-9)
        a = y[..., None] * ((1.0 - g["w"]) * ca + g["w"] * ct)
    return np.clip(a * float(g.get("gain", 1.0)), 0.0, 1.0)


# Per scan (the model's slug): its grade in this room's light (grade_scan). The dark woods brightened toward a dark
# walnut (their ink floor then sits near the room's own light, so the bake's shading still reads on them); the oval
# photo frames a mourning black-brown (their scan's crimson read toy-like); the brass a yellower brass.
# `hot` = (knee, max): the display luminance where the candle's light on it starts to ease, and its ceiling (past
# about 0.55 AgX takes a candle-lit red-brown wood to a pale salmon; under it the wood stays an orange brown).
# WALNUT is an umber walnut: under the dim room's near-white ambient a redder brown (round 5's #5E4330, and the
# scans' own mahogany) showed as a saturated ember orange, brighter to the eye than the sage wall behind it; under
# the candle the umber still reads an orange brown, a little nearer amber than salmon.
WALNUT, BLACK_WALNUT, BRASS, SLATE = "#52422F", "#2A211B", "#B08D57", "#4A5264"
WOOD_HOT = (0.40, 0.52)
SCAN_GRADE = {
    "side_table_tall_01": dict(toward=WALNUT, w=0.8, gain=1.3, hot=(0.36, 0.48)),
    "GothicCommode_01": dict(toward=WALNUT, w=0.6, gain=1.3, hot=WOOD_HOT),
    "GothicCabinet_01": dict(toward=WALNUT, w=0.6, gain=1.4, hot=WOOD_HOT),
    "ClassicConsole_01": dict(toward=WALNUT, w=0.5, gain=2.4),
    "wooden_candlestick": dict(toward=WALNUT, w=0.6, hot=(0.36, 0.48)),
    "GothicBed_01": dict(toward=WALNUT, w=0.4, hot=WOOD_HOT),
    "hanging_picture_frame_03": dict(toward=BLACK_WALNUT, w=0.75, gain=0.5),
    "fancy_picture_frame_02": dict(toward=BRASS, w=0.5, gain=0.6, hot=WOOD_HOT),   # gilt: a dull brass, not peach
    "brass_pot_02": dict(toward=BRASS, w=0.35, gain=0.85, hot=(0.45, 0.60)),
    "ClassicNightstand_01": dict(toward=WALNUT, w=0.5, gain=1.5),
    "painted_wooden_bench": dict(toward=WALNUT, w=0.7, gain=0.8),     # its barn-red paint, a mourning brown
    # her chair's pale upholstery in the curtains' slate (it was the brightest thing in its dim corner, a pale mauve)
    "Armchair_01": dict(toward=SLATE, w=0.6, gain=0.55),
    # the fisher's cottage: its pale pine table, stools and crates read salmon under the fire; a plain umber deal
    "wooden_table_02": dict(toward=WALNUT, w=0.75, gain=0.7, hot=WOOD_HOT),
    "wooden_stool_01": dict(toward=WALNUT, w=0.5, gain=0.9, hot=WOOD_HOT),
    "wooden_crate_01": dict(toward=WALNUT, w=0.55, gain=0.85, hot=WOOD_HOT),
    "wooden_crate_02": dict(toward=WALNUT, w=0.55, gain=0.85, hot=WOOD_HOT),
    # the tavern's back room: the wardrobe's blue paint (teal is only ever a light) and the chest's red stripes, umber
    "painted_wooden_cabinet_02": dict(toward=WALNUT, w=0.75, gain=0.8, hot=WOOD_HOT),
    "treasure_chest": dict(toward=WALNUT, w=0.6, gain=0.85, hot=WOOD_HOT),
}


def scan_image(name: str, path: str, size: int, ao_path: str | None = None, ao: float = 0.7, lift: bool = True,
               brighten: float = 0.03, grade: dict | None = None, contrast: dict | None = None):
    """A model's base colour scan, resized, its ambient occlusion (the ARM map's red) multiplied in at `ao` (the
    vertex bake carries the large-scale light; the carvings' crevices come from the scan's own AO); a scan darker
    on average than `brighten` raised toward it (at most 2 times: the ebonised and dark-oak scans read at night),
    graded (grade_scan), its darkest texels lifted (lift_dark)."""
    src = _img_load(path)
    a = _srgb_to_lin(_pixels(src)[..., :3])
    W, H = src.size
    w, h = (size, int(round(size * H / W))) if W >= H else (int(round(size * W / H)), size)
    a = _resize(a, w, h)
    if ao_path and os.path.exists(ao_path):
        s2 = _img_load(ao_path, "Non-Color")
        occ = _resize(_pixels(s2)[..., :1], w, h)[..., 0]
        a = a * (1.0 - ao * (1.0 - np.clip(occ, 0, 1)))[..., None]
        bpy.data.images.remove(s2)
    bpy.data.images.remove(src)
    a = dark_chroma_smooth(a)
    m = float(lum(a).mean())
    if brighten and m < brighten:
        a = a * min(2.0, brighten / max(m, 1e-6))
    a = grade_scan(a, grade)
    # palette: never magenta. A texel with less green than both red and blue (the console scan's purple speckles, a
    # jug's rose-pink flowers) takes the lesser of the two as its green; and a clearly red texel (red over 1.25
    # times its green) keeps its blue under 0.7 of its green, a margin the GLB's lossy WebP (which moved specks
    # with blue = green back to purple) does not cross: a brick red, a coral
    a = a.copy()
    g_min = np.minimum(a[..., 0], a[..., 2])
    purple = a[..., 1] < g_min
    a[..., 1][purple] = g_min[purple]
    red = (a[..., 0] > 1.25 * a[..., 1]) & (a[..., 2] > 0.7 * a[..., 1])
    a[..., 2][red] = 0.7 * a[..., 1][red]
    if lift:
        a = lift_dark(a)
    # the scan's contrast about its median, to the power gamma. At the ink floor a surface shows its darkest texels
    # at ink and every other texel as many times brighter as the texture says, so a dark press with pale panels and
    # bright straps (or a console with a dusty top) stood brighter than the wall behind it in a dim corner. A grade's
    # own `gamma`, else the look's `scan_contrast`: a dark scan (mean under `dark_below`) whose 90th percentile is
    # more than `p90_over_p1` times its 1st is brought to that ratio (never under `gamma_min`)
    y = lum(a)
    g = (grade or {}).get("gamma")
    if g is None and contrast and float(y.mean()) < float(contrast.get("dark_below", 0.08)):
        p1, p90 = (float(v) for v in np.percentile(y, [1, 90]))
        want = float(contrast.get("p90_over_p1", 2.4))
        if p90 > want * max(p1, 1e-6):
            g = max(float(contrast.get("gamma_min", 0.5)), math.log(want) / math.log(p90 / max(p1, 1e-6)))
    if g and abs(g - 1.0) > 1e-3:
        med = max(float(np.median(y)), 1e-6)
        a = a * np.power(np.maximum(y, 1e-6) / med, float(g) - 1.0)[..., None]
        log(f"scan {name}: contrast gamma {g:.2f}")
    return save_image(name, np.clip(a, 0.0, 1.0))


# ---------------------------------------------------------------- the room's frame

_NORMALS = {"S": (0.0, 1.0), "E": (-1.0, 0.0), "N": (0.0, -1.0), "W": (1.0, 0.0)}


class Frame:
    """The room box and its openings from the scene: the inner rectangle of the grid's non-border tiles, each portal
    on the border an opening in its wall (the door), each wall-mounted window prop an opening."""

    def __init__(self, room, cfg: dict):
        self.room, self.cfg = room, cfg
        inner = [(x, y) for y in range(1, room.h - 1) for x in range(1, room.w - 1)]
        xs = [room.tile_box(x, y) for x, y in inner]
        self.x0, self.y0 = min(b[0] for b in xs), min(b[1] for b in xs)
        self.x1, self.y1 = max(b[2] for b in xs), max(b[3] for b in xs)
        self.H, self.T = cfg["height"], cfg["wall_t"]
        self.cx, self.cy = (self.x0 + self.x1) / 2, (self.y0 + self.y1) / 2
        self.openings = []   # dict(kind, side, a, b (world along-coordinates), z0, z1, id): the holes in the walls
        self.markers = []    # the loader's stairs, hatch and drop entries, and any opening in the floor: no hole
        if is_v2():
            self._v2_openings(room)
            return
        d = cfg["door"]
        for pt in room.portals:
            if pt["id"] != d["portal"]:
                continue
            side = self.border_side(pt["x"], pt["y"])
            c = self.along_of(side, *room.centre(pt["x"], pt["y"]))
            self.openings.append(dict(kind="door", side=side, a=c - d["width"] / 2, b=c + d["width"] / 2, z0=0.0,
                                      z1=d["height"], id=pt["id"], portal=pt))
        w = cfg["window"]
        for p in room.props:
            if p["id"] != w["prop"]:
                continue
            side = self.border_side(p["x"], p["y"])
            c = self.along_of(side, *room.centre(p["x"], p["y"]))
            # cut_z0: the wall's own cut starts inside the window board's thickness (the board is the sill's top
            # 3.2 cm), so no wall edge lies in the board's top plane
            self.openings.append(dict(kind="window", side=side, a=c - w["width"] / 2, b=c + w["width"] / 2,
                                      z0=w["sill"], z1=w["head"], id=p["id"], cut_z0=w["sill"] - 0.016))

    def _v2_openings(self, room) -> None:
        """A v2 file's openings, the loader's entries in their order (room_file_v2, section 2): each door and window
        on a wall a hole in it (its side is the loader's: the border tile's wall, or the file's on an inner tile);
        stairs, hatches, drops and a hatch in the floor are markers with no hole (G12 builds their flights)."""
        portals = {pt["id"]: pt for pt in room.portals}
        for e in SPEC["openings"]:
            if e["kind"] not in ("door", "window") or e["side"] not in ("N", "E", "S", "W"):
                self.markers.append(e)
                continue
            c, w = e["at"], e["width"]
            o = dict(kind=e["kind"], side=e["side"], a=c - w / 2, b=c + w / 2, id=e["id"], spec=e)
            if e["kind"] == "door":
                o.update(z0=0.0, z1=e["height"], portal=portals.get(e["portal"]) if e.get("portal") else None)
            else:
                # cut_z0 as the legacy window's: the wall's cut starts inside the window board's thickness
                o.update(z0=e["sill"], z1=e["head"], cut_z0=e["sill"] - 0.016)
            self.openings.append(o)

    def border_side(self, tx: int, ty: int) -> str:
        if ty == 0:
            return "N"
        if ty == self.room.h - 1:
            return "S"
        if tx == 0:
            return "W"
        return "E"

    @staticmethod
    def along_of(side: str, x: float, y: float) -> float:
        return x if side in ("N", "S") else y

    def wall_frame(self, side: str):
        """(origin, du, inward normal, length) of a wall's inner face: du runs along the wall with the room on its
        left (the loop S, E, N, W goes anticlockwise seen from above)."""
        x0, x1, y0, y1 = self.x0, self.x1, self.y0, self.y1
        return {"S": ((x0, y0), (1.0, 0.0), (0.0, 1.0), x1 - x0),
                "E": ((x1, y0), (0.0, 1.0), (-1.0, 0.0), y1 - y0),
                "N": ((x1, y1), (-1.0, 0.0), (0.0, -1.0), x1 - x0),
                "W": ((x0, y1), (0.0, -1.0), (1.0, 0.0), y1 - y0)}[side]

    def to_s(self, side: str, along: float) -> float:
        """The distance along a wall's du of a world along-coordinate (x on the N and S walls, y on E and W)."""
        (ox, oy), (dx, dy), _n, _L = self.wall_frame(side)
        return (along - ox) / dx if dx else (along - oy) / dy

    def point(self, side: str, s: float, out: float, z: float):
        """The world point at s along a wall, `out` metres into the room from its face, at height z."""
        (ox, oy), (dx, dy), (nx, ny), _L = self.wall_frame(side)
        return (ox + dx * s + nx * out, oy + dy * s + ny * out, z)


def win_cfg(o: dict, cfg: dict | None = None) -> dict:
    """A window's own numbers (panes, rod, swag, curtains, curtain_colour): the legacy `window` block, or its v2
    opening entry (the loader's, every default filled)."""
    return o["spec"] if "spec" in o else (cfg or CFG)["window"]


def moon_windows(fr: Frame) -> list:
    """The windows the moon comes through (the openings): on the legacy path the window; on the v2 path each window
    a moon light names, in the lights' order (none in a room with no moon light: its windows are dark glass)."""
    wins = [o for o in fr.openings if o["kind"] == "window"]
    if not is_v2():
        return wins[:1]
    ids = dict.fromkeys(r["window"] for r in SPEC.get("lights") or () if r["role"] == "moon")
    return [o for i in ids for o in wins if o["id"] == i]


def moon_patches(fr: Frame, cfg: dict) -> list:
    """The moon's patches on the floor, one polygon per moon-lit window (the legacy path's one)."""
    return [q for q in (moon_patch(fr, cfg, o) for o in moon_windows(fr)) if q is not None]


def moon_patch(fr: Frame, cfg: dict, o: dict | None = None) -> list | None:
    """The moon's patch on the floor as a polygon [(x, y), ...]: the window's clear opening on the wall's inner face
    (inside its frame and the curtains' edges, under the swag's belly) carried along the moon's rays to the floor.
    Plain numbers (no Blender): the light numbers are also taken from an exported GLB. `o`: the window (default the
    first moon-lit one)."""
    if o is None:
        o = next(iter(moon_windows(fr)), None)
    if o is None:
        return None
    w, m = win_cfg(o, cfg), cfg["moon"]
    side = o["side"]
    (_o, (dx, dy), (nx, ny), _L) = fr.wall_frame(side)
    if is_v2() and m.get("bearing") is not None:      # one Sun from a compass bearing (R-L9)
        d = np.array(rf.bearing_dir(m["bearing"], m["elevation"]))
    else:
        a, e = math.radians(m["azimuth"]), math.radians(m["elevation"])
        d = np.array([(-nx * math.cos(a) - dx * math.sin(a)) * math.cos(e),
                      (-ny * math.cos(a) - dy * math.sin(a)) * math.cos(e), math.sin(e)])     # toward the moon
    sa, sb = sorted((fr.to_s(side, o["a"]), fr.to_s(side, o["b"])))
    z0 = o["z0"] + 0.03
    z1 = min(o["z1"] - 0.05, (w["rod"] + 0.03 - 0.40) if w.get("swag") else 1e9)
    out = []
    for s, z in ((sa + 0.06, z0), (sb - 0.06, z0), (sb - 0.06, z1), (sa + 0.06, z1)):
        p = np.array(fr.point(side, s, 0.0, z))
        q = p - d * (z / d[2])
        out.append((float(q[0]), float(q[1])))
    return out


def curtain_boxes(fr: Frame, cfg: dict) -> list:
    """The two curtains' boxes (x0, y0, z0, x1, y1, z1): the wall behind them is not seen (light_numbers leaves it
    out with the wall behind the pieces)."""
    out = []
    for o in fr.openings:
        if o["kind"] != "window" or not win_cfg(o, cfg).get("curtains", True):
            continue
        side = o["side"]
        sa, sb = sorted((fr.to_s(side, o["a"]), fr.to_s(side, o["b"])))
        for s0, s1 in ((sa - 0.50, sa + 0.05), (sb - 0.05, sb + 0.50)):
            pts = [fr.point(side, s, d, z) for s in (s0, s1) for d in (-0.02, 0.16) for z in (0.0, win_cfg(o, cfg)["rod"])]
            out.append(tuple(float(v) for v in (*np.min(pts, 0), *np.max(pts, 0))))
    return out


def _poly_signed(poly: list, xy: np.ndarray) -> np.ndarray:
    """Each point's distance to a convex polygon's boundary: positive inside, negative outside."""
    P = np.asarray(poly, float)
    n = len(P)
    area = 0.5 * sum(P[i, 0] * P[(i + 1) % n, 1] - P[(i + 1) % n, 0] * P[i, 1] for i in range(n))
    inside = np.ones(len(xy), bool)
    dist = np.full(len(xy), np.inf)
    for i in range(n):
        a, b = P[i], P[(i + 1) % n]
        ab = b - a
        t = np.clip(((xy - a) @ ab) / max(float(ab @ ab), 1e-12), 0.0, 1.0)
        dist = np.minimum(dist, np.linalg.norm(xy - (a + t[:, None] * ab), axis=1))
        cross = ab[0] * (xy[:, 1] - a[1]) - ab[1] * (xy[:, 0] - a[0])
        inside &= (cross * (1.0 if area > 0 else -1.0)) >= 0
    return np.where(inside, dist, -dist)


def _points(flames) -> list:
    """The pool lights' points as arrays: a list of points, or one point, or None."""
    if flames is None:
        return []
    if len(flames) == 3 and all(isinstance(v, (int, float, np.floating)) for v in flames):
        flames = [flames]
    return [np.asarray(f, float) for f in flames]


def near_dist(co: np.ndarray, points: list) -> np.ndarray:
    """Each point's distance to the nearest of `points` (arrays); one point gives np.linalg.norm(co - f, axis=1)
    itself, so a room with one pool light measures as it always has."""
    if len(points) == 1:
        return np.linalg.norm(co - points[0], axis=1)
    return np.minimum.reduce([np.linalg.norm(co - f, axis=1) for f in points])


def patch_signed(patches, xy: np.ndarray) -> np.ndarray:
    """The signed distance to the union of the moon's patches: the maximum of the per-patch distances (positive
    inside one); one patch gives _poly_signed's array, none -1e9 everywhere."""
    if patches and len(patches[0]) and isinstance(patches[0][0], (int, float, np.floating)):
        patches = [patches]         # one polygon given as [(x, y), ...]
    patches = [q for q in (patches or ()) if q]
    if not patches:
        return np.full(len(xy), -1e9)
    if len(patches) == 1:
        return _poly_signed(patches[0], xy)
    return np.maximum.reduce([_poly_signed(q, xy) for q in patches])


def pool_level(pools: list, pct: float) -> float:
    """The exposure's pool: each pool light's shell vertices within the pool radius (a list of arrays a light), their
    `pct` percentile, the largest over the lights (the strongest pool sets E); one light gives the percentile of its
    pool as it always has, none the 0.05 the builder has always fallen back on."""
    best = None
    for arrs in pools:
        if not arrs:
            continue
        a_ = np.concatenate(arrs)
        if not a_.size:
            continue
        v = float(np.percentile(a_, pct))
        best = v if best is None else max(best, v)
    return best if best is not None else float(np.percentile(np.array([0.05]), pct))


def light_numbers(surf: dict, flame, boxes: list, patch: list | None) -> dict:
    """The room's light in a few numbers, from its shell's vertices as the viewer shows them. `surf`: {"Floor",
    "Wall_N", "Wall_E", "Wall_S", "Wall_W"} -> (positions N x 3, display luminance 0..255 of each vertex with its
    material's mean colour); `boxes`: the pieces' body boxes (a vertex behind or under one is left out); `patch`:
    the moon's patches (moon_patches; one polygon is read as one patch); `flame`: the pool lights' points (one point
    is read as one light). With several, "the flame" is the nearest of them and the patch their union.

    - candle_wall: the walls within 2 m of the flame, between 0.8 and 2.3 m: their median;
    - far_wall: the wall farthest from the flame, between 1.0 and 2.3 m: its median;
    - moon_patch: the floor inside the patch (6 cm in from its edge): its 75th percentile (the lit panes, not the
      glazing bars' shadows); floor_round: the floor 0.25 to 0.9 m outside the patch: its median;
    - dim_floor: the open floor more than 3 m from the flame and 0.9 m from the patch: its median.
    The same definitions measure every build (the first, the last and this one), whatever its arrangement."""
    fs = _points(flame)

    def clear(co):
        keep = np.ones(len(co), bool)
        for b in boxes:
            keep &= ~((co[:, 0] > b[0] - 0.05) & (co[:, 0] < b[3] + 0.05) & (co[:, 1] > b[1] - 0.05) &
                      (co[:, 1] < b[4] + 0.05) & (co[:, 2] > b[2] - 0.05) & (co[:, 2] < b[5] + 0.05))
        return keep

    out = {}
    walls = {k: v for k, v in surf.items() if k.startswith("Wall_")}
    if fs and walls:
        near, far = [], None
        for k, (co, y) in walls.items():
            ok = clear(co) & (co[:, 2] < 2.3)
            d = near_dist(co, fs)
            near.append(y[ok & (co[:, 2] > 0.8) & (d < 2.0)])
            dist_wall = float(np.median(near_dist(co[:, :2], [f[:2] for f in fs])))
            if far is None or dist_wall > far[0]:
                far = (dist_wall, k, y[ok & (co[:, 2] > 1.0)])
        near = np.concatenate(near)
        if len(near):
            out["candle_wall"] = round(float(np.median(near)), 1)
        if far is not None and len(far[2]):
            out["far_wall"], out["far_wall_is"] = round(float(np.median(far[2])), 1), far[1]
        if out.get("candle_wall") and out.get("far_wall"):
            out["far_over_candle"] = round(out["far_wall"] / out["candle_wall"], 3)
    if "Floor" in surf:
        co, y = surf["Floor"]
        ok = clear(co)
        sd = patch_signed(patch, co[:, :2])
        inner, ring = ok & (sd > 0.06), ok & (sd < -0.25) & (sd > -0.9)
        if inner.any() and ring.any():
            out["moon_patch"] = round(float(np.percentile(y[inner], 75)), 1)
            out["floor_round"] = round(float(np.median(y[ring])), 1)
            out["moon_over_floor"] = round(out["moon_patch"] / max(out["floor_round"], 1e-6), 3)
        dim = ok & (sd < -0.9)
        if fs:
            dim &= near_dist(co[:, :2], [f[:2] for f in fs]) > 3.0
        if dim.any():
            out["dim_floor"] = round(float(np.median(y[dim])), 1)
    return out


def face_rot(side: str) -> Matrix:
    """A rotation taking local +z to a wall's inward normal (for knobs and roses built along +z)."""
    nx, ny = _NORMALS[side]
    return Vector((0.0, 0.0, 1.0)).rotation_difference(Vector((nx, ny, 0.0))).to_matrix().to_4x4()


def upright_rot(side: str) -> Matrix:
    """A rotation about z taking local -y (a piece's front) to a wall's inward normal."""
    nx, ny = _NORMALS[side]
    return Matrix.Rotation(math.atan2(ny, nx) + math.pi / 2, 4, "Z")


def uv_box(ob, scale: float = 1.0) -> None:
    """Box-projected UVs (metres / scale) for a mesh built without them (the wb.MB pieces)."""
    me = ob.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uv = me.uv_layers[0]
    for p in me.polygons:
        n = p.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        a, c = [(1, 2), (0, 2), (0, 1)][ax]
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = (co[a] / scale, co[c] / scale)


# ---------------------------------------------------------------- the shell


def make_materials(fr: Frame) -> dict:
    """The shell's materials: the floor scan, the plaster detail (walls, ceiling, cornice, the window's paint), the
    joinery's grain, cloth, glass, metal, the flame, the snow."""
    cfg = CFG
    out = {}
    fl = cfg["floor"]
    floor_img = scan_image("T_floor", mib.mr.texture_path(fl["role"], "diff", res="1k"), 1024)
    m = scan_mean(floor_img)
    out["floor"] = RMat("M_floor", floor_img, fl["factor"], rough=0.6, albedo=tuple(m * np.array(fl["factor"])))
    pm = 0.82
    plaster = detail_image("T_plaster", mib.mr.texture_path("wall_plaster", "diff", res="1k"), 1024, gain=3.0,
                           mean=pm, mottle=0.08)
    for key, hexc, rough in (("wall", cfg["wall_colour"], 0.9), ("ceiling", cfg["ceiling_colour"], 0.95),
                             ("paint", cfg["paint_colour"], 0.5)):
        f = tuple(min(1.0, v / pm) for v in hex_lin(hexc))
        out[key] = RMat(f"M_{key}", plaster, f, rough=rough, albedo=tuple(v * pm for v in f))
    wood = detail_image("T_wood", mib.mr.texture_path("joinery", "diff", res="1k"), 512, gain=0.6, mean=0.85)
    f = tuple(min(1.0, v / 0.85) for v in hex_lin(cfg["wood_colour"]))
    out["wood"] = RMat("M_wood", wood, f, rough=0.45, spec=0.35, albedo=tuple(v * 0.85 for v in f))
    linen = detail_image("T_linen", mib.mr.texture_path("linen", "diff", res="1k"), 512, gain=1.4, mean=0.86)
    lc = cfg["look"]["linen"]
    out["linen"] = RMat("M_linen", linen, tuple(v / 0.86 for v in hex_lin(lc)), rough=0.9, kind="cloth",
                        albedo=hex_lin(lc))
    wool = detail_image("T_wool", mib.mr.texture_path("wool", "diff", res="1k"), 256, gain=0.6, mean=0.8)
    if not is_v2():
        cc = hex_lin(cfg["window"]["curtain_colour"])
        out["curtain"] = RMat("M_curtain", wool, tuple(min(1.0, v / 0.8) for v in cc), rough=0.95, kind="cloth",
                              albedo=cc)
    else:   # one curtain material a colour, the first window's M_curtain; none in a room with no curtains
        out["wool"] = wool
        for o in fr.openings:
            if o["kind"] == "window" and o["spec"].get("curtains"):
                curtain_mat(out, o["spec"]["curtain_colour"])
    cov_img = scan_image("T_coverlet", mib.mr.texture_path("coverlet", "diff", res="1k"), 512)
    cf = (1.0, 0.97, 0.9)
    out["coverlet"] = RMat("M_coverlet", cov_img, cf, rough=0.85, kind="cloth",
                           albedo=tuple(scan_mean(cov_img) * np.array(cf)))
    out["coverlet"].hot = (0.30, 0.42)   # a dark damask: half a metre from the flame its side read as a white plank
    black = tuple(cfg["look"]["black_cloth"])   # plain matte black cloth (the mirrors', the swag; no crepe)
    out["black"] = RMat("M_black_cloth", None, black, rough=1.0, kind="cloth", albedo=black)
    out["brass"] = RMat("M_brass", None, hex_lin("#8C6A32"), rough=0.4, albedo=hex_lin("#8C6A32"))
    out["iron"] = RMat("M_iron", None, (0.035, 0.034, 0.033), rough=0.5, albedo=(0.035, 0.034, 0.033))
    out["stone"] = RMat("M_stone", None, hex_lin("#7D7A72"), rough=0.9, albedo=hex_lin("#7D7A72"))
    snow = detail_image("T_snow", mib.mr.texture_path("snow", "diff", res="1k"), 512, gain=1.0, mean=0.9)
    out["snow"] = RMat("M_snow", snow, hex_lin("#E9EEF5"), rough=0.7, albedo=tuple(0.9 * v for v in hex_lin("#E9EEF5")))
    out["outwall"] = RMat("M_outside_wall", wood, hex_lin("#5A4E44"), rough=0.9, albedo=hex_lin("#4A4038"))
    out["pine"] = RMat("M_pine", None, hex_lin("#1E2A22"), rough=0.9, albedo=hex_lin("#1E2A22"))
    out["glass"] = RMat("M_glass", None, (1, 1, 1), kind="glass", alpha=0.10)
    out["flame"] = RMat("M_flame", None, (1, 1, 1), kind="emit")
    out["litwin"] = RMat("M_lit_window", None, (1, 1, 1), kind="emit")
    out["sky"] = RMat("M_sky", None, (1.0, 1.0, 1.0), kind="sky")
    return out


def curtain_mat(mt: dict, hexc: str):
    """A v2 window's curtain material by its colour: the first colour is M_curtain (the legacy name), each other
    M_curtain_<n>, made once."""
    tab = mt.setdefault("curtains", {})
    if hexc not in tab:
        cc = hex_lin(hexc)
        name = "M_curtain" if not tab else f"M_curtain_{len(tab) + 1}"
        tab[hexc] = RMat(name, mt["wool"], tuple(min(1.0, v / 0.8) for v in cc), rough=0.95, kind="cloth", albedo=cc)
        mt.setdefault("curtain", tab[hexc])
    return tab[hexc]


def grid_count(L: float, step: float) -> int:
    return max(1, int(round(L / step)))


def grid_levels(L: float, step: float, cuts=()) -> np.ndarray:
    """Grid lines 0..L about `step` apart with every cut in (0, L) among them (a regular line closer than 15 mm to a
    cut gives way to it), as fractions of L: a wall's quads then end exactly on its openings' edges."""
    n = grid_count(L, step)
    base = [L * i / n for i in range(n + 1)]
    cuts = sorted(c for c in cuts if 1e-6 < c < L - 1e-6)
    keep = [b for b in base if b in (base[0], base[-1]) or all(abs(b - c) > 0.015 for c in cuts)]
    return np.array(sorted(set(round(v, 6) for v in keep + cuts))) / L


def build_shell(fr: Frame, mt: dict) -> None:
    """The floor, the ceiling and the four walls' inner faces as 5 cm grids (10 cm on the ceiling) with the openings
    cut out; the trims."""
    H, step = fr.H, 0.05
    x0, x1, y0, y1 = fr.x0, fr.x1, fr.y0, fr.y1
    rep = 3.0 * CFG["floor"]["zoom"]      # old_wood_floor is a 3 m scan: the boards enlarged to about 16 cm
    b = Builder()
    wells = [m["flight"]["well"] for m in fr.markers if m.get("flight") and not m["flight"].get("up")]
    holes = [m["flight"]["well"] for m in fr.markers if m.get("flight") and m["flight"].get("up")]
    if not wells:
        b.quad_grid((x0, y0, 0.0), (x1 - x0, 0, 0), (0, y1 - y0, 0), grid_count(x1 - x0, step),
                    grid_count(y1 - y0, step), mt["floor"], uv_fn=lambda p: (p[1] / rep, p[0] / rep))
    else:
        # a stairs well (G12): the grid's lines run through its edges and its quads are left out
        us = grid_levels(x1 - x0, step, [v - x0 for w in wells for v in (w[0], w[2])])
        vs = grid_levels(y1 - y0, step, [v - y0 for w in wells for v in (w[1], w[3])])

        def in_well(i, j, us=us, vs=vs):
            xm, ym = x0 + (us[i] + us[i + 1]) / 2 * (x1 - x0), y0 + (vs[j] + vs[j + 1]) / 2 * (y1 - y0)
            return any(w[0] < xm < w[2] and w[1] < ym < w[3] for w in wells)

        b.quad_grid((x0, y0, 0.0), (x1 - x0, 0, 0), (0, y1 - y0, 0), 0, 0, mt["floor"],
                    uv_fn=lambda p: (p[1] / rep, p[0] / rep), skip=in_well, us=us, vs=vs)
    register(b.build(nm("Floor")), "shell", "floor")
    b = Builder()
    if not holes:
        b.quad_grid((x0, y0, H), (0, y1 - y0, 0), (x1 - x0, 0, 0), grid_count(y1 - y0, 0.1),
                    grid_count(x1 - x0, 0.1), mt["ceiling"], uv_fn=lambda p: (p[0] / 3.0, p[1] / 3.0))
    else:
        # a flight up's hole (G12): the ceiling grid's lines (y first, then x) run through its edges, its quads left out
        cu = grid_levels(y1 - y0, 0.1, [v - y0 for w in holes for v in (w[1], w[3])])
        cv = grid_levels(x1 - x0, 0.1, [v - x0 for w in holes for v in (w[0], w[2])])

        def in_hole(i, j, cu=cu, cv=cv):
            ym, xm = y0 + (cu[i] + cu[i + 1]) / 2 * (y1 - y0), x0 + (cv[j] + cv[j + 1]) / 2 * (x1 - x0)
            return any(w[0] < xm < w[2] and w[1] < ym < w[3] for w in holes)

        b.quad_grid((x0, y0, H), (0, y1 - y0, 0), (x1 - x0, 0, 0), 0, 0, mt["ceiling"],
                    uv_fn=lambda p: (p[0] / 3.0, p[1] / 3.0), skip=in_hole, us=cu, vs=cv)
    register(b.build(nm("Ceiling")), "shell", "ceiling")
    for side in ("S", "E", "N", "W"):
        (ox, oy), (dx, dy), _n, L = fr.wall_frame(side)
        spans = []
        for o in fr.openings:
            if o["side"] == side:
                sa, sb = sorted((fr.to_s(side, o["a"]), fr.to_s(side, o["b"])))
                spans.append((sa, sb, o.get("cut_z0", o["z0"]), o["z1"]))
        # the grid's lines run through every opening's edges, so the cut is the joinery's own opening (a 10 cm row
        # cut at the next line left a plaster band across the door head and under the window board)
        us = grid_levels(L, step, [v for sa, sb, _a, _b in spans for v in (sa, sb)])
        # ... and just clear of the trims: the wall's row behind the skirting, the picture rail or the cornice bakes
        # dark (it is covered), and at 10 cm rows that dark ran on as a band 10 cm wide into the wall beside the trim
        # (a trim given as null is not built, and its rows are not cut: R-S2)
        sk_, pr_, co_ = CFG.get("skirting"), CFG.get("picture_rail"), CFG.get("cornice")
        trim_z = ([sk_ + 0.006] if sk_ is not None else []) + \
            ([pr_ - 0.026, pr_ + 0.026] if pr_ is not None else []) + ([H - co_ - 0.008] if co_ is not None else [])
        vs = grid_levels(H, 0.1, [v for _a, _b, z0, z1 in spans for v in (z0, z1)] + trim_z)

        def skip(i, j, spans=spans, L=L, us=us, vs=vs):
            sm, zm = (us[i] + us[i + 1]) / 2 * L, (vs[j] + vs[j + 1]) / 2 * H
            return any(sa < sm < sb and z0 < zm < z1 for sa, sb, z0, z1 in spans)

        b = Builder()
        b.quad_grid((ox, oy, 0.0), (dx * L, dy * L, 0.0), (0.0, 0.0, H), 0, 0, mt["wall"], skip=skip, flip=True,
                    uv_fn=lambda p, dx=dx, dy=dy: ((p[0] * dx + p[1] * dy) / 3.0, p[2] / 3.0), us=us, vs=vs)
        register(b.build(nm(f"Wall_{side}")), "shell", f"wall_{side}")
    trims(fr, mt)


def _quad(b: Builder, pts, normal, mat, uv_axes) -> None:
    """One quad with its normal along `normal` (the points' order turned if it is not), UVs in metres on two axes."""
    P = [np.asarray(p, float) for p in pts]
    if float(np.dot(np.cross(P[1] - P[0], P[2] - P[0]), np.asarray(normal, float))) < 0:
        pts = pts[::-1]
    b.face([tuple(map(float, p)) for p in pts], [(p[uv_axes[0]], p[uv_axes[1]]) for p in pts], mat)


def build_flights(fr: Frame, mt: dict) -> list:
    """Every stairs opening's visible flight (G12, first part): its rows for the manifest."""
    return [build_flight(fr, mt, m, m["flight"]) for m in fr.markers if m.get("flight")]


def build_flight(fr: Frame, mt: dict, e: dict, fl: dict) -> dict:
    """A flight down from a well in the floor (the loader's flight_values): a tread and a riser a step from the well's
    head edge toward `dir`, on under the floor for `under` metres into the dark; the shaft lined in the wall's plaster
    with the floor's thickness (rf.FLOOR_T) in the joinery's wood at its edges and over the run under the floor; a
    balustrade on the well's open edges (a string on the boards, newels, balusters, a handrail). Two objects,
    `Stairs_<id>` and `StairRail_<id>`, of kind `stairs` (baked like a piece, out of the shell's exposure measures);
    the collision is the loader's one box over the well and the rail (collision()). A flight up is build_flight_up's."""
    if fl.get("up"):
        return build_flight_up(fr, mt, e, fl)
    x0, y0, x1, y1 = fl["well"]
    d, head, L = fl["dir"], fl["head"], fl["length"]
    steps, zb, FT = fl["steps"], fl["bottom"], rf.FLOOR_T
    run = steps[-1][1]
    LT, TOP = 0.03, -0.002          # the lining's thickness; its top just under the boards (never in their plane)
    along_x = d in ("E", "W")
    sg = 1.0 if d in ("N", "E") else -1.0
    a0, a1 = (y0, y1) if along_x else (x0, x1)
    wood, plaster = mt["wood"], mt["wall"]

    def W(u, c, z):                 # (u from the head edge, across, z) -> world
        return (head + sg * u, c, z) if along_x else (c, head + sg * u, z)

    def box(b, u0, u1, c0, c1, z0, z1, mat, vgrain=False):
        p, q = W(u0, c0, z0), W(u1, c1, z1)
        b.box(tuple(min(v) for v in zip(p, q)), tuple(max(v) for v in zip(p, q)), mat, vgrain=vgrain)

    fwd = W(1.0, 0.0, 0.0)
    nu = (fwd[0] - W(0.0, 0.0, 0.0)[0], fwd[1] - W(0.0, 0.0, 0.0)[1], 0.0)     # +u in the world
    uv_t = (0, 1)
    uv_r = (1, 2) if along_x else (0, 2)
    b = Builder()
    for i, (u0, u1, top) in enumerate(steps):
        _quad(b, [W(u0, a0, top), W(u1, a0, top), W(u1, a1, top), W(u0, a1, top)], (0, 0, 1), wood, uv_t)
        low = steps[i + 1][2] if i + 1 < len(steps) else zb
        _quad(b, [W(u1, a0, low), W(u1, a1, low), W(u1, a1, top), W(u1, a0, top)], nu, wood, uv_r)
    box(b, -LT, 0.0, a0 - LT, a1 + LT, zb, -FT, plaster)            # the head wall
    box(b, -LT, 0.0, a0 - LT, a1 + LT, -FT, TOP, wood)
    for c0, c1 in ((a0 - LT, a0), (a1, a1 + LT)):                   # the two side walls, on under the floor
        box(b, -LT, run + LT, c0, c1, zb, -FT, plaster)
        box(b, 0.0, L, c0, c1, -FT, TOP, wood)
    box(b, L, run + LT, a0, a1, -FT, TOP, wood)                     # the header and the floor's underside
    box(b, run, run + LT, a0, a1, zb, -FT, plaster)                 # the end of the run, in the dark
    box(b, -LT, run + LT, a0 - LT, a1 + LT, zb - 0.03, zb, plaster)  # the shaft's floor
    ob = b.build(nm("Stairs" + sfx(e["id"])))
    register(ob, "stairs", e["id"] + ":flight")
    # the balustrade: a string on the boards, a newel at each end and corner, balusters, a handrail
    r = Builder()
    rh, c, RO = fl["rail_h"], rf.RAIL_OUT / 2, rf.RAIL_OUT
    newels = {}
    for side in fl["rail"]:
        ew = side in ("E", "W")
        lo_side, hi_side = ("S", "N") if ew else ("W", "E")
        e0, e1 = (y0, y1) if ew else (x0, x1)
        off = {"E": x1 + c, "W": x0 - c, "N": y1 + c, "S": y0 - c}[side]

        def at(s_, off=off, ew=ew):
            return (off, s_) if ew else (s_, off)

        # each end: on to the outer face where another rail meets it (their newel on the corner), else a newel
        # inside the end (at a wall, or an open end)
        s0, n0 = (e0 - RO, e0 - c) if lo_side in fl["rail"] else (e0, e0 + c)
        s1, n1 = (e1 + RO, e1 + c) if hi_side in fl["rail"] else (e1, e1 - c)
        wx, wy = (c, 0.0) if ew else (0.0, c)
        for z0_, z1_ in ((0.0, 0.08), (rh - 0.05, rh)):           # the string on the boards, the handrail
            (ax, ay), (bx, by) = at(s0), at(s1)
            r.box((min(ax, bx) - wx, min(ay, by) - wy, z0_), (max(ax, bx) + wx, max(ay, by) + wy, z1_), wood)
        for s_ in (n0, n1):
            newels[tuple(round(v, 4) for v in at(s_))] = None
        n_b = max(1, int(round((n1 - n0) / 0.12)))
        for k in range(1, n_b):
            mx, my = at(n0 + (n1 - n0) * k / n_b)
            r.box((mx - 0.0175, my - 0.0175, 0.08), (mx + 0.0175, my + 0.0175, rh - 0.05), wood, vgrain=True)
    for (nx, ny) in newels:
        # a newel as wide as the rail (RAIL_OUT): the collision box's edge is its outer face
        r.box((nx - c, ny - c, 0.0), (nx + c, ny + c, rh + 0.06), wood, vgrain=True)
    rail = r.build(nm("StairRail" + sfx(e["id"]))) if fl["rail"] else None
    if rail is not None:
        register(rail, "stairs", e["id"] + ":rail")
    return dict(id=e["id"], steps=len(steps), bottom=zb, newels=len(newels), rail=list(fl["rail"]),
                box=list(fl["box"]))


def build_hatches(fr: Frame, mt: dict) -> list:
    """Every floor hatch's visible trap (G12, third part): its rows for the manifest (none in most rooms)."""
    return [build_hatch(fr, mt, m, m["hatch"]) for m in fr.markers if m.get("hatch")]


def build_hatch(fr: Frame, mt: dict, e: dict, hv: dict) -> dict:
    """A boarded trap hatch lying on the boards (the loader's hatch_values): a frame of the joinery's wood round the
    leaf, the leaf's planks laid along the hinge edge with dark gaps between them (an iron-dark underlay shows through),
    two iron strap hinges from the hinge edge across the planks with their knuckles on the frame, and an iron ring pull
    on its plate at the middle of the far edge. No hole: the floor runs on under it, and the walker steps on it to meet
    the portal (no collision of its own: its 3.4 cm stand under the capsule's foot). One object, `Hatch_<id>`, of kind
    `stairs` (baked like a piece)."""
    x0, y0, x1, y1 = hv["box"]
    F, h = hv["frame"], hv["hinge"]
    wood, iron = mt["wood"], mt["iron"]
    ZF, ZU, ZL, ZS = 0.016, 0.004, 0.024, 0.029      # the frame's top, the underlay's, the planks', the straps'
    GAP, KN = 0.008, 0.034                           # a gap between planks; a knuckle's top
    along_x = h in ("N", "S")                       # the hinge edge runs along x: the planks lie along x
    b = Builder()
    bb = b.box

    def box(lo, hi, mat, vgrain=False):      # nothing of the hatch is seen from below: no bottom faces
        bb(lo, hi, mat, vgrain=vgrain, skip=("bottom",))

    # the frame round the leaf
    box((x0 - F, y0 - F, 0.0), (x1 + F, y0, ZF), wood)
    box((x0 - F, y1, 0.0), (x1 + F, y1 + F, ZF), wood)
    box((x0 - F, y0, 0.0), (x0, y1, ZF), wood, vgrain=True)
    box((x1, y0, 0.0), (x1 + F, y1, ZF), wood, vgrain=True)
    # the underlay, then the planks along the hinge edge
    box((x0, y0, 0.0), (x1, y1, ZU), iron)
    c0, c1 = (y0, y1) if along_x else (x0, x1)       # across the planks
    n = max(2, int(round((c1 - c0) / 0.15)))
    pw = (c1 - c0 - (n - 1) * GAP) / n
    for k in range(n):
        a = c0 + k * (pw + GAP)
        if along_x:
            box((x0, a, ZU), (x1, a + pw, ZL), wood)
        else:
            box((a, y0, ZU), (a + pw, y1, ZL), wood, vgrain=True)
    # the strap hinges: across the planks from the hinge edge, at a fifth of the edge from each end
    e0, e1 = (x0, x1) if along_x else (y0, y1)       # along the hinge edge
    depth = 0.45 * (c1 - c0)
    SW = 0.05
    for t in (0.2, 0.8):
        m_ = e0 + t * (e1 - e0)
        if h == "E":
            box((x1 - depth, m_ - SW / 2, ZL), (x1, m_ + SW / 2, ZS), iron)
            box((x1 - 0.02, m_ - 0.04, 0.0), (x1 + F, m_ + 0.04, KN), iron)
        elif h == "W":
            box((x0, m_ - SW / 2, ZL), (x0 + depth, m_ + SW / 2, ZS), iron)
            box((x0 - F, m_ - 0.04, 0.0), (x0 + 0.02, m_ + 0.04, KN), iron)
        elif h == "N":
            box((m_ - SW / 2, y1 - depth, ZL), (m_ + SW / 2, y1, ZS), iron)
            box((m_ - 0.04, y1 - 0.02, 0.0), (m_ + 0.04, y1 + F, KN), iron)
        else:
            box((m_ - SW / 2, y0, ZL), (m_ + SW / 2, y0 + depth, ZS), iron)
            box((m_ - 0.04, y0 - F, 0.0), (m_ + 0.04, y0 + 0.02, KN), iron)
    # the ring pull at the middle of the far edge, 0.1 m in: its plate and a square ring lying flat
    mid = (e0 + e1) / 2
    far = {"E": (x0 + 0.1, mid), "W": (x1 - 0.1, mid), "N": (mid, y0 + 0.1), "S": (mid, y1 - 0.1)}[h]
    rx, ry = far
    box((rx - 0.03, ry - 0.03, ZL), (rx + 0.03, ry + 0.03, ZL + 0.004), iron)
    R, T_ = 0.05, 0.01
    for (ax, ay, bx, by) in ((-R, -R, R, -R + T_), (-R, R - T_, R, R), (-R, -R + T_, -R + T_, R - T_),
                             (R - T_, -R + T_, R, R - T_)):
        box((rx + ax, ry + ay, ZL), (rx + bx, ry + by, ZL + 0.008), iron)
    ob = b.build(nm("Hatch" + sfx(e["id"])))
    register(ob, "stairs", e["id"] + ":hatch")
    return dict(id=e["id"], state=hv["state"], planks=n, box=list(hv["box"]), outer=list(hv["outer"]))


CEIL_T = 0.2        # a flight up's hole: the ceiling's depth at its edges, in the joinery's wood (its joists)


def build_flight_up(fr: Frame, mt: dict, e: dict, fl: dict) -> dict:
    """A flight up into a hole in the ceiling (G12, second part; the loader's _flight_up): a tread and a riser a step
    from the base toward `dir`, under the ceiling, through the hole and on above it for `over` metres into the dark;
    each open side closed down to the floor by a stepped string in the joinery's wood, and the flight's end under the
    hole's far edge by a plaster panel (the space under the stairs is shut); above the ceiling a shaft lined in the
    wall's plaster with the ceiling's depth (CEIL_T) in wood at the hole's edges, a floor over the ceiling past the
    hole and a cap at `top`. One object, `Stairs_<id>`, of kind `stairs`; the collision is the loader's one box over
    the flight's run under the ceiling, floor to ceiling (collision())."""
    x0, y0, x1, y1 = fl["well"]
    d, base, near, far = fl["dir"], fl["base"], fl["near"], fl["far"]
    steps, H, zt = fl["steps"], fr.H, fl["top"]
    run = steps[-1][1]
    LT, e_ = 0.03, 1e-6
    along_x = d in ("E", "W")
    sg = 1.0 if d in ("N", "E") else -1.0
    a0, a1 = (y0, y1) if along_x else (x0, x1)
    lo_side, hi_side = ("S", "N") if along_x else ("W", "E")
    wood, plaster = mt["wood"], mt["wall"]

    def W(u, c, z):                 # (u from the base, across, z) -> world
        return (base + sg * u, c, z) if along_x else (c, base + sg * u, z)

    def box(b, u0, u1, c0, c1, z0, z1, mat, vgrain=False):
        p_, q_ = W(u0, c0, z0), W(u1, c1, z1)
        b.box(tuple(min(v) for v in zip(p_, q_)), tuple(max(v) for v in zip(p_, q_)), mat, vgrain=vgrain)

    o_ = W(0.0, 0.0, 0.0)
    f_ = W(1.0, 0.0, 0.0)
    nu = (f_[0] - o_[0], f_[1] - o_[1], 0.0)                         # +u in the world
    back = (-nu[0], -nu[1], 0.0)
    across = (0.0, 1.0, 0.0) if along_x else (1.0, 0.0, 0.0)
    uv_t = (0, 1)
    uv_r = (1, 2) if along_x else (0, 2)
    uv_s = (0, 2) if along_x else (1, 2)
    base_wall = {"N": fr.y0, "S": fr.y1, "E": fr.x0, "W": fr.x1}[d]
    b = Builder()
    prev = 0.0
    for i, (u0, u1, top) in enumerate(steps):
        _quad(b, [W(u0, a0, top), W(u1, a0, top), W(u1, a1, top), W(u0, a1, top)], (0, 0, 1), wood, uv_t)
        if not (i == 0 and abs(base - base_wall) < e_):             # the first riser on a wall is the wall
            _quad(b, [W(u0, a0, prev), W(u0, a1, prev), W(u0, a1, top), W(u0, a0, top)], back, wood, uv_r)
        prev = top
        if u0 < far - e_:           # the strings: each open side shut from the floor to the tread, under the ceiling
            ua, zb_ = min(u1, far), min(top, H)
            for c, side, sgn in ((a0, lo_side, -1.0), (a1, hi_side, 1.0)):
                if side in fl["on_wall"]:
                    continue
                out = (sgn * across[0], sgn * across[1], 0.0)
                _quad(b, [W(u0, c, 0.0), W(ua, c, 0.0), W(ua, c, zb_), W(u0, c, zb_)], out, wood, uv_s)
    # the end of the run under the ceiling: from the floor to the tread that ends at the hole's far edge
    under_top = max([t for (u0, u1, t) in steps if u1 <= far + e_] or [0.0])
    _quad(b, [W(far, a0, 0.0), W(far, a1, 0.0), W(far, a1, under_top), W(far, a0, under_top)], nu, plaster, uv_r)
    # the shaft above the ceiling
    box(b, near - LT, near, a0 - LT, a1 + LT, H, H + CEIL_T, wood)                # the hole's head edge, its joists
    box(b, near - LT, near, a0 - LT, a1 + LT, H + CEIL_T, zt, plaster)
    for c0, c1 in ((a0 - LT, a0), (a1, a1 + LT)):                                 # the two side walls
        box(b, near, far, c0, c1, H, H + CEIL_T, wood)
        box(b, near, run + LT, c0, c1, H + CEIL_T, zt, plaster)
        box(b, far, run + LT, c0, c1, H, H + CEIL_T, plaster)
    box(b, run, run + LT, a0, a1, H, zt, plaster)                                 # the end of the run, in the dark
    box(b, far, run, a0, a1, H + 0.005, H + 0.035, plaster)                       # the floor over the ceiling
    box(b, near - LT, run + LT, a0 - LT, a1 + LT, zt, zt + 0.03, plaster)         # the cap
    ob = b.build(nm("Stairs" + sfx(e["id"])))
    register(ob, "stairs", e["id"] + ":flight")
    return dict(id=e["id"], up=True, steps=len(steps), top=zt, rail=[], box=list(fl["box"]))


def trims(fr: Frame, mt: dict) -> None:
    """Skirting (broken at every door), the picture rail and the cornice, swept round the room; a trim given as null
    is not built."""
    H = fr.H
    x0, x1, y0, y1 = fr.x0, fr.x1, fr.y0, fr.y1
    loop = [(x0, y0, 0.0), (x1, y0, 0.0), (x1, y1, 0.0), (x0, y1, 0.0)]
    sk = CFG.get("skirting")
    doors = [o for o in fr.openings if o["kind"] == "door"]
    if sk is not None:
        skirting = skirting_profile(sk)
        b = Builder()
        if doors:
            for path in skirting_runs(fr, doors):
                b.sweep(skirting, path, mt["wood"], uv_scale=2.0, step=0.08)
        else:
            b.sweep(skirting, loop, mt["wood"], closed=True, uv_scale=2.0, step=0.05)
        register(b.build(nm("Skirting")), "trim", "skirting")
    pr = CFG.get("picture_rail")
    if pr is not None:
        rail = rail_profile(pr)
        b = Builder()
        b.sweep(rail, loop, mt["wood"], closed=True, uv_scale=2.0, step=0.2)
        register(b.build(nm("PictureRail")), "trim", "picture_rail")
    c = CFG.get("cornice")
    if c is None:
        return
    prof = cornice_profile(c, H)
    b = Builder()
    b.sweep(prof, loop, mt["ceiling"], closed=True, uv_scale=3.0, step=0.2)
    register(b.build(nm("Cornice")), "trim", "cornice")


SKIRT_BREAK = 0.115     # the skirting stops this far beyond a door's opening (its architrave, 0.095 m, and 2 cm)


def skirting_profile(sk: float) -> list:
    """The skirting's profile [(out, up), ...], `sk` metres high (trims, wall_trims)."""
    return [(0.0, 0.0), (0.022, 0.0), (0.022, sk - 0.05), (0.018, sk - 0.03), (0.013, sk - 0.012),
            (0.006, sk - 0.002), (0.0, sk)]


def rail_profile(pr: float) -> list:
    """The picture rail's profile, centred `pr` metres up."""
    return [(0.0, pr - 0.02), (0.010, pr - 0.02), (0.016, pr - 0.012), (0.021, pr), (0.018, pr + 0.012),
            (0.010, pr + 0.018), (0.0, pr + 0.02)]


def cornice_profile(c: float, H: float) -> list:
    """The cornice's profile, `c` metres deep and down from the ceiling at H."""
    prof = [(0.0, H - c), (0.012, H - c), (0.016, H - c + 0.012), (0.028, H - c + 0.022)]
    r = c - 0.05
    for i in range(1, 6):
        a = math.pi / 2 * i / 5
        prof.append((0.028 + r * math.sin(a), H - c + 0.022 + r * (1.0 - math.cos(a))))
    prof += [(c - 0.012, H - 0.012), (c, H - 0.012), (c, H)]
    return prof


def skirting_runs(fr: Frame, doors: list) -> list:
    """The skirting's runs: the loop round the room's walls (S, E, N, W, the room on the left) cut at every door, each
    run from one door's far end to the next door's near end with the corners it passes. One door gives the one path
    the builder has always swept (its end, the four corners from its own wall's far corner, its start)."""
    x0, x1, y0, y1 = fr.x0, fr.x1, fr.y0, fr.y1
    order = ["S", "E", "N", "W"]
    ends = {"S": (x1, y0), "E": (x1, y1), "N": (x0, y1), "W": (x0, y0)}   # each wall's far corner along du
    length = {"S": x1 - x0, "E": y1 - y0, "N": x1 - x0, "W": y1 - y0}
    off, acc = {}, 0.0
    for side in order:
        off[side], acc = acc, acc + length[side]
    perim = acc
    breaks = []
    for o in doors:
        sa, sb = sorted((fr.to_s(o["side"], o["a"]), fr.to_s(o["side"], o["b"])))
        breaks.append((off[o["side"]] + sa, o["side"], sa, sb))
    breaks.sort()
    runs = []
    for i, (_p, side, _sa, sb) in enumerate(breaks):
        _q, side_n, sa_n, _sb = breaks[(i + 1) % len(breaks)]
        ps = off[side] + sb + SKIRT_BREAK
        pe = off[side_n] + sa_n - SKIRT_BREAK
        if i == len(breaks) - 1:    # the last door's run goes round to the first door (the one door's, to itself)
            pe += perim
        if pe - ps < 0.05:          # two doors' architraves all but meet: no run between them
            continue
        path = [fr.point(side, sb + SKIRT_BREAK, 0.0, 0.0)]
        for m in range(8):
            w = order[m % 4]
            c = off[w] + length[w] + perim * (m // 4)
            if ps < c < pe:
                cx, cy = ends[w]
                path.append((cx, cy, 0.0))
        path.append(fr.point(side_n, sa_n - SKIRT_BREAK, 0.0, 0.0))
        runs.append(path)
    return runs


# a barred window (G14, the cell's): the grate's square iron bars in the reveal's room end, the glass's plane into the
# wall and its iron frame
BARRED_BAR = 0.024          # an upright's square section
BARRED_FLAT = (0.05, 0.012)  # a cross bar's height and thickness
BARRED_GRATE_O = (-0.05, -0.074)   # the uprights' room and far faces into the wall (the cross bars on their room
# side, 3.8 cm in: nothing of the grate stands out of the wall face)
BARRED_GLASS_O = -0.2       # the glass's plane, into the wall
BARRED_FRAME = 0.03         # the light's iron frame on the glass, each side


def barred_cuts(a0: float, a1: float, n: int) -> list:
    """The centres of n bars spaced evenly across a0..a1 (n + 1 equal gaps)."""
    return [a0 + (a1 - a0) * (i + 1) / (n + 1) for i in range(n)]


def barred_one(fr: Frame, mt: dict, o: dict, w: dict, suffix: str) -> dict:
    """A barred window (G14): a dressed stone surround proud of the wall face round the rectangular cut (its foot over
    the capsule's top, R-O16), the cut lined in stone from the surround's face back past the glass (the jambs, the
    soffit, the sill), a grate of square iron uprights and flat cross bars set into the lining at its room end, and a
    fixed light of glass in an iron frame further in. No sashes, curtains or swag. Names Window_<id> and
    WindowGlass_<id> as any v2 window; returns the same opening row (the moon comes through it)."""
    side = o["side"]
    sa, sb = sorted((fr.to_s(side, o["a"]), fr.to_s(side, o["b"])))
    s, h = o["z0"], o["z1"]
    stone, iron = mt["stone"], mt["iron"]
    go = BARRED_GLASS_O
    (_o, (dx, dy), (nx, ny), _L) = fr.wall_frame(side)
    inward = np.array((nx, ny, 0.0))
    along = np.array((dx, dy, 0.0))
    up = np.array((0.0, 0.0, 1.0))
    fw, ft, fb, pr = (rf.BARRED_SURROUND[k] for k in ("side", "head", "sill", "proud"))
    b = Builder()

    def F(q, want):                    # q: [(s, z)...] on the surround's face, facing `want`
        pts = [fr.point(side, a, pr, z) for a, z in q]
        _face_toward(b, pts, [(a / 0.5, z / 0.5) for a, z in q], stone, want)

    # the surround's face: the band under the sill, the band over the head, the two jambs' strips
    F([(sa - fw, s - fb), (sb + fw, s - fb), (sb + fw, s), (sa - fw, s)], inward)
    F([(sa - fw, h), (sb + fw, h), (sb + fw, h + ft), (sa - fw, h + ft)], inward)
    F([(sa - fw, s), (sa, s), (sa, h), (sa - fw, h)], inward)
    F([(sb, s), (sb + fw, s), (sb + fw, h), (sb, h)], inward)
    # its outer edges, from the wall face to its face
    for q, want in (([(sa - fw, s - fb), (sb + fw, s - fb)], -up), ([(sa - fw, h + ft), (sb + fw, h + ft)], up),
                    ([(sa - fw, s - fb), (sa - fw, h + ft)], -along), ([(sb + fw, s - fb), (sb + fw, h + ft)], along)):
        (a0, z0), (a1, z1) = q
        pts = [fr.point(side, a0, 0.0, z0), fr.point(side, a1, 0.0, z1), fr.point(side, a1, pr, z1),
               fr.point(side, a0, pr, z0)]
        _face_toward(b, pts, [(0, 0), (1, 0), (1, 0.04), (0, 0.04)], stone, want)
    # the stone lining round the cut (its foot the wall cut's, 1.6 cm under the sill), from the surround's face back
    # past the glass, facing the opening's middle
    sl = o.get("cut_z0", s)
    line = [(sa, sl), (sb, sl), (sb, h), (sa, h)]
    mid = ((sa + sb) / 2, (s + h) / 2)
    for k in range(4):
        (a0, z0), (a1, z1) = line[k], line[(k + 1) % 4]
        want = along * (mid[0] - (a0 + a1) / 2) + up * (mid[1] - (z0 + z1) / 2)
        L = math.hypot(a1 - a0, z1 - z0)
        pts = [fr.point(side, a0, pr, z0), fr.point(side, a1, pr, z1), fr.point(side, a1, go - 0.04, z1),
               fr.point(side, a0, go - 0.04, z0)]
        _face_toward(b, pts, [(0, 0), (L / 0.5, 0), (L / 0.5, 0.5), (0, 0.5)], stone, want)
    # the grate: the uprights from the sill to the soffit, the flat cross bars across them on the room side
    nu, nc = w["bars"]
    g0, g1 = BARRED_GRATE_O
    hb = BARRED_BAR / 2
    for c in barred_cuts(sa, sb, nu):
        wall_box(b, fr, side, c - hb, c + hb, g1, g1 + BARRED_BAR, sl, h, iron)
    fh, ft = BARRED_FLAT
    for z in barred_cuts(s, h, nc):
        wall_box(b, fr, side, sa, sb, g0, g0 + ft, z - fh / 2, z + fh / 2, iron)
    # the light's iron frame on the glass's room side
    f = BARRED_FRAME
    for a0, a1, z0, z1 in ((sa, sb, sl, s + f), (sa, sb, h - f, h), (sa, sa + f, s + f, h - f),
                           (sb - f, sb, s + f, h - f)):
        wall_box(b, fr, side, a0, a1, go, go + 0.02, z0, z1, iron)
    register(b.build(nm("Window" + suffix)), "window", o["id"])
    g = Builder()
    pts = [fr.point(side, sa + f, go, s + f), fr.point(side, sb - f, go, s + f), fr.point(side, sb - f, go, h - f),
           fr.point(side, sa + f, go, h - f)]
    _face_toward(g, pts, [(0, 0), (1, 0), (1, 1), (0, 1)], mt["glass"], inward)
    gl = g.build(nm("WindowGlass" + suffix))
    register(gl, "glass", o["id"] + ":glass")
    return dict(id=o["id"], side=side, sa=sa, sb=sb, sill=s, head=h, glass_o=go,
                centre=fr.point(side, (sa + sb) / 2, go, (s + h) / 2), outside=w.get("outside", "sky"))


def wall_box(b: Builder, fr: Frame, side: str, s0: float, s1: float, o0: float, o1: float, z0: float, z1: float,
             mat, uv_scale: float = 2.0, skip=(), vgrain: bool | None = None) -> None:
    """A box given in a wall's own terms (s along it, o into the room from its face, z up); a wood's grain runs
    along its longer side (vertical on a tall member) unless `vgrain` says."""
    P = [np.array(fr.point(side, s, o, z)) for s in (s0, s1) for o in (o0, o1) for z in (z0, z1)]
    if vgrain is None:
        vgrain = (z1 - z0) > abs(s1 - s0)
    b.box(tuple(np.min(P, 0)), tuple(np.max(P, 0)), mat, uv_scale=uv_scale, skip=skip, vgrain=vgrain)


def architrave(b: Builder, fr: Frame, side: str, sa: float, sb: float, z0: float, z1: float, mat, w: float = 0.095,
               proud: float = 0.022, plinth: bool = True, foot: float | None = None) -> None:
    """A moulded architrave round an opening on the wall face: two legs and a head, each a back band and a proud
    bead on its outer edge; plinth blocks at a door's foot."""
    zf = z0 if foot is None else foot
    bottom = zf + (0.24 if plinth else 0.0)
    for leg in (0, 1):
        s_out, s_in = (sa - w, sa + 0.008) if leg == 0 else (sb - 0.008, sb + w)
        wall_box(b, fr, side, s_out, s_in, 0.0, proud * 0.7, bottom, z1 + w, mat)
        e0, e1 = (s_out, s_out + 0.026) if leg == 0 else (s_in - 0.026, s_in)
        wall_box(b, fr, side, e0, e1, proud * 0.7, proud, bottom, z1 + w - 0.026, mat)
        if plinth:
            wall_box(b, fr, side, s_out - 0.008, s_in + (0.004 if leg == 0 else 0.0), 0.0, proud + 0.008, zf,
                     bottom, mat)
    wall_box(b, fr, side, sa - w, sb + w, 0.0, proud * 0.7, z1 - 0.008, z1 + w, mat)
    wall_box(b, fr, side, sa - w, sb + w, proud * 0.7, proud, z1 + w - 0.026, z1 + w, mat)


# ---------------------------------------------------------------- the door


def build_door(fr: Frame, mt: dict) -> dict | None:
    """The legacy path's door (the file's `door`): its knob toward +s for E or N, as the builder has always read it;
    node names Door and DoorKnob."""
    doors = [o for o in fr.openings if o["kind"] == "door"]
    if not doors:
        return None
    return door_one(fr, mt, doors[0], CFG["door"].get("knob", "E") in ("E", "N"), "")


def build_doors(fr: Frame, mt: dict) -> list:
    """Every door of a v2 file, in the file's order: node names Door_<id> and DoorKnob_<id>; the knob at the end its
    `knob` letter names, seen from inside (the wall coordinate s runs E, N, W, S round the S, E, N, W walls, so the
    letter is the end at the higher s when it is that wall's: coupling 19 of the implementation plan)."""
    return [door_one(fr, mt, o, o["spec"]["knob"] == rf.KNOB_DEFAULT[o["side"]], sfx(o["id"]))
            for o in fr.openings if o["kind"] == "door"]


def door_one(fr: Frame, mt: dict, o: dict, knob_right: bool, suffix: str, what: str = "door") -> dict:
    """A door: lining, stops, threshold, architrave and a closed four-panel leaf with a brass knob, a key escutcheon
    and hinges; returns where the portal goes (the doorway's foot on the wall face). A door of style `steel` is
    steel_door's. With `what` "piece" (a door set into a wall-piece, G21: `fr` is then that face's FaceFrame) the two
    objects are not registered here and come back as `objs` (door, knob): the piece's builder registers them."""
    if (o.get("spec") or {}).get("style", "panel") == "steel":
        return steel_door(fr, mt, o, knob_right, suffix)
    side, T = o["side"], fr.T
    sa, sb = sorted((fr.to_s(side, o["a"]), fr.to_s(side, o["b"])))
    z1 = o["z1"]
    wood, brass, iron = mt["wood"], mt["brass"], mt["iron"]
    b = Builder()
    lt = 0.03   # the lining
    wall_box(b, fr, side, sa, sa + lt, -T, 0.0, 0.0, z1, wood)
    wall_box(b, fr, side, sb - lt, sb, -T, 0.0, 0.0, z1, wood)
    wall_box(b, fr, side, sa, sb, -T, 0.0, z1 - lt, z1, wood)
    so0, so1 = -0.095, -0.075     # the stops, behind the leaf
    wall_box(b, fr, side, sa + lt, sa + lt + 0.02, so0, so1, 0.0, z1 - lt, wood)
    wall_box(b, fr, side, sb - lt - 0.02, sb - lt, so0, so1, 0.0, z1 - lt, wood)
    wall_box(b, fr, side, sa + lt, sb - lt, so0, so1, z1 - lt - 0.02, z1 - lt, wood)
    # a threshold across the wall under the leaf: its gap shows the threshold, never the void beyond the floor
    wall_box(b, fr, side, sa + lt, sb - lt, -T, 0.0, -0.03, 0.006, wood)
    architrave(b, fr, side, sa, sb, 0.0, z1, wood)
    # the leaf: its room face 3 cm back from the wall face, 45 mm thick, 2 mm clear of the lining
    la, lb = sa + lt + 0.002, sb - lt - 0.002
    lz0, lz1 = 0.008, z1 - lt - 0.002
    f_room, f_back, rec = -0.03, -0.075, 0.014
    W = lb - la
    stile, top, lock, bot, mid = 0.115, 0.115, 0.20, 0.22, 0.10
    lock_z = lz0 + 0.86
    wall_box(b, fr, side, la, lb, f_back, f_room - rec, lz0, lz1, wood)     # the core behind the panels
    members = [(la, la + stile, lz0, lz1), (lb - stile, lb, lz0, lz1),
               (la + W / 2 - mid / 2, la + W / 2 + mid / 2, lz0 + bot, lz1 - top),
               (la + stile, lb - stile, lz0, lz0 + bot), (la + stile, lb - stile, lock_z, lock_z + lock),
               (la + stile, lb - stile, lz1 - top, lz1)]
    for s0, s1, za, zb in members:
        wall_box(b, fr, side, s0, s1, f_room - rec, f_room, za, zb, wood)
    panels = [(la + stile, la + W / 2 - mid / 2, lz0 + bot, lock_z), (la + W / 2 + mid / 2, lb - stile, lz0 + bot, lock_z),
              (la + stile, la + W / 2 - mid / 2, lock_z + lock, lz1 - top),
              (la + W / 2 + mid / 2, lb - stile, lock_z + lock, lz1 - top)]
    bev = 0.024
    for s0, s1, za, zb in panels:     # each panel: a sloped bevel down from the frame, a raised field
        o_top, o_low = f_room - 0.002, f_room - rec
        a0 = [fr.point(side, s0, o_top, za), fr.point(side, s1, o_top, za), fr.point(side, s1, o_top, zb),
              fr.point(side, s0, o_top, zb)]
        a1 = [fr.point(side, s0 + bev, o_low, za + bev), fr.point(side, s1 - bev, o_low, za + bev),
              fr.point(side, s1 - bev, o_low, zb - bev), fr.point(side, s0 + bev, o_low, zb - bev)]
        for i in range(4):
            j = (i + 1) % 4
            b.face([a0[i], a1[i], a1[j], a0[j]], [(0, 0), (0, 0.03), (0.5, 0.03), (0.5, 0)], wood)
        wall_box(b, fr, side, s0 + bev + 0.018, s1 - bev - 0.018, o_low, f_room - rec * 0.4, za + bev + 0.018,
                 zb - bev - 0.018, wood)
    ks = (lb - 0.07) if knob_right else (la + 0.07)
    hs = la if knob_right else lb
    kz = lock_z + lock / 2
    mb = wb.MB()
    rose = Matrix.Translation(Vector(fr.point(side, ks, f_room, kz))) @ face_rot(side)
    mb.cyl(0.026, 0.026, 0.008, n=16, M=rose, mat=brass.mat)
    mb.cyl(0.008, 0.008, 0.045, n=10, M=rose @ Matrix.Translation((0, 0, 0.008)), mat=brass.mat)
    mb.sphere(0.027, 0.027, 0.024, nu=16, nv=10, M=rose @ Matrix.Translation((0, 0, 0.07)), mat=brass.mat)
    esc = Matrix.Translation(Vector(fr.point(side, ks, f_room, kz - 0.11))) @ face_rot(side)
    mb.cyl(0.016, 0.016, 0.004, n=14, M=esc, mat=brass.mat)
    mb.box(0.006, 0.018, 0.003, M=esc @ Matrix.Translation((0, 0, 0.004)), mat=iron.mat, base=True)
    for hz in (lz0 + 0.24, lz1 - 0.25):
        p = fr.point(side, hs + (0.004 if hs == la else -0.004), f_room + 0.002, hz)
        mb.box(0.010, 0.006, 0.10, M=Matrix.Translation(Vector(p)) @ upright_rot(side), mat=iron.mat)
    door = b.build(nm("Door" + suffix))
    if what == "door":
        register(door, "door", o["id"])
    hw = mb.build(nm("DoorKnob" + suffix), col="room")
    if hw is not None:
        uv_box(hw, 0.2)
        if what == "door":
            register(hw, "door", o["id"] + ":furniture")

    # what of the door stands proud of the wall's face, for the collision (the wall's own slab is flat across the
    # doorway, and the capsule walked 6.4 cm into the brass knob): the architrave's two legs and the knob. Each box
    # starts 5 cm inside the wall's slab (one solid with it) and stops at the joinery's own face; the knob's is as
    # tall as the knob (the capsule's side meets it, nothing can be stepped on)
    def cbox(s0, s1, o0, o1, z0, z1_):
        pts = [np.array(fr.point(side, s_, o_, z_)) for s_ in (s0, s1) for o_ in (o0, o1) for z_ in (z0, z1_)]
        return tuple(round(float(v), 4) for v in (*np.min(pts, 0), *np.max(pts, 0)))

    aw, proud = 0.095, 0.022      # architrave()'s own width and projection
    coll = [cbox(sa - aw, sa + 0.008, -0.05, proud + 0.004, 0.0, z1 + aw),
            cbox(sb - 0.008, sb + aw, -0.05, proud + 0.004, 0.0, z1 + aw),
            cbox(ks - 0.029, ks + 0.029, -0.05, f_room + 0.07 + 0.024 + 0.002, kz - 0.029, kz + 0.029)]
    out = dict(id=o["id"], side=side, sa=sa, sb=sb, foot=fr.point(side, (sa + sb) / 2, 0.0, 0.0), portal=o["portal"],
               knob=fr.point(side, ks, f_room + 0.09, kz), collision=coll)
    if what != "door":
        out["objs"] = (door, hw)
    return out


STEEL = "#74767A"   # a steel door's sheet (G13, crumb_cold): galvanised grey, green above red, so never lilac


def steel_door(fr: Frame, mt: dict, o: dict, knob_right: bool, suffix: str) -> dict:
    """A cold-room door (G13, crumb_cold): a pressed-steel lining, stops and sill plate, a flat steel face frame in
    place of the architrave, and a thick insulated leaf clad in sheet steel: a riveted border band 4 mm proud, a tall
    kick plate and a middle rib, two iron strap hinges with their knuckles at the hinge edge, and a lever latch on a
    back plate with its keeper on the frame. Node names as door_one's (Door_<id>, DoorKnob_<id>); M_steel is made on
    first use, so a room without a steel door builds exactly as before."""
    side, T = o["side"], fr.T
    sa, sb = sorted((fr.to_s(side, o["a"]), fr.to_s(side, o["b"])))
    z1 = o["z1"]
    iron = mt["iron"]
    steel = MATS[nm("M_steel")] if nm("M_steel") in MATS else \
        RMat("M_steel", None, hex_lin(STEEL), rough=0.45, albedo=hex_lin(STEEL))
    b = Builder()
    lt, fw, fp = 0.03, 0.07, 0.012     # the lining; the face frame's width and projection
    wall_box(b, fr, side, sa, sa + lt, -T, 0.0, 0.0, z1, steel)
    wall_box(b, fr, side, sb - lt, sb, -T, 0.0, 0.0, z1, steel)
    wall_box(b, fr, side, sa, sb, -T, 0.0, z1 - lt, z1, steel)
    so0, so1 = -0.12, -0.10       # the stops, behind the leaf
    wall_box(b, fr, side, sa + lt, sa + lt + 0.02, so0, so1, 0.0, z1 - lt, steel)
    wall_box(b, fr, side, sb - lt - 0.02, sb - lt, so0, so1, 0.0, z1 - lt, steel)
    wall_box(b, fr, side, sa + lt, sb - lt, so0, so1, z1 - lt - 0.02, z1 - lt, steel)
    wall_box(b, fr, side, sa + lt, sb - lt, -T, 0.0, -0.03, 0.008, steel)      # the sill plate under the leaf
    wall_box(b, fr, side, sa - fw, sa + 0.004, 0.0, fp, 0.0, z1 + fw, steel)    # the face frame: two legs, a head
    wall_box(b, fr, side, sb - 0.004, sb + fw, 0.0, fp, 0.0, z1 + fw, steel)
    wall_box(b, fr, side, sa + 0.004, sb - 0.004, 0.0, fp, z1 - 0.004, z1 + fw, steel)
    # the leaf: 9 cm thick, its room face 1 cm back from the wall face, 2 mm clear of the lining
    la, lb = sa + lt + 0.002, sb - lt - 0.002
    lz0, lz1 = 0.010, z1 - lt - 0.002
    f_room, f_back, band = -0.01, -0.10, 0.004
    wall_box(b, fr, side, la, lb, f_back, f_room, lz0, lz1, steel)
    bw, kick = 0.06, 0.25
    mid = lz0 + 1.30
    for s0, s1, za, zb in ((la, lb, lz1 - bw, lz1), (la, lb, lz0, lz0 + kick), (la, la + bw, lz0 + kick, lz1 - bw),
                           (lb - bw, lb, lz0 + kick, lz1 - bw), (la + bw, lb - bw, mid - 0.03, mid + 0.03)):
        wall_box(b, fr, side, s0, s1, f_room, f_room + band, za, zb, steel)
    mb = wb.MB()
    # rivets along the border band, every 20 cm or so
    rv = []
    n_s = max(2, int(round((lb - la - bw) / 0.2)))
    n_z = max(2, int(round((lz1 - bw / 2 - lz0 - kick) / 0.2)))
    for i in range(n_s + 1):
        s_ = la + bw / 2 + (lb - la - bw) * i / n_s
        rv += [(s_, lz1 - bw / 2), (s_, lz0 + kick - bw / 2)]
    for j in range(1, n_z):
        z_ = lz0 + kick - bw / 2 + (lz1 - bw / 2 - (lz0 + kick - bw / 2)) * j / n_z
        rv += [(la + bw / 2, z_), (lb - bw / 2, z_)]
    for s_, z_ in rv:
        M = Matrix.Translation(Vector(fr.point(side, s_, f_room + band, z_))) @ face_rot(side)
        mb.box(0.014, 0.014, 0.005, M=M, mat=steel.mat, base=True)
    # two iron strap hinges from the hinge edge across the leaf, their knuckles at the edge
    hs, dir_ = (la, 1.0) if knob_right else (lb, -1.0)
    for hz in (lz0 + 0.40, lz1 - 0.40):
        s_c = hs + dir_ * 0.24
        M = Matrix.Translation(Vector(fr.point(side, s_c, f_room, hz))) @ face_rot(side)   # on the leaf, over the band
        mb.box(0.46, 0.065, 0.012, M=M, mat=iron.mat, base=True) if side in ("N", "S") else \
            mb.box(0.065, 0.46, 0.012, M=M, mat=iron.mat, base=True)
        kn = Matrix.Translation(Vector(fr.point(side, hs - dir_ * 0.004, f_room + 0.006, hz - 0.08)))
        mb.cyl(0.018, 0.018, 0.16, n=12, M=kn, mat=iron.mat)
    # the lever latch: a back plate, a boss and a lever toward the hinge side; the keeper on the frame
    ks = (lb - 0.09) if knob_right else (la + 0.09)
    kz = lz0 + 1.0
    M = Matrix.Translation(Vector(fr.point(side, ks, f_room + band, kz))) @ face_rot(side)
    pz0, pz1 = kz - 0.13, kz + 0.13
    wall_box(b, fr, side, ks - 0.035, ks + 0.035, f_room + band, f_room + band + 0.012, pz0, pz1, iron)
    mb.cyl(0.022, 0.022, 0.05, n=14, M=M @ Matrix.Translation((0.0, 0.0, 0.012)), mat=iron.mat)
    o_l = f_room + band + 0.012 + 0.05
    pa_, pb_ = Vector(fr.point(side, ks, o_l, kz)), Vector(fr.point(side, ks - dir_ * 0.22, o_l, kz))
    mb.tube([pa_, pb_], 0.014, n=10, mat=iron.mat)
    ke = sb + 0.035 if knob_right else sa - 0.035
    wall_box(b, fr, side, ke - 0.025, ke + 0.025, fp, fp + 0.035, kz - 0.07, kz + 0.07, iron)
    door = b.build(nm("Door" + suffix))
    register(door, "door", o["id"])
    hw = mb.build(nm("DoorKnob" + suffix), col="room")
    if hw is not None:
        uv_box(hw, 0.2)
        register(hw, "door", o["id"] + ":furniture")

    def cbox(s0, s1, o0, o1, z0, z1_):
        pts = [np.array(fr.point(side, s_, o_, z_)) for s_ in (s0, s1) for o_ in (o0, o1) for z_ in (z0, z1_)]
        return tuple(round(float(v), 4) for v in (*np.min(pts, 0), *np.max(pts, 0)))

    # what stands proud of the wall's face, for the collision (as door_one's): the face frame's legs with the keeper,
    # and the latch with its lever (the capsule's side meets it, nothing can be stepped on)
    lo_s, hi_s = sorted((ks, ks - dir_ * 0.22))
    coll = [cbox(sa - fw, sa + 0.008, -0.05, fp + 0.04, 0.0, z1 + fw),
            cbox(sb - 0.008, sb + fw, -0.05, fp + 0.04, 0.0, z1 + fw),
            cbox(lo_s - 0.036, hi_s + 0.036, -0.05, o_l + 0.016, pz0, pz1)]
    return dict(id=o["id"], side=side, sa=sa, sb=sb, foot=fr.point(side, (sa + sb) / 2, 0.0, 0.0), portal=o["portal"],
                knob=fr.point(side, ks, o_l, kz), collision=coll)


# ---------------------------------------------------------------- the window


def build_window(fr: Frame, mt: dict) -> dict | None:
    """The legacy path's window (the file's `window`): node names Window, WindowGlass, SillSnow, WindowArchitrave,
    Curtains, CurtainRod, Swag."""
    wins = [o for o in fr.openings if o["kind"] == "window"]
    if not wins:
        return None
    return window_one(fr, mt, wins[0], CFG["window"], "", mt["curtain"])


def build_windows(fr: Frame, mt: dict) -> list:
    """Every window of a v2 file, in the file's order, each with its own numbers and curtains: node names
    Window_<id> and the rest with the same suffix; ids <part>_<opening id>."""
    out = []
    lit = {o["id"] for o in moon_windows(fr)}       # a lancet's glass is brighter where the moon comes through it
    for o in fr.openings:
        if o["kind"] != "window":
            continue
        w = o["spec"]
        if w.get("style") == "lancet":
            out.append(lancet_one(fr, mt, o, w, sfx(o["id"]), o["id"] in lit))
            continue
        if w.get("style") == "barred":
            out.append(barred_one(fr, mt, o, w, sfx(o["id"])))
            continue
        cm = curtain_mat(mt, w["curtain_colour"]) if w.get("curtains") else None
        out.append(window_one(fr, mt, o, w, sfx(o["id"]), cm))
    return out


# a lancet's stained glass (G14, the chapel): each colour shown at its linear value times this level (scene-linear
# display, as emit_display), brighter in a window a moon light names; and the glass's alpha (stained glass at night
# lets little of the sky through)
LANCET_LEVEL = {True: 0.45, False: 0.18}
LANCET_ALPHA = 0.9
LANCET_SURROUND = dict(side=0.1, head=0.11, sill=0.2, proud=0.02)   # the dressed stone round it on the wall face
LANCET_GLASS_O = -0.2       # the glass's plane, into the wall


def lancet_glass_mat(mt: dict, hexc: str, lit: bool):
    """A lancet's glass of one colour, lit by the moon or dark: M_glass_lancet_<n>, made once each."""
    tab = mt.setdefault("lancet_glass", {})
    key = (hexc.upper(), bool(lit))
    if key not in tab:
        emit = tuple(v * LANCET_LEVEL[bool(lit)] for v in hex_lin(hexc))
        tab[key] = RMat(f"M_glass_lancet_{len(tab) + 1}", None, (1, 1, 1), kind="glass", alpha=LANCET_ALPHA, emit=emit)
    return tab[key]


def lancet_outline(sa: float, sb: float, s: float, zs: float, h: float, n: int = 12) -> list:
    """A lancet's outline in its wall's (s, z), anticlockwise in (s, z): the sill, the right jamb, the right arc
    (centred on the left springing) up to the apex, the left arc (centred on the right springing) down to the left
    springing. Convex. The apex is (the middle, h) and the arcs spring at zs."""
    W, c = sb - sa, (sa + sb) / 2
    a1 = math.acos(min(1.0, (c - sa) / W))          # the apex's angle at either springing (60 degrees, equilateral)
    right = [(sa + W * math.cos(a1 * k / n), zs + W * math.sin(a1 * k / n)) for k in range(n + 1)]
    left = [(sb - W * math.cos(a1 * k / n), zs + W * math.sin(a1 * k / n)) for k in range(n, -1, -1)]
    right[-1] = left[0] = (c, h)
    return [(sa, s), (sb, s)] + right + left[1:]


def clip_convex(poly: list, clip: list) -> list:
    """Sutherland-Hodgman: a polygon in the plane clipped to a convex anticlockwise one."""
    out = list(poly)
    for i in range(len(clip)):
        (ax, ay), (bx, by) = clip[i], clip[(i + 1) % len(clip)]
        inp, out = out, []
        if not inp:
            break

        def inside(p, ax=ax, ay=ay, bx=bx, by=by):
            return (bx - ax) * (p[1] - ay) - (by - ay) * (p[0] - ax) >= -1e-12

        def cross(p, q, ax=ax, ay=ay, bx=bx, by=by):
            dx, dy = q[0] - p[0], q[1] - p[1]
            den = (bx - ax) * dy - (by - ay) * dx
            t = ((bx - ax) * (ay - p[1]) - (by - ay) * (ax - p[0])) / den if abs(den) > 1e-15 else 0.0
            return (p[0] + t * dx, p[1] + t * dy)

        for k in range(len(inp)):
            p, q = inp[k], inp[(k + 1) % len(inp)]
            if inside(q):
                if not inside(p):
                    out.append(cross(p, q))
                out.append(q)
            elif inside(p):
                out.append(cross(p, q))
    return out


def _face_toward(b: Builder, pts: list, uvs: list, mat, want) -> None:
    """A face whose normal points along `want` (its winding reversed when it does not)."""
    P = [np.array(p, float) for p in pts]
    n = np.zeros(3)
    for i in range(1, len(P) - 1):
        n += np.cross(P[i] - P[0], P[i + 1] - P[0])
    if float(np.dot(n, want)) < 0:
        pts, uvs = pts[::-1], uvs[::-1]
    b.face(pts, uvs, mat)


def lancet_one(fr: Frame, mt: dict, o: dict, w: dict, suffix: str, lit: bool) -> dict:
    """A lancet (G14): the rectangular cut in the wall closed round a pointed outline by a dressed stone surround proud
    of the wall face (its spandrels fill the cut's top corners), a stone soffit from the surround's face back past the
    glass round the whole outline (the jambs, the arch, the sill), the leaded stained glass a grid of quarries clipped
    to the outline, each quarry a colour of `glass` (the border, the field colours in turn by row, the head's tracery
    over the springing), the lead cames across it on the room side. No sashes, curtains or swag. Names Window_<id> and
    WindowGlass_<id> as any v2 window; returns the same opening row (the moon comes through it)."""
    side = o["side"]
    sa, sb = sorted((fr.to_s(side, o["a"]), fr.to_s(side, o["b"])))
    s, h, zs = o["z0"], o["z1"], w["spring"]
    stone = mt["stone"]
    fw, ft, fb, pr = (LANCET_SURROUND[k] for k in ("side", "head", "sill", "proud"))
    go = LANCET_GLASS_O
    (_o, (dx, dy), (nx, ny), _L) = fr.wall_frame(side)
    inward = np.array((nx, ny, 0.0))
    along = np.array((dx, dy, 0.0))
    up = np.array((0.0, 0.0, 1.0))
    line = lancet_outline(sa, sb, s, zs, h)
    n_arc = (len(line) - 2) // 2
    right = line[2:3 + n_arc]                          # the right springing up to the apex
    left = line[2 + n_arc:]                            # the apex down to the left springing
    b = Builder()

    def F(q, want):                    # q: [(s, z)...] on the surround's face, facing `want`
        pts = [fr.point(side, a, pr, z) for a, z in q]
        _face_toward(b, pts, [(a / 0.5, z / 0.5) for a, z in q], stone, want)

    # the surround's face: the band under the sill, the band over the head, the jambs' strips, the arch's strips
    F([(sa - fw, s - fb), (sb + fw, s - fb), (sb + fw, s), (sa - fw, s)], inward)
    F([(sa - fw, h), (sb + fw, h), (sb + fw, h + ft), (sa - fw, h + ft)], inward)
    F([(sa - fw, s), (sa, s), (sa, zs), (sa - fw, zs)], inward)
    F([(sb, s), (sb + fw, s), (sb + fw, zs), (sb, zs)], inward)
    for (a0, z0), (a1, z1) in zip(right, right[1:]):
        F([(a0, z0), (sb + fw, z0), (sb + fw, z1), (a1, z1)], inward)
    for (a0, z0), (a1, z1) in zip(left, left[1:]):     # from the apex down: z falls
        F([(sa - fw, z1), (a1, z1), (a0, z0), (sa - fw, z0)], inward)
    # its outer edges, from the wall face to its face
    for q, want in (([(sa - fw, s - fb), (sb + fw, s - fb)], -up), ([(sa - fw, h + ft), (sb + fw, h + ft)], up),
                    ([(sa - fw, s - fb), (sa - fw, h + ft)], -along), ([(sb + fw, s - fb), (sb + fw, h + ft)], along)):
        (a0, z0), (a1, z1) = q
        pts = [fr.point(side, a0, 0.0, z0), fr.point(side, a1, 0.0, z1), fr.point(side, a1, pr, z1),
               fr.point(side, a0, pr, z0)]
        _face_toward(b, pts, [(0, 0), (1, 0), (1, 0.04), (0, 0.04)], stone, want)
    # the soffit round the outline, from the surround's face back past the glass, facing the opening's middle
    mid = ((sa + sb) / 2, (s + h) / 2)
    for k in range(len(line)):
        (a0, z0), (a1, z1) = line[k], line[(k + 1) % len(line)]
        want = along * (mid[0] - (a0 + a1) / 2) + up * (mid[1] - (z0 + z1) / 2)
        L = math.hypot(a1 - a0, z1 - z0)
        pts = [fr.point(side, a0, pr, z0), fr.point(side, a1, pr, z1), fr.point(side, a1, go - 0.04, z1),
               fr.point(side, a0, go - 0.04, z0)]
        _face_toward(b, pts, [(0, 0), (L / 0.5, 0), (L / 0.5, 0.5), (0, 0.5)], stone, want)
    # the lead cames on the room side of the glass: the grid's lines inside the outline
    nxg, nyg = w["panes"]
    iron = mt["iron"]
    W_ = sb - sa
    cw, c0, c1 = 0.014, go + 0.004, go + 0.014

    def span_z(a):                     # the outline's top over a point along the wall
        return min(h, zs + math.sqrt(max(0.0, W_ ** 2 - (a - sa) ** 2)), zs + math.sqrt(max(0.0, W_ ** 2 - (sb - a) ** 2)))

    def span_s(z):                     # the outline's two sides at a height
        if z <= zs:
            return sa, sb
        r = math.sqrt(max(0.0, W_ ** 2 - (z - zs) ** 2))
        return sb - r, sa + r

    for i in range(1, nxg):
        a = sa + W_ * i / nxg
        wall_box(b, fr, side, a - cw / 2, a + cw / 2, c0, c1, s, span_z(a) - 0.01, iron)
    for j in range(1, nyg):
        z = s + (h - s) * j / nyg
        l_, r_ = span_s(z + cw / 2)
        if r_ - l_ > 0.04:
            wall_box(b, fr, side, l_ + 0.01, r_ - 0.01, c0, c1, z - cw / 2, z + cw / 2, iron)
    register(b.build(nm("Window" + suffix)), "window", o["id"])
    # the stained glass: the quarries clipped to the outline, each its colour
    cols = w["glass"]
    g = Builder()
    for j in range(nyg):
        for i in range(nxg):
            q0, q1 = sa + W_ * i / nxg, sa + W_ * (i + 1) / nxg
            z0, z1 = s + (h - s) * j / nyg, s + (h - s) * (j + 1) / nyg
            cell = clip_convex([(q0, z0), (q1, z0), (q1, z1), (q0, z1)], line)
            if len(cell) < 3:
                continue
            if i in (0, nxg - 1) or j == 0:
                hexc = cols[0]
            elif (z0 + z1) / 2 > zs:
                hexc = cols[-1]
            else:
                hexc = cols[1 + (j - 1) % max(1, len(cols) - 2)]
            pts = [fr.point(side, a, go, z) for a, z in cell]
            _face_toward(g, pts, [((a - sa) / W_, (z - s) / (h - s)) for a, z in cell],
                         lancet_glass_mat(mt, hexc, lit), inward)
    gl = g.build(nm("WindowGlass" + suffix))
    register(gl, "glass", o["id"] + ":glass")
    return dict(id=o["id"], side=side, sa=sa, sb=sb, sill=s, head=h, glass_o=go,
                centre=fr.point(side, (sa + sb) / 2, go, (s + h) / 2), outside=w.get("outside", "sky"))


def window_one(fr: Frame, mt: dict, o: dict, w: dict, suffix: str, curtain) -> dict:
    """A window: plaster reveals, a painted box frame, two sashes with glazing bars and glass, a window board and
    apron, an architrave, a stone sill outside with snow on it, and the round-3 curtains, rod and black swag at first
    person's scale. Returns the opening (the moon comes through it)."""
    side, T = o["side"], fr.T
    tag = (lambda k: f"{k}_{o['id']}") if suffix else (lambda k: k)     # the parts' ids: v2 carries the opening's
    sa, sb = sorted((fr.to_s(side, o["a"]), fr.to_s(side, o["b"])))
    s, h = o["z0"], o["z1"]
    paint, wall, glass = mt["paint"], mt["wall"], mt["glass"]
    # depth into the wall (o < 0): the frame's room face at -0.16, its outer face at -0.28, the wall's outside at -T
    fo0, fo1 = -0.16, -0.27
    b = Builder()
    # the reveals: the two sides and the soffit, plaster, 5 cm grid
    nu = grid_count(-fo0, 0.05)
    nz = grid_count(h - s, 0.05)
    for ss, flip in ((sa, True), (sb, False)):       # the side at sa faces +s, the one at sb faces -s
        p0 = np.array(fr.point(side, ss, 0.0, s))
        p1 = np.array(fr.point(side, ss, fo0, s))
        b.quad_grid(tuple(p0), tuple(p1 - p0), (0, 0, h - s), nu, nz, wall, flip=flip,
                    uv_fn=lambda p: (p[0] / 3.0 + p[1] / 3.0, p[2] / 3.0))
    pa, pb = np.array(fr.point(side, sa, 0.0, h)), np.array(fr.point(side, sb, 0.0, h))
    pin = np.array(fr.point(side, sa, fo0, h))
    b.quad_grid(tuple(pa), tuple(pin - pa), tuple(pb - pa), nu, grid_count(sb - sa, 0.05), wall, flip=True,
                uv_fn=lambda p: (p[0] / 3.0, p[1] / 3.0))
    # the window board (sill) inside, its apron, the box frame
    wall_box(b, fr, side, sa - 0.07, sb + 0.07, fo0, 0.045, s - 0.032, s, paint)
    wall_box(b, fr, side, sa - 0.03, sb + 0.03, 0.0, 0.016, s - 0.17, s - 0.032, paint)
    fw = 0.05
    wall_box(b, fr, side, sa, sa + fw, fo1, fo0, s, h, paint)
    wall_box(b, fr, side, sb - fw, sb, fo1, fo0, s, h, paint)
    wall_box(b, fr, side, sa, sb, fo1, fo0, h - fw, h, paint)
    wall_box(b, fr, side, sa, sb, fo1, fo0, s, s + 0.012, paint)
    # the sashes: the lower one on the inner track, the upper on the outer; stiles, rails, a glazing bar per sash
    nx, ny = w["panes"]
    ia, ib, iz0, iz1 = sa + fw, sb - fw, s + 0.012, h - fw
    mid = (iz0 + iz1) / 2
    tracks = {"lower": (-0.175, -0.21), "upper": (-0.218, -0.253)}
    sashes = {"lower": (iz0, mid + 0.018), "upper": (mid - 0.018, iz1)}
    panes = []
    for key in ("lower", "upper"):
        t0, t1 = tracks[key]
        z0, z1 = sashes[key]
        st, top, bot = 0.045, (0.032 if key == "lower" else 0.05), (0.065 if key == "lower" else 0.032)
        wall_box(b, fr, side, ia, ia + st, t1, t0, z0, z1, paint)
        wall_box(b, fr, side, ib - st, ib, t1, t0, z0, z1, paint)
        wall_box(b, fr, side, ia + st, ib - st, t1, t0, z0, z0 + bot, paint)
        wall_box(b, fr, side, ia + st, ib - st, t1, t0, z1 - top, z1, paint)
        bar = 0.022
        gx0, gx1, gz0, gz1 = ia + st, ib - st, z0 + bot, z1 - top
        for k in range(1, nx):
            c = gx0 + (gx1 - gx0) * k / nx
            wall_box(b, fr, side, c - bar / 2, c + bar / 2, t1 + 0.008, t0 - 0.006, gz0, gz1, paint)
        for k in range(1, max(1, ny // 2)):
            c = gz0 + (gz1 - gz0) * k / max(1, ny // 2)
            wall_box(b, fr, side, gx0, gx1, t1 + 0.008, t0 - 0.006, c - bar / 2, c + bar / 2, paint)
        tc = (t0 + t1) / 2
        for k in range(nx):
            c0 = gx0 + (gx1 - gx0) * k / nx + (bar / 2 if k else 0.0)
            c1 = gx0 + (gx1 - gx0) * (k + 1) / nx - (bar / 2 if k < nx - 1 else 0.0)
            panes.append((c0, c1, gz0, gz1, tc))
    # outside: the outer reveal round the frame, the stone sill with snow on it
    wall_box(b, fr, side, sa - 0.09, sb + 0.09, -T - 0.13, fo1, s - 0.07, s - 0.012, mt["stone"])
    register(b.build(nm("Window" + suffix)), "window", o["id"])
    g = Builder()
    for c0, c1, z0, z1, tc in panes:
        p = [fr.point(side, c0, tc, z0), fr.point(side, c1, tc, z0), fr.point(side, c1, tc, z1),
             fr.point(side, c0, tc, z1)]
        g.face(p, [(0, 0), (1, 0), (1, 1), (0, 1)], glass)
    gl = g.build(nm("WindowGlass" + suffix))
    register(gl, "glass", o["id"] + ":glass")
    # snow on the outer sill: a rounded ridge
    sn = Builder()
    n = 24
    for i in range(n):
        u0, u1 = i / n, (i + 1) / n
        for (ua, ub) in ((u0, u1),):
            sa_, sb_ = sa - 0.07 + (sb - sa + 0.14) * ua, sa - 0.07 + (sb - sa + 0.14) * ub
            prof = [(-T - 0.12, 0.0), (-T - 0.09, 0.022), (-T - 0.04, 0.034), (-T + 0.0, 0.03), (fo1 - 0.005, 0.012)]
            for k in range(len(prof) - 1):
                oa, za = prof[k]
                ob, zb = prof[k + 1]
                wob = 0.006 * math.sin(7.0 * ua + k)
                pts = [fr.point(side, sa_, oa, s - 0.012 + za + wob), fr.point(side, sb_, oa, s - 0.012 + za + wob),
                       fr.point(side, sb_, ob, s - 0.012 + zb + wob), fr.point(side, sa_, ob, s - 0.012 + zb + wob)]
                sn.face(pts, [(ua, k / 4), (ub, k / 4), (ub, (k + 1) / 4), (ua, (k + 1) / 4)], mt["snow"])
    register(sn.build(nm("SillSnow" + suffix), smooth=True), "outside", tag("sill_snow"))
    # the architrave, the curtains on their rod, the black swag
    a = Builder()
    architrave(a, fr, side, sa, sb, s, h, paint, plinth=False, foot=s - 0.032)
    register(a.build(nm("WindowArchitrave" + suffix)), "trim", tag("window_architrave"))
    curtains(fr, mt, side, sa, sb, s, h, w, curtain, suffix, tag)
    return dict(id=o["id"], side=side, sa=sa, sb=sb, sill=s, head=h, glass_o=-0.21,
                centre=fr.point(side, (sa + sb) / 2, -0.21, (s + h) / 2), outside=w.get("outside", "snow"))


def pleat_sheet(b: Builder, fr: Frame, side: str, s0: float, s1: float, out: float, z0: float, z1: float, mat,
                amp: float = 0.028, wave: float = 0.115, flare: float = 0.02, ds: float = 0.014, dz: float = 0.05,
                seed: float = 0.0) -> None:
    """A curtain hanging in pleats: a sheet along a wall from s0 to s1, `out` metres into the room, its folds a
    sine of `amp` metres every `wave`, flaring at the hem; normals into the room; UVs in metres."""
    nu, nv = grid_count(s1 - s0, ds), grid_count(z1 - z0, dz)
    rows = []
    for j in range(nv + 1):
        z = z0 + (z1 - z0) * j / nv
        hem = 1.0 + flare * (1.0 - j / nv) / 0.02 * 0.6
        row = []
        for i in range(nu + 1):
            sv = s0 + (s1 - s0) * i / nu
            ph = 2 * math.pi * (sv - s0) / wave + seed
            o = out + amp * hem * math.sin(ph) + 0.004 * math.sin(3.1 * z + 1.7 * ph)
            row.append((fr.point(side, sv, o, z), sv, z))
        rows.append(row)
    for j in range(nv):
        for i in range(nu):
            q = [rows[j][i], rows[j + 1][i], rows[j + 1][i + 1], rows[j][i + 1]]     # up, then along: inward
            b.face([p for p, _s, _z in q], [(sv / 0.27, z / 0.27) for _p, sv, z in q], mat)


def curtains(fr: Frame, mt: dict, side: str, sa: float, sb: float, s: float, h: float, w: dict, curtain=None,
             suffix: str = "", tag=lambda k: k) -> None:
    """A window's curtains (when it has them: `curtains`, the legacy window always), the rod and the black swag
    (`swag`); a window with neither has no rod."""
    rod_z, rod_o = w["rod"], 0.10
    if w.get("curtains", True):
        c = Builder()
        pleat_sheet(c, fr, side, sa - 0.10 - 0.36, sa + 0.03, rod_o - 0.01, 0.012, rod_z - 0.035, curtain, seed=0.4)
        pleat_sheet(c, fr, side, sb - 0.03, sb + 0.10 + 0.36, rod_o - 0.01, 0.012, rod_z - 0.035, curtain, seed=2.2)
        register(c.build(nm("Curtains" + suffix), smooth=True), "cloth", tag("curtains"))
    elif not w.get("swag"):
        return
    # the rod: a wooden pole on two brackets with ball finials
    mb = wb.MB()
    pa = Vector(fr.point(side, sa - 0.52, rod_o, rod_z))
    pb = Vector(fr.point(side, sb + 0.52, rod_o, rod_z))
    mb.tube([pa, pb], 0.016, n=12, mat=mt["wood"].mat)
    for p in (pa, pb):
        mb.sphere(0.032, 0.032, 0.032, nu=14, nv=8, M=Matrix.Translation(p), mat=mt["wood"].mat)
    for sv in (sa - 0.40, sb + 0.40):
        q0 = Vector(fr.point(side, sv, 0.0, rod_z))
        q1 = Vector(fr.point(side, sv, rod_o, rod_z))
        mb.tube([q0, q1], 0.010, n=8, mat=mt["brass"].mat)
    rod = mb.build(nm("CurtainRod" + suffix), col="room", smooth=True)
    uv_box(rod, 0.5)
    register(rod, "trim", tag("curtain_rod"))
    if not w.get("swag"):
        return
    # the swag: plain matte black cloth across the top, hung from both ends, sagging in the middle, bellied out
    sw = Builder()
    s0, s1 = sa - 0.16, sb + 0.16
    cols, rows = 36, 10
    drop_end, drop_mid = 0.20, 0.50
    grid = []
    for j in range(rows + 1):
        v = j / rows
        row = []
        for i in range(cols + 1):
            u = i / cols
            sag = drop_end + (drop_mid - drop_end) * math.sin(math.pi * u)
            o = rod_o + 0.035 + 0.05 * math.sin(math.pi * u) * v + 0.012 * math.sin(9.0 * math.pi * u) * (0.3 + v)
            z = rod_z + 0.03 - v * sag
            row.append((fr.point(side, s0 + (s1 - s0) * u, o, z), u, v))
        grid.append(row)
    for j in range(rows):
        for i in range(cols):
            q = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]]     # along, then down: inward
            sw.face([p for p, _u, _v in q], [(u * 2.0, v) for _p, u, v in q], mt["black"])
    register(sw.build(nm("Swag" + suffix), smooth=True), "cloth", tag("swag"))


# ---------------------------------------------------------------- the night outside


def look_sky() -> dict:
    with open(FINAL_LOOK, encoding="utf-8") as fh:
        return json.load(fh)


def moon_dir(cfg: dict, fr: Frame, side: str) -> Vector:
    """The unit vector toward the moon: `azimuth` degrees from straight out of the window wall toward the wall's
    +s side, at `elevation`; in a v2 file `bearing` (a compass angle) in its place: one Sun for the room."""
    if is_v2() and cfg.get("bearing") is not None:
        return Vector(rf.bearing_dir(cfg["bearing"], cfg["elevation"])).normalized()
    nx, ny = _NORMALS[side]
    out = Vector((-nx, -ny, 0.0))
    (_o, (dx, dy), _n, _L) = fr.wall_frame(side)
    along = Vector((dx, dy, 0.0))
    a, e = math.radians(cfg["azimuth"]), math.radians(cfg["elevation"])
    d = (out * math.cos(a) - along * math.sin(a)) * math.cos(e) + Vector((0.0, 0.0, math.sin(e)))
    return d.normalized()


def sky_colour(look: dict, d: Vector, moon: Vector) -> np.ndarray:
    """meshy_looks/final.json's sky as the viewer draws it (apps/walk/src/look.ts makeSky), plus a faint halo round
    the moon: horizon to zenith, the ground below; scene-linear."""
    s = look["sky"]
    up = max(d.z, 0.0)
    t = min(1.0, up / s["horizon_height"])
    t = t * t * (3 - 2 * t)
    col = np.array(s["horizon"]) * (1 - t) + np.array(s["zenith"]) * t
    if d.z < 0:
        g = min(1.0, -d.z / 0.06)
        col = col * (1 - g) + np.array(s["ground"]) * g
    halo = max(0.0, d.dot(moon))
    col = col + np.array(hex_lin("#7FA8FF")) * 0.05 * (halo ** 60) + np.array(look["moon"]["color"]) * 0.012 * (halo ** 8)
    return col


def build_outside(fr: Frame, mt: dict, win: dict, moon: Vector) -> dict:
    """The night outside the window: snow ground falling away to a far ridge, a post-and-rail fence, three snowed-in
    houses (one window lit), a pine line, the sky dome and the moon. Local frame: s along the window wall, d out
    from its outer face, z up (the outside ground at `ground`, the room's floor at 0: an upper floor)."""
    oc = CFG["outside"]
    side = win["side"]
    s0 = (win["sa"] + win["sb"]) / 2
    T = fr.T
    gz = oc["ground"]

    def P(u, d, z):
        return fr.point(side, s0 + u, -T - d, z)

    rng = np.random.default_rng(1893)
    made = {}
    # the ground: rows out from the wall, wider spacing far away, drifts and a far ridge
    ds = [0.0]
    while ds[-1] < 230.0:
        ds.append(ds[-1] + max(0.8, 0.08 * ds[-1]))
    us = np.linspace(-120.0, 120.0, 61)

    def ground_z(u, d):
        drift = 0.18 * math.sin(0.31 * u + 0.7) * math.sin(0.23 * d) + 0.10 * math.sin(0.11 * u - 0.05 * d)
        ridge = 22.0 * (1.0 / (1.0 + math.exp(-(d - 160.0) / 14.0))) * (0.75 + 0.25 * math.sin(0.021 * u + 1.3))
        return gz + drift + ridge

    b = Builder()
    for j in range(len(ds) - 1):
        for i in range(len(us) - 1):
            q = [(us[i], ds[j]), (us[i], ds[j + 1]), (us[i + 1], ds[j + 1]), (us[i + 1], ds[j])]
            pts = [P(u, d, ground_z(u, d)) for u, d in q]
            if side in ("N", "W"):
                pts, q = pts[::-1], q[::-1]
            b.face(pts, [(u / 2.0, d / 2.0) for u, d in q], mt["snow"])
    g = b.build(nm("Outside_Ground"))
    _fix_up(g)
    made["ground"] = register(g, "outside", "ground")
    # the fence: posts every 2 m, two rails, snow on the rails' tops (the wood's grain toned to weathered grey)
    fy = oc["fence_y"]
    fb = Builder()
    for u in np.arange(-30.0, 30.01, 2.0):
        zc = ground_z(u, fy)
        _obox(fb, P, u - 0.05, u + 0.05, fy - 0.05, fy + 0.05, zc - 0.2, zc + 1.15, mt["outwall"])
        _obox(fb, P, u - 0.06, u + 0.06, fy - 0.06, fy + 0.06, zc + 1.15, zc + 1.22, mt["snow"])
    for zr in (0.45, 0.95):
        for u in np.arange(-30.0, 29.99, 2.0):
            zc = ground_z(u + 1.0, fy)
            _obox(fb, P, u, u + 2.0, fy - 0.07, fy - 0.04, zc + zr - 0.05, zc + zr + 0.04, mt["outwall"])
            _obox(fb, P, u, u + 2.0, fy - 0.075, fy - 0.035, zc + zr + 0.04, zc + zr + 0.07, mt["snow"])
    made["fence"] = register(fb.build(nm("Outside_Fence")), "outside", "fence")
    if oc.get("meshy"):
        made.update(meshy_outside(fr, mt, win, P, ground_z, oc, rng))
        return outside_sky(fr, mt, win, moon, P, made)
    # the houses: dark timber walls, snow on the pitched roofs, a chimney; one window lit
    hb = Builder()
    lit = []
    for k, (u, d, w, dep, _r) in enumerate(oc["houses"]):
        zg = ground_z(u, d)
        eave, ridge = zg + 4.2, zg + 6.8
        _obox(hb, P, u - w / 2, u + w / 2, d, d + dep, zg - 0.5, eave, mt["outwall"])
        # roof planes (snow), gables (wall), overhang 0.4 m
        o = 0.4
        A = [P(u - w / 2 - o, d - o, eave - 0.25), P(u + w / 2 + o, d - o, eave - 0.25), P(u + w / 2 + o, d + dep / 2, ridge),
             P(u - w / 2 - o, d + dep / 2, ridge)]
        B = [P(u - w / 2 - o, d + dep / 2, ridge), P(u + w / 2 + o, d + dep / 2, ridge),
             P(u + w / 2 + o, d + dep + o, eave - 0.25), P(u - w / 2 - o, d + dep + o, eave - 0.25)]
        for quad in (A, B):
            hb.face(quad if side not in ("N", "W") else quad[::-1], [(0, 0), (w / 2, 0), (w / 2, dep / 2), (0, dep / 2)],
                    mt["snow"])
        for su in (u - w / 2, u + w / 2):
            tri = [P(su, d, eave), P(su, d + dep, eave), P(su, d + dep / 2, ridge)]
            if (su > u) == (side in ("N", "W")):
                tri = tri[::-1]
            hb.face(tri, [(0, 0), (dep / 2, 0), (dep / 4, 1.5)], mt["outwall"])
        cx = u + w * 0.22
        _obox(hb, P, cx - 0.35, cx + 0.35, d + dep * 0.55, d + dep * 0.55 + 0.6, ridge - 1.6, ridge + 1.3, mt["stone"])
        _obox(hb, P, cx - 0.4, cx + 0.4, d + dep * 0.55 - 0.05, d + dep * 0.55 + 0.65, ridge + 1.3, ridge + 1.45,
              mt["snow"])
        if oc.get("lit_window") and k == oc["lit_window"][0]:
            lu, lz = oc["lit_window"][1], oc["lit_window"][2]
            lit.append((u + lu, d - 0.02, zg + lz))
    made["houses"] = register(hb.build(nm("Outside_Houses")), "outside", "houses")
    if lit:
        lb = Builder()
        for (u, d, z) in lit:
            q = [P(u - 0.32, d, z - 0.45), P(u - 0.32, d, z + 0.45), P(u + 0.32, d, z + 0.45), P(u + 0.32, d, z - 0.45)]
            lb.face(q if side in ("N", "W") else q[::-1], [(0, 0), (0, 1), (1, 1), (1, 0)], mt["litwin"])
        made["lit"] = register(lb.build(nm("Outside_LitWindow")), "emit", "lit_window")
    # the pine line: tiered cones on trunks, a few snow-capped
    tb = Builder()
    t0, t1 = oc["trees"]
    for _ in range(70):
        u = float(rng.uniform(-95.0, 95.0))
        d = float(rng.uniform(t0, t1))
        zg = ground_z(u, d)
        hgt = float(rng.uniform(9.0, 16.0))
        rad = hgt * float(rng.uniform(0.20, 0.27))
        _cone(tb, P, u, d, zg - 0.5, 0.25, 0.25, hgt * 0.2, mt["outwall"], n=6)
        for tier in range(3):
            zb = zg + hgt * (0.18 + 0.27 * tier)
            r = rad * (1.0 - 0.28 * tier)
            ht = hgt * (0.45 if tier < 2 else 0.55)
            _cone(tb, P, u, d, zb, r, 0.0, ht, mt["pine"], n=9)
    made["trees"] = register(tb.build(nm("Outside_Pines")), "outside", "pines")
    return outside_sky(fr, mt, win, moon, P, made)


def meshy_placed(name: str, model: str, P, u: float, d: float, z: float, facing: str, size: float, lod: float,
                 rot: float | None = None):
    """A Meshy model (its own textures) as its own mesh: meshy_village_build's placer, the transform applied, its
    footprint centred on the outside point (u, d) and its base at z."""
    o = vb.place(mib.RoomGround(), model, 0.0, 0.0, facing=facing, size=size, lamps=False, lod=lod, rot=rot)
    o.data = o.data.copy()
    o.name = name
    link(o)
    bpy.context.view_layer.update()
    me = o.data
    me.transform(o.matrix_world)
    o.matrix_world = Matrix.Identity(4)
    # the decimated import keeps its split and loose vertices (a pine at 1k faces held 24k vertices, each one a bake
    # sample): welded (UVs are per corner, so they stay) and the loose ones dropped
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(me)
    bm.free()
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    lo, hi = co.min(0), co.max(0)
    t = Vector(P(u, d, z))
    me.transform(Matrix.Translation((t.x - (lo[0] + hi[0]) / 2, t.y - (lo[1] + hi[1]) / 2, t.z - lo[2])))
    return o


def meshy_outside(fr: Frame, mt: dict, win: dict, P, ground_z, oc: dict, rng) -> dict:
    """The night outside in the village's own style (the look check: round 4's boxes and cones read far cruder than
    the village): its Meshy cottages, hard decimated (seen only through the window, 28 m and more away), facing the
    window, one window lit; and its Meshy pines, the tall and the short, in two lines. Their textures as Meshy
    made them (256 to 512 px)."""
    made = {}
    face = {"N": "S", "S": "N", "E": "W", "W": "E"}[win["side"]]
    lit_k = oc["lit_window"][0] if oc.get("lit_window") else None
    houses = []
    for k, (model, u, d, size, rot) in enumerate(oc["meshy"]["houses"]):
        o = meshy_placed(nm(f"Outside_House_{k + 1}"), model, P, u, d, ground_z(u, d) - 0.25, face, size,
                         oc["meshy"].get("house_lod", 0.04), rot=rot)
        swap_ph_materials(o, size=256, tag=model)
        houses.append((o, u, d))
    hb = _join([h[0] for h in houses], nm("Outside_Houses"))
    made["houses"] = register(hb, "outside", "houses")
    log(f"outside: {len(houses)} Meshy houses, {len(hb.data.polygons)} faces")
    if lit_k is not None and lit_k < len(houses):
        _o, u, d = houses[lit_k]
        lu, lz = oc["lit_window"][1], oc["lit_window"][2]
        bvh = BVHTree.FromObject(hb, bpy.context.evaluated_depsgraph_get())
        src = Vector(win["centre"])
        aim = Vector(P(u + lu, d, ground_z(u, d) + lz))
        dirv = (aim - src).normalized()
        hit = bvh.ray_cast(src + dirv * 5.0, dirv, 200.0)
        c = (hit[0] - dirv * 0.04) if hit[0] is not None else Vector(P(u + lu, d - 0.05, ground_z(u, d) + lz))
        right = dirv.cross(Vector((0, 0, 1))).normalized()
        q = [c - right * 0.32 - Vector((0, 0, 0.45)), c - right * 0.32 + Vector((0, 0, 0.45)),
             c + right * 0.32 + Vector((0, 0, 0.45)), c + right * 0.32 - Vector((0, 0, 0.45))]
        lb = Builder()
        lb.face([tuple(p) for p in q], [(0, 0), (0, 1), (1, 1), (1, 0)], mt["litwin"])
        lw = lb.build(nm("Outside_LitWindow"))
        if lw.data.polygons[0].normal.dot(dirv) > 0:
            lw.data.flip_normals()
        made["lit"] = register(lw, "emit", "lit_window")
    trees = []
    t0, t1 = oc["trees"]
    n_trees = int(oc["meshy"].get("trees", 30))
    for i in range(n_trees):
        u = float(rng.uniform(-80.0, 80.0))
        d = float(rng.uniform(t0, t1))
        tall = rng.random() < 0.7
        model = "pine_tall" if tall else "pine_short"
        size = float(rng.uniform(10.0, 16.0)) if tall else float(rng.uniform(6.0, 8.5))
        trees.append(meshy_placed(nm(f"Outside_Pine_{i + 1}"), model, P, u, d, ground_z(u, d) - 0.3, face, size,
                                  oc["meshy"].get("tree_lod", 0.012), rot=float(rng.uniform(0.0, 360.0))))
    for o in trees:
        swap_ph_materials(o, size=256, tag=o.get("wdi_model") or "pine")
    tb = _join(trees, nm("Outside_Pines"))
    made["trees"] = register(tb, "outside", "pines")
    log(f"outside: {n_trees} Meshy pines, {len(tb.data.polygons)} faces")
    return made


def build_backdrop(fr: Frame, mt: dict, win: dict, moon: Vector) -> dict:
    """What a window that says `sky` shows (a v2 file's window off the village view's wall): a level snow plain out to
    the horizon and the sky dome round it, no village, no moon disc (G14 gives each window its own view). Names
    Outside_Ground_<wall> and Outside_Sky_<wall>: one backdrop a wall."""
    side = win["side"]
    s0 = (win["sa"] + win["sb"]) / 2
    T = fr.T
    oc = CFG.get("outside") or {}
    gz = float(oc.get("ground", -0.3))

    def P(u, d, z):
        return fr.point(side, s0 + u, -T - d, z)

    ds = [0.0]
    while ds[-1] < 200.0:
        ds.append(ds[-1] + max(1.0, 0.1 * ds[-1]))
    us = np.linspace(-120.0, 120.0, 25)
    b = Builder()
    for j in range(len(ds) - 1):
        for i in range(len(us) - 1):
            q = [(us[i], ds[j]), (us[i], ds[j + 1]), (us[i + 1], ds[j + 1]), (us[i + 1], ds[j])]
            pts = [P(u, d, gz) for u, d in q]
            if side in ("N", "W"):
                pts, q = pts[::-1], q[::-1]
            b.face(pts, [(u / 2.0, d / 2.0) for u, d in q], mt["snow"])
    g = b.build(nm(f"Outside_Ground_{side}"))
    _fix_up(g)
    made = {"ground": register(g, "outside", f"ground_{side}")}
    return outside_sky(fr, mt, win, moon, P, made, suffix=f"_{side}", disc=False)


def outside_sky(fr: Frame, mt: dict, win: dict, moon: Vector, P, made: dict, suffix: str = "",
                disc: bool = True) -> dict:
    """The sky dome round the window (the half that can be seen through it) and the moon's disc (`disc`)."""
    side = win["side"]
    look = look_sky()
    R = 190.0
    c0 = Vector(P(0.0, 0.0, 0.0))
    nxw, nyw = _NORMALS[side]
    outv = Vector((-nxw, -nyw, 0.0))
    db = Builder()
    nu_, nv_ = 48, 20
    dirs = {}
    for j in range(nv_ + 1):
        el = math.radians(-12.0 + 102.0 * j / nv_)
        for i in range(nu_ + 1):
            az = math.radians(-100.0 + 200.0 * i / nu_)
            (_o, (dx, dy), _n, _L) = fr.wall_frame(side)
            along = Vector((dx, dy, 0.0))
            v = (outv * math.cos(az) - along * math.sin(az)) * math.cos(el) + Vector((0, 0, math.sin(el)))
            dirs[(i, j)] = v.normalized()
    for j in range(nv_):
        for i in range(nu_):
            q = [(i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j)]
            db.face([tuple(c0 + dirs[k] * R) for k in q], [(k[0] / nu_, k[1] / nv_) for k in q], mt["sky"])
    dome = db.build(nm("Outside_Sky" + suffix))
    made["sky"] = register(dome, "sky", "sky" + suffix.lower())
    me = dome.data
    a = me.color_attributes.new(ATTR, "FLOAT_COLOR", "POINT")
    cols = np.zeros((len(me.vertices), 4), np.float32)
    for vi, v in enumerate(me.vertices):
        dvec = (Vector(v.co) - c0).normalized()
        cols[vi, :3] = sky_colour(look, dvec, moon)
        cols[vi, 3] = 1.0
    a.data.foreach_set("color", cols.ravel())
    dome["wdi_sky_raw"] = True
    if not disc:
        return made
    mb = wb.MB()
    mpos = c0 + moon * (R - 5.0)
    mb.disc(R * math.tan(math.radians(0.55)), n=24, M=Matrix.Translation(mpos) @
            Vector((0, 0, 1)).rotation_difference(-moon).to_matrix().to_4x4(), mat=mt["flame"].mat)
    md = mb.build(nm("Outside_Moon"), col="room")
    if md is not None:
        md.data.materials[0] = MATS[nm("M_moon")].mat if nm("M_moon") in MATS else RMat("M_moon", None, (1, 1, 1),
                                                                                       kind="emit").mat
        uv_box(md, 10.0)
        made["moon"] = register(md, "emit", "moon_disc")
    return made


def _fix_up(ob) -> None:
    """Point a ground's faces up (its rows were laid in the wall's own terms)."""
    me = ob.data
    if len(me.polygons) and me.polygons[0].normal.z < 0:
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()


def _obox(b: Builder, P, u0, u1, d0, d1, z0, z1, mat) -> None:
    pts = [np.array(P(u, d, z)) for u in (u0, u1) for d in (d0, d1) for z in (z0, z1)]
    b.box(tuple(np.min(pts, 0)), tuple(np.max(pts, 0)), mat, uv_scale=2.0)


def _cone(b: Builder, P, u, d, z0, r0, r1, h, mat, n=10) -> None:
    c = np.array(P(u, d, 0.0))
    for k in range(n):
        a0, a1 = 2 * math.pi * k / n, 2 * math.pi * (k + 1) / n
        p0 = c + np.array([r0 * math.cos(a0), r0 * math.sin(a0), z0])
        p1 = c + np.array([r0 * math.cos(a1), r0 * math.sin(a1), z0])
        q0 = c + np.array([r1 * math.cos(a0), r1 * math.sin(a0), z0 + h])
        q1 = c + np.array([r1 * math.cos(a1), r1 * math.sin(a1), z0 + h])
        if r1 > 1e-4:
            b.face([p0, p1, q1, q0], [(k / n, 0), ((k + 1) / n, 0), ((k + 1) / n, 1), (k / n, 1)], mat)
        else:
            b.face([p0, p1, q0], [(k / n, 0), ((k + 1) / n, 0), ((k + 0.5) / n, 1)], mat)


# ---------------------------------------------------------------- furniture (the round-3 kit at real size)

PIECES: dict = {}           # id -> dict(obj, body box in world, ...)
MODEL_OF: dict = {}         # id -> the model its builder is building (place_piece: `rise` for all but the photos)
MADE: dict = {}             # id -> what a hearth or a day bed built (the manifest's `made`: a v2 piece's numbers)
WALLS: dict = {}            # id -> a wall-piece's numbers (G21: meshy_room_file.wall_values), for its collision
GREY = "#808080"            # a grey box's flat mid-grey (M_grey, made the first time a box is built)


def spec_for(piece: dict) -> dict:
    """The round-3 table entry for a piece (prop or spot), with the first-person overrides (None removes a key)."""
    if piece.get("spot"):
        spec, _k = mib.lookup(mib.SPOT_MODELS, [piece["id"], piece.get("key")])
    else:
        spec, _k = mib.lookup(mib.PROP_MODELS, [piece["id"], piece.get("key")])
    spec = dict(spec or {})
    for k, v in (piece.get("spec") or {}).items():
        if v is None:
            spec.pop(k, None)
        else:
            spec[k] = v
    return spec


def ph_object(name: str, slug: str, k: float, doors: dict | None = None, drop=(), lod: float | None = None):  # noqa
    """A Poly Haven model as its own object (a copy of meshy_interior_build's master, scaled by k, front -y, base on
    z = 0), with the model's body box (doors shut) in the object's frame: (obj, lo, hi)."""
    m = mib.ph_master(slug, doors, drop, lod)
    shut = {d: 0.0 for d in (doors or {})}
    ms = mib.ph_master(slug, shut, drop, lod) if doors else m
    sh_m, sh_s = Vector(m.get("wdi_shift", (0.0, 0.0, 0.0))), Vector(ms.get("wdi_shift", (0.0, 0.0, 0.0)))
    dims = Vector(ms["wdi_dims"])
    lo_s, hi_s = -dims / 2, dims / 2
    lo_s.z, hi_s.z = 0.0, dims.z
    lo, hi = (lo_s - sh_s + sh_m) * k, (hi_s - sh_s + sh_m) * k
    me = m.data.copy()
    me.transform(Matrix.Diagonal((k, k, k, 1.0)))
    ob = bpy.data.objects.new(name, me)
    COL["room"].objects.link(ob)
    return ob, lo, hi


def face_matrix(face: str) -> Matrix:
    return Matrix.Rotation(math.radians(mib.FACE_RZ[face]), 4, "Z")


def place_piece(fr: Frame, piece: dict, ob, lo: Vector, hi: Vector) -> tuple:
    """Turn a piece built facing -y to face piece['face'] and move it to its place; returns its world body box."""
    R = face_matrix(piece.get("face", "S"))
    corners = [R @ Vector((x, y, 0.0)) for x in (lo.x, hi.x) for y in (lo.y, hi.y)]
    bx0, bx1 = min(c.x for c in corners), max(c.x for c in corners)
    by0, by1 = min(c.y for c in corners), max(c.y for c in corners)
    pl = piece["place"]
    if pl[0] == "at":
        tx, ty = pl[1] - (bx0 + bx1) / 2, pl[2] - (by0 + by1) / 2
    elif pl[0] == "wall":
        side, along = pl[1], pl[2]
        tx = ty = 0.0
        if side == "N":
            ty = fr.y1 - GAP - by1
        elif side == "S":
            ty = fr.y0 + GAP - by0
        elif side == "E":
            tx = fr.x1 - GAP - bx1
        else:
            tx = fr.x0 + GAP - bx0
        if side in ("N", "S"):
            tx = (fr.x1 - GAP - bx1) if along == "E" else (fr.x0 + GAP - bx0) if along == "W" else along - (bx0 + bx1) / 2
        else:
            ty = (fr.y1 - GAP - by1) if along == "N" else (fr.y0 + GAP - by0) if along == "S" else along - (by0 + by1) / 2
    else:   # beside another piece, `gap` metres off its body box (GAP unless the piece says)
        _b, other, side, along = pl
        ob_box = PIECES[other]["box"]
        gap = float(piece.get("gap", GAP))
        if side == "S":
            ty = ob_box[1] - gap - by1
            tx = along - (bx0 + bx1) / 2
        elif side == "N":
            ty = ob_box[4] + gap - by0
            tx = along - (bx0 + bx1) / 2
        elif side == "W":
            tx = ob_box[0] - gap - bx1
            ty = along - (by0 + by1) / 2
        else:
            tx = ob_box[3] + gap - bx0
            ty = along - (by0 + by1) / 2
    rise = float(piece.get("rise") or 0.0) if MODEL_OF.get(piece.get("id")) != "photos" else 0.0
    # the piece's frame (its anchors, offsets and glows): the footprint's centre on the floor before the turn
    PLACE_M[piece.get("id")] = (Matrix.Translation((tx, ty, rise)) @ R,
                                Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z)))
    if rise:    # a wall-hung piece (a letter box, a frame): lifted off the floor
        ob.matrix_world = Matrix.Translation((tx, ty, rise)) @ R @ ob.matrix_world
        return (bx0 + tx, by0 + ty, lo.z + rise, bx1 + tx, by1 + ty, hi.z + rise)
    ob.matrix_world = Matrix.Translation((tx, ty, 0.0)) @ R @ ob.matrix_world
    return (bx0 + tx, by0 + ty, lo.z, bx1 + tx, by1 + ty, hi.z)


# A Poly Haven model's own material names become the room's datablock names (M_<name>, T_<name>), and none may carry a
# banned word (the owner's rule, D7; room_checks/roomcfg.py BANNED scans every name in the file): the crumb rooms' and
# the cellar's wall bulbs are Poly Haven's industrial_wall_sconce, whose materials become ..._wall_bracket. The scans
# are still read and graded under their own names (SCAN_PX, SCAN_GRADE and the file paths are untouched).
NAME_SWAP = (("sconce", "bracket"),)


def clean_name(base: str) -> str:
    """A datablock name with each banned word of NAME_SWAP replaced by its plain word, in lower case."""
    for word, plain in NAME_SWAP:
        base = re.sub(word, plain, base, flags=re.I)
    return base


SCAN_PX = {"GothicBed_01": 1024, "GothicCabinet_01": 1024, "ClassicConsole_01": 1024, "GothicCommode_01": 512,
           "ornate_mirror_01": 512, "side_table_tall_01": 512, "wooden_candlestick": 256, "brass_pot_02": 256,
           "jug_01": 512, "hanging_picture_frame_03": 512, "fancy_picture_frame_02": 512}


def swap_ph_materials(ob, size: int = 512, tag: str | None = None, meshy_pct: float | None = None) -> list:
    """Every Poly Haven material on a piece becomes a room material: its base colour scan (resized, its AO in,
    graded by SCAN_GRADE) on the unlit route. A Meshy model's materials (`tag`: the model's name, as their own
    names are generic) keep their texture as Meshy made it, with the ink floor's reference at MESHY_REF_PCT (or
    `meshy_pct`) and its darkest texels kept off black (`ink_lift.meshy_deep`). Returns the slugs' images used."""
    used = []
    il = CFG.get("look", {}).get("ink_lift", {})
    if meshy_pct is None:
        meshy_pct = float(il.get("meshy_ref_pct", MESHY_REF_PCT))
    deep = tuple(il.get("meshy_deep", (1.0, 10.0)))
    meshy_lift = float(il.get("meshy_lift", 0.0))
    for i, slot in enumerate(ob.material_slots):
        mat = slot.material
        if mat is None or mat.name.startswith(P):
            continue
        base = re.sub(r"\.\d{3}$", "", mat.name)
        if tag:
            base = f"{tag}_{base}"
        key = f"M_{clean_name(base)}"
        if nm(key) in MATS:
            ob.data.materials[i] = MATS[nm(key)].mat
            continue
        img = None
        if mat.node_tree:
            bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if bsdf is not None and bsdf.inputs["Base Color"].is_linked:
                fr_ = bsdf.inputs["Base Color"].links[0].from_node
                if fr_.type == "TEX_IMAGE" and fr_.image is not None:
                    img = fr_.image
        if img is None:
            col = (0.3, 0.3, 0.3)
            if mat.node_tree:
                bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
                if bsdf is not None:
                    col = tuple(bsdf.inputs["Base Color"].default_value[:3])
            rm = RMat(key, None, col, rough=0.6, albedo=col)
        else:
            path = bpy.path.abspath(img.filepath)
            ao = re.sub(r"_diff(_\d+k)", r"_arm\1", path)
            ao = ao if os.path.exists(ao) else None
            if ao is None:
                cand = os.path.join(os.path.dirname(path), os.path.basename(path).split("_diff")[0] + "_arm_1k.jpg")
                ao = cand if os.path.exists(cand) else None
            px = SCAN_PX.get(base, size)
            meshy = not os.path.exists(path)
            grade = None if meshy else SCAN_GRADE.get(base)
            if not meshy:
                sim = scan_image(f"T_{clean_name(base)}", path, px, ao_path=ao, grade=grade,
                                 contrast=il.get("scan_contrast"))
            else:   # a packed or generated image (a Meshy model's): its own pixels, as Meshy made them
                a = _srgb_to_lin(_pixels(img)[..., :3])
                W, H = img.size
                w_, h_ = (px, int(round(px * H / W))) if W >= H else (int(round(px * W / H)), px)
                a = _resize(a, w_, h_)
                if meshy_lift > 0:
                    # its near-black crevices eased like every scan's dark tail (lift_dark: the hue and every
                    # lighter texel kept), so the ink floor needs no extra light on the piece (the chest glowed in
                    # the bed's shadow) and no texel shows under ink
                    a = lift_dark(a, meshy_lift)
                sim = save_image(f"T_{clean_name(base)}", np.clip(a, 0.0, 1.0))
            rm = RMat(key, sim, (1.0, 1.0, 1.0), rough=0.6, albedo=tuple(scan_mean(sim)))
            if grade and grade.get("hot"):
                rm.hot = tuple(float(v) for v in grade["hot"])
            if meshy:
                rm.set_ref(meshy_pct, deep=deep if meshy_pct > REF_PCT_DEFAULT * 3 else None)
                rm.note = "Meshy texture kept" + (f"; its dark tail eased (lift_dark {meshy_lift:g})" if meshy_lift > 0
                                                  else " as made")
            used.append(base)
        ob.data.materials[i] = rm.mat
    return used


LIGHTS: list = []           # the room's night lights as built (resolve_lights): the rig's, the export's, the manifest's
PLACE_M: dict = {}          # piece id -> (its placement matrix, its footprint's centre on the floor before the turn)


def piece_point(pid: str, v) -> tuple:
    """A point given in a piece's frame (the centre of its footprint on the floor, +x along its width, +y toward its
    back, z up, before its face turn) in the world."""
    M, c = PLACE_M[pid]
    return tuple(M @ (c + Vector(tuple(float(x) for x in v))))


def anchor_point(fr: Frame, r: dict, anchors: dict) -> tuple:
    """A light's anchor in the world (R-L2, R-L3): a piece's named anchor, a point in a piece's frame (`offset`), a
    world point (`at`), or a point against a wall's inner face (`wall`, `along`, `out`, `z`)."""
    a = r["anchor"]
    if "at" in a:
        at = [float(v) for v in a["at"]]
        return (at[0], at[1], at[2] if len(at) > 2 else float(a.get("z", 1.0)))
    if "wall" in a:
        side = a["wall"]
        return tuple(float(v) for v in fr.point(side, fr.to_s(side, float(a["along"])), float(a.get("out", 0.12)),
                                                 float(a["z"])))
    if "offset" in a:
        return piece_point(a["piece"], a["offset"])
    key = f"{a['piece']}:{a.get('name') or 'flame'}"
    if key not in anchors:
        raise SystemExit(f"meshy_room_build: light {r['id']}: piece {a['piece']} built no anchor "
                         f"{a.get('name') or 'flame'!r} (it built: {sorted(k for k in anchors if ':' in k) or 'none'})")
    return anchors[key]


def resolve_lights(fr: Frame, anchors: dict, flame, shown: str = "") -> list:
    """The night lights the room builds (LIGHTS): each with its world point `at` (the flame anchor; a moon light has
    none, it shines through its `window`), power, colour, radius, group, glow and the name it exports as. The legacy
    path keeps its rig: the flame and the window, the look's lamp as CFG["candle"], Light_candle and Light_moon."""
    rows = SPEC.get("lights") or []
    if not is_v2():
        out = []
        lamp = next((r for r in rows if r["role"] != "moon"), None)
        moon = next((r for r in rows if r["role"] == "moon"), None)
        wins = [o for o in fr.openings if o["kind"] == "window"]
        c = CFG["candle"]
        if lamp is not None and flame is not None:
            out.append(dict(lamp, at=flame, power=c["power"], color=c["color"], radius=c["radius"], glow=None,
                            host=(lamp.get("anchor") or {}).get("piece"), export="Light_candle"))
        if moon is not None and wins:
            out.append(dict(moon, window=wins[0]["id"], at=None, glow=None, host=None, export="Light_moon"))
        return out
    vals = rf.light_values(rows, CFG["look"], CFG.get("candle"), shown=shown)
    out = []
    for r, v in zip(rows, vals):
        L = dict(r, **v)
        L["at"] = None if r["role"] == "moon" else anchor_point(fr, r, anchors)
        L["host"] = (r.get("anchor") or {}).get("piece")
        L["export"] = "Light_" + r["name"].replace(".", "_")
        L["glowDefault"] = "glow" not in r      # the flame cone a `flame` anchor gets unless the entry says
        out.append(L)
        for pid, p_ in PIECES.items():          # a grey box is closed: a light inside one lights nothing
            b_ = p_["box"]
            if L["at"] is not None and p_["spec"].get("model") == "box" and all(
                    b_[i] + 0.01 < L["at"][i] < b_[i + 3] - 0.01 for i in range(3)):
                NOTES.append(f"light {r['id']} stands inside the grey box {pid}: it lights nothing outside it (give "
                             f"its anchor a point outside the box)")
                log("WARNING", NOTES[-1])
    return out


def pool_points(lights: list) -> list:
    """The points of the lights whose pools set the exposure (the loader's exposureFrom)."""
    want = set(SPEC.get("exposureFrom") or ())
    return [L["at"] for L in lights if L["id"] in want and L["at"] is not None]


# the glows (5e): an emissive mesh, unlit at its emit_display colour, hidden in the bake, exported unlit
def glow_mat(mt: dict, material: str):
    """A glow's material: M_flame (the candles'), or M_bulb, M_coal, M_teal made on first use."""
    if material == "flame":
        return mt["flame"]
    key = nm(rf.emit_key(material))
    return MATS[key] if key in MATS else RMat(rf.emit_key(material), None, (1, 1, 1), kind="emit")


def glow_shape(b: Builder, c, shape: str, size, mat, R: Matrix) -> None:
    """One glow at the world point `c`: a cone or a box standing on it, a sphere round it, a card (a flat quad)
    upright on it facing the frame's front (-y turned by R)."""
    c = Vector(c)
    if shape == "box":
        w, d, h = (float(v) for v in size)
        b.box((-w / 2, -d / 2, 0.0), (w / 2, d / 2, h), mat, M=Matrix.Translation(c) @ R)
    elif shape == "cone":
        r_, h = float(size[0]), float(size[1])
        n = 10
        for k in range(n):
            a0, a1 = 2 * math.pi * k / n, 2 * math.pi * (k + 1) / n
            p0 = c + Vector((r_ * math.cos(a0), r_ * math.sin(a0), 0.0))
            p1 = c + Vector((r_ * math.cos(a1), r_ * math.sin(a1), 0.0))
            b.face([p0, p1, c + Vector((0.0, 0.0, h))], [(k / n, 0), ((k + 1) / n, 0), ((k + 0.5) / n, 1)], mat)
            b.face([p1, p0, c], [((k + 1) / n, 0), (k / n, 0), ((k + 0.5) / n, 0.5)], mat)
    elif shape == "sphere":
        r_ = float(size[0])
        nu, nv = 10, 6
        ring = [[c + Vector((r_ * math.sin(math.pi * j / nv) * math.cos(2 * math.pi * i / nu),
                             r_ * math.sin(math.pi * j / nv) * math.sin(2 * math.pi * i / nu),
                             r_ * math.cos(math.pi * j / nv))) for i in range(nu)] for j in range(nv + 1)]
        for j in range(nv):
            for i in range(nu):
                i1 = (i + 1) % nu
                uv = [(i / nu, j / nv), (i / nu, (j + 1) / nv), ((i + 1) / nu, (j + 1) / nv), ((i + 1) / nu, j / nv)]
                q = [ring[j][i], ring[j + 1][i], ring[j + 1][i1], ring[j][i1]]
                if j == 0:              # the poles are triangles
                    b.face(q[:3], uv[:3], mat)
                elif j == nv - 1:
                    b.face([q[0], q[1], q[3]], [uv[0], uv[1], uv[3]], mat)
                else:
                    b.face(q, uv, mat)
    else:   # card
        w, h = float(size[0]), float(size[1])
        q = [c + R @ Vector(v) for v in ((-w / 2, 0.0, 0.0), (w / 2, 0.0, 0.0), (w / 2, 0.0, h), (-w / 2, 0.0, h))]
        b.face(q, [(0, 0), (1, 0), (1, 1), (0, 1)], mat)


def face_turn(pid: str | None) -> Matrix:
    """A piece's face turn (identity for none)."""
    if pid is None or pid not in PIECES:
        return Matrix.Identity(4)
    return face_matrix(PIECES[pid]["piece"].get("face", "S"))


def build_glows(mt: dict, lights: list) -> list:
    """The lights' glows (`glow`, the flame cone for a `flame` anchor whose piece built no flame of its own) and the
    pieces' light-less glows (`spec.glow`), each one mesh named <piece>_glow (or <light>_glow), registered `emit`:
    left out of the bake and of the exposure's hot set (`wdi_split_of` the host's name), exported unlit at its
    emit_display colour. Returns the rows for the manifest."""
    rows = []
    own_flame = {r["id"].split(":", 1)[0] for r in OBJS if r["what"] == "emit" and r["id"].endswith(":flame")}
    todo = []
    for L in lights:
        g = L.get("glow")
        if not g or L["at"] is None:
            continue
        if L["host"] in own_flame and L.get("glowDefault"):
            continue    # the candle kit's own flame stands there already
        R = face_turn(L["host"])
        pts = [tuple(Vector(L["at"]) + R @ Vector(tuple(float(v) for v in q))) for q in (g.get("at") or [(0, 0, 0)])]
        todo.append((L["host"], L["host"] or L["name"], L["id"], g, pts, R))
    for pid, g in rf.piece_glows(CFG, CFG["look"]).items():
        todo.append((pid, pid, None, g, [piece_point(pid, q) for q in g["at"]], face_turn(pid)))
    seen = {}
    for host, base, lid, g, pts, R in todo:
        b = Builder()
        mat = glow_mat(mt, g["material"])
        for c in pts:
            glow_shape(b, c, g["shape"], g["size"], mat, R)
        stem = base.replace(".", "_") + "_glow"
        seen[stem] = seen.get(stem, 0) + 1
        if seen[stem] > 1:
            stem += f"_{seen[stem]}"
        ob = b.build(nm(stem))
        if ob is None:
            continue
        if host is not None and host in PIECES:
            ob["wdi_split_of"] = PIECES[host]["obj"].name
        register(ob, "emit", (host or base) + ":glow" + (f":{lid}" if lid else ""))
        rows.append(dict(name=ob.name, light=lid, piece=host, shape=g["shape"], material=rf.emit_key(g["material"]),
                         points=[[round(float(v), 3) for v in c] for c in pts]))
    return rows


TEXTURE_MATS = (("wall_plaster", ("M_wall", "M_ceiling", "M_paint")), ("joinery", ("M_wood", "M_outside_wall")),
                ("linen", ("M_linen",)), ("coverlet", ("M_coverlet",)), ("snow", ("M_snow",)),
                ("stone_wall", ("M_stone_wall",)))


def texture_roles(used: set, floor_role: str, rug: bool) -> list:
    """The texture roles a room used, from the room materials its meshes keep (`used`: names without the room's
    prefix): the floor's, the plaster, the joinery, the linen, the curtains' and a day bed's blanket's wool
    (M_curtain, M_curtain_<n>, M_blanket), the coverlet, the snow, a stone hearth's stone, and the rug's carpet."""
    out = [floor_role]
    out += [role for role, mats in TEXTURE_MATS if any(m in used for m in mats)]
    if any(m in ("M_curtain", "M_blanket") or m.startswith("M_curtain_") for m in used):
        out.append("wool")
    if rug:
        out.append("carpet")
    return out


def build_furniture(fr: Frame, mt: dict) -> dict:
    """Every piece of the room's file, at real size, against its wall; returns the light anchors (the flame)."""
    anchors = {}
    for piece in CFG["pieces"]:
        pid = piece["id"]
        res = (SPEC.get("pieces") or {}).get(pid) or {}
        if res.get("fromScene"):    # a run's or a footprint prop's null, taken from the scene (R-P6): CFG keeps it
            piece = dict(piece, place=tuple(res["place"]))
            if res.get("size"):
                piece["spec"] = dict(piece["spec"], size=tuple(res["size"]))
        spec = spec_for(piece)
        model = spec.get("model")
        name = nm(pid.replace(".", "_"))
        MODEL_OF[pid] = model
        if model == "box":
            ob, box, info = build_box(fr, piece, spec, name)
            for k_, v_ in info.items():
                anchors.setdefault(f"{pid}:{k_}", v_)
        elif model == "wall":
            ob, box = build_wall(fr, piece, spec, name, mt)     # a wall-piece (G21)
        elif model == "door":
            ob, box = build_wall_door(fr, piece, name, mt)      # a door set into a wall-piece (G21)
        elif model == "rug":
            ob, box = build_rug(fr, piece, spec, name)
        elif model == "photos":
            ob, box = build_photos(fr, piece, name)
        elif model == "meshy":
            ob, box = build_meshy(fr, piece, spec, name)
        elif model == "hearth":
            ob, box, info, made = build_hearth(fr, piece, spec, name, mt)
            for k_, v_ in info.items():
                anchors.setdefault(f"{pid}:{k_}", v_)
            MADE[pid] = made
        elif model == "ph" and isinstance(spec.get("bed"), dict) and spec["bed"].get("kind", "gothic") != "gothic":
            ob, box, made = build_day_bed(fr, piece, spec, name, mt)     # a bed object (G7): {"kind": "day", ...}
            MADE[pid] = made
        elif model == "ph" and spec.get("bed"):
            ob, box, extra = build_bed(fr, piece, spec, name, mt)
            anchors.update(extra)
        elif model == "ph" and spec.get("slug", "").startswith("GothicCabinet") and piece.get("key") != "x":
            ob, box = build_cabinet(fr, piece, spec, name, mt)
        elif model == "ph":
            ob, box, info = build_ph_kit(fr, piece, spec, name, mt)
            if "flame" in info:
                anchors["flame"] = info["flame"]
            for k_, v_ in info.items():         # each piece's own anchors, for a v2 file's lights
                anchors.setdefault(f"{pid}:{k_}", v_)
        else:
            raise SystemExit(f"meshy_room_build: no first-person builder for {pid} (model {model})")
        PIECES[pid] = dict(obj=ob, box=box, spec=spec, piece=piece)
        if pid in PLACE_M:      # any model's `spec.anchors` (a box's are its own already), in the piece's frame
            for k_, v_ in (spec.get("anchors") or {}).items():
                anchors.setdefault(f"{pid}:{k_}", piece_point(pid, v_))
        piece_rules(fr, pid, box)
        tile = next(((p["x"], p["y"]) for p in fr.room.props if p["id"] == pid), None) or \
            next(((s["x"], s["y"]) for s in fr.room.spots if s["id"] == pid), None)
        register(ob, "piece", pid, tile=tile, model=model, slug=spec.get("slug") or spec.get("name"), box=box)
        log(f"piece {pid}: {spec.get('slug') or spec.get('name') or model} box "
            f"[{', '.join(f'{v:.2f}' for v in box)}] size {box[3] - box[0]:.2f} x {box[4] - box[1]:.2f} x "
            f"{box[5] - box[2]:.2f}")
    return anchors


def build_box(fr: Frame, piece: dict, spec: dict, name: str):
    """A grey box (room file v2, G5): a piece with no model yet, at its real size ([w, d, h]: w along its front, d
    deep, h high), in one flat mid-grey (M_grey), labelled (`wdi_label`, `wdi_grey`), baked and split like any piece;
    its collision comes from the same raster. Returns the box and its anchors in the world (an oven's fire, a bar's
    lamp: `spec.anchors`, in the piece's frame before its face turn)."""
    w, d, h = (float(v) for v in spec["size"])
    wood = spec.get("finish", "grey") == "wood"     # a beam or a rafter in the room's joinery (G11's first part)
    key = nm("M_wood" if wood else "M_grey")
    mat = MATS[key] if key in MATS else RMat("M_grey", None, hex_lin(GREY), rough=0.8, albedo=hex_lin(GREY),
                                             note="grey boxes: pieces with no model yet")
    b = Builder()
    b.box((-w / 2, -d / 2, 0.0), (w / 2, d / 2, h), mat)
    ob = b.build(name)
    ob["wdi_grey"] = not wood
    ob["wdi_label"] = str(spec["label"])
    box = place_piece(fr, piece, ob, Vector((-w / 2, -d / 2, 0.0)), Vector((w / 2, d / 2, h)))
    info = {k: tuple(ob.matrix_world @ Vector(tuple(v))) for k, v in (spec.get("anchors") or {}).items()}
    return ob, box, info


class FaceFrame:
    """A wall-piece's face as the shell door's joinery reads a wall (G21): `wall_frame` gives the face's own origin, its
    direction along (the room on its left), its outward normal and its length whatever side letter is asked, and
    `to_s` and `point` are Frame's; `T` the depth the door's lining runs into the block."""

    def __init__(self, origin, du, normal, length: float, T: float):
        self._f = (tuple(origin), tuple(du), tuple(normal), float(length))
        self.T = float(T)

    def wall_frame(self, side: str):
        return self._f

    to_s = Frame.to_s
    point = Frame.point


def wall_doors(pid: str) -> list:
    """The door pieces set into wall-piece `pid` (G21), each (piece, the loader's numbers), in the file's order."""
    fr = FRAME[0]
    out = []
    for i, q in enumerate(CFG["pieces"]):
        qs = q.get("spec") or {}
        if qs.get("model") == "door" and qs.get("in") == pid:
            earlier = {r["id"]: r for r in CFG["pieces"][:i]}
            out.append((q, rf.wall_door_values(q, earlier, CFG, (fr.x0, fr.y0, fr.x1, fr.y1), f"piece {q['id']}")))
    return out


def polyline_cut(pts: list, drop: list) -> list:
    """The parts of a polyline [(x, y, z), ...] outside the distance intervals `drop` [(d0, d1), ...] along it."""
    P = [np.asarray(q, float) for q in pts]
    acc = [0.0]
    for a, b in zip(P, P[1:]):
        acc.append(acc[-1] + float(np.linalg.norm(b - a)))
    total = acc[-1]
    keep, at = [], 0.0
    for d0, d1 in sorted(drop):
        if d0 > at + 1e-6:
            keep.append((at, min(d0, total)))
        at = max(at, d1)
    if at < total - 1e-6:
        keep.append((at, total))

    def point(d):
        for k in range(len(P) - 1):
            if d <= acc[k + 1] + 1e-9:
                t = (d - acc[k]) / max(acc[k + 1] - acc[k], 1e-12)
                return tuple(P[k] + (P[k + 1] - P[k]) * t)
        return tuple(P[-1])

    out = []
    for a, b in keep:
        if b - a < 0.05:
            continue
        run = [point(a)] + [tuple(P[k]) for k in range(1, len(P) - 1) if a + 1e-6 < acc[k] < b - 1e-6] + [point(b)]
        out.append(run)
    return out


def wall_trims(fr: Frame, mt: dict, pid: str, wv: dict, doors: list) -> None:
    """A wall-piece's skirting (broken at its doors), picture rail and cornice, the room's own profiles swept along its
    built faces (each run of faces between the room's walls, or the whole loop); node names <piece>_Skirting,
    <piece>_PictureRail and <piece>_Cornice. A trim given as null is not built."""
    H = fr.H
    edges = wv["edges"]
    n = len(edges)
    runs = []
    if all(e["built"] for e in edges):
        runs.append((list(range(n)), True))
    else:
        k0 = next(k for k in range(n) if not edges[k]["built"])
        cur = []
        for j in range(1, n + 1):
            k = (k0 + j) % n
            if edges[k]["built"]:
                cur.append(k)
            elif cur:
                runs.append((cur, False))
                cur = []
        if cur:
            runs.append((cur, False))
    base = pid.replace(".", "_")
    sk, pr, co = CFG.get("skirting"), CFG.get("picture_rail"), CFG.get("cornice")
    bs, br, bc = Builder(), Builder(), Builder()
    for ks, closed in runs:
        pts = [(edges[ks[0]]["start"][0], edges[ks[0]]["start"][1], 0.0)]
        offs = {}
        acc = 0.0
        for k in ks:
            e = edges[k]
            offs[k] = acc
            acc += e["length"]
            pts.append((e["start"][0] + e["dir"][0] * e["length"], e["start"][1] + e["dir"][1] * e["length"], 0.0))
        loop = pts[:-1] if closed else pts
        if sk is not None:
            drop = []
            for _q, dv in doors:
                k = next((k for k in ks if edges[k]["start"] == dv["edge"]["start"] and
                          edges[k]["face"] == dv["face"]), None)
                if k is not None:
                    c = offs[k] + dv["at"]
                    drop.append((c - dv["width"] / 2 - SKIRT_BREAK, c + dv["width"] / 2 + SKIRT_BREAK))
            if closed and not drop:
                bs.sweep(skirting_profile(sk), loop, mt["wood"], closed=True, uv_scale=2.0, step=0.05)
            else:
                path = loop + [loop[0]] if closed else loop
                for part in polyline_cut(path, drop):
                    bs.sweep(skirting_profile(sk), part, mt["wood"], uv_scale=2.0, step=0.08)
        if pr is not None:
            br.sweep(rail_profile(pr), loop, mt["wood"], closed=closed, uv_scale=2.0, step=0.2)
        if co is not None:
            bc.sweep(cornice_profile(co, H), loop, mt["ceiling"], closed=closed, uv_scale=3.0, step=0.2)
    for b, stem, tag in ((bs, "Skirting", "skirting"), (br, "PictureRail", "picture_rail"), (bc, "Cornice", "cornice")):
        ob = b.build(nm(f"{base}_{stem}"))
        if ob is not None:
            register(ob, "trim", f"{pid}:{tag}")


def build_wall(fr: Frame, piece: dict, spec: dict, name: str, mt: dict):
    """A wall-piece (G21): the block's faces from its outline in the room's wall plaster, 5 cm by 10 cm grids as the
    shell's walls (their lines through its doors' edges and just clear of the trims), each face on the room's own wall
    left out, no top (it stands to the ceiling), a hole in its face for each door set into it; its trims (wall_trims).
    Its collision is the loader's boxes (collision()). Returns the object and its bounding box."""
    pid = piece["id"]
    wv = rf.wall_values(piece, fr.H, (fr.x0, fr.y0, fr.x1, fr.y1), f"piece {pid}")
    H = fr.H
    doors = wall_doors(pid)
    sk_, pr_, co_ = CFG.get("skirting"), CFG.get("picture_rail"), CFG.get("cornice")
    trim_z = ([sk_ + 0.006] if sk_ is not None else []) + \
        ([pr_ - 0.026, pr_ + 0.026] if pr_ is not None else []) + ([H - co_ - 0.008] if co_ is not None else [])
    b = Builder()
    for e in wv["edges"]:
        if not e["built"]:
            continue
        (ox, oy), (dx, dy), L = e["start"], e["dir"], e["length"]
        spans = [(dv["at"] - dv["width"] / 2, dv["at"] + dv["width"] / 2, dv["height"]) for _q, dv in doors
                 if dv["edge"]["start"] == e["start"] and dv["face"] == e["face"]]
        us = grid_levels(L, 0.05, [v for a, b_, _z in spans for v in (a, b_)])
        vs = grid_levels(H, 0.1, [z for _a, _b, z in spans] + trim_z)

        def skip(i, j, spans=spans, L=L, us=us, vs=vs):
            sm, zm = (us[i] + us[i + 1]) / 2 * L, (vs[j] + vs[j + 1]) / 2 * H
            return any(a < sm < b_ and zm < z1 for a, b_, z1 in spans)

        b.quad_grid((ox, oy, 0.0), (dx * L, dy * L, 0.0), (0.0, 0.0, H), 0, 0, mt["wall"], skip=skip, flip=True,
                    uv_fn=lambda p, dx=dx, dy=dy: ((p[0] * dx + p[1] * dy) / 3.0, p[2] / 3.0), us=us, vs=vs)
    ob = b.build(name)
    WALLS[pid] = wv
    wall_trims(fr, mt, pid, wv, doors)
    x0, y0, x1, y1 = wv["box"]
    return ob, (x0, y0, 0.0, x1, y1, H)


def build_wall_door(fr: Frame, piece: dict, name: str, mt: dict):
    """A door set into a wall-piece's face (G21: the manor's locked study door): the shell door's joinery, leaf and
    knob (door_one) built on the face through a FaceFrame, its lining run into the block; no portal. The knob is a part
    of the piece (<id>:knob). Returns the door and its body box (from the floor: the threshold's 3 cm under the boards
    is joinery in the floor, as a shell door's)."""
    pid = piece["id"]
    i = next(k for k, q in enumerate(CFG["pieces"]) if q["id"] == pid)
    dv = rf.wall_door_values(piece, {r["id"]: r for r in CFG["pieces"][:i]}, CFG, (fr.x0, fr.y0, fr.x1, fr.y1),
                             f"piece {pid}")
    e = dv["edge"]
    (sx, sy), (dx, dy), L = e["start"], e["dir"], e["length"]
    nx, ny = -dy, dx                                   # the edge's left: out of the block (a clockwise outline)
    T = fr.T
    fx, fy = sx + dx * dv["at"], sy + dy * dv["at"]
    if not rf._in_poly(dv["wall"]["outline"], fx - nx * (T + 0.02), fy - ny * (T + 0.02)):
        T = 0.1                                        # a thin wall-piece: the lining runs 10 cm in
    ff = FaceFrame((sx, sy), (dx, dy), (nx, ny), L, T)

    def along(s_):
        return sx + dx * s_ if dx else sy + dy * s_

    w = dv["width"]
    o = dict(kind="door", side=dv["side"], a=along(dv["at"] - w / 2), b=along(dv["at"] + w / 2), z0=0.0,
             z1=dv["height"], id=pid, portal=None, spec=dict(style="panel", knob=dv["knob"]))
    res = door_one(ff, mt, o, dv["knob"] == rf.KNOB_DEFAULT[dv["side"]], sfx(pid), what="piece")
    door, hw = res["objs"]
    bb = [world_bbox(door)] + ([world_bbox(hw)] if hw is not None else [])
    if hw is not None:
        register(hw, "piece", pid + ":knob")
    MADE[pid] = dict(wall=dv["host"], face=dv["face"], at=round(dv["at"], 4), width=w, height=dv["height"],
                     knob=dv["knob"], foot=[round(v, 4) for v in (fx, fy)])
    return door, (min(q[0] for q in bb), min(q[1] for q in bb), 0.0, max(q[3] for q in bb), max(q[4] for q in bb),
                  max(q[5] for q in bb))


def hearth_mat(mt: dict, surface: str):
    """A hearth's surface: M_marble (the washstand's slab, made here when no washstand made it), M_stone_wall (the
    cached `stone_wall` scan, rock_wall_08, tiled every 0.5 m) or M_iron."""
    if surface == "iron":
        return mt["iron"]
    if surface == "marble":
        key = nm("M_marble")
        return MATS[key] if key in MATS else RMat("M_marble", None, hex_lin("#C8C2B6"), rough=0.3,
                                                  albedo=hex_lin("#C8C2B6"))
    key = nm("M_stone_wall")
    if key in MATS:
        return MATS[key]
    img = scan_image("T_stone_wall", mib.mr.texture_path("stone_wall", "diff", res="1k"), 512)
    f = (0.92, 0.9, 0.86)
    return RMat("M_stone_wall", img, f, rough=0.95, albedo=tuple(scan_mean(img) * np.array(f)),
                note="a stone hearth: the stone_wall role's scan")


def hearth_soot():
    """The firebox's lining: a dull sooty brown-black, lighter than the ink (#12141C)."""
    key = nm("M_soot")
    return MATS[key] if key in MATS else RMat("M_soot", None, hex_lin("#2B2522"), rough=0.95, albedo=hex_lin("#2B2522"),
                                              note="a hearth's firebox lining")


def build_hearth(fr: Frame, piece: dict, spec: dict, name: str, mt: dict):
    """A hearth (room file v2, G6: styles `surround`, `stone` and `inglenook`), box-built in the room's own materials in
    the piece's frame (x along its width, its back against the wall at +d/2, its front -y): the body with the firebox's
    mouth (two jambs and the frieze over the mouth), the firebox lined in soot with an iron grate in it, the mantel
    shelf (marble on a surround, a timber shelf and a timber lintel over the mouth on a stone hearth), the chimney
    breast above the mantel; an inglenook's mouth runs up to its timber lintel beam (no frieze), its recess has cheeks
    in its own surface, a sooted back and throat, and a timber seat against each cheek with the grate between them, and the `dress` over the mantel: each Poly Haven model through ph_object (a mirror with
    "cloth" hung in plain matte black cloth by mirror_cloths and its glass blackened by mirror_glass_to_cloth, both
    unchanged), each labelled box a grey box of its own. The coals' glow is built with the lights' glows
    (build_glows, from meshy_room_file.piece_glows), split from this piece. Returns (object, box, its anchors in the
    world: `fire` and any of `spec.anchors`, the manifest's `made`)."""
    pid = piece["id"]
    hv = rf.hearth_values(spec, fr.H, f"piece {pid}")   # the file passed these rules already (derive)
    if hv["style"] == "oven":
        return build_oven(fr, piece, name, mt, hv)
    w, d, _h = hv["size"]
    body, sh, fb, br = hv["body"], hv["shelf"], hv["firebox"], hv["breast"]
    surf = hearth_mat(mt, hv["surface"])
    stone = hv["style"] == "stone"
    ingle = hv["style"] == "inglenook"
    shelf_mat = mt["wood"] if stone or ingle else surf
    soot = hearth_soot()
    ow, oh = hv["opening"]
    z0, z1 = sh["z0"], sh["z1"]
    bx0, bx1, yf, yb = body["x0"], body["x1"], body["y0"], body["y1"]
    fy1 = fb["y1"]
    b = Builder()
    # the body: two jambs, the frieze over the mouth, the block behind the firebox; no faces against the wall, the
    # floor or a neighbour (the firebox's own faces are its lining)
    b.box((bx0, yf, 0.0), (-ow / 2, yb, z0), surf, skip=("bottom", "N", "E"))
    b.box((ow / 2, yf, 0.0), (bx1, yb, z0), surf, skip=("bottom", "N", "W"))
    if not (ingle and z0 - oh < 1e-6):      # an inglenook's mouth may run up to its beam: no frieze
        b.box((-ow / 2, yf, oh), (ow / 2, yb, z0), surf, skip=("bottom", "N", "W", "E"))
    b.box((-ow / 2, fy1, 0.0), (ow / 2, yb, oh), surf, skip=("bottom", "N", "W", "E", "S", "top"))
    if sh["y1"] < yb - 1e-6:    # behind a shallow shelf the body rises to its top, so no slot shows under the breast
        b.box((bx0, sh["y1"], z0), (bx1, yb, z1), surf, skip=("bottom", "N", "S"))
    # the firebox's lining (its normals into the recess), the hearth floor and the grate
    xa, xb, ya, yc = -ow / 2, ow / 2, yf, fy1
    cheek = surf if ingle else soot         # an inglenook's cheeks are its masonry; its back and throat are sooted
    b.face([(xa, ya, 0.0), (xa, yc, 0.0), (xa, yc, oh), (xa, ya, oh)], [(0, 0), (1, 0), (1, 1), (0, 1)], cheek)
    b.face([(xb, yc, 0.0), (xb, ya, 0.0), (xb, ya, oh), (xb, yc, oh)], [(0, 0), (1, 0), (1, 1), (0, 1)], cheek)
    b.face([(xa, yc, 0.0), (xb, yc, 0.0), (xb, yc, oh), (xa, yc, oh)], [(0, 0), (1, 0), (1, 1), (0, 1)], soot)
    b.face([(xa, ya, oh), (xa, yc, oh), (xb, yc, oh), (xb, ya, oh)], [(0, 0), (1, 0), (1, 1), (0, 1)], soot)
    b.box((xa, ya, 0.0), (xb, yc, 0.012), soot, skip=("bottom",))
    gx, gy = 0.36 * (fb["fire_w"] if ingle else ow), fb["cy"] - 0.6 * fb["depth"] / 2 - 0.02
    for x_ in (-gx, gx):                                        # the grate's two legs and its front bar
        b.box((x_ - 0.012, gy - 0.012, 0.012), (x_ + 0.012, gy + 0.012, 0.15), mt["iron"])
    b.box((-gx - 0.012, gy - 0.012, 0.10), (gx + 0.012, gy + 0.012, 0.125), mt["iron"])
    if ingle and hv["seats"] is not None:   # a timber seat against each cheek, from the mouth back to the sooted back
        sw_, sh_ = float(hv["seats"]["width"]), float(hv["seats"]["height"])
        b.box((xa, ya, 0.012), (xa + sw_, yc, sh_), mt["wood"], skip=("bottom", "W", "N"))
        b.box((xb - sw_, ya, 0.012), (xb, yc, sh_), mt["wood"], skip=("bottom", "E", "N"))
    # the mantel shelf, overhanging the body at the front and both ends
    b.box((sh["x0"], sh["y0"], z0), (sh["x1"], sh["y1"], z1), shelf_mat, skip=("N",) if sh["y1"] >= yb - 1e-6 else ())
    if stone:   # the timber lintel over the mouth, proud of the stone by up to 3 cm
        lz = min(0.16, z0 - oh)
        if lz >= 0.05:
            b.box((-ow / 2 - 0.12, yf - min(0.03, yf - sh["y0"]), oh), (ow / 2 + 0.12, yf + 0.12, oh + lz), mt["wood"])
    if br is not None:
        top_skip = ("bottom", "N") + (("top",) if br["z1"] >= fr.H - 1e-6 else ())
        b.box((br["x0"], br["y0"], z1), (br["x1"], br["y1"], br["z1"] - (0.001 if br["z1"] >= fr.H - 1e-6 else 0.0)),
              surf, skip=top_skip)
    ob = b.build(name)
    # the dress over the mantel: each model's back `at[1]` in front of the breast (where it stands before the breast)
    # or of the shelf's back, its base `at[2]` over the shelf's top, centred on `at[0]`
    rows, parts, greys = [], [], []
    for j, r in enumerate(hv["dress"]):
        x, yin, zup = r["at"]
        back = br["y0"] if br is not None and br["x0"] <= x <= br["x1"] else sh["y1"]
        if r.get("model") == "box":
            gw, gd, gh = r["size"]
            gb = Builder()
            key = nm("M_grey")
            gm = MATS[key] if key in MATS else RMat("M_grey", None, hex_lin(GREY), rough=0.8, albedo=hex_lin(GREY),
                                                    note="grey boxes: pieces with no model yet")
            gb.box((x - gw / 2, back - yin - gd, z1 + zup), (x + gw / 2, back - yin, z1 + zup + gh), gm)
            g_ob = gb.build(f"{name}_dress{j}")
            g_ob["wdi_grey"] = True
            g_ob["wdi_label"] = str(r["label"])
            greys.append(g_ob)
            continue
        d_ob, lo_d, hi_d = ph_object(f"{name}_dress{j}", r["slug"], r["scale"], lod=r.get("lod"))
        R = Matrix.Rotation(math.radians(r["rot"]), 4, "Z")
        cs = [R @ Vector((cx, cy, 0.0)) for cx in (lo_d.x, hi_d.x) for cy in (lo_d.y, hi_d.y)]
        cx0, cx1 = min(c.x for c in cs), max(c.x for c in cs)
        cy0, cy1 = min(c.y for c in cs), max(c.y for c in cs)
        t = Vector((x - (cx0 + cx1) / 2, back - yin - cy1, z1 + zup - lo_d.z))
        d_ob.matrix_world = Matrix.Translation(t) @ R
        swap_ph_materials(d_ob)
        foot = (cx0 + t.x, cy0 + t.y, cx1 + t.x, cy1 + t.y)
        if r["slug"] not in rf.MIRROR_H and (foot[0] < sh["x0"] - 0.01 or foot[2] > sh["x1"] + 0.01
                                             or foot[1] < sh["y0"] - 0.01):
            raise SystemExit(f"meshy_room_build: piece {pid}: dress[{j}] {r['slug']} stands off the mantel shelf "
                             f"(its foot x {foot[0]:.2f}..{foot[2]:.2f}, y {foot[1]:.2f}..{foot[3]:.2f}; the shelf x "
                             f"{sh['x0']:.2f}..{sh['x1']:.2f}, front y {sh['y0']:.2f}): move its at")
        parts.append(d_ob)
        rows.append(dict(slug=r["slug"], k=r["scale"], at=[round(v, 4) for v in t], rot=r["rot"], cloth=r["cloth"],
                         dims=[round(cx1 - cx0, 3), round(cy1 - cy0, 3), round(hi_d.z - lo_d.z, 3)]))
    if parts:
        ob = _join([ob] + parts, name)
    cloth, n_glass = None, 0
    hung = [r for r in rows if r["cloth"]]
    if hung:
        cloth = mirror_cloths(name + "_cloth", hung, Vector((0.0, 0.0, 0.0)), mt)
        n_glass = mirror_glass_to_cloth(ob, hung, Vector((0.0, 0.0, 0.0)), mt["black"].mat)
        log(f"{pid}: {n_glass} mirror glass faces in the black cloth's material")
        if not n_glass:
            NOTES.append(f"{pid}: no mirror glass faces found to blacken")
    zs = [v.co.z for v in ob.data.vertices]
    lo, hi = Vector((-w / 2, -d / 2, 0.0)), Vector((w / 2, d / 2, max(zs) if zs else z1))
    box = place_piece(fr, piece, ob, lo, hi)
    for o_ in greys:
        o_.matrix_world = ob.matrix_world @ o_.matrix_world
        register(o_, "piece", pid + ":" + o_.name.rsplit("_", 1)[-1])
    if cloth is not None:
        cloth.matrix_world = ob.matrix_world @ cloth.matrix_world
        register(cloth, "cloth", pid + ":cloth")
    info = {k_: piece_point(pid, v_) for k_, v_ in hv["anchors"].items()}
    made = dict(style=hv["style"], surface=hv["surface"], opening=hv["opening"],
                firebox=dict(y=[round(fb["y0"], 3), round(fb["y1"], 3)], depth=fb["depth"]),
                mantel=[round(z0, 3), round(z1, 3)], breastTop=round(br["z1"], 3) if br else None,
                dress=[dict(slug=r["slug"], at=r["at"], dims=r["dims"], cloth=r["cloth"]) for r in rows] +
                [dict(box=o_.get("wdi_label")) for o_ in greys], mirrorGlassFaces=n_glass,
                fire=[round(float(v), 3) for v in info["fire"]])
    if ingle:
        made.update(beam=hv["beam"], seats=hv["seats"], fireWidth=fb["fire_w"])
    log(f"hearth {pid}: {hv['style']} in {hv['surface']}, opening {ow:g} x {oh:g} m, mantel {z0:.2f}..{z1:.2f} m, "
        f"breast to {br['z1'] if br else 'none'}, fire at {made['fire']}, dress {[r['slug'] for r in rows]}")
    return ob, box, info, made


def build_oven(fr: Frame, piece: dict, name: str, mt: dict, hv: dict):
    """A bread oven (G16: hearth style `oven`, Crumb's oven room), box-built in the room's own materials in the hearth's
    frame (x along its width, its back against the wall at +d/2, its front -y): the masonry body to its top `h` with
    the mouth raised on its sill (a jamb each side, the block under the sill, the crown over the mouth), the chamber
    behind the mouth lined in soot (cheeks, back, roof and deck), the stone ledge before the mouth at the sill's height,
    a low dome on the body's top (a half ellipsoid, 24 x 6 facets, from the front to the flue) and the flue up to the
    ceiling behind it (the hearth's `breast`). No grate, mantel or dress. The coals' glow is built with the lights'
    glows (build_glows), split from this piece, as a hearth's. Returns what build_hearth returns."""
    pid = piece["id"]
    w, d, h = hv["size"]
    surf = hearth_mat(mt, hv["surface"])
    soot = hearth_soot()
    ow, oh = hv["opening"]
    ov, fb, br, sh = hv["oven"], hv["firebox"], hv["breast"], hv["shelf"]
    sill = ov["sill"]
    top = sill + oh
    yf, yb, fy1 = hv["body"]["y0"], hv["body"]["y1"], fb["y1"]
    xa, xb = -ow / 2, ow / 2
    b = Builder()
    # the body: no faces against the wall, the floor or a neighbour (the chamber's own faces are its lining)
    b.box((-w / 2, yf, 0.0), (xa, yb, h), surf, skip=("bottom", "N", "E"))
    b.box((xb, yf, 0.0), (w / 2, yb, h), surf, skip=("bottom", "N", "W"))
    b.box((xa, yf, 0.0), (xb, yb, sill), surf, skip=("bottom", "N", "W", "E", "top"))
    b.box((xa, yf, top), (xb, yb, h), surf, skip=("bottom", "N", "W", "E"))
    # the chamber's lining (its normals into the chamber) and its deck
    sq = [(0, 0), (1, 0), (1, 1), (0, 1)]
    b.face([(xa, yf, sill), (xa, fy1, sill), (xa, fy1, top), (xa, yf, top)], sq, soot)
    b.face([(xb, fy1, sill), (xb, yf, sill), (xb, yf, top), (xb, fy1, top)], sq, soot)
    b.face([(xa, fy1, sill), (xb, fy1, sill), (xb, fy1, top), (xa, fy1, top)], sq, soot)
    b.face([(xa, yf, top), (xa, fy1, top), (xb, fy1, top), (xb, yf, top)], sq, soot)
    b.box((xa, yf, sill), (xb, fy1, sill + 0.012), soot, skip=("bottom",))
    # the ledge before the mouth, its top level with the deck's floor
    b.box((sh["x0"], sh["y0"], sh["z0"]), (sh["x1"], sh["y1"], sh["z1"]), surf, skip=("N",))
    dm = ov["dome"]
    if dm is not None:          # the dome: rings from its foot on the body's top to a point at its crown
        cx, cy = (dm["x0"] + dm["x1"]) / 2, (dm["y0"] + dm["y1"]) / 2
        ax, ay, az = (dm["x1"] - dm["x0"]) / 2, (dm["y1"] - dm["y0"]) / 2, dm["z1"] - dm["z0"]
        nu, nv = 24, 6
        rr = (ax + ay) / 2

        def pt(i, j):
            th, ph = 2 * math.pi * i / nu, (math.pi / 2) * j / nv
            return (cx + ax * math.cos(ph) * math.cos(th), cy + ay * math.cos(ph) * math.sin(th),
                    dm["z0"] + az * math.sin(ph))

        def uv(i, j):           # metres round the foot and up the side
            return (2 * math.pi * rr * i / nu, (math.pi / 2) * (rr + az) / 2 * j / nv)

        for j in range(nv):
            for i in range(nu):
                if j == nv - 1:
                    b.face([pt(i, j), pt(i + 1, j), pt(0, nv)], [uv(i, j), uv(i + 1, j), uv(i + 0.5, nv)], surf)
                else:
                    b.face([pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1)],
                           [uv(i, j), uv(i + 1, j), uv(i + 1, j + 1), uv(i, j + 1)], surf)
    if br is not None:          # the flue behind the dome
        top_skip = ("bottom", "N") + (("top",) if br["z1"] >= fr.H - 1e-6 else ())
        b.box((br["x0"], br["y0"], h), (br["x1"], br["y1"], br["z1"] - (0.001 if br["z1"] >= fr.H - 1e-6 else 0.0)),
              surf, skip=top_skip)
    ob = b.build(name)
    zs = [v.co.z for v in ob.data.vertices]
    lo, hi = Vector((-w / 2, -d / 2, 0.0)), Vector((w / 2, d / 2, max(zs) if zs else h))
    box = place_piece(fr, piece, ob, lo, hi)
    info = {k_: piece_point(pid, v_) for k_, v_ in hv["anchors"].items()}
    made = dict(style="oven", surface=hv["surface"], opening=hv["opening"], sill=sill,
                ledge=[round(sh["z0"], 3), round(sh["z1"], 3)],
                firebox=dict(y=[round(fb["y0"], 3), round(fb["y1"], 3)], depth=fb["depth"], z=[sill, round(top, 3)]),
                domeTop=round(dm["z1"], 3) if dm is not None else None,
                breastTop=round(br["z1"], 3) if br else None, dress=[], mirrorGlassFaces=0,
                fire=[round(float(v), 3) for v in info["fire"]])
    log(f"oven {pid}: in {hv['surface']}, mouth {ow:g} x {oh:g} m on a {sill:g} m sill, chamber {fb['depth']:g} m, "
        f"dome to {made['domeTop']}, flue to {made['breastTop']}, fire at {made['fire']}")
    return ob, box, info, made


def piece_rules(fr: Frame, pid: str, box) -> None:
    """The build's rules on a placed piece: inside the room (R-P8, both paths) and, on the v2 path, within 1.0 m of its
    reference point unless its `moved` says why (R-P7, the owner's ruling D4: up to 1 m, logged)."""
    tol = 0.001
    p = PIECES[pid]["piece"]
    out = [f"x {box[0]:.2f}" if box[0] < fr.x0 - tol else "", f"x {box[3]:.2f}" if box[3] > fr.x1 + tol else "",
           f"y {box[1]:.2f}" if box[1] < fr.y0 - tol else "", f"y {box[4]:.2f}" if box[4] > fr.y1 + tol else "",
           f"z {box[5]:.2f}" if box[5] > fr.H + tol else ""]
    out = [o for o in out if o]
    if out:
        raise SystemExit(f"meshy_room_build: piece {pid} reaches {', '.join(out)}: the room is x {fr.x0:g}..{fr.x1:g}, "
                         f"y {fr.y0:g}..{fr.y1:g}, z 0..{fr.H:g} (R-P8)")
    ref = ((SPEC.get("pieces") or {}).get(pid) or {}).get("ref")
    if ref is None:
        return
    d = math.hypot((box[0] + box[3]) / 2 - ref[0], (box[1] + box[4]) / 2 - ref[1])
    if p.get("moved"):
        log(f"piece {pid} stands {d:.2f} m from its reference point ({ref[0]:g}, {ref[1]:g}): moved, {p['moved']}")
    if SPEC.get("schema") == "v2" and d > rf.MOVE_LIMIT and not p.get("moved"):
        raise SystemExit(f"meshy_room_build: piece {pid} stands {d:.2f} m from its reference point ({ref[0]:g}, "
                         f"{ref[1]:g}): name why in \"moved\", or stand it within {rf.MOVE_LIMIT:g} m (R-P7)")


def from_ref(pid: str) -> dict:
    """A piece's reference point (meshy_room_file: its footprint's centre, else the centroid of its own tile and its
    `covers`) and its distance from it, for the manifest."""
    ref = ((SPEC.get("pieces") or {}).get(pid) or {}).get("ref")
    if ref is None:
        return {}
    b = PIECES[pid]["box"]
    return dict(refXY=[round(ref[0], 3), round(ref[1], 3)],
                fromRefM=round(math.hypot((b[0] + b[3]) / 2 - ref[0], (b[1] + b[4]) / 2 - ref[1]), 3))


def build_cabinet(fr: Frame, piece: dict, spec: dict, name: str, mt: dict):
    """A GothicCabinet press at its real height (`tall`), its doors as the room file says (shut, ajar, open), the folded
    linen on the upper shelf where the piece asks for it."""
    slug = spec["slug"]
    m0 = mib.ph_master(slug, {d: 0.0 for d in mib.CABINET_DOORS})
    k = spec["tall"] / m0["wdi_dims"][2]
    doors = spec.get("doors") or {d: 0.0 for d in mib.CABINET_DOORS}
    ob, lo, hi = ph_object(name, slug, k, doors, lod=spec.get("lod"))
    if spec.get("mirror"):
        ob.data.transform(Matrix.Scale(-1.0, 4, (1, 0, 0)))
        ob.data.flip_normals()
        lo.x, hi.x = -hi.x, -lo.x
    swap_ph_materials(ob)
    parts = [ob]
    if piece.get("sheets"):
        # the sheets lie in the compartment behind the wider open upper door: door1's half (the model's -x) or
        # door2's (+x); on a mirrored press the halves swap with the mesh
        d1, d2 = (abs(float(doors.get(f"GothicCabinet_01_door{n}", 0.0))) for n in (1, 2))
        half = (1.0 if d2 > d1 else -1.0) * (-1.0 if spec.get("mirror") else 1.0)
        sh = folded_linen(name + "_linen", ob, lo, hi, k, mt, half=half)
        if sh is not None:
            parts.append(sh)
    box = place_piece(fr, piece, ob, lo, hi)
    for p in parts[1:]:
        p.matrix_world = ob.matrix_world @ p.matrix_world
        register(p, "piece", piece["id"] + ":linen")
    return ob, box


def folded_linen(name: str, cab, lo: Vector, hi: Vector, k: float, mt: dict, half: float = -1.0):
    """Folded sheets on the press's upper shelf, behind the open door: soft slabs with rounded folded fronts, each
    a little different, in the linen's weave (round 3's read as white boards). `half`: -1 the compartment behind
    door1 (the model's -x half), +1 the one behind door2 (the same stacks mirrored)."""
    bvh = BVHTree.FromPolygons([v.co.copy() for v in cab.data.vertices], [tuple(p.vertices) for p in cab.data.polygons])
    sgn = 1.0 if half > 0 else -1.0
    xm = sgn * 0.35 * k
    ym = (lo.y + hi.y) / 2 + 0.05
    hit = bvh.ray_cast(Vector((xm, ym, hi.z - 0.12 * k)), Vector((0, 0, -1)))
    shelf = hit[0].z if hit[0] is not None else 1.32 * k
    front = lo.y + 0.19 * k            # just behind the doors
    rng = np.random.default_rng(7)
    b = Builder()
    xl = -0.64 * k                     # the compartment's inside, door1's half
    stacks = [(xl + 0.01, xl + 0.39, 6, 0.40), (xl + 0.42, xl + 0.60, 5, 0.26)]
    for sx0, sx1, n, depth in stacks:
        z = shelf + 0.002
        for i in range(n):
            t = float(rng.uniform(0.036, 0.05))
            j = float(rng.uniform(-0.012, 0.012))
            xa, xb = sx0 + j, sx1 + j - float(rng.uniform(0.0, 0.025))
            if sgn > 0:
                xa, xb = -xb, -xa
            _linen_slab(b, xa, xb, front + abs(j),
                        front + depth + float(rng.uniform(-0.02, 0.02)), z, t, mt["linen"])
            z += t
    ob = b.build(name, smooth=True)
    return ob


def _linen_slab(b: Builder, x0, x1, y0, y1, z0, t, mat, seg: int = 6) -> None:
    """One folded sheet: a slab whose front (-y) edge is the rounded fold, its top sagging a little, its sides
    slightly bulged; outward normals."""
    r = t / 2
    yc, zc = y0 + r, z0 + r
    prof = [(y1, z0)]
    for i in range(seg + 1):          # round the fold: bottom, front, top
        a = math.radians(270.0 - 180.0 * i / seg)
        prof.append((yc + r * math.cos(a), zc + r * math.sin(a)))
    prof.append((y1, z0 + t - 0.004))
    nx_ = 12
    rings = []
    for i in range(nx_ + 1):
        x = x0 + (x1 - x0) * i / nx_
        w_ = math.sin(math.pi * i / nx_)
        ring = []
        for (yy, zz) in prof:
            sag = -0.003 * w_ if zz > z0 + t * 0.6 else 0.0
            bulge = 0.005 * w_ if yy < yc + 1e-6 else 0.0
            ring.append((x, yy - bulge, zz + sag))
        rings.append(ring)
    for i in range(nx_):
        for kq in range(len(prof) - 1):
            q = [rings[i][kq], rings[i + 1][kq], rings[i + 1][kq + 1], rings[i][kq + 1]]
            b.face(q, [(p[0] / 0.27, (p[1] + p[2]) / 0.27) for p in q], mat)
    for ring, last in ((rings[0], False), (rings[-1], True)):
        pts = ring[::-1] if last else list(ring)
        b.face(pts, [(p[1] / 0.27, p[2] / 0.27) for p in pts], mat)


def build_ph_kit(fr: Frame, piece: dict, spec: dict, name: str, mt: dict):
    """A dressed Poly Haven piece through meshy_interior_build.ph_kit (the console and its three glasses, the
    washstand with its marble, basin and ewer, the candle stand and its candlestick and flame), then turned and
    placed; the dressing table's glasses all hung with plain matte black cloth."""
    sp = dict(spec)
    lods = piece.get("dress_lod", {})
    sp["dress"] = tuple(dict(d, lod=lods.get(d["slug"], d.get("lod"))) for d in sp.get("dress", ()))
    sp.pop("centre", None)
    ob, info = mib.ph_kit(name, sp)
    link(ob)
    shift = Vector(ob["wdi_shift"])
    for slot_i, slot in enumerate(ob.material_slots):
        nm_ = slot.material.name if slot.material else ""
        if nm_.startswith("HM_Marble"):
            ob.data.materials[slot_i] = MATS[nm("M_marble")].mat if nm("M_marble") in MATS else \
                RMat("M_marble", None, hex_lin("#C8C2B6"), rough=0.3, albedo=hex_lin("#C8C2B6")).mat
        elif nm_.startswith("HM_Flame"):
            ob.data.materials[slot_i] = mt["flame"].mat
    swap_ph_materials(ob)
    if "flame" in info:   # the flame: a separate unlit mesh (the bake hides it); the light just above its tip
        _split_material(ob, mt["flame"].mat, name + "_flame")
    dims = Vector(ob["wdi_dims"])
    lo, hi = Vector((-dims.x / 2, -dims.y / 2, 0.0)), Vector((dims.x / 2, dims.y / 2, dims.z))
    cloth = None
    if piece.get("cloth") and info.get("dress"):
        cloth = mirror_cloths(name + "_cloth", info["dress"], shift, mt)
        n_glass = mirror_glass_to_cloth(ob, info["dress"], shift, mt["black"].mat)
        log(f"{piece['id']}: {n_glass} mirror glass faces in the black cloth's material")
        if not n_glass:
            NOTES.append(f"{piece['id']}: no mirror glass faces found to blacken")
    box = place_piece(fr, piece, ob, lo, hi)
    out = dict(info)
    for child in [o for o in bpy.data.objects if o.get("wdi_split_of") == name]:
        child.matrix_world = ob.matrix_world @ child.matrix_world
        register(child, "emit", piece["id"] + ":flame")
    if cloth is not None:
        cloth.matrix_world = ob.matrix_world @ cloth.matrix_world
        register(cloth, "cloth", piece["id"] + ":cloth")
    if "flame" in info:
        out["flame"] = tuple(ob.matrix_world @ Vector(info["flame"]))
    return ob, box, out


def _split_material(ob, mat, name: str):
    """Move the faces with `mat` into their own object (kept at the same transform)."""
    idx = next((i for i, m in enumerate(ob.data.materials) if m == mat), None)
    if idx is None:
        return None
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    sel = [f for f in bm.faces if f.material_index == idx]
    if not sel:
        bm.free()
        return None
    me2 = bpy.data.meshes.new(name)
    bm2 = bmesh.new()
    vmap = {}
    for f in sel:
        vs = []
        for v in f.verts:
            if v not in vmap:
                vmap[v] = bm2.verts.new(v.co)
            vs.append(vmap[v])
        bm2.faces.new(vs)
    bm2.to_mesh(me2)
    bm2.free()
    bmesh.ops.delete(bm, geom=sel, context="FACES")
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(ob.data)
    bm.free()
    me2.materials.append(mat)
    o2 = bpy.data.objects.new(name, me2)
    COL["room"].objects.link(o2)
    o2.matrix_world = Matrix.Identity(4)
    o2["wdi_split_of"] = ob.name
    uv_box(o2, 0.05)
    return o2


def mirror_cloths(name: str, dress: list, shift: Vector, mt: dict):
    """Plain matte black cloth over every glass of the triple mirror (canon: "the mirror hung in black"; never
    crepe): each one laid over its frame's arched top, a lip turned over the edge behind, and falling in soft
    vertical folds to a hem just past the glass's foot; a little narrower than the frame, so its gilt edge still
    shows round the black. Built in the console's frame from round 3's dress placements."""
    b = Builder()
    # ornate_mirror_01 at k 1 (its frame 0.486 wide, 0.744 tall, 2.6 cm deep): the cloth's arch (centre height,
    # radius) and half width, wider than the frame so no glass or gilt edge shows past it from an angle
    ZC, R, HW = 0.49, 0.272, 0.262
    for d in dress:
        if d["slug"] != "ornate_mirror_01":
            continue
        kk = d["k"]
        x, y, z = d["at"]
        M = Matrix.Translation(Vector((x, y, z)) + shift) @ Matrix.Rotation(math.radians(d.get("rot", 0.0)), 4, "Z") @ \
            Matrix.Diagonal((kk, kk, kk, 1.0))
        front, back = -0.013 - 0.007, 0.013 + 0.006
        cols, rows, lip, ret = 34, 26, 5, 4      # ret: the columns of each side's return round to the frame's back
        grid = []
        for j in range(lip + rows + 1):
            row = []
            for i in range(-ret, cols + ret + 1):
                u = min(max(i / cols, 0.0), 1.0)
                xx = -HW + 2 * HW * u
                z_top = ZC + math.sqrt(max(R * R - xx * xx, 0.0))
                hem = 0.020 + 0.008 * math.sin(math.pi * 3 * u) ** 2
                if j < lip:           # the lip over the frame's top edge, from the back round to the front
                    a = math.pi * j / lip
                    yy = (back + front) / 2 + (back - front) / 2 * math.cos(a)
                    zz = z_top - 0.028 * (1 - math.sin(a)) * (1 if j == 0 else 0.6) + 0.010 * math.sin(a)
                    v = 0.0
                else:
                    v = (j - lip) / rows
                    zz = z_top + (hem - z_top) * v
                    fold = 0.017 * (0.3 + v) * math.sin(2 * math.pi * 3.5 * u + 0.7) + 0.005 * v * math.sin(17 * u)
                    yy = front - abs(fold) - 0.004 * v - 0.010 * v * v * math.sin(math.pi * u)   # it bellies out low
                if i < 0 or i > cols:  # the side returns: a quarter round from the front back past the frame's edge
                    t = (-i if i < 0 else i - cols) / ret
                    a = math.pi / 2 * t
                    sgn = -1.0 if i < 0 else 1.0
                    xx = sgn * (HW + 0.010 * math.sin(a))
                    yy = yy + (back - yy) * (1 - math.cos(a))
                row.append(tuple(M @ Vector((xx, yy, zz))))
            grid.append(row)
        n, w = len(grid), len(grid[0])
        for j in range(n - 1):
            for i in range(w - 1):
                q = [grid[j][i], grid[j + 1][i], grid[j + 1][i + 1], grid[j][i + 1]]   # down, then along: -y
                b.face(q, [(i / (w - 1), 1 - j / n), (i / (w - 1), 1 - (j + 1) / n), ((i + 1) / (w - 1), 1 - (j + 1) / n),
                           ((i + 1) / (w - 1), 1 - j / n)], mt["black"])
    return b.build(name, smooth=True)


def mirror_glass_to_cloth(ob, dress: list, shift: Vector, mat) -> int:
    """The mirrors' glass faces (ornate_mirror_01's flat glass, recessed 1.9 cm behind its frame's front) drawn in
    the black cloth's material: wherever the cloth leaves a sliver, black shows, never the glass. Returns the faces
    changed."""
    me = ob.data
    slot = next((i for i, m in enumerate(me.materials) if m == mat), None)
    if slot is None:
        me.materials.append(mat)
        slot = len(me.materials) - 1
    mirror = [i for i, m in enumerate(me.materials) if m is not None and "ornate_mirror_01" in m.name]
    if not mirror:
        return 0
    n = 0
    for d in dress:
        if d["slug"] != "ornate_mirror_01":
            continue
        kk = d["k"]
        x, y, z = d["at"]
        M = Matrix.Translation(Vector((x, y, z)) + shift) @ Matrix.Rotation(math.radians(d.get("rot", 0.0)), 4, "Z") @ \
            Matrix.Diagonal((kk, kk, kk, 1.0))
        Mi = M.inverted()
        for p in me.polygons:
            if p.material_index not in mirror:
                continue
            c = Mi @ p.center
            nl = (Mi.to_3x3() @ p.normal).normalized()
            if abs(c.x) < 0.17 and 0.15 < c.z < 0.70 and -0.004 < c.y < 0.012 and abs(nl.y) > 0.8:
                p.material_index = slot
                n += 1
    return n


def build_meshy(fr: Frame, piece: dict, spec: dict, name: str):
    """The Meshy model (the blanket chest: kit_chest, its own textures) through meshy_village_build's placer, then
    made its own mesh and placed."""
    o = vb.place(mib.RoomGround(), spec["name"], 0.0, 0.0, facing="S", size=spec.get("size"), lamps=False,
                 lod=spec.get("lod"))
    o.data = o.data.copy()
    o.name = name
    link(o)
    bpy.context.view_layer.update()
    me = o.data
    me.transform(o.matrix_world)
    o.matrix_world = Matrix.Identity(4)
    co = np.array([v.co[:] for v in me.vertices])
    lo, hi = Vector(co.min(0)), Vector(co.max(0))
    me.transform(Matrix.Translation((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z)))
    d = hi - lo
    lo, hi = Vector((-d.x / 2, -d.y / 2, 0.0)), Vector((d.x / 2, d.y / 2, d.z))
    swap_ph_materials(o, tag=spec["name"])
    box = place_piece(fr, piece, o, lo, hi)
    return o, box


def build_rug(fr: Frame, piece: dict, spec: dict, name: str):
    """Round 3's worn rug (bone border, madder field, a medallion, the carpet scan's pile) baked to a texture."""
    L, W = spec.get("size", (2.6, 1.8))
    # a second rug (the manor's two) gets its own texture and material, M_rug_2, ...: a second T_rug would replace
    # the first rug's image under its material
    k = 1 + sum(1 for q in PIECES.values() if q["spec"].get("model") == "rug")
    tail = "" if k == 1 else f"_{k}"
    img = rug_texture(L, W, "T_rug" + tail)
    rm = MATS.get(nm("M_rug" + tail)) or RMat("M_rug" + tail, img, (1.0, 1.0, 1.0), rough=0.95,
                                              albedo=tuple(scan_mean(img)))
    b = Builder()
    n_u, n_v = grid_count(L, 0.05), grid_count(W, 0.05)
    b.quad_grid((-L / 2, -W / 2, 0.0), (L, 0, 0), (0, W, 0), n_u, n_v, rm,
                uv_fn=lambda p: ((p[0] + L / 2) / L, (p[1] + W / 2) / W))
    # a 6 mm pile: the edge strips down to the floor
    for (pa, pb) in (((-L / 2, -W / 2), (L / 2, -W / 2)), ((L / 2, -W / 2), (L / 2, W / 2)), ((L / 2, W / 2), (-L / 2, W / 2)),
                     ((-L / 2, W / 2), (-L / 2, -W / 2))):
        b.face([(pa[0], pa[1], -0.006), (pb[0], pb[1], -0.006), (pb[0], pb[1], 0.0), (pa[0], pa[1], 0.0)],
               [(0, 0), (1, 0), (1, 0.01), (0, 0.01)], rm)
    ob = b.build(name)
    for v in ob.data.vertices:
        v.co.z += 0.006
    lo, hi = Vector((-L / 2, -W / 2, 0.0)), Vector((L / 2, W / 2, 0.006))
    box = place_piece(fr, piece, ob, lo, hi)
    return ob, box


def rug_texture(L: float, W: float, name: str = "T_rug"):
    """Bake meshy_interior_build.mat_rug's albedo (its node tree over UVs 0..1) into an image named `name`."""
    w, h = 768, int(768 * W / L)
    img = bpy.data.images.new(nm(name), w, h, alpha=False)
    me = bpy.data.meshes.new("rug_tmp")
    me.from_pydata([(-L / 2, -W / 2, 0), (L / 2, -W / 2, 0), (L / 2, W / 2, 0), (-L / 2, W / 2, 0)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name="UVMap")
    uv.data.foreach_set("uv", [0, 0, 1, 0, 1, 1, 0, 1])
    mat = mib.mat_rug(L, W)
    me.materials.append(mat)
    ob = bpy.data.objects.new("rug_tmp", me)
    bpy.context.scene.collection.objects.link(ob)
    tn = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tn.image = img
    mat.node_tree.nodes.active = tn
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 4
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, target="IMAGE_TEXTURES", margin=4, use_clear=True)
    a = _pixels(img)[..., :3]
    lin = a if img.is_float else _srgb_to_lin(a)
    bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.meshes.remove(me)
    mat.node_tree.nodes.remove(tn)
    bpy.data.images.remove(img)
    return save_image(name, lin)


# ---------------------------------------------------------------- the bed: lifted, made up


def build_bed(fr: Frame, piece: dict, spec: dict, name: str, mt: dict):
    """The carved bed at its table scale, lifted on its posts so a dark gap shows under the frame (the under-bed hide),
    made up with two pillows, a damask coverlet hanging to a hem `lift` + 8 cm above the floor and the sheet turned
    down over it."""
    k = float(spec.get("scale", 0.95))
    ob, lo, hi = ph_object(name, spec["slug"], k, lod=spec.get("lod"))
    lift = float(piece.get("lift", 0.0))
    me = ob.data
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    if lift > 0:
        # the posts' feet stay on the floor and stretch; everything else rises (the base's underside included). A
        # foot vertex is low, in a corner and used only by faces small across (a post's): the base's bottom and its
        # end panels reach from corner to corner and would hold the frame down, so their corners rise with it
        foot = co[:, 2] < 0.065 * k / 0.95
        corner = (np.abs(co[:, 0]) > hi.x - 0.15) & (np.abs(co[:, 1]) > hi.y - 0.17)
        wide = np.zeros(len(co), bool)
        for p in me.polygons:
            vs = list(p.vertices)
            if float((co[vs, :2].max(0) - co[vs, :2].min(0)).max()) > 0.25:
                wide[vs] = True
        keep = foot & corner & ~wide
        co[~keep, 2] += lift
        me.vertices.foreach_set("co", co.ravel())
        me.update()
        hi.z += lift
        log(f"bed: {int(keep.sum())} post-foot vertices kept on the floor, {int((~keep).sum())} lifted {lift:.2f} m")
    swap_ph_materials(ob)
    bvh = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])

    def top(x, y):
        h_ = bvh.ray_cast(Vector((x, y, hi.z + 1.0)), Vector((0, 0, -1)))
        return h_[0].z if h_[0] is not None else None

    # the mattress: its top along the centre line, the inner faces of the head and foot boards
    ys = np.linspace(lo.y + 0.02, hi.y - 0.02, 80)
    tops = [top(0.0, float(y)) for y in ys]
    flat = np.median([t for t in tops if t is not None])
    inner = [y for y, t in zip(ys, tops) if t is not None and t < flat + 0.18]
    y_foot, y_head = min(inner) + 0.02, max(inner) - 0.02
    xs_ = np.linspace(0.0, hi.x, 40)
    side_tops = [top(float(x), (y_foot + y_head) / 2) for x in xs_]
    x_mat = max(x for x, t in zip(xs_, side_tops) if t is not None and t > flat - 0.05)
    log(f"bed: mattress top {flat:.3f} m, inside the boards y {y_foot:.2f}..{y_head:.2f}, half width {x_mat:.2f}")
    parts = []
    cov = coverlet(name + "_coverlet", top, flat, x_mat, hi.x, y_foot, y_head, lift, mt)
    parts.append(cov)
    # the bedding the pillows rest in: the bed model's own (its scanned pillows and sheet), the coverlet and the
    # turned-down sheet; everything over `z_cap` (the head board, the posts) is not bedding
    geo = [world_tris(o_) for o_ in (ob, cov) if o_ is not None]
    bed_tris = np.concatenate([P_[T_] for P_, T_ in geo])
    z_cap = float(flat) + 0.30
    bvh2 = BVHTree.FromPolygons([tuple(map(float, p)) for p in bed_tris.reshape(-1, 3)],
                                [(3 * i, 3 * i + 1, 3 * i + 2) for i in range(len(bed_tris))])

    def bedding(x, y):
        h_ = bvh2.ray_cast(Vector((x, y, z_cap)), Vector((0, 0, -1)))
        return h_[0].z if h_[0] is not None else None

    parts.append(pillows(name + "_pillows", bedding, bed_tris, flat, x_mat, y_head, z_cap, mt))
    box = place_piece(fr, piece, ob, lo, hi)
    for p in parts:
        if p is not None:
            p.matrix_world = ob.matrix_world @ p.matrix_world
            register(p, "cloth", piece["id"] + ":" + p.name.rsplit("_", 1)[-1])
    return ob, box, {}


# a day bed's tuned numbers (G7): the pillows' depth and the half width they may take, how far under the mattress's
# top the cover hangs, where its top run ends (nearly at the head: no turned-down sheet on a day bed) and how much
# over the mattress a surface may stand and still be the mattress (a back rail stands higher)
DAY_BED = dict(pillow_depth=0.40, pillow_x=0.30, hem_drop=0.22, turn=0.97, rail=0.18)
BED_TURN = {("x", "+"): 90.0, ("x", "-"): -90.0, ("y", "+"): 0.0, ("y", "-"): 180.0}


def blanket_mat(mt: dict, colour: str | None):
    """A day bed's plain wool blanket, in `colour` (the look's linen by default)."""
    key = nm("M_blanket")
    if key in MATS:
        return MATS[key]
    cc = hex_lin(colour or CFG["look"]["linen"])
    return RMat("M_blanket", mt.get("wool"), tuple(min(1.0, v / 0.8) for v in cc), rough=0.95, kind="cloth", albedo=cc,
                note="a day bed's blanket")


def build_day_bed(fr: Frame, piece: dict, spec: dict, name: str, mt: dict):
    """A day bed (room file v2, G7: `spec.bed` an object of kind `day`): its Poly Haven model at its scale, made up
    with the same cover and pillows as the Gothic bed (`coverlet`, `pillows`, their keywords set to DAY_BED), built in
    the bed's own frame: the model turned so its long axis (`bed.axis`) is y and its head (`bed.head`) +y, which
    those two assume, then turned back, so the piece's `face` is the model's own front. The mattress is probed by
    ray (its top along the centre line; along y, the run under the ends' height; across, the run round the centre
    line no higher than DAY_BED["rail"] over the top, which leaves out a back rail), or given (`bed.mattress`, in
    the model's own metres). Returns (object, box, the manifest's `made`)."""
    pid = piece["id"]
    bv = rf.bed_values(piece, spec, f"piece {pid}")
    k = float(spec.get("scale", 1.0))
    ob, lo, hi = ph_object(name, spec["slug"], k, lod=spec.get("lod"))
    swap_ph_materials(ob)
    me = ob.data
    long_x = (hi.x - lo.x) > (hi.y - lo.y)
    if long_x != (bv["axis"] == "x"):
        raise SystemExit(f"meshy_room_build: piece {pid}: {spec['slug']} is {hi.x - lo.x:.2f} m along x and "
                         f"{hi.y - lo.y:.2f} m along y: its long axis is {'x' if long_x else 'y'}; say so in bed.axis")
    T = Matrix.Rotation(math.radians(BED_TURN[(bv["axis"], bv["head"])]), 4, "Z")
    verts = [T @ v.co for v in me.vertices]
    bvh = BVHTree.FromPolygons(verts, [tuple(p.vertices) for p in me.polygons])
    cs = [T @ Vector((x, y, 0.0)) for x in (lo.x, hi.x) for y in (lo.y, hi.y)]
    X0, X1 = min(c.x for c in cs), max(c.x for c in cs)
    Y0, Y1 = min(c.y for c in cs), max(c.y for c in cs)

    def top0(x, y):
        h_ = bvh.ray_cast(Vector((x, y, hi.z + 1.0)), Vector((0, 0, -1)))
        return h_[0].z if h_[0] is not None else None

    rail = DAY_BED["rail"]
    if bv["mattress"] is not None:
        mx0, mx1, my0, my1, flat = (float(v) for v in bv["mattress"])
        mc = [T @ Vector((x, y, 0.0)) for x in (mx0, mx1) for y in (my0, my1)]
        xa, xb = min(c.x for c in mc), max(c.x for c in mc)
        y_foot, y_head = min(c.y for c in mc), max(c.y for c in mc)
        how = "given"
    else:
        ys = np.linspace(Y0 + 0.02, Y1 - 0.02, 80)
        tops = [top0(0.0, float(y)) for y in ys]
        if not [t for t in tops if t is not None]:
            raise SystemExit(f"meshy_room_build: piece {pid}: no mattress found along {spec['slug']}'s centre line: "
                             f"give bed.mattress")
        flat = float(np.median([t for t in tops if t is not None]))
        inner = [y for y, t in zip(ys, tops) if t is not None and t < flat + rail]
        y_foot, y_head = min(inner) + 0.02, max(inner) - 0.02
        xs_ = np.linspace(X0 + 0.01, X1 - 0.01, 81)
        ok = [t is not None and flat - 0.05 < t < flat + rail for t in (top0(float(x), (y_foot + y_head) / 2)
                                                                        for x in xs_)]
        i0 = int(np.argmin(np.abs(xs_)))
        if not ok[i0]:
            raise SystemExit(f"meshy_room_build: piece {pid}: the probe found no mattress at {spec['slug']}'s centre: "
                             f"give bed.mattress")
        a_, b_ = i0, i0
        while a_ > 0 and ok[a_ - 1]:
            a_ -= 1
        while b_ < len(ok) - 1 and ok[b_ + 1]:
            b_ += 1
        xa, xb = float(xs_[a_]), float(xs_[b_])
        how = "probed"
    xc, half = (xa + xb) / 2, (xb - xa) / 2
    log(f"day bed {pid}: mattress {how}: top {flat:.3f} m, x {xa:.2f}..{xb:.2f}, y {y_foot:.2f}..{y_head:.2f} in the "
        f"bed's frame (its head +y)")

    def top(x, y):
        return top0(x + xc, y)

    parts = []
    cov = None
    if bv["cover"] != "none":
        cmat = mt["coverlet"] if bv["cover"] == "coverlet" else blanket_mat(mt, bv["colour"])
        cov = coverlet(name + "_coverlet", top, flat, half, half, y_foot, y_head, 0.0, mt, mat=cmat,
                       hem=max(flat - DAY_BED["hem_drop"], 0.08), turn=DAY_BED["turn"], sheet=False)
        parts.append(cov)
    # the bedding the pillows rest in: the model's own surfaces and the cover, in the bed's frame shifted by -xc
    P_, T_ = world_tris(ob)
    R3 = np.array(T.to_3x3())
    P_ = P_ @ R3.T - np.array([xc, 0.0, 0.0])
    geo = [P_[T_]] + ([world_tris(cov)[0][world_tris(cov)[1]]] if cov is not None else [])
    bed_tris = np.concatenate(geo)
    z_cap = flat + 0.30
    bvh2 = BVHTree.FromPolygons([tuple(map(float, p)) for p in bed_tris.reshape(-1, 3)],
                                [(3 * i, 3 * i + 1, 3 * i + 2) for i in range(len(bed_tris))])

    def bedding(x, y):
        h_ = bvh2.ray_cast(Vector((x, y, z_cap)), Vector((0, 0, -1)))
        return h_[0].z if h_[0] is not None else None

    parts.append(pillows(name + "_pillows", bedding, bed_tris, flat, half, y_head, z_cap, mt, count=bv["pillows"],
                         depth=DAY_BED["pillow_depth"], x_max=DAY_BED["pillow_x"]))
    back = T.inverted() @ Matrix.Translation((xc, 0.0, 0.0))     # the bed's frame back to the model's
    box = place_piece(fr, piece, ob, lo, hi)
    for p in parts:
        if p is not None:
            p.matrix_world = ob.matrix_world @ back @ p.matrix_world
            register(p, "cloth", pid + ":" + p.name.rsplit("_", 1)[-1])
    made = dict(kind=bv["kind"], axis=bv["axis"], head=bv["head"], cover=bv["cover"], pillows=bv["pillows"],
                mattress=dict(how=how, top=round(flat, 3), x=[round(xa, 3), round(xb, 3)],
                              y=[round(y_foot, 3), round(y_head, 3)]))
    return ob, box, made


def coverlet(name: str, top, flat: float, x_mat: float, x_rail: float, y_foot: float, y_head: float, lift: float,
             mt: dict, mat=None, hem: float | None = None, turn: float = 0.66, sheet: bool = True):
    """The coverlet: over the mattress from the foot board to the turn-down, rounding the mattress edge and the side
    rail, hanging in folds to a hem 30 cm off the floor; the sheet turned down over its head end. The keywords are
    a day bed's (G7): its cover's material (the damask M_coverlet by default), the hem's height (`lift` + 8 cm by
    default), the turn-down's place along the bed (0.66) and whether the sheet is turned down over it."""
    b = Builder()
    cmat = mt["coverlet"] if mat is None else mat
    y_turn = y_foot + (y_head - y_foot) * turn
    hem = lift + 0.08 if hem is None else hem
    xh = x_rail + 0.028
    # the top runs from the foot to the turn-down; the sides hang on to the head board, so the candle beside the
    # head lights no floor under the bed (the under-bed hide reads dark from every side)
    y_end = y_head - 0.01
    ny_top = grid_count(y_turn - y_foot, 0.04)
    ny_ = ny_top + grid_count(y_end - y_turn, 0.04)
    # the section across the bed (x >= 0 half, mirrored): (x, z offset kind); built from the mattress top outward
    nxt = 16
    for half in (-1.0, 1.0):
        rows = []
        for j in range(ny_ + 1):
            y = y_foot + (y_turn - y_foot) * j / ny_top if j <= ny_top else \
                y_turn + (y_end - y_turn) * (j - ny_top) / (ny_ - ny_top)
            sec = []
            for i in range(nxt + 1):
                x = x_mat * 0.92 * i / nxt
                t_ = top(half * x, y) or flat
                # never more than 3 cm over the flat mattress: by the head board the ray meets the posts, and the
                # side strip climbed them into a pale plank beside the head board
                sec.append((x, min(max(t_, flat - 0.01), flat + 0.03) + 0.014))
            z_edge = sec[-1][1]
            for i in range(1, 7):     # round the mattress edge and the rail
                a = math.pi / 2 * i / 6
                sec.append((x_mat * 0.92 + (xh - x_mat * 0.92) * math.sin(a), z_edge - 0.05 * (1 - math.cos(a))))
            zt = sec[-1][1]
            nh = grid_count(zt - hem, 0.04)
            for i in range(1, nh + 1):
                z = zt - (zt - hem) * i / nh
                f = (zt - z) / max(zt - hem, 1e-3)
                fold = 0.022 * f * math.sin(2 * math.pi * (y - y_foot) / 0.21 + 0.8 * half) + 0.012 * f * f
                sec.append((xh + fold, z))
            rows.append([(half * sx, y, sz) for sx, sz in sec])
        for j in range(ny_):
            for i in range(len(rows[0]) - 1):
                if j >= ny_top and i < nxt:    # past the turn-down only the sides hang on
                    continue
                q = [rows[j][i], rows[j + 1][i], rows[j + 1][i + 1], rows[j][i + 1]]
                if half > 0:
                    q = q[::-1]
                arcs = [(abs(p[0]) + max(0.0, flat - p[2])) for p in q]
                b.face(q, [(p[1] / 0.253, a / 0.384) for p, a in zip(q, arcs)], cmat)
    cov = b.build(name, smooth=True)
    _orient_from_axis(cov, flat - 0.25)
    if not sheet:
        return cov
    # the turned-down sheet: a band lying over the coverlet's head end, its fold rolled toward the pillows
    s = Builder()
    y0, y1 = y_turn - 0.20, y_turn + 0.015
    nxs = 30
    for i in range(nxs):
        xa, xb = -xh + 2 * xh * i / nxs, -xh + 2 * xh * (i + 1) / nxs
        for (ya, yb) in [(y0 + (y1 - y0) * j / 6, y0 + (y1 - y0) * (j + 1) / 6) for j in range(6)]:
            def zf(x, y):
                ax = abs(x)
                base = (top(min(max(x, -x_mat * 0.9), x_mat * 0.9), y) or flat) + 0.03
                if ax > x_mat * 0.92:
                    base -= 0.05 * min(1.0, (ax - x_mat * 0.92) / (xh - x_mat * 0.92 + 1e-6))
                roll = 0.012 * math.sin(math.pi * (y - y0) / (y1 - y0))
                return base + roll
            q = [(xa, ya, zf(xa, ya)), (xb, ya, zf(xb, ya)), (xb, yb, zf(xb, yb)), (xa, yb, zf(xa, yb))]
            s.face(q, [(p[0] / 0.3, p[1] / 0.3) for p in q], mt["linen"])
    band = s.build(name + "_sheet", smooth=True)
    _orient_from_axis(band, flat - 0.25)
    return _join([cov, band], name)


def _gauss(a: np.ndarray, sigma: float, radius: int | None = None) -> np.ndarray:
    """A separable Gaussian over a 2D array, edges repeated, the kernel cut at `radius` cells."""
    r = int(radius if radius is not None else max(1, round(3 * sigma)))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / max(sigma, 1e-6)) ** 2)
    k /= k.sum()
    p = np.pad(a, ((r, r), (0, 0)), mode="edge")
    a = sum(p[i:i + a.shape[0]] * k[i] for i in range(2 * r + 1))
    p = np.pad(a, ((0, 0), (r, r)), mode="edge")
    return sum(p[:, i:i + a.shape[1]] * k[i] for i in range(2 * r + 1))


def _dilate(a: np.ndarray, r: int) -> np.ndarray:
    """Each cell's largest value within r cells (a square window)."""
    p = np.pad(a, r, mode="edge")
    out = a.copy()
    for i in range(2 * r + 1):
        for j in range(2 * r + 1):
            out = np.maximum(out, p[i:i + a.shape[0], j:j + a.shape[1]])
    return out


class _Sheet:
    """A height field over a grid of lattice lines (iu x iv), each cell cut along its (0,0)-(1,1) diagonal: where
    sample points fall in it, and its heights raised until it clears them."""

    def __init__(self, iu, iv, ul, vl, X, Y, Z):
        self.iu, self.iv = np.asarray(iu), np.asarray(iv)
        self.n_u, self.n_v = len(iu), len(iv)
        self.us, self.vs = ul[self.iu], vl[self.iv]
        self.X, self.Y = X[np.ix_(iu, iv)], Y[np.ix_(iu, iv)]
        self.Z = Z[np.ix_(iu, iv)].astype(float).copy()

    def locate(self, SX, SY, SU, SV) -> tuple:
        """Each sample's triangle (its three vertex ids) and its weights there."""
        n_v = self.n_v
        P_ = np.clip(np.searchsorted(self.us, SU, side="right") - 1, 0, self.n_u - 2)
        Q_ = np.clip(np.searchsorted(self.vs, SV, side="right") - 1, 0, n_v - 2)
        A, B, C, D = P_ * n_v + Q_, (P_ + 1) * n_v + Q_, (P_ + 1) * n_v + Q_ + 1, P_ * n_v + Q_ + 1
        xf, yf = self.X.ravel(), self.Y.ravel()

        def bary(ia, ib, ic):
            den = (xf[ib] - xf[ia]) * (yf[ic] - yf[ia]) - (xf[ic] - xf[ia]) * (yf[ib] - yf[ia])
            den = np.where(np.abs(den) < 1e-14, 1e-14, den)
            w1 = ((SX - xf[ia]) * (yf[ic] - yf[ia]) - (xf[ic] - xf[ia]) * (SY - yf[ia])) / den
            w2 = ((xf[ib] - xf[ia]) * (SY - yf[ia]) - (SX - xf[ia]) * (yf[ib] - yf[ia])) / den
            return np.stack([1 - w1 - w2, w1, w2], 1)

        w_lo, w_up = bary(A, B, C), bary(A, C, D)
        lo = w_lo.min(1) >= w_up.min(1)
        tv = np.where(lo[:, None], np.stack([A, B, C], 1), np.stack([A, C, D], 1))
        tw = np.clip(np.where(lo[:, None], w_lo, w_up), 0.0, None)
        return tv, tw / tw.sum(1, keepdims=True)

    def at(self, loc) -> np.ndarray:
        tv, tw = loc
        return (self.Z.ravel()[tv] * tw).sum(1)

    def clear(self, loc, need: np.ndarray) -> int:
        """Raise the sheet until it is at least `need` at every sample: of a triangle's corners only those still
        under the sample rise (a corner already above it stays where it is), by what the sample lacks over their
        share of it, and no higher than the sample itself. Returns the passes it took."""
        tv, tw = loc
        Zv = self.Z.ravel().copy()
        it = 0
        for it in range(300):
            Zk = Zv[tv]
            viol = need - (Zk * tw).sum(1)
            bad = viol > 2e-5
            if not bad.any():
                break
            low = Zk[bad] < need[bad][:, None]
            share = np.maximum((tw[bad] * low).sum(1), 1e-6)
            rise = np.where(low, np.minimum(need[bad][:, None] - Zk[bad], (viol[bad] / share)[:, None]), 0.0)
            up = np.zeros_like(Zv)
            for k in range(3):
                np.maximum.at(up, tv[bad][:, k], rise[:, k])
            Zv += up
        self.Z = Zv.reshape(self.n_u, self.n_v)
        return it + 1

    def arc_uv(self, uv_m: float) -> tuple:
        """UVs in metres / uv_m along the surface: the arc length along each grid line from the middle line, so a
        weave is not stretched over a steep shoulder."""
        Pz = np.stack([self.X, self.Y, self.Z], -1)
        s_u = np.zeros((self.n_u, self.n_v))
        s_u[1:] = np.cumsum(np.linalg.norm(np.diff(Pz, axis=0), axis=-1), axis=0)
        s_u -= s_u[self.n_u // 2][None, :]
        s_v = np.zeros((self.n_u, self.n_v))
        s_v[:, 1:] = np.cumsum(np.linalg.norm(np.diff(Pz, axis=1), axis=-1), axis=1)
        s_v -= s_v[:, self.n_v // 2][:, None]
        return s_u / uv_m, s_v / uv_m

    def ring(self) -> list:
        """The rim's vertices in order round the sheet, each with its place along the rim in lattice steps."""
        n_u, n_v, iu, iv = self.n_u, self.n_v, self.iu, self.iv
        nu, nv = int(iu[-1]), int(iv[-1])
        out = [((p, 0), float(iu[p])) for p in range(n_u)]
        out += [((n_u - 1, q), nu + float(iv[q])) for q in range(1, n_v)]
        out += [((p, n_v - 1), nu + nv + float(nu - iu[p])) for p in range(n_u - 2, -1, -1)]
        out += [((0, q), 2 * nu + nv + float(nv - iv[q])) for q in range(n_v - 2, 0, -1)]
        return out


def soft_pillow(top, tris: np.ndarray, x0: float, x1: float, y0: float, y1: float, seed: int = 0,
                step: float = 0.02, fine: float = 0.0045, clear: float = 0.0025, rim: float = 0.016,
                plump: float = 0.065, min_t: float = 0.018, round_c: float = 0.25, cliff: float = 0.011,
                z_cap: float = 1e9, uv_m: float = 0.3) -> dict:
    """One soft pillow resting in the bedding over the rectangle x0..x1, y0..y1 (rounded at the corners): a closed
    mesh whose underside follows the bedding `clear` above it and never through it, and whose top is a plump
    cushion over the bedding's own large shape (round 4's pillows were rigid lenses propped on the bed model's own
    scanned pillows: 16 % of each footprint touched, the rims stood 7 to 20 cm clear).

    `top(x, y)` is the highest bedding surface under a vertical line (None where there is none); `tris` (N x 3 x 3)
    are the bedding's own triangles in the same frame. The bedding is sampled on a `fine` lattice. The top's grid
    takes every `step` of it; the underside's grid takes those lines and every lattice line where the bedding steps
    by more than `cliff` between neighbours (the edge of the bed model's own pillows under it), so the underside's
    triangles are narrow where the bedding is steep. Each underside triangle is then raised until nothing of the
    bedding is above it: checked at the lattice's nodes and at the bedding's own vertices and along its edges (a
    surface of flat triangles is highest along its edges), every 1.5 mm. The side joins the two rims. UVs are arc
    lengths along the surface (the weave is not stretched over the shoulders).
    Returns dict(verts, faces, uvs (per face corner), stats)."""
    rng = np.random.default_rng(1871 + seed)
    cx, cy, a, b = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2
    nu, nv = int(math.ceil(2 * a / fine)), int(math.ceil(2 * b / fine))
    ul, vl = np.linspace(-1, 1, nu + 1), np.linspace(-1, 1, nv + 1)
    U, Vv = np.meshgrid(ul, vl, indexing="ij")
    X = cx + a * U * np.sqrt(1 - round_c * Vv * Vv / 2)
    Y = cy + b * Vv * np.sqrt(1 - round_c * U * U / 2)

    def to_uv(x, y):
        xn, yn = (x - cx) / a, (y - cy) / b
        u, v = xn.copy(), yn.copy()
        for _ in range(30):
            u = xn / np.sqrt(np.maximum(1 - round_c * np.clip(v, -1.2, 1.2) ** 2 / 2, 0.2))
            v = yn / np.sqrt(np.maximum(1 - round_c * np.clip(u, -1.2, 1.2) ** 2 / 2, 0.2))
        return u, v

    def tops(xs, ys, default):
        out = np.empty(len(xs))
        for k in range(len(xs)):
            z = top(float(xs[k]), float(ys[k]))
            out[k] = default if (z is None or z > z_cap) else z
        return out

    low_t = tris[tris[:, :, 2].max(1) < z_cap] if len(tris) else tris
    zmed = float(np.median(low_t[:, :, 2])) if len(low_t) else 0.0
    Zf = tops(X.ravel(), Y.ravel(), zmed).reshape(X.shape)
    # the grids' lines: every `step`, and for the underside where the bedding steps
    kq = max(1, round(step / fine))

    def lines(n, jump):
        base = sorted(set(int(round(v)) for v in np.linspace(0, n, max(2, int(round(n / kq)) + 1))))
        thr = cliff
        while True:
            extra = set()
            for i in np.nonzero(jump > thr)[0]:
                extra.update((int(i), int(i) + 1))
            if len(extra) <= 1.3 * len(base) or thr > 0.08:
                break
            thr *= 1.25
        return np.array(base), np.array(sorted(set(base) | extra)), thr

    bu_, iu, thr_u = lines(nu, np.abs(np.diff(Zf, axis=0)).max(1))
    bv_, iv, thr_v = lines(nv, np.abs(np.diff(Zf, axis=1)).max(0))
    # what the underside must clear: the lattice's nodes, the bedding's vertices and points along its edges
    lo_xy, hi_xy = np.array([x0 - 0.01, y0 - 0.01]), np.array([x1 + 0.01, y1 + 0.01])
    near = ((tris[:, :, :2].max(1) >= lo_xy) & (tris[:, :, :2].min(1) <= hi_xy)).all(1) & \
        (tris[:, :, 2].min(1) < z_cap)
    T = tris[near]
    ed = np.concatenate([T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]]) if len(T) else np.zeros((0, 2, 3))
    if len(ed):
        swap = np.zeros(len(ed), bool)          # each edge once: its ends in a fixed order
        tie = np.ones(len(ed), bool)
        for ax in range(3):
            swap |= tie & (ed[:, 0, ax] > ed[:, 1, ax])
            tie &= ed[:, 0, ax] == ed[:, 1, ax]
        ed[swap] = ed[swap][:, ::-1]
        _u, first = np.unique(np.round(ed.reshape(len(ed), 6) / 1e-5).astype(np.int64), axis=0, return_index=True)
        ed = ed[first]
    pts = []
    for e0, e1 in ed:
        n = max(1, int(math.ceil(float(np.linalg.norm(e1[:2] - e0[:2])) / 0.0015)))
        t = np.linspace(0.0, 1.0, n + 1)[:, None]
        pts.append(e0[None] * (1 - t) + e1[None] * t)
    pts = np.concatenate(pts) if pts else np.zeros((0, 3))
    su, sv, pz = np.zeros(0), np.zeros(0), np.zeros(0)
    if len(pts):
        su, sv = to_uv(pts[:, 0], pts[:, 1])
        ins = (np.abs(su) <= 1) & (np.abs(sv) <= 1) & (pts[:, 2] < z_cap)
        pts, su, sv = pts[ins], su[ins], sv[ins]
        pz = np.maximum(pts[:, 2], tops(pts[:, 0], pts[:, 1], -1e9))
        keep = pz < z_cap
        pts, su, sv, pz = pts[keep], su[keep], sv[keep], pz[keep]
    n_lat = X.size
    SX, SY = np.concatenate([X.ravel(), pts[:, 0]]), np.concatenate([Y.ravel(), pts[:, 1]])
    SU, SV = np.concatenate([U.ravel(), su]), np.concatenate([Vv.ravel(), sv])
    need = np.concatenate([Zf.ravel(), pz]) + clear
    under = _Sheet(iu, iv, ul, vl, X, Y, Zf + clear)
    loc_u = under.locate(SX, SY, SU, SV)
    passes = under.clear(loc_u, need)
    at_u = under.at(loc_u)
    Uf = at_u[:n_lat].reshape(X.shape)                 # the underside at the lattice's nodes
    gap = Uf - Zf
    least = float((at_u - (need - clear)).min())
    # the top: a plump cushion over the bedding's large shape
    base = _gauss(_dilate(Zf, 2), 0.055 / fine)
    prof = np.sqrt(np.clip(1 - np.abs(U) ** 2.6, 0, 1)) * np.sqrt(np.clip(1 - np.abs(Vv) ** 2.6, 0, 1))
    du, dv = float(rng.uniform(-0.18, 0.18)), float(rng.uniform(-0.12, 0.2))
    dent = 1.0 - 0.22 * np.exp(-(((U - du) / 0.62) ** 2 + ((Vv - dv) / 0.66) ** 2) / 0.5)     # where a head lay
    ph = rng.uniform(0, 2 * math.pi, 4)
    lump = (0.5 * np.sin(2.3 * U + ph[0]) * np.sin(1.9 * Vv + ph[1]) + 0.35 * np.sin(4.1 * U + 1.3 * Vv + ph[2]) +
            0.25 * np.sin(3.3 * Vv - 2.2 * U + ph[3]))
    Tf = base + rim + plump * prof * dent * (1.0 + 0.07 * lump)
    # never thinner than min_t over the underside: a smooth envelope of it, the smooth larger of the two, and the
    # top's own (coarser) triangles raised where they still dip under it
    r_env = max(2, int(round(0.02 / fine)))
    env = _gauss(_dilate(Uf + min_t, r_env), r_env / 2.0, radius=r_env)
    Tf = 0.5 * (Tf + env + np.sqrt((Tf - env) ** 2 + 0.006 ** 2))
    over = _Sheet(bu_, bv_, ul, vl, X, Y, Tf)
    loc_t = over.locate(X.ravel(), Y.ravel(), U.ravel(), Vv.ravel())
    over.clear(loc_t, (Uf + min_t).ravel())
    thick = over.at(loc_t).reshape(X.shape) - Uf
    verts, ids = [], {}

    def vert(sheet, kind, p, q):
        key_ = (kind, p, q)
        if key_ not in ids:
            ids[key_] = len(verts)
            verts.append((float(sheet.X[p, q]), float(sheet.Y[p, q]), float(sheet.Z[p, q])))
        return ids[key_]

    faces, uvs = [], []
    tu, tv = over.arc_uv(uv_m)
    bu, bv = under.arc_uv(uv_m)
    off_b = float(tu.max() - bu.min()) + 0.4       # the underside's island beside the top's
    for sheet, kind, (uu, vv), off, flip in ((over, "t", (tu, tv), 0.0, False), (under, "b", (bu, bv), off_b, True)):
        for p in range(sheet.n_u - 1):
            for q in range(sheet.n_v - 1):
                for tri in (((p, q), (p + 1, q), (p + 1, q + 1)), ((p, q), (p + 1, q + 1), (p, q + 1))):
                    tri = tri[::-1] if flip else tri
                    faces.append(tuple(vert(sheet, kind, *k) for k in tri))
                    uvs.append([(uu[k] + off, vv[k]) for k in tri])
    # the side: the top's rim (coarse) zipped to the underside's (fine) along the rim; the weave carried on down it
    r_t, r_b = over.ring(), under.ring()
    per = float(2 * (nu + nv))
    s_t = np.array([s for _k, s in r_t] + [per])
    uv_t = np.array([(tu[k], tv[k]) for k, _s in r_t] + [(tu[r_t[0][0]], tv[r_t[0][0]])])
    z_t = np.array([over.Z[k] for k, _s in r_t] + [over.Z[r_t[0][0]]])

    def wall_uv(k, s):
        """An underside rim vertex's UV on the side: the top rim's there, moved out by the side's height."""
        j = int(np.clip(np.searchsorted(s_t, s, side="right") - 1, 0, len(s_t) - 2))
        f = (s - s_t[j]) / max(s_t[j + 1] - s_t[j], 1e-9)
        base_uv = uv_t[j] * (1 - f) + uv_t[j + 1] * f
        h = (float(z_t[j] * (1 - f) + z_t[j + 1] * f) - float(under.Z[k])) / uv_m
        ox = -1.0 if k[0] == 0 else 1.0 if k[0] == under.n_u - 1 else 0.0
        oy = -1.0 if k[1] == 0 else 1.0 if k[1] == under.n_v - 1 else 0.0
        nrm = math.hypot(ox, oy) or 1.0
        return (float(base_uv[0] + h * ox / nrm), float(base_uv[1] + h * oy / nrm))

    i = j = 0
    n_t, n_b = len(r_t), len(r_b)
    while i < n_t or j < n_b:
        kt = r_t[i % n_t][0]
        kb, sb = r_b[j % n_b][0], (r_b[j][1] if j < n_b else per)
        st1 = r_t[i + 1][1] if i + 1 < n_t else per
        sb1 = r_b[j + 1][1] if j + 1 < n_b else per
        if j < n_b and (i >= n_t or sb1 <= st1):       # along the underside's rim
            kb1 = r_b[(j + 1) % n_b][0]
            faces.append((vert(over, "t", *kt), vert(under, "b", *kb), vert(under, "b", *kb1)))
            uvs.append([tuple(uv_t[i if i < n_t else n_t]), wall_uv(kb, sb), wall_uv(kb1, sb1)])
            j += 1
        else:                                          # along the top's rim
            kt1 = r_t[(i + 1) % n_t][0]
            faces.append((vert(over, "t", *kt), vert(under, "b", *kb), vert(over, "t", *kt1)))
            uvs.append([tuple(uv_t[i]), wall_uv(kb, sb), tuple(uv_t[i + 1])])
            i += 1
    stats = dict(grid_top=[over.n_u, over.n_v], grid_under=[under.n_u, under.n_v], lattice=[nu + 1, nv + 1],
                 steep_thresholds=[round(thr_u, 4), round(thr_v, 4)], verts=len(verts), faces=len(faces),
                 passes=passes, bedding_edge_samples=int(len(pz)),
                 air_over_1cm_share=round(float((gap > 0.01).mean()), 4), air_max=round(float(gap.max()), 4),
                 air_median=round(float(np.median(gap)), 4), least_clearance=round(least, 5),
                 thick_min=round(float(thick.min()), 4), thick_max=round(float(thick.max()), 4),
                 top_max=round(float(over.Z.max()), 4), bedding=[round(float(Zf.min()), 3), round(float(Zf.max()), 3)])
    return dict(verts=np.array(verts), faces=faces, uvs=uvs, stats=stats)


PILLOW_STATS: list = []     # each pillow's own measure of how it sits (the manifest's `pillows`)


def pillows(name: str, bedding, bed_tris: np.ndarray, flat: float, x_mat: float, y_head: float, z_cap: float,
            mt: dict, count: int = 2, depth: float = 0.47, x_max: float = 0.565, gap: float = 0.012):
    """Two soft pillows side by side at the head board, each resting in the bedding (soft_pillow): over the bed
    model's own scanned pillows and sheet, 2.5 mm clear of them everywhere they can be, nothing poking through. The
    keywords are a day bed's (G7): how many side by side (none: no object), their depth along the bed, the half
    width they may take and half the gap between two."""
    if count < 1:
        return None
    b = Builder()
    x_in, x_out = gap, min(x_max, x_mat * 0.95)
    y_b = y_head - 0.02
    y_f = y_b - depth
    PILLOW_STATS.clear()
    if count == 2:
        spans = ((-x_out, -x_in), (x_in, x_out))
    else:
        pw = (2 * x_out - (count - 1) * 2 * x_in) / count
        spans = tuple((-x_out + i * (pw + 2 * x_in), -x_out + i * (pw + 2 * x_in) + pw) for i in range(count))
    for k, (xa, xb) in enumerate(spans):
        r = soft_pillow(bedding, bed_tris, xa, xb, y_f, y_b, seed=k, z_cap=z_cap)
        for f, uv in zip(r["faces"], r["uvs"]):
            b.face([r["verts"][i] for i in f], uv, mt["linen"])
        PILLOW_STATS.append(r["stats"])
        log(f"pillow {k + 1}: " + json.dumps(r["stats"]))
    ob = b.build(name, smooth=True)
    _orient_out(ob)
    return ob


def _orient_from_axis(ob, z_axis: float) -> None:
    """Point a cloth's faces away from the bed's long axis (x = 0, z = z_axis): up on the top, out on the sides."""
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    flips = []
    for f in bm.faces:
        c = f.calc_center_median()
        out = Vector((c.x, 0.0, c.z - z_axis))
        if f.normal.dot(out) < 0:
            flips.append(f)
    if flips:
        bmesh.ops.reverse_faces(bm, faces=flips)
    bm.to_mesh(me)
    bm.free()


def _orient_out(ob) -> None:
    """Make a closed mesh's normals consistent and outward."""
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()


def _join(objs: list, name: str):
    objs = [o for o in objs if o is not None]
    if not objs:
        return None
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    return ob


# ---------------------------------------------------------------- his photographs


PHOTOS = (   # slug, scale, x along the wall, centre height, print, decimate
    ("hanging_picture_frame_03", 1.0, 0.0, 1.78, "portrait", 0.12),
    ("hanging_picture_frame_03", 0.75, -0.41, 1.70, "profile", 0.10),
    ("hanging_picture_frame_03", 0.75, 0.41, 1.70, "standing", 0.10),
    ("fancy_picture_frame_02", 0.36, -0.19, 1.28, "couple", 0.07),
    ("fancy_picture_frame_02", 0.32, 0.20, 1.30, "seated", 0.07),
)


def build_photos(fr: Frame, piece: dict, name: str):
    """His photographs (canon: "his photographs over the bed") on the wall at eye height: round 3's Poly Haven
    frames hung flat, their scanned pictures swapped for sepia portraits of him (and the two of them)."""
    pl = piece["place"]
    side, along = pl[1], pl[2]
    face = {"N": "S", "S": "N", "E": "W", "W": "E"}[side]
    R = face_matrix(face)
    s_mid = fr.to_s(side, along)
    rise = float(piece.get("rise", 0.0))     # the group hung this much higher (over a head board)
    objs = []
    lo_all, hi_all = [1e9] * 3, [-1e9] * 3
    for i, (slug, kk, x, zc, variant, lod) in enumerate(PHOTOS):
        zc = zc + rise
        drop = mib.PHOTO_DROP.get(slug, ())
        m = mib.ph_master(slug, None, drop, lod)
        me = m.data.copy()
        dims = Vector(m["wdi_dims"]) * kk
        me.transform(Matrix.Diagonal((kk, kk, kk, 1.0)))
        ob = bpy.data.objects.new(f"{name}_{i + 1}", me)
        COL["room"].objects.link(ob)
        mat_name, ub, vb_ = mib.PHOTO_PRINT[slug]
        img = print_texture(variant, ub, vb_, slug)
        pm = MATS.get(nm(f"M_print_{variant}")) or RMat(f"M_print_{variant}", img, (1.0, 1.0, 1.0), rough=0.5,
                                                         albedo=tuple(scan_mean(img)))
        for si, slot in enumerate(ob.material_slots):
            if slot.material is not None and re.sub(r"\.\d{3}$", "", slot.material.name) == mat_name:
                ob.data.materials[si] = pm.mat
        swap_ph_materials(ob, size=512)
        # flat on the wall: its back against the plaster, its centre at (along + x, zc)
        p = fr.point(side, s_mid - x, dims.y / 2 + 0.004, zc - dims.z / 2)   # x: to the viewer's right
        ob.matrix_world = Matrix.Translation(p) @ R
        bb = world_bbox(ob)
        for a in range(3):
            lo_all[a], hi_all[a] = min(lo_all[a], bb[a]), max(hi_all[a], bb[a + 3])
        objs.append(ob)
    for o in objs[1:]:
        register(o, "piece", piece["id"] + ":" + o.name.rsplit("_", 1)[-1])
    return objs[0], (*lo_all, *hi_all)


def print_texture(variant: str, ub, vb_, slug: str):
    """A frame's picture texture: the sepia portrait inside the frame's own UV box of the picture."""
    key = f"T_print_{variant}"
    if bpy.data.images.get(nm(key)):
        return bpy.data.images[nm(key)]
    S_ = 512
    (u0, u1), (v0, v1) = ub, vb_
    pw, ph = int(round((u1 - u0) * S_)), int(round((v1 - v0) * S_))
    art = portrait(variant, pw, ph)
    full = np.ones((S_, S_, 3)) * art.mean(axis=(0, 1))
    x0, y0 = int(round(u0 * S_)), int(round(v0 * S_))
    full[y0:y0 + ph, x0:x0 + pw] = art[::-1]       # the portrait is drawn top row first; Blender's rows run up
    return save_image(key, full)


def portrait(variant: str, w: int, h: int, seed: int = 0) -> np.ndarray:
    """A faded Victorian cabinet photograph of him (linear RGB, top row first): a sitter modelled in soft light from
    the upper left (a pseudo-3D head with a high hairline and a side parting, eyes under the brow, the nose's shade,
    ears, his moustache or beard, a white wing collar and tie, the coat's lapels on sloping shoulders); variants
    `portrait`, `profile`, `standing` (full length beside a column), `couple` (the two of them) and `seated` (bearded);
    then the studio's painted ground, an oval vignette, soft focus, grain and foxing, sepia-toned."""
    ss = 2
    H, W = h * ss, w * ss
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    X, Y = (xx - W / 2) / H, yy / H             # metric units: 1 = the picture's height; x centred, y down
    rng = np.random.default_rng(sum(ord(ch) * (i + 1) for i, ch in enumerate(variant)) + seed)
    t = np.zeros((H, W), np.float32)
    r = np.sqrt((X / 0.46) ** 2 + ((Y - 0.40) / 0.62) ** 2)
    # the studio's painted ground: a mid tone, lighter behind the head (round 4's pale ground and white faces read
    # as clip art; a cabinet photograph's sitter is a little lighter than its ground, all in mid tones)
    t[:] = 0.56 - 0.20 * np.clip(r, 0, 1.5) ** 1.5 + 0.035 * np.sin(6.0 * X + 3.0 * Y) + 0.02 * np.sin(23.0 * Y + X)
    light = np.array([-0.55, -0.45, 0.70])
    light = light / np.linalg.norm(light)

    def smooth_in(d, soft):
        return np.clip((1.0 - d) / soft, 0.0, 1.0)

    def lay(alpha, tone):
        t[:] = t * (1 - alpha) + tone * alpha

    def shaded(dx, dy, rx, ry, base, gain, ambient=0.45):
        nx, ny = dx / rx, dy / ry
        nz = np.sqrt(np.clip(1.0 - nx * nx - ny * ny, 0.0, 1.0))
        lam = np.clip(nx * light[0] + ny * light[1] + nz * light[2], 0.0, 1.0)
        return base * (ambient + (1 - ambient) * lam) + gain * lam ** 8

    def sitter(cx, top, s, woman=False, moustache=True, beard=False, coat=0.12, body_to=2.0):
        """A head-and-shoulders sitter, the head s tall (top of the skull to the chin), its top at `top`."""
        rx, ry = 0.37 * s, 0.5 * s
        hx, hy = cx, top + ry
        nb = hy + 0.62 * s                     # the neck's foot
        sw = (0.82 if not woman else 0.70) * s
        dyb = np.clip((Y - nb) / (0.32 * s), 0, 1)
        half = 0.20 * s + (sw - 0.20 * s) * (dyb * (2 - dyb))
        body = (Y > nb - 0.02 * s) & (np.abs(X - cx) < half) & (Y < body_to)
        shade = np.clip(0.5 + 0.5 * (cx - X) / sw, 0.0, 1.0)
        lay(body.astype(np.float32), coat * (0.75 + 0.6 * shade))
        if not woman:
            vee = (Y > nb - 0.01 * s) & (np.abs(X - cx) < (Y - nb + 0.02 * s) * 0.30) & (Y < nb + 0.30 * s)
            lay(vee.astype(np.float32), 0.46)
            for side_ in (-1, 1):
                lap = (Y > nb) & (np.abs((X - cx) * side_ - (Y - nb) * 0.42 - 0.012 * s) < 0.012 * s) & \
                    (Y < nb + 0.42 * s)
                lay(lap.astype(np.float32) * 0.6, coat + 0.12)
            tie = (np.abs(X - cx) < 0.035 * s) & (Y > nb - 0.01 * s) & (Y < nb + 0.07 * s)
            lay(tie.astype(np.float32), 0.10)
            knot = (np.abs(X - cx) < 0.016 * s) & (Y > nb + 0.06 * s) & (Y < nb + 0.30 * s)
            lay(knot.astype(np.float32), 0.14)
        else:
            col_ = ((Y - nb) ** 2 / (0.05 * s) ** 2 + (X - cx) ** 2 / (0.12 * s) ** 2) < 1.0
            lay(col_.astype(np.float32), 0.60)
            brooch = ((X - cx) ** 2 + (Y - nb - 0.07 * s) ** 2) < (0.02 * s) ** 2
            lay(brooch.astype(np.float32), 0.35)
        neck = (np.abs(X - cx) < 0.17 * s) & (Y > hy + 0.3 * s) & (Y < nb + 0.03 * s)
        lay(neck.astype(np.float32), 0.45 * (0.8 + 0.4 * shade))
        for ex in (-1, 1):
            ear = ((X - (hx + ex * rx * 0.96)) / (0.07 * s)) ** 2 + ((Y - (hy + 0.04 * s)) / (0.13 * s)) ** 2
            lay(smooth_in(np.sqrt(ear), 0.15), 0.42 if ex > 0 else 0.55)
        dx, dy = X - hx, Y - hy
        rxs = rx * (1.0 - 0.22 * np.clip(dy / ry, 0, 1) ** 2)
        d = np.sqrt((dx / rxs) ** 2 + (dy / ry) ** 2)
        lay(smooth_in(d, 0.10), shaded(dx, dy, rxs, ry, 0.66, 0.05))

        def fy(f):
            return hy - ry + 2 * ry * f          # a height down the head (0 the skull's top, 1 the chin)

        for ex in (-1, 1):
            ox = hx + ex * 0.15 * s
            sock = np.sqrt(((X - ox) / (0.09 * s)) ** 2 + ((Y - fy(0.47)) / (0.05 * s)) ** 2)
            t[:] = t - smooth_in(sock, 1.0) * 0.12
            eye = np.sqrt(((X - ox) / (0.045 * s)) ** 2 + ((Y - fy(0.48)) / (0.02 * s)) ** 2)
            lay(smooth_in(eye, 0.9) * 0.55, 0.26)
            brow = np.sqrt(((X - ox) / (0.08 * s)) ** 2 + ((Y - fy(0.41)) / (0.014 * s)) ** 2)
            lay(smooth_in(brow, 0.4) * 0.8, 0.18 if not woman else 0.3)
        ridge = (np.abs(X - hx + 0.01 * s) < 0.022 * s) & (Y > fy(0.50)) & (Y < fy(0.66))
        t[:] = t + ridge.astype(np.float32) * 0.05
        nshade = (X > hx + 0.01 * s) & (X < hx + 0.06 * s) & (Y > fy(0.52)) & (Y < fy(0.69))
        t[:] = t - nshade.astype(np.float32) * 0.12 * np.clip(1 - (X - hx) / (0.06 * s), 0, 1)
        nost = np.sqrt(((X - hx) / (0.06 * s)) ** 2 + ((Y - fy(0.69)) / (0.016 * s)) ** 2)
        t[:] = t - smooth_in(nost, 0.5) * 0.14
        if beard:     # mutton-chop whiskers down the cheeks to the jaw
            for ex in (-1, 1):
                chop = (d < 1.03) & (d > 0.62) & (np.sign(dx) == ex) & (Y > fy(0.42)) & (Y < fy(0.90)) &                     (np.abs(dx) > rx * 0.55)
                lay(chop.astype(np.float32) * 0.9, 0.16)
        if moustache or beard:
            for mx in (-1, 1):
                mo = np.sqrt(((X - (hx + mx * 0.075 * s)) / (0.10 * s)) ** 2 + ((Y - fy(0.755)) / (0.03 * s)) ** 2)
                lay(smooth_in(mo, 0.25), 0.13)
        else:
            mouth = np.sqrt(((X - hx) / (0.08 * s)) ** 2 + ((Y - fy(0.79)) / (0.012 * s)) ** 2)
            lay(smooth_in(mouth, 0.4) * 0.8, 0.30)
        chin = np.sqrt(((X - hx) / (0.16 * s)) ** 2 + ((Y - fy(1.0)) / (0.05 * s)) ** 2)
        t[:] = t - smooth_in(chin, 0.6) * 0.08
        hd = np.sqrt((dx / (rx * 1.06)) ** 2 + ((dy + 0.02 * s) / (ry * 1.04)) ** 2)
        # the hair: a soft mass over the crown, lower at the temples, sideburns down to the ears (no helmet edge)
        hairline = fy(0.17) + 0.34 * s * (dx / rx) ** 2 + 0.03 * s * np.sin(9.0 * dx / rx)
        hair = (hd < 1.0) & (Y < hairline) & (Y < fy(0.56))
        hair = hair | ((hd < 1.02) & (np.abs(dx) > rx * 0.86) & (Y < fy(0.56)))
        if woman:
            hair = hair | ((hd < 1.06) & (np.abs(dx) > rx * 0.80) & (Y < fy(0.62)))
        lay(smooth_in(hd, 0.12) * hair * 0.92, 0.15)
        sheen = (hair & (np.abs(dx + 0.08 * s) < 0.05 * s) & (Y < fy(0.15))).astype(np.float32)
        t[:] = t + sheen * 0.06
        part = (np.abs(X - (hx - (0.0 if woman else 0.12 * s))) < 0.006 * s) & hair & (Y < fy(0.2))
        lay(part.astype(np.float32), 0.42)
        if woman:
            bun = np.sqrt(((X - hx) / (0.16 * s)) ** 2 + ((Y - fy(-0.02)) / (0.08 * s)) ** 2)
            lay(smooth_in(bun, 0.2), 0.10)

    def profile_sitter(cx, top, s):
        """In profile, looking to the left: the head's back and crown in hair, the brow, the nose, the moustache
        and the chin on the face's edge, the ear, the collar and the coat's shoulder."""
        rx, ry = 0.40 * s, 0.5 * s
        hx, hy = cx, top + ry
        nb = hy + 0.60 * s

        def fy(f):
            return hy - ry + 2 * ry * f

        dyb = np.clip((Y - nb) / (0.3 * s), 0, 1)
        half = 0.15 * s + 0.62 * s * (dyb * (2 - dyb))
        body = (Y > nb - 0.02 * s) & (np.abs(X - cx - 0.06 * s) < half)
        lay(body.astype(np.float32), 0.13)
        collar = (X < cx - 0.02 * s) & (X > cx - 0.16 * s) & (Y > nb - 0.05 * s) & (Y < nb + 0.05 * s)
        lay(collar.astype(np.float32), 0.60)
        neck = (np.abs(X - cx + 0.02 * s) < 0.14 * s) & (Y > hy + 0.25 * s) & (Y < nb)
        lay(neck.astype(np.float32), 0.40)
        dx, dy = X - hx, Y - hy
        rxs = rx * (1.0 - 0.18 * np.clip(dy / ry, 0, 1) ** 2)
        d = np.sqrt((dx / rxs) ** 2 + (dy / ry) ** 2)
        lay(smooth_in(d, 0.10), shaded(dx, dy, rxs, ry, 0.64, 0.05))
        edge = hx - rxs        # the face's edge, to the left
        bump = 0.075 * s * np.clip(1 - np.abs(Y - fy(0.62)) / (0.08 * s), 0, 1) * (Y < fy(0.70))
        nose = (X < edge + 0.02 * s) & (X > edge - bump) & (Y > fy(0.50)) & (Y < fy(0.70))
        lay(nose.astype(np.float32), 0.68)
        brow = np.sqrt(((X - (edge + 0.10 * s)) / (0.07 * s)) ** 2 + ((Y - fy(0.41)) / (0.014 * s)) ** 2)
        lay(smooth_in(brow, 0.4) * 0.8, 0.2)
        eye = np.sqrt(((X - (edge + 0.10 * s)) / (0.03 * s)) ** 2 + ((Y - fy(0.47)) / (0.014 * s)) ** 2)
        lay(smooth_in(eye, 0.3), 0.15)
        mo = np.sqrt(((X - (edge + 0.03 * s)) / (0.08 * s)) ** 2 + ((Y - fy(0.755)) / (0.028 * s)) ** 2)
        lay(smooth_in(mo, 0.25), 0.12)
        ear = np.sqrt(((X - (hx + 0.05 * s)) / (0.065 * s)) ** 2 + ((Y - fy(0.55)) / (0.11 * s)) ** 2)
        lay(smooth_in(ear, 0.2), 0.46)
        hd = np.sqrt(((dx - 0.02 * s) / (rx * 1.04)) ** 2 + ((dy + 0.02 * s) / (ry * 1.04)) ** 2)
        back = np.clip((dx + 0.05 * s) / (0.30 * s), 0, 1)       # 0 at the brow, 1 over the back of the head
        hair = (hd < 1.0) & (Y < fy(0.18) + (0.40 * s) * back ** 1.5 + 0.02 * s * np.sin(11.0 * dx / rx)) & \
            ~((ear < 1.0))
        lay(smooth_in(hd, 0.12) * hair * 0.92, 0.15)

    if variant == "portrait":
        sitter(0.0, 0.17, 0.36)
    elif variant == "profile":
        t[:] = t * 0.62     # a darker backdrop: his profile reads against it
        profile_sitter(0.03, 0.17, 0.36)
    elif variant == "standing":
        floor_y = 0.86
        t[Y > floor_y] = t[Y > floor_y] * 0.55 + 0.10
        col = (X > 0.11) & (X < 0.20) & (Y > 0.42) & (Y < floor_y)
        lay(col.astype(np.float32), 0.55)
        cap = (X > 0.09) & (X < 0.22) & (Y > 0.40) & (Y < 0.44)
        lay(cap.astype(np.float32), 0.62)
        legs = (np.abs(np.abs(X) - 0.035) < 0.028) & (Y > 0.60) & (Y < floor_y - 0.005)
        lay(legs.astype(np.float32), 0.12)
        frock = (Y > 0.27) & (Y < 0.63) & (np.abs(X) < 0.07 + 0.03 * np.clip((Y - 0.30) / 0.3, 0, 1))
        lay(frock.astype(np.float32), 0.13)
        arm = (X > 0.06) & (X < 0.13) & (Y > 0.30) & (Y < 0.45)
        lay(arm.astype(np.float32), 0.14)
        hand = ((X - 0.135) ** 2 + (Y - 0.44) ** 2) < 0.016 ** 2
        lay(hand.astype(np.float32), 0.5)
        sitter(0.0, 0.11, 0.115, body_to=0.33)
    elif variant == "couple":
        sitter(-0.15, 0.22, 0.26, coat=0.12)
        sitter(0.15, 0.27, 0.24, woman=True, moustache=False, coat=0.15)
    else:   # seated: bearded, older
        sitter(0.0, 0.18, 0.34, beard=True)
    ov = np.sqrt((X / 0.44) ** 2 + ((Y - 0.5) / 0.47) ** 2)
    t[:] = t * (1 - np.clip((ov - 0.80) / 0.20, 0, 1) * 0.6)
    t[:] = t * (0.94 + 0.12 * rng.random((H, W)).astype(np.float32))
    for _ in range(12):
        fx, fy_, fr_ = rng.uniform(-0.3, 0.3), rng.random(), rng.uniform(0.003, 0.010)
        sp = np.sqrt((X - fx) ** 2 + (Y - fy_) ** 2) / fr_
        t[:] = t - smooth_in(sp, 0.5) * 0.10
    t = t.reshape(h, ss, w, ss).mean(axis=(1, 3))
    # the soft focus of a long exposure: a Gaussian about 0.7 % of the picture's height, so no edge is hard
    sig = max(1.0, 0.007 * h)
    k_ = np.exp(-0.5 * (np.arange(-3 * int(sig) - 1, 3 * int(sig) + 2) / sig) ** 2)
    k_ /= k_.sum()
    rad = len(k_) // 2
    t = sum(np.pad(t, ((rad, rad), (0, 0)), mode="edge")[i:i + h] * k_[i] for i in range(len(k_)))
    t = sum(np.pad(t, ((0, 0), (rad, rad)), mode="edge")[:, i:i + w] * k_[i] for i in range(len(k_)))
    t = t * (0.97 + 0.06 * rng.random((h, w)))          # the plate's grain over the blur
    t = np.clip(t, 0.0, 1.0)
    # an albumen print's faded browns: the highlights a dim cream, never paper white under the candle
    dark, lite = np.array([38, 26, 18]) / 255.0, np.array([186, 160, 118]) / 255.0
    rgb = dark[None, None, :] * (1 - t[..., None]) + lite[None, None, :] * t[..., None]
    return _srgb_to_lin(rgb)


# ---------------------------------------------------------------- lights: the bake rig and the exported night lights


def bake_rig(fr: Frame, holes: list, lights: list, moon: Vector) -> list:
    """The lights the bake sees: the candle at its flame, the moon (a sun lamp) through the window, a faint fill
    panel under the ceiling, the night sky as the world; a light-tight box round the room with a hole at each window
    in `holes` (the moon-lit ones: a window no moon light names is dark glass), so no light reaches in through a
    seam. Returns the rig's objects (removed after the bake).

    A v2 file (G4): a point light per lamp and fire at its anchor, one Sun for the room when it has a moon light
    (none without: a windowless room bakes no moon group and its world is at 0), the fill panel with its energy
    scaled by its area over the bedroom's (`fill.area_ref_m2`, null for none); each light carries its bake group as
    `wdi_group`. The legacy path builds the bedroom's three lights by name, as it always has."""
    rig = []
    if not is_v2():
        lamp = next((L for L in lights if L["role"] != "moon"), None)
        flame = lamp["at"] if lamp is not None else None
        c = CFG["candle"]
        if flame is not None:
            ld = bpy.data.lights.new(nm("Bake_candle"), "POINT")
            ld.energy, ld.color, ld.shadow_soft_size = c["power"], hex_lin(c["color"]), c["radius"]
            o = bpy.data.objects.new(nm("Bake_candle"), ld)
            o.location = (flame[0], flame[1], flame[2] + 0.012)
            COL["rig"].objects.link(o)
            rig.append(o)
    else:
        for L in lights:
            if L["at"] is None:
                continue
            ld = bpy.data.lights.new(nm("Bake_" + L["export"][len("Light_"):]), "POINT")
            ld.energy, ld.color, ld.shadow_soft_size = float(L["power"]), hex_lin(L["color"]), float(L["radius"])
            o = bpy.data.objects.new(ld.name, ld)
            o.location = (L["at"][0], L["at"][1], L["at"][2] + 0.012)
            o["wdi_group"], o["wdi_light_id"] = L["group"], L["id"]
            COL["rig"].objects.link(o)
            rig.append(o)
    m = CFG["moon"]
    if not is_v2() or any(L["role"] == "moon" for L in lights):
        ld = bpy.data.lights.new(nm("Bake_moon"), "SUN")
        ld.energy, ld.color, ld.angle = m["strength"], hex_lin(m["color"]), math.radians(m["angle"])
        o = bpy.data.objects.new(nm("Bake_moon"), ld)
        o.rotation_euler = (-moon).to_track_quat("-Z", "Y").to_euler()
        if is_v2():
            o["wdi_group"] = "moon"
        COL["rig"].objects.link(o)
        rig.append(o)
    f = CFG["fill"]
    ld = bpy.data.lights.new(nm("Bake_fill"), "AREA")
    ld.shape = "RECTANGLE"
    ld.size, ld.size_y = (fr.x1 - fr.x0) - 0.8, (fr.y1 - fr.y0) - 0.8
    ld.energy, ld.color = f["power"], hex_lin(f["color"])
    if is_v2():     # a large room's panel as bright a square metre as the bedroom's (coupling 26)
        ld.energy = rf.fill_energy(f["power"], ld.size * ld.size_y, f.get("area_ref_m2", rf.FILL_AREA_REF))
    o = bpy.data.objects.new(nm("Bake_fill"), ld)
    o.location = (fr.cx, fr.cy, fr.H - 0.03)
    if is_v2():
        o["wdi_group"] = "fill"
    COL["rig"].objects.link(o)
    rig.append(o)
    # the world: the look's night sky (it lights the snow outside and comes in faintly at the window)
    look = look_sky()
    w = bpy.data.worlds.new(nm("Bake_world"))
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes["Background"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    mr_ = nt.nodes.new("ShaderNodeMapRange")
    mr_.interpolation_type = "SMOOTHSTEP"
    mr_.inputs[1].default_value, mr_.inputs[2].default_value = 0.0, look["sky"]["horizon_height"]
    nt.links.new(sep.outputs["Z"], mr_.inputs[0])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs[6].default_value = (*look["sky"]["horizon"], 1.0)
    mix.inputs[7].default_value = (*look["sky"]["zenith"], 1.0)
    nt.links.new(mr_.outputs[0], mix.inputs[0])
    nt.links.new(mix.outputs[2], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = look["sky"]["light"]
    if is_v2() and not any(L["role"] == "moon" for L in lights):
        bg.inputs["Strength"].default_value = 0.0       # no moon group: the sky lights no group (coupling 21)
    bpy.context.scene.world = w
    # the light-tight box
    b = Builder()
    pad, z0, z1 = fr.T + 0.04, -0.3, fr.H + 0.3
    shafts = [m["flight"]["bottom"] for m in fr.markers if m.get("flight") and not m["flight"].get("up")]
    if shafts:      # a stairs shaft (G12): the box's floor under its own
        z0 = min(z0, min(shafts) - 0.3)
    ups = [m["flight"]["top"] for m in fr.markers if m.get("flight") and m["flight"].get("up")]
    if ups:         # a flight up's shaft: the box's lid over its cap
        z1 = max(z1, max(ups) + 0.3)
    X0, X1, Y0, Y1 = fr.x0 - pad, fr.x1 + pad, fr.y0 - pad, fr.y1 + pad
    dark = RMat("M_bake_dark", None, (0.0, 0.0, 0.0), rough=1.0)
    b.box((X0, Y0, z0 - 0.02), (X1, Y1, z0), dark)
    b.box((X0, Y0, z1), (X1, Y1, z1 + 0.02), dark)
    for side in ("S", "E", "N", "W"):
        (_o, (dx, dy), (nx, ny), L) = fr.wall_frame(side)
        lo_s, hi_s = -fr.T - 0.2, (fr.x1 - fr.x0 if side in ("N", "S") else fr.y1 - fr.y0) + fr.T + 0.2
        cuts = tight_cuts(lo_s, hi_s, z0, z1, [(h["sa"], h["sb"], h["sill"], h["head"]) for h in holes
                                               if h["side"] == side])
        for (sa, sb, za, zb) in cuts:
            wall_box(b, fr, side, sa, sb, -pad - 0.02, -pad, za, zb, dark)
    tight = b.build(nm("Bake_tight"), col="rig")
    rig.append(tight)
    return rig


def tight_cuts(lo: float, hi: float, z0: float, z1: float, holes: list) -> list:
    """The light-tight box's panels on one wall, (s0, s1, z0, z1) each, round its holes (s0, s1, sill, head): the
    holes sorted along the wall, the full-height panels between them first, then each hole's panel under and over
    it. One hole gives the four panels the box has always had, in the same order; none gives the whole wall (the
    loop it replaces kept only the last hole of a wall: coupling 18 of the implementation plan)."""
    if not holes:
        return [(lo, hi, z0, z1)]
    hs = sorted(holes)
    cols, prev = [], lo
    for sa, sb, _sill, _head in hs:
        cols.append((prev, sa, z0, z1))
        prev = sb
    cols.append((prev, hi, z0, z1))
    for sa, sb, sill, head in hs:
        cols += [(sa, sb, z0, sill), (sa, sb, head, z1)]
    return cols


def export_lights(fr: Frame, wins: list, lights: list, moon: Vector, k: float, aw: dict) -> list:
    """The scene's night lights as Blender lights the glTF exporter writes as KHR_lights_punctual (COMPAT: W / 4 pi):
    the candle at its flame and the moon as a spot through the window (a directional light would take the village's
    own moon away: apps/walk keeps a GLB's directional light). Energies times k, like COLOR_0, so a lit object added
    later matches the bake under wdi_exposure, and times the group's weight (`aw`: the light setting's and --mix's,
    as the bake has them). `wins`: the built windows. A v2 file exports one light per night light, named
    Light_<name>, with `wdi_group`; the legacy path exports Light_candle and Light_moon with their old extras and
    products, multiplied left to right as they always were (coupling 17)."""
    if is_v2():
        return export_lights_v2(wins, lights, moon, k, aw)
    out = []
    by_kind = {lt["kind"]: lt for lt in fr.room.lights}
    names = {"lamp": ("Light_candle", "lamp"), "moon": ("Light_moon", "moon")}
    lamp = next((L for L in lights if L["role"] != "moon"), None)
    flame = lamp["at"] if lamp is not None else None
    mw = next((L["window"] for L in lights if L["role"] == "moon"), None)
    win = next((w for w in wins if w["id"] == mw), None)
    c = CFG["candle"]
    lt = by_kind.get("lamp")
    if flame is not None and lt is not None:
        ld = bpy.data.lights.new(nm(names["lamp"][0]), "POINT")
        ld.energy, ld.color, ld.shadow_soft_size = c["power"] * k * float(aw.get("candle", 1.0)), \
            hex_lin(c["color"]), c["radius"]
        o = bpy.data.objects.new(nm(names["lamp"][0]), ld)
        o.location = (flame[0], flame[1], flame[2] + 0.012)
        o["wdi_light"], o["wdi_light_id"] = names["lamp"][1], lt["id"]
        o["wdi_radius_tiles"] = float(lt.get("radiusTiles", 2))
        o["wdi_cast_shadow"] = False
        COL["room"].objects.link(o)
        out.append(o)
    lt = by_kind.get("moon")
    if win is not None and lt is not None:
        m = CFG["moon"]
        target = Vector(win["centre"]) - moon * (win["centre"][2] / max(moon.z, 0.1))
        target.z = 0.0
        src = Vector(win["centre"]) + moon * 1.2
        d = (target - src).length
        ld = bpy.data.lights.new(nm(names["moon"][0]), "SPOT")
        ld.spot_size, ld.spot_blend = math.radians(50.0), 0.25
        ld.energy = 4.0 * math.pi * m["strength"] * d * d * k * float(aw.get("moon", 1.0))
        ld.color = hex_lin(m["color"])
        ld.shadow_soft_size = 0.0
        o = bpy.data.objects.new(nm(names["moon"][0]), ld)
        o.location = src
        o.rotation_euler = (target - src).to_track_quat("-Z", "Y").to_euler()
        o["wdi_light"], o["wdi_light_id"] = names["moon"][1], lt["id"]
        o["wdi_radius_tiles"] = float(lt.get("radiusTiles", 2))
        o["wdi_note"] = "the moon through the window as a spot (a directional light would replace the village's moon)"
        COL["room"].objects.link(o)
        out.append(o)
    return out


def moon_spot(win: dict, moon: Vector) -> tuple:
    """A moon light's spot: its source 1.2 m out along the moon's rays from the window's centre, its target where
    the ray through the centre meets the floor, and the distance between them."""
    target = Vector(win["centre"]) - moon * (win["centre"][2] / max(moon.z, 0.1))
    target.z = 0.0
    src = Vector(win["centre"]) + moon * 1.2
    return src, target, (target - src).length


def light_row(lid) -> dict:
    """The manifest's facts of an exported light beyond the exporter's (role, group, the loader's anchor, where it
    stands, its window)."""
    L = next((x for x in LIGHTS if x["id"] == lid), None)
    if L is None:
        return {}
    out = dict(role=L["role"], group=L["group"], lightName=L["name"])
    if L.get("anchor"):
        out["anchor"] = dict(L["anchor"])
    if L.get("at") is not None:
        out["at"] = [round(float(v), 4) for v in L["at"]]
    if L.get("window"):
        out["window"] = L["window"]
    return out


def export_lights_v2(wins: list, lights: list, moon: Vector, k: float, aw: dict) -> list:
    """A v2 file's exported lights: a point light per lamp and fire at its anchor (+1.2 cm), a 50 degree spot per
    moon light through its window; extras wdi_light (the role), wdi_light_id, wdi_group, wdi_radius_tiles."""
    out = []
    m = CFG["moon"]
    by_win = {w["id"]: w for w in wins}
    for L in lights:
        w_ = float(aw.get(L["group"], 1.0))
        if L["role"] == "moon":
            win = by_win.get(L["window"])
            if win is None:
                continue
            src, target, d = moon_spot(win, moon)
            ld = bpy.data.lights.new(nm(L["export"]), "SPOT")
            ld.spot_size, ld.spot_blend = math.radians(50.0), 0.25
            ld.energy = 4.0 * math.pi * m["strength"] * d * d * k * w_
            ld.color = hex_lin(m["color"])
            ld.shadow_soft_size = 0.0
            o = bpy.data.objects.new(nm(L["export"]), ld)
            o.location = src
            o.rotation_euler = (target - src).to_track_quat("-Z", "Y").to_euler()
        else:
            ld = bpy.data.lights.new(nm(L["export"]), "POINT")
            ld.energy, ld.color, ld.shadow_soft_size = float(L["power"]) * k * w_, hex_lin(L["color"]), \
                float(L["radius"])
            o = bpy.data.objects.new(nm(L["export"]), ld)
            o.location = (L["at"][0], L["at"][1], L["at"][2] + 0.012)
            o["wdi_cast_shadow"] = False
        o["wdi_light"], o["wdi_light_id"], o["wdi_group"] = L["role"], L["id"], L["group"]
        o["wdi_radius_tiles"] = float(L.get("radiusTiles", 2))
        COL["room"].objects.link(o)
        out.append(o)
    return out


# ---------------------------------------------------------------- the bake


def bake_targets() -> list:
    """Every room mesh the bake lights: shell, trims, door, window, furniture, cloth and the outside (not the sky, the
    flame, the moon, the lit window, the glass)."""
    out = []
    for r in OBJS:
        o = r["obj"]
        if o is None or o.type != "MESH" or r["what"] in ("sky", "emit", "glass"):
            continue
        # judged by the materials its faces use: a split-off flame leaves an empty slot behind on the candle stand
        used = {p.material_index for p in o.data.polygons}
        mats = [o.data.materials[i] for i in used if i < len(o.data.materials)]
        if any(m is not None and MATS.get(m.name) is not None and MATS[m.name].kind in ("emit", "glass")
               for m in mats):
            continue
        out.append(o)
    return out


def split_material_seams(ob) -> int:
    """Give every vertex one material: the edges between faces of different materials are split, so the per-vertex
    light (COLOR_0, one value per vertex) is lifted for the material it is drawn with. Builder.build welds
    coincident vertices, and a weld across a material seam (the window's plaster reveal against its painted frame)
    gave the plaster the paint's lower ink floor. Returns the vertices added."""
    me = ob.data
    if len(me.materials) < 2:
        return 0
    n0 = len(me.vertices)
    bm = bmesh.new()
    bm.from_mesh(me)
    seams = [e for e in bm.edges if len(e.link_faces) > 1 and len({f.material_index for f in e.link_faces}) > 1]
    if seams:
        bmesh.ops.split_edges(bm, edges=seams)
    # a vertex where faces of two materials meet only at that vertex (no shared edge) is split too
    for v in list(bm.verts):
        mats = {f.material_index for f in v.link_faces}
        if len(mats) > 1:
            bmesh.utils.vert_separate(v, v.link_edges)
    bm.to_mesh(me)
    bm.free()
    me.update()
    return len(me.vertices) - n0


def subdivide_long_edges(ob, max_len: float, passes: int = 6) -> int:
    """Split every edge longer than max_len (in world metres) until none is, so the vertex bake can follow the light
    across large flat faces; UVs are interpolated. Returns the vertices added."""
    me = ob.data
    n0 = len(me.vertices)
    S = ob.matrix_world.to_3x3()
    bm = bmesh.new()
    bm.from_mesh(me)
    for _ in range(passes):
        long = [e for e in bm.edges if (S @ (e.verts[0].co - e.verts[1].co)).length > max_len]
        if not long:
            break
        bmesh.ops.subdivide_edges(bm, edges=long, cuts=1, use_grid_fill=True, use_single_edge=True)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bm.to_mesh(me)
    bm.free()
    me.update()
    return len(me.vertices) - n0


_CYCLES_DEVICE: dict = {}


def cycles_device(sc) -> str:
    """The Cycles device for a bake: the CPU unless WDI_CYCLES_DEVICE names OPTIX or CUDA (an opt-in GPU bake, for a
    rented box; unset, nothing changes). The GPU's devices of that kind are enabled and logged once per run."""
    want = (os.environ.get("WDI_CYCLES_DEVICE") or "CPU").strip().upper()
    if want not in ("CPU", "OPTIX", "CUDA"):
        raise SystemExit(f"WDI_CYCLES_DEVICE={want!r}: use CPU, OPTIX or CUDA")
    if want == "CPU":
        sc.cycles.device = "CPU"
        if not _CYCLES_DEVICE:
            _CYCLES_DEVICE["used"] = "CPU"
            print("cycles device: CPU", flush=True)
        return "CPU"
    if not _CYCLES_DEVICE:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = want
        prefs.get_devices()
        used = []
        for d in prefs.devices:
            d.use = d.type == want
            if d.use:
                used.append(d.name)
        if not used:
            raise SystemExit(f"WDI_CYCLES_DEVICE={want}: Blender finds no {want} device")
        _CYCLES_DEVICE["used"] = f"{want}: " + ", ".join(used)
        print(f"cycles device: {_CYCLES_DEVICE['used']}", flush=True)
    sc.cycles.device = "GPU"
    return _CYCLES_DEVICE["used"]


def prepare_attrs(objs: list) -> None:
    for o in objs:
        me = o.data
        if ATTR in me.color_attributes:
            me.color_attributes.remove(me.color_attributes[ATTR])
        a = me.color_attributes.new(ATTR, "FLOAT_COLOR", "POINT")
        me.color_attributes.active_color = a
        try:
            me.color_attributes.render_color_index = me.color_attributes.find(ATTR)
        except AttributeError:
            pass


def run_bake(objs: list, samples: int, hide: list) -> float:
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    cycles_device(sc)
    sc.cycles.samples = samples
    sc.cycles.use_adaptive_sampling = False     # every vertex gets every sample (the dark corners need them)
    sc.cycles.use_denoising = False
    sc.cycles.caustics_reflective = False
    sc.cycles.caustics_refractive = False
    sc.cycles.max_bounces = 6
    sc.cycles.diffuse_bounces = 4
    sc.cycles.glossy_bounces = 2
    sc.cycles.transparent_max_bounces = 8
    sc.cycles.sample_clamp_indirect = 8.0
    sc.render.bake.margin = 0
    for o in hide:
        o.hide_render = True
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    t0 = time.time()
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, target="VERTEX_COLORS", use_clear=True)
    for o in hide:
        o.hide_render = False
    return time.time() - t0


BAKE_GROUPS = rf.LEGACY_GROUPS   # the bedroom's: the moon's group is the moon lamp and the night sky (the world)


def rig_group(o) -> str:
    """A rig light's bake group: its `wdi_group` (a v2 file's), else its name's suffix (the legacy Bake_candle,
    Bake_moon, Bake_fill: their names and extras stay as the rig fingerprint has them)."""
    return o.get("wdi_group") or o.name.rsplit("Bake_", 1)[-1]


def run_bake_groups(objs: list, samples: int, hide: list, rig: list, groups=BAKE_GROUPS) -> tuple:
    """--bake-groups: one bake per light group (the others switched off, every light still there at energy 0), so
    the light balance can be tuned on the saved raw bake without baking again; the groups in the room's order (the
    loader's: candle, fire, a room's own, moon, fill). Returns ({object name: {group: light}}, {group: seconds})."""
    sc = bpy.context.scene
    bg = sc.world.node_tree.nodes["Background"] if sc.world and sc.world.use_nodes else None
    ws = bg.inputs["Strength"].default_value if bg else 0.0
    energy = {o.name: o.data.energy for o in rig if o.type == "LIGHT"}
    out = {o.name: {} for o in objs}
    secs = {}
    for g in groups:
        for o in rig:
            if o.type == "LIGHT":
                o.data.energy = energy[o.name] if rig_group(o) == g else 0.0
        if bg:
            bg.inputs["Strength"].default_value = ws if g == "moon" else 0.0
        t = run_bake(objs, samples, hide)
        secs[g] = round(t, 1)
        log(f"baked group {g} in {t:.0f}s")
        for o in objs:
            out[o.name][g] = read_attr(o)
    for o in rig:
        if o.type == "LIGHT":
            o.data.energy = energy[o.name]
    if bg:
        bg.inputs["Strength"].default_value = ws
    return out, secs


def mix_groups(groups: dict, weights: dict, tints: dict | None = None) -> dict:
    """The groups' sum, each times its weight (and, per channel, its tint: a new colour over the baked one)."""
    tints = tints or {}
    return {n: sum(float(weights.get(g, 1.0)) * L * np.asarray(tints.get(g, (1.0, 1.0, 1.0)), np.float32)[None, :]
                   for g, L in d.items() if g != "ao") for n, d in groups.items()}


AO_ATTR = "wdi_ao"


def run_bake_ao(objs: list, hide: list, distance: float, samples: int) -> dict:
    """Ambient occlusion within `distance` metres (Cycles AO bake into a temporary point colour attribute): how much
    of a vertex's sky its neighbours hide. The viewer draws no shadows and no AO, and the ink floor lifts every dim
    surface, so the floor under the bed, the inside of a press and a piece's foot on the floor read flat without it.
    Returns {object name: AO 0..1}; the attribute is removed again (COLOR_0 stays the light)."""
    for o in objs:
        me = o.data
        if AO_ATTR in me.color_attributes:
            me.color_attributes.remove(me.color_attributes[AO_ATTR])
        me.color_attributes.active_color = me.color_attributes.new(AO_ATTR, "FLOAT_COLOR", "POINT")
    sc = bpy.context.scene
    keep = sc.cycles.samples
    sc.cycles.samples = samples
    sc.world.light_settings.distance = distance
    for o in hide:
        o.hide_render = True
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    t0 = time.time()
    bpy.ops.object.bake(type="AO", target="VERTEX_COLORS", use_clear=True)
    for o in hide:
        o.hide_render = False
    sc.cycles.samples = keep
    out = {}
    for o in objs:
        me = o.data
        a = me.color_attributes[AO_ATTR]
        c = np.empty(len(a.data) * 4, np.float32)
        a.data.foreach_get("color", c)
        out[o.name] = c.reshape(-1, 4)[:, 0].copy()
        me.color_attributes.remove(a)
        me.color_attributes.active_color = me.color_attributes[ATTR]
    log(f"baked AO ({distance} m, {samples} samples) in {time.time() - t0:.0f}s")
    return out


RAW_META: dict = {}         # a loaded raw bake's own samples, seconds and file name (load_raw)


def save_raw(path: str, objs: list, groups: dict, samples: int = 0, seconds: float = 0.0,
             meta: dict | None = None) -> None:
    """The raw bake: each mesh's light per vertex and per group (and its AO), with what made it (`meta`: the
    script's, the room file's, the look's and the kit's md5, the layout), so a later --raw run can show it came from
    the same code and the same room data."""
    arrs = {"meta|samples": np.array(int(samples)), "meta|bakeSeconds": np.array(float(seconds)),
            "meta|baked": np.array(time.strftime("%Y-%m-%d %H:%M:%S"))}
    for k_, v_ in (meta or {}).items():
        arrs[f"meta|{k_}"] = np.array(str(v_))
    for o in objs:
        me = o.data
        co = np.empty(len(me.vertices) * 3, np.float32)
        me.vertices.foreach_get("co", co)
        arrs[f"{o.name}|co"] = co.reshape(-1, 3)
        for g, L in groups[o.name].items():
            arrs[f"{o.name}|{g}"] = np.asarray(L, np.float32)
        me_ = o.data
        mats = [m.name if m else "" for m in me_.materials]
        arrs[f"{o.name}|mat"] = np.array([mats[i] if i < len(mats) else "" for i in obj_mat_rows(o)])
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    np.savez_compressed(path, **arrs)
    log("saved the raw bake", path)


def load_raw(path: str, objs: list) -> dict:
    z = np.load(path)
    out = {}
    RAW_META.update(samples=int(z["meta|samples"]) if "meta|samples" in z else None,
                    bakeSeconds=float(z["meta|bakeSeconds"]) if "meta|bakeSeconds" in z else None,
                    file=os.path.basename(path), fileMd5=file_md5(path))
    for k_ in z.files:
        if k_.startswith("meta|") and k_ not in ("meta|samples", "meta|bakeSeconds"):
            RAW_META[k_.split("|", 1)[1]] = str(z[k_])
    for o in objs:
        me = o.data
        co = np.empty(len(me.vertices) * 3, np.float32)
        me.vertices.foreach_get("co", co)
        key = f"{o.name}|co"
        if key not in z or z[key].shape != (len(me.vertices), 3) or \
                float(np.abs(z[key] - co.reshape(-1, 3)).max()) > 1e-4:
            raise SystemExit(f"--raw {path}: {o.name} does not match this build's geometry; bake again")
        out[o.name] = {k.split("|", 1)[1]: z[k] for k in z.files if k.startswith(o.name + "|")
                       and not k.endswith(("|co", "|mat"))}
    return out


def quick_light(objs: list, lights: list) -> None:
    """--no-bake: an unshadowed stand-in (each lamp's and fire's inverse square and a little ambient) for fast smoke
    runs; a room with none takes the candle's from above the floor's centre."""
    pts = [(Vector(L["at"]), float(L["power"]) / (4 * math.pi), np.array(hex_lin(L["color"])))
           for L in lights if L["at"] is not None] or \
        [(Vector((0, 0, 1)), CFG["candle"]["power"] / (4 * math.pi), np.array(hex_lin(CFG["candle"]["color"])))]
    for o in objs:
        me = o.data
        M = o.matrix_world
        n = len(me.vertices)
        co = np.empty(n * 3, np.float32)
        me.vertices.foreach_get("co", co)
        nr = np.empty(n * 3, np.float32)
        me.vertices.foreach_get("normal", nr)
        co = co.reshape(-1, 3) @ np.array(M.to_3x3()).T + np.array(M.translation)
        nr = nr.reshape(-1, 3) @ np.array(M.to_3x3()).T
        L = None
        for f, P_, col in pts:
            d = np.array(f) - co
            r2 = np.maximum((d * d).sum(1), 0.04)
            cosv = np.clip((d * nr).sum(1) / np.sqrt(r2) / np.maximum(np.linalg.norm(nr, axis=1), 1e-6), 0, 1)
            term = (P_ * cosv / r2 / math.pi)[:, None] * col[None, :]
            L = term if L is None else L + term
        L = L + 0.004
        rgba = np.ones((n, 4), np.float32)
        rgba[:, :3] = L
        me.color_attributes[ATTR].data.foreach_set("color", rgba.ravel())


def read_attr(o) -> np.ndarray:
    a = o.data.color_attributes[ATTR]
    c = np.empty(len(a.data) * 4, np.float32)
    a.data.foreach_get("color", c)
    return c.reshape(-1, 4)[:, :3].copy()


def write_attr(o, rgb: np.ndarray) -> None:
    a = o.data.color_attributes[ATTR]
    rgba = np.ones((len(rgb), 4), np.float32)
    rgba[:, :3] = rgb
    a.data.foreach_set("color", rgba.ravel())


def denoise(o, rgb: np.ndarray, iters: int = 2) -> np.ndarray:
    """The bake's leftover noise: co-located vertices (the scans' split seams) averaged where their normals agree,
    then a light Laplacian along the mesh's edges (0.5 of the neighbours' mean, `iters` times)."""
    me = o.data
    n = len(me.vertices)
    co = np.empty(n * 3, np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    nr = np.empty(n * 3, np.float32)
    me.vertices.foreach_get("normal", nr)
    nr = nr.reshape(-1, 3)
    key = np.round(co / 1e-4).astype(np.int64)
    _u, inv = np.unique(key, axis=0, return_inverse=True)
    inv = inv.ravel()
    sums = np.zeros((inv.max() + 1, 3))
    np.add.at(sums, inv, rgb)
    cnt = np.bincount(inv)
    nsum = np.zeros((inv.max() + 1, 3))
    np.add.at(nsum, inv, nr)
    agree = (np.einsum("ij,ij->i", nr, nsum[inv] / np.maximum(np.linalg.norm(nsum[inv], axis=1, keepdims=True), 1e-6))
             > 0.8) & (cnt[inv] > 1)
    rgb = rgb.copy()
    rgb[agree] = (sums[inv] / cnt[inv][:, None])[agree]
    e = np.empty(len(me.edges) * 2, np.int32)
    me.edges.foreach_get("vertices", e)
    e = e.reshape(-1, 2)
    for _ in range(iters):
        acc = np.zeros_like(rgb)
        c_ = np.zeros(n)
        np.add.at(acc, e[:, 0], rgb[e[:, 1]])
        np.add.at(acc, e[:, 1], rgb[e[:, 0]])
        np.add.at(c_, e[:, 0], 1)
        np.add.at(c_, e[:, 1], 1)
        has = c_ > 0
        rgb[has] = 0.5 * rgb[has] + 0.5 * acc[has] / c_[has][:, None]
    return rgb


def wall_hidden_rows(name: str, co: np.ndarray, L: np.ndarray) -> int:
    """A wall's rows behind the skirting, the picture rail and the cornice bake black (they are covered). The
    viewer never shows them, but the strip of wall beside a trim is drawn from them: its light ran from the lit row
    to the black one (a dark line along the trim), and at a grazing angle, where that strip is thinner than a pixel,
    the viewer's antialiasing read the light past its edge, far under ink. Each hidden vertex takes the light of
    the wall's nearest row clear of the trim, in its own column (`L`, N x C, is changed in place). Returns the
    vertices set."""
    H = FRAME[0].H
    sk, pr, c = CFG.get("skirting"), CFG.get("picture_rail"), CFG.get("cornice")
    z = co[:, 2]
    col = np.round((co[:, 0] if name.endswith(("Wall_N", "Wall_S")) else co[:, 1]) / 1e-3).astype(np.int64)
    n = 0
    rows = ([(z < sk + 0.003, (sk + 0.006,))] if sk is not None else []) + \
        ([(np.abs(z - pr) < 0.022, (pr - 0.026, pr + 0.026))] if pr is not None else []) + \
        ([(z > H - c - 0.004, (H - c - 0.008,))] if c is not None else [])     # a trim given as null hides no row
    for hidden, refs in rows:
        ref = np.zeros(len(z), bool)
        for zr in refs:
            ref |= np.abs(z - zr) < 1.5e-3
        if not hidden.any() or not ref.any():
            continue
        keys, inv = np.unique(col[ref], return_inverse=True)
        inv = inv.ravel()
        acc = np.zeros((len(keys), L.shape[1]))
        cnt = np.zeros(len(keys))
        np.add.at(acc, inv, L[ref])
        np.add.at(cnt, inv, 1)
        idx = np.nonzero(hidden)[0]
        pos = np.clip(np.searchsorted(keys, col[idx]), 0, len(keys) - 1)
        ok = keys[pos] == col[idx]
        L[idx[ok]] = (acc / cnt[:, None])[pos[ok]]
        n += int(ok.sum())
    return n


def obj_albedo_low(o) -> np.ndarray:
    """Each vertex's material's darkest albedo (the 3rd percentile of its texture x factor, luminance)."""
    me = o.data
    mats = [MATS.get(m.name) if m else None for m in me.materials]
    vals = [m.albedo_low if (m is not None and m.albedo_low is not None) else 0.05 for m in mats] or [0.05]
    out = np.full(len(me.vertices), 0.05)
    li = np.empty(len(me.loops), np.int32)
    me.loops.foreach_get("vertex_index", li)
    pm = np.empty(len(me.polygons), np.int32)
    me.polygons.foreach_get("material_index", pm)
    lt = np.empty(len(me.polygons), np.int32)
    me.polygons.foreach_get("loop_total", lt)
    face_of_loop = np.repeat(np.arange(len(me.polygons)), lt)
    out[li] = np.array(vals)[np.clip(pm[face_of_loop], 0, len(vals) - 1)]
    return out


def obj_albedo(o) -> np.ndarray:
    """Each vertex's mean albedo: its first face's material (image mean x factor)."""
    me = o.data
    n = len(me.vertices)
    alb = np.full((n, 3), 0.3)
    mats = [MATS.get(m.name) if m else None for m in me.materials]
    vals = [np.array(m.albedo if (m is not None and m.albedo is not None) else (0.3, 0.3, 0.3)) for m in mats] or \
        [np.array((0.3, 0.3, 0.3))]
    li = np.empty(len(me.loops), np.int32)
    me.loops.foreach_get("vertex_index", li)
    pm = np.empty(len(me.polygons), np.int32)
    me.polygons.foreach_get("material_index", pm)
    ls = np.empty(len(me.polygons), np.int32)
    me.polygons.foreach_get("loop_start", ls)
    lt = np.empty(len(me.polygons), np.int32)
    me.polygons.foreach_get("loop_total", lt)
    face_of_loop = np.repeat(np.arange(len(me.polygons)), lt)
    alb[li] = np.array(vals)[np.clip(pm[face_of_loop], 0, len(vals) - 1)]
    return alb


OBJ_KIND: dict = {}         # object name -> what it is (register's `what`)
FLIGHTS: list = []          # the stairs' flights as built (build_flights), for the manifest
HATCHES: list = []          # the floor hatches as built (build_hatches), for the manifest
NO_COLOR0: list = []        # the wdi_id of every registered mesh the bake leaves out on purpose


def flame_hosts() -> set:
    """The pieces a flame or a glow was split from (the candle stand with its candlestick) and every piece a light
    anchors to (the loader's hosts: a wall bracket, an oven, a lantern hook): their surfaces a hand's breadth from the
    flame are left out of E's hot surfaces and of k."""
    out = {r["obj"].get("wdi_split_of") for r in OBJS if r["obj"] is not None and r["obj"].get("wdi_split_of")}
    out |= {PIECES[h]["obj"].name for h in SPEC.get("hosts") or () if h in PIECES and PIECES[h]["obj"] is not None}
    return out


def choose_exposure(data: dict, flame, outside: set) -> dict:
    """The exposure E on the raw bake (display = AgX(E x albedo x light), three r186's AgX): the candle pool (the
    floor and walls within 1.8 m of the flame; its 90th percentile) at a display luminance of 0.55, warm and bright;
    capped so that the pool's hottest large surfaces (the 99th percentile of every room surface within 1.3 m of the
    flame, the candlestick and stand left out) stay under AgX's white (no clipping). Reported: the far floor and walls
    against ink (their 2nd and 10th percentiles: the darkest corners), the moon's patch. CFG["exposure"] overrides E.

    `flame`: the points of the lights whose pools set E (the loader's exposureFrom; one point is one light). With
    several (G4): each light's pool and the largest of their percentiles, the hot surfaces near any of them, the far
    shell farther than 3 m from all of them; one gives the arrays it always has."""
    hot, shell = [], []
    fs = [np.array(f) for f in _points(flame)]
    pools = [[] for _ in fs]
    patch = []
    hosts = flame_hosts()
    for name, (o, L, alb, co) in data.items():
        if name in outside:
            continue
        D0 = lum(alb * L)
        kind = OBJ_KIND.get(name)
        if fs:
            each = [np.linalg.norm(co - f, axis=1) for f in fs]
            dist = each[0] if len(each) == 1 else np.minimum.reduce(each)
            xl = CFG["look"]["exposure"]
            if kind == "shell":
                for i, d_ in enumerate(each):
                    pools[i].append(D0[d_ < xl["pool_radius_m"]])
            if name not in hosts and "flame" not in name:
                hot.append(D0[(dist < xl["hot_radius_m"]) & (dist > 0.25)])
        if kind == "shell":
            shell.append(D0 if not fs else D0[dist > 3.0])
        if name.endswith("Floor"):
            patch.append((L, co))
    hot = np.concatenate(hot) if hot else np.array([0.1])
    shell = np.concatenate(shell) if shell else np.array([0.01])
    p90 = pool_level(pools, CFG["look"]["exposure"]["pool_percentile"])
    h99 = float(np.percentile(hot, 99))

    def solve(level, D):
        lo, hi = 1e-3, 1e5
        for _ in range(60):
            mid = math.sqrt(lo * hi)
            if lum(agx([D, D, D], mid))[0] < level:
                lo = mid
            else:
                hi = mid
        return math.sqrt(lo * hi)

    xl = CFG["look"]["exposure"]
    E_pool = solve(xl["pool_display"], p90)
    E_cap = solve(xl["hot_display_max"], h99)
    E = float(CFG["exposure"]) if CFG.get("exposure") else min(E_pool, E_cap)
    ink = ink_level()
    p2, p10 = float(np.percentile(shell, 2)), float(np.percentile(shell, 10))
    out = dict(E=E, E_pool=E_pool, E_cap=E_cap, pool_p90=p90, hot_p99=h99,
               hot_p99_display=float(lum(agx([h99 * E] * 3))[0]), far_p2=p2, far_p10=p10, ink_D=ink,
               far_p2_over_ink=p2 * E / ink, far_p10_over_ink=p10 * E / ink,
               far_p10_display=float(lum(agx([p10 * E] * 3))[0]), ink_display=float(lum(np.array(INK) / 255.0)))
    if len(fs) > 1:     # the pools one by one (a v2 room with several pool lights)
        out["pool_p90_each"] = [round(pool_level([p_], CFG["look"]["exposure"]["pool_percentile"]), 6) for p_ in pools]
    if patch:   # the moon's patch on the floor: the bluest bright floor vertices
        L, co = patch[0]
        blue = L[:, 2] / np.maximum(L.sum(1), 1e-9)
        sel = (blue > 0.45) & (lum(L) > np.percentile(lum(L), 60))
        if sel.any():
            alb = np.array(MATS[nm("M_floor")].albedo)
            Dp = (alb * L[sel]).mean(0) * E
            disp = agx([Dp])[0]
            out.update(moon_patch_vertices=int(sel.sum()), moon_patch_display=[round(float(v), 3) for v in disp],
                       moon_patch_centre=[round(float(v), 2) for v in co[sel].mean(0)])
    return out


def obj_mat_rows(o) -> np.ndarray:
    """Each vertex's material slot (its first face's; split_material_seams makes it the only one)."""
    me = o.data
    out = np.zeros(len(me.vertices), np.int64)
    li = np.empty(len(me.loops), np.int32)
    me.loops.foreach_get("vertex_index", li)
    pm = np.empty(len(me.polygons), np.int32)
    me.polygons.foreach_get("material_index", pm)
    lt = np.empty(len(me.polygons), np.int32)
    me.polygons.foreach_get("loop_total", lt)
    out[li[::-1]] = np.repeat(pm, lt)[::-1]
    return out


def obj_mat_table(o, key: str, default) -> np.ndarray:
    """A per-vertex array of an RMat attribute (`albedo`, `dark_rgb`) by each vertex's material."""
    me = o.data
    vals = []
    for m in me.materials:
        rm = MATS.get(m.name) if m is not None else None
        v = getattr(rm, key, None) if rm is not None else None
        vals.append(np.array(v if v is not None else default, float))
    if not vals:
        vals = [np.array(default, float)]
    return np.array(vals)[np.clip(obj_mat_rows(o), 0, len(vals) - 1)]


def solve_display(base: np.ndarray, target, lo: float = 1e-5, hi: float = 1e7, iters: int = 44) -> np.ndarray:
    """Per row: the scale s at which the AgX display luminance of s x base (scene-linear RGB, exposure in) is
    `target` (a number or a per-row array); the display rises with s, so a bisection in log s."""
    n = len(base)
    lo_, hi_ = np.full(n, lo), np.full(n, hi)
    tg = np.broadcast_to(np.asarray(target, float), (n,))
    for _ in range(iters):
        mid = np.sqrt(lo_ * hi_)
        under = lum(agx(base * mid[:, None])) < tg
        lo_ = np.where(under, mid, lo_)
        hi_ = np.where(under, hi_, mid)
    return np.sqrt(lo_ * hi_)


def local_max(co: np.ndarray, v: np.ndarray, cell: float) -> np.ndarray:
    """Each point's largest value among the points within about one `cell` (the 27 cells round its own)."""
    key = np.floor(co / cell).astype(np.int64)
    key -= key.min(0)
    dims = key.max(0) + 3
    code = ((key[:, 0] + 1) * dims[1] + (key[:, 1] + 1)) * dims[2] + (key[:, 2] + 1)
    uniq, inv = np.unique(code, return_inverse=True)
    inv = inv.ravel()
    cmax = np.full(len(uniq), -np.inf)
    np.maximum.at(cmax, inv, v)
    out = v.copy()
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                nb = code + (dx * dims[1] + dy) * dims[2] + dz
                pos = np.searchsorted(uniq, nb)
                pos = np.clip(pos, 0, len(uniq) - 1)
                hit = uniq[pos] == nb
                out[hit] = np.maximum(out[hit], cmax[pos[hit]])
    return out


def limit_steps(o, L: np.ndarray, ratio: float, passes: int = 8) -> int:
    """No edge of the mesh steps the light by more than `ratio`: at the darker end of an edge that does, the light
    (`L`, N x 3, in place) is raised to the brighter end's over `ratio`, its colour scaled so the hue stays, a few
    passes so a chain of steps settles (L'(i) = the most over `ratio` ^ edges away). The viewer's canvas is 4x
    multisampled: a pixel whose centre lies outside its triangle is drawn with the vertex colours extrapolated, and
    across a step of 4 to 5 times (the shadow of the candle stand on the washstand's front, a 14 cm triangle) a few
    far edge pixels came out black. With the step bounded the extrapolation stays positive. The ink floor only
    rises. Returns the vertices raised."""
    me = o.data
    e = np.empty(len(me.edges) * 2, np.int32)
    me.edges.foreach_get("vertices", e)
    e = [e.reshape(-1, 2)]
    # the export triangulates quads and bigger faces: the diagonals are triangle edges too
    lt = np.empty(len(me.polygons), np.int32)
    ls = np.empty(len(me.polygons), np.int32)
    me.polygons.foreach_get("loop_total", lt)
    me.polygons.foreach_get("loop_start", ls)
    li = np.empty(len(me.loops), np.int32)
    me.loops.foreach_get("vertex_index", li)
    q = ls[lt == 4]
    if len(q):
        e.append(np.stack([li[q], li[q + 2]], 1))
        e.append(np.stack([li[q + 1], li[q + 3]], 1))
    for st, n in zip(ls[lt > 4], lt[lt > 4]):
        v = li[st:st + n]
        e.append(np.array([(v[i], v[j]) for i in range(n) for j in range(i + 2, n) if not (i == 0 and j == n - 1)],
                          np.int32).reshape(-1, 2))
    e = np.concatenate(e)
    if not len(e):
        return 0
    raised = np.zeros(len(L), bool)
    for _ in range(passes):
        Y = lum(L)
        a, b = e[:, 0], e[:, 1]
        a_hi = Y[a] >= Y[b]
        hi, lo = np.where(a_hi, a, b), np.where(a_hi, b, a)
        bad = Y[hi] > ratio * np.maximum(Y[lo], 1e-12)
        if not bad.any():
            break
        need = np.zeros(len(L))
        np.maximum.at(need, lo[bad], Y[hi[bad]] / ratio)
        up = need > Y
        L[up] *= (need[up] / np.maximum(Y[up], 1e-12))[:, None]
        raised |= up
    return int(raised.sum())


def emitters_used() -> list:
    """The emit and glass materials the room's meshes use, by their look key (M_flame, M_moon, ...: the name without
    the room's prefix)."""
    names = set()
    for r in OBJS:
        o = r["obj"]
        if o is None or o.type != "MESH" or o.data is None:
            continue
        for m in o.data.materials:
            rm = MATS.get(m.name) if m is not None else None
            if rm is not None and rm.kind in ("emit", "glass"):
                names.add(m.name[len(P):] if m.name.startswith(P) else m.name)
    return sorted(names)


def post_bake(objs: list, flame, outside: set, no_bake: bool, raw: dict | None = None, ao: dict | None = None) -> dict:
    """Denoise, scale the outside, choose E and k, then grade the light per vertex (palette rules) and write
    COLOR_0 = k x light:

    - lilac: where a vertex's light is a candle and moon mix with less green than red and blue (it would show
      lilac or magenta), its green is raised to the lesser of the two (a warm or cool white); and where the
      material's most purple-prone texels would still show with green the least, the light's blue comes down;
    - ink floor: Lf, the light at which the material's reference texel (the 0.5th percentile of texture x factor)
      shows at ink's display luminance plus `ink_lift.margin_luma`, solved through three r186's AgX with the texel's
      own colour and the floor light's colour (a warm dark shows darker than a grey of the same luminance). The
      floor light's colour is `floor_neutral` of the way from the vertex's own light to `floor_colour`, the night's
      near-white ambient;
    - form: the floor is raised toward (1 + form) x Lf with the open sky the vertex sees (its AO, `form_ao`; without
      an AO bake, where it is lit relative to its neighbourhood: r = L / max(the local brightest light, form_knee x
      Lf), to the power form_gamma), so a crease, a panel's bevel and a foot on the floor still read on dark
      furniture in a dim corner instead of one flat floor; L' = sqrt(L^2 + (Lf m)^2), channel by channel;
    - highlights: where the material's mean colour would show brighter than `hot.knee` (AgX's path to white turns
      candle-lit wood peach), the light eases toward `hot.max` (a material's own pair in SCAN_GRADE's `hot`)."""
    look = CFG["look"]
    il = look.get("ink_lift", {})
    aoc = look.get("ao", {})
    ao_s, ao_g = float(aoc.get("strength", 0.0)), float(aoc.get("gamma", 1.0))
    data, open_sky = {}, {}
    for o in objs:
        if raw is not None:
            L = raw[o.name].copy()
        else:
            L = read_attr(o)
            if not no_bake:
                L = denoise(o, L)
        if ao is not None and o.name in ao and o.name not in outside:
            # the contact shadows the viewer cannot draw: the light times (1 - s + s AO^g), before the ink floor.
            # The walls and the ceiling take `ao.walls` (gentler): at their 10 cm rows the full AO drew a dark band
            # several centimetres wide along the picture rail, the skirting and the cornice
            s_, g_ = ao_s, ao_g
            if re.search(r"_(Wall_[NSEW]|Ceiling)$", o.name) and aoc.get("walls"):
                s_, g_ = float(aoc["walls"].get("strength", ao_s)), float(aoc["walls"].get("gamma", ao_g))
            elif OBJ_KIND.get(o.name) == "trim" and aoc.get("trims"):
                # the cornice, the picture rail and the skirting are part of the shell: at the pieces' strength the
                # AO of a room corner (two walls and the ceiling inside its reach) on top of a cabinet's shadow
                # left a soot-dark patch on the pale cornice over wardrobe_body
                s_, g_ = float(aoc["trims"].get("strength", ao_s)), float(aoc["trims"].get("gamma", ao_g))
            open_sky[o.name] = np.clip(ao[o.name], 0.0, 1.0) ** g_
            L = L * (1.0 - s_ + s_ * open_sky[o.name])[:, None]
        if o.name in outside:
            L = L * CFG["outside"]["gain"]
        me = o.data
        co = np.empty(len(me.vertices) * 3, np.float32)
        me.vertices.foreach_get("co", co)
        co = co.reshape(-1, 3) @ np.array(o.matrix_world.to_3x3()).T + np.array(o.matrix_world.translation)
        data[o.name] = (o, L, obj_albedo(o), co)
    ex = choose_exposure(data, flame, outside)
    E = ex["E"]
    hosts = flame_hosts()
    room_L = np.concatenate([lum(L) for n_, (o, L, a, c) in data.items() if n_ not in outside and n_ not in hosts])
    # k: the room's light at its 99.9th percentile becomes 1 (a normalized export would clip only the flame-side hot
    # spots; the candle stand, lit from a few centimetres, left out), and never so large that an emitter's display
    # colour / wdi_exposure leaves the glTF factor's 0..1: the emitters this room builds (a look entry for one it has
    # not, another room's coals, does not cap its k: coupling 11 of the implementation plan)
    emit_max = rf.emit_cap(CFG.get("emit_display", {}), emitters_used())
    k = min(1.0 / max(float(np.percentile(room_L, 99.9)), 1e-6), E / (1.05 * emit_max))
    ink = ex["ink_D"]
    target = (lum(np.array(INK, float)) + float(il.get("margin_luma", 1.2))) / 255.0
    form, knee, gamma = float(il.get("form", 0.6)), float(il.get("form_knee", 0.5)), float(il.get("form_gamma", 0.5))
    cell = float(il.get("form_cell_m", 0.3))
    form_ao = float(il.get("form_ao", 0.0)) if ao is not None else 0.0
    fl_w = float(il.get("floor_neutral", 0.0)) if il.get("floor_colour") else 0.0
    fl_n = np.array(hex_lin(il["floor_colour"])) if fl_w > 0 else np.ones(3)
    fl_n = fl_n / lum(fl_n)
    hot = look.get("hot", {})
    hot_knee, hot_max = float(hot.get("knee", 0.62)), float(hot.get("max", 0.80))
    step_ratio = float(il.get("step_ratio", 0.0))
    below = total = lilac_fixed = hot_eased = purple_fixed = step_raised = 0
    lifted, flat = {}, {}
    for name, (o, L, alb, co) in data.items():
        have = lum(L)
        mean_col = L.sum(0) / max(float(L.sum()), 1e-9) * 3.0 if float(L.sum()) > 0 else np.ones(3)
        chroma = np.where((have > 1e-7)[:, None], L / np.maximum(have, 1e-9)[:, None],
                          (mean_col / max(lum(mean_col), 1e-9))[None, :])
        # lilac: less green than both red and blue (a candle-and-moon mix)
        g_min = np.minimum(chroma[:, 0], chroma[:, 2])
        fix = chroma[:, 1] < g_min
        if fix.any() and name not in outside:
            chroma[fix, 1] = g_min[fix]
            lilac_fixed += int(fix.sum())
        chroma = chroma / np.maximum(lum(chroma), 1e-9)[:, None]
        # the floor's colour: `floor_neutral` of the way from the vertex's own light to the night's ambient
        # (`floor_colour`). The candle's bounce on a red-brown wood, lifted to ink's luminance, is a saturated ember
        # orange and read as a glow in the dim corners; under the ambient it is the wood's own dark brown
        fchroma = chroma
        if fl_w > 0 and name not in outside:
            fchroma = (1.0 - fl_w) * chroma + fl_w * fl_n[None, :]
            fchroma = fchroma / np.maximum(lum(fchroma), 1e-9)[:, None]
        # the ink floor, solved on the display with the texel's and the floor light's colours
        dark = obj_mat_table(o, "dark_rgb", (0.05, 0.05, 0.05))
        Lf = solve_display(E * dark * fchroma, target)
        # a Meshy texture's own darkest texels kept off black (its reference sits higher: set_ref's `deep`)
        deep = obj_mat_table(o, "deep_rgb", (-1.0, -1.0, -1.0))
        has = deep[:, 0] >= 0
        if has.any():
            lumas = []
            for m in o.data.materials:
                rm = MATS.get(m.name) if m is not None else None
                lumas.append(float(rm.deep_luma) if rm is not None and rm.deep_luma else 0.0)
            lumas = lumas or [0.0]
            luma_deep = np.array(lumas)[np.clip(obj_mat_rows(o), 0, len(lumas) - 1)]
            Ld = solve_display(E * deep[has] * fchroma[has], luma_deep[has] / 255.0)
            Lf[has] = np.maximum(Lf[has], Ld)
        Lf = np.minimum(Lf, 1e4)
        # form: a dim surface keeps its own light's shape above the floor; where no light reaches at all, the shape
        # is the open sky each vertex sees (its AO), so a crease, a panel's bevel and a foot on the floor still read
        r = np.clip(have / np.maximum(local_max(co, have, cell), knee * Lf), 0.0, 1.0) ** gamma
        if name in open_sky:
            r = (1.0 - form_ao) * r + form_ao * open_sky[name]
        m = 1.0 + form * r
        below += int((have < Lf).sum())
        total += len(have)
        # the light and the floor add in quadrature, channel by channel (each in its own colour)
        L2 = np.sqrt((chroma * have[:, None]) ** 2 + (fchroma * (Lf * m)[:, None]) ** 2)
        if fl_w > 0:
            if name not in outside:     # a warm light and a cooler floor can leave green the least: never lilac
                g_min = np.minimum(L2[:, 0], L2[:, 2])
                fix = L2[:, 1] < g_min
                L2[fix, 1] = g_min[fix]
        if name not in outside:
            # ... and never on the material: where its most purple-prone texels (RMat.purple_rgb: a red paint speck
            # with as much blue as green) would show with green the least under this light, the light's blue comes
            # down until that texel's blue is its green (the moon's bounce on the console's specks read plum)
            pr = obj_mat_table(o, "purple_rgb", (0.3, 0.3, 0.3))
            c = pr * L2
            lim = np.where(pr[:, 0] > 1.25 * pr[:, 1], 0.8, 1.0)    # a clearly red texel: a margin under its green
            fix = (c[:, 1] < c[:, 0]) & (c[:, 2] > lim * c[:, 1])
            if fix.any():
                L2[fix, 2] = lim[fix] * L2[fix, 1] * pr[fix, 1] / np.maximum(pr[fix, 2], 1e-9)
                purple_fixed += int(fix.sum())
        if fl_w > 0:
            # two colours' quadrature is not AgX's luminance: the reference texel held at the target
            low = lum(agx(E * dark * L2)) < target - 2e-4
            if low.any():
                L2[low] *= solve_display(E * dark[low] * L2[low], target, lo=1.0, hi=64.0, iters=30)[:, None]
        # highlights: ease the light where the material's mean colour would show past the knee
        if name not in outside:
            mean_alb = obj_mat_table(o, "albedo", (0.3, 0.3, 0.3))
            hk = obj_mat_table(o, "hot", (hot_knee, hot_max))      # a material's own knee and ceiling (SCAN_GRADE)
            d = lum(agx(E * mean_alb * L2))
            over = d > hk[:, 0]
            if over.any():
                kv, mv = hk[over, 0], hk[over, 1]
                want = kv + (mv - kv) * np.tanh((d[over] - kv) / (mv - kv))
                s = solve_display(E * mean_alb[over] * L2[over], want, lo=1e-3, hi=1.0, iters=30)
                L2[over] *= s[:, None]
                hot_eased += int(over.sum())
        if step_ratio > 1.0 and name not in outside:
            step_raised += limit_steps(o, L2, step_ratio)
        lifted[name] = L2
        Lw = lum(L2)
        flat[name] = round(float((Lw <= Lw.min() * 1.03).mean()), 3) if len(Lw) else 0.0
        write_attr(o, (L2 * k).astype(np.float32))
    ex.update(k=k, wdi_exposure=E / k, ink_target_luma=round(target * 255, 2), below_ink_vertices=below,
              total_vertices=total, below_ink_share=round(below / max(total, 1), 4), lilac_fixed_vertices=lilac_fixed,
              purple_guard_vertices=purple_fixed, step_ratio=step_ratio, step_raised_vertices=step_raised,
              hot_eased_vertices=hot_eased, share_at_floor=dict(sorted(flat.items(), key=lambda kv: -kv[1])[:12]),
              corners=corner_report(data, lifted, E, ink))
    return ex


def corner_report(data: dict, lifted: dict, E: float, ink: float) -> dict:
    """The room's darkest corners in the viewer: the floor and the walls under 2 m within 0.9 m of each corner, off
    the furniture's footprints; their median and 5th percentile, raw and after the lift, as multiples of ink and as
    the AgX display luminance (ink is 0.079)."""
    fr = FRAME[0]
    boxes = [p["box"] for p in PIECES.values() if p["spec"].get("model") not in ("rug", "photos")]
    out = {}
    for cname, (cx, cy) in (("SW", (fr.x0, fr.y0)), ("SE", (fr.x1, fr.y0)), ("NW", (fr.x0, fr.y1)),
                            ("NE", (fr.x1, fr.y1))):
        raw, lift = [], []
        for name, (o, L, alb, co) in data.items():
            if OBJ_KIND.get(name) != "shell" or name.endswith("Ceiling"):
                continue
            sel = (np.abs(co[:, 0] - cx) < 0.9) & (np.abs(co[:, 1] - cy) < 0.9) & (co[:, 2] < 2.0)
            for b in boxes:
                sel &= ~((co[:, 0] > b[0] - 0.05) & (co[:, 0] < b[3] + 0.05) & (co[:, 1] > b[1] - 0.05) &
                         (co[:, 1] < b[4] + 0.05) & (co[:, 2] < b[5]))
            if sel.any():
                a_ = lum(alb[sel])
                raw.append(E * a_ * lum(L[sel]))
                lift.append(E * a_ * lum(lifted[name][sel]))
        if not raw:
            continue
        raw, lift = np.concatenate(raw), np.concatenate(lift)
        out[cname] = dict(vertices=int(len(raw)), raw_median_ink=round(float(np.median(raw)) / ink, 2),
                          raw_p5_ink=round(float(np.percentile(raw, 5)) / ink, 2),
                          lifted_median_ink=round(float(np.median(lift)) / ink, 2),
                          lifted_p5_ink=round(float(np.percentile(lift, 5)) / ink, 2),
                          display_median=round(float(lum(agx([[float(np.median(lift))] * 3])[0])), 3))
    return out


FRAME: list = []


def room_light_numbers(fr: Frame, objs: list, ex: dict, flame) -> dict:
    """light_numbers on the room as built: the floor's and the walls' vertices, each shown through three's AgX at
    the area's exposure with its material's mean colour (COLOR_0 is written by then)."""
    surf = {}
    for o in objs:
        m = re.search(r"_(Floor|Wall_[NSEW])$", o.name)
        if m is None:
            continue
        co = np.empty(len(o.data.vertices) * 3, np.float32)
        o.data.vertices.foreach_get("co", co)
        co = co.reshape(-1, 3) @ np.array(o.matrix_world.to_3x3()).T + np.array(o.matrix_world.translation)
        y = lum(agx(obj_albedo(o) * read_attr(o), ex["wdi_exposure"])) * 255.0
        li = np.empty(len(o.data.loops), np.int32)        # the vertices its faces use (a wall keeps its grid's loose
        o.data.loops.foreach_get("vertex_index", li)      # vertices inside the openings: the GLB does not)
        used = np.zeros(len(co), bool)
        used[li] = True
        surf[m.group(1)] = (co[used], y[used])
    return light_numbers(surf, flame, [p["box"] for p in PIECES.values()] + curtain_boxes(fr, CFG),
                         moon_patches(fr, CFG))


# ---------------------------------------------------------------- collision and the walk check


def tri_samples(P: np.ndarray, T: np.ndarray, step: float) -> np.ndarray:
    """Points over every triangle (P vertices, T index triples) no more than about `step` apart."""
    a, b, c = P[T[:, 0]], P[T[:, 1]], P[T[:, 2]]
    L = np.maximum(np.maximum(np.linalg.norm(b - a, axis=1), np.linalg.norm(c - b, axis=1)),
                   np.linalg.norm(a - c, axis=1))
    n = np.clip(np.ceil(L / step).astype(int), 1, 96)
    out = []
    for nn in np.unique(n):
        sel = n == nn
        w = np.array([(i / nn, j / nn, 1.0 - (i + j) / nn) for i in range(nn + 1) for j in range(nn + 1 - i)])
        A, B, C = a[sel], b[sel], c[sel]
        out.append((w[:, 0, None, None] * A[None] + w[:, 1, None, None] * B[None] +
                    w[:, 2, None, None] * C[None]).reshape(-1, 3))
    return np.concatenate(out) if out else np.zeros((0, 3))


def world_tris(ob) -> tuple:
    me = ob.data
    me.calc_loop_triangles()
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", co)
    M = np.array(ob.matrix_world)
    P = co.reshape(-1, 3).astype(np.float64) @ M[:3, :3].T + M[:3, 3]
    T = np.empty(len(me.loop_triangles) * 3, np.int32)
    me.loop_triangles.foreach_get("vertices", T)
    return P, T.reshape(-1, 3)


LOW_TOPS = (0.58, 0.50, 0.44)   # the low layers' upper bounds, tallest first (the foot sphere's centre is at 0.65)


def footprint_boxes(objs: list, fr: Frame, cell: float = 0.01, tol: float = 0.025,
                    band=(STEP_H, BODY_H)) -> list:
    """A piece's collision as boxes that hug what the player can touch: its geometry between the step height and
    the top of the capsule, seen from above on a `cell` grid (so an open cabinet door, a round table top, a
    mirror's angled wing and a bed's hanging coverlet are all in it), covered greedily by rectangles that stay
    within `tol` of it; each box from the floor to the piece's top over it. A piece's one bounding box let the player
    walk into open doors and stopped them short of round or angled pieces (invisible walls). What stands lower than
    the capsule's foot sphere (its centre STEP_H + CAPSULE_R up: a seat's front, a low rail) is covered apart, in
    three layers of height (LOW_TOPS), so its boxes are about as tall as it is: the sphere rounds a low edge as the
    eye expects, where a full-height box over a chair's seat was a wall of air. A lower layer's boxes may run on
    under taller geometry (which has its own boxes), never over a layer lower still."""
    geo = [world_tris(ob) for ob in objs]
    geo = [(P, T) for P, T in geo if len(T)]
    if not geo:
        return []
    allP = np.concatenate([P for P, _T in geo])
    lo = allP[:, :2].min(0) - 3 * tol
    hi = allP[:, :2].max(0) + 3 * tol
    nx, ny = int(math.ceil((hi[0] - lo[0]) / cell)) + 1, int(math.ceil((hi[1] - lo[1]) / cell)) + 1
    occ = np.zeros((nx, ny), bool)
    ztop = np.zeros((nx, ny))

    def cells(p):
        ij = np.clip(np.floor((p[:, :2] - lo) / cell).astype(int), 0, [nx - 1, ny - 1])
        return ij[:, 0], ij[:, 1]

    for P, T in geo:
        np.maximum.at(ztop, cells(P), P[:, 2])          # the tallest vertex over each cell, for the boxes' tops
        z = P[T][:, :, 2]
        keep = (z.max(1) >= band[0]) & (z.min(1) <= band[1])    # triangles that reach into the band
        Tk = T[keep]
        for s in range(0, len(Tk), 20000):              # sampled in batches: a big piece is millions of points
            pts = tri_samples(P, Tk[s:s + 20000], cell * 0.6)
            pts = pts[(pts[:, 2] >= band[0]) & (pts[:, 2] <= band[1])]
            if len(pts):
                occ[cells(pts)] = True
                np.maximum.at(ztop, cells(pts), pts[:, 2])
    if not occ.any():
        return []
    xs = lo[0] + (np.arange(nx) + 0.5) * cell
    ys = lo[1] + (np.arange(ny) + 0.5) * cell
    inside = ((xs[:, None] > fr.x0 + 0.002) & (xs[:, None] < fr.x1 - 0.002) &
              (ys[None, :] > fr.y0 + 0.002) & (ys[None, :] < fr.y1 - 0.002))
    occ &= inside
    r = int(math.floor(tol / cell))
    disc = [(di, dj) for di in range(-r, r + 1) for dj in range(-r, r + 1) if di * di + dj * dj <= r * r]

    def dilate(mask):
        # cells a box may cover: within tol of the layer's geometry (a disc dilation), and inside the room
        out = np.zeros_like(mask)
        oi, oj = np.nonzero(mask)
        for di, dj in disc:
            ii, jj = oi + di, oj + dj
            m = (ii >= 0) & (ii < nx) & (jj >= 0) & (jj < ny)
            out[ii[m], jj[m]] = True
        return out & inside

    # layer 0: what reaches near the foot sphere's centre or higher (a full-height box is right within a centimetre);
    # layers 1..3: what stays lower, by LOW_TOPS (within a layer the sphere's reach changes by under 5 cm)
    level = np.zeros(ztop.shape, int)
    for k, top_k in enumerate(LOW_TOPS):
        level[ztop < top_k] = k + 1
    boxes = []
    for lv in np.unique(level[occ]):
        layer = occ & (level == lv)
        allow = dilate(occ & (level <= lv))     # its own cells and every taller layer's
        todo = layer.copy()
        while todo.any():
            i0, j0 = map(int, np.argwhere(todo)[0])
            best = None
            for first in ("i", "j"):
                i1, j1 = i0, j0
                if first == "i":
                    while i1 + 1 < nx and allow[i1 + 1, j0]:
                        i1 += 1
                    while j1 + 1 < ny and allow[i0:i1 + 1, j1 + 1].all():
                        j1 += 1
                else:
                    while j1 + 1 < ny and allow[i0, j1 + 1]:
                        j1 += 1
                    while i1 + 1 < nx and allow[i1 + 1, j0:j1 + 1].all():
                        i1 += 1
                gain = int(todo[i0:i1 + 1, j0:j1 + 1].sum())
                if best is None or gain > best[0]:
                    best = (gain, i1, j1)
            _g, i1, j1 = best
            todo[i0:i1 + 1, j0:j1 + 1] = False
            top = float(ztop[i0:i1 + 1, j0:j1 + 1][layer[i0:i1 + 1, j0:j1 + 1]].max())
            boxes.append((round(float(lo[0] + i0 * cell), 4), round(float(lo[1] + j0 * cell), 4), 0.0,
                          round(float(lo[0] + (i1 + 1) * cell), 4), round(float(lo[1] + (j1 + 1) * cell), 4),
                          round(max(top, band[0] + 0.05), 4)))
    return boxes


def collision(fr: Frame, doors: list) -> tuple:
    """HM_Collision_room_<id>: the floor and ceiling slabs, the four walls overlapping at the corners (the door shut,
    the window glazed), and every standing piece and the curtains as boxes that hug what the player can touch
    (footprint_boxes). Room coordinates, no material."""
    boxes = []
    T, H = fr.T, fr.H
    x0, x1, y0, y1 = fr.x0, fr.x1, fr.y0, fr.y1
    boxes.append(("floor", (x0 - T, y0 - T, -0.25, x1 + T, y1 + T, 0.0)))
    boxes.append(("ceiling", (x0 - T, y0 - T, H, x1 + T, y1 + T, H + 0.25)))
    boxes.append(("wall_S", (x0 - T, y0 - T, -0.25, x1 + T, y0, H + 0.25)))
    boxes.append(("wall_N", (x0 - T, y1, -0.25, x1 + T, y1 + T, H + 0.25)))
    boxes.append(("wall_W", (x0 - T, y0 - T, -0.25, x0, y1 + T, H + 0.25)))
    boxes.append(("wall_E", (x1, y0 - T, -0.25, x1 + T, y1 + T, H + 0.25)))
    for door in doors:      # each door's architrave legs and knob (door_one): door#k, a v2 door's door_<id>#k
        tag = f"door_{door['id']}" if is_v2() else "door"
        for k, b in enumerate(door.get("collision", ())):
            boxes.append((f"{tag}#{k}", tuple(b)))
    for m in fr.markers:    # a stairs well and its balustrade (G12): the walker stands at the rail, the portal fires
        if m.get("flight"):
            boxes.append((f"stairs_{m['id']}", tuple(float(v) for v in m["flight"]["box"])))
    for pid, wv in WALLS.items():       # a wall-piece (G21): its outline's boxes, floor to ceiling
        for k, b in enumerate(wv["boxes"]):
            boxes.append((f"{pid}#{k}", (float(b[0]), float(b[1]), 0.0, float(b[2]), float(b[3]), H)))
    groups = {}
    for r in OBJS:
        o = r["obj"]
        if o is None or o.type != "MESH" or r["what"] not in ("piece", "cloth"):
            continue
        pid = r["id"].split(":")[0]
        if pid == "swag" or pid.startswith("swag_"):     # the swag hangs overhead (a v2 window's: swag_<id>)
            continue
        p = PIECES.get(pid)
        if p is not None and p["spec"].get("model") in ("rug", "photos", "wall"):
            continue
        groups.setdefault(pid, []).append(o)
    for pid, objs in groups.items():
        fb = footprint_boxes(objs, fr)
        for k, b in enumerate(fb):
            boxes.append((f"{pid}#{k}", b))
        log(f"collision {pid}: {len(fb)} boxes")
    v, f = [], []
    for _name, (a0, b0, c0, a1, b1, c1) in boxes:
        base = len(v)
        v += [(a0, b0, c0), (a1, b0, c0), (a1, b1, c0), (a0, b1, c0), (a0, b0, c1), (a1, b0, c1), (a1, b1, c1), (a0, b1, c1)]
        f += [tuple(base + i for i in q) for q in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6),
                                                   (3, 0, 4, 7))]
    me = bpy.data.meshes.new(f"HM_Collision_room_{fr.room.id}")
    me.from_pydata(v, [], f)
    me.update()
    ob = bpy.data.objects.new(f"HM_Collision_room_{fr.room.id}", me)
    COL["room"].objects.link(ob)
    ob["wdi_collision"] = True
    ob["wdi_note"] = "hide this mesh: room coordinates (the area's offset applies when the room is appended)"
    return ob, boxes


def boxes_sha1(boxes: list) -> str:
    """The collision boxes' sha1 (each name and its six numbers to 0.1 mm): the regression gate's manifest digest
    compares it, as the box count alone would not see a box that moved."""
    import hashlib
    rows = [[n, [round(float(v), 4) for v in b]] for n, b in boxes]
    return hashlib.sha1(json.dumps(rows, separators=(",", ":")).encode()).hexdigest()


def walk_check(fr: Frame, boxes: list, spawns_xy: list, portals_xy: list) -> dict:
    """Can the player (capsule r 0.3, 0.35 to 1.75 m) reach the doors and the walkable tiles from the spawns? A 2 cm
    grid of the floor, the boxes that reach into the capsule's height grown by its radius, a flood fill from every
    spawn (the floor any of them reaches); the same at r 0.35 and 0.4 for the walking gaps. `spawns_xy` and
    `portals_xy` are lists of (x, y): every spawn must stand free (spawnFree), and portalNearestReachM is the
    farthest any portal stands from the reached floor (byPortal gives each one's when there are more than one; a
    room with no portal has None). One spawn and one portal give the numbers the check has always given."""
    res = 0.02
    xs = np.arange(fr.x0 + res / 2, fr.x1, res)
    ys = np.arange(fr.y0 + res / 2, fr.y1, res)
    X, Y = np.meshgrid(xs, ys)
    out = {}
    for r in (CAPSULE_R, 0.35, 0.40):      # the capsule; a 0.7 m body; a 0.8 m body (every path at least 0.8 m wide)
        blocked = (X < fr.x0 + r) | (X > fr.x1 - r) | (Y < fr.y0 + r) | (Y > fr.y1 - r)
        for name, (a0, b0, c0, a1, b1, c1) in boxes:
            if name in ("floor", "ceiling") or name.startswith("wall_"):
                continue
            if c1 <= STEP_H or c0 >= BODY_H:
                continue
            # a box under the foot sphere's centre is met by the sphere's curve, not its full radius
            rr = r if c1 >= STEP_H + r else math.sqrt(max(r * r - (STEP_H + r - c1) ** 2, 0.0))
            dx = np.maximum(np.maximum(a0 - X, 0), X - a1)
            dy = np.maximum(np.maximum(b0 - Y, 0), Y - b1)
            blocked |= (dx * dx + dy * dy) < rr * rr
        free = ~blocked
        reach = np.zeros_like(free)
        stack, spawn_free = [], []
        for spawn_xy in spawns_xy:
            sj, si = int((spawn_xy[1] - ys[0]) / res + 0.5), int((spawn_xy[0] - xs[0]) / res + 0.5)
            spawn_free.append(bool(free[sj, si]) if 0 <= sj < free.shape[0] else False)
            if 0 <= sj < free.shape[0] and 0 <= si < free.shape[1] and free[sj, si] and not reach[sj, si]:
                stack.append((sj, si))
                reach[sj, si] = True
        if stack:
            while stack:
                j, i = stack.pop()
                for dj, di in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    a, b = j + dj, i + di
                    if 0 <= a < free.shape[0] and 0 <= b < free.shape[1] and free[a, b] and not reach[a, b]:
                        reach[a, b] = True
                        stack.append((a, b))
        tiles_ok, tiles_no = [], []
        for ty in range(fr.room.h):
            for tx in range(fr.room.w):
                if not fr.room.walkable(tx, ty):
                    continue
                cx, cy = fr.room.centre(tx, ty)
                d2 = (X - cx) ** 2 + (Y - cy) ** 2
                near = reach & (d2 < 0.35 ** 2)
                (tiles_ok if near.any() else tiles_no).append([tx, ty])
        by_portal = []
        for portal_xy in portals_xy:
            pd = np.sqrt((X - portal_xy[0]) ** 2 + (Y - portal_xy[1]) ** 2)
            by_portal.append(float(pd[reach].min()) if reach.any() else None)
        door_d = None if not by_portal or None in by_portal else max(by_portal)
        # how near the body's centre comes to each standing piece's body box (r: it stands against it)
        near = {}
        for pid, p in PIECES.items():
            if p["spec"].get("model") in ("rug", "photos") or not reach.any():
                continue
            b = p["box"]
            dx = np.maximum(np.maximum(b[0] - X, 0), X - b[3])
            dy = np.maximum(np.maximum(b[1] - Y, 0), Y - b[4])
            near[pid] = round(float(np.sqrt(dx * dx + dy * dy)[reach].min()), 3)
        out[f"r{r:.2f}"] = dict(spawnFree=bool(spawn_free) and all(spawn_free),
                                reachableShare=round(float(reach.sum()) / float(free.size), 3),
                                tilesReached=len(tiles_ok), tilesNotReached=tiles_no,
                                portalNearestReachM=None if door_d is None else round(door_d, 3),
                                portalFires=(door_d is not None and door_d <= 1.0) if portals_xy else None,
                                pieceNearestM=near)
        if len(portals_xy) > 1:
            out[f"r{r:.2f}"]["byPortal"] = [None if d_ is None else round(d_, 3) for d_ in by_portal]
        if r == CAPSULE_R:
            out["_mask"] = reach
    out["_grid"] = (float(xs[0]), float(ys[0]), res, reach.shape)
    return out


# ---------------------------------------------------------------- checks: intersections, floating, walls


def piece_checks(fr: Frame) -> dict:
    out = {"intersections": [], "floating": [], "backed": {}}
    items = [(pid, p["box"]) for pid, p in PIECES.items() if p["spec"].get("model") not in ("rug", "photos")]
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            (a, A), (b, B) = items[i], items[j]
            ov = [min(A[3], B[3]) - max(A[0], B[0]), min(A[4], B[4]) - max(A[1], B[1]), min(A[5], B[5]) - max(A[2], B[2])]
            if min(ov) > 0.002:
                out["intersections"].append(dict(a=a, b=b, overlapM=[round(v, 3) for v in ov]))
    for pid, A in items:
        if abs(A[2]) > 0.003:
            out["floating"].append(dict(id=pid, bottomZ=round(A[2], 4)))
        gaps = {"N": fr.y1 - A[4], "S": A[1] - fr.y0, "E": fr.x1 - A[3], "W": A[0] - fr.x0}
        near = {k: round(v, 3) for k, v in gaps.items() if v < 0.25}
        out["backed"][pid] = near
    return out


def piece_tile(fr: Frame, pid: str) -> tuple | None:
    """A piece's tile on the game's map (its prop's or its spot's), or None for the first person's own decor."""
    return next(((p["x"], p["y"]) for p in fr.room.props if p["id"] == pid), None) or \
        next(((s["x"], s["y"]) for s in fr.room.spots if s["id"] == pid), None)


def from_tile(fr: Frame, pid: str) -> dict:
    """Where a piece stands against its tile on the game's map: the tile, its centre, and how far the piece's
    centre is from it (metres; dx east, dy north). A wall-mounted piece's tile is in the wall's own row."""
    t = piece_tile(fr, pid)
    if t is None:
        return {}
    b = PIECES[pid]["box"]
    tx, ty = fr.room.centre(*t)
    cx, cy = (b[0] + b[3]) / 2, (b[1] + b[4]) / 2
    return dict(tile=[int(t[0]), int(t[1])], tileCentre=[round(tx, 3), round(ty, 3)],
                fromTileM=round(math.hypot(cx - tx, cy - ty), 3), fromTileXY=[round(cx - tx, 3), round(cy - ty, 3)])


def spot_rows(fr: Frame, walk: dict) -> list:
    """The scene's spots in this arrangement, for the keeper of the game's data: each spot's piece (the bed for the
    under-bed hide), where it stands, how far that is from the spot's own tile on the game's map, and how near the
    player's body comes to it (the capsule, a 0.7 m and a 0.8 m body: 0.3, 0.35 and 0.4 mean it stands against it)."""
    rows = []
    for s in fr.room.spots:
        pid = s["id"] if s["id"] in PIECES else None
        if pid is None and s.get("variant") == "underBed":
            # the loader's map (meshy_room_file: the bed beside the spot or the bed that covers it; on the legacy path
            # the first bed piece, as before)
            pid = (SPEC.get("underBed") or {}).get(s["id"])
        if pid is None:
            pid = next((c["id"] for c in [(SPEC.get("coverage") or {}).get(s["id"]) or {}] if c.get("by") == "covers"),
                       None)
        if pid is None:
            continue
        b = PIECES[pid]["box"]
        tx, ty = fr.room.centre(s["x"], s["y"])
        cx, cy = (b[0] + b[3]) / 2, (b[1] + b[4]) / 2
        row = dict(id=s["id"], kind=s.get("kind"), variant=s.get("variant"), tile=[s["x"], s["y"]],
                   tileCentre=[round(tx, 3), round(ty, 3)], piece=pid, centre=[round(cx, 3), round(cy, 3)],
                   box=[round(float(v), 3) for v in b], fromTileM=round(math.hypot(cx - tx, cy - ty), 3),
                   face=PIECES[pid]["piece"].get("face"),
                   bodyNearestM={k: v["pieceNearestM"].get(pid) for k, v in walk.items() if not k.startswith("_")})
        if s.get("variant") == "underBed":
            row["gapUnderM"] = float(PIECES[pid]["piece"].get("lift", 0.0))
        rows.append(row)
    return rows


# ---------------------------------------------------------------- spawn, portal, area, hierarchy


FACING_RZ = {"n": 0.0, "e": -90.0, "s": 180.0, "w": 90.0}   # turns the empty's +Y (glTF -Z) to the scene facing


def contract_nodes(fr: Frame, doors: list) -> dict:
    """Spawn_<sceneId>_<spawnId> at each spawn tile's centre on the floor, looking along its facing; Portal_<portalId>
    with {to, toSpawn, kind} at its doorway's foot on the wall face, a stairs', hatch's or drop's at its marker's foot
    (the wall face at its `at` on a border tile, the tile's centre on an inner tile or in the floor: G12 moves it to
    its flight), a portal with no opening (a skipped one: a scratch room) at its tile's centre. The manifest's row
    says which (`placed`: door_foot, marker_foot, tile_centre) and copies the scene portal's noise, oneWay and
    elevationDelta; Area_room_<sceneId> on the floor's centre."""
    out = {"spawns": [], "portals": []}
    room = fr.room
    for s in room.spawns:
        x, y = room.centre(s["x"], s["y"])
        e = bpy.data.objects.new(f"Spawn_{room.id}_{s['id']}", None)
        e.empty_display_type = "SINGLE_ARROW"
        e.location = (x, y, 0.0)
        e.rotation_euler = (0.0, 0.0, math.radians(FACING_RZ.get(s.get("facing", "n"), 0.0)))
        e["wdi_spawn"] = CFG["spawn_labels"].get(s["id"], s["id"].replace("_", " "))
        e["wdi_district"] = CFG["district"]
        e["wdi_facing"] = s.get("facing", "n")
        COL["room"].objects.link(e)
        out["spawns"].append(dict(name=e.name, local=[round(x, 3), round(y, 3), 0.0], facing=s.get("facing", "n"),
                                  label=e["wdi_spawn"], district=e["wdi_district"], tile=[s["x"], s["y"]]))
    by_portal = {d["portal"]["id"]: d for d in doors if d.get("portal")}
    markers = {m["portal"]: m for m in fr.markers if m.get("portal")}
    for pt in room.portals:
        door = by_portal.get(pt["id"])
        if door is not None:
            (x, y), placed, opening = door["foot"][:2], "door_foot", door["id"]
        elif pt["id"] in markers:
            (x, y), placed, opening = markers[pt["id"]]["foot"][:2], "marker_foot", markers[pt["id"]]["id"]
        else:
            (x, y), placed, opening = room.centre(pt["x"], pt["y"]), "tile_centre", None
        e = bpy.data.objects.new(f"Portal_{pt['id']}", None)
        e.empty_display_type = "CIRCLE"
        e.empty_display_size = 1.0
        e.location = (x, y, 0.0)
        e["to"], e["toSpawn"], e["kind"] = pt["to"], pt["toSpawn"], pt["kind"]
        e["wdi_portal_id"] = pt["id"]
        COL["room"].objects.link(e)
        out["portals"].append(dict(name=e.name, id=pt["id"], local=[round(x, 3), round(y, 3), 0.0], to=pt["to"],
                                   toSpawn=pt["toSpawn"], kind=pt["kind"], tile=[pt["x"], pt["y"]],
                                   placed=placed, opening=opening,
                                   **{k: pt[k] for k in ("noise", "oneWay", "elevationDelta") if k in pt}))
    return out


def hierarchy(fr: Frame, ex: dict, coll) -> object:
    """Area_room_<id> on the floor's centre holding every render mesh, light, spawn and portal (world positions
    kept); HM_Collision_room_<id> at the root; everything in collection Room_<id>."""
    room = fr.room
    area = bpy.data.objects.new(f"Area_room_{room.id}", None)
    area.empty_display_type = "PLAIN_AXES"
    area.location = (fr.cx, fr.cy, 0.0)
    COL["room"].objects.link(area)
    area["wdi_indoor"] = True
    area["wdi_exposure"] = round(float(ex["wdi_exposure"]), 5)
    area["wdi_baked"] = True
    area["wdi_k"] = float(ex["k"])
    area["wdi_scene"] = room.id
    area["wdi_name"] = CFG["district"]
    area["wdi_light_mode"] = "COMPAT"
    area["wdi_color0"] = "baked diffuse light (direct + indirect) x wdi_k, linear, FLOAT VEC3; unlit materials"
    bpy.context.view_layer.update()
    inv = area.matrix_world.inverted()
    for o in list(COL["room"].objects):
        if o is area or o is coll or o.parent is not None:
            continue
        o.parent = area
        o.matrix_parent_inverse = inv
    return area


def rename_all(fr: Frame) -> None:
    """Every datablock of the room named for it (`<id>_...`): meshes after their objects, images, materials."""
    for o in COL["room"].objects:
        if o.type == "MESH" and o.data is not None:
            if o.name.startswith("HM_Collision"):
                o.data.name = o.name
            elif not o.data.name.startswith(P):
                o.data.name = nm(o.name) if not o.name.startswith(P) else o.name
            elif o.name.startswith(P) and o.data.name != o.name and o.data.users == 1:
                o.data.name = o.name    # a split-off mesh's ".001": its name was taken when it was made, free now
            if not o.name.startswith((P, "Area_", "Spawn_", "Portal_", "HM_Collision")):
                o.name = nm(o.name)
        elif o.type == "LIGHT" and not o.data.name.startswith(P):
            o.data.name = nm(o.data.name)
    for m in bpy.data.materials:
        if m.users and not m.name.startswith(P):
            m.name = nm(m.name)
    for img in bpy.data.images:
        if img.users and not img.name.startswith(P) and img.name not in ("Render Result", "Viewer Node"):
            img.name = nm(img.name)


def to_unlit(ex: dict) -> None:
    """Every room material's export tree. Emitters and glass at their display colour / wdi_exposure; the sky's colour
    attribute scaled to the village's sky (meshy_looks/final.json at its exposure)."""
    we = ex["wdi_exposure"]
    targets = CFG.get("emit_display", {})
    for name, rm in MATS.items():
        if rm.kind in ("emit", "glass"):
            key = name[len(P):]
            rm.emit = tuple(targets.get(key, rm.emit))
            rm.unlit_tree(k_emit=1.0 / we)
        else:
            rm.unlit_tree()
    look = look_sky()
    village = 2.0 ** float(look["color"]["exposure"])
    for r in OBJS:
        o = r["obj"]
        if o is not None and o.get("wdi_sky_raw"):
            L = read_attr(o)
            write_attr(o, (L * village / we).astype(np.float32))
            del o["wdi_sky_raw"]


def export_glb(path: str) -> int:
    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(path), export_format="GLB", use_active_scene=True, use_renderable=True,
        export_apply=False, export_gpu_instances=True, export_extras=True, export_yup=True,
        export_image_format="WEBP", export_image_quality=80, export_lights=True,
        export_import_convert_lighting_mode="COMPAT", export_animations=False, export_cameras=False,
        export_vertex_color="MATERIAL", export_all_vertex_colors=False,
        export_active_vertex_color_when_no_material=False, export_tangents=False, export_normals=False, **DRACO)
    return os.path.getsize(path)


# ---------------------------------------------------------------- previews and the plan


def setup_view(sc, exposure: float) -> None:
    sc.render.engine = "BLENDER_EEVEE"
    sc.eevee.taa_render_samples = 32
    for attr, val in (("use_raytracing", False), ("use_shadows", False), ("use_fast_gi", False),
                      ("use_overscan", False), ("use_bloom", False)):
        if hasattr(sc.eevee, attr):
            setattr(sc.eevee, attr, val)
    vs = sc.view_settings
    vs.view_transform = "AgX"
    vs.look = "None"
    vs.exposure = math.log2(exposure)
    vs.gamma = 1.0
    sc.display_settings.display_device = "sRGB"
    sc.render.film_transparent = False
    w = bpy.data.worlds.get(nm("View_world")) or bpy.data.worlds.new(nm("View_world"))
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = (0, 0, 0, 1)
    w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.0
    sc.world = w
    sc.render.use_compositing = False
    sc.render.dither_intensity = 0.0


def camera(name: str, eye, target, vfov: float):
    cam = bpy.data.objects.get(name)
    if cam is None:
        cam = bpy.data.objects.new(name, bpy.data.cameras.new(name))
        COL["cams"].objects.link(cam)
    cam.data.type = "PERSP"
    cam.data.sensor_fit = "VERTICAL"
    cam.data.angle_y = math.radians(vfov)
    cam.data.clip_start, cam.data.clip_end = 0.05, 500.0
    cam.location = eye
    cam.rotation_euler = (Vector(target) - Vector(eye)).to_track_quat("-Z", "Y").to_euler()
    return cam


def render_png(sc, path: str, w: int, h: int, exposure: float | None = None) -> float:
    """Render the scene's camera to a PNG. With `exposure` (the area's wdi_exposure) the frame is rendered
    scene-linear (OpenEXR, no view transform) and shown through three r186's AgX at that exposure, the viewer's own
    tone mapping: Blender's AgX view shows the same room 12 to 21 % darker than the viewer does."""
    r = sc.render
    r.resolution_x, r.resolution_y, r.resolution_percentage = w, h, 100
    if hasattr(r.image_settings, "media_type"):
        r.image_settings.media_type = "IMAGE"
    t0 = time.time()
    if exposure is None:
        r.image_settings.file_format = "PNG"
        r.image_settings.color_mode = "RGB"
        r.image_settings.color_depth = "8"
        r.filepath = path
        bpy.ops.render.render(write_still=True)
        return time.time() - t0
    tmp = os.path.splitext(path)[0] + "_linear.exr"
    r.image_settings.file_format = "OPEN_EXR"
    r.image_settings.color_mode = "RGB"
    r.image_settings.color_depth = "32"
    r.filepath = tmp
    bpy.ops.render.render(write_still=True)
    src = bpy.data.images.load(tmp, check_existing=False)
    ww, hh, ch = src.size[0], src.size[1], src.channels
    buf = np.empty(ww * hh * ch, np.float32)
    src.pixels.foreach_get(buf)
    lin = buf.reshape(hh, ww, ch)[..., :3].astype(np.float64)
    disp = agx(np.maximum(lin.reshape(-1, 3), 0.0), exposure).reshape(hh, ww, 3)
    out = bpy.data.images.new(nm("still_tmp"), ww, hh, alpha=False)
    out.colorspace_settings.name = "sRGB"
    rgba = np.ones((hh, ww, 4), np.float32)
    rgba[..., :3] = disp
    out.pixels.foreach_set(rgba.ravel())
    out.filepath_raw = path
    out.file_format = "PNG"
    out.save()
    bpy.data.images.remove(out)
    bpy.data.images.remove(src)
    try:
        os.remove(tmp)
    except OSError:
        pass
    return time.time() - t0


def previews(fr: Frame, out_dir: str, ex: dict, res: int, coll) -> list:
    sc = bpy.context.scene
    setup_view(sc, ex["wdi_exposure"])
    coll.hide_render = True
    made = []
    for name, (eye, target, vfov) in CFG["views"].items():
        cam = camera(nm(f"Cam_{name}"), eye, target, vfov)
        sc.camera = cam
        path = os.path.join(out_dir, f"{fr.room.id}_{name}.png")
        t = render_png(sc, path, res, res * 9 // 16, exposure=ex["wdi_exposure"])
        log(f"rendered {path} in {t:.1f}s")
        made.append(path)
    coll.hide_render = False
    return made


def plan_render(fr: Frame, out_dir: str, ex: dict, coll, boxes: list, nodes: dict, walk: dict) -> str:
    """Top down, the ceiling and cornice hidden: the raw render and plan.json for the plain-Python overlay."""
    sc = bpy.context.scene
    setup_view(sc, ex["wdi_exposure"])
    hide = [r["obj"] for r in OBJS if r["id"] in ("ceiling", "cornice") or r["what"] in ("outside", "sky")
            or r["id"] in ("moon_disc", "lit_window")]
    for o in hide:
        o.hide_render = True
    coll.hide_render = True
    room = fr.room
    W, H = room.w + 1.0, room.h + 1.0
    ppm = 100
    cam = bpy.data.objects.new(nm("Cam_plan"), bpy.data.cameras.new(nm("Cam_plan")))
    COL["cams"].objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = max(W, H)
    cam.data.sensor_fit = "AUTO"
    cam.data.clip_start, cam.data.clip_end = 0.05, 20.0
    cam.location = (0.0, 0.0, fr.H - 0.05)
    cam.rotation_euler = (0.0, 0.0, 0.0)
    sc.camera = cam
    raw = os.path.join(out_dir, f"{room.id}_plan_raw.png")
    render_png(sc, raw, int(W * ppm), int(H * ppm), exposure=ex["wdi_exposure"])
    for o in hide:
        o.hide_render = False
    coll.hide_render = False
    meta = dict(raw=os.path.basename(raw), out=f"{room.id}_plan.png", ppm=ppm, size=[W, H],
                origin=[-W / 2, H / 2], grid=[room.w, room.h], tile=1.0, boxes=[[n_, list(b)] for n_, b in boxes],
                spawns=nodes["spawns"], portals=nodes["portals"],
                walk={k: v for k, v in walk.items() if not k.startswith("_")},
                walkable=[[x, y] for y in range(room.h) for x in range(room.w) if room.walkable(x, y)],
                room=[fr.x0, fr.y0, fr.x1, fr.y1])
    gx, gy, res, shape = walk["_grid"]
    mask = walk["_mask"]
    meta["reach"] = dict(x0=gx, y0=gy, res=res, rows=[
        "".join("1" if v else "0" for v in mask[j]) for j in range(0, shape[0], 5)], step=5)
    with open(os.path.join(out_dir, f"{room.id}_plan.json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh)
    return raw


def plan_step(scene_id: str, out_dir: str) -> str:
    """Plain Python (Pillow): draw the tile grid, the reachable floor, the collision boxes, the spawn and the portal
    over the top-down render."""
    from PIL import Image, ImageDraw, ImageFont

    with open(os.path.join(out_dir, f"{scene_id}_plan.json"), encoding="utf-8") as fh:
        m = json.load(fh)
    im = Image.open(os.path.join(out_dir, m["raw"])).convert("RGB")
    W, H = im.size
    ppm = m["ppm"]
    ox, oy = m["origin"]

    def px(x, y):
        return ((x - ox) * ppm, (oy - y) * ppm)

    ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    r = m["reach"]
    for j, row in enumerate(r["rows"]):
        y = r["y0"] + j * r["step"] * r["res"]
        for i in range(0, len(row), 5):
            if row[i] == "1":
                x = r["x0"] + i * r["res"]
                a, b = px(x, y)
                d.rectangle([a - 2, b - 2, a + 2, b + 2], fill=(46, 196, 182, 70))
    gw, gh = m["grid"]
    for i in range(gw + 1):
        x = -gw / 2 + i
        d.line([px(x, gh / 2), px(x, -gh / 2)], fill=(217, 210, 194, 90), width=1)
    for j in range(gh + 1):
        y = gh / 2 - j
        d.line([px(-gw / 2, y), px(gw / 2, y)], fill=(217, 210, 194, 90), width=1)
    for name, (a0, b0, c0, a1, b1, c1) in m["boxes"]:
        if name in ("floor", "ceiling"):
            continue
        p0, p1 = px(a0, b1), px(a1, b0)
        d.rectangle([p0[0], p0[1], p1[0], p1[1]], outline=(255, 180, 87, 230), width=2)
    for s in m["spawns"]:
        x, y, _z = s["local"]
        a, b = px(x, y)
        d.ellipse([a - 9, b - 9, a + 9, b + 9], fill=(127, 168, 255, 255))
        ang = {"n": 90, "e": 0, "s": -90, "w": 180}[s["facing"]]
        ex_, ey_ = math.cos(math.radians(ang)), math.sin(math.radians(ang))
        d.line([(a, b), (a + ex_ * 40, b - ey_ * 40)], fill=(127, 168, 255, 255), width=4)
    for p in m["portals"]:
        x, y, _z = p["local"]
        a, b = px(x, y)
        d.ellipse([a - ppm, b - ppm, a + ppm, b + ppm], outline=(255, 255, 255, 220), width=2)
        d.ellipse([a - 6, b - 6, a + 6, b + 6], fill=(255, 255, 255, 255))
    im = Image.alpha_composite(im.convert("RGBA"), ov).convert("RGB")
    d2 = ImageDraw.Draw(im)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 18)
    except OSError:
        font = ImageFont.load_default()
    for s in m["spawns"]:
        a, b = px(*s["local"][:2])
        d2.text((a + 14, b - 8), s["name"], fill=(127, 168, 255), font=font)
    for p in m["portals"]:
        a, b = px(*p["local"][:2])
        d2.text((a + 14, b + 6), f"Portal_{p['id']} -> {p['to']}/{p['toSpawn']}", fill=(255, 255, 255), font=font)
    d2.text((10, 8), f"{scene_id}: 1 m tiles, collision boxes (orange), reachable floor at r 0.3 (teal), "
                     "the portal's 1 m trigger (white)", fill=(217, 210, 194), font=font)
    out = os.path.join(out_dir, m["out"])
    im.save(out, optimize=True)
    print("PLAN", out)
    return out


def run_post_step(scene_id: str, out_dir: str) -> None:
    py = os.environ.get("WDI_PYTHON") or shutil.which("python") or shutil.which("python3")
    cmd = f"python tools/blender/meshy_room_build.py --scene {scene_id} --out {out_dir} --step plan"
    if not py:
        print("POST STEP: no Python on PATH; run", cmd, flush=True)
        return
    env = {k: v for k, v in os.environ.items() if k not in ("PYTHONHOME", "PYTHONPATH")}
    try:
        res = subprocess.run([py, os.path.abspath(__file__), "--scene", scene_id, "--out", out_dir, "--step", "plan"],
                             env=env, capture_output=True, text=True, timeout=600)
        sys.stdout.write(res.stdout)
        if res.returncode != 0:
            sys.stdout.write(res.stderr)
            print("POST STEP failed; run", cmd, flush=True)
    except (OSError, subprocess.SubprocessError) as err:
        print(f"POST STEP could not run ({err}); run {cmd}", flush=True)


# ---------------------------------------------------------------- counts and the manifest


def material_rows() -> list:
    rows = []
    for rm in MATS.values():
        try:
            if not rm.mat.users:
                continue
            img = rm.image.name if rm.image else None
            size = list(rm.image.size) if rm.image else None
        except ReferenceError:
            continue
        rows.append(dict(name=rm.mat.name, kind=rm.kind, image=img, imageSize=size,
                         factor=[round(v, 4) for v in rm.factor],
                         albedo=[round(float(v), 4) for v in rm.albedo] if rm.albedo is not None else None,
                         exported=getattr(rm, "exported", None)))
    return rows


def counts() -> dict:
    tris = verts = 0
    per = {}
    for o in COL["room"].objects:
        if o.type != "MESH" or o.name.startswith("HM_Collision"):
            continue
        me = o.data
        me.calc_loop_triangles()
        t, v = len(me.loop_triangles), len(me.vertices)
        tris += t
        verts += v
        per[o.name] = [t, v]
    return dict(triangles=tris, vertices=verts, perObject=per)


def glb_facts(path: str) -> dict:
    import struct
    data = open(path, "rb").read()
    off, G = 12, None
    while off + 8 <= len(data):
        clen, ctype = struct.unpack_from("<I4s", data, off)
        if ctype == b"JSON":
            G = json.loads(data[off + 8:off + 8 + clen])
        off += 8 + clen
    prims = [p for m in G["meshes"] for p in m["primitives"]]
    unlit = sum(1 for m in G.get("materials", []) if "KHR_materials_unlit" in m.get("extensions", {}))
    with_c0 = sum(1 for p in prims if "COLOR_0" in p["attributes"])
    c0_types = sorted({(G["accessors"][p["attributes"]["COLOR_0"]]["componentType"],
                        G["accessors"][p["attributes"]["COLOR_0"]]["type"],
                        G["accessors"][p["attributes"]["COLOR_0"]].get("normalized", False)) for p in prims
                       if "COLOR_0" in p["attributes"]}, key=str)
    draco = sum(1 for p in prims if "KHR_draco_mesh_compression" in p.get("extensions", {}))
    imgs = []
    for img in G.get("images", []):
        bv = G["bufferViews"][img["bufferView"]]
        imgs.append(dict(name=img.get("name"), mime=img.get("mimeType"), bytes=bv["byteLength"]))
    return dict(bytes=len(data), extensionsUsed=G.get("extensionsUsed"), extensionsRequired=G.get("extensionsRequired"),
                materials=len(G.get("materials", [])), unlitMaterials=unlit, primitives=len(prims),
                primitivesWithColor0=with_c0, color0Accessors=[list(t) for t in c0_types], dracoPrimitives=draco,
                nodes=len(G["nodes"]), lights=G.get("extensions", {}).get("KHR_lights_punctual", {}).get("lights"),
                images=imgs, imageBytes=sum(i["bytes"] for i in imgs))


# ================================================================ entry


_RAN: list = []             # blender_main runs once a process: the module's tables (P, CFG, MATS, OBJS, PIECES ...)


def blender_main(a) -> None:
    global P, CFG, TEX_DIR, SPEC
    if _RAN:
        raise SystemExit("meshy_room_build: blender_main runs once a Blender process (its tables are the room's)")
    _RAN.append(1)
    t_start = time.time()
    _load()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    room = mib.Room(a.scene)
    room_file = os.path.abspath(a.room_file) if a.room_file else room_path(room.id)
    row = load_room(room.id, path=room_file)
    CFG = dict(row)
    layout = apply_layout(CFG, a.layout)
    # the derived reading (openings, lights, groups, coverage, the pieces' places from the scene): a separate dict,
    # so nothing derived reaches CFG, whose md5 a saved bake records
    SPEC = rf.derive(CFG, room.d, shown=from_root(room_file))
    if SPEC["pending"] and not a.partial:
        raise SystemExit(f"meshy_room_build: {from_root(room_file)} needs what this builder does not build yet:\n  "
                         + "\n  ".join(SPEC["pending"]) + "\n(--partial builds the rest, for a scratch room)")
    for p_ in SPEC["pending"]:    # --partial: a scratch room's proof build; never a finished room
        NOTES.append(f"--partial: not built: {p_}")
    look_file = os.path.abspath(a.look) if a.look else FP_LOOK
    with open(look_file, encoding="utf-8") as fh:
        look_whole = json.load(fh)
    # the room's look (G9): its `look` deep-merged over the look file before anything reads it; `light` its default
    # setting. With neither the merged look is the file's own (and so is its lookBakeMd5)
    look, room_light, look_room = rf.room_look(look_whole, CFG, shown=from_root(room_file),
                                               shown_look=from_root(look_file))
    # What made the outputs, each input by its own md5: this script (the shared code: no room's data stands in it,
    # so adding a room does not change it), the room's own file, the look file, the kit and the room files' loader.
    # scriptMd5, roomMd5, lookMd5, kitMd5 and loaderMd5 are the files as saved with their line ends made LF (a
    # Windows working tree and git then agree; a saved bake's md5 agrees with either form: rawAgrees);
    # roomBakeMd5 and lookBakeMd5 are taken from the data that reaches the bake (bake_room_md5, bake_look_md5)
    kit_file, loader_file = os.path.join(HERE, "meshy_interior_build.py"), os.path.abspath(rf.__file__)
    files = dict(script=os.path.abspath(__file__), room=room_file, look=look_file, kit=kit_file)
    forms = {k: rf.text_md5_forms(f) for k, f in files.items()}
    src = dict(script=from_root(files["script"]), scriptMd5=forms["script"][0],
               room=from_root(room_file), roomMd5=forms["room"][0],
               roomBakeMd5=bake_room_md5(CFG),
               look=from_root(look_file), lookMd5=forms["look"][0],
               lookBakeMd5=bake_look_md5(look), lookRoomMd5=look_room,
               kit=from_root(kit_file), kitMd5=forms["kit"][0],
               loader=from_root(loader_file), loaderMd5=rf.text_md5(loader_file),
               roomSchema=SPEC["schema"], layout=layout,
               argv=shown_argv(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []),
               blender=bpy.app.version_string)
    log("source", json.dumps(src))
    CFG["look"] = look
    # the light setting: weights on the look's candle, moon and fill (the look's `settings`)
    sets = {k: v for k, v in (look.get("settings") or {}).items() if isinstance(v, dict)}
    light = a.light or room_light or (look.get("settings") or {}).get("default")
    if light and light not in sets:
        raise SystemExit(f"meshy_room_build: no light setting {light!r} in {from_root(look_file)} (it has "
                         f"{sorted(sets)})")
    # the room's bake groups (the loader's: the bedroom's candle, moon, fill; a v2 room's from its lights, at most 5)
    rgroups = list(SPEC.get("groups") or BAKE_GROUPS)
    setting_w = {g: float(((sets.get(light) or {}).get("mix") or {}).get(g, 1.0)) for g in rgroups}
    CFG["light"], CFG["light_weights"] = light, dict(setting_w)
    CFG["candle"] = {**look["lights"]["lamp"], **CFG.get("candle", {})}
    CFG["moon"] = {**look["lights"]["moon"], **CFG.get("moon", {})}
    CFG["fill"] = {**look["lights"]["fill"], **CFG.get("fill", {})}
    CFG.setdefault("emit_display", {k: v for k, v in look["emit_display"].items() if k.startswith("M_")})
    CFG["outside"] = {"gain": look["outside"]["gain"], **CFG.get("outside", {})}
    P = f"{room.id}_"
    out_dir = os.path.abspath(a.out or OUT_DIR)
    os.makedirs(out_dir, exist_ok=True)
    TEX_DIR = os.path.join(out_dir, f"{room.id}_textures")
    sc.name = f"Room_{room.id}"
    vb.W, vb.H = room.w, room.h
    vb._collections(sc)
    coll = bpy.data.collections.new(f"Room_{room.id}")
    sc.collection.children.link(coll)
    COL["room"] = coll
    for key, name in (("rig", nm("bake_rig")), ("cams", nm("cameras"))):
        c = bpy.data.collections.new(name)
        sc.collection.children.link(c)
        COL[key] = c
    vb.CAT.update(mi.catalog())
    vb.HERO_2K.add("kit_chest")
    fr = Frame(room, CFG)
    FRAME[:] = [fr]
    log(f"{room.id}: room {fr.x1 - fr.x0:g} x {fr.y1 - fr.y0:g} x {fr.H:g} m, openings "
        + ", ".join(f"{o['kind']} {o['id']} {o['side']} {o['a']:.2f}..{o['b']:.2f}" for o in fr.openings))
    mt = make_materials(fr)
    build_shell(fr, mt)
    if is_v2():
        # every door and window in the file's order; the moon through the window its moon light names (none: a
        # windowless room, or dark glass only); the village view round the first `snow` window, a sky backdrop on
        # each other wall that has a `sky` window
        doors, wins = build_doors(fr, mt), build_windows(fr, mt)
        FLIGHTS[:] = build_flights(fr, mt)      # the stairs' visible flights (G12): none in most rooms
        HATCHES[:] = build_hatches(fr, mt)      # the floor hatches (G12, third part): none in most rooms
        mws = [w for o in moon_windows(fr) for w in wins if w["id"] == o["id"]]   # the moon-lit windows, as built
        win = mws[0] if mws else None
        # one Sun for the room: from moon.bearing, or moon.azimuth off the moon-lit wall (R-L9)
        moon = moon_dir(CFG["moon"], fr, win["side"]) if win else Vector((0.0, 0.0, 1.0))
        snow = next((w for w in wins if w["outside"] == "snow"), None)
        if snow:
            build_outside(fr, mt, snow, moon)
        for side in dict.fromkeys(w["side"] for w in wins if w["outside"] == "sky"):
            if snow is None or side != snow["side"]:
                build_backdrop(fr, mt, next(w for w in wins if w["outside"] == "sky" and w["side"] == side), moon)
    else:
        door = build_door(fr, mt)
        doors = [door] if door else []
        win = build_window(fr, mt)
        wins = mws = [win] if win else []
        moon = moon_dir(CFG["moon"], fr, win["side"] if win else "N")
        if win:
            build_outside(fr, mt, win, moon)
    anchors = build_furniture(fr, mt)
    # the night lights (G4): each at its anchor, with its group and values; the glows beside them; the pool lights
    LIGHTS[:] = resolve_lights(fr, anchors, anchors.get("flame") if not is_v2() else None, shown=from_root(room_file))
    glows = build_glows(mt, LIGHTS) if is_v2() else []
    flame = pool_points(LIGHTS)
    log(f"lights {[(L['id'], L['group'], L['at']) for L in LIGHTS]}, pools at {flame}, groups {rgroups}, moon toward "
        f"{tuple(round(v, 3) for v in moon)}")
    print(f"PH masters removed: {mib.purge_ph_masters()}", flush=True)
    for c in ("src",):
        for o in list(COL[c].objects):
            bpy.data.objects.remove(o, do_unlink=True)
    for r in OBJS:
        OBJ_KIND[r["obj"].name] = r["what"]
    # the bake
    targets = bake_targets()
    unbaked = sorted(r["obj"].name for r in OBJS if r["obj"] is not None and r["obj"].type == "MESH"
                     and r["what"] not in ("sky", "emit", "glass") and r["obj"] not in targets)
    if unbaked:   # these would export without COLOR_0 and show unlit (full albedo) in the viewer
        log("WARNING meshes left out of the bake:", unbaked)
        NOTES.append(f"meshes left out of the bake (no COLOR_0): {unbaked}")
    # the ids of the meshes that carry no COLOR_0 on purpose (emitters, glass, the sky): the checks' noColor0 (G2b)
    NO_COLOR0[:] = sorted({r["id"] for r in OBJS if r["obj"] is not None and r["obj"].type == "MESH"
                           and r["obj"] not in targets and r["obj"].name not in unbaked})
    added = seam_added = 0
    for o in targets:
        seam_added += split_material_seams(o)
    log(f"material seams split: +{seam_added} vertices")
    for o in targets:
        kind = OBJ_KIND.get(o.name)
        n_ = 0
        if kind in ("piece", "door", "window", "trim", "stairs"):
            n_ = subdivide_long_edges(o, 0.15)
        elif kind == "outside" and ("Houses" in o.name or "Ground" in o.name):
            n_ = subdivide_long_edges(o, 1.5 if "Houses" in o.name else 5.0)
        added += n_
        if n_ > 3000:
            log(f"split {o.name}: +{n_} vertices (now {len(o.data.vertices)})")
    log(f"bake targets {len(targets)}, edges split adding {added} vertices")
    prepare_attrs(targets)
    bake_vertices = sum(len(o.data.vertices) for o in targets)
    rig = bake_rig(fr, mws, LIGHTS, moon)
    if a.rig_print:     # the rig's fingerprint (room_checks/rig_print.py): what the gate cannot see of a bake
        sys.path.insert(0, os.path.join(HERE, "room_checks"))
        import rig_print
        rig_print.write(a.rig_print, rig, sc)
        if a.rig_stop:
            return
    hide = [r["obj"] for r in OBJS if r["what"] in ("sky", "emit")]
    outside_names = {r["obj"].name for r in OBJS if r["what"] == "outside"}
    bake_s = 0.0
    groups = None
    gsecs = {}
    bake_meta = dict(scriptMd5=src["scriptMd5"], roomMd5=src["roomMd5"], roomBakeMd5=src["roomBakeMd5"],
                     lookMd5=src["lookMd5"], lookBakeMd5=src["lookBakeMd5"], kitMd5=src["kitMd5"], layout=layout)
    if a.raw:
        groups = load_raw(a.raw, targets)
        log(f"the raw bake from {a.raw} (no bake)", json.dumps(RAW_META))
        # rawAgrees: does the saved bake come from this run's code and data? Each answer compares what the bake
        # recorded when it was saved (save_raw's meta) with this run's `source`:
        #   script     this script's md5. No room's data stands in the script, so adding or editing a room leaves it
        #              alone; it changes with any shared code, the post step included, which is tuned on a saved bake
        #              (the bedroom's READY build of 2026-11-16 says false here for that reason);
        #   kit        meshy_interior_build.py's md5;
        #   layout     the arrangement's name;
        #   lookBake   the look file's bake-relevant part (bake_look_md5);
        #   roomBake   the room file's bake-relevant part with the layout applied (bake_room_md5);
        #   lookWhole, roomWhole   the two files as saved, for the record: a --raw run tunes the rest of both (the
        #              light settings, the ink floor, the views) on a saved bake, so these may differ.
        # A bake saved before the rooms had files records no room md5 (the room's row was part of the script then,
        # and `script` covered it): roomBake and roomWhole are null for it, not known, and the note below is written.
        # None of the answers proves the geometry: load_raw has compared every mesh's vertices with the bake's own
        # by then, and room_checks/regress.sh compares the whole GLB with its golden md5.
        # A file's md5 agrees when the saved one is its LF or its CRLF form (a bake saved on a Windows working tree
        # recorded the CRLF bytes)
        def file_agrees(key: str, form: str):
            return RAW_META.get(key) in forms[form]

        def room_agrees(key: str):
            if RAW_META.get(key) is None:
                return None
            return file_agrees(key, "room") if key == "roomMd5" else RAW_META.get(key) == src[key]

        same = dict(script=file_agrees("scriptMd5", "script"), kit=file_agrees("kitMd5", "kit"),
                    layout=RAW_META.get("layout") == layout, lookBake=RAW_META.get("lookBakeMd5") == src["lookBakeMd5"],
                    lookWhole=file_agrees("lookMd5", "look"), roomBake=room_agrees("roomBakeMd5"),
                    roomWhole=room_agrees("roomMd5"))
        src["rawAgrees"] = same
        log("the raw bake agrees with this build on", json.dumps(same))
        if not all(v for k_, v in same.items() if k_ not in ("lookWhole", "roomWhole")):
            NOTES.append(f"the raw bake {RAW_META.get('file')} was made by other code, other room data or another "
                         f"layout than this run's: {json.dumps(same)}")
    elif a.no_bake:
        quick_light(targets, LIGHTS)
    elif a.bake_groups:
        t0 = time.time()
        groups, gsecs = run_bake_groups(targets, a.samples, hide, rig, rgroups)
        bake_s = time.time() - t0
        log(f"baked {len(targets)} meshes in {len(rgroups)} light groups at {a.samples} samples in {bake_s:.0f}s")
    else:
        # one bake of all the lights: the light setting scales the lamps themselves (and the night sky with the moon)
        for o in rig:
            if o.type == "LIGHT":
                o.data.energy *= setting_w.get(rig_group(o), 1.0)
        bg_ = sc.world.node_tree.nodes.get("Background") if sc.world and sc.world.use_nodes else None
        if bg_ is not None:
            bg_.inputs["Strength"].default_value *= setting_w.get("moon", 1.0)
        bake_s = run_bake(targets, a.samples, hide)
        groups = {o.name: {"all": read_attr(o)} for o in targets}
        bake_meta["light"] = light or ""
        log(f"baked {len(targets)} meshes at {a.samples} samples in {bake_s:.0f}s")
    raw = ao = None
    aoc = CFG["look"].get("ao", {})
    weights = {}
    if groups is not None:
        if aoc.get("strength", 0.0) > 0 and any("ao" not in d for d in groups.values()):
            got = run_bake_ao(targets, hide, float(aoc.get("distance_m", 0.5)), int(aoc.get("samples", 64)))
            for n_, v in got.items():
                groups[n_]["ao"] = v
        if a.save_raw and not a.raw:
            save_raw(a.save_raw, targets, groups, samples=a.samples, seconds=bake_s, meta=bake_meta)
        grouped = all(g in next(iter(groups.values())) for g in rgroups)
        # a group bake is mixed here: the light setting's weights, times --mix's
        weights = dict(setting_w) if grouped else {}
        for kv in (a.mix.split(",") if a.mix else ()):
            g, v = kv.split("=")
            weights[g] = weights.get(g, 1.0) * float(v)
        if not grouped and RAW_META.get("light") not in (None, "", light) and a.raw:
            NOTES.append(f"the raw bake is one bake of all the lights at the setting {RAW_META.get('light')!r}; "
                         f"--light {light} cannot change it")
        # a colour over a group's own (the setting's `tint`, then --tint's, e.g. fill=#F0EEE8, over it)
        tint_hex = {g: str(h) for g, h in ((sets.get(light) or {}).get("tint") or {}).items()}
        tint_hex.update(kv.split("=") for kv in (a.tint.split(",") if a.tint else ()))
        tints = {}
        group_col = {"candle": CFG["candle"]["color"], "moon": CFG["moon"]["color"], "fill": CFG["fill"]["color"]}
        for L in LIGHTS:        # a v2 room's own group: its first light's colour
            group_col.setdefault(L["group"], L.get("color") or CFG["candle"]["color"])
        for g, hexc in tint_hex.items():
            if g not in group_col:
                raise SystemExit(f"meshy_room_build: a tint names the group {g!r}; the room's groups are {rgroups}")
            base = group_col[g]
            tints[g] = tuple(n_ / max(b_, 1e-6) for n_, b_ in zip(hex_lin(hexc), hex_lin(base)))
        # each group cleaned once (both steps are linear, so a mix of cleaned groups is the cleaned mix): the walls'
        # rows hidden behind the trims take their neighbours' light, then the bake's noise is filtered (the folded
        # linen more: its folds are a few millimetres across, and the viewer's antialiasing read the light past
        # their edges)
        den, hidden_n = {}, 0
        for o in targets:
            is_wall = re.search(r"_Wall_[NSEW]$", o.name) is not None
            co_ = None
            if is_wall:
                co_ = np.empty(len(o.data.vertices) * 3, np.float32)
                o.data.vertices.foreach_get("co", co_)
                co_ = co_.reshape(-1, 3)
            it = 6 if o.name.endswith("_linen") else 2
            den[o.name] = {}
            for g, L in groups[o.name].items():
                L = np.array(L, np.float64)
                if g == "ao":
                    L = L.reshape(-1, 1)
                if is_wall:
                    hidden_n += wall_hidden_rows(o.name, co_, L)
                if g == "ao":
                    L = denoise(o, np.repeat(L, 3, axis=1), iters=it)[:, 0]
                else:
                    L = denoise(o, L, iters=it)
                den[o.name][g] = L
        log(f"walls: {hidden_n} hidden vertex values (behind the trims) taken from their neighbours")
        if aoc.get("strength", 0.0) > 0:
            ao = {o.name: den[o.name]["ao"] for o in targets}
        if a.sweep:
            for spec in a.sweep.split(";"):
                spec = spec.strip()
                if not spec:
                    continue
                w_ = {g: 1.0 for g in rgroups}
                w_.update({k_: float(v_) for k_, v_ in (kv.split("=") for kv in spec.split(","))})
                ex_s = post_bake(targets, flame, outside_names, False, raw=mix_groups(den, w_, tints), ao=ao)
                row = dict(mix=spec, E=round(ex_s["E"], 4), wdi_exposure=round(ex_s["wdi_exposure"], 4),
                           k=round(ex_s["k"], 4), below_ink_share=ex_s["below_ink_share"],
                           hot_p99_display=round(ex_s["hot_p99_display"], 3),
                           **room_light_numbers(fr, targets, ex_s, flame))
                print("SWEEP " + json.dumps(row), flush=True)
            log("sweep done: nothing written")
            return
        raw = mix_groups(den, weights, tints)
    elif a.sweep:
        raise SystemExit("--sweep needs a group bake: --bake-groups or --raw")
    ex = post_bake(targets, flame, outside_names, a.no_bake, raw=raw, ao=ao)
    ex["bakeSeconds"] = round(bake_s, 1)
    ex["samples"] = 0 if (a.no_bake or a.raw) else a.samples
    if a.raw:       # the light is a saved bake's: its own samples and seconds
        ex.update(samples=RAW_META.get("samples") or 0, bakeSeconds=round(RAW_META.get("bakeSeconds") or 0.0, 1),
                  raw=RAW_META.get("file"))
        src["raw"] = dict(RAW_META)
    ex["light"] = light
    ex["weights"] = {g: round(float(weights.get(g, setting_w.get(g, 1.0))), 4) for g in rgroups}
    ex["lightNumbers"] = room_light_numbers(fr, targets, ex, flame)
    if a.mix:
        ex["mix"] = a.mix
    if groups is not None and tint_hex:
        ex["tint"] = dict(tint_hex)
    log("exposure", json.dumps({k: (round(v, 5) if isinstance(v, float) else v) for k, v in ex.items()}))
    for o in rig:
        if o.type == "LIGHT":
            bpy.data.lights.remove(o.data)
        else:
            me = o.data
            bpy.data.objects.remove(o, do_unlink=True)
            bpy.data.meshes.remove(me)
    # the exported lights at the light setting's (and --mix's) weights, as the bake has them (an argument: coupling 7)
    lights = export_lights(fr, wins, LIGHTS, moon, ex["k"], ex["weights"])
    to_unlit(ex)
    coll_ob, boxes = collision(fr, doors)
    nodes = contract_nodes(fr, doors)
    walk = walk_check(fr, boxes, [s_["local"][:2] for s_ in nodes["spawns"]] or [(fr.cx, fr.cy)],
                      [p_["local"][:2] for p_ in nodes["portals"]])
    log("walk", json.dumps({k: v for k, v in walk.items() if not k.startswith("_")}))
    checks = piece_checks(fr)
    spots = spot_rows(fr, walk)
    log("spots", json.dumps(spots))
    area = hierarchy(fr, ex, coll_ob)
    coll_ob.parent = None
    for c in ("world", "models", "forest", "lights", "src"):
        cobj = COL.get(c)
        if cobj is not None:
            for o in list(cobj.objects):
                bpy.data.objects.remove(o, do_unlink=True)
            bpy.data.collections.remove(cobj)
    for m in list(bpy.data.materials):
        if m.users == 0:
            bpy.data.materials.remove(m)
    bpy.data.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
    rename_all(fr)
    for img in bpy.data.images:
        if img.users and img.source == "FILE" and not img.packed_file:
            img.pack()
    cnt = counts()
    blend = os.path.join(out_dir, f"{room.id}.blend")
    glb = os.path.join(out_dir, f"{room.id}.glb")
    manifest = dict(
        version=1, scene=room.id, name=CFG["district"], built=time.strftime("%Y-%m-%d %H:%M:%S"),
        script="tools/blender/meshy_room_build.py",
        # what made these outputs: the script, the room's file, the look file and the kit by md5, the layout, the
        # arguments, and (with --raw) the saved bake with the md5s of the code and the data that baked it
        source=src, layout=layout,
        layouts=dict(default=row.get("layout"), others=sorted(row.get("layouts") or {})),
        light=dict(setting=ex.get("light"), weights=ex.get("weights"), numbers=ex.get("lightNumbers"),
                   settings=sets, note="numbers: meshy_room_build.light_numbers (display luminance 0..255)",
                   exposureFrom=SPEC.get("exposureFrom") or [], hosts=SPEC.get("hosts") or []),
        spots=spots, pillows=list(PILLOW_STATS),
        area=dict(name=area.name, origin=[round(v, 3) for v in area.location], extras={k: area[k] for k in area.keys()
                                                                                     if k.startswith("wdi_")}),
        bounds=dict(room=[fr.x0, fr.y0, 0.0, fr.x1, fr.y1, fr.H], wallThickness=fr.T),
        # the openings as built (the loader's entries; a and b along the wall's world axis) and the scene's flags the
        # walk viewer plays (a dark room, a silent one, the noise on entering: room_file_v2, section 12)
        openings=[dict(id=e["id"], kind=e["kind"], side=e["side"], tile=e["tile"], at=e.get("at"),
                       a=None if e.get("at") is None else round(e["at"] - e["width"] / 2, 4),
                       b=None if e.get("at") is None else round(e["at"] + e["width"] / 2, 4),
                       z0=0.0 if e["kind"] == "door" else e.get("sill"),
                       z1=e.get("height") if e["kind"] == "door" else e.get("head"), style=e.get("style"),
                       portal=e.get("portal"), prop=e.get("prop"), outside=e.get("outside"),
                       foot=[round(float(v), 4) for v in e["foot"]] if e.get("foot") else None,
                       **({"flight": dict(e["flight"], built=next((f for f in FLIGHTS if f["id"] == e["id"]), None))}
                          if e.get("flight") else {}),
                       **({"hatch": dict(e["hatch"], built=next((h for h in HATCHES if h["id"] == e["id"]), None))}
                          if e.get("hatch") else {}))
                  for e in SPEC["openings"]],
        sceneFlags={k: room.d[k] for k in ("dark", "silent", "entryNoise") if k in room.d},
        spawns=nodes["spawns"], portals=nodes["portals"],
        lights=[dict(name=o.name, id=o.get("wdi_light_id"), kind=o.get("wdi_light"), type=o.data.type,
                     location=[round(v, 3) for v in o.location], color=list(o.data.color),
                     energyW=round(o.data.energy, 4),
                     gltfIntensity=round(o.data.energy / (4 * math.pi), 5), **light_row(o.get("wdi_light_id")))
                for o in lights],
        # the night lights the room leaves out and why (a day and dusk light), the bake groups (their lights, the
        # vertices each bakes, its seconds when this run baked it), the glows (G4)
        lightsDropped=SPEC.get("lightsDropped") or [],
        bakeGroups=[dict(group=g, lights=[L["id"] for L in LIGHTS if L["group"] == g] + (
            ["world"] if g == "moon" else ["fill panel"] if g == "fill" else []), vertices=bake_vertices,
            seconds=gsecs.get(g)) for g in rgroups],
        glows=glows,
        exposure=ex, counts={k: v for k, v in cnt.items() if k != "perObject"}, perObject=cnt["perObject"],
        materials=material_rows(),
        pieces=[dict(id=pid, slug=p["spec"].get("slug") or p["spec"].get("name") or p["spec"].get("model"),
                     size=[round(p["box"][3] - p["box"][0], 3), round(p["box"][4] - p["box"][1], 3),
                           round(p["box"][5] - p["box"][2], 3)], box=[round(v, 3) for v in p["box"]],
                     centre=[round((p["box"][0] + p["box"][3]) / 2, 3), round((p["box"][1] + p["box"][4]) / 2, 3)],
                     face=p["piece"].get("face"), place=list(p["piece"].get("place") or ()), spec={k: v for k, v in p["spec"].items()
                                                                                       if k not in ("dress",)},
                     **from_tile(fr, pid), **from_ref(pid),
                     **({"rise": p["piece"]["rise"]} if p["piece"].get("rise") else {}),
                     **({"decor": True} if p["piece"].get("decor") else {}),
                     **({"covers": list(p["piece"]["covers"])} if p["piece"].get("covers") else {}),
                     **({"moved": p["piece"]["moved"]} if p["piece"].get("moved") else {}),
                     **({"made": MADE[pid]} if pid in MADE else {}))
                for pid, p in PIECES.items()],
        greyBoxes=[dict(id=pid, label=p["spec"].get("label"), size=[round(float(v), 3) for v in p["spec"]["size"]],
                        box=[round(v, 3) for v in p["box"]]) for pid, p in PIECES.items()
                   if p["spec"].get("model") == "box"],
        coverage=SPEC.get("coverage"), skip=SPEC.get("skip"),
        noColor0=list(NO_COLOR0),
        collision=dict(name=coll_ob.name, boxes=len(boxes), triangles=len(boxes) * 12, boxesSha1=boxes_sha1(boxes)),
        walk={k: v for k, v in walk.items() if not k.startswith("_")}, checks=checks, notes=NOTES,
        # the Poly Haven models and textures this room used (its credits: coupling 24 of the implementation plan)
        polyHaven=dict(models=sorted({p["spec"].get("slug") for p in PIECES.values() if p["spec"].get("slug")} |
                                     {d["slug"] for p in PIECES.values() for d in p["spec"].get("dress", ()) if d.get("slug")} |
                                     ({ph[0] for ph in PHOTOS} if any(p["spec"].get("model") == "photos"
                                                                      for p in PIECES.values()) else set())),
                       textures=sorted({mib.mr.role(r).slug for r in texture_roles(
                           {m.name[len(P):] for m in bpy.data.materials if m.users and m.name.startswith(P)},
                           CFG["floor"]["role"], any(p["spec"].get("model") == "rug" for p in PIECES.values()))})),
        meshy=[p["spec"]["name"] for p in PIECES.values() if p["spec"].get("model") == "meshy"] +
        sorted({h[0] for h in CFG["outside"].get("meshy", {}).get("houses", ())} |
               ({"pine_tall", "pine_short"} if CFG["outside"].get("meshy") else set())),
    )
    # the saved file holds one collection, Room_<id>: the emptied bake rig's goes, the stills' cameras come back after
    if COL.get("rig") is not None:
        bpy.data.collections.remove(COL.pop("rig"))
    sc.collection.children.unlink(COL["cams"])
    bpy.ops.wm.save_as_mainfile(filepath=blend, compress=False)
    sc.collection.children.link(COL["cams"])
    log("saved", blend, os.path.getsize(blend))
    if a.glb:
        size = export_glb(glb)
        manifest["glb"] = dict(path=from_root(glb), **glb_facts(glb))
        log("exported", glb, size)
    if a.preview:
        manifest["previews"] = [os.path.basename(p) for p in previews(fr, out_dir, ex, a.preview_res, coll_ob)]
        plan_render(fr, out_dir, ex, coll_ob, boxes, nodes, walk)
        manifest["plan"] = f"{room.id}_plan.png"
    manifest["needsOwner"] = rf.needs_owner(SPEC, manifest["pieces"], spots)
    if CFG.get("export") is not None:      # reserved for the exporter: copied, read by no builder
        manifest["export"] = CFG["export"]
    manifest["seconds"] = round(time.time() - t_start, 1)
    with open(os.path.join(out_dir, f"{room.id}.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=1, default=lambda o: list(o) if hasattr(o, "__iter__") else str(o))
        fh.write("\n")
    log("manifest", os.path.join(out_dir, f"{room.id}.json"))
    if a.preview:
        run_post_step(room.id, out_dir)


def parse(argv: list[str]):
    p = argparse.ArgumentParser(prog="meshy_room_build.py")
    p.add_argument("--scene", required=True)
    p.add_argument("--out", help=f"output folder (default {os.path.relpath(OUT_DIR, ROOT)})")
    p.add_argument("--samples", type=int, default=1024, help="Cycles samples for the vertex bake")
    p.add_argument("--no-bake", action="store_true", help="an unshadowed stand-in light instead of the bake (smoke runs)")
    p.add_argument("--bake-groups", action="store_true",
                   help="bake the candle, the moon (with the sky) and the fill one at a time (tuning the balance)")
    p.add_argument("--save-raw", help="save the raw bake (each group's light per vertex) to this .npz")
    p.add_argument("--raw", help="use a saved raw bake (.npz from --save-raw on the same build) instead of baking")
    p.add_argument("--mix", help="weights for a group bake, e.g. fill=2,candle=1 (relative to the look's powers)")
    p.add_argument("--tint", help="colours for a group bake's groups, e.g. fill=#F0EEE8 (over the look's own colour)")
    p.add_argument("--layout", help="the room's arrangement (its file's `layouts`; default: the file's own)")
    p.add_argument("--light", help="one of the look file's light settings (default: the look's own)")
    p.add_argument("--sweep", help="print the light numbers of these mixes of a group bake and write nothing: "
                                   "'fill=0.5,moon=1.2;fill=0.7' (weights on the look's own powers)")
    p.add_argument("--glb", action="store_true", help="export <id>.glb (the room alone at the origin)")
    p.add_argument("--preview", action="store_true", help="render the views and the plan")
    p.add_argument("--preview-res", type=int, default=1920, help="preview width (height 9/16 of it)")
    p.add_argument("--room-file", help="build from this room file instead of meshy_rooms/<id>.json (its `room` is "
                                       "still the scene's id): a scratch room, no repo file edited")
    p.add_argument("--look", help="build with this look file instead of meshy_looks/interior_fp.json (a scratch look)")
    p.add_argument("--rig-print", help="write the bake rig's fingerprint to this JSON file (room_checks/rig_print.py)")
    p.add_argument("--rig-stop", action="store_true", help="with --rig-print: stop once the fingerprint is written")
    p.add_argument("--partial", action="store_true",
                   help="build what this builder has of a file that needs more (its `pending`, written to the notes): "
                        "a scratch room's proof build, never a finished room")
    p.add_argument("--step", help="plain Python: plan (the overlay on the plan render)")
    return p.parse_args(argv)


if __name__ == "__main__":
    if bpy is not None:
        blender_main(parse(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []))
    else:
        _a = parse(sys.argv[1:])
        if _a.step == "plan":
            plan_step(_a.scene, os.path.abspath(_a.out or OUT_DIR))
