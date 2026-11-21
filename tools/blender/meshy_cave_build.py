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

LOOK_PATH = os.path.join(HERE, "meshy_looks", "cave_fp.json")
CACHE = os.path.join(HERE, ".cache", "materials")
BANNED = ("rope", "torch", "gallows", "crepe", "noose", "sconce", "crape", "georgette")
DISTRICT = "The Undermere"
SCENE = "undermere"
EYE, CRAWL_EYE = 1.6, 0.55
PORTAL_CLEAR, SEAM_ARRIVAL_CLEAR = 1.0, 1.2
GRILLE_PLUG = 0.1  # metres: the collision plug's thickness behind a gate's grille
ATTR = "wdi_light"
TINT_ATTR = "wdi_tint"
INK = (0x12, 0x14, 0x1C)


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
    """The passage's width where the seam wall closes it: the air across the plane at 0.5 m over the portal's floor
    (or at half the window's height when that is lower), from the core's field."""
    ax = 0 if sm["plane"]["axis"] == "x" else 1
    at = float(sm["plane"]["at"])
    u0, z0, u1, z1 = (float(v) for v in sm["window"])
    pz = float(sm["portal"][2])
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
    nodes = sec_d.get("nodes", {})
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
                   mouth_boxes: list) -> tuple:
    """Each face's material key, '<kit>_<wall|floor>': its geology's kit, the mouth kit inside a gate's mouth boxes,
    floor where the face looks up more than floor_nz. Returns (keys list, per-face index array)."""
    a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    n = np.cross(b - a, c - a)
    nz = n[:, 2] / np.maximum(np.linalg.norm(n, axis=1), 1e-12)
    floor = nz > floor_nz
    kit = np.array([g if g in kits else "default" for g in geo_names])[geo]
    cen = (a + b + c) / 3.0
    for bx in mouth_boxes:
        m = np.all((cen >= np.array(bx[:3])) & (cen <= np.array(bx[3:])), axis=1)
        kit = np.where(m, "mouth", kit)
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


def derive_scan(slug: str, out_dir: str, pct: float, lift: float = 0.45) -> dict:
    """A locked scan's diffuse, its darkest tail lifted to its `pct` percentile (luminance, keeping the hue) and its
    purple texels greened (green up to the lesser of red and blue), saved as a PNG beside the build and loaded. Returns
    the image and its linear mean and reference (darkest kept) colours."""
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
    # the darkest texels toward `lift` of the mean (meshy_room_build.lift_dark): a dim cave's mean texel then sits
    # a little over the ink floor that its darkest texel is held to, instead of far above it
    lin = _rb().lift_dark(lin, lift)
    lo = np.minimum(lin[:, 0], lin[:, 2])
    lin[:, 1] = np.maximum(lin[:, 1], lo)
    y = 0.2126 * lin[:, 0] + 0.7152 * lin[:, 1] + 0.0722 * lin[:, 2]
    ref = float(np.percentile(y, pct))
    s = np.where(y < ref, ref / np.maximum(y, 1e-6), 1.0)
    lin = np.minimum(lin * s[:, None], 1.0)
    y2 = 0.2126 * lin[:, 0] + 0.7152 * lin[:, 1] + 0.0722 * lin[:, 2]
    dark = lin[np.argsort(y2)[: max(1, len(y2) // 1000)]].mean(0)
    mean = lin.mean(0)
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
    return {"image": out, "mean": mean, "dark": dark, "ref_luma": ref, "path": path}


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


def unlit_tree(m, image=None, colour=None) -> None:
    """The export tree, in the shape the glTF exporter writes as KHR_materials_unlit: an emission (image x the
    COLOR_0 attribute, or a flat colour) mixed with a transparent BSDF by 'is camera ray' (meshy_room_build's)."""
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
    if image is not None:
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
            scans[slug] = derive_scan(slug, out_dir, pct, float(look["ink_lift"].get("texture_lift", 0.45)))
        m = bpy.data.materials.new(f"cave_{key}")
        m.use_nodes = True
        bake_tree(m)
        MATS[m.name] = {"mat": m, "scan": slug, "kind": "rock", **{k: scans[slug][k] for k in ("image", "mean", "dark")}}
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


def build_shell(z: dict, sec, look: dict, out_dir: str, mouth_boxes: list) -> tuple:
    """The shell's chunks: one mesh each, vertices split where two materials meet (the tint factor is per
    material), the core's UVs per face corner, the tint (linear albedo) as a point attribute for the bake."""
    Vq = z["shell_verts_q"]
    V = Vq / core.Q
    F = z["shell_faces"].astype(np.int64)
    geo_names = json.loads(str(z["geology"]))
    keys, fidx = face_materials(V, F, z["shell_face_geo"].astype(np.int64), geo_names, look["kits"],
                                float(look["floor_normal_z"]), mouth_boxes)
    mats = rock_materials(keys, look, out_dir)
    owner = first_chunk(z["chunk_offsets"], z["chunk_faces"], len(F))
    tint_lin = srgb_to_lin(np.clip(z["shell_tint"].astype(np.float64), 0.0, 1.0))
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
        objs.append(ob)
    return objs, keys


TEXFAC: dict = {}     # object name -> per-vertex 1 / scan mean (linear), so texture x COLOR_0 averages to the albedo
DARK: dict = {}       # object name -> per-vertex darkest kept texel x the factor x the albedo (linear)
MEANALB: dict = {}    # object name -> per-vertex albedo (linear)
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
                         float(look["ink_lift"].get("texture_lift", 0.45)))
        m = bpy.data.materials.new(f"cave_{key}")
        m.use_nodes = True
        bake_tree(m)
        MATS[m.name] = {"mat": m, "scan": slug, "kind": "rock", "image": sc["image"], "mean": sc["mean"],
                        "dark": sc["dark"]}
    md = MATS[f"cave_{key}"]
    ob = mesh_object(name, V, F, "cave", uvs=box_uvs(np.asarray(V, float), np.asarray(F), repeat), mats=[md["mat"]])
    alb = np.tile(hex_lin(albedo_hex), (len(ob.data.vertices), 1))
    set_point_colour(ob, TINT_ATTR, alb)
    TEXFAC[ob.name] = np.tile(1.0 / np.maximum(md["mean"], 1e-4), (len(ob.data.vertices), 1))
    return ob


def guard_pieces(z: dict, sec, look: dict, out_dir: str) -> list:
    """What the walker sees of the proxies: a rock kerb for a guard 0.15 m thick or more, a timber rail (posts and two
    bars) for a thinner one, a plank deck for a bridge."""
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
                    rail_parts.append(box_mesh((a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), base + 0.5 * h),
                                               0.05, 0.05, 0.5 * h, ux, uy))
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
        out.append(textured(f"um_{sec.key}_timber", V, F, kits["timber"], "#6B5440", look, out_dir, repeat=1.2))
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
    for i in range(n + 1):
        t = -0.5 * W + i * W / n
        c = (gmid[0] + t * along[0], gmid[1] + t * along[1], gz + 1.0)
        parts.append(box_mesh(c, 0.015, 0.015, 1.05, along[0], along[1]))
    for zz in (gz + 0.15, gz + 1.0, gz + 1.95):
        parts.append(box_mesh((gmid[0], gmid[1], zz), 0.5 * W + 0.05, 0.02, 0.025, along[0], along[1]))
    V, F = merge(parts)
    iron = bpy.data.materials.new("cave_iron")
    iron.use_nodes = True
    bake_tree(iron)
    MATS[iron.name] = {"mat": iron, "kind": "flat", "colour": hex_lin(look["iron"])}
    grille = mesh_object(f"um_{sec.key}_grille", V, F, "cave", mats=[iron])
    set_point_colour(grille, TINT_ATTR, np.tile(hex_lin(look["iron"]), (len(grille.data.vertices), 1)))
    # the lamp: a housing on the cave side above the grille, its glass an emitter at its display colour
    lamp_at = np.array([gmid[0] + 0.25 * inward[0], gmid[1] + 0.25 * inward[1], gz + 2.05])
    hv, hf = box_mesh(tuple(lamp_at), 0.09, 0.09, 0.12, along[0], along[1])
    glass_c = hex_lin(look["lamp"]["glass_display"])
    glass = flat_material("cave_lamp_glass", glass_c, emit=False)
    MATS[glass.name] = {"mat": glass, "kind": "emit", "display": glass_c}
    housing = mesh_object(f"um_{sec.key}_lamp", hv, hf, "cave", mats=[glass])
    EXPORT_ONLY.append(housing)   # the bake's lamp stands inside it: drawn in the GLB, hidden from the bake
    # the outcrop face: a grid on the opening's plane, with holes where the shell's air meets it
    ob_ = op["box"]
    yface = float(ob_[1])
    xs = np.arange(ob_[0] - 3.0, ob_[3] + 3.0 + 1e-9, 0.125)
    zs = np.arange(ob_[2] - 1.5, ob_[5] + 3.0 + 1e-9, 0.125)
    Xg, Zg = np.meshgrid(xs, zs, indexing="ij")
    P = np.stack([Xg.ravel(), np.full(Xg.size, yface - 0.2), Zg.ravel()], 1)
    air = (sec.field_points(P) > 0).reshape(Xg.shape)
    quads = []
    for i in range(len(xs) - 1):
        for j in range(len(zs) - 1):
            if not (air[i, j] or air[i + 1, j] or air[i, j + 1] or air[i + 1, j + 1]):
                quads.append((i, j))
    Vo, Fo = [], []
    for i, j in quads:
        b = len(Vo)
        Vo += [(xs[i], yface - 0.2, zs[j]), (xs[i + 1], yface - 0.2, zs[j]), (xs[i + 1], yface - 0.2, zs[j + 1]),
               (xs[i], yface - 0.2, zs[j + 1])]
        Fo += [(b, b + 1, b + 2), (b, b + 2, b + 3)]   # facing -y, out of the knoll
    out = {"grille": grille, "lamp_housing": housing, "lamp_at": lamp_at.tolist(), "plug": None}
    if Vo:
        out["outcrop"] = textured(f"um_{sec.key}_outcrop", np.array(Vo), np.array(Fo), look["kits"]["mouth"]["wall"],
                                  "#6E6A60", look, out_dir, repeat=2.0)
    # the vista: snow ground in front of the knoll and a backdrop of night sky
    g0 = float(ob_[2]) + 0.1
    sv, sf = [], []
    R = 40.0
    cx = 0.5 * (ob_[0] + ob_[3])
    for i, (x0, x1) in enumerate(((cx - R, cx + R),)):
        sv = [(x0, yface - 0.2, g0), (x1, yface - 0.2, g0), (x1, yface - R, g0 - 1.5), (x0, yface - R, g0 - 1.5)]
        sf = [(0, 2, 1), (0, 3, 2)]
    snow = textured(f"um_{sec.key}_vista_snow", np.array(sv), np.array(sf), look["kits"]["snow"], look["sky"]["snow"],
                    look, out_dir, repeat=3.0)
    bd = hex_lin(look["sky"]["backdrop_display"])
    back = flat_material("cave_vista_sky", bd)
    MATS[back.name] = {"mat": back, "kind": "emit", "display": bd}
    bv = [(cx - R, yface - R, g0 - 2.0), (cx + R, yface - R, g0 - 2.0), (cx + R, yface - R, g0 + 30.0),
          (cx - R, yface - R, g0 + 30.0)]
    sky = mesh_object(f"um_{sec.key}_vista_sky", np.array(bv), np.array([(0, 1, 2), (0, 2, 3)]), "cave", mats=[back])
    EXPORT_ONLY.append(sky)   # the world's sky lights the bake; the backdrop is drawn only in the GLB
    out.update(snow=snow, sky=sky)
    # the collision plug just behind the grille (away from the cave side)
    pc = (gmid[0] - (GRILLE_PLUG * 0.5 + 0.02) * inward[0], gmid[1] - (GRILLE_PLUG * 0.5 + 0.02) * inward[1], gz + 1.3)
    out["plug"] = box_mesh(pc, 0.5 * W + 0.6, 0.5 * GRILLE_PLUG, 2.0, along[0], along[1])
    return out


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
        if o.name not in TEXFAC:
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


def grade(objs: list, groups: dict, ao: dict | None, look: dict, E: float, no_bake: bool) -> dict:
    """The cave's post bake: denoise, the groups by weight, AO, the ink floor on the display (meshy_room_build's
    solve_display through three r186's AgX), lilac and teal guards, highlights eased; COLOR_0 = k x light x the
    per-material factor, with k = E / wdi_exposure (the network's exposure is fixed)."""
    R = _rb()
    we = float(look["wdi_exposure"])
    k = E / we
    il = look["ink_lift"]
    ink_t = (float(R.lum(np.array(INK, float))) + float(il["margin_luma"])) / 255.0
    form, form_ao, fg = float(il["form"]), float(il["form_ao"]), float(il["form_gamma"])
    hot_knee, hot_max = float(look["hot"]["knee"]), float(look["hot"]["max"])
    fl_n = hex_lin(look["fill"]["colour"])
    fl_n = fl_n / R.lum(fl_n)
    wts = look["weights"]
    aoc = look["ao"]
    rep = {"E": E, "k": k, "wdi_exposure": we, "ink_target_luma": round(ink_t * 255, 2), "vertices": 0,
           "below_floor": 0, "hot_eased": 0, "max_color0": 0.0}
    for o in objs:
        if o.name not in TEXFAC:
            continue
        gs = groups[o.name]
        L = sum(float(wts.get(g, 1.0)) * np.asarray(v, np.float64) for g, v in gs.items() if g != "ao")
        if not isinstance(L, np.ndarray):
            L = np.zeros((len(o.data.vertices), 3))
        if not no_bake:
            L = R.denoise(o, L.astype(np.float32)).astype(np.float64)
        open_sky = np.ones(len(L))
        if ao is not None and o.name in ao:
            open_sky = np.clip(ao[o.name], 0.0, 1.0) ** float(aoc["gamma"])
            L = L * (1.0 - aoc["strength"] + aoc["strength"] * open_sky)[:, None]
        L = guard_display(L)
        have = R.lum(L)
        chroma = np.where((have > 1e-9)[:, None], L / np.maximum(have, 1e-12)[:, None], fl_n[None, :])
        dark = DARK[o.name]
        Lf = R.solve_display(E * dark * fl_n[None, :], ink_t)
        m = 1.0 + form * ((1.0 - form_ao) + form_ao * open_sky ** fg)
        L2 = np.sqrt((chroma * have[:, None]) ** 2 + (fl_n[None, :] * (Lf * m)[:, None]) ** 2)
        L2 = guard_display(L2)
        low = R.lum(R.agx(E * dark * L2)) < ink_t - 2e-4
        if low.any():
            L2[low] *= R.solve_display(E * dark[low] * L2[low], ink_t, lo=1.0, hi=64.0, iters=30)[:, None]
        alb = MEANALB[o.name]
        d = R.lum(R.agx(E * alb * L2))
        over = d > hot_knee
        if over.any():
            want = hot_knee + (hot_max - hot_knee) * np.tanh((d[over] - hot_knee) / (hot_max - hot_knee))
            L2[over] *= R.solve_display(E * alb[over] * L2[over], want, lo=1e-3, hi=1.0, iters=30)[:, None]
            rep["hot_eased"] += int(over.sum())
        rep["vertices"] += len(L2)
        rep["below_floor"] += int((have < Lf).sum())
        DISP.append(R.lum(R.agx(E * alb * L2)))
        RAWD.append(R.lum(R.agx(E * alb * np.maximum(L, 1e-12))))
        c0 = (L2 * k * TEXFAC[o.name] * MEANALB[o.name]).astype(np.float32)   # texture x COLOR_0 ~ k L albedo
        rep["max_color0"] = max(rep["max_color0"], float(c0.max()))
        R.write_attr(o, c0)
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
SEAM_BAND = 1.0   # metres each side of a seam plane over which the two files' graded light is blended


def seam_planes(sec_d: dict, built: set) -> list:
    """(seam id, axis, plane, sign) for each seam whose neighbour is built; sign +1 when the neighbour lies on +."""
    out = []
    for sm in sec_d.get("seams", []):
        if sm["neighbour"] in built:
            out.append((sm["id"], 0 if sm["plane"]["axis"] == "x" else 1, float(sm["plane"]["at"]),
                        1.0 if sm["plane"].get("toward", "+") == "+" else -1.0))
    return out


def stitch_weight(P: np.ndarray, ax: int, at: float, sign: float) -> np.ndarray:
    """The neighbour's share of a vertex's light at a seam: 0 a metre or more inside this file, 0.5 on the plane, 1 a
    metre or more into the neighbour's side (its stub). The neighbour's file gets 1 minus it at the same point, so
    the two blends are the same number."""
    s = (P[:, ax] - at) * sign
    return np.clip(0.5 + 0.5 * s / SEAM_BAND, 0.0, 1.0)


def seam_dump(path: str, objs: list, planes: list, reach: float = 12.0) -> int:
    """The graded light (before k and the texture factor) of every vertex within `reach` of a seam plane, keyed by
    its position in 1e-5 m: what the neighbour's build blends with (--stitch)."""
    keys, Ls = [], []
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
    K = np.concatenate(keys) if keys else np.zeros((0, 3), np.int64)
    L = np.concatenate(Ls) if Ls else np.zeros((0, 3), np.float32)
    np.savez_compressed(path, keys=K, light=L)
    return int(len(K))


def stitch(objs: list, planes: list, dumps: list, k: float) -> dict:
    """Blends each file's graded light with its neighbour's (their seam_dump) across every built seam, the same way
    in both files, and writes COLOR_0 again. Vertices the neighbour does not have (where its stub is clipped, or past
    its region) keep their own light."""
    table = {}
    for path in dumps:
        z = np.load(path)
        for key, L in zip(map(tuple, z["keys"].tolist()), z["light"]):
            table[key] = L
    rep = {"vertices_in_band": 0, "matched": 0}
    for o in objs:
        if o.name not in LIGHT_OUT:
            continue
        co = np.empty(len(o.data.vertices) * 3, np.float32)
        o.data.vertices.foreach_get("co", co)
        P = co.reshape(-1, 3).astype(np.float64)
        L2 = LIGHT_OUT[o.name].copy()
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
                    L2[j] = (1.0 - t[j]) * L2[j] + t[j] * other
                    rep["matched"] += 1
                    changed = True
        if changed:
            LIGHT_OUT[o.name] = L2
            _rb().write_attr(o, (L2 * k * TEXFAC[o.name] * MEANALB[o.name]).astype(np.float32))
    return rep


def look_report(objs: list, look: dict, E: float) -> dict:
    """The look as the viewer will show it, per vertex: the darkest kept texel and the mean texel under the light,
    through AgX at the network exposure. Under ink, and lilac or magenta, are counted."""
    R = _rb()
    ink_luma = float(R.lum(np.array(INK, float))) / 255.0
    under = total = 0
    lil = []
    for o in objs:
        if o.name not in LIGHT_OUT:
            continue
        L2 = LIGHT_OUT[o.name]
        dd = R.agx(E * DARK[o.name] * L2)
        under += int((R.lum(dd) < ink_luma - 1e-4).sum())
        total += len(L2)
        lil.append(R.agx(E * MEANALB[o.name] * L2))
        lil.append(dd)
    allc = np.concatenate(lil) if lil else np.zeros((0, 3))
    return {"vertices": total, "dark_texel_under_ink": under, "lilac_share": round(lilac_share(allc), 6)}


def finish_attrs(objs: list) -> None:
    """Per vertex: the albedo (linear tint), the darkest kept texel under it (for the ink floor)."""
    for o in objs:
        if o.name not in TEXFAC:
            continue
        a = o.data.color_attributes[TINT_ATTR]
        c = np.empty(len(a.data) * 4, np.float32)
        a.data.foreach_get("color", c)
        alb = c.reshape(-1, 4)[:, :3].astype(np.float64)
        rows = np.zeros((len(alb), 3))
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
        MEANALB[o.name] = alb
        DARK[o.name] = rows * alb


def to_export(objs: list, look: dict) -> None:
    we = float(look["wdi_exposure"])
    for name, md in MATS.items():
        m = md["mat"]
        if md["kind"] == "rock":
            unlit_tree(m, image=md["image"])
        elif md["kind"] == "flat":
            unlit_tree(m, image=None, colour=(0.0, 0.0, 0.0))
        elif md["kind"] == "emit":
            unlit_tree(m, image=None, colour=np.minimum(md["display"] / we, 1.0))
    for o in objs:
        me = o.data
        if TINT_ATTR in me.color_attributes:
            me.color_attributes.remove(me.color_attributes[TINT_ATTR])


def export(path: str, objs: list, area_ob, coll_ob) -> int:
    R = _rb()
    for o in list(bpy.data.objects):
        if o.type in ("LIGHT", "CAMERA") or o in BAKE_ONLY:
            o.hide_render = True
    for o in EXPORT_ONLY:
        o.hide_render = False
    for o in objs + EXPORT_ONLY:
        o.parent = area_ob
    coll_ob.parent = None
    return R.export_glb(path)


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
    for p in nodes["portals"]:
        # from 3 m inside, looking at the portal (a gate's grille and vista, a seam's crossing)
        q = np.array(p["at"], float)
        best = None
        for ang in range(0, 360, 15):
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
            e = np.array([c[0], c[1], foot]) + 2.2 * Zo + np.array([0, 0, EYE])
            views.append((z["name"], e, np.array([c[0], c[1], c[2] + 0.5 * z["extras"]["size"][1]])))
        else:
            e = c - (0.5 * sx + 1.2) * X
            e[2] = foot + 0.25 + (CRAWL_EYE + 0.2 if kind == "crawl" else EYE)
            views.append((z["name"], e, c + 0.5 * sx * X + np.array([0, 0, -0.1])))
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
        R.render_png(sc, p, 960, 540, exposure=we)
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
    for nm_ in ("vista_sky", "vista_snow", "outcrop"):
        o = bpy.data.objects.get(f"um_{sec.key}_{nm_}")
        if o is not None:
            o.hide_render = True
    p = os.path.join(out_dir, f"{area}_plan_top.png")
    px = 1200
    R.render_png(sc, p, px if w >= h else int(px * w / h), px if h >= w else int(px * h / w), exposure=we)
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
    return ap.parse_args(argv)


ARGS = None


def main(argv) -> int:
    global ARGS
    ARGS = a = parse(argv)
    t_all = time.time()
    look = load_look()
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
    mouth_boxes = [[b[0] - 1.0, b[1] - 0.5, b[2] - 0.5, b[3] + 1.0, b[4] + 2.5, b[5] + 0.5] for b in mouth_boxes]
    objs, keys = build_shell(z, sec, look, a.out, mouth_boxes)
    objs += guard_pieces(z, sec, look, a.out)
    gate = gate_piece(sec, look, a.out, gate_d)
    for k_ in ("outcrop", "snow"):
        if gate.get(k_) is not None:
            objs.append(gate[k_])
    others = [gate[k_] for k_ in ("grille", "lamp_housing") if gate.get(k_) is not None]
    caps(sec, {o["id"] for o in sec.d.get("openings", []) if o["id"].startswith("mouth_")})
    area_ob = bpy.data.objects.new(f"Area_{aid}", None)
    COL["nodes"].objects.link(area_ob)
    for k_, v in nodes["extras"].items():
        area_ob[k_] = v
    coll_ob, coll_tris = collision_object(z, aid, [gate.get("plug")])
    empties(nodes, area_ob)
    groups = rig(sec, look, gate)
    finish_attrs(objs)
    bake_objs = objs + [o for o in others if o.name.endswith("_grille")]
    hide = [coll_ob] + EXPORT_ONLY
    rb.prepare_attrs(bake_objs)
    # 3. the light
    t_bake = 0.0
    secs = {}
    samples = a.samples or int(look["cycles"]["samples"])
    raw_path = os.path.join(a.out, f"{aid}_raw.npz")
    if a.raw:
        g = rb.load_raw(a.raw, bake_objs)
        log(f"light: the saved bake {a.raw} ({rb.RAW_META.get('samples')} samples)")
        ao = {n: d.pop("ao") for n, d in g.items() if "ao" in d}
        samples = rb.RAW_META.get("samples") or samples
        t_bake = rb.RAW_META.get("bakeSeconds") or 0.0
    elif a.no_bake:
        g = quick_groups(bake_objs, groups)
        ao = None
        log("light: --no-bake stand-in (unshadowed)")
    else:
        t0 = time.time()
        g, secs = bake_groups(bake_objs, samples, hide, groups, bool(gate))
        ao = rb.run_bake_ao(bake_objs, hide, float(look["ao"]["distance_m"]), int(look["ao"]["samples"]))
        secs["ao"] = None
        t_bake = time.time() - t0
        for n in g:
            g[n]["ao"] = ao[n]
        meta = {"section": sec.key, "geometry_md5": report["geometry_md5"], "script": file_md5(__file__),
                "look": file_md5(LOOK_PATH), "device": rb._CYCLES_DEVICE.get("used", "CPU")}
        rb.save_raw(raw_path, bake_objs, g, samples, t_bake, meta)
        ao = {n: d.pop("ao") for n, d in g.items()}
        log(f"bake: {t_bake:.1f} s at {samples} samples on {meta['device']}")
    summed = {o.name: sum(np.asarray(v, np.float64) for gg, v in g[o.name].items()) for o in bake_objs}
    E = a.E if a.E is not None else look.get("E")
    E_pool = lamp_pool_E(bake_objs, summed, gate.get("lamp_at"), look)
    if E is None:
        E = E_pool if E_pool is not None else float(look["wdi_exposure"])
    log(f"exposure: E {E:.5g} (lamp pool {E_pool}), wdi_exposure {look['wdi_exposure']}")
    gr = grade(bake_objs, g, ao, look, float(E), a.no_bake)
    # the grille: flat iron under its light
    for o in others:
        if o.name.endswith("_grille"):
            Lg = summed[o.name] if o.name in summed else np.zeros((len(o.data.vertices), 3))
            ink_t = gr["ink_target_luma"] / 255.0
            base = np.tile(hex_lin(look["iron"]), (len(Lg), 1))
            Lf = rb.solve_display(float(E) * base, ink_t)
            L2 = np.sqrt(Lg ** 2 + Lf[:, None] ** 2)
            rb.write_attr(o, (guard_display(guard_display(L2) * base) * gr["k"]).astype(np.float32))
            MATS["cave_iron"]["kind"] = "vc"
    planes = seam_planes(sec.d, built)
    if planes:
        n_dump = seam_dump(os.path.join(a.out, f"{aid}_seam_light.npz"), bake_objs, planes)
        log(f"seam light: {n_dump} vertices near the built seams written for the neighbour's stitch")
    if a.stitch:
        st = stitch(bake_objs, planes, [p for p in a.stitch.split(",") if p], gr["k"])
        gr["stitch"] = st
        log(f"stitch: {st}")
    lk = look_report(bake_objs, look, float(E))
    log(f"look: {lk}")
    # 4. export
    out = {"section": sec.key, "area": aid, "core": {"geometry_md5": report["geometry_md5"], "ok": report["ok"],
                                                     "problems": report["problems"]},
           "nodes": {"spawns": [s["name"] for s in nodes["spawns"]], "portals": [p["name"] for p in nodes["portals"]],
                     "zones": [zz["name"] for zz in nodes["zones"]], "seams": nodes["seams"],
                     "closed_seams": nodes["closed_seams"], "problems": nodes["problems"]},
           "light": {"mode": "raw" if a.raw else ("none" if a.no_bake else "bake"), "samples": samples,
                     "bake_seconds": round(t_bake, 1), "group_seconds": secs,
                     "device": rb._CYCLES_DEVICE.get("used", "CPU"), "grade": gr, "look": lk,
                     "E_lamp_pool": E_pool},
           "materials": sorted({md.get("scan", name) for name, md in MATS.items()}),
           "collision_triangles": coll_tris, "extras": nodes["extras"]}
    if a.glb:
        to_export(bake_objs + others, look)
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
        export(glb, bake_objs + others, area_ob, coll_ob)
        out["glb"] = {"file": os.path.basename(glb), "bytes": os.path.getsize(glb),
                      "md5": file_md5(glb)}
        log(f"glb: {glb} ({os.path.getsize(glb) / 2 ** 20:.2f} MiB)")
        if a.journey:
            jp = os.path.join(a.out, f"{aid}_journey.glb")
            out["journey_glb"] = {"file": os.path.basename(jp), "bytes": export_journey(jp, area_ob, coll_ob)}
        if a.blend:
            bpy.ops.wm.save_as_mainfile(filepath=os.path.join(a.out, f"{aid}.blend"), compress=True)
    if a.stills:
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
