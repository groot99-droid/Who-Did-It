"""Room check (the contract and the collision): what cc_geom.py cannot see. Read-only, in Blender.

The collision is footprint boxes in layers of height (low parts get boxes as tall as they are), open cabinet doors
collide and decor pieces stand in the room. cc_geom.py's flood fill keeps the feet on z = 0, so it cannot see a climb;
this script adds:
  1. step-up: no collision face between the floor and one step (0.35 m), and a flood fill over (cell, feet height) with
     the viewer's settle() (five rays, 0.70 m reach) and its fall, which finds any furniture top the player could reach;
  2. the eye: at every reachable cell the eye (1.6 m) keeps clear of the visible meshes by more than the near plane's
     corner (near 0.05, fov 70: 0.087 m at 16:9, 0.102 m at 21:9), so the camera never looks inside a mesh;
  3. free floor that the spawn cannot reach (pockets cut off by collision), with their tiles;
  4. every scene spot and prop: the nearest reachable standing point to its piece and to the front of the piece;
  5. the candle's light against its flame mesh; banned words in every name;
  6. pieces that cut into each other or the shell, and objects that float.
Usage: bash tools/blender/bl.sh -b --factory-startup -P tools/blender/room_checks/r7_extra.py --
           <roomId> [--glb F] [--scene F] [--manifest F] [--out DIR] [--config F]                  (roomcfg.py)
<out> must hold cc_grid.npz written by cc_geom.py from the same GLB. Writes <out>/r7_extra.json.
Reuses cc_geom.py's decode and collision-box sections (the GLB parser and the glTF add-on's Draco bridge;
`roomcfg.cc_geom_head`). What it knows of the room comes from the builder's manifest and the scene (G2b): the flood
starts at every spawn; a spot or prop stands for the piece the manifest's `coverage` names (an opening's prop, such as
a window's drapes, has no piece to walk up to; a manifest without `coverage` keeps the bedroom's two aliases); a spot
the room skips is left out of the approach rule (a piece hung on a wall, `rise`, is not: the bedroom's photographs over
the bed's head are its judged failure); the objects hung on purpose (a
piece with `rise`, the photographs builder's frames, the cloths over a piece, the openings' joinery) are left out of the floating test; every point
light with an anchor is held to its flame or its firebox; the banned words are `roomcfg.BANNED` and the check file's.
"""
import json
import math
import os
import re
import sys
from collections import deque

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import roomcfg  # noqa: E402

H = roomcfg.cc_geom_head("shell measures")
np, Vector, log, r4, tile_centre, bvh_of = H["np"], H["Vector"], H["log"], H["r4"], H["tile_centre"], H["bvh_of"]
ARGS, ROOM, GLB, OUTD, J, scene, SID, PFX = (H[k] for k in ("ARGS", "ROOM", "GLB", "OUTD", "J", "scene", "SID", "PFX"))
F = H["F"]
FX0, FX1, FY0, FY1, CEIL = H["FX0"], H["FX1"], H["FY0"], H["FY1"], H["CEIL"]
RADIUS, STEP, SNAP, EYE, AX0, AX1 = (H[k] for k in ("RADIUS", "STEP", "SNAP", "EYE", "AX0", "AX1"))
nodes, world_m, G2B, PR, GLASS, INTERIOR = (H[k] for k in ("nodes", "world_m", "G2B", "PR", "GLASS", "INTERIOR"))
BV_I, OWN_I, VC, BOX, BMIN, BMAX, seg_box_dist = (H[k] for k in ("BV_I", "OWN_I", "VC", "BOX", "BMIN", "BMAX",
                                                                  "seg_box_dist"))
with open(ARGS.manifest, encoding="utf-8") as fh:
    MAN = json.load(fh)
G = np.load(os.path.join(OUTD, "cc_grid.npz"))
xs, ys, REACH, FREE, DC = G["xs"], G["ys"], G["REACH"], G["FREE"], G["DC"]
CELL = float(round(xs[1] - xs[0], 4))
NY, NX = REACH.shape
X = {"file": roomcfg.shown(GLB), "checks": {}}
XF = []


def xcheck(name, ok, **info):
    X["checks"][name] = dict(ok=bool(ok), **info)
    if not ok:
        XF.append(name)
    log(("PASS " if ok else "FAIL ") + name, json.dumps(info, default=str)[:700])


# ------------------------------------------------------------------------------------------- 1. step-up
zc = VC[:, 2]
between = (zc > 1e-3) & (zc <= STEP + 1e-6)     # a face the ground rays (from 0.35 m, downward) could land on from the floor
tops = np.array([b["max"][2] for b in BOX if b["kind"] == "furniture"])
xcheck("no_collision_face_within_a_step_of_the_floor", int(between.sum()) == 0 and float(tops.min()) > STEP + 1e-4,
       collision_vertices_between_floor_and_0_35=int(between.sum()),
       collision_vertices_between_0_35_and_0_70=int(((zc > STEP + 1e-6) & (zc <= STEP + SNAP)).sum()), lowest_furniture_top=round(float(tops.min()), 4),
       tops_under_foot_sphere_centre_0_65=int((tops < AX0).sum()), furniture_boxes=int(len(tops)),
       note="the ground rays start 0.35 m above the feet and reach 0.70 m down; a top above 0.35 m is never stood on")


def ground_at(x, y, feet, reach):
    """settle(): five rays from feet + STEP straight down `reach`; DoubleSide, so a ray that starts inside a box meets its
    bottom face. The highest hit, or None."""
    top = feet + STEP
    g = None
    for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
        px, py = x + dx * 0.21, y + dy * 0.21
        ins = (BMIN[:, 0] <= px) & (px <= BMAX[:, 0]) & (BMIN[:, 1] <= py) & (py <= BMAX[:, 1])
        best = None
        for k in np.nonzero(ins)[0]:
            for zf in (BMAX[k, 2], BMIN[k, 2]):
                if zf <= top + 1e-9 and (best is None or zf > best):
                    best = float(zf)                      # the first face under the ray's origin in this column
        if best is not None and best >= top - reach - 1e-9 and (g is None or best > g):
            g = best
    return g


def free_at(x, y, feet):
    return bool(seg_box_dist(x, y, feet + AX0, feet + AX1).min() >= RADIUS - 1e-6)


seen = set()                                               # the flood starts at every spawn
for sp_i in [i for i, n in enumerate(nodes) if n.get("name", "").startswith("Spawn_")]:
    spw = G2B @ world_m(sp_i)[:3, 3]
    seen.add((int(round((spw[1] - ys[0]) / CELL)), int(round((spw[0] - xs[0]) / CELL)), 0.0))
q = deque(sorted(seen))
levels = {0.0: len(seen)}
climbs = []
while q:
    j, i, g = q.popleft()
    for dj, di in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        jj, ii = j + dj, i + di
        if not (0 <= jj < NY and 0 <= ii < NX):
            continue
        x2, y2 = float(xs[ii]), float(ys[jj])
        g2 = ground_at(x2, y2, g, STEP + SNAP)
        if g2 is None:                                     # off a ledge: falls to the first ground under the probes
            g2 = ground_at(x2, y2, g, 1e3)
            if g2 is None:
                continue
        g2 = round(g2, 3)
        if g2 - g > STEP + 1e-6 or not free_at(x2, y2, g2):
            continue
        key = (jj, ii, g2)
        if key in seen:
            continue
        seen.add(key)
        levels[g2] = levels.get(g2, 0) + 1
        if g2 > 1e-3 and len(climbs) < 12:
            climbs.append([x2, y2, g2])
        q.append(key)
lv0 = np.zeros((NY, NX), bool)
for (j, i, g) in seen:
    if abs(g) < 1e-3:
        lv0[j, i] = True
diag_only = int((REACH & ~lv0).sum())                      # cc_geom's fill also steps diagonally
xcheck("no_climb_onto_furniture_3d_flood", set(levels) == {0.0},
       feet_heights_reached={str(k): v for k, v in sorted(levels.items())}, states=len(seen), first_climbs=climbs,
       cells_at_floor_level=int(lv0.sum()), cc_geom_reach_cells=int(REACH.sum()),
       cc_geom_cells_this_fill_misses=diag_only, cells_only_this_fill=int((lv0 & ~REACH).sum()))

# ------------------------------------------------------------------------------------------- 2. the eye
BV_G, OWN_G, _, _ = bvh_of(GLASS) if GLASS else (None, [], None, None)
rj, ri = np.nonzero(REACH)
ED = np.full(len(rj), np.inf)
EW = [""] * len(rj)
for k, (j, i) in enumerate(zip(rj, ri)):
    p = Vector((float(xs[i]), float(ys[j]), EYE))
    h = BV_I.find_nearest(p, 0.6)
    if h[0] is not None:
        ED[k], EW[k] = h[3], OWN_I[h[2]]
    if BV_G is not None:
        hg = BV_G.find_nearest(p, 0.6)
        if hg[0] is not None and hg[3] < ED[k]:
            ED[k], EW[k] = hg[3], OWN_G[hg[2]]
NEAR, TAN = 0.05, math.tan(math.radians(35.0))
corner = {a: NEAR * math.sqrt(1 + TAN * TAN * (1 + r * r)) for a, r in (("16:9", 16 / 9), ("21:9", 21 / 9), ("32:9", 32 / 9),
                                                                      ("9:19.5", 9 / 19.5))}
order = np.argsort(ED)[:8]
by_obj = {}
for k in np.nonzero(ED < 0.20)[0]:
    e = by_obj.setdefault(EW[k], dict(cells=0, min=9.0, at=None))
    e["cells"] += 1
    if ED[k] < e["min"]:
        e["min"], e["at"] = round(float(ED[k]), 4), [float(xs[ri[k]]), float(ys[rj[k]])]
xcheck("eye_clear_of_visible_meshes_beyond_the_near_plane", float(ED.min()) > corner["21:9"],
       eye_z=EYE, min_m=round(float(ED.min()), 4), p1_m=round(float(np.percentile(ED[np.isfinite(ED)], 1)), 4),
       near_plane_corner_m={k: round(v, 4) for k, v in corner.items()},
       cells_closer_than={k: int((ED < v).sum()) for k, v in corner.items()},
       closest=[dict(at=[float(xs[ri[k]]), float(ys[rj[k]])], m=round(float(ED[k]), 4), obj=EW[k]) for k in order],
       closer_than_20cm_by_object=dict(sorted(by_obj.items(), key=lambda kv: kv[1]["min"])))

# ------------------------------------------------------------------------------------------- 3. pockets
inside = (xs[None, :] > FX0) & (xs[None, :] < FX1) & (ys[:, None] > FY0) & (ys[:, None] < FY1)
pocket = FREE & ~REACH & inside
lab = np.zeros((NY, NX), int)
comps = []
for j0, i0 in zip(*np.nonzero(pocket)):
    if lab[j0, i0]:
        continue
    n = len(comps) + 1
    lab[j0, i0] = n
    qq = deque([(j0, i0)])
    cells = []
    while qq:
        j, i = qq.popleft()
        cells.append((j, i))
        for dj, di in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            jj, ii = j + dj, i + di
            if 0 <= jj < NY and 0 <= ii < NX and pocket[jj, ii] and not lab[jj, ii]:
                lab[jj, ii] = n
                qq.append((jj, ii))
    cj = np.array([c[0] for c in cells])
    ci = np.array([c[1] for c in cells])
    cx, cy = xs[ci], ys[cj]
    tiles = sorted({(int(math.floor(x - FX0)) + 1, int(math.floor(FY1 - y)) + 1) for x, y in zip(cx, cy)})
    # the narrowest gap between this pocket and the reachable floor: the least capsule clearance on the cells between
    comps.append(dict(cells=len(cells), area_m2=round(len(cells) * CELL * CELL, 3), x=r4([cx.min(), cx.max()]),
                      y=r4([cy.min(), cy.max()]), tiles=[list(t) for t in tiles]))
comps.sort(key=lambda c: -c["cells"])
X["pockets"] = comps
xcheck("free_floor_cut_off_from_the_spawn", True, pockets=len(comps), cells=int(pocket.sum()),
       area_m2=round(float(pocket.sum()) * CELL * CELL, 3), largest=comps[:4],
       note="informative: floor where the capsule fits but which the spawn cannot reach")

# ------------------------------------------------------------------------------------------- 4. spots and props
RX, RY = xs[ri], ys[rj]
pieces = {p["id"]: p for p in MAN["pieces"]}
FACE = {"N": (0, 1), "S": (0, -1), "E": (1, 0), "W": (-1, 0)}
rows = []
want = [(s["id"], "spot:" + s["kind"], (s["x"], s["y"])) for s in scene.get("spots", [])] + \
       [(p["id"], "prop", (p["x"], p["y"])) for p in scene.get("props", [])]
# what each scene spot and prop stands for: the manifest's coverage (a piece, an opening's prop, a cover, a skip);
# without one, the bedroom's two aliases
COV = MAN.get("coverage")
if COV is None:
    ALIAS = {f"{PFX}.under_bed": f"{PFX}.bed", f"{PFX}.draped_window": None}
else:
    ALIAS = {k: (v.get("id") if v.get("by") in ("piece", "covers") else None) for k, v in COV.items()}
SKIPPED = set((MAN.get("skip") or {}).keys())
for sid, kind, (tx, ty) in want:
    pid = ALIAS.get(sid, sid)
    p = pieces.get(pid) if pid else None
    e = dict(id=sid, kind=kind, tile=[tx, ty], tile_centre=list(tile_centre(tx, ty)))
    tcx, tcy = tile_centre(tx, ty)
    e["nearest_reach_to_tile_centre_m"] = round(float(np.hypot(RX - tcx, RY - tcy).min()), 3)
    if p:
        b = p["box"]
        dx = np.maximum(np.maximum(b[0] - RX, RX - b[3]), 0)
        dy = np.maximum(np.maximum(b[1] - RY, RY - b[4]), 0)
        d = np.hypot(dx, dy)
        k = int(np.argmin(d))
        e.update(piece=pid, box_xy=r4([b[0], b[1], b[3], b[4]]), centre=p.get("centre"), face=p.get("face"),
                 piece_centre_off_tile_centre_m=round(float(math.hypot(p["centre"][0] - tcx, p["centre"][1] - tcy)), 3),
                 nearest_reach_to_piece_m=round(float(d[k]), 3), from_=[float(RX[k]), float(RY[k])])
        f = FACE.get(p.get("face") or "")
        if f:
            fx = (b[3] if f[0] > 0 else b[0] if f[0] < 0 else (b[0] + b[3]) / 2)
            fy = (b[4] if f[1] > 0 else b[1] if f[1] < 0 else (b[1] + b[4]) / 2)
            # standing in front: within the piece's width, on its face's side
            if f[0]:
                front = ((RX - fx) * f[0] > 0) & (RY > b[1]) & (RY < b[4])
                dist = np.abs(RX - fx)
            else:
                front = ((RY - fy) * f[1] > 0) & (RX > b[0]) & (RX < b[3])
                dist = np.abs(RY - fy)
            e["front_face"] = r4([fx, fy])
            e["nearest_reach_in_front_m"] = round(float(dist[front].min()), 3) if front.any() else None
            e["front_width_reachable_share"] = None
            if front.any():
                w_ax = RY if f[0] else RX
                lo, hi = (b[1], b[4]) if f[0] else (b[0], b[3])
                near = front & (dist < 0.75)
                cov = np.unique(np.round(w_ax[near] / CELL).astype(int))
                e["front_width_reachable_share"] = round(float(len(cov) * CELL / (hi - lo)), 2)
    if p and p.get("rise"):
        e["hung"] = p["rise"]           # on the wall at that height: for the record (the bedroom's photographs stay judged)
    if sid in SKIPPED:
        e["skipped"] = MAN["skip"][sid]
    rows.append(e)
X["approach"] = rows
far = [r["id"] for r in rows if r.get("nearest_reach_to_piece_m") is not None and r["nearest_reach_to_piece_m"] > 0.55
       and not r.get("skipped")]
nofront = [r["id"] for r in rows if "nearest_reach_in_front_m" in r and (r["nearest_reach_in_front_m"] is None
                                                                        or r["nearest_reach_in_front_m"] > 0.75)]
xcheck("every_spot_and_prop_can_be_walked_up_to", not far, farther_than_0_55=far, no_standing_room_in_front=nofront,
       rows=[{k: r.get(k) for k in ("id", "kind", "nearest_reach_to_piece_m", "nearest_reach_in_front_m",
                                    "front_width_reachable_share", "piece_centre_off_tile_centre_m")} for r in rows])

# ------------------------------------------------------------------------------------------- 5. flame, names
LT = J.get("extensions", {}).get("KHR_lights_punctual", {}).get("lights", [])
cand = [(i, n) for i, n in enumerate(nodes) if n.get("extensions", {}).get("KHR_lights_punctual") is not None
        and LT[n["extensions"]["KHR_lights_punctual"]["light"]]["type"] == "point"]
MLIGHTS = {r["name"]: r for r in MAN.get("lights", [])}
if any(r.get("anchor") for r in MLIGHTS.values()):
    # every point light with an anchor (G4): a lamp at its flame (its anchor within 0.15 m, the light over the flame's
    # mesh when the piece has one), a fire inside its firebox's glow
    rows_l, ok_l = [], True
    for i, n in cand:
        r = MLIGHTS.get(LT[n["extensions"]["KHR_lights_punctual"]["light"]].get("name"), {})
        lp = G2B @ world_m(i)[:3, 3]
        row = dict(light=n.get("name"), role=r.get("role"), at=r4(lp), anchor=r.get("anchor"))
        if r.get("at") is not None:
            row["from_anchor_m"] = round(float(np.linalg.norm(lp - np.array(r["at"]))), 4)
            ok_l &= row["from_anchor_m"] <= 0.15
        host = (r.get("anchor") or {}).get("piece")
        if r.get("role") == "fire":
            glow = [x for x in PR if x["wid"] == f"{host}:glow"]
            if glow:
                gp = np.concatenate([x["P"] for x in glow])
                row["glow_bbox"] = [r4(gp.min(0)), r4(gp.max(0))]
                row["over_its_glow"] = bool(gp[:, 0].min() - 0.05 <= lp[0] <= gp[:, 0].max() + 0.05
                                            and gp[:, 1].min() - 0.05 <= lp[1] <= gp[:, 1].max() + 0.05)
                ok_l &= row["over_its_glow"]
        else:
            fl = [x for x in PR if x["wid"] == f"{host}:flame"]
            if fl:
                fp = np.concatenate([x["P"] for x in fl])
                row["flame_bbox"] = [r4(fp.min(0)), r4(fp.max(0))]
                row["above_flame_top_m"] = round(float(lp[2] - fp[:, 2].max()), 4)
                ok_l &= bool(abs(lp[0] - fp[:, 0].mean()) < 0.03 and abs(lp[1] - fp[:, 1].mean()) < 0.03
                             and 0.0 <= lp[2] - fp[:, 2].max() <= 0.06)
        rows_l.append(row)
    xcheck("each_light_at_its_flame_or_fire", ok_l and len(rows_l) == len(cand), lights=rows_l)
else:
    flame = [x for x in PR if x["wid"].endswith(":flame")]
    if flame and cand:
        fp = np.concatenate([x["P"] for x in flame])
        lp = G2B @ world_m(cand[0][0])[:3, 3]
        xcheck("candle_light_at_its_flame", abs(lp[0] - fp[:, 0].mean()) < 0.03 and abs(lp[1] - fp[:, 1].mean()) < 0.03
               and 0.0 <= lp[2] - fp[:, 2].max() <= 0.06, light=r4(lp), flame_bbox=[r4(fp.min(0)), r4(fp.max(0))],
               light_above_flame_top_m=round(float(lp[2] - fp[:, 2].max()), 4))
BAN = re.compile("|".join(re.escape(w) for w in F.banned), re.I)
names_all = []
for coll in ("nodes", "meshes", "materials", "images", "textures", "scenes"):
    names_all += [(coll, x.get("name", "")) for x in J.get(coll, [])]
names_all += [("lights", l.get("name", "")) for l in LT]
hits = [(c, n) for c, n in names_all if BAN.search(n)]
ex_hits = []
for n in nodes:
    for k, v in (n.get("extras") or {}).items():
        if BAN.search(str(k)) or BAN.search(str(v)):
            ex_hits.append((n.get("name"), k, str(v)[:60]))
xcheck("no_banned_word_in_any_name", not hits and not ex_hits, names=len(names_all), hits=hits, extras_hits=ex_hits,
       cloth_materials=sorted({m.get("name", "") for m in J["materials"] if re.search(r"cloth|curtain|linen|coverlet|wool", m.get("name", ""), re.I)}))

# ------------------------------------------------------------------------------------------- 6. intersections, floating
OPEN_IDS = {o["id"] for o in F.openings}                   # the doors and windows: joinery set in the wall
# ... and a door set into a wall-piece (G21: the manor's study door), joinery set in that wall as a shell door's is
OPEN_IDS |= {p["id"] for p in MAN["pieces"] if (p.get("spec") or {}).get("model") == "door"}


def gid_of(x):
    w = x["wid"]
    if w.startswith(PFX + "."):
        return w.split(":")[0]
    return None


by_piece = {}
for x in INTERIOR:
    g = gid_of(x)
    if g and g not in (f"{PFX}.door", f"{PFX}.draped_window", f"{PFX}.photos", f"{PFX}.rug") and g not in OPEN_IDS \
            and not g.endswith(".rug"):
        by_piece.setdefault(g, []).append(x)
PB = {g: bvh_of(v) for g, v in by_piece.items()}
inter = []
gs = sorted(PB)
for a in range(len(gs)):
    for b in range(a + 1, len(gs)):
        (ba, _oa, Va, Ta), (bb, _ob, Vb, Tb) = PB[gs[a]], PB[gs[b]]
        ov = ba.overlap(bb)
        if not ov:
            continue
        ia = np.array([p[0] for p in ov])
        ca = Va[Ta[ia]].mean(1)
        inter.append(dict(a=gs[a], b=gs[b], triangle_pairs=len(ov), box=[r4(ca.min(0)), r4(ca.max(0))]))
X["piece_intersections"] = inter
through = {}
for g, v in by_piece.items():
    P = np.concatenate([x["P"] for x in v])
    d = max(FX0 - P[:, 0].min(), P[:, 0].max() - FX1, FY0 - P[:, 1].min(), P[:, 1].max() - FY1, -P[:, 2].min(), P[:, 2].max() - CEIL)
    if d > 0.005:
        through[g] = round(float(d), 4)
xcheck("no_piece_intersects_another_or_the_shell", not inter and not through, pairs=inter, through_wall_floor_or_ceiling_m=through,
       pieces=len(gs), note="triangle-triangle overlaps between different pieces (BVHTree.overlap); touching counts")
# floating: every object's lowest points against what is under them (the floor, or the piece it stands on)
SKIP = re.compile(r"_(Floor|Ceiling|Wall_[NESW]|Skirting|PictureRail|Cornice|Door|DoorKnob|Window|WindowGlass|WindowArchitrave|"
                  r"SillSnow|Curtains|CurtainRod|Swag|wb_photos_\d+|wb_dressing_table_cloth|wb_bed_coverlet)$")
obj = {}
for x in INTERIOR:
    obj.setdefault(x["name"], []).append(x)
rest = []
# hung on purpose, from the manifest: a piece with `rise` (a frame, a letter box), a cloth over a piece (a mirror's
# black cloth, a bed's coverlet), the openings' joinery and cloth (named with their id)
HUNG = {p["id"].replace(".", "_") for p in MAN["pieces"] if p.get("rise")}
# the photographs builder's frames hang flat on the wall at eye height, one object each (<id>_1, <id>_2, ...): the
# bedroom's by the SKIP pattern above, any other room's (the tavern bar's) by its manifest row
PHOTOS = {p["id"].replace(".", "_") for p in MAN["pieces"] if (p.get("spec") or {}).get("model") == "photos"}
OPEN_TAGS = {g.replace(".", "_") for g in OPEN_IDS}
# a hearth's dress hung over its mantel shelf (the manifest's made.dress `at` above made.mantel): a mirror on the chimney
# breast, and its black cloth; by its material, in the hearth's own object
HUNG_MATS = {}
for p in MAN["pieces"]:
    mk = (p.get("made") or {})
    if isinstance(mk.get("mantel"), list) and mk.get("dress"):
        hung = [d for d in mk["dress"] if d.get("at") and d["at"][2] > mk["mantel"][1] + 0.005]
        mats = {d["slug"] for d in hung if d.get("slug")} | ({"black_cloth"} if any(d.get("cloth") for d in hung) else set())
        if mats:
            HUNG_MATS[f"{SID}_{p['id'].replace('.', '_')}"] = mats
for name, prims in sorted(obj.items()):
    if SKIP.search(name) or name.startswith(f"{SID}_Outside"):
        continue
    bare = name[len(SID) + 1:] if name.startswith(SID + "_") else name
    if bare in HUNG or re.sub(r"_\d+$", "", bare) in PHOTOS or any(bare.endswith("_" + t) for t in OPEN_TAGS) or (
            prims[0]["what"] == "cloth" and prims[0]["wid"].endswith((":coverlet", ":cloth"))):
        continue
    for x in prims:
        if any(f"_M_{m}" in (x["mat"] or "") for m in HUNG_MATS.get(name, ())):
            continue
        P = x["P"]
        z0 = float(P[:, 2].min())
        low = P[P[:, 2] <= z0 + 0.003]
        others = [y for y in INTERIOR if y is not x]
        bo, oo, _, _ = bvh_of(others)
        gaps, on = [], {}
        for p in low[:: max(1, len(low) // 60)]:
            h = bo.ray_cast(Vector((float(p[0]), float(p[1]), float(p[2]) + 0.02)), Vector((0, 0, -1)), 3.5)
            if h[0] is not None:
                gaps.append(float(p[2]) - h[0].z)
                on[oo[h[2]]] = on.get(oo[h[2]], 0) + 1
        if gaps:
            rest.append(dict(obj=name, material=x["mat"], bottom_z=round(z0, 4), gap_min=round(min(gaps), 4), gap_median=round(float(np.median(gaps)), 4),
                             on=max(on, key=on.get).replace(SID + "_", ""), points=len(gaps)))
X["resting"] = rest
floating = [r for r in rest if r["gap_min"] > 0.02]        # over 2 cm of air under an object's lowest points
nits = [r for r in rest if 0.006 < r["gap_min"] <= 0.02]
sunk = [r for r in rest if r["gap_median"] < -0.02]
xcheck("nothing_floats", not floating, floating=floating, between_6_and_20_mm=nits, sunk_more_than_2cm=sunk,
       rows=[(r["obj"].replace(SID + "_", ""), r["bottom_z"], r["gap_min"], r["on"]) for r in rest])

X["fails"] = XF
X["pass"] = not XF
json.dump(X, open(os.path.join(OUTD, "r7_extra.json"), "w"), indent=1,
          default=lambda o: o.tolist() if hasattr(o, "tolist") else str(o))
log("done", "PASS" if not XF else f"FAIL {XF}")
