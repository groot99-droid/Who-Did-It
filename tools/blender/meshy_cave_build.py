"""meshy_cave_build.py: the Blender side of one cave section (the Undermere, the walk-only scene `undermere`).

It turns the plain-Python cave core's output (meshy_cave_core.py: the shell, its chunks, cube-projected UVs, tints,
collision, zones and the flood's report) into one walk area file, `under_<key>.glb`, by the contract
docs/walk-areas.md (version 1.1: kind cave, scene undermere, wdi_baked and wdi_indoor, one look for every cave):

- the shell's chunks as meshes, one material per geology kit and surface (wall or floor) from the locked scans in
  .cache/materials (no download), the scans' darkest tail lifted to their 0.5th percentile and their purple texels
  greened, so the ink floor holds for every texel;
- the kerbs, rails and decks of the section's guards and bridges, and for a gate section its mouth piece: the
  grille with its lamp, the outcrop face round the mouth and a vista beyond it (snow, a night backdrop), with a
  collision plug at the grille;
- `Trav_<id>` empties for every traversal zone (extras wdi_traverse and size, local +X along the passage, +Y up and
  +Z out of a climb face, as the viewer's src/traverse.ts reads them), the spawns (`Spawn_undermere_<id>`, wdi_mode
  where a spawn arrives crawling, sidling or climbing), the gate's `Portal_um.<gate>_out` and the seam rows
  (`Portal_seam_<seam>_<side>_1`, `Spawn_undermere_seam_<seam>_<side>_1`) for every seam whose neighbour is built;
- the bake (meshy_room_build.py's run_bake, run_bake_ao, save_raw, load_raw, denoise and solve_display, imported):
  light groups lamp, sky and fill and an AO, the ink floor, the lilac and teal guards, the network exposure;
- the GLB with the contract's settings (meshy_room_build.export_glb: Draco, unlit, COLOR_0, no normals), the
  collision node `HM_Collision_under_<key>` (the core's collision plus its proxies and the gate's plug), a manifest
  and, with --stills, eye-height stills and a top plan.

Run through the lock (it cds to the repo root, so give absolute paths):

    bash tools/blender/bl.sh -b --factory-startup --python tools/blender/meshy_cave_build.py -- \
        --section tools/blender/meshy_caves/undermere/swallow.json --out tools/blender/build/caves --no-bake --glb

`--raw F` rebuilds from a saved bake (its geometry must match), `--samples N` sets the bake's samples,
`--core F.npz` uses a saved core result instead of running the core, `--built a,b` names the neighbours whose
files exist (their seams get portal rows; others stay closed walls), `--E` sets the scene exposure the light is
graded at (else the look's `E`, else the section's own lamp pool). WDI_CYCLES_DEVICE=OPTIX (or CUDA) bakes on a GPU.
The pure-Python parts (the contract's nodes, the fill lights, the face split, the look checks) run without Blender:
tests/test_cave_build.py.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)

import numpy as np  # noqa: E402

try:
    import bpy  # noqa: F401
    from mathutils import Matrix, Vector
except ImportError:  # plain Python: the tests
    bpy = None

import meshy_cave_core as core  # noqa: E402
import meshy_cave_lightmap as lmap  # noqa: E402

LOOK_PATH = os.path.join(HERE, "meshy_looks", "cave_fp.json")
CACHE = os.path.join(HERE, ".cache", "materials")
BANNED = ("rope", "torch", "gallows", "crepe", "noose", "sconce", "crape", "georgette")
DISTRICT = "The Undermere"
SCENE = "undermere"
EYE, CRAWL_EYE = 1.6, 0.55
ALONG_STEP, ALONG_MAX = 20.0, 6   # the stills along the walking passages: metres apart, how many at most
PORTAL_CLEAR, SEAM_ARRIVAL_CLEAR = 1.0, 1.2
GRILLE_PLUG = 0.1  # metres: the collision plug's thickness behind a gate's grille
GRILLE_H = {"arch": 3.0}  # metres: a grille's bar height by gate type (else 2.1)
ATTR = "wdi_light"
NORMAL_BITS = 8   # Draco's quantization of the normals the lantern shades by
OCCL_BITS = 6     # ... and of the `_OCCL` attribute (64 levels: smooth, and cheap in the Draco stream)
TINT_ATTR = "wdi_tint"
INK = (0x12, 0x14, 0x1C)
# the rails', the portal frames' and the trestle's timber albedo. Route 2's #6B5440 read lilac beside the orange rock
# (its red barely over its green, grey-violet against a warm wall); this is darker and warmer, red over green over blue
TIMBER = "#5A3E27"
WATER = "#1E2933"     # standing and running water, unlit like the rock: a dark blue-grey, blue over green over red
WATER_MAX = 0.22      # the water's display luminance is eased under this (route 3's first stills: a lit stream read
                      # as a pale painted strip at 0.45, the Bottom's lake as a white disc)
WATER_STEP = 0.25     # metres between a water surface's grid lines


def log(*a) -> None:
    print("[cave]", *a, flush=True)


# ================================================================ plain Python (tests/test_cave_build.py)


def load_look(path: str = LOOK_PATH) -> dict:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def srgb_to_lin(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def hex_lin(h: str) -> np.ndarray:
    h = h.lstrip("#")
    return srgb_to_lin(np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]))


def area_id(sec_d: dict, net: dict) -> str:
    return f"{net.get('area_prefix', 'under_')}{sec_d['key']}"


def zone_basis(z: dict) -> list:
    """The Blender rotation (3 x 3, columns) of a Trav_ empty, so the glTF node (Y up) has local +X along the zone's
    axis_x, +Y up and +Z along axis_z: glTF's Z is Blender's -Y, so the Blender columns are axis_x, -axis_z, up."""
    X = np.array(z["axis_x"], dtype=np.float64)
    X[2] = 0.0
    X /= max(float(np.linalg.norm(X)), 1e-12)   # the report rounds the axes to 1e-6: made orthonormal again
    up = np.array([0.0, 0.0, 1.0])
    Z = np.cross(X, up)                         # axis_z = axis_x x up, as the core writes it
    cols = [X, -Z, up]
    return [[float(cols[c][r]) for c in range(3)] for r in range(3)]


def plan_dist(a, b) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def walk_region(sec_d: dict, points: list) -> list:
    """[x0, y0, x1, y1] round the section's region boxes and every node given (spawns, portals)."""
    bx = np.array(sec_d["region"]["boxes"], dtype=np.float64)
    x0, y0, x1, y1 = float(bx[:, 0].min()), float(bx[:, 1].min()), float(bx[:, 3].max()), float(bx[:, 4].max())
    for p in points:
        x0, y0, x1, y1 = min(x0, p[0]), min(y0, p[1]), max(x1, p[0]), max(y1, p[1])
    return [round(x0, 4), round(y0, 4), round(x1, 4), round(y1, 4)]


def seam_width(sec, sm: dict) -> float:
    """The passage's width where the seam wall closes it: the air across the plane at 0.5 m over the floor on the
    plane (or at half the window's height when that is lower), from the core's field. Everything it reads is the
    seam's own (the plane, the window, the portal's place along the plane), so both files of a seam measure the
    same width, also on a ramp, where their portals stand at different heights."""
    ax = 0 if sm["plane"]["axis"] == "x" else 1
    at = float(sm["plane"]["at"])
    u0, z0, u1, z1 = (float(v) for v in sm["window"])
    pu_ = float(sm["portal"][1 - ax])
    q = (at, pu_) if ax == 0 else (pu_, at)
    fl, _ = sec.column(q[0], q[1], z0 + 0.3, zlo=z0 - 1.0, zhi=z1 + 1.0)
    pz = round(fl, 2) if fl is not None else float(sm["portal"][2])
    zz = min(pz + 0.5, 0.5 * (z0 + z1))
    us = np.arange(u0, u1 + 1e-9, 0.01)
    P = np.zeros((len(us), 3))
    P[:, ax], P[:, 1 - ax], P[:, 2] = at, us, zz
    air = sec.field_points(P) > 0
    pu = float(sm["portal"][1 - ax])
    i = int(np.argmin(np.abs(us - pu)))
    if not air[i]:
        return round(float(u1 - u0), 2)
    a = i
    while a > 0 and air[a - 1]:
        a -= 1
    b = i
    while b < len(us) - 1 and air[b + 1]:
        b += 1
    return round(float(us[b] - us[a]), 2)


SEAM_KINDS = ("passage", "arch", "mine_door", "bend", "squeeze", "choke", "curtain", "sump_ledge")


def contract_nodes(sec_d: dict, net: dict, zones: list, built: set, look: dict, widths: dict | None = None) -> dict:
    """The contract's empties and the Area's extras: {area, extras, spawns, portals, zones, seams, closed_seams,
    problems}. Positions are Blender metres (x east, y north, z up); yaw_deg is the viewer's (0 north, + left)."""
    aid = area_id(sec_d, net)
    probs = []
    spawns, portals = [], []
    for s in sec_d.get("spawns", []):
        ex = {"wdi_spawn": s.get("notes") or s["id"].replace("_", " "), "wdi_district": DISTRICT,
              "wdi_facing_deg": float(s.get("yaw_deg", 0.0))}
        if s.get("mode", "walk") != "walk":
            ex["wdi_mode"] = s["mode"]
        if s["id"].startswith(f"{SCENE}_mouth_"):
            ex["wdi_spawn"] = "Mouth of " + (sec_d.get("name") or sec_d["key"]).split(",")[0]
        spawns.append({"name": f"Spawn_{s['id']}", "id": s["id"], "at": [float(v) for v in s["at"]],
                       "yaw_deg": float(s.get("yaw_deg", 0.0)), "extras": ex})
    for p in sec_d.get("portals") or []:
        ex = {"to": p["to"], "toSpawn": p["to_spawn"], "kind": p.get("kind", "door"), "wdi_portal_id": p["id"]}
        portals.append({"name": f"Portal_{p['id']}", "id": p["id"], "at": [float(v) for v in p["at"]], "extras": ex})
    seams, closed = [], []
    for sm in sec_d.get("seams", []):
        side = sm.get("side", "a")
        other = "b" if side == "a" else "a"
        if sm["neighbour"] not in built:
            closed.append({"id": sm["id"], "neighbour": sm["neighbour"], "why": "neighbour not built: a closed wall"})
            continue
        kind = sm.get("kind", "passage")
        if kind not in SEAM_KINDS:
            probs.append(f"seam {sm['id']}: kind {kind!r} is not a cave device")
        w = (widths or {}).get(sm["id"], round(float(sm["window"][2]) - float(sm["window"][0]), 2))
        pid = f"seam_{sm['id']}_{side}_1"
        portals.append({"name": f"Portal_{pid}", "id": pid, "at": [float(v) for v in sm["portal"]],
                        "extras": {"to": SCENE, "toSpawn": f"seam_{sm['id']}_{other}_1", "kind": "gate",
                                   "wdi_portal_id": pid, "wdi_seam": sm["id"], "wdi_seam_kind": kind,
                                   "wdi_width_m": w}})
        arr = sm["arrival"]
        sid = f"{SCENE}_seam_{sm['id']}_{side}_1"
        ex = {"wdi_spawn": f"{sm.get('notes', sm['id']).split(':')[0]}, arrival 1", "wdi_district": DISTRICT,
              "wdi_facing_deg": float(arr.get("yaw_deg", 0.0)), "wdi_picker": False}
        if arr.get("mode", "walk") != "walk":
            ex["wdi_mode"] = arr["mode"]
        spawns.append({"name": f"Spawn_{sid}", "id": sid, "at": [float(v) for v in arr["at"]],
                       "yaw_deg": float(arr.get("yaw_deg", 0.0)), "extras": ex})
        seams.append({"id": sm["id"], "side": side, "portal": pid, "arrival": sid, "neighbour": sm["neighbour"]})
    zn = []
    for z in zones:
        zn.append({"name": z["node"], "at": [float(v) for v in z["centre"]], "basis": zone_basis(z),
                   "extras": {"wdi_traverse": z["wdi_traverse"], "size": [float(v) for v in z["size"]]}})
    # the contract's distances: every spawn over 1 m from every portal; a seam arrival 1.2 m
    for s in spawns:
        seam = "_seam_" in s["id"]
        lim = SEAM_ARRIVAL_CLEAR if seam else PORTAL_CLEAR
        for p in portals:
            d = plan_dist(s["at"], p["at"])
            near = d < lim - 1e-6 if seam else d <= lim   # a seam arrival at least 1.2 m; a spawn over 1.0 m
            if abs(s["at"][2] - p["at"][2]) <= 2.0 and near:
                probs.append(f"{s['name']} is {d:.2f} m from {p['name']} (needs {'at least' if seam else 'over'} {lim})")
    names = [aid, f"HM_Collision_{aid}"] + [n["name"] for n in spawns + portals + zn]
    probs += name_problems(names)
    pts = [s["at"] for s in spawns] + [p["at"] for p in portals]
    extras = {"wdi_area": aid, "wdi_kind": "cave", "wdi_scene": SCENE,
              "wdi_name": f"{net.get('name', 'The Undermere')}, {sec_d.get('name', sec_d['key'])}",
              "wdi_walk_region": walk_region(sec_d, pts), "wdi_indoor": bool(look.get("wdi_indoor", True)),
              "wdi_baked": bool(look.get("wdi_baked", True)), "wdi_exposure": look["wdi_exposure"],
              "fog_color": look["fog_color"], "fog_density": look["fog_density"]}
    return {"area": aid, "extras": extras, "spawns": spawns, "portals": portals, "zones": zn, "seams": seams,
            "closed_seams": closed, "problems": probs}


def name_problems(names: list) -> list:
    out = []
    seen = set()
    for n in names:
        low = n.lower()
        for b in BANNED:
            if b in low:
                out.append(f"name {n!r} holds the banned word {b!r}")
        if n in seen:
            out.append(f"name {n!r} is used twice")
        seen.add(n)
    return out


def fill_points(sec_d: dict, look: dict) -> list:
    """The fill lights: one in every walkable chamber and one every passage_step_m along each walking passage at
    least passage_min_width_m wide, at height_frac of its height; watts from the floor area they light."""
    f = look["fill"]
    out = []
    for c in sec_d.get("chambers", []):
        if not c.get("walk", True):
            continue
        L, W, H = (float(v) for v in c["size"])
        w = min(max(f["watts_per_m2"] * L * W, f["min_watts"]), f["max_watts"])
        out.append({"id": f"fill_{c['id']}", "at": [c["center"][0], c["center"][1], c["center"][2] + f["height_frac"] * H],
                    "watts": round(w, 3)})
        big = f.get("big")
        if big and L * W >= float(big["min_area_m2"]):
            # a big chamber also gets a ring of low lights near its walls, so its blocks and walls are lit from the
            # side and read as shapes (route 1: the 32 m Well Dome read flat under its one light)
            ax_ = c.get("axis", [1.0, 0.0])
            n_ = math.hypot(ax_[0], ax_[1]) or 1.0
            ux, uy = ax_[0] / n_, ax_[1] / n_
            k = int(big["ring"])
            wr = min(float(big["watts_per_m2"]) * L * W / k, float(big["max_watts"]))
            for i in range(k):
                a = 2.0 * math.pi * (i + 0.5) / k
                du, dv = 0.5 * L * big["ring_frac"] * math.cos(a), 0.5 * W * big["ring_frac"] * math.sin(a)
                out.append({"id": f"fill_{c['id']}_ring_{i}",
                            "at": [c["center"][0] + du * ux - dv * uy, c["center"][1] + du * uy + dv * ux,
                                   c["center"][2] + big["height_frac"] * H], "watts": round(wr, 3)})
    nodes = sec_d.get("nodes", {})
    cf = f.get("climb")
    for p in sec_d.get("passages", []) if cf else []:
        # a climb face of some height gets a low light at the side of its foot, so the face is lit across
        if p["profile"] != "climb_face":
            continue
        A = nodes[p["from"]] if isinstance(p["from"], str) else p["from"]
        B = nodes[p["to"]] if isinstance(p["to"], str) else p["to"]
        if B[2] - A[2] < float(cf["min_height_m"]):
            continue
        dx, dy = B[0] - A[0], B[1] - A[1]
        n_ = math.hypot(dx, dy) or 1.0
        dx, dy = dx / n_, dy / n_
        wv = p["width"] if isinstance(p["width"], (int, float)) else max(p["width"])
        side = 0.5 * float(wv) + float(cf["side_m"])
        out.append({"id": f"fill_{p['id']}_foot",
                    "at": [A[0] - cf["back_m"] * dx - side * dy, A[1] - cf["back_m"] * dy + side * dx,
                           A[2] + cf["height_m"]], "watts": float(cf["watts"])})
    for p in sec_d.get("passages", []):
        if p["profile"] not in core.WALK_PROFILES:
            continue
        wv = p["width"] if isinstance(p["width"], list) else [p["width"], p["width"]]
        hv = p["clear"] if isinstance(p["clear"], list) else [p["clear"], p["clear"]]
        if max(wv) < f["passage_min_width_m"]:
            continue
        pts = [nodes[p["from"]] if isinstance(p["from"], str) else p["from"]] + list(p.get("via", []))
        pts += [nodes[p["to"]] if isinstance(p["to"], str) else p["to"]]
        P = np.array(pts, dtype=np.float64)
        seg = np.hypot(np.diff(P[:, 0]), np.diff(P[:, 1]))
        S = float(seg.sum())
        n = max(1, int(round(S / f["passage_step_m"])))
        cum = np.concatenate([[0.0], np.cumsum(seg)])
        for i in range(n):
            s = (i + 0.5) * S / n
            j = int(min(np.searchsorted(cum, s, side="right") - 1, len(seg) - 1))
            t = (s - cum[j]) / max(seg[j], 1e-9)
            q = P[j] + t * (P[j + 1] - P[j])
            frac = s / max(S, 1e-9)
            W = wv[0] + (wv[1] - wv[0]) * frac
            H = hv[0] + (hv[1] - hv[0]) * frac
            w = min(max(f["watts_per_m2"] * W * (S / n), f["min_watts"]), f["max_watts"])
            out.append({"id": f"fill_{p['id']}_{i}", "at": [float(q[0]), float(q[1]), float(q[2] + f["height_frac"] * H)],
                        "watts": round(w, 3)})
    return out


def face_materials(V: np.ndarray, F: np.ndarray, geo: np.ndarray, geo_names: list, kits: dict, floor_nz: float,
                   mouth_boxes: list, mouth_kit: str = "mouth", moss=None) -> tuple:
    """Each face's material key, '<kit>_<wall|floor>': its geology's kit, the moss kit where `moss` (per face) is
    set, the mouth kit (`mouth_kit`) inside a gate's mouth boxes, floor where the face looks up more than floor_nz.
    Returns (keys list, per-face index array)."""
    a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    n = np.cross(b - a, c - a)
    nz = n[:, 2] / np.maximum(np.linalg.norm(n, axis=1), 1e-12)
    floor = nz > floor_nz
    kit = np.array([g if g in kits else "default" for g in geo_names])[geo]
    if moss is not None and "moss" in kits:
        kit = np.where(np.asarray(moss, bool), "moss", kit)
    cen = (a + b + c) / 3.0
    for bx in mouth_boxes:
        m = np.all((cen >= np.array(bx[:3])) & (cen <= np.array(bx[3:])), axis=1)
        kit = np.where(m, mouth_kit, kit)
    key = np.char.add(np.char.add(kit.astype(str), "_"), np.where(floor, "floor", "wall"))
    # a kit whose wall and floor are the same scan is one material
    same = {k for k, v in kits.items() if isinstance(v, dict) and v.get("wall") == v.get("floor")}
    for k in same:
        key = np.where(np.char.startswith(key, k + "_"), k + "_wall", key)
    keys = sorted(set(key.tolist()))
    idx = np.searchsorted(np.array(keys), key)
    return keys, idx.astype(np.int32)


def scan_of(key: str, kits: dict) -> str:
    kit, part = key.rsplit("_", 1)
    k = kits.get(kit) or kits["default"]
    return k[part]


def first_chunk(offsets: np.ndarray, faces: np.ndarray, n_faces: int) -> np.ndarray:
    """Each face's first chunk (the core lists a face in two chunks where its cell is a chunk's first: drawn once)."""
    owner = np.full(n_faces, -1, np.int32)
    for ci in range(len(offsets) - 1):
        fs = faces[offsets[ci]:offsets[ci + 1]]
        free = owner[fs] < 0
        owner[fs[free]] = ci
    return owner


def guard_display(L: np.ndarray) -> np.ndarray:
    """Lilac and teal guards on a light (N x 3, linear): green never under the lesser of red and blue (no lilac or
    magenta), and never over the greater of them (no teal cast baked onto rock; teal stays an emitter's)."""
    L = np.array(L, dtype=np.float64)
    lo = np.minimum(L[:, 0], L[:, 2])
    hi = np.maximum(L[:, 0], L[:, 2])
    L[:, 1] = np.clip(L[:, 1], lo, hi)
    return L


def guard_texels(L: np.ndarray, ratio: np.ndarray | None) -> np.ndarray:
    """The lilac guard for the texels under a light (N x 3, linear): `ratio` (N x 2) is each vertex's pinkest and
    bluest surface (red over green and blue over green of its kit's texels at the 98th percentile, its tint in).
    Where such a texel would show lilac (red and blue both over green), the light's blue comes down to the green the
    texel can take (and its red up to its green, so the light never turns green), so the light leans warm rather
    than lilac (route 1 fix: the Cutting Gate's lamp and the moon together turned the slot's pinker texels lilac).
    Pure moonlight on these kits is left as it is."""
    L = np.array(L, dtype=np.float64)
    if ratio is None:
        return L
    q = np.asarray(ratio, dtype=np.float64)
    bad = (q[:, 0] * L[:, 0] > L[:, 1]) & (q[:, 1] * L[:, 2] > L[:, 1])
    if bad.any():
        L[bad, 2] = L[bad, 1] / np.maximum(q[bad, 1], 1e-9)
        L[bad, 0] = np.maximum(L[bad, 0], L[bad, 1])   # and green stays under red: no green or teal cast either
    return L


def lilac_share(rgb_display: np.ndarray, margin: float = 0.004) -> float:
    """The share of display colours (0..1 sRGB) that read lilac or magenta: green under both red and blue."""
    d = np.asarray(rgb_display, dtype=np.float64)
    if not len(d):
        return 0.0
    bad = (d[:, 1] + margin < d[:, 0]) & (d[:, 1] + margin < d[:, 2])
    return float(bad.mean())


def budgets(stats: dict) -> dict:
    """The planning targets per cave file against measured numbers (a key missing from stats is not judged)."""
    tg = {"file_mb": 10.0, "triangles_loaded": 1500000, "texture_gpu_mb": 96.0, "draw_calls": 160,
          "triangles_collision": 60000}
    out = {}
    for k, lim in tg.items():
        if k in stats and stats[k] is not None:
            out[k] = {"value": stats[k], "target": lim, "ok": stats[k] <= lim}
    return out


def iron_display(L: np.ndarray, lamp_share: np.ndarray, k: float, look: dict, ink_t: float, agx, solve, lum):
    """A gate's iron (N x 3 COLOR_0, linear): dark iron under its light. The plain light (iron's albedo x the baked
    light x the grade) sets each vertex's display luminance, held between just over the ink and the look's cap, so
    the bars never read pale beside the lamp; the hue is the iron's grey, warmed towards the lamp's colour as far as
    the lamp gives the light (the sky's blue is not carried: the bars read iron, not lit paint). agx, solve and lum
    are meshy_room_build's (the viewer's AgX, the solve for a display luminance, the luminance)."""
    we = float(look["wdi_exposure"])
    cfg = look.get("iron_display", {})
    cap, warm_max = float(cfg.get("cap", 0.3)), float(cfg.get("warm", 0.5))
    base = hex_lin(look["iron"])
    L = np.asarray(L, dtype=np.float64).reshape(-1, 3)
    nat = lum(agx(we * k * L * base[None, :]))
    t = np.clip(nat, ink_t * float(cfg.get("ink_margin", 1.12)), cap)
    warm = hex_lin(look["lamp"]["colour"])
    warm = warm / max(float(lum(warm[None, :])[0]), 1e-9)
    grey = base / max(float(lum(base[None, :])[0]), 1e-9)
    s = np.clip(np.asarray(lamp_share, dtype=np.float64).reshape(-1), 0.0, 1.0) * warm_max
    hue = (1.0 - s)[:, None] * grey[None, :] + s[:, None] * warm[None, :]
    sc = solve(hue * we, t)
    return hue * sc[:, None]


def facing(V: np.ndarray, F: np.ndarray, normal) -> np.ndarray:
    """Faces F (M x 3) wound so their normals point along `normal`."""
    V, F = np.asarray(V, dtype=np.float64), np.asarray(F, dtype=np.int64).copy()
    n = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    flip = n @ np.asarray(normal, dtype=np.float64) < 0
    F[flip] = F[flip][:, ::-1]
    return F


def mouth_frame(box, portal, grille) -> dict:
    """A gate mouth's frame in plan: `out` the unit vector from the cave towards the world outside (from the portal
    through the grille), the axis the mouth faces along (0 for x, 1 for y), the outcrop's plane coordinate on that
    axis (0.2 m past the mouth box's outer face) and the u axis across the mouth with its range (the box plus 3 m)."""
    (ax_, ay_), (bx_, by_) = grille
    gmid = np.array([0.5 * (ax_ + bx_), 0.5 * (ay_ + by_)])
    out = gmid - np.asarray(portal[:2], dtype=np.float64)
    out /= max(float(np.linalg.norm(out)), 1e-9)
    ax = 0 if abs(out[0]) >= abs(out[1]) else 1
    sign = 1.0 if out[ax] > 0 else -1.0
    plane = float(box[3 + ax] if sign > 0 else box[ax]) + 0.2 * sign
    ua = 1 - ax
    return {"out": out, "axis": ax, "sign": sign, "plane": plane, "u_axis": ua,
            "u": (float(box[ua]) - 3.0, float(box[3 + ua]) + 3.0)}


def mouth_kit_name(kits: dict, design_gate: dict | None) -> str:
    """The kit of a gate's mouth: `mouth_<gate type>` when the look has one (the Cutting Gate's slot is frosted
    quarried rock, not the Swallow's mossy knoll), else `mouth`."""
    t = (design_gate or {}).get("type")
    return f"mouth_{t}" if t and f"mouth_{t}" in kits else "mouth"


def mouth_kit_boxes(box, frame: dict | None) -> list:
    """The box where a mouth's faces take the mouth kit: the opening's box, 1 m wider across the mouth, 0.5 m
    further out and up and down, and 2.5 m further into the cave (along the mouth's own axis)."""
    b = [float(v) for v in box]
    if frame is None:   # no gate: as the Swallow's (into the cave along +y)
        return [b[0] - 1.0, b[1] - 0.5, b[2] - 0.5, b[3] + 1.0, b[4] + 2.5, b[5] + 0.5]
    ax, ua, sg = frame["axis"], frame["u_axis"], frame["sign"]
    lo, hi = [b[0], b[1], b[2] - 0.5], [b[3], b[4], b[5] + 0.5]
    lo[ua] -= 1.0
    hi[ua] += 1.0
    if sg > 0:   # the world outside lies on +: out 0.5 m there, in 2.5 m on -
        hi[ax] += 0.5
        lo[ax] -= 2.5
    else:
        lo[ax] -= 0.5
        hi[ax] += 2.5
    return lo + hi


def outcrop_strips(rock: np.ndarray, us: np.ndarray, zs: np.ndarray, max_run: int = 8) -> list:
    """The outcrop face's quads, merged along u: rock[i, j] says the cell (us[i]..us[i+1], zs[j]..zs[j+1]) is rock
    at all four corners. Runs of rock cells in a row become one quad, at most max_run cells long (so its light is
    sampled about every metre). Returns [(u0, u1, z0, z1)]."""
    quads = []
    for j in range(len(zs) - 1):
        i = 0
        n = len(us) - 1
        while i < n:
            if not rock[i, j]:
                i += 1
                continue
            i0 = i
            while i < n and rock[i, j] and i - i0 < max_run:
                i += 1
            quads.append((float(us[i0]), float(us[i]), float(zs[j]), float(zs[j + 1])))
    return quads


# ================================================================ Blender

rb = None  # meshy_room_build, imported in Blender only (its bake, its raw files, its display maths)
COL: dict = {}
MATS: dict = {}     # key -> dict(mat, scan, mean, dark, kind)


def _rb():
    global rb
    if rb is None:
        import meshy_room_build as m
        rb = m
    return rb


def new_collection(name: str):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    COL[name] = c
    return c


def mesh_object(name: str, V, F, col: str, uvs=None, fmat=None, mats=()):
    me = bpy.data.meshes.new(name)
    me.from_pydata(np.asarray(V, np.float64).tolist(), [], np.asarray(F, np.int64).tolist())
    if uvs is not None:
        layer = me.uv_layers.new(name="UVMap")
        layer.data.foreach_set("uv", np.asarray(uvs, np.float32).ravel())
    for m in mats:
        me.materials.append(m)
    if fmat is not None and len(me.polygons):
        me.polygons.foreach_set("material_index", np.asarray(fmat, np.int32))
    me.update()
    ob = bpy.data.objects.new(name, me)
    COL[col].objects.link(ob)
    return ob


def set_point_colour(ob, name: str, rgb) -> None:
    me = ob.data
    if name in me.color_attributes:
        me.color_attributes.remove(me.color_attributes[name])
    a = me.color_attributes.new(name, "FLOAT_COLOR", "POINT")
    rgba = np.ones((len(me.vertices), 4), np.float32)
    rgba[:, :3] = np.asarray(rgb, np.float32)
    a.data.foreach_set("color", rgba.ravel())


# ---------------------------------------------------------------- scans and materials


def scan_dark_rel(lin: np.ndarray, pct: float, lift: float) -> np.ndarray:
    """The darkest kept texel over the mean (linear RGB) of a scan's texels (N x 3, linear) with its darkest tail
    lifted (`lift`) and held at its `pct` percentile, as derive_scan keeps them."""
    lin = _rb().lift_dark(np.asarray(lin, np.float64), lift)
    lo = np.minimum(lin[:, 0], lin[:, 2])
    lin[:, 1] = np.maximum(lin[:, 1], lo)
    y = 0.2126 * lin[:, 0] + 0.7152 * lin[:, 1] + 0.0722 * lin[:, 2]
    ref = float(np.percentile(y, pct))
    lin = np.minimum(lin * np.where(y < ref, ref / np.maximum(y, 1e-6), 1.0)[:, None], 1.0)
    y2 = 0.2126 * lin[:, 0] + 0.7152 * lin[:, 1] + 0.0722 * lin[:, 2]
    return lin[np.argsort(y2)[: max(1, len(y2) // 1000)]].mean(0) / np.maximum(lin.mean(0), 1e-6)


WARM_PROBE = "#FFB457"   # the lamps' colour: the scan's darkest texel is also taken under it
SCAN_R3 = {"lift": 0.45, "pct": 0.5}   # route 3's scan grade (the look's lantern.route3_*), for the report's baseline
DARK_GAIN = {"g": 1.0}   # the look's ink_lift.dark_gain (finish_attrs), for the report
SCAN_CAP = {"mean_max": None}   # the look's ink_lift.texture_mean_max: no scan's mean luminance is over this (derive_scan)


WEBP_QUALITY = 80   # the glTF exporter's quality for the scans (meshy_room_build.export_glb)
WEBP_ROUNDS = 12    # passes of hold_dark
HOLD_LOG: dict = {}   # scan slug -> hold_dark's counts of low texels per round (the build log)


def webp_round(lin: np.ndarray, w: int, h: int, path: str, quality: int = WEBP_QUALITY) -> np.ndarray:
    """The texels (N x 3, linear) as an sRGB WebP at `quality` gives them back (linear), through Blender's own
    encoder, the one the glTF exporter uses."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    srgb = np.where(lin <= 0.0031308, 12.92 * lin, 1.055 * np.power(np.maximum(lin, 0.0), 1 / 2.4) - 0.055)
    img = bpy.data.images.new("_webp_round", w, h, alpha=False)
    img.colorspace_settings.name = "sRGB"
    rgba = np.ones((w * h, 4), np.float32)
    rgba[:, :3] = np.round(np.clip(srgb, 0.0, 1.0) * 255.0) / 255.0
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = path
    img.file_format = "WEBP"
    bpy.context.scene.render.image_settings.quality = int(quality)
    try:
        img.save(quality=int(quality))
    except TypeError:
        img.save()
    bpy.data.images.remove(img)
    back = bpy.data.images.load(path, check_existing=False)
    px = np.empty(w * h * 4, np.float32)
    back.pixels.foreach_get(px)
    bpy.data.images.remove(back)
    try:
        os.remove(path)
    except OSError:
        pass
    return srgb_to_lin(px.reshape(-1, 4)[:, :3].astype(np.float64))


PROBES = ("#FFFFFF", WARM_PROBE, "#C9C2B4")   # lights hold_dark checks a scan's dark texels under: white, the lamps
# and the fill (the look's colours). Not the night sky's blue: it lands only near a mouth, far over the floor, and a
# saturated orange texel cannot be held under it without greying the scan
HOLD_AIM = 1.08   # hold_dark raises a low texel to this times the kept darkest texel's display (the encoder pulls back)


HOLD_SCALE_MAX = 3.0   # derive_scan scales a texel under the held level by at most this; grey makes up the rest
FLOOR_PROBE = "#C9C2B4"   # the fill's colour: the ink floor's light is this colour (grade_rows: fl_n)


def kept_dark(dec: np.ndarray, probe) -> int:
    """The index of the texel (N x 3, linear) that displays darkest through three r186's AgX under the light `probe`
    (linear RGB), lit so that the scan's darkest 2 % sit near ink: the kept darkest texel."""
    R_ = _rb()
    ink_d = float(R_.lum(np.array(INK, float))) / 255.0
    y = dec @ np.array([0.2126, 0.7152, 0.0722])
    cand = np.argsort(y)[: max(1, len(y) // 50)]
    s = float(R_.solve_display((dec[cand].mean(0) * probe)[None, :], ink_d)[0])
    return int(np.argmin(R_.lum(R_.agx(dec * probe[None, :] * s))))


def hold_dark(lin: np.ndarray, encode, probes=PROBES, rounds: int = WEBP_ROUNDS, aim: float = HOLD_AIM,
              floor_probe=FLOOR_PROBE, margin_luma: float = 2.0):
    """The scan's darkest texels held as the file will show them. `encode` gives back texels (N x 3, linear) as the
    file's encoding stores them (Blender's WebP at quality 80 for the GLB: webp_round). The reference is the source's
    darkest kept texel under the floor's light (`floor_probe`, kept_dark): what the scan's grade (its lifted, held
    tail) meant to keep; the ink floor holds it at ink plus `margin_luma` display levels (the look's). Under each
    light in `probes`, every encoded texel that would then display under the ink itself is raised in the source by
    the factor that lifts it to `aim` times the reference's display, for a few rounds. Last, under the floor's light,
    if any encoded texel still displays under the ink, the darkest kept texel is lowered (so the floor rises) just
    enough to lift that texel to the ink: no texel the viewer samples displays under the ink at the floor (the
    rebuild's check: a mean of the darkest 0.1 % left specks under ink), and a texel the encoder could not hold costs
    the floor only what it needs. The darkest kept texel returned has the colour of the scan's darkest 2 %. Returns (the texels to save, the encoded texels, the darkest kept texel, the
    rounds' counts of low texels, then the floor's factor)."""
    R_ = _rb()
    lin = np.asarray(lin, np.float64).copy()
    ink_d = float(R_.lum(np.array(INK, float))) / 255.0
    ink_t = ink_d + float(margin_luma) / 255.0
    P = [np.asarray(hex_lin(p) if isinstance(p, str) else p, np.float64) for p in probes]
    fp = np.asarray(hex_lin(floor_probe) if isinstance(floor_probe, str) else floor_probe, np.float64)
    ref = lin[kept_dark(lin, fp)].copy()
    S = [float(R_.solve_display((ref * p)[None, :], ink_t)[0]) for p in P]
    dec = encode(lin)
    lows = []
    for _ in range(rounds):
        need = np.ones(len(dec))
        for p, s in zip(P, S):
            d = R_.lum(R_.agx(dec * p[None, :] * s))
            low = d < ink_d
            if low.any():
                k = R_.solve_display(dec[low] * p[None, :] * s, ink_t * aim, lo=1.0, hi=64.0, iters=30)
                need[low] = np.maximum(need[low], k)
        n_low = int((need > 1.0).sum())
        lows.append(n_low)
        if not n_low:
            break
        up = need > 1.0
        lin[up] = np.minimum(lin[up] * np.minimum(need[up], 4.0)[:, None], 1.0)
        dec = encode(lin)
    sf = float(R_.solve_display((ref * fp)[None, :], ink_t)[0])
    i0 = int(np.argmin(R_.lum(R_.agx(dec * fp[None, :] * sf))))
    g = float(R_.solve_display((dec[i0] * fp * sf)[None, :], ink_d + 1e-4, lo=1.0, hi=64.0, iters=40)[0])
    lows.append(round(max(g, 1.0), 4))   # last: the factor the floor rises by for a texel the encoder kept low
    # the darkest kept texel in the colour of the scan's darkest 2 % (not one texel's: a slate's bluest texel shows
    # violet through AgX, which the lilac guard then flags), at the level that puts the reference at ink plus the
    # margin and the darkest encoded texel at the ink at least
    y = dec @ np.array([0.2126, 0.7152, 0.0722])
    cm = dec[np.argsort(y)[: max(1, len(y) // 50)]].mean(0)
    s_min = float(R_.solve_display((dec[i0] * fp)[None, :], ink_d + 1e-4)[0])
    q = min(float(R_.solve_display((cm * fp * s_min)[None, :], ink_t)[0]),
            float(R_.solve_display((cm * fp * sf)[None, :], ink_t)[0]))
    return lin, dec, cm * q, lows


def derive_scan(slug: str, out_dir: str, pct: float, lift: float = 0.45, margin_luma: float = 2.0) -> dict:
    """A locked scan's diffuse, its darkest tail lifted to its `pct` percentile (luminance, keeping the hue) and its
    purple texels greened (green up to the lesser of red and blue), saved as a PNG beside the build and loaded. Returns
    the image and its linear mean and reference (darkest kept) colours, and rel_r3: the darkest kept texel over the
    mean under route 3's grade of the scan (SCAN_R3), for the report's comparison with route 3's look."""
    src = os.path.join(CACHE, slug, f"{slug}_diff_1k.jpg")
    if not os.path.exists(src):
        raise SystemExit(f"scan {slug} is not in {CACHE} (only locked scans are used; nothing is downloaded)")
    img = bpy.data.images.load(src, check_existing=False)
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    rgb = px.reshape(-1, 4)[:, :3].astype(np.float64)   # sRGB values as stored
    lin = srgb_to_lin(rgb)
    rel_r3 = scan_dark_rel(lin, SCAN_R3["pct"], SCAN_R3["lift"])
    # the darkest texels toward `lift` of the mean (meshy_room_build.lift_dark): a dim cave's mean texel then sits
    # a little over the ink floor that its darkest texel is held to, instead of far above it
    # the scan's darkest texels take their colour from their neighbours first (meshy_room_build's dark_chroma_smooth):
    # lift_dark keeps a texel's hue, so a near-black texel of chroma noise became a pure primary (the snow scan's
    # (0, 0, 1) texels, which no light could hold over the ink)
    lin = _rb().dark_chroma_smooth(lin.reshape(h, w, 3)).reshape(-1, 3)
    lin = _rb().lift_dark(lin, lift)
    # a pale scan (the flowstone, the breakdown and the gypsum are two to three times the limestone's) is scaled down
    # to the cap before the hold: the lantern shows the scan's own albedo (its light is added to the base colour), so
    # the cap is what keeps a wall that is lit by it from washing out, and the speleothems that wear the flowstone
    # scan from standing paler than the rock round them. The bake follows (its factor is 1 / the scan's mean)
    cap = SCAN_CAP["mean_max"]
    if cap:
        m_ = float((0.2126 * lin[:, 0] + 0.7152 * lin[:, 1] + 0.0722 * lin[:, 2]).mean())
        if m_ > cap:
            lin = lin * (cap / m_)
    lo = np.minimum(lin[:, 0], lin[:, 2])
    lin[:, 1] = np.maximum(lin[:, 1], lo)
    y = 0.2126 * lin[:, 0] + 0.7152 * lin[:, 1] + 0.0722 * lin[:, 2]
    ref = float(np.percentile(y, pct))
    # a texel under the held level is scaled up (its hue kept) by at most HOLD_SCALE_MAX, the rest of the way in grey:
    # scaling a near-black texel all the way made pure primaries (the snow scan's (0, 0, 1) texels, which no light
    # could hold over the ink)
    s = np.minimum(np.where(y < ref, ref / np.maximum(y, 1e-6), 1.0), HOLD_SCALE_MAX)
    lin = np.minimum(lin * s[:, None] + np.maximum(ref - y * s, 0.0)[:, None] * (y < ref)[:, None], 1.0)
    # the file carries the scan as WebP at quality 80 (meshy_room_build.export_glb), whose rounding puts 1 to 7 % of
    # the texels a little under the kept darkest level (to 0.75 of it at the 0.1st percentile, measured on the cave
    # scans): those texels are raised where the encoded image shows them low, and the darkest kept texel is then
    # taken from the encoded image, so the ink floor holds for what the viewer samples
    # the darkest kept texel as the viewer shows it: the scan as the file's WebP encodes it (Blender's encoder, the
    # glTF exporter's), its few texels that display under the level of the 2 % darkest raised in the source (under
    # white, the lamps, the fill and the sky: a saturated red texel shows darker than a grey one of the same
    # luminance), then the absolute darkest encoded texel under each light, so no texel the viewer samples sits
    # under the ink floor (hold_dark)
    wpath = os.path.join(out_dir, "textures", f"_webp_{slug}.webp")
    lin, dec, dark, lows = hold_dark(lin, lambda x: webp_round(x, w, h, wpath), margin_luma=margin_luma)
    HOLD_LOG[slug] = lows
    y2 = 0.2126 * lin[:, 0] + 0.7152 * lin[:, 1] + 0.0722 * lin[:, 2]
    mean = lin.mean(0)
    rel = lin / np.maximum(mean, 1e-6)[None, :]   # the texel as the file shows it (texture x 1/mean)
    lit = y2 > np.percentile(y2, 5)
    q = rel[lit] / np.maximum(rel[lit, 1:2], 1e-6)
    ratio = np.array([np.percentile(q[:, 0], 98), np.percentile(q[:, 2], 98)])
    tex_dir = os.path.join(out_dir, "textures")
    os.makedirs(tex_dir, exist_ok=True)
    path = os.path.join(tex_dir, f"cave_{slug}.png")
    srgb = np.where(lin <= 0.0031308, 12.92 * lin, 1.055 * np.power(lin, 1 / 2.4) - 0.055)
    out = bpy.data.images.new(f"cave_{slug}", w, h, alpha=False)
    out.colorspace_settings.name = "sRGB"
    rgba = np.ones((w * h, 4), np.float32)
    rgba[:, :3] = srgb
    out.pixels.foreach_set(rgba.ravel())
    out.filepath_raw = path
    out.file_format = "PNG"
    out.save()
    out.pack()
    return {"image": out, "mean": mean, "dark": dark, "ref_luma": ref, "path": path, "ratio": ratio, "rel_r3": rel_r3}


def flat_material(name: str, colour_lin, emit: bool = False):
    """A plain material: Principled at a colour for the bake (black for an occluder), and its export tree later."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    if emit:
        em = nt.nodes.new("ShaderNodeEmission")
        em.inputs["Color"].default_value = (*[float(c) for c in colour_lin], 1.0)
        em.inputs["Strength"].default_value = 1.0
        nt.links.new(em.outputs[0], out.inputs["Surface"])
    else:
        b = nt.nodes.new("ShaderNodeBsdfPrincipled")
        b.inputs["Base Color"].default_value = (*[float(c) for c in colour_lin], 1.0)
        b.inputs["Roughness"].default_value = 1.0
        for key in ("Specular IOR Level", "Specular"):
            if key in b.inputs:
                b.inputs[key].default_value = 0.0
                break
        nt.links.new(b.outputs[0], out.inputs["Surface"])
    return m


def bake_tree(m) -> None:
    """The bake: a rough diffuse at the vertex's albedo (the tint attribute), so the bounce carries its colour."""
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    at = nt.nodes.new("ShaderNodeAttribute")
    at.attribute_name = TINT_ATTR
    nt.links.new(at.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 1.0
    for key in ("Specular IOR Level", "Specular"):
        if key in b.inputs:
            b.inputs[key].default_value = 0.0
            break
    nt.links.new(b.outputs[0], out.inputs["Surface"])


def unlit_tree(m, image=None, colour=None, vertex: bool = True) -> None:
    """The export tree, in the shape the glTF exporter writes as KHR_materials_unlit: an emission (image x the
    COLOR_0 attribute, or a flat colour) mixed with a transparent BSDF by 'is camera ray' (meshy_room_build's).
    vertex False: the image alone (a lightmapped material: its light is the lightmap's, not COLOR_0's)."""
    nt = m.node_tree
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
    if image is not None and not vertex:
        ti = N.new("ShaderNodeTexImage")
        ti.image = image
        ti.interpolation = "Linear"
        L.new(ti.outputs["Color"], em.inputs["Color"])
    elif image is not None:
        ti = N.new("ShaderNodeTexImage")
        ti.image = image
        ti.interpolation = "Linear"
        vc = N.new("ShaderNodeVertexColor")
        vc.layer_name = ATTR
        mul = N.new("ShaderNodeMix")
        mul.data_type, mul.blend_type = "RGBA", "MULTIPLY"
        mul.inputs[0].default_value = 1.0
        L.new(ti.outputs["Color"], mul.inputs[6])
        L.new(vc.outputs["Color"], mul.inputs[7])
        L.new(mul.outputs[2], em.inputs["Color"])
    else:
        em.inputs["Color"].default_value = (*[float(min(c, 1.0)) for c in colour], 1.0)
    L.new(mix.outputs[0], out.inputs["Surface"])


def plan_tree(m) -> None:
    """For the top plan only: back faces (the roof seen from above) let the camera through."""
    nt = m.node_tree
    out = [n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"][0]
    src = out.inputs["Surface"].links[0].from_socket
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(geo.outputs["Backfacing"], mix.inputs[0])
    nt.links.new(src, mix.inputs[1])
    nt.links.new(nt.nodes.new("ShaderNodeBsdfTransparent").outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])


def rock_materials(keys: list, look: dict, out_dir: str) -> list:
    kits = look["kits"]
    pct = float(look["ink_lift"]["dark_percentile"])
    scans = {}
    mats = []
    for key in keys:
        slug = scan_of(key, kits)
        if slug not in scans:
            scans[slug] = derive_scan(slug, out_dir, pct, float(look["ink_lift"].get("texture_lift", 0.45)),
                                      float(look["ink_lift"]["margin_luma"]))
        m = bpy.data.materials.new(f"cave_{key}")
        m.use_nodes = True
        bake_tree(m)
        MATS[m.name] = {"mat": m, "scan": slug, "kind": "rock", **{k: scans[slug][k] for k in ("image", "mean", "dark", "ratio", "rel_r3")}}
        mats.append(m)
    return mats


# ---------------------------------------------------------------- the scene


def clear_scene() -> None:
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    sc = bpy.context.scene
    sc.unit_settings.system = "METRIC"
    for name in ("cave", "bake_only", "nodes", "cams"):
        new_collection(name)


def build_shell(z: dict, sec, look: dict, out_dir: str, mouth_boxes: list, mouth_kit: str = "mouth") -> tuple:
    """The shell's chunks: one mesh each, vertices split where two materials meet (the tint factor is per
    material), the core's UVs per face corner, the tint (linear albedo) as a point attribute for the bake."""
    Vq = z["shell_verts_q"]
    V = Vq / core.Q
    F = z["shell_faces"].astype(np.int64)
    geo_names = json.loads(str(z["geology"]))
    tint_lin = srgb_to_lin(np.clip(z["shell_tint"].astype(np.float64), 0.0, 1.0))
    wm = moss_weight(V, vertex_normals(V, F), moss_sources(sec), sec.field_points, sec)
    tint_lin = moss_tint(tint_lin, wm, V, sec)
    MOSS["vertices"] = int((wm > 0.05).sum())
    face_moss = wm[F].mean(1) > MOSS_FACE
    MOSS["faces"] = int(face_moss.sum())
    keys, fidx = face_materials(V, F, z["shell_face_geo"].astype(np.int64), geo_names, look["kits"],
                                float(look["floor_normal_z"]), mouth_boxes, mouth_kit, moss=face_moss)
    mats = rock_materials(keys, look, out_dir)
    # the ink floor's darkest-texel ratio per vertex, continuous across the materials' edges (lmap.relax_floor)
    r_mat = np.array([float(_rb().lum(MATS[m.name]["dark"] / np.maximum(MATS[m.name]["mean"], 1e-4))) for m in mats])
    r_vert = lmap.relax_floor(V, F, r_mat[fidx], float(look["ink_lift"].get("floor_blend_per_m", 0.25)))
    owner = first_chunk(z["chunk_offsets"], z["chunk_faces"], len(F))
    uv = z["shell_uv"]
    objs = []
    for ci, ck in enumerate(z["chunk_keys"]):
        fs = np.nonzero(owner == ci)[0]
        if not len(fs):
            continue
        Fc = F[fs]
        mi = fidx[fs]
        # split vertices per material: key (vertex, material)
        corner_v = Fc.ravel()
        corner_m = np.repeat(mi, 3)
        k = corner_v * 64 + corner_m
        uk, inv = np.unique(k, return_inverse=True)
        vs = uk // 64
        ms = uk % 64
        name = f"um_{sec.key}_chunk_{int(ck[0])}_{int(ck[1])}_{int(ck[2])}"
        ob = mesh_object(name, V[vs], inv.reshape(-1, 3), "cave", uvs=uv[fs].reshape(-1, 2), fmat=mi, mats=mats)
        fac = np.stack([np.ones(3)] * len(ms))
        alb = tint_lin[vs]
        for j in range(len(keys)):
            sel = ms == j
            if sel.any():
                fac[sel] = 1.0 / np.maximum(MATS[mats[j].name]["mean"], 1e-4)
        set_point_colour(ob, TINT_ATTR, alb)
        TEXFAC[ob.name] = fac
        FLOORQ[ob.name] = np.minimum(r_vert[vs] / np.maximum(r_mat[ms], 1e-9), 1.0)
        objs.append(ob)
    return objs, keys


# ---------------------------------------------------------------- moss where the light reaches

MOSS_GREEN, MOSS_OLIVE = "#56653A", "#6B5D3B"   # green to olive-brown (hue 80 and 42 degrees), never teal
MOSS_FACE = 0.45   # a face whose vertices' mean moss weight is over this takes the moss kit's scans
MOSS_R = {"mouth": 18.0, "shaft": 9.0, "lamp": 6.0}   # metres the light of each kind of source grows moss
MOSS: dict = {}


def vertex_normals(V: np.ndarray, F: np.ndarray) -> np.ndarray:
    a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    fn = np.cross(b - a, c - a)
    N = np.zeros_like(V)
    for k in range(3):
        np.add.at(N, F[:, k], fn)
    return N / np.maximum(np.linalg.norm(N, axis=1), 1e-12)[:, None]


def moss_sources(sec) -> list:
    """(kind, point) of the light that reaches into the section: each cave mouth (its portal and its opening's
    middle), the top of each shaft that opens within 2 m of the surface, and each placed lamp of the section
    ("lamps": points; the gate's lamp hangs in its mouth, so the mouth stands for it)."""
    out = []
    for p in sec.d.get("portals", []) or []:
        if p.get("kind") == "cave_mouth":
            out.append(("mouth", [float(v) for v in p["at"]]))
    for o in sec.d.get("openings", []):
        if o["id"].startswith("mouth_"):
            b = o["box"]
            out.append(("mouth", [0.5 * (b[0] + b[3]), 0.5 * (b[1] + b[4]), b[2] + 1.0]))
    for p in sec.own:
        if isinstance(p, core.Passage) and p.profile == "shaft" and float(p.P[:, 2].max()) + max(p.h) > -2.0:
            out.append(("shaft", [float(p.P[-1, 0]), float(p.P[-1, 1]), float(p.P[:, 2].max())]))
    for q in sec.d.get("lamps", []) or []:
        out.append(("lamp", [float(v) for v in q]))
    return out


def moss_weight(V: np.ndarray, N: np.ndarray, sources: list, field=None, sec=None) -> np.ndarray:
    """Per vertex, 0 to 1: how much moss grows there. Near a source of light (MOSS_R by kind, falling off as the
    square of 1 - d / R), on faces turned towards it (roofs less), in patches; where rock stands between the vertex
    and the source (field(points) <= 0 at any of six points along the way) a sixth of it."""
    w = np.zeros(len(V))
    for kind, p in sources:
        R = MOSS_R[kind]
        q = np.asarray(p, np.float64)
        d = V - q[None, :]
        dist = np.linalg.norm(d, axis=1)
        idx = np.nonzero(dist < R)[0]
        if not len(idx):
            continue
        to = -d[idx] / np.maximum(dist[idx], 1e-9)[:, None]
        facing = np.clip(0.35 + 0.65 * (N[idx] * to).sum(1), 0.0, 1.0)
        facing = facing * np.where(N[idx, 2] < -0.5, 0.3, 1.0)
        ww = (1.0 - dist[idx] / R) ** 2 * facing
        if field is not None:
            k = np.nonzero(ww > 0.02)[0]
            if len(k):
                P0 = V[idx[k]] + 0.15 * N[idx[k]]
                seen = np.ones(len(k), bool)
                for t in (0.15, 0.3, 0.45, 0.6, 0.75, 0.9):
                    seen &= field(P0 + t * (q[None, :] - P0)) > 0.0
                ww[k] = np.where(seen, ww[k], ww[k] / 6.0)
        w[idx] = np.maximum(w[idx], ww)
    if sec is not None and w.any():
        u = (V - sec.origin) / sec.cell
        patch = core.noise_points(u, core.NOISE_LUMP, sec.seed * 17 + 9)
        w = w * np.clip(0.6 + 0.9 * patch, 0.0, 1.0)
    return np.clip(w * 1.6, 0.0, 1.0)


def moss_tint(tint_lin: np.ndarray, w: np.ndarray, V: np.ndarray, sec=None) -> np.ndarray:
    """The albedo with the moss's blended in by weight: green to olive-brown in patches (linear)."""
    if not w.any():
        return tint_lin
    mix = np.full(len(V), 0.5)
    if sec is not None:
        u = (V - sec.origin) / sec.cell
        mix = np.clip(0.5 + 0.8 * core.noise_points(u, core.NOISE_BIG, sec.seed * 19 + 4), 0.0, 1.0)
    moss = hex_lin(MOSS_GREEN)[None, :] * (1.0 - mix)[:, None] + hex_lin(MOSS_OLIVE)[None, :] * mix[:, None]
    a = (0.85 * w)[:, None]
    return tint_lin * (1.0 - a) + moss * a


# ---------------------------------------------------------------- formations, fallen rock and breakdown

# Each group of the core's formation tags (meshy_cave_rock.TAG) is one object per scan kit, its albedo per vertex
# from its geology: speleothems in calcite (paler than the rock), blocks and rocks in the rock's own tint.
SPELEO = {"limestone": "#B8A88B", "flowstone": "#C4B190", "breakdown": "#ABA089", "gypsum": "#DAD3C3",
          "lakeclay": "#8C765D", "ice": "#D3DCE2", "slate": "#8A8884", "skarn": "#B5A084", "granite": "#A09583",
          "flooded": "#8D8880"}
CRYSTAL = {"skarn": "#D9C7A2", "gypsum": "#E8E2D4"}
ICE = "#D2DBE1"
POOL = "#48443D"     # the still water in a rimstone pool: wet and dark, a warm grey
ROCK_SHADE = 0.8     # fallen rock and blocks a little darker than the wall they fell from (dust, damp)
FORM_GROUPS = {"speleothem": (0, 1, 2, 5, 6, 7), "rock": (3, 13), "crystal": (8,), "icicle": (9,), "pool": (14,)}


def form_albedo(group: str, geo_name: str, tint: str) -> str:
    if group == "speleothem":
        return SPELEO.get(geo_name, "#C4B79E")
    if group == "crystal":
        return CRYSTAL.get(geo_name, "#DCD3C0")
    if group == "icicle":
        return ICE
    if group == "pool":
        return POOL
    return tint


def form_scan_kit(group: str, geo_name: str, kits: dict) -> str:
    """The kit whose wall scan a group draws: flowstone's for speleothems, the geology's own for rock, gypsum's for
    crystals, the ice's for icicles."""
    if group in ("speleothem", "pool"):
        return "flowstone" if "flowstone" in kits else "default"
    if group == "crystal":
        return "gypsum" if "gypsum" in kits else "default"
    if group == "icicle":
        return "ice" if "ice" in kits else "default"
    return geo_name if geo_name in kits else "default"


def form_split(kind: np.ndarray, geo: np.ndarray, geo_names: list, kits: dict, default_geo: int) -> dict:
    """The formation faces by object: {(group, kit): sorted face indices}. Proxy-only tags (guards, bridges, seam
    walls) are in no group."""
    out = {}
    g = np.where(geo < 0, default_geo, geo)
    for group, tags in FORM_GROUPS.items():
        m = np.isin(kind, tags)
        for gi in (np.unique(g[m]) if m.any() else []):
            kit = form_scan_kit(group, geo_names[int(gi)], kits)
            out.setdefault((group, kit), []).append(np.nonzero(m & (g == gi))[0])
    return {k: np.sort(np.concatenate(v)) for k, v in out.items()}


def form_objects(z, sec, look: dict, out_dir: str) -> list:
    """The core's formations as meshes, one per (group, scan kit), baked like the shell; their albedo per vertex
    from their geology, varied a little."""
    if "form_faces" not in z or not len(z["form_faces"]):
        return []
    Vq = z["form_verts_q"] / core.Q
    F = z["form_faces"].astype(np.int64)
    kind = z["form_kind"].astype(np.int64)
    geo = z["form_geo"].astype(np.int64) if "form_geo" in z else np.full(len(F), -1)
    geo_names = json.loads(str(z["geology"]))
    dg = geo_names.index(sec.d["geology"]) if sec.d.get("geology") in geo_names else 0
    kits = look["kits"]
    objs = []
    for (group, kit), fs in sorted(form_split(kind, geo, geo_names, kits, dg).items()):
        Fg = F[fs]
        used, inv = np.unique(Fg.ravel(), return_inverse=True)
        Vg = Vq[used]
        Fl = inv.reshape(-1, 3)
        gf = np.where(geo[fs] < 0, dg, geo[fs])
        gv = np.zeros(len(Vg), np.int64)
        gv[Fl.ravel()] = np.repeat(gf, 3)
        tints = {gi: form_albedo(group, geo_names[gi], sec.geo_of(geo_names[gi])[1]["tint"])
                 for gi in set(gv.tolist())}
        ob = textured(f"um_{sec.key}_form_{group}_{kit}", Vg, Fl, kits[kit]["wall"], tints[int(gv[0])], look,
                      out_dir, repeat=1.0)
        alb = np.stack([hex_lin(tints[int(gi)]) for gi in gv])
        u = (Vg - sec.origin) / sec.cell
        var = 1.0 + 0.15 * core.noise_points(u, 2, sec.seed * 23 + 1)
        if group == "rock":
            var = var * ROCK_SHADE
        set_point_colour(ob, TINT_ATTR, alb * var[:, None])
        objs.append(ob)
    return objs


TEXFAC: dict = {}     # object name -> per-vertex 1 / scan mean (linear), so texture x COLOR_0 averages to the albedo
DARK: dict = {}       # object name -> per-vertex darkest kept texel x the factor x the albedo (linear)
MEANALB: dict = {}    # object name -> per-vertex albedo (linear)
RATIO: dict = {}      # object name -> per-vertex pinkest and bluest texel (red / green, blue / green; tint in)
FLOORQ: dict = {}     # shell object name -> per-vertex factor (<= 1) on its darkest texel: relax_floor's over its own
DARK_R3: dict = {}    # object name -> per-vertex darkest texel under route 3's scan grade (the report's baseline)
BAKE_ONLY: list = []  # occluders and helpers that never reach the GLB
EXPORT_ONLY: list = []  # drawn in the GLB, hidden from the bake (the vista's night backdrop)


def box_mesh(c, hx, hy, hz, ux=1.0, uy=0.0):
    """A box's 8 vertices and 12 triangles (outward), centre c, half sizes along (ux, uy), across, up."""
    vx, vy = np.array([ux, uy, 0.0]), np.array([-uy, ux, 0.0])
    vz = np.array([0.0, 0.0, 1.0])
    V = []
    for sz in (-1, 1):
        for sy in (-1, 1):
            for sx in (-1, 1):
                V.append(np.array(c) + sx * hx * vx + sy * hy * vy + sz * hz * vz)
    F = [(0, 2, 3), (0, 3, 1), (4, 5, 7), (4, 7, 6), (0, 1, 5), (0, 5, 4), (2, 6, 7), (2, 7, 3), (0, 4, 6),
         (0, 6, 2), (1, 3, 7), (1, 7, 5)]
    return np.array(V), np.array(F)


def merge(parts: list) -> tuple:
    Vs, Fs, n = [], [], 0
    for V, F in parts:
        Vs.append(V)
        Fs.append(np.asarray(F) + n)
        n += len(V)
    if not Vs:
        return np.zeros((0, 3)), np.zeros((0, 3), np.int64)
    return np.concatenate(Vs), np.concatenate(Fs)


def box_uvs(V, F, repeat: float):
    a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    n = np.cross(b - a, c - a)
    axis = np.argmax(np.abs(n), axis=1)
    pick = np.array([[1, 2], [0, 2], [0, 1]])[axis]
    corners = np.stack([a, b, c], axis=1)
    return (np.take_along_axis(corners, pick[:, None, :].repeat(3, axis=1), axis=2) / repeat).reshape(-1, 2)


def textured(name: str, V, F, slug: str, albedo_hex: str, look: dict, out_dir: str, repeat: float = 1.5):
    """A small mesh with one scanned material (kerbs, decks, the outcrop, the snow), baked like the shell."""
    key = f"piece_{slug}"
    if f"cave_{key}" not in MATS:
        sc = derive_scan(slug, out_dir, float(look["ink_lift"]["dark_percentile"]),
                         float(look["ink_lift"].get("texture_lift", 0.45)), float(look["ink_lift"]["margin_luma"]))
        m = bpy.data.materials.new(f"cave_{key}")
        m.use_nodes = True
        bake_tree(m)
        MATS[m.name] = {"mat": m, "scan": slug, "kind": "rock", "image": sc["image"], "mean": sc["mean"],
                        "dark": sc["dark"], "ratio": sc["ratio"], "rel_r3": sc["rel_r3"]}
    md = MATS[f"cave_{key}"]
    ob = mesh_object(name, V, F, "cave", uvs=box_uvs(np.asarray(V, float), np.asarray(F), repeat), mats=[md["mat"]])
    alb = np.tile(hex_lin(albedo_hex), (len(ob.data.vertices), 1))
    set_point_colour(ob, TINT_ATTR, alb)
    TEXFAC[ob.name] = np.tile(1.0 / np.maximum(md["mean"], 1e-4), (len(ob.data.vertices), 1))
    return ob


POST_REACH = 3.5  # how far down a rail's post may reach for the floor under it


def post_foot(sec, x: float, y: float, base: float, reach: float = POST_REACH) -> float:
    """Where a rail's post stands: on the highest floor under its 0.1 m foot (the centre and the four 0.05 m offsets),
    within reach below the rail's base. A column whose rock starts at the base (the post is set into a lip, a wall
    or an overhang) or that lies on a bridge's deck at the base stands the post at the base; else the column's floor
    is the first rock below the base, or a deck's top. Route 2's check: posts floated where the floor fell away into
    a basin; route 3's: they floated 2.9 m over the Cataract Gallery's undercut floor, and a post whose column met
    an overhang above its foot was taken for standing on it. With no floor within reach the post keeps its base."""
    decks = [(b_["box"], float(b_["top_z"])) for b_ in sec.d.get("bridges", [])]
    zs = base - 0.025 * np.arange(int(round(reach / 0.025)) + 1)
    best = None
    for dx, dy in ((0.0, 0.0), (0.05, 0.0), (-0.05, 0.0), (0.0, 0.05), (0.0, -0.05)):
        px, py = x + dx, y + dy
        top = [t for (x0, y0, x1, y1), t in decks if x0 - 1e-6 <= px <= x1 + 1e-6 and y0 - 1e-6 <= py <= y1 + 1e-6
               and base - reach <= t <= base + 0.01]
        if top and max(top) >= base - 0.01:
            return base
        f = sec.field_points(np.stack([np.full(len(zs), px), np.full(len(zs), py), zs], 1))
        if len(f) and f[0] <= 0.0:
            return base
        rock = np.nonzero(f <= 0.0)[0]
        cand = ([float(zs[rock[0]])] if len(rock) else []) + top
        if cand:
            z = max(cand)
            best = z if best is None else max(best, z)
    if best is None or best >= base - 0.01:   # within a centimetre: it stands on it
        return base
    return best


def post_box(sec, x: float, y: float, base: float, h: float, ux: float, uy: float):
    """A post 0.1 m square from 0.05 m into the floor under it (post_foot; at the base too, so a lip or a deck the
    shell's mesh meets a little lower still holds it) to the rail's top."""
    lo = post_foot(sec, x, y, base) - 0.05
    return box_mesh((x, y, 0.5 * (lo + base + h)), 0.05, 0.05, 0.5 * (base + h - lo), ux, uy)


def lake_rails(sec) -> list:
    """The timber rail round each lake's basin, on the ring of the core's automatic basin guard (core.guard_segments:
    from the lake's floor level, 1 m high, 0.12 m thick), so the walker sees what stops them: two bars along every
    ring segment, as on a declared rail, and a post about every 1.2 m of the ring."""
    parts = []
    for c in sec.own:
        if not (isinstance(c, core.Chamber) and c.kind == "lake"):
            continue
        ring = c.basin_ring()
        pts = ring + [ring[0]]
        base, h = float(c.c[2]), 1.0
        segs = []
        for a, b in zip(pts[:-1], pts[1:]):
            L = math.hypot(b[0] - a[0], b[1] - a[1])
            if L < 1e-6:
                continue
            ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
            segs.append((a, b, L, ux, uy))
            cx, cy = 0.5 * (a[0] + b[0]), 0.5 * (a[1] + b[1])
            for zz in (base + h - 0.04, base + 0.5 * h):
                parts.append(box_mesh((cx, cy, zz), 0.5 * L + 0.04, 0.04, 0.04, ux, uy))
        per = sum(s[2] for s in segs)
        n = max(3, int(math.ceil(per / 1.2)))
        step, run, k = per / n, 0.0, 0
        for a, b, L, ux, uy in segs:
            while k < n and k * step <= run + L + 1e-9:
                t = (k * step - run) / L
                parts.append(post_box(sec, a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), base, h, ux, uy))
                k += 1
            run += L
    return parts


def water_surfaces(sec, step: float = WATER_STEP) -> list:
    """The section's water (its "water" list) as flat surfaces: [{id, kind, level, V, F}], triangles facing up.

    - A stream ({"along": passage, "depth", "width", "side": "left", "right" or "all"}) runs along a walking passage
      at depth above its floor line, against the wall on that side of the centre line (as you walk from its first
      point), width metres wide plus 0.3 m into the wall (hidden in the rock), so the walker wades along its edge.
    - A lake or pool ({"chamber": a lake chamber, "level"}) fills the chamber's basin at the level, inside the ring
      of its rail.

    A quad is kept where a corner is in the shell field's air just above the surface (and, for a stream, the rock
    under it is within 1 m, so it never spans a shaft), so the water ends on the rock it lies in. No collision: the
    walker's floor is the rock under a stream, and a basin's rail keeps them off a lake."""
    out = []
    prims = {p.id: p for p in sec.own}
    for w in sec.d.get("water", []):
        if "along" in w:
            p = prims[w["along"]]
            S = p.S
            s = np.unique(np.concatenate([np.arange(0.0, S, step), [S]]))
            seg = np.clip(np.searchsorted(p.cum, s, side="right") - 1, 0, len(p.A) - 1)
            f = (s - p.cum[seg]) / np.maximum(p.L[seg], 1e-9)
            P = p.A[seg] + (p.B[seg] - p.A[seg]) * f[:, None]
            T = (p.B[seg] - p.A[seg])[:, :2] / np.maximum(p.L[seg], 1e-9)[:, None]
            Nl = np.stack([-T[:, 1], T[:, 0]], 1)
            hw = 0.5 * (p.w[0] + (p.w[1] - p.w[0]) * s / max(S, 1e-9))
            side = w.get("side", "all")
            if side == "all":
                o0, o1 = -hw - 0.3, hw + 0.3
            else:
                wid = float(w.get("width", 1.0))
                sg = 1.0 if side == "left" else -1.0
                o0, o1 = sg * (hw - wid), sg * (hw + 0.3)
            m = int(math.ceil(float(np.max(np.abs(o1 - o0))) / step)) + 1
            g = np.linspace(0.0, 1.0, m)
            off = o0[:, None] + (o1 - o0)[:, None] * g[None, :]
            X = P[:, None, 0] + Nl[:, None, 0] * off
            Y = P[:, None, 1] + Nl[:, None, 1] * off
            Z = np.repeat((P[:, 2] + float(w.get("depth", 0.25)))[:, None], m, axis=1)
            level = None
        else:
            c = prims[w["chamber"]]
            level = float(w["level"])
            rx, ry = 0.3 * c.sx + 0.6, 0.3 * c.sy + 0.6
            us = np.arange(-rx, rx + step * 0.5, step)
            vs = np.arange(-ry, ry + step * 0.5, step)
            U, Vv = np.meshgrid(us, vs, indexing="ij")
            ux, uy = c.u
            X = c.c[0] + U * ux - Vv * uy
            Y = c.c[1] + U * uy + Vv * ux
            Z = np.full(X.shape, level)
        n0, n1 = X.shape
        G = np.stack([X, Y, Z], -1).reshape(-1, 3)
        air = sec.field_points(G + np.array([0.0, 0.0, 0.02])) > 0.0
        below = np.zeros(len(G), bool)
        for dz in (0.25, 0.5, 0.75, 1.0):
            below |= sec.field_points(G - np.array([0.0, 0.0, dz])) <= 0.0
        ok = ((air & below) if level is None else air).reshape(n0, n1)
        q = ok[:-1, :-1] | ok[1:, :-1] | ok[:-1, 1:] | ok[1:, 1:]
        ii, jj = np.nonzero(q)
        if not len(ii):
            continue
        idx = np.arange(n0 * n1).reshape(n0, n1)
        a, b_, c_, d_ = idx[ii, jj], idx[ii + 1, jj], idx[ii + 1, jj + 1], idx[ii, jj + 1]
        F = np.concatenate([np.stack([a, b_, c_], 1), np.stack([a, c_, d_], 1)])
        e1, e2 = G[F[:, 1]] - G[F[:, 0]], G[F[:, 2]] - G[F[:, 0]]
        up = (e1[:, 0] * e2[:, 1] - e1[:, 1] * e2[:, 0]) >= 0.0
        F[~up] = F[~up][:, ::-1]
        used, inv = np.unique(F.ravel(), return_inverse=True)
        out.append({"id": w["id"], "kind": w.get("kind", "stream"), "level": level, "V": G[used],
                    "F": inv.reshape(-1, 3)})
    return out


def water_light(Vw: np.ndarray, P: np.ndarray, L: np.ndarray, radius: float = 1.25) -> np.ndarray:
    """The light on a water surface from the baked shell beside it: per water vertex, the inverse-square mean of the
    graded light of the shell vertices within radius (the floor under a stream, a basin's walls at its level), so
    the water is lit by the same bake as the rock and needs none of its own. A vertex with none in reach takes the
    nearest one's light within 3 m (else none)."""
    out = np.zeros((len(Vw), 3))
    if not len(Vw) or not len(P):
        return out
    lo, hi = Vw.min(0) - 3.0, Vw.max(0) + 3.0
    keep = np.all((P >= lo) & (P <= hi), axis=1)
    P, L = P[keep], L[keep]
    if not len(P):
        return out
    cell = radius
    key = np.floor(P / cell).astype(np.int64)
    order = np.lexsort((key[:, 2], key[:, 1], key[:, 0]))
    key, P, L = key[order], P[order], L[order]
    uk, start, cnt = np.unique(key, axis=0, return_index=True, return_counts=True)
    table = {tuple(k): (s, s + c) for k, s, c in zip(uk.tolist(), start.tolist(), cnt.tolist())}
    for i, v in enumerate(Vw):
        k0 = np.floor(v / cell).astype(np.int64)
        rows = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    r = table.get((int(k0[0] + dx), int(k0[1] + dy), int(k0[2] + dz)))
                    if r:
                        rows.append(np.arange(*r))
        if rows:
            j = np.concatenate(rows)
            d2 = ((P[j] - v) ** 2).sum(1)
            near = d2 <= radius * radius
            if near.any():
                wgt = 1.0 / np.maximum(d2[near], 0.01)
                out[i] = (L[j][near] * wgt[:, None]).sum(0) / wgt.sum()
                continue
        d2 = ((P - v) ** 2).sum(1)
        j = int(np.argmin(d2))
        if d2[j] <= 9.0:
            out[i] = L[j]
    return out


def water_grey(Lw: np.ndarray) -> np.ndarray:
    """The shell's light on the water as a grey of the same luminance (Rec. 709), so the water keeps WATER's own hue:
    route 3's check found the Bottom's lake teal-green (hue 157 to 171 degrees) under the green-leaning light of
    its flooded rock, where WATER's hue is about 200."""
    Lw = np.asarray(Lw, np.float64).reshape(-1, 3)
    y = 0.2126 * Lw[:, 0] + 0.7152 * Lw[:, 1] + 0.0722 * Lw[:, 2]
    return np.repeat(y[:, None], 3, axis=1)


def water_colour(Lw: np.ndarray, look: dict, E: float, k: float) -> tuple:
    """COLOR_0 for water (no texture: the colour is the light's grey (water_grey) times WATER, times k as the rock's
    is), its display held at or over the ink floor; returns (rows, report)."""
    R = _rb()
    alb = np.tile(hex_lin(WATER), (len(Lw), 1))
    ink_t = (float(R.lum(np.array(INK, float))) + float(look["ink_lift"]["margin_luma"])) / 255.0
    L2 = guard_display(np.maximum(water_grey(Lw), 1e-9))
    low = R.lum(R.agx(E * alb * L2)) < ink_t
    if low.any():
        L2[low] *= R.solve_display(E * alb[low] * L2[low], ink_t, lo=1.0, hi=4096.0, iters=40)[:, None]
    d = R.lum(R.agx(E * alb * L2))
    # every vertex's display d eased to d / (1 + d / WATER_MAX): about d where the water is dim, never over the cap,
    # and still brighter where the light is (a cap alone left a lit stream one flat grey), kept over the ink
    want = np.maximum(d / (1.0 + d / WATER_MAX), ink_t)
    hot = want < d - 1e-6
    if hot.any():
        L2[hot] *= R.solve_display(E * alb[hot] * L2[hot], want[hot], lo=1e-4, hi=1.0, iters=40)[:, None]
    c0, _f, _n = unit_colour(L2 * k * alb)
    disp = R.agx(E * alb * L2)
    rep = {"vertices": int(len(c0)), "display_luma": {f"p{q}": round(float(np.percentile(R.lum(disp), q)), 4)
                                                      for q in (5, 50, 95)} if len(c0) else {},
           "under_ink": int((R.lum(disp) < ink_t - 2e-4).sum()), "lilac_share": round(lilac_share(disp), 6),
           "lifted_to_ink": int(low.sum()), "eased": int(hot.sum())}
    return c0, rep


def water_tree(m) -> None:
    """The water's export tree: an emission of its COLOR_0 alone (no texture), the unlit shape the glTF exporter
    writes as KHR_materials_unlit (as the grille's iron)."""
    nt = m.node_tree
    nt.nodes.clear()
    o_ = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    lp = nt.nodes.new("ShaderNodeLightPath")
    mx = nt.nodes.new("ShaderNodeMixShader")
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = ATTR
    nt.links.new(vc.outputs["Color"], em.inputs["Color"])
    nt.links.new(lp.outputs["Is Camera Ray"], mx.inputs[0])
    nt.links.new(nt.nodes.new("ShaderNodeBsdfTransparent").outputs[0], mx.inputs[1])
    nt.links.new(em.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], o_.inputs["Surface"])


def water_objects(sec, look: dict, E: float, k: float, objs: list) -> tuple:
    """The section's water as meshes, lit from the graded shell beside them (water_light over LIGHT_OUT): (objects,
    report). Not baked, not stitched, not in the collision."""
    surf = water_surfaces(sec)
    if not surf:
        return [], {}
    Ps, Ls = [], []
    for o in objs:
        if o.name not in LIGHT_OUT or o.name.endswith(("_timber", "_kerbs")):
            continue
        co = np.empty(len(o.data.vertices) * 3, np.float32)
        o.data.vertices.foreach_get("co", co)
        Ps.append(co.reshape(-1, 3).astype(np.float64))
        Ls.append(LIGHT_OUT[o.name])
    P = np.concatenate(Ps) if Ps else np.zeros((0, 3))
    L = np.concatenate(Ls) if Ls else np.zeros((0, 3))
    if "cave_water" not in MATS:
        m = bpy.data.materials.new("cave_water")
        m.use_nodes = True
        MATS["cave_water"] = {"mat": m, "scan": "water", "kind": "water"}
    mat = MATS["cave_water"]["mat"]
    obs, rep = [], {}
    for s in surf:
        ob = mesh_object(f"um_{sec.key}_water_{s['id']}", s["V"], s["F"], "cave", mats=[mat])
        c0, r = water_colour(water_light(s["V"], P, L), look, E, k)
        me = ob.data
        a = me.color_attributes.new(ATTR, "FLOAT_COLOR", "POINT")
        rgba = np.ones((len(me.vertices), 4), np.float32)
        rgba[:, :3] = c0
        a.data.foreach_set("color", rgba.ravel())
        area = float(np.abs(np.cross(s["V"][s["F"][:, 1]] - s["V"][s["F"][:, 0]],
                                     s["V"][s["F"][:, 2]] - s["V"][s["F"][:, 0]])[:, 2]).sum() * 0.5)
        rep[s["id"]] = dict(r, kind=s["kind"], triangles=int(len(s["F"])), area_m2=round(area, 1))
        obs.append(ob)
    return obs, rep


def guard_pieces(z: dict, sec, look: dict, out_dir: str) -> list:
    """What the walker sees of the proxies: a rock kerb for a guard 0.15 m thick or more, a timber rail (posts and two
    bars) for a thinner one and round every lake's basin, a plank deck for a bridge."""
    out = []
    kerb_parts, rail_parts, deck_parts = [], [], []
    for gd in sec.d.get("guards", []):
        pts = gd["line"] + ([gd["line"][0]] if gd.get("closed") else [])
        th, h, base = float(gd.get("thickness", 0.12)), float(gd.get("height", 1.0)), float(gd["base_z"])
        for a, b in zip(pts[:-1], pts[1:]):
            L = math.hypot(b[0] - a[0], b[1] - a[1])
            if L < 1e-6:
                continue
            ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
            cx, cy = 0.5 * (a[0] + b[0]), 0.5 * (a[1] + b[1])
            if th >= 0.15:
                kerb_parts.append(box_mesh((cx, cy, base + 0.5 * h), 0.5 * L + 0.5 * th, 0.5 * th, 0.5 * h, ux, uy))
            else:
                for zz in (base + h - 0.04, base + 0.5 * h):
                    rail_parts.append(box_mesh((cx, cy, zz), 0.5 * L + 0.04, 0.04, 0.04, ux, uy))
                n = max(1, int(math.ceil(L / 1.2)))
                for i in range(n + 1):
                    t = i / n
                    rail_parts.append(post_box(sec, a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), base, h,
                                               ux, uy))
    rail_parts += lake_rails(sec)
    for br in sec.d.get("bridges", []):
        x0, y0, x1, y1 = br["box"]
        th = float(br.get("thickness", 0.2))
        deck_parts.append(box_mesh((0.5 * (x0 + x1), 0.5 * (y0 + y1), br["top_z"] - 0.5 * th), 0.5 * (x1 - x0),
                                   0.5 * (y1 - y0), 0.5 * th))
    kits = look["kits"]
    geo = sec.d.get("geology", "limestone")
    kit = kits.get(geo) or kits["default"]
    if kerb_parts:
        V, F = merge(kerb_parts)
        out.append(textured(f"um_{sec.key}_kerbs", V, F, kit["wall"], "#8E887A", look, out_dir))
    if rail_parts or deck_parts:
        V, F = merge(rail_parts + deck_parts)
        out.append(textured(f"um_{sec.key}_timber", V, F, kits["timber"], TIMBER, look, out_dir, repeat=1.2))
    return out


def gate_piece(sec, look: dict, out_dir: str, design_gate: dict | None) -> dict:
    """A gate section's mouth: the grille (iron bars) with its lamp housing, the outcrop face round the mouth's
    opening, a vista beyond it (snow ground, a night backdrop), and the collision plug behind the grille."""
    ports = [p for p in (sec.d.get("portals") or []) if p.get("kind") == "cave_mouth"]
    if not ports:
        return {}
    op = next((o for o in sec.d.get("openings", []) if o["id"].startswith("mouth_")), None)
    if op is None or design_gate is None:
        log("gate: no mouth opening or no gate in design.json; the mouth piece is skipped")
        return {}
    gx = design_gate["grille"]
    (ax_, ay_), (bx_, by_) = gx
    gz = float(design_gate["mouth"][2])
    pa = np.array(ports[0]["at"], float)
    gmid = np.array([0.5 * (ax_ + bx_), 0.5 * (ay_ + by_)])
    inward = pa[:2] - gmid
    inward /= max(np.linalg.norm(inward), 1e-9)
    along = np.array([bx_ - ax_, by_ - ay_])
    W = float(np.linalg.norm(along))
    along /= max(W, 1e-9)
    parts = []
    n = int(round(W / 0.15))
    gtype = design_gate.get("type")
    bar_h = GRILLE_H.get(gtype, 2.1)   # an arch's grille fills the arch, so no one climbs over it
    for i in range(n + 1):
        t = -0.5 * W + i * W / n
        c = (gmid[0] + t * along[0], gmid[1] + t * along[1], gz + 0.5 * bar_h - 0.05)
        parts.append(box_mesh(c, 0.015, 0.015, 0.5 * bar_h, along[0], along[1]))
    rails = (gz + 0.15, gz + 1.0, gz + 1.95) + ((gz + bar_h - 0.15,) if bar_h > 2.2 else ())
    for zz in rails:
        parts.append(box_mesh((gmid[0], gmid[1], zz), 0.5 * W + 0.05, 0.02, 0.025, along[0], along[1]))
    if gtype == "arch":
        # the narrow iron door at the portal: two heavy stiles, its own rails and a lock box
        tp = float(np.dot(pa[:2] - gmid, along))
        for sgn in (-1.0, 1.0):
            c = (gmid[0] + (tp + sgn * 0.45) * along[0], gmid[1] + (tp + sgn * 0.45) * along[1], gz + 1.0)
            parts.append(box_mesh(c, 0.035, 0.03, 1.05, along[0], along[1]))
        for zz in (gz + 0.5, gz + 1.5, gz + 2.05):
            c = (gmid[0] + tp * along[0], gmid[1] + tp * along[1], zz)
            parts.append(box_mesh(c, 0.45, 0.03, 0.03, along[0], along[1]))
        c = (gmid[0] + (tp + 0.33) * along[0] + 0.05 * inward[0], gmid[1] + (tp + 0.33) * along[1] + 0.05 * inward[1],
             gz + 1.05)
        parts.append(box_mesh(c, 0.06, 0.03, 0.08, along[0], along[1]))
    V, F = merge(parts)
    iron = bpy.data.materials.new("cave_iron")
    iron.use_nodes = True
    bake_tree(iron)
    MATS[iron.name] = {"mat": iron, "kind": "flat", "colour": hex_lin(look["iron"])}
    grille = mesh_object(f"um_{sec.key}_grille", V, F, "cave", mats=[iron])
    set_point_colour(grille, TINT_ATTR, np.tile(hex_lin(look["iron"]), (len(grille.data.vertices), 1)))
    # the lamp: a glass on the cave side above the grille, lit (an emitter at the look's lamp glass colour), under
    # an iron cap, on an iron base and a bracket back to the grille's top rail; the bake's lamp stands inside it
    lamp_at = np.array([gmid[0] + 0.25 * inward[0], gmid[1] + 0.25 * inward[1], gz + 2.05])
    hv, hf = box_mesh(tuple(lamp_at), 0.07, 0.07, 0.09, along[0], along[1])
    glass_c = np.array(look["lamp"]["glass_emit"], float)
    glass = flat_material("cave_lamp_glass", glass_c, emit=False)
    MATS[glass.name] = {"mat": glass, "kind": "emit_raw", "colour": glass_c}
    housing = mesh_object(f"um_{sec.key}_lamp", hv, hf, "cave", mats=[glass])
    EXPORT_ONLY.append(housing)   # drawn in the GLB, hidden from the bake
    ip = [box_mesh((lamp_at[0], lamp_at[1], lamp_at[2] + 0.115), 0.1, 0.1, 0.025, along[0], along[1]),
          box_mesh((lamp_at[0], lamp_at[1], lamp_at[2] + 0.155), 0.05, 0.05, 0.02, along[0], along[1]),
          box_mesh((lamp_at[0], lamp_at[1], lamp_at[2] - 0.105), 0.085, 0.085, 0.015, along[0], along[1]),
          box_mesh((gmid[0] + 0.125 * inward[0], gmid[1] + 0.125 * inward[1], gz + 1.95), 0.015, 0.125, 0.015,
                   along[0], along[1]),
          box_mesh((lamp_at[0], lamp_at[1], 0.5 * (gz + 1.95 + lamp_at[2] - 0.12)), 0.015, 0.015,
                   0.5 * (lamp_at[2] - 0.12 - gz - 1.95) + 0.015, along[0], along[1])]
    iv, if_ = merge(ip)
    iron_c = np.array(look["lamp"]["iron_emit"], float)
    lamp_iron = flat_material("cave_lamp_iron", iron_c, emit=False)
    MATS[lamp_iron.name] = {"mat": lamp_iron, "kind": "emit_raw", "colour": iron_c}
    lamp_frame = mesh_object(f"um_{sec.key}_lamp_iron", iv, if_, "cave", mats=[lamp_iron])
    EXPORT_ONLY.append(lamp_frame)
    # the outcrop face: on the mouth box's outer face, with holes where the shell's air meets it; rows of rock
    # cells merged into quads up to 1 m long (it closes the mouth to the bake's sky but round its opening)
    ob_ = op["box"]
    fr = mouth_frame(ob_, pa, gx)
    ax, ua, plane = fr["axis"], fr["u_axis"], fr["plane"]
    us = np.arange(fr["u"][0], fr["u"][1] + 1e-9, 0.125)
    zs = np.arange(ob_[2] - 1.5, ob_[5] + 3.0 + 1e-9, 0.125)
    Ug, Zg = np.meshgrid(us, zs, indexing="ij")
    P = np.zeros((Ug.size, 3))
    P[:, ax] = plane + 0.2 * fr["sign"]
    P[:, ua] = Ug.ravel()
    P[:, 2] = Zg.ravel()
    air = (sec.field_points(P) > 0).reshape(Ug.shape)
    rock = ~(air[:-1, :-1] | air[1:, :-1] | air[:-1, 1:] | air[1:, 1:])
    if gtype == "adit":
        # the headwall: dry stone up to the ground behind it, and its parapet over the cutting's width
        cut = design_gate.get("cutting", {})
        th_ = float(cut.get("wall_thick", 0.55))
        ucut = (gmid[ua] - 0.5 * W - th_, gmid[ua] + 0.5 * W + th_)
        top = gz + float(cut.get("wall_h", 3.5))
        uc = 0.5 * (us[:-1] + us[1:])
        zc = 0.5 * (zs[:-1] + zs[1:])
        cap = np.where((uc >= ucut[0]) & (uc <= ucut[1]), top + float(cut.get("parapet_h", 1.0)), top)
        rock &= zc[None, :] <= cap[:, None]
    Vo, Fo = [], []

    def pt(u, z, w=plane):
        q = [0.0, 0.0, z]
        q[ax], q[ua] = w, u
        return q

    for u0, u1, z0, z1 in outcrop_strips(rock, us, zs):
        b_ = len(Vo)
        Vo += [pt(u0, z0), pt(u1, z0), pt(u1, z1), pt(u0, z1)]
        Fo += [(b_, b_ + 1, b_ + 2), (b_, b_ + 2, b_ + 3)]
    outn = np.array([fr["out"][0], fr["out"][1], 0.0])
    out = {"grille": grille, "lamp_housing": housing, "lamp_iron": lamp_frame, "lamp_at": lamp_at.tolist(),
           "plug": None}
    if Vo:
        Vo = np.array(Vo)
        mk = look["kits"][mouth_kit_name(look["kits"], design_gate)]
        out["outcrop"] = textured(f"um_{sec.key}_outcrop", Vo, facing(Vo, Fo, outn), mk["wall"],
                                  "#6E6A60", look, out_dir, repeat=2.0)
    # the vista: snow ground in front of the face and a backdrop of night sky
    g0 = float(ob_[2]) + 0.1
    R = 40.0
    cu = 0.5 * (ob_[ua] + ob_[3 + ua])
    far = plane + fr["sign"] * R
    if gtype == "adit":
        sv, sf = cutting_ground(fr, gmid, W, gz, design_gate.get("cutting", {}), R)
    else:
        sv = np.array([pt(cu - R, g0), pt(cu + R, g0), pt(cu + R, g0 - 1.5, far), pt(cu - R, g0 - 1.5, far)])
        sf = [(0, 1, 2), (0, 2, 3)]
    snow = textured(f"um_{sec.key}_vista_snow", sv, facing(sv, sf, (0, 0, 1)),
                    look["kits"]["snow"], look["sky"]["snow"], look, out_dir, repeat=3.0)
    out["extras"], out["extra_coll"] = gate_extras(sec, look, out_dir, design_gate, fr, gz, gmid, inward, along, W)
    bd = hex_lin(look["sky"]["backdrop_display"])
    back = flat_material("cave_vista_sky", bd)
    MATS[back.name] = {"mat": back, "kind": "emit", "display": bd}
    bv = np.array([pt(cu - R, g0 - 2.0, far), pt(cu + R, g0 - 2.0, far), pt(cu + R, g0 + 30.0, far),
                   pt(cu - R, g0 + 30.0, far)])
    sky = mesh_object(f"um_{sec.key}_vista_sky", bv, facing(bv, [(0, 1, 2), (0, 2, 3)], -outn), "cave", mats=[back])
    EXPORT_ONLY.append(sky)   # the world's sky lights the bake; the backdrop is drawn only in the GLB
    out.update(snow=snow, sky=sky)
    # the collision plug just behind the grille (away from the cave side)
    pc = (gmid[0] - (GRILLE_PLUG * 0.5 + 0.02) * inward[0], gmid[1] - (GRILLE_PLUG * 0.5 + 0.02) * inward[1], gz + 1.3)
    out["plug"] = box_mesh(pc, 0.5 * W + 0.6, 0.5 * GRILLE_PLUG, 2.0, along[0], along[1])
    return out


def cutting_ground(fr: dict, gmid, W: float, gz: float, cut: dict, R: float) -> tuple:
    """The Adit Gate's cutting as the walker sees it through the grille: the landing and the ramp between the walls,
    the trail's level beyond, and the ground either side, which falls from the headwall's top to the trail as the
    walls do (design.json's adit_cut: a level landing to the ramp's foot, a 15 degree ramp up to the outlaws' trail,
    walls from nothing at the trail to wall_h at the headwall). Returns (V, F), quads as triangle pairs."""
    ax, ua, sg = fr["axis"], fr["u_axis"], fr["sign"]
    face = fr["plane"]
    land = float(cut.get("landing_m", 2.5))
    ramp = float(cut.get("ramp_m", 6.7))
    rise = float(cut.get("rise_m", 1.79))
    wall_h = float(cut.get("wall_h", 3.5))
    th = float(cut.get("wall_thick", 0.55))
    u0, u1 = float(gmid[ua]) - 0.5 * W, float(gmid[ua]) + 0.5 * W
    w_foot, w_top = face + sg * land, face + sg * (land + ramp)

    def P(w, u, z):
        q = [0.0, 0.0, z]
        q[ax], q[ua] = w, u
        return q

    def ground(w):
        t = min(max((w - face) * sg / (land + ramp), 0.0), 1.0)
        return gz + wall_h + t * (rise - wall_h)

    V, F = [], []

    def quad(a, b, c, d):
        n = len(V)
        V.extend([a, b, c, d])
        F.extend([(n, n + 1, n + 2), (n, n + 2, n + 3)])

    quad(P(face, u0, gz), P(face, u1, gz), P(w_foot, u1, gz), P(w_foot, u0, gz))
    quad(P(w_foot, u0, gz), P(w_foot, u1, gz), P(w_top, u1, gz + rise), P(w_top, u0, gz + rise))
    far = face + sg * R
    quad(P(w_top, u0 - R, gz + rise), P(w_top, u1 + R, gz + rise), P(far, u1 + R, gz + rise - 1.0),
         P(far, u0 - R, gz + rise - 1.0))
    for ua_, ub_ in ((u0 - R, u0 - th), (u1 + th, u1 + R)):
        quad(P(face, ua_, ground(face)), P(face, ub_, ground(face)), P(w_top, ub_, ground(w_top)),
             P(w_top, ua_, ground(w_top)))
    return np.array(V, float), F


def gate_extras(sec, look: dict, out_dir: str, gate_d: dict, fr: dict, gz: float, gmid, inward, along, W: float):
    """A gate type's own pieces, baked like the shell, and their collision: the Adit Gate's timber sets and its
    cutting's dry-stone walls with their parapets; the Old Rising Gate's icicle fringe, the ravine's walls and the
    broken trestle over the ravine. Returns (objects, collision parts)."""
    t = gate_d.get("type")
    kits = look["kits"]
    objs, coll = [], []
    ax, ua, sg = fr["axis"], fr["u_axis"], fr["sign"]
    inw = np.array([inward[0], inward[1], 0.0])
    alo = np.array([along[0], along[1], 0.0])
    g2 = np.array([gmid[0], gmid[1], gz])
    face = fr["plane"]
    if t == "adit":
        cut = gate_d.get("cutting", {})
        # three box-built sets (two posts and a cap each): the first just inside the grille, then every 1.2 m
        posts, caps_ = [], []
        clear = float(cut.get("set_h", 2.15))
        for k in range(3):
            c = g2 + (0.17 + 1.2 * k) * inw
            for sgn in (-1.0, 1.0):
                pc = c + sgn * (0.5 * W - 0.12) * alo + np.array([0, 0, 0.5 * clear])
                posts.append(box_mesh(tuple(pc), 0.1, 0.1, 0.5 * clear, inward[0], inward[1]))
            caps_.append(box_mesh(tuple(c + np.array([0, 0, clear + 0.1])), 0.11, 0.5 * W + 0.05, 0.1,
                                  inward[0], inward[1]))
        coll += posts
        V, F = merge(posts + caps_)
        objs.append(textured(f"um_{sec.key}_portal_timber", V, F, kits["timber"], TIMBER, look, out_dir,
                             repeat=1.2))
        # the cutting's dry-stone walls with their parapets, from the headwall's face out to the trail
        land = float(cut.get("landing_m", 2.5))
        ramp = float(cut.get("ramp_m", 6.7))
        rise = float(cut.get("rise_m", 1.79))
        wall_h = float(cut.get("wall_h", 3.5))
        par = float(cut.get("parapet_h", 1.0))
        th = float(cut.get("wall_thick", 0.55))
        L = land + ramp
        wp = []
        for sgn in (-1.0, 1.0):
            uc = float(gmid[ua]) + sgn * (0.5 * W + 0.5 * th)
            Vw = []
            for w_, ztop in ((face, gz + wall_h + par), (face + sg * L, gz + rise + 0.25)):
                for du in (-0.5 * th, 0.5 * th):
                    for zz in (gz - 0.3, ztop):
                        q = [0.0, 0.0, zz]
                        q[ax], q[ua] = w_, uc + du
                        Vw.append(q)
            # vertices: (face | trail end) x (u- | u+) x (foot | top), index 4 * iw + 2 * iu + iz
            Fw = [(0, 1, 3), (0, 3, 2), (4, 6, 7), (4, 7, 5), (0, 4, 5), (0, 5, 1), (2, 3, 7), (2, 7, 6),
                  (0, 2, 6), (0, 6, 4), (1, 5, 7), (1, 7, 3)]
            wp.append((np.array(Vw, float), np.array(Fw)))
        V, F = merge(wp)
        objs.append(textured(f"um_{sec.key}_vista_walls", V, facing_out(V, F),
                             kits[mouth_kit_name(kits, gate_d)]["wall"], "#7E7A70", look, out_dir, repeat=1.5))
    elif t == "arch":
        # the icicle fringe on the arch's lip, just outside the grille: cones hung from the roof the field finds
        rng = np.random.default_rng(20261121)
        cones = []
        n = int(W / 0.22)
        for i in range(n):
            u = -0.5 * W + (i + 0.5) * W / n + rng.uniform(-0.06, 0.06)
            base = g2 + u * alo - (0.25 + rng.uniform(0.0, 0.35)) * inw
            zz = np.arange(gz + 1.2, gz + 6.0, 0.05)
            Pz = np.tile(base, (len(zz), 1))
            Pz[:, 2] = zz
            rk = np.nonzero(sec.field_points(Pz) <= 0)[0]
            if not len(rk):
                continue
            top = float(zz[rk[0]]) + 0.05
            ln = float(rng.uniform(0.15, 0.7)) * (1.0 if abs(u) < 0.5 * W - 0.4 else 0.5)
            cones.append(cone_mesh((base[0], base[1], top), 0.03 + 0.05 * ln, ln, 5))
        if cones:
            V, F = merge(cones)
            objs.append(textured(f"um_{sec.key}_icicles", V, F, kits["ice"]["wall"], "#C9D3DB", look, out_dir,
                                 repeat=1.0))
        # the ravine's walls either side, running out from the headwall
        rw = []
        for sgn in (-1.0, 1.0):
            uw = float(gmid[ua]) + sgn * 7.0
            Vr = []
            for w_ in (face + sg * 0.5, face + sg * 30.0):
                for zz in (gz - 2.0, gz + 14.0):
                    q = [0.0, 0.0, zz]
                    q[ax], q[ua] = w_, uw
                    Vr.append(q)
            rw.append((np.array(Vr, float), np.array([(0, 1, 3), (0, 3, 2)])))
        V, F = merge(rw)
        F = facing_point(V, F, g2 - 8.0 * inw + np.array([0, 0, 2.0]))
        objs.append(textured(f"um_{sec.key}_vista_ravine", V, F, kits[mouth_kit_name(kits, gate_d)]["wall"],
                             "#8A857A", look, out_dir, repeat=3.0))
        # the broken trestle across the ravine: two bents (the far one has lost a leg), a snapped stringer hanging
        tp = []
        deck = gz + 7.0
        for k, w_ in enumerate((6.0, 12.0)):
            c = g2 - w_ * inw
            for sgn in (-1.0, 1.0):
                if k == 1 and sgn > 0:
                    continue
                leg = c + sgn * 2.2 * alo + np.array([0, 0, 0.5 * (deck - gz + 2.0) - 2.0])
                tp.append(box_mesh(tuple(leg), 0.15, 0.15, 0.5 * (deck - gz + 2.0), along[0], along[1]))
            tp.append(box_mesh(tuple(c + np.array([0, 0, deck - gz])), 2.6, 0.18, 0.15, along[0], along[1]))
        tp.append(box_mesh(tuple(g2 - 9.0 * inw - 1.6 * alo + np.array([0, 0, deck - gz + 0.3])), 3.3, 0.12, 0.15,
                           -inward[0], -inward[1]))
        tp.append(box_mesh(tuple(g2 - 8.0 * inw + 1.6 * alo + np.array([0, 0, deck - gz - 0.8])), 2.4, 0.12, 0.15,
                           -inward[0] * 0.9, -inward[1] * 0.9 + 0.1))
        V, F = merge(tp)
        objs.append(textured(f"um_{sec.key}_vista_trestle_timber", V, F, kits["timber"], TIMBER, look, out_dir,
                             repeat=1.2))
    return objs, coll


def cone_mesh(top, r: float, length: float, n: int = 5) -> tuple:
    """A cone hanging down (an icicle): a ring of n points at `top`'s height, its tip `length` below."""
    cx, cy, cz = top
    V = [[cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n), cz] for i in range(n)]
    V.append([cx, cy, cz - length])
    return np.array(V, float), np.array([(i, n, (i + 1) % n) for i in range(n)])


def facing_out(V: np.ndarray, F) -> np.ndarray:
    """Winds each box's faces outward (every 12 faces are one closed box)."""
    F = np.asarray(F).copy()
    for b in range(0, len(F), 12):
        c = V[np.unique(F[b:b + 12])].mean(0)
        for i in range(b, b + 12):
            a, b_, d = V[F[i, 0]], V[F[i, 1]], V[F[i, 2]]
            if np.dot(np.cross(b_ - a, d - a), (a + b_ + d) / 3.0 - c) < 0:
                F[i] = F[i, [0, 2, 1]]
    return F


def facing_point(V: np.ndarray, F, p) -> np.ndarray:
    """Winds each face towards a point."""
    F = np.asarray(F).copy()
    for i in range(len(F)):
        a, b_, d = V[F[i, 0]], V[F[i, 1]], V[F[i, 2]]
        if np.dot(np.cross(b_ - a, d - a), np.asarray(p) - a) < 0:
            F[i] = F[i, [0, 2, 1]]
    return F


def caps(sec, mouth_ids: set) -> list:
    """Black occluders over every opening that is not a mouth (seam stubs' far ends, ink caps): the bake's rays meet
    rock there, not the world's sky."""
    black = bpy.data.materials.get("cave_occluder") or flat_material("cave_occluder", (0.0, 0.0, 0.0))
    out = []
    mouth = [o["box"] for o in sec.d.get("openings", []) if o["id"] in mouth_ids]
    for i, ob_ in enumerate(sec.openings):
        if any(np.allclose(ob_, m) for m in mouth):
            continue
        b = np.array(ob_, float)
        size = b[3:] - b[:3]
        thin = int(np.argmin(size))
        c = 0.5 * (b[:3] + b[3:])
        half = 0.5 * size + 0.3
        half[thin] = 0.02
        V = np.array([[c[0] + sx * half[0], c[1] + sy * half[1], c[2] + sz * half[2]]
                      for sz in (-1, 1) for sy in (-1, 1) for sx in (-1, 1)])
        _, F = box_mesh((0, 0, 0), 1, 1, 1)
        o = mesh_object(f"um_{sec.key}_cap_{i}", V, F, "bake_only", mats=[black])
        out.append(o)
        BAKE_ONLY.append(o)
    return out


def collision_object(z: dict, aid: str, extra_parts: list):
    Cv = z["coll_verts_q"] / core.Q
    Cf = z["coll_faces"].astype(np.int64)
    Pv = z["proxy_verts_q"] / core.Q
    Pf = z["proxy_faces"].astype(np.int64)
    V, F = merge([(Cv, Cf), (Pv, Pf)] + [p for p in extra_parts if p is not None])
    ob = mesh_object(f"HM_Collision_{aid}", V, F, "nodes")
    ob.data.name = f"HM_Collision_{aid}"
    ob["wdi_collision"] = True
    return ob, int(len(F))


def empties(nodes: dict, area_ob) -> list:
    out = []
    for s in nodes["spawns"]:
        e = bpy.data.objects.new(s["name"], None)
        COL["nodes"].objects.link(e)
        e.location = s["at"]
        e.rotation_euler = (0.0, 0.0, math.radians(s["yaw_deg"]))
        for k, v in s["extras"].items():
            e[k] = v
        e.parent = area_ob
        out.append(e)
    for p in nodes["portals"]:
        e = bpy.data.objects.new(p["name"], None)
        COL["nodes"].objects.link(e)
        e.location = p["at"]
        for k, v in p["extras"].items():
            e[k] = v
        e.parent = area_ob
        out.append(e)
    for zz in nodes["zones"]:
        e = bpy.data.objects.new(zz["name"], None)
        COL["nodes"].objects.link(e)
        e.empty_display_type = "CUBE"
        M = Matrix([list(r) for r in zz["basis"]]).to_4x4()
        M.translation = Vector(zz["at"])
        e.matrix_world = M
        e["wdi_traverse"] = zz["extras"]["wdi_traverse"]
        e["size"] = zz["extras"]["size"]
        e.parent = area_ob
        e.matrix_parent_inverse = Matrix.Identity(4)
        out.append(e)
    return out


# ---------------------------------------------------------------- light


def light(name: str, at, colour_lin, watts: float, radius: float):
    ld = bpy.data.lights.new(name, "POINT")
    ld.energy = float(watts)
    ld.color = tuple(float(c) for c in colour_lin)
    ld.shadow_soft_size = float(radius)
    o = bpy.data.objects.new(name, ld)
    COL["bake_only"].objects.link(o)
    o.location = at
    return o


def rig(sec, look: dict, gate: dict) -> dict:
    groups = {"lamp": [], "sky": [], "fill": []}
    if gate.get("lamp_at"):
        groups["lamp"].append(light("Bake_lamp_gate", gate["lamp_at"], hex_lin(look["lamp"]["colour"]),
                                    look["lamp"]["watts"], look["lamp"]["radius_m"]))
    for f in fill_points(sec.d, look):
        groups["fill"].append(light(f"Bake_{f['id']}", f["at"], hex_lin(look["fill"]["colour"]), f["watts"],
                                    look["fill"]["radius_m"]))
    sc = bpy.context.scene
    w = bpy.data.worlds.new("cave_sky")
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (*hex_lin(look["sky"]["colour"]), 1.0)
    bg.inputs["Strength"].default_value = float(look["sky"]["strength"]) if gate else 0.0
    sc.world = w
    return groups


def bake_groups(objs: list, samples: int, hide: list, groups: dict, has_sky: bool) -> tuple:
    """One bake per group (the others off), as meshy_room_build's run_bake_groups does for the room's groups."""
    R = _rb()
    sc = bpy.context.scene
    bg = sc.world.node_tree.nodes["Background"]
    ws = bg.inputs["Strength"].default_value
    allL = [o for g in groups.values() for o in g]
    energy = {o.name: o.data.energy for o in allL}
    out = {o.name: {} for o in objs}
    secs = {}
    for g in ("lamp", "sky", "fill"):
        if g == "sky" and not has_sky:
            continue
        if g != "sky" and not groups[g]:
            continue
        for o in allL:
            o.data.energy = energy[o.name] if o in groups.get(g, []) else 0.0
        bg.inputs["Strength"].default_value = ws if g == "sky" else 0.0
        t = R.run_bake(objs, samples, hide)
        secs[g] = round(t, 1)
        log(f"baked group {g} at {samples} samples in {t:.1f} s")
        for o in objs:
            out[o.name][g] = R.read_attr(o)
    for o in allL:
        o.data.energy = energy[o.name]
    bg.inputs["Strength"].default_value = ws
    return out, secs


def quick_groups(objs: list, groups: dict) -> dict:
    """--no-bake: an unshadowed stand-in per group (inverse square, cosine), for smoke runs and the first stills."""
    out = {}
    for o in objs:
        me = o.data
        n = len(me.vertices)
        co = np.empty(n * 3, np.float32)
        me.vertices.foreach_get("co", co)
        nr = np.empty(n * 3, np.float32)
        me.vertices.foreach_get("normal", nr)
        co, nr = co.reshape(-1, 3).astype(np.float64), nr.reshape(-1, 3).astype(np.float64)
        d_ = {}
        for g, ls in groups.items():
            L = np.zeros((n, 3))
            for lo in ls:
                d = np.array(lo.location) - co
                r2 = np.maximum((d * d).sum(1), 0.04)
                cosv = np.clip((d * nr).sum(1) / np.sqrt(r2), 0.0, 1.0)
                L += (lo.data.energy / (4 * math.pi) * cosv / r2 / math.pi)[:, None] * np.array(lo.data.color)[None, :]
            d_[g] = L.astype(np.float32)
        out[o.name] = d_
    return out


def lamp_pool_E(objs: list, L: dict, lamp_at, look: dict) -> float | None:
    """The scene exposure at which the lamp's pool (the lit rock within radius_m) shows at `display` at its
    `percentile`, with each vertex's own albedo: the cave look's anchor."""
    R = _rb()
    if lamp_at is None:
        return None
    lp = look["lamp_pool"]
    rows = []
    for o in objs:
        if o.name not in TEXFAC or "_form_" in o.name:   # the pool on the rock round it (route 1), not on formations
            continue
        co = np.empty(len(o.data.vertices) * 3, np.float32)
        o.data.vertices.foreach_get("co", co)
        co = co.reshape(-1, 3)
        near = np.linalg.norm(co - np.array(lamp_at)[None, :], axis=1) < lp["radius_m"]
        if near.any():
            rows.append((L[o.name][near], MEANALB[o.name][near]))
    if not rows:
        return None
    Ls = np.concatenate([r[0] for r in rows])
    As = np.concatenate([r[1] for r in rows])
    y = R.lum(Ls * As)
    i = int(np.argsort(y)[min(len(y) - 1, int(len(y) * lp["percentile"] / 100.0))])
    return float(R.solve_display((Ls[i] * As[i])[None, :], lp["display"])[0])


def lamp_weight(objs: list, groups: dict, lamp_at, look: dict, E: float) -> float:
    """The factor (at most 1) on a gate's lamp group so its pool shows no brighter than the look's lamp_pool display
    at the network's E: the largest w with lamp_pool_E(w x lamp + sky + fill) >= E. 1 when there is no lamp or the
    pool is already at or under it (the Swallow's, which set E)."""
    if lamp_at is None:
        return 1.0

    def pool_E(w: float):
        L = {o.name: sum((w if gg == "lamp" else 1.0) * np.asarray(v, np.float64) for gg, v in groups[o.name].items()
                         if gg != "ao") for o in objs}
        return lamp_pool_E(objs, L, lamp_at, look)

    e1 = pool_E(1.0)
    if e1 is None or e1 >= E:
        return 1.0
    lo, hi = -8.0, 0.0   # log2 w: lo dim enough, hi too bright
    if (pool_E(2.0 ** lo) or 0.0) < E:
        return 2.0 ** lo
    for _ in range(24):
        mid = 0.5 * (lo + hi)
        if (pool_E(2.0 ** mid) or 0.0) >= E:
            lo = mid
        else:
            hi = mid
    return float(2.0 ** lo)


def unit_colour(c0: np.ndarray) -> tuple:
    """COLOR_0 rows scaled down, hue kept, where a channel passes 1 (the glTF export clips each channel at 1, which
    turned blue-lit snow and lamp-lit wood cream). Returns the rows, the per-row factor and how many were scaled."""
    c0 = np.asarray(c0, dtype=np.float64)
    m = c0.max(axis=1) if len(c0) else np.zeros(0)
    f = np.where(m > 1.0, 1.0 / np.maximum(m, 1e-12), 1.0)
    return c0 * f[:, None], f, int((f < 1.0).sum())


def hot_of(name: str, look: dict) -> tuple:
    """(knee, max) of the display easing for a piece: timber has its own (look hot.timber), the rest the look's."""
    h = look["hot"]
    if name.endswith("_timber") and "timber" in h:
        return float(h["timber"]["knee"]), float(h["timber"]["max"])
    return float(h["knee"]), float(h["max"])


def floor_shape(have: np.ndarray, Lf: np.ndarray, open_sky: np.ndarray, il: dict) -> np.ndarray:
    """The ink floor's multiplier m (>= 1) per row: 1 + form x the AO term x (form_base + (1 - form_base) x s), where s
    = x / (1 + x) and x the baked light over shape_ref x the floor's light. So the floor itself carries the bake's
    shape: a crevice (no AO) or rock far from every light sits on the bare floor (its darkest texel at ink), rock where
    the fill, the sky or a lamp lands rises up to 1 + form. form_base 1 is route 3's flat term (1 + form x the AO
    term), whatever the bake."""
    form, form_ao, fg = float(il["form"]), float(il["form_ao"]), float(il["form_gamma"])
    base = float(il.get("form_base", 1.0))
    ref = float(il.get("shape_ref", 1.0))
    x = np.asarray(have, np.float64) / np.maximum(ref * np.asarray(Lf, np.float64), 1e-12)
    s = x / (1.0 + x)
    return 1.0 + form * ((1.0 - form_ao) + form_ao * open_sky ** fg) * (base + (1.0 - base) * s)


def post_rows(L: np.ndarray, dark: np.ndarray, alb: np.ndarray, ratio, E: float, ink_t: float, hot_knee=None,
              hot_max=None) -> tuple:
    """The grade's last steps on rows of light (N x 3, linear): the lilac and teal guards, the darkest texel lifted
    to the ink where it would show under it, and (with hot_knee and hot_max) the highlights eased. Returns (the light,
    how many were eased)."""
    R = _rb()
    L2 = guard_texels(guard_display(np.asarray(L, np.float64)), ratio)
    low = R.lum(R.agx(E * dark * L2)) < ink_t - 2e-4
    if low.any():
        L2[low] *= R.solve_display(E * dark[low] * L2[low], ink_t, lo=1.0, hi=64.0, iters=30)[:, None]
    n_over = 0
    if hot_knee is not None:
        d = R.lum(R.agx(E * alb * L2))
        over = d > hot_knee
        n_over = int(over.sum())
        if over.any():
            want = hot_knee + (hot_max - hot_knee) * np.tanh((d[over] - hot_knee) / (hot_max - hot_knee))
            L2[over] *= R.solve_display(E * alb[over] * L2[over], want, lo=1e-3, hi=1.0, iters=30)[:, None]
    return L2, n_over


def grade_rows(L: np.ndarray, open_sky: np.ndarray, dark: np.ndarray, alb: np.ndarray, ratio, look: dict, E: float,
               hot_knee: float, hot_max: float) -> tuple:
    """The grade of rows of light (N x 3, the groups by weight, denoised; open_sky the AO's open share, N): AO, the
    ink floor on the display (meshy_room_build's solve_display through three r186's AgX) shaped by the bake
    (floor_shape), then post_rows (the lilac and teal guards, the floor again, highlights eased). dark and alb are the
    rows' darkest kept texel and albedo (N x 3, linear), ratio their pinkest and bluest texel (N x 2) or None. Returns
    (the graded light N x 3, info: below_floor (the bake under the floor's light), at_floor (rows the shape lifts by
    under 2 %), hot_eased, the display of the mean texel after and before, and L1, the light before post_rows). The
    vertices and the lightmap's texels go through this."""
    R = _rb()
    il = look["ink_lift"]
    ink_t = (float(R.lum(np.array(INK, float))) + float(il["margin_luma"])) / 255.0
    fl_n = hex_lin(look["fill"]["colour"])
    fl_n = fl_n / R.lum(fl_n)
    aoc = look["ao"]
    L = np.asarray(L, np.float64)
    open_sky = np.ones(len(L)) if open_sky is None else np.clip(np.asarray(open_sky, np.float64), 0.0, 1.0)
    if aoc:
        open_sky = open_sky ** float(aoc["gamma"])
        L = L * (1.0 - aoc["strength"] + aoc["strength"] * open_sky)[:, None]
    L = guard_display(L)
    have = R.lum(L)
    chroma = np.where((have > 1e-9)[:, None], L / np.maximum(have, 1e-12)[:, None], fl_n[None, :])
    Lf = R.solve_display(E * dark * fl_n[None, :], ink_t)
    m = floor_shape(have, Lf, open_sky, il)
    L1 = np.sqrt((chroma * have[:, None]) ** 2 + (fl_n[None, :] * (Lf * m)[:, None]) ** 2)
    L2, n_over = post_rows(L1, dark, alb, ratio, E, ink_t, hot_knee, hot_max)
    info = {"below_floor": int((have < Lf).sum()), "at_floor": int((m < 1.02).sum()), "hot_eased": n_over,
            "disp": R.lum(R.agx(E * alb * L2)), "rawd": R.lum(R.agx(E * alb * np.maximum(L, 1e-12))), "L1": L1, "m": m,
            "bare": R.lum(R.agx(E * alb * fl_n[None, :] * Lf[:, None]))}
    return L2, info


def grade(objs: list, groups: dict, ao: dict | None, look: dict, E: float, no_bake: bool, skip=()) -> dict:
    """The cave's post bake: denoise, the groups by weight, then grade_rows; COLOR_0 = k x light x the per-material
    factor, with k = E / wdi_exposure (the network's exposure is fixed). Objects in `skip` (the lightmapped shell,
    whose own grade is lm_grade's) are graded for their vertices too (the seams' stitch and the checks use them)."""
    R = _rb()
    we = float(look["wdi_exposure"])
    k = E / we
    il = look["ink_lift"]
    ink_t = (float(R.lum(np.array(INK, float))) + float(il["margin_luma"])) / 255.0
    wts = look["weights"]
    rep = {"E": E, "k": k, "wdi_exposure": we, "ink_target_luma": round(ink_t * 255, 2), "vertices": 0,
           "below_floor": 0, "hot_eased": 0, "max_color0": 0.0, "color0_scaled": 0}
    for o in objs:
        if o.name not in TEXFAC:
            continue
        hot_knee, hot_max = hot_of(o.name, look)
        gs = groups[o.name]
        L = sum(float(wts.get(g, 1.0)) * np.asarray(v, np.float64) for g, v in gs.items() if g != "ao")
        if not isinstance(L, np.ndarray):
            L = np.zeros((len(o.data.vertices), 3))
        if not no_bake and o.name not in skip:
            L = R.denoise(o, L.astype(np.float32)).astype(np.float64)
        osky = ao[o.name] if (ao is not None and o.name in ao) else None
        L2, info = grade_rows(L, osky, DARK[o.name], MEANALB[o.name], RATIO.get(o.name), look, E, hot_knee, hot_max)
        rep["hot_eased"] += info["hot_eased"]
        rep["vertices"] += len(L2)
        rep["below_floor"] += info["below_floor"]
        DISP.append(info["disp"])
        RAWD.append(info["rawd"])
        c0 = L2 * k * TEXFAC[o.name] * MEANALB[o.name]   # texture x COLOR_0 ~ k L albedo
        rep["max_color0"] = max(rep["max_color0"], float(c0.max()))
        c0, f, n_ = unit_colour(c0)
        rep["color0_scaled"] += n_
        L2 = L2 * f[:, None]   # the light as the file will show it
        R.write_attr(o, c0.astype(np.float32))
        LIGHT_OUT[o.name] = L2
    rep["below_floor_share"] = round(rep["below_floor"] / max(rep["vertices"], 1), 4)
    if DISP:
        dd, rd = np.concatenate(DISP), np.concatenate(RAWD)
        rep["display_mean_texel"] = {f"p{q}": round(float(np.percentile(dd, q)), 4) for q in (5, 25, 50, 75, 95)}
        rep["display_before_floor"] = {f"p{q}": round(float(np.percentile(rd, q)), 4) for q in (5, 25, 50, 75, 95)}
    return rep


DISP: list = []
RAWD: list = []


LIGHT_OUT: dict = {}
SEAM_DARK: dict = {}  # object name -> per-vertex darkest texel the stitch floored with (the lesser of both files')
SEAM_BAND = 1.0   # metres each side of a seam plane over which the two files' graded light is blended


def seam_planes(sec_d: dict, built: set) -> list:
    """(seam id, axis, plane, sign) for each seam whose neighbour is built; sign +1 when the neighbour lies on +."""
    out = []
    for sm in sec_d.get("seams", []):
        if sm["neighbour"] in built:
            out.append((sm["id"], 0 if sm["plane"]["axis"] == "x" else 1, float(sm["plane"]["at"]),
                        1.0 if sm["plane"].get("toward", "+") == "+" else -1.0))
    return out


def lm_seams(sec_d: dict, built: set) -> list:
    """seam_planes' rows with each seam's window (u0, z0, u1, z1) and stub length: the lightmap's seams are local."""
    win = {sm["id"]: (tuple(float(v) for v in sm["window"]), float(sm.get("stub_m", 8.0)))
           for sm in sec_d.get("seams", [])}
    return [(sid, ax, at, sg) + win[sid] for sid, ax, at, sg in seam_planes(sec_d, built)]


def stitch_weight(P: np.ndarray, ax: int, at: float, sign: float) -> np.ndarray:
    """The neighbour's share of a vertex's light at a seam: 0 a metre or more inside this file, 0.5 on the plane, 1 a
    metre or more into the neighbour's side (its stub). The neighbour's file gets 1 minus it at the same point, so
    the two blends are the same number."""
    s = (P[:, ax] - at) * sign
    return np.clip(0.5 + 0.5 * s / SEAM_BAND, 0.0, 1.0)


def seam_dump(path: str, objs: list, planes: list, reach: float = 12.0) -> int:
    """The graded light (before k and the texture factor) of every vertex within `reach` of a seam plane, keyed by
    its position in 1e-5 m: what the neighbour's build blends with (--stitch)."""
    keys, Ls, Ds = [], [], []
    for o in objs:
        if o.name not in LIGHT_OUT:
            continue
        co = np.empty(len(o.data.vertices) * 3, np.float32)
        o.data.vertices.foreach_get("co", co)
        P = co.reshape(-1, 3).astype(np.float64)
        near = np.zeros(len(P), bool)
        for _sid, ax, at, _sg in planes:
            near |= np.abs(P[:, ax] - at) <= reach
        if near.any():
            keys.append(np.rint(P[near] * core.Q).astype(np.int64))
            Ls.append(LIGHT_OUT[o.name][near].astype(np.float32))
            Ds.append(np.asarray(DARK[o.name], np.float32)[near])
    K = np.concatenate(keys) if keys else np.zeros((0, 3), np.int64)
    L = np.concatenate(Ls) if Ls else np.zeros((0, 3), np.float32)
    D = np.concatenate(Ds) if Ds else np.zeros((0, 3), np.float32)
    np.savez_compressed(path, keys=K, light=L, dark=D)
    return int(len(K))


def stitch(objs: list, planes: list, dumps: list, k: float, E: float | None = None, ink_t: float | None = None) -> dict:
    """Blends each file's graded light with its neighbour's (their seam_dump) across every built seam, the same way
    in both files, and writes COLOR_0 again. Vertices the neighbour does not have (where its stub is clipped, or past
    its region) keep their own light. With E and ink_t the blend keeps the grade's floors: the lilac and teal guards,
    and the darkest texel at the ink (the neighbour's light was graded for its own scans, which can be paler)."""
    table = {}
    for path in dumps:
        z = np.load(path)
        D = z["dark"] if "dark" in z.files else np.full_like(z["light"], np.inf)
        for key, L, d_ in zip(map(tuple, z["keys"].tolist()), z["light"], D):
            table[key] = (L, d_)
    rep = {"vertices_in_band": 0, "matched": 0}
    for o in objs:
        if o.name not in LIGHT_OUT:
            continue
        co = np.empty(len(o.data.vertices) * 3, np.float32)
        o.data.vertices.foreach_get("co", co)
        P = co.reshape(-1, 3).astype(np.float64)
        L2 = LIGHT_OUT[o.name].copy()
        dark = np.array(DARK[o.name], dtype=np.float64, copy=True)
        changed = False
        for _sid, ax, at, sign in planes:
            t = stitch_weight(P, ax, at, sign)
            band = t > 0
            if not band.any():
                continue
            idx = np.nonzero(band)[0]
            rep["vertices_in_band"] += len(idx)
            K = np.rint(P[idx] * core.Q).astype(np.int64)
            for j, key in zip(idx, map(tuple, K.tolist())):
                other = table.get(key)
                if other is not None:
                    L2[j] = (1.0 - t[j]) * L2[j] + t[j] * other[0]
                    dark[j] = np.minimum(dark[j], other[1])   # both files floor a shared vertex alike
                    rep["matched"] += 1
                    changed = True
        if changed:
            if E is not None and ink_t is not None:
                R = _rb()
                L2 = guard_texels(guard_display(L2), RATIO.get(o.name))
                SEAM_DARK[o.name] = dark
                low = R.lum(R.agx(E * dark * L2)) < ink_t - 2e-4
                if low.any():
                    L2[low] *= R.solve_display(E * dark[low] * L2[low], ink_t, lo=1.0, hi=64.0, iters=30)[:, None]
                rep["refloored"] = rep.get("refloored", 0) + int(low.sum())
            c0, f, n_ = unit_colour(L2 * k * TEXFAC[o.name] * MEANALB[o.name])
            rep["color0_scaled"] = rep.get("color0_scaled", 0) + n_
            LIGHT_OUT[o.name] = L2 * f[:, None]
            _rb().write_attr(o, c0.astype(np.float32))
    return rep


# ---------------------------------------------------------------- the shell's lightmap (meshy_cave_lightmap.py)

LM: dict = {}   # the lightmap of this build: its objects, layout, texels, page and report


def lm_prepare(objs: list, planes: list, sec_key: str, tpm: float | None = None) -> dict:
    """The shell's lightmap layout: every chunk's faces in one page (lmap.layout's charts and resolution rule), a
    second UV map `lightmap` on each chunk, the texels rasterized with their world points and normals, and a float
    image the bake writes, as each shell material's active image node."""
    t0 = time.time()
    Vs, Fs, grp, Ns, foff, voff = [], [], [], [], [0], [0]
    for i, o in enumerate(objs):
        me = o.data
        nv, nf = len(me.vertices), len(me.polygons)
        co = np.empty(nv * 3, np.float32)
        me.vertices.foreach_get("co", co)
        nr = np.empty(nv * 3, np.float32)
        me.vertices.foreach_get("normal", nr)
        lv = np.empty(len(me.loops), np.int32)
        me.loops.foreach_get("vertex_index", lv)
        pm = np.empty(nf, np.int32)
        me.polygons.foreach_get("material_index", pm)
        Vs.append(co.reshape(-1, 3).astype(np.float64))
        Ns.append(nr.reshape(-1, 3).astype(np.float64))
        Fs.append(lv.reshape(-1, 3).astype(np.int64) + voff[-1])
        grp.append(i * 64 + pm.astype(np.int64))
        foff.append(foff[-1] + nf)
        voff.append(voff[-1] + nv)
    V, F, N = np.concatenate(Vs), np.concatenate(Fs), np.concatenate(Ns)
    lay = lmap.layout(V, F, np.concatenate(grp), planes, tpm=tpm)
    W, H = lay["W"], lay["H"]
    face, bary = lmap.rasterize(lay["tex"], W, H)
    owner = lmap.owner_map(lay["rect"], W, H)
    flat, tf, tw = lmap.texel_rows(face, bary)
    chart_of = np.where(face >= 0, lay["chart"][np.maximum(face, 0)], -1)
    P = lmap.interp(V, F, tf, tw)
    Nt = lmap.interp(N, F, tf, tw)
    Nt /= np.maximum(np.linalg.norm(Nt, axis=1, keepdims=True), 1e-9)
    vt = np.zeros((len(V), 2))
    vt[F.ravel()] = lay["tex"].reshape(-1, 2)   # each vertex's texel point (one of its corners')
    for i, o in enumerate(objs):
        me = o.data
        layer = me.uv_layers.new(name=lmap.UV_SET)
        layer.data.foreach_set("uv", lay["uv"][foff[i]:foff[i + 1]].reshape(-1).astype(np.float32))
        me.uv_layers.active = me.uv_layers[0]
        me.uv_layers[0].active_render = True   # the scan's UVs stay the first set (TEXCOORD_0)
    img = bpy.data.images.new(f"um_{sec_key}_lightmap_bake", W, H, alpha=False, float_buffer=True)
    img.colorspace_settings.name = "Non-Color"
    mats = sorted({m.name for o in objs for m in o.data.materials if m is not None})
    for name in mats:
        nt = MATS[name]["mat"].node_tree
        tn = nt.nodes.new("ShaderNodeTexImage")
        tn.image = img
        tn.name = "lightmap_bake"
        nt.nodes.active = tn
    be = lmap.border_edges(V, F, lay["tex"], lay["chart"])
    LM.clear()
    LM.update(objs=objs, names=[o.name for o in objs], V=V, F=F, foff=foff, voff=voff, lay=lay, W=W, H=H,
              face=face, owner=owner, chart_of=chart_of, flat=flat, tf=tf, tw=tw, P=P, N=Nt, vt=vt, image=img,
              mats=mats, md5=lmap.layout_md5(lay), be=be)
    rep = {k_: lay[k_] for k_ in ("W", "H", "tpm", "charts", "plane_area_m2", "chart_share")}
    rep.update(border_edges=be["edges"], border_samples=int(len(be["a"])), tpm_rule=lmap.tpm_for(lay["plane_area_m2"]),
               tpm_under_min=bool(lay["tpm"] < lmap.TPM_MIN))
    if lay["tpm"] < lmap.TPM_MIN:
        log(f"lightmap: WARNING {lay['tpm']} texels per metre, under the rule's least ({lmap.TPM_MIN}): the shell "
            f"needs a second page")
    rep.update(texels=int(len(flat)), faces=int(len(F)), faces_without_texel=int(len(F) - len(np.unique(tf))),
               charts_without_texel=int(lay["charts"] - len(np.unique(chart_of[chart_of >= 0]))),
               layout_md5=LM["md5"], seconds=round(time.time() - t0, 1))
    LM["report"] = rep
    log(f"lightmap: {rep}")
    return rep


def lm_image(rows: np.ndarray, fill: float = 0.0, dilate: bool = True) -> np.ndarray:
    """Texel rows (n x C) as a page (H x W x C), the padding of each chart filled from its own texels."""
    H, W = LM["H"], LM["W"]
    C = rows.shape[1]
    img = np.full((H * W, C), fill, np.float64)
    img[LM["flat"]] = rows
    img = img.reshape(H, W, C)
    if dilate:
        img, _f = lmap.dilate(img, LM["face"] >= 0, LM["owner"])
    return img


def lm_rows(img: np.ndarray) -> np.ndarray:
    return img.reshape(-1, img.shape[-1])[LM["flat"]]


def lm_to_vertices(rows: np.ndarray) -> dict:
    """Texel rows sampled at the shell's vertices (the page bilinear at each vertex's texel point), per object."""
    img = lm_image(np.asarray(rows, np.float64).reshape(len(LM["flat"]), -1))
    vals = lmap.bilinear(img, LM["vt"])
    return {n: vals[LM["voff"][i]:LM["voff"][i + 1]] for i, n in enumerate(LM["names"])}


def lm_bake(samples: int, hide: list, kind: str = "DIFFUSE", ao_distance: float | None = None) -> tuple:
    """One bake of the shell into the page (Cycles, target IMAGE_TEXTURES, the `lightmap` UVs). Returns (the texel
    rows n x 3, seconds)."""
    R = _rb()
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    R.cycles_device(sc)
    sc.cycles.samples = samples
    sc.cycles.use_adaptive_sampling = False
    sc.cycles.use_denoising = False
    sc.cycles.caustics_reflective = False
    sc.cycles.caustics_refractive = False
    sc.cycles.max_bounces = 6
    sc.cycles.diffuse_bounces = 4
    sc.cycles.glossy_bounces = 2
    sc.cycles.transparent_max_bounces = 8
    sc.cycles.sample_clamp_indirect = 8.0
    sc.render.bake.margin = 2
    try:
        sc.render.bake.margin_type = "EXTEND"
    except (AttributeError, TypeError):
        pass
    if ao_distance is not None:
        sc.world.light_settings.distance = ao_distance
    for o in hide:
        o.hide_render = True
    bpy.ops.object.select_all(action="DESELECT")
    for o in LM["objs"]:
        o.data.uv_layers.active = o.data.uv_layers[lmap.UV_SET]
        o.select_set(True)
    bpy.context.view_layer.objects.active = LM["objs"][0]
    t0 = time.time()
    if kind == "AO":
        bpy.ops.object.bake(type="AO", target="IMAGE_TEXTURES", use_clear=True)
    else:
        bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, target="IMAGE_TEXTURES",
                            use_clear=True)
    t = time.time() - t0
    for o in hide:
        o.hide_render = False
    for o in LM["objs"]:
        o.data.uv_layers.active = o.data.uv_layers[0]
    img = LM["image"]
    px = np.empty(LM["W"] * LM["H"] * 4, np.float32)
    img.pixels.foreach_get(px)
    return px.reshape(-1, 4)[LM["flat"], :3].astype(np.float64), t


def lm_bake_groups(samples: int, hide: list, groups: dict, has_sky: bool, ao_cfg: dict) -> tuple:
    """The shell's light groups (lamp, sky, fill: the others off, as bake_groups) and its AO into texel rows."""
    sc = bpy.context.scene
    bg = sc.world.node_tree.nodes["Background"]
    ws = bg.inputs["Strength"].default_value
    allL = [o for g in groups.values() for o in g]
    energy = {o.name: o.data.energy for o in allL}
    out, secs = {}, {}
    for g in ("lamp", "sky", "fill"):
        if g == "sky" and not has_sky:
            continue
        if g != "sky" and not groups[g]:
            continue
        for o in allL:
            o.data.energy = energy[o.name] if o in groups.get(g, []) else 0.0
        bg.inputs["Strength"].default_value = ws if g == "sky" else 0.0
        out[g], t = lm_bake(samples, hide)
        secs[g] = round(t, 1)
        log(f"lightmap: baked group {g} at {samples} samples in {t:.1f} s ({len(LM['flat'])} texels)")
    for o in allL:
        o.data.energy = energy[o.name]
    bg.inputs["Strength"].default_value = ws
    keep = sc.cycles.samples
    ao, t = lm_bake(int(ao_cfg["samples"]), hide, "AO", float(ao_cfg["distance_m"]))
    sc.cycles.samples = keep
    out["ao"] = ao[:, 0]
    secs["ao"] = round(t, 1)
    log(f"lightmap: baked AO in {t:.1f} s")
    return out, secs


def lm_quick(groups: dict) -> dict:
    """--no-bake: quick_groups' unshadowed stand-in at the texels."""
    P, Nn = LM["P"], LM["N"]
    out = {}
    for g, ls in groups.items():
        L = np.zeros((len(P), 3))
        for lo in ls:
            d = np.array(lo.location) - P
            r2 = np.maximum((d * d).sum(1), 0.04)
            cosv = np.clip((d * Nn).sum(1) / np.sqrt(r2), 0.0, 1.0)
            L += (lo.data.energy / (4 * math.pi) * cosv / r2 / math.pi)[:, None] * np.array(lo.data.color)[None, :]
        out[g] = L
    return out


def lm_save_raw(path: str, tg: dict, samples: int, seconds: float, meta: dict) -> None:
    arrs = {f"lm|{g}": np.asarray(v, np.float32) for g, v in tg.items()}
    arrs["meta|layout_md5"] = np.array(LM["md5"])
    arrs["meta|texels"] = np.array(len(LM["flat"]))
    arrs["meta|samples"] = np.array(int(samples))
    arrs["meta|bakeSeconds"] = np.array(float(seconds))
    for k_, v_ in meta.items():
        arrs[f"meta|{k_}"] = np.array(str(v_))
    np.savez_compressed(path, **arrs)
    log("saved the lightmap's raw bake", path)


def lm_load_raw(path: str) -> dict:
    if not os.path.exists(path):
        raise SystemExit(f"--raw: no {path} (the shell's lightmap bake): bake again")
    z = np.load(path)
    if str(z["meta|layout_md5"]) != LM["md5"] or int(z["meta|texels"]) != len(LM["flat"]):
        raise SystemExit(f"--raw {path}: the lightmap's layout does not match this build's; bake again")
    LM["raw_meta"] = {k.split("|", 1)[1]: str(z[k]) for k in z.files if k.startswith("meta|")}
    return {k.split("|", 1)[1]: z[k].astype(np.float64) for k in z.files if k.startswith("lm|")}


def lm_attr(name: str) -> np.ndarray:
    """A per-vertex table of the shell (DARK, MEANALB, TEXFAC, RATIO, DARK_R3) for all its objects, in the layout's
    order."""
    src = {"dark": DARK, "alb": MEANALB, "texfac": TEXFAC, "ratio": RATIO, "dark_r3": DARK_R3}[name]
    return np.concatenate([np.asarray(src[n], np.float64) for n in LM["names"]])


def disp_lin(d: np.ndarray) -> np.ndarray:
    """Display values (sRGB-encoded, 0..1) as the light the screen gives (decoded, linear)."""
    return lmap.srgb_decode(np.asarray(d, np.float64))


AO_MIN = 0.04   # the open share the lantern scales by never goes under this: a crevice still takes a little light


def occlusion_open(open_sky, look: dict) -> np.ndarray:
    """The ambient occlusion the lantern reads, as the open share (1 open, AO_MIN at the most closed): the bake's AO
    with the look's gamma (the share the light's own AO term uses, `grade_rows`), clipped to AO_MIN..1."""
    g = float(look["ao"]["gamma"]) if look.get("ao") else 1.0
    return np.clip(np.asarray(open_sky, np.float64) ** g, AO_MIN, 1.0)


OCCL = "_occl"   # the attribute (`_OCCL` in the GLB) holding 1 - the open share (the baked AO), per vertex


def set_occlusion(o, open_share, mask=None) -> None:
    """Writes 1 - open_share (per vertex) as the float attribute `_occl` that the glTF exporter writes as `_OCCL`; with
    `mask`, only where it is true (0 elsewhere: a vertex with no occlusion to show costs the Draco stream nothing)."""
    me = o.data
    occ = 1.0 - np.asarray(open_share, np.float64)
    if mask is not None:
        occ = np.where(mask, occ, 0.0)
    if OCCL in me.attributes:
        me.attributes.remove(me.attributes[OCCL])
    a = me.attributes.new(OCCL, "FLOAT", "POINT")
    a.data.foreach_set("value", np.clip(occ, 0.0, 1.0).astype(np.float32))


def lm_grade(tg: dict, look: dict, E: float, k: float, no_bake: bool, w_lamp: float) -> dict:
    """The texels' grade: the groups by weight (the lamp's at w_lamp), the bake's noise smoothed within each chart,
    then grade_rows with the texels' own AO and the albedo, darkest texel and tint factor of their face's vertices.
    The report compares the texels away from the placed lamps with route 3's look on the same bake (every group at
    weight 1, route 3's flat form term and route 3's scan grade), as sRGB display values and as the light the screen
    gives."""
    wts = look["weights"]
    L = sum(float(wts.get(g, 1.0)) * (w_lamp if g == "lamp" else 1.0) * np.asarray(v, np.float64)
            for g, v in tg.items() if g != "ao")
    if not isinstance(L, np.ndarray):
        L = np.zeros((len(LM["flat"]), 3))
    if not no_bake:
        L = lm_rows(lmap.smooth(lm_image(L, dilate=False), LM["face"] >= 0, LM["chart_of"], passes=2))
    F, tf, tw = LM["F"], LM["tf"], LM["tw"]
    dark = lmap.interp(lm_attr("dark"), F, tf, tw)
    alb = lmap.interp(lm_attr("alb"), F, tf, tw)
    ratio = lmap.interp(lm_attr("ratio"), F, tf, tw)
    texfac = lm_attr("texfac")[F[tf, 0]]          # constant over a face (per material)
    hk, hm = float(look["hot"]["knee"]), float(look["hot"]["max"])
    osky = tg.get("ao")
    L2, info = grade_rows(L, osky, dark, alb, ratio, look, E, hk, hm)
    LM.update(L2=L2, L1=info["L1"], dark=dark, alb=alb, ratio=ratio, texfac=texfac, k=k, E=E, hot=(hk, hm))
    # route 3's look (every group at weight 1, its flat form term, its scan grade) at the same texels, for the report
    lt = look.get("lantern", {})
    old = dict(look, weights={"lamp": 1.0, "sky": 1.0, "fill": 1.0},
               ink_lift=dict(look["ink_lift"], form=float(lt.get("route3_form", 0.5)), form_base=1.0))
    L0 = sum((w_lamp if g == "lamp" else 1.0) * np.asarray(v, np.float64) for g, v in tg.items() if g != "ao")
    if not isinstance(L0, np.ndarray):
        L0 = np.zeros_like(L)
    if not no_bake:
        L0 = lm_rows(lmap.smooth(lm_image(L0, dilate=False), LM["face"] >= 0, LM["chart_of"], passes=2))
    dark0 = lmap.interp(lm_attr("dark_r3"), F, tf, tw)
    _L20, info0 = grade_rows(L0, osky, dark0, alb, ratio, old, E, hk, hm)
    far = np.ones(len(L), bool)
    for lp_ in LM.get("lamps", []):
        far &= np.linalg.norm(LM["P"] - np.asarray(lp_)[None, :], axis=1) > float(lt.get("lamp_reach_m", 8.0))

    def q(a):
        return {f"p{p_}": round(float(np.percentile(a, p_)), 4) for p_ in (5, 25, 50, 75, 95)} if len(a) else {}

    rep = {"below_floor_share": round(info["below_floor"] / max(len(L2), 1), 4),
           "at_floor_share": round(info["at_floor"] / max(len(L2), 1), 4), "hot_eased": info["hot_eased"],
           "display_mean_texel": q(info["disp"]), "display_before_floor": q(info["rawd"]),
           "away_from_lamps": {"texels": int(far.sum()), "display_now": q(info["disp"][far]),
                               "display_route3_look": q(info0["disp"][far])}}
    if far.any():
        a_, b_ = info["disp"][far], info0["disp"][far]
        af = rep["away_from_lamps"]
        af["ratio_p50"] = round(float(np.percentile(a_, 50) / max(np.percentile(b_, 50), 1e-9)), 4)
        af["ratio_mean"] = round(float(a_.mean() / max(b_.mean(), 1e-9)), 4)
        af["light_ratio_p50"] = round(float(disp_lin(np.percentile(a_, 50)) / max(disp_lin(np.percentile(b_, 50)),
                                                                                  1e-12)), 4)
        af["light_ratio_mean"] = round(float(disp_lin(a_).mean() / max(disp_lin(b_).mean(), 1e-12)), 4)
        bb = info["bare"][far]
        af["display_bare_floor"] = q(bb)
        af["light_ratio_bare_floor_p50"] = round(float(disp_lin(np.percentile(bb, 50))
                                                       / max(disp_lin(np.percentile(b_, 50)), 1e-12)), 4)
        af["at_floor_share"] = round(float((info["m"][far] < 1.02).mean()), 4)
        af["floor_lift"] = q(info["m"][far])
    LM["report"]["grade"] = rep
    log(f"lightmap grade: {rep}")
    return rep


def lm_finish(planes: list, look: dict, out_dir: str, aid: str, quality: int) -> dict:
    """After the stitch: near each built seam the texels give way to the stitched vertex light (lmap.seam_weight,
    continuous, so both files show the same light on the plane), and every texel goes through post_rows again (the
    guards, the floor, the highlights: a texel with no seam near ends as grade_rows left it). The page of light with
    its padding is then stitched along the chart borders (lmap.stitch_edges: the linear filter reads the same light on
    both sides of every border), floored again (padding included), multiplied by COLOR_0's factor per texel (k x the
    tint factor x the albedo, channels at most 1), scaled to its maximum and saved as WebP (`quality` 100 is
    lossless). The page is read back as the file will hold it: the look's checks and the border check run on that."""
    R = _rb()
    E, k = LM["E"], LM["k"]
    hk, hm = LM["hot"]
    L1 = LM["L1"].copy()
    F, tf, tw = LM["F"], LM["tf"], LM["tw"]
    il = look["ink_lift"]
    ink_t = (float(R.lum(np.array(INK, float))) + float(il["margin_luma"])) / 255.0
    rep = {}
    dark = LM["dark"].copy()
    if planes:
        VL = np.concatenate([LIGHT_OUT[n] for n in LM["names"]])
        SD = np.concatenate([np.asarray(SEAM_DARK.get(n, DARK[n]), np.float64) for n in LM["names"]])
        w = lmap.seam_weight(LM["P"], planes)
        band = w < 1.0
        if band.any():
            wb = w[band, None]
            L1[band] = wb * L1[band] + (1.0 - wb) * lmap.interp(VL, F, tf[band], tw[band])
            # the floor on the plane is the stitch's, the lesser darkest texel of both files: never over this file's
            dark[band] = np.minimum(dark[band], wb * dark[band] + (1.0 - wb) * lmap.interp(SD, F, tf[band], tw[band]))
        rep["seam_band_texels"] = int(band.sum())
    LM["dark_f"] = dark
    L2, _n = post_rows(L1, dark, LM["alb"], LM["ratio"], E, ink_t, hk, hm)
    # the page of light, stitched along the chart borders, floored again with the padding
    fac = k * LM["texfac"] * LM["alb"]
    pg_L = lm_image(L2)
    be = LM["be"]
    gap0 = lmap.border_gaps(pg_L, be)
    pg_L = lmap.stitch_edges(pg_L, be, int(look.get("lightmap", {}).get("stitch_rounds", 24)))
    own = LM["owner"].ravel() >= 0
    pg_D, pg_A, pg_R, pg_F = (lm_image(a_).reshape(-1, a_.shape[1]) for a_ in (dark, LM["alb"], LM["ratio"], fac))
    rows = pg_L.reshape(-1, 3)
    fl, _n = post_rows(rows[own], pg_D[own], pg_A[own], pg_R[own], E, ink_t)
    rows[own] = fl
    c0p = rows * pg_F
    c0p[own], f, n_ = unit_colour(c0p[own])
    rows[own] *= f[:, None]
    rep["color0_scaled"] = n_
    L2 = rows[LM["flat"]]
    LM["page_light"] = rows.reshape(LM["H"], LM["W"], 3).copy()
    c0 = c0p[LM["flat"]]
    page = c0p.reshape(LM["H"], LM["W"], 3)
    S = float(max(page.max(), 1e-6))
    enc = np.clip(page / S, 0.0, 1.0)
    srgb = np.where(enc <= 0.0031308, 12.92 * enc, 1.055 * np.power(enc, 1 / 2.4) - 0.055)
    H, W = LM["H"], LM["W"]
    img = bpy.data.images.new(f"{aid}_lightmap", W, H, alpha=False)
    img.colorspace_settings.name = "sRGB"
    rgba = np.ones((H * W, 4), np.float32)
    rgba[:, :3] = srgb.reshape(-1, 3)
    img.pixels.foreach_set(rgba.ravel())
    tex_dir = os.path.join(out_dir, "textures")
    os.makedirs(tex_dir, exist_ok=True)
    path = os.path.join(tex_dir, f"{aid}_lightmap.webp")
    img.filepath_raw = path
    img.file_format = "WEBP"
    bpy.context.scene.render.image_settings.quality = int(quality)
    try:
        img.save(quality=int(quality))
    except TypeError:
        img.save()
    bpy.data.images.remove(img)
    back = bpy.data.images.load(path, check_existing=False)
    back.colorspace_settings.name = "sRGB"
    px = np.empty(W * H * 4, np.float32)
    back.pixels.foreach_get(px)   # an 8-bit image's pixels as stored (sRGB-encoded)
    decp = lmap.srgb_decode(px.reshape(-1, 4)[:, :3]) * S
    c0d = decp[LM["flat"]]
    Ld = c0d / np.maximum(fac, 1e-12)
    ink_luma = float(R.lum(np.array(INK, float))) / 255.0
    dd = R.agx(E * LM["dark"] * Ld)
    md = R.agx(E * LM["alb"] * Ld)
    err = np.abs(c0d - c0) / np.maximum(c0, 1e-4)
    # the light the file shows on both sides of each chart border (the page as saved, over each side's factor)
    ia, wa = lmap.bilinear_taps(be["a"], W, H)
    ib, wb = lmap.bilinear_taps(be["b"], W, H)
    fa = (pg_F[ia] * wa[:, :, None]).sum(axis=1)
    fb = (pg_F[ib] * wb[:, :, None]).sum(axis=1)
    lum3 = np.array([0.2126, 0.7152, 0.0722])
    gap = lmap.border_gaps(decp.reshape(H, W, 3), be, fa @ lum3, fb @ lum3) if len(be["a"]) else np.zeros(0)

    def pq(a_):
        return {f"p{q_}": round(float(np.percentile(a_, q_)), 4) for q_ in (50, 95, 99)} |             {"max": round(float(a_.max()), 4), "over_10pct": round(float((a_ > 0.1).mean()), 4)} if len(a_) else {}

    rep.update(file=os.path.basename(path), bytes=os.path.getsize(path), scale=S, quality=int(quality),
               dark_texel_under_ink=int((R.lum(dd) < ink_luma - 1e-4).sum()),
               lilac_share=round(lilac_share(np.concatenate([dd, md])), 6),
               teal_share=round(float((md[:, 1] > np.maximum(md[:, 0], md[:, 2]) + 0.004).mean()), 6),
               encode_rel_error_p50=round(float(np.percentile(err, 50)), 4),
               encode_rel_error_p99=round(float(np.percentile(err, 99)), 4),
               display_file={f"p{q}": round(float(np.percentile(R.lum(md), q)), 4) for q in (5, 25, 50, 75, 95)},
               border_light_gap_before_stitch=pq(gap0), border_light_gap_file=pq(gap))
    LM.update(path=path, scale=S, decoded=back, c0=c0, L2=L2, Ld=Ld)
    LM["report"]["page"] = rep
    log(f"lightmap page: {rep}")
    return rep


def lm_seam_probe(path: str, planes: list, near: float = 0.6) -> int:
    """The light the file shows (its saved page, decoded, over k x the tint factor x the albedo; on the faces
    seam_vertex_faces draws vertex-lit, their vertex light) at the centre of every shell face within `near` metres of
    a built seam plane, keyed by the centre in 1e-5 m: the neighbour's file must show the same light there (tools:
    the seam check)."""
    if not planes:
        return 0
    V, F = LM["V"], LM["F"]
    C = V[F].mean(axis=1)
    sel = np.zeros(len(F), bool)
    for sm in planes:
        s_, inr = lmap.seam_region(C, sm)
        sel |= (np.abs(s_) <= near) & inr
    idx = np.nonzero(sel)[0]
    tex = LM["lay"]["tex"][idx].mean(axis=1)
    W, H = LM["W"], LM["H"]
    px = np.empty(W * H * 4, np.float32)
    LM["decoded"].pixels.foreach_get(px)
    page = lmap.srgb_decode(px.reshape(H, W, 4)[:, :, :3]) * LM["scale"]
    c0 = lmap.bilinear(page, tex)
    fac = (lm_attr("texfac") * lm_attr("alb"))[F[idx]].mean(axis=1) * LM["k"]
    dist = np.min(np.stack([np.abs(C[idx, sm[1]] - sm[2]) for sm in planes]), axis=0)
    VL = np.concatenate([LIGHT_OUT[n] for n in LM["names"]])
    light = c0 / np.maximum(fac, 1e-12)
    # the faces seam_vertex_faces draws vertex-lit show the vertex light (COLOR_0), not the page
    wv = lmap.seam_weight(V, planes)
    vl = (wv[F[idx]] <= 1e-6).all(axis=1)
    light[vl] = VL[F[idx[vl]]].mean(axis=1)
    np.savez_compressed(path, keys=np.rint(C[idx] * core.Q).astype(np.int64), light=light,
                        plane_dist=dist, light_page=lmap.bilinear(LM["page_light"], tex), vertex_light=VL[F[idx]].mean(1),
                        vertex_lit=vl)
    return int(len(idx))


SEAMV = "_seamv"   # the suffix of a lightmapped material's copy drawn, vertex-lit, on the faces next to a built seam


def seam_vertex_faces(shell: list, planes: list) -> dict:
    """The shell's faces whose every vertex shows the stitched vertex light alone in the page (lmap.seam_weight 0:
    within SEAM_HOLD_M of a built seam plane, and its stub) are drawn with a copy of their material (`<name>_seamv`)
    that has no lightmap: vertex-lit (COLOR_0) in every viewer, so both files show the same light on the faces they
    share (the stitch made it so), not the page read between its texels (the rebuild's check: within 0.1 m of
    well_white's plane the page's light differed by 13 % at p95). Their edges with the page's faces have weight 0
    at both ends, where the page shows the same vertex light. Returns the faces moved and the copies made."""
    rep = {"faces": 0, "materials": []}
    if not planes:
        return rep
    for o in shell:
        me = o.data
        nv = len(me.vertices)
        co = np.empty(nv * 3, np.float32)
        me.vertices.foreach_get("co", co)
        w = lmap.seam_weight(co.reshape(-1, 3).astype(np.float64), planes)
        loops = np.empty(len(me.loops), np.int32)
        me.loops.foreach_get("vertex_index", loops)
        F = loops.reshape(-1, 3)
        sel = (w[F] <= 1e-6).all(axis=1)
        if not sel.any():
            continue
        pm = np.empty(len(me.polygons), np.int32)
        me.polygons.foreach_get("material_index", pm)
        for j in np.unique(pm[sel]).tolist():
            src = me.materials[j]
            cname = src.name + SEAMV
            if cname not in MATS:
                cp = src.copy()
                cp.name = cname
                MATS[cname] = dict(MATS[src.name], mat=cp)
                rep["materials"].append(cname)
            cm = MATS[cname]["mat"]
            names = [m.name for m in me.materials]
            if cm.name not in names:
                me.materials.append(cm)
                names.append(cm.name)
            pm[sel & (pm == j)] = names.index(cm.name)
        me.polygons.foreach_set("material_index", pm)
        me.update()
        rep["faces"] += int(sel.sum())
    return rep


def lm_still_trees() -> None:
    """For the stills: each lightmapped material shows its scan x the saved page (decoded) x its scale, as the
    viewer will (the scan on the first UVs, the page on the `lightmap` UVs)."""
    for name in LM["mats"]:
        md = MATS[name]
        nt = md["mat"].node_tree
        nt.nodes.clear()
        N, L = nt.nodes, nt.links
        out = N.new("ShaderNodeOutputMaterial")
        em = N.new("ShaderNodeEmission")
        em.inputs["Strength"].default_value = float(LM["scale"])
        lp = N.new("ShaderNodeLightPath")
        mix = N.new("ShaderNodeMixShader")
        L.new(lp.outputs["Is Camera Ray"], mix.inputs[0])
        L.new(N.new("ShaderNodeBsdfTransparent").outputs[0], mix.inputs[1])
        L.new(em.outputs[0], mix.inputs[2])
        ti = N.new("ShaderNodeTexImage")
        ti.image = md["image"]
        uv0 = N.new("ShaderNodeUVMap")
        uv0.uv_map = "UVMap"
        L.new(uv0.outputs["UV"], ti.inputs["Vector"])
        tl = N.new("ShaderNodeTexImage")
        tl.image = LM["decoded"]
        tl.interpolation = "Linear"
        uvn = N.new("ShaderNodeUVMap")
        uvn.uv_map = lmap.UV_SET
        L.new(uvn.outputs["UV"], tl.inputs["Vector"])
        mul = N.new("ShaderNodeMix")
        mul.data_type, mul.blend_type = "RGBA", "MULTIPLY"
        mul.inputs[0].default_value = 1.0
        L.new(ti.outputs["Color"], mul.inputs[6])
        L.new(tl.outputs["Color"], mul.inputs[7])
        L.new(mul.outputs[2], em.inputs["Color"])
        L.new(mix.outputs[0], out.inputs["Surface"])


def look_report(objs: list, look: dict, E: float) -> dict:
    """The look as the viewer will show it, per vertex: the darkest kept texel and the mean texel under the light,
    through AgX at the network exposure. Under ink, and lilac or magenta, are counted."""
    R = _rb()
    ink_luma = float(R.lum(np.array(INK, float))) / 255.0
    under = under_raw = total = 0
    lil = []
    for o in objs:
        if o.name not in LIGHT_OUT:
            continue
        L2 = LIGHT_OUT[o.name]
        dd = R.agx(E * DARK[o.name] * L2)
        under += int((R.lum(dd) < ink_luma - 1e-4).sum())
        # the darkest texel itself (the look's dark_gain taken off): under the ink where the gain lets the darkest few
        # texels go, which the viewer's ink clamp draws at the ink
        under_raw += int((R.lum(R.agx(E * DARK[o.name] / DARK_GAIN["g"] * L2)) < ink_luma - 1e-4).sum())
        total += len(L2)
        lil.append(R.agx(E * MEANALB[o.name] * L2))
        lil.append(dd)
    allc = np.concatenate(lil) if lil else np.zeros((0, 3))
    return {"vertices": total, "dark_texel_under_ink": under, "dark_gain": DARK_GAIN["g"],
            "darkest_texel_under_ink_before_the_gain": under_raw, "lilac_share": round(lilac_share(allc), 6)}


def finish_attrs(objs: list, dark_gain: float = 1.0) -> None:
    """Per vertex: the albedo (linear tint), the darkest kept texel under it (for the ink floor), times `dark_gain`
    (the look's ink_lift.dark_gain: the floor holds the texel `dark_gain` times lighter than the darkest at the ink, so
    the bake sits that much darker and the texels under that level, the darkest few, are the viewer's ink clamp's:
    lantern.ts draws no pixel under the ink)."""
    for o in objs:
        if o.name not in TEXFAC:
            continue
        a = o.data.color_attributes[TINT_ATTR]
        c = np.empty(len(a.data) * 4, np.float32)
        a.data.foreach_get("color", c)
        alb = c.reshape(-1, 4)[:, :3].astype(np.float64)
        rows = np.zeros((len(alb), 3))
        rows_r3 = np.zeros((len(alb), 3))
        q = np.ones((len(alb), 2))
        loops = np.empty(len(o.data.loops), np.int32)
        o.data.loops.foreach_get("vertex_index", loops)
        pm = np.empty(len(o.data.polygons), np.int32)
        o.data.polygons.foreach_get("material_index", pm)
        vm = np.zeros(len(alb), np.int32)
        vm[loops] = np.repeat(pm, 3)
        mats = o.data.materials
        for j, m in enumerate(mats):
            md = MATS.get(m.name)
            sel = vm == j
            if md is None or not sel.any():
                continue
            rows[sel] = md["dark"] / np.maximum(md["mean"], 1e-4)
            rows_r3[sel] = md["rel_r3"] if "rel_r3" in md else md["dark"] / np.maximum(md["mean"], 1e-4)
            if "ratio" in md:
                q[sel] = md["ratio"][None, :]
        MEANALB[o.name] = alb
        if o.name in FLOORQ:
            rows = rows * FLOORQ[o.name][:, None]
        DARK[o.name] = rows * alb * dark_gain
        DARK_GAIN["g"] = dark_gain
        DARK_R3[o.name] = rows_r3 * alb
        g_ = np.maximum(alb[:, 1], 1e-6)
        RATIO[o.name] = q * np.stack([alb[:, 0] / g_, alb[:, 2] / g_], axis=1)


def to_export(objs: list, look: dict) -> None:
    we = float(look["wdi_exposure"])
    for name, md in MATS.items():
        m = md["mat"]
        if md["kind"] == "rock":
            # a lightmapped material has no COLOR_0 any more: its light is the page's (the viewer reads it, as
            # docs/walk-areas.md says), and the file is smaller by the shell's vertex light. The `_seamv` copies, the
            # faces within the seam band, keep COLOR_0: the stitched vertex light both files show there
            unlit_tree(m, image=md["image"], vertex=not (name in LM.get("mats", []) and not name.endswith(SEAMV)))
        elif md["kind"] == "flat":
            unlit_tree(m, image=None, colour=(0.0, 0.0, 0.0))
        elif md["kind"] == "emit":
            unlit_tree(m, image=None, colour=np.minimum(md["display"] / we, 1.0))
        elif md["kind"] == "emit_raw":
            unlit_tree(m, image=None, colour=np.minimum(md["colour"], 1.0))
        elif md["kind"] == "water":
            water_tree(m)
    for o in objs:
        me = o.data
        if TINT_ATTR in me.color_attributes:
            me.color_attributes.remove(me.color_attributes[TINT_ATTR])


def export(path: str, objs: list, area_ob, coll_ob) -> int:
    for o in list(bpy.data.objects):
        if o.type in ("LIGHT", "CAMERA") or o in BAKE_ONLY:
            o.hide_render = True
    for o in EXPORT_ONLY:
        o.hide_render = False
    for o in objs + EXPORT_ONLY:
        o.parent = area_ob
    coll_ob.parent = None
    smooth_all(objs + EXPORT_ONLY + [coll_ob])
    return export_glb(path)


def smooth_all(objs: list) -> None:
    """Smooth shading on every mesh that is exported, so the glTF exporter writes one normal per vertex and does not
    split the vertices along flat faces (the lantern shades by the normal; the viewer reads it from the file)."""
    for o in objs:
        if o.type != "MESH":
            continue
        me = o.data
        if len(me.polygons):
            me.polygons.foreach_set("use_smooth", np.ones(len(me.polygons), bool))
            me.update()


def export_glb(path: str) -> int:
    """meshy_room_build.export_glb's settings (Draco, unlit, COLOR_0 where a material has vertex colours) with the
    normals (the lantern's surface-angle term) and the `_occl` attribute (written as `_OCCL`: the baked ambient
    occlusion, 1 minus the open share, per vertex, which the lantern scales by)."""
    R = _rb()
    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(path), export_format="GLB", use_active_scene=True, use_renderable=True,
        export_apply=False, export_gpu_instances=True, export_extras=True, export_yup=True,
        export_image_format="WEBP", export_image_quality=80, export_lights=True,
        export_import_convert_lighting_mode="COMPAT", export_animations=False, export_cameras=False,
        export_vertex_color="MATERIAL", export_all_vertex_colors=False,
        export_active_vertex_color_when_no_material=False, export_tangents=False, export_normals=True,
        export_attributes=True, **dict(R.DRACO, export_draco_normal_quantization=NORMAL_BITS,
                                       export_draco_generic_quantization=OCCL_BITS))
    return os.path.getsize(path)


def export_journey(path: str, area_ob, coll_ob) -> int:
    """--journey: the walker's part of the file without Draco (the Area with its spawns, portals and zones, and the
    collision node), for the viewer's own controller in a test (apps/walk's tests read glTF without a decoder)."""
    bpy.ops.object.select_all(action="DESELECT")
    keep = [area_ob, coll_ob] + [o for o in area_ob.children if o.type == "EMPTY"]
    for o in keep:
        o.hide_render = False
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(path), export_format="GLB", use_selection=True,
                              export_extras=True, export_yup=True, export_apply=False, export_materials="NONE",
                              export_animations=False, export_cameras=False, export_lights=False,
                              export_normals=False, export_draco_mesh_compression_enable=False)
    bpy.ops.object.select_all(action="DESELECT")
    return os.path.getsize(path)


# ---------------------------------------------------------------- stills


def clamp_ink_png(path: str) -> int:
    """The viewer's last steps on a pixel (apps/walk lantern.ts: no lilac, no teal, and none under the ink in luminance,
    whatever the bake, the texture filter and the encoding left), on a still: green lifted to the lesser of red
    and blue where it is the least channel; red lifted to 0.9 of the higher of green and blue where both stand well
    over it (the hue between 160 and 200 degrees); a pixel under the ink's luminance gets the luminance it lacks, plus 0.6 of a level
    so that the 8-bit rounding never takes it under, in the ink's colour. Returns how many pixels it changed."""
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    rgba = px.reshape(-1, 4)
    ink = np.array(INK, np.float64) / 255.0
    y = np.array([0.2126, 0.7152, 0.0722])
    y_ink = float(y @ ink)
    rgb = rgba[:, :3].astype(np.float64)
    green = np.maximum(rgb[:, 1], np.minimum(rgb[:, 0], rgb[:, 2]))   # never lilac (the shader's guard)
    n_lilac = int((green > rgb[:, 1] + 1e-6).sum())
    rgb[:, 1] = green
    hi, lo = np.maximum(rgb[:, 1], rgb[:, 2]), np.minimum(rgb[:, 1], rgb[:, 2])   # never teal (the shader's guard)
    teal = (lo - rgb[:, 0] >= 0.67 * (hi - rgb[:, 0])) & (hi - rgb[:, 0] > 0.12 * hi)
    n_lilac += int(teal.sum())
    rgb[teal, 0] = 0.9 * hi[teal]
    lum_ = rgb @ y
    under = lum_ * 255.0 < y_ink * 255.0 + 0.25   # the checker's tolerance is 0.5 under the ink's luminance
    n = int(under.sum()) + n_lilac
    if n:
        add = np.maximum(y_ink + 0.6 / 255.0 - lum_, 0.0) / y_ink
        rgba[:, :3] = (rgb + ink[None, :] * add[:, None]).astype(np.float32)
        img.pixels.foreach_set(rgba.ravel())
        img.filepath_raw = path
        img.file_format = "PNG"
        img.save()
    bpy.data.images.remove(img)
    return n


def render_still(sc, path: str, w: int, h: int, exposure: float) -> None:
    """meshy_room_build.render_png, then the ink clamp the viewer's shader applies."""
    _rb().render_png(sc, path, w, h, exposure=exposure)
    n = clamp_ink_png(path)
    if n:
        log(f"still {os.path.basename(path)}: {n} pixels raised to the ink (the viewer's clamp)")


def stills(sec, nodes: dict, look: dict, out_dir: str, area: str, samples: int = 16) -> list:
    R = _rb()
    sc = bpy.context.scene
    we = float(look["wdi_exposure"])
    R.setup_view(sc, we)
    sc.render.engine = "CYCLES"
    R.cycles_device(sc)
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    sc.cycles.max_bounces = 16
    sc.cycles.transparent_max_bounces = 64
    # the viewer's background indoors is the fog's ink: the world shows ink at the network exposure
    bg = sc.world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (*(hex_lin(look["ink"]) / max(float(R.lum(hex_lin(look["ink"]))), 1e-9)
                                          * R.ink_level() / we), 1.0)
    bg.inputs["Strength"].default_value = 1.0
    for o in bpy.data.objects:
        if o.name.startswith("HM_Collision") or o in BAKE_ONLY:
            o.hide_render = True
    sky = bpy.data.objects.get(f"um_{sec.key}_vista_sky")
    if sky is not None:
        sky.hide_render = False
    views = []
    for s in nodes["spawns"]:
        mode = s["extras"].get("wdi_mode", "walk")
        eye = CRAWL_EYE if mode == "crawl" else EYE
        yaw = math.radians(s["yaw_deg"])
        d = np.array([-math.sin(yaw), math.cos(yaw), -0.12])
        e = np.array(s["at"]) + np.array([0, 0, eye])
        views.append((s["id"], e, e + 5 * d))
    for c in sec.d.get("chambers", []):
        L_, W_, H_ = (float(v) for v in c["size"])
        if not c.get("walk", True) or L_ * W_ < 150.0:
            continue
        ax_ = np.array(c.get("axis", [1.0, 0.0]), float)
        ax_ = np.array([ax_[0], ax_[1], 0.0]) / max(np.linalg.norm(ax_), 1e-9)
        cc = np.array(c["center"], float)
        e = cc - 0.4 * L_ * ax_ + np.array([0, 0, EYE])
        views.append((f"view_{c['id']}", e, cc + 0.25 * L_ * ax_ + np.array([0, 0, 0.3 * H_])))
    for c in sec.own:
        # a lake's basin and its rail, from standing height about 3 m out from the rail, looking down at the water
        if not (isinstance(c, core.Chamber) and c.kind == "lake"):
            continue
        ring = np.array(c.basin_ring())
        rr = float(np.max(np.hypot(ring[:, 0] - c.c[0], ring[:, 1] - c.c[1])))
        for ang in range(0, 360, 15):
            dv = np.array([math.cos(math.radians(ang)), math.sin(math.radians(ang)), 0.0])
            q = np.array([c.c[0], c.c[1], c.c[2] + 1.6]) + (rr + 3.0) * dv
            P = q[None, :] - np.outer(np.linspace(0.0, 3.0, 10), dv)
            if not np.all(sec.field_points(P) > 0.15):
                continue
            zs = q[2] - np.linspace(0.0, 2.5, 51)
            col = sec.field_points(np.column_stack([np.full(51, q[0]), np.full(51, q[1]), zs]))
            solid = np.nonzero(col <= 0)[0]
            if not len(solid):
                continue
            e = np.array([q[0], q[1], zs[solid[0]] + EYE])
            views.append((f"view_{c.id}", e, np.array([c.c[0], c.c[1], c.c[2] + 0.3])))
            break
    mouth_sp =[s for s in nodes["spawns"] if s["id"].startswith(f"{SCENE}_mouth_")]
    for p in nodes["portals"]:
        # from 3 m inside, looking at the portal (a gate's grille and vista, a seam's crossing); a gate's from the
        # side of its arrival in the cave, so the grille is seen from inside
        q = np.array(p["at"], float)
        best = None
        angs = list(range(0, 360, 15))
        if p["extras"].get("kind") == "cave_mouth" and mouth_sp:
            w = np.array(mouth_sp[0]["at"], float)[:2] - q[:2]
            angs.sort(key=lambda a_: -(math.cos(math.radians(a_)) * w[0] + math.sin(math.radians(a_)) * w[1]))
        for ang in angs:
            dv = np.array([math.cos(math.radians(ang)), math.sin(math.radians(ang)), 0.0])
            P = q[None, :] + np.outer(np.linspace(0.3, 3.0, 10), dv) + np.array([0, 0, 0.5])
            if np.all(sec.field_points(P) > 0.15):
                best = dv
                break
        if best is not None:
            h = EYE if sec.field_points((q + 3.0 * best + np.array([0, 0, EYE + 0.15]))[None, :])[0] > 0 else CRAWL_EYE
            e = q + 3.0 * best + np.array([0, 0, h])
            views.append((p["name"], e, q + np.array([0, 0, 0.6 * h])))
    for z in nodes["zones"]:
        c = np.array(z["at"])
        X = np.array([z["basis"][0][0], z["basis"][1][0], 0.0])
        sx = z["extras"]["size"][0]
        foot = c[2] - 0.5 * z["extras"]["size"][1]
        kind = z["extras"]["wdi_traverse"]
        if kind == "climb":
            Zo = -np.array([z["basis"][0][1], z["basis"][1][1], 0.0])
            # from 3.2 m out and to one side when the camera stands in air there, else straight out, nearer
            tgt = np.array([c[0], c[1], c[2] + 0.5 * z["extras"]["size"][1]])
            for back, side in ((3.2, 0.35 * sx), (3.2, 0.0), (2.2, 0.0), (1.4, 0.0)):
                e = np.array([c[0], c[1], foot]) + back * Zo + side * X + np.array([0, 0, EYE])
                line = e[None, :] + np.outer(np.linspace(0.0, 0.8, 5), tgt - e)
                if np.all(sec.field_points(line) > 0.1):
                    break
            views.append((z["name"], e, np.array([c[0], c[1], c[2] + 0.5 * z["extras"]["size"][1]])))
        else:
            e = c - (0.5 * sx + 1.2) * X
            e[2] = foot + 0.25 + (CRAWL_EYE + 0.2 if kind == "crawl" else EYE)
            views.append((z["name"], e, c + 0.5 * sx * X + np.array([0, 0, -0.1])))
    # along the walking passages, every ALONG_STEP m (at most ALONG_MAX): at eye height, looking on along the floor,
    # so the walls, the roof's formations and the floor's rock are seen as a walker meets them
    along = 0
    for p in sec.own:
        if not (isinstance(p, core.Passage) and p.walk and p.profile in core.WALK_PROFILES) or p.S < 8.0:
            continue
        for s0 in np.arange(0.5 * min(ALONG_STEP, p.S - 6.0), p.S - 6.0, ALONG_STEP):
            if along >= ALONG_MAX:
                break
            pts = []
            for s_ in (s0, s0 + 6.0):
                j = int(min(np.searchsorted(p.cum, s_, side="right") - 1, len(p.A) - 1))
                t_ = (s_ - p.cum[j]) / max(p.L[j], 1e-9)
                q = p.A[j] + t_ * (p.B[j] - p.A[j])
                base = float(p.floors(np.array([j]), np.array([t_]), np.zeros(1), True)[1][0])
                pts.append(np.array([q[0], q[1], base]))
            e = pts[0] + np.array([0.0, 0.0, EYE])
            t = pts[1] + np.array([0.0, 0.0, 0.9])
            if sec.field_points(np.stack([e, 0.5 * (e + t)]))[0] > 0.15:
                views.append((f"along_{p.id}_{int(s0)}", e, t))
                along += 1
    files = []
    cams = COL["cams"]
    for name, e, t in views:
        cam = bpy.data.objects.new(f"cam_{name}", bpy.data.cameras.new(f"cam_{name}"))
        cams.objects.link(cam)
        cam.data.sensor_fit = "VERTICAL"
        cam.data.angle_y = math.radians(70.0)
        cam.data.clip_start, cam.data.clip_end = 0.05, 300.0
        cam.location = Vector(e.tolist())
        cam.rotation_euler = (Vector(t.tolist()) - Vector(e.tolist())).to_track_quat("-Z", "Y").to_euler()
        sc.camera = cam
        p = os.path.join(out_dir, f"{area}_{name}.png")
        render_still(sc, p, 960, 540, we)
        files.append(p)
    # the top plan: the roof's back faces let the camera through
    for md in MATS.values():
        plan_tree(md["mat"])
    bx = np.array(sec.d["region"]["boxes"], float)
    x0, y0, x1, y1 = bx[:, 0].min(), bx[:, 1].min(), bx[:, 3].max(), bx[:, 4].max()
    cam = bpy.data.objects.new("cam_plan", bpy.data.cameras.new("cam_plan"))
    cams.objects.link(cam)
    cam.data.type = "ORTHO"
    w, h = x1 - x0, y1 - y0
    cam.data.ortho_scale = float(max(w, h) * 1.05)
    cam.data.clip_start, cam.data.clip_end = 0.1, 400.0
    cam.location = (0.5 * (x0 + x1), 0.5 * (y0 + y1), bx[:, 5].max() + 30.0)
    cam.rotation_euler = (0.0, 0.0, 0.0)
    sc.camera = cam
    for o in bpy.data.objects:
        if o.name.startswith((f"um_{sec.key}_vista", f"um_{sec.key}_outcrop")):
            o.hide_render = True
    p = os.path.join(out_dir, f"{area}_plan_top.png")
    px = 1200
    render_still(sc, p, px if w >= h else int(px * w / h), px if h >= w else int(px * h / w), we)
    files.append(p)
    return files


# ---------------------------------------------------------------- the run


def file_md5(path: str) -> str:
    h = hashlib.md5()
    with open(path, "rb") as fh:
        for b in iter(lambda: fh.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def design_gate(sec_d: dict) -> dict | None:
    p = os.path.join(os.path.dirname(os.path.abspath(ARGS.section)), "design.json")
    if not os.path.exists(p):
        return None
    d = json.load(open(p, encoding="utf-8"))
    for g in d.get("gates", []):
        if g.get("cave") == sec_d["key"] or g.get("cave_area") == f"under_{sec_d['key']}":
            return g
    return None


def parse(argv):
    ap = argparse.ArgumentParser(description="build one cave section's walk GLB")
    ap.add_argument("--section", required=True)
    ap.add_argument("--network", default=None)
    ap.add_argument("--out", default=os.path.join(HERE, "build", "caves"))
    ap.add_argument("--core", default=None, help="a saved <key>.core.npz instead of running the core")
    ap.add_argument("--samples", type=int, default=None)
    ap.add_argument("--no-bake", action="store_true")
    ap.add_argument("--raw", default=None, help="rebuild from a saved bake (<area>_raw.npz)")
    ap.add_argument("--glb", action="store_true")
    ap.add_argument("--stills", action="store_true")
    ap.add_argument("--stills-dir", default=None)
    ap.add_argument("--built", default="", help="comma-separated neighbour keys whose files exist")
    ap.add_argument("--E", type=float, default=None, help="the scene exposure the light is graded at")
    ap.add_argument("--blend", action="store_true", help="also save the .blend")
    ap.add_argument("--stitch", default="", help="neighbours' <area>_seam_light.npz files to blend the seams with")
    ap.add_argument("--journey", action="store_true", help="also write <area>_journey.glb (walker's nodes, no Draco)")
    ap.add_argument("--no-lightmap", action="store_true", help="the shell's light per vertex (COLOR_0), as route 3")
    ap.add_argument("--lm-tpm", type=float, default=None, help="the lightmap's texels per metre (else the rule's)")
    return ap.parse_args(argv)


ARGS = None


def main(argv) -> int:
    global ARGS
    ARGS = a = parse(argv)
    t_all = time.time()
    look = load_look()
    lt_ = look.get("lantern", {})
    SCAN_R3.update(lift=float(lt_.get("route3_texture_lift", 0.45)), pct=float(lt_.get("route3_dark_percentile", 0.5)))
    SCAN_CAP["mean_max"] = look["ink_lift"].get("texture_mean_max")
    os.makedirs(a.out, exist_ok=True)
    # 1. the core
    if a.core:
        z = np.load(a.core, allow_pickle=True)
        sec, warns = core.load_section(a.section, a.network)
        report = json.loads(str(z["report_json"]))
        log(f"core: loaded {a.core} (md5 {report['geometry_md5']})")
    else:
        res = core.build(a.section, out_dir=a.out, network_path=a.network, log=lambda *m: log(*m))
        sec = res["sec"]
        report = res["report"]
        z = np.load(os.path.join(a.out, f"{sec.key}.core.npz"), allow_pickle=True)
    if not report["ok"]:
        log("core report not ok:", report["problems"])
    net = sec.net
    aid = area_id(sec.d, net)
    zones = json.loads(str(z["zones_json"]))
    built = {k for k in a.built.split(",") if k}
    widths = {sm["id"]: seam_width(sec, sm) for sm in sec.d.get("seams", [])}
    nodes = contract_nodes(sec.d, net, zones, built, look, widths)
    for p in nodes["problems"]:
        log("contract problem:", p)
    # 2. the scene
    clear_scene()
    _rb()
    rb.P = ""
    gate_d = design_gate(sec.d)
    mouth_boxes = [o["box"] for o in sec.d.get("openings", []) if o["id"].startswith("mouth_")]
    mports = [p for p in (sec.d.get("portals") or []) if p.get("kind") == "cave_mouth"]
    frame = mouth_frame(mouth_boxes[0], mports[0]["at"], gate_d["grille"]) if (mouth_boxes and mports and gate_d) \
        else None
    mouth_boxes = [mouth_kit_boxes(b, frame) for b in mouth_boxes]
    objs, keys = build_shell(z, sec, look, a.out, mouth_boxes, mouth_kit_name(look["kits"], gate_d))
    forms = form_objects(z, sec, look, a.out)
    objs += forms
    objs += guard_pieces(z, sec, look, a.out)
    gate = gate_piece(sec, look, a.out, gate_d)
    for k_ in ("outcrop", "snow"):
        if gate.get(k_) is not None:
            objs.append(gate[k_])
    objs += gate.get("extras", [])
    others = [gate[k_] for k_ in ("grille", "lamp_housing", "lamp_iron") if gate.get(k_) is not None]
    caps(sec, {o["id"] for o in sec.d.get("openings", []) if o["id"].startswith("mouth_")})
    area_ob = bpy.data.objects.new(f"Area_{aid}", None)
    COL["nodes"].objects.link(area_ob)
    for k_, v in nodes["extras"].items():
        area_ob[k_] = v
    coll_ob, coll_tris = collision_object(z, aid, [gate.get("plug")] + list(gate.get("extra_coll", [])))
    empties(nodes, area_ob)
    groups = rig(sec, look, gate)
    finish_attrs(objs, float(look["ink_lift"].get("dark_gain", 1.0)))
    bake_objs = objs + [o for o in others if o.name.endswith("_grille")]
    hide = [coll_ob] + EXPORT_ONLY
    rb.prepare_attrs(bake_objs)
    planes = seam_planes(sec.d, built)
    shell = [o for o in objs if o.name.startswith(f"um_{sec.key}_chunk_")]
    use_lm = bool(shell) and not a.no_lightmap
    lmc = look.get("lightmap", {})
    if use_lm:
        lm_prepare(shell, lm_seams(sec.d, built), sec.key, a.lm_tpm)
        LM["lamps"] = [gate["lamp_at"]] if gate.get("lamp_at") is not None else []
    vobjs = [o for o in bake_objs if not (use_lm and o in shell)]
    lm_raw_path = os.path.join(a.out, f"{aid}_lm_raw.npz")
    tg, lsecs = None, {}
    # 3. the light
    t_bake = 0.0
    secs = {}
    samples = a.samples or int(look["cycles"]["samples"])
    raw_path = os.path.join(a.out, f"{aid}_raw.npz")
    if a.raw:
        g = rb.load_raw(a.raw, bake_objs)
        log(f"light: the saved bake {a.raw} ({rb.RAW_META.get('samples')} samples)")
        if use_lm:
            tg = lm_load_raw(a.raw[:-len("_raw.npz")] + "_lm_raw.npz" if a.raw.endswith("_raw.npz") else a.raw)
        ao = {n: d.pop("ao") for n, d in g.items() if "ao" in d}
        samples = rb.RAW_META.get("samples") or samples
        t_bake = rb.RAW_META.get("bakeSeconds") or 0.0
    elif a.no_bake:
        g = quick_groups(bake_objs, groups)
        ao = None
        if use_lm:
            tg = lm_quick(groups)
        log("light: --no-bake stand-in (unshadowed)")
    else:
        t0 = time.time()
        g, secs = bake_groups(vobjs, samples, hide, groups, bool(gate))
        ao = rb.run_bake_ao(vobjs, hide, float(look["ao"]["distance_m"]), int(look["ao"]["samples"]))
        secs["ao"] = None
        for n in g:
            g[n]["ao"] = ao[n]
        if use_lm:
            t1 = time.time()
            tg, lsecs = lm_bake_groups(samples, hide, groups, bool(gate), look["ao"])
            for gg, rows in tg.items():
                vv = lm_to_vertices(rows if rows.ndim == 2 else rows[:, None])
                for n, vals in vv.items():
                    g.setdefault(n, {})[gg] = (vals[:, 0] if rows.ndim == 1 else vals).astype(np.float32)
            lsecs["total"] = round(time.time() - t1, 1)
        t_bake = time.time() - t0
        meta = {"section": sec.key, "geometry_md5": report["geometry_md5"], "script": file_md5(__file__),
                "look": file_md5(LOOK_PATH), "device": rb._CYCLES_DEVICE.get("used", "CPU")}
        rb.save_raw(raw_path, bake_objs, g, samples, t_bake, meta)
        if use_lm:
            lm_save_raw(lm_raw_path, tg, samples, lsecs.get("total", 0.0), dict(meta, layout=LM["md5"]))
        ao = {n: d.pop("ao") for n, d in g.items()}
        log(f"bake: {t_bake:.1f} s at {samples} samples on {meta['device']}")
    E = a.E if a.E is not None else look.get("E")
    w_lamp = w_rule = 1.0
    if E is not None and gate.get("lamp_at") is not None and not a.no_bake:
        w_rule = lamp_weight(bake_objs, g, gate.get("lamp_at"), look, float(E))
        # the lantern's look keeps the placed lamps at their own strength (the highlights' easing caps the pool);
        # route 3 dimmed a lamp whose pool passed the look's lamp_pool display
        w_lamp = 1.0 if look.get("lantern", {}).get("keep_lamps") else w_rule
        log(f"lamp: the pool rule's weight {w_rule:.4g}, used {w_lamp:.4g}")
        if w_lamp < 1.0:
            for n_ in g:
                if "lamp" in g[n_]:
                    g[n_]["lamp"] = np.asarray(g[n_]["lamp"], np.float64) * w_lamp
        log(f"lamp: group weight {w_lamp:.4g} (its pool at the look's display at E)")
    summed = {o.name: sum(np.asarray(v, np.float64) for gg, v in g[o.name].items()) for o in bake_objs}
    E_pool = lamp_pool_E(bake_objs, summed, gate.get("lamp_at"), look)
    if E is None:
        E = E_pool if E_pool is not None else float(look["wdi_exposure"])
    log(f"exposure: E {E:.5g} (lamp pool {E_pool}), wdi_exposure {look['wdi_exposure']}")
    gr = grade(bake_objs, g, ao, look, float(E), a.no_bake)
    if use_lm:
        lm_grade(tg, look, float(E), gr["k"], a.no_bake, w_lamp)
    # the lantern's occlusion: the vertices' baked AO as `_occl` (written as `_OCCL`), the shell's included
    if ao is not None:
        for o in bake_objs:
            if o.name in ao:
                set_occlusion(o, occlusion_open(ao[o.name], look))
    # the grille: flat iron under its light
    for o in others:
        if o.name.endswith("_grille"):
            Lg = summed[o.name] if o.name in summed else np.zeros((len(o.data.vertices), 3))
            ink_t = gr["ink_target_luma"] / 255.0
            lamp = np.asarray(g[o.name]["lamp"], np.float64) if "lamp" in g.get(o.name, {}) else np.zeros_like(Lg)
            share = rb.lum(lamp) / np.maximum(rb.lum(Lg), 1e-12)
            col = iron_display(Lg, share, gr["k"], look, ink_t, rb.agx, rb.solve_display, rb.lum)
            rb.write_attr(o, col.astype(np.float32))
            MATS["cave_iron"]["kind"] = "vc"
            we_ = float(look["wdi_exposure"])
            gr["iron"] = {"display_luma_max": round(float(rb.lum(rb.agx(col * we_)).max()), 4),
                          "display_luma_min": round(float(rb.lum(rb.agx(col * we_)).min()), 4),
                          "lamp_share_mean": round(float(np.clip(share, 0, 1).mean()), 3)}
    if planes:
        n_dump = seam_dump(os.path.join(a.out, f"{aid}_seam_light.npz"), bake_objs, planes)
        log(f"seam light: {n_dump} vertices near the built seams written for the neighbour's stitch")
    if a.stitch:
        st = stitch(bake_objs, planes, [p for p in a.stitch.split(",") if p], gr["k"], float(E),
                    gr["ink_target_luma"] / 255.0)
        gr["stitch"] = st
        log(f"stitch: {st}")
    if use_lm:
        lm_finish(lm_seams(sec.d, built), look, a.out, aid, int(lmc.get("quality", 100)))
        if planes:
            LM["report"]["seam_probe_faces"] = lm_seam_probe(os.path.join(a.out, f"{aid}_seam_lm.npz"),
                                                             lm_seams(sec.d, built))
            LM["report"]["seam_vertex"] = seam_vertex_faces(shell, lm_seams(sec.d, built))
            log(f"seam faces drawn vertex-lit: {LM['report']['seam_vertex']}")
        LM["report"]["bake_seconds"] = lsecs
    lk = look_report(bake_objs, look, float(E))
    log(f"look: {lk}")
    water, wrep = water_objects(sec, look, float(E), gr["k"], bake_objs)
    if water:
        lk["water"] = wrep
        log(f"water: {wrep}")
    # 4. export
    out = {"section": sec.key, "area": aid, "core": {"geometry_md5": report["geometry_md5"], "ok": report["ok"],
                                                     "problems": report["problems"]},
           "nodes": {"spawns": [s["name"] for s in nodes["spawns"]], "portals": [p["name"] for p in nodes["portals"]],
                     "zones": [zz["name"] for zz in nodes["zones"]], "seams": nodes["seams"],
                     "closed_seams": nodes["closed_seams"], "problems": nodes["problems"]},
           "light": {"mode": "raw" if a.raw else ("none" if a.no_bake else "bake"), "samples": samples,
                     "bake_seconds": round(t_bake, 1), "group_seconds": secs,
                     "device": (rb.RAW_META.get("device") or "unknown") if a.raw
                     else rb._CYCLES_DEVICE.get("used", "CPU"), "grade": gr, "look": lk,
                     "E_lamp_pool": E_pool, "lamp_weight": round(w_lamp, 5), "lamp_weight_pool_rule": round(w_rule, 5),
                     "lightmap": LM.get("report") if use_lm else None},
           "materials": sorted({md.get("scan", name) for name, md in MATS.items()}),
           "scan_hold": dict(HOLD_LOG),
           "collision_triangles": coll_tris, "extras": nodes["extras"],
           "rock": {"moss": dict(MOSS), "formation_objects": {o.name: len(o.data.polygons) for o in forms},
                    "decor": report.get("formations", {}).get("decor")}}
    if a.glb:
        to_export(bake_objs + others + water, look)
        if "cave_iron" in MATS:
            unlit_iron = MATS["cave_iron"]["mat"]
            nt = unlit_iron.node_tree
            nt.nodes.clear()
            o_ = nt.nodes.new("ShaderNodeOutputMaterial")
            em = nt.nodes.new("ShaderNodeEmission")
            lp = nt.nodes.new("ShaderNodeLightPath")
            mx = nt.nodes.new("ShaderNodeMixShader")
            vc = nt.nodes.new("ShaderNodeVertexColor")
            vc.layer_name = ATTR
            nt.links.new(vc.outputs["Color"], em.inputs["Color"])
            nt.links.new(lp.outputs["Is Camera Ray"], mx.inputs[0])
            nt.links.new(nt.nodes.new("ShaderNodeBsdfTransparent").outputs[0], mx.inputs[1])
            nt.links.new(em.outputs[0], mx.inputs[2])
            nt.links.new(mx.outputs[0], o_.inputs["Surface"])
        glb = os.path.join(a.out, f"walk-{aid}.glb")
        export(glb, bake_objs + others + water, area_ob, coll_ob)
        before = os.path.getsize(glb)
        pages = []
        if use_lm:
            with open(LM["path"], "rb") as fh:
                pages.append({"bytes": fh.read(), "name": f"{aid}_lightmap", "scale": LM["scale"]})
        # a lightmapped material whose every face lies next to a built seam is drawn only as its _seamv copy
        in_glb = {m_.get("name") for m_ in lmap.read_glb(glb)[0].get("materials", [])}
        lit = {n_: 0 for n_ in LM.get("mats", []) if n_ in in_glb} if use_lm else {}
        patched = lmap.patch_glb(glb, pages if lit else [], lit, scene_extras={"wdi_lantern": True})
        out["glb"] = {"file": os.path.basename(glb), "bytes": os.path.getsize(glb),
                      "md5": file_md5(glb), "bytes_before_lightmap": before, "patch": patched,
                      "lightmap": lmap.glb_lightmap_facts(glb)}
        log(f"glb: {glb} ({os.path.getsize(glb) / 2 ** 20:.2f} MiB)")
        if a.journey:
            jp = os.path.join(a.out, f"{aid}_journey.glb")
            out["journey_glb"] = {"file": os.path.basename(jp), "bytes": export_journey(jp, area_ob, coll_ob)}
        if a.blend:
            bpy.ops.wm.save_as_mainfile(filepath=os.path.join(a.out, f"{aid}.blend"), compress=True)
    if a.stills:
        if use_lm:
            lm_still_trees()
        sd = a.stills_dir or os.path.join(a.out, "stills")
        os.makedirs(sd, exist_ok=True)
        out["stills"] = [os.path.basename(p) for p in stills(sec, nodes, look, sd, aid)]
    out["seconds"] = round(time.time() - t_all, 1)
    with open(os.path.join(a.out, f"{aid}_manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=2, default=float)
        fh.write("\n")
    log(f"done in {out['seconds']} s")
    return 0


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    sys.exit(main(argv))
