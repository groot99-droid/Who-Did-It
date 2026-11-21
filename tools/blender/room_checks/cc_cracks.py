"""Room check (the contract and the collision): dense see-through scans of the visible shell, in Blender. Read-only.

Usage: bash tools/blender/bl.sh -b --factory-startup -P tools/blender/room_checks/cc_cracks.py --
           <roomId> [--glb F] [--scene F] [--manifest F] [--out DIR] [--config F]                  (roomcfg.py)
Reuses cc_geom.py's decode sections (the GLB parser and the add-on's Draco bridge; `roomcfg.cc_geom_head`). Rays from
eye points to dense grids behind each door, beyond each window and 3 mm outside the room's 12 edges; a ray that meets
no visible surface would show the viewer's black background (a crack). The openings, their walls and spans come from
the builder's manifest (`roomcfg.Facts`):
  a door's grid stands 0.12 m behind the wall's inner face, 0.2 m past each jamb (the bedroom's: 0.65 m either side of
  its centre) and from 0.02 m under the floor to 0.25 m over its head; its four eye points stand 0.5 to 2 m in front of
  it and up to 1.2 m to either side;
  a window's grid stands 0.45 m beyond the wall's inner face, 0.2 m past its jambs, sill and head; its three eye points
  1.0, 2.0 and 3.5 m in front of it (1.0 m to either side for the last two);
  the edge scan's four eye points are fractions of the room's half sizes (the bedroom's four points in a 10 x 7 m room).
Every eye point that is not the check file's own is moved to the nearest cell the walker reaches (cc_geom.py's
cc_grid.npz in <out>, when it is there), at its own height. A manifest written before G2b reads the check file's window
span and eye points, as the bedroom's did. A room with one door and one window keeps the result's names door, window
and room_edges; another has door:<id> and window:<id>.
Writes <out>/cc_cracks.json.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import roomcfg  # noqa: E402

H = roomcfg.cc_geom_head("collision boxes")
np, Vector, log = H["np"], H["Vector"], H["log"]
OUTD, BV_V, F = H["OUTD"], H["BV_V"], H["F"]
FX0, FX1, FY0, FY1, CEIL = H["FX0"], H["FX1"], H["FY0"], H["FY1"], H["CEIL"]

grid = os.path.join(OUTD, "cc_grid.npz")
REACH_XY = None
if os.path.exists(grid):
    G = np.load(grid)
    rj, ri = np.nonzero(G["REACH"])
    REACH_XY = np.stack([G["xs"][ri], G["ys"][rj]], 1)


def snap(p):
    """An eye point moved to the nearest reachable cell (its height kept); as it is without a reach grid."""
    if REACH_XY is None or not len(REACH_XY):
        return tuple(float(v) for v in p)
    k = int(np.argmin(np.hypot(REACH_XY[:, 0] - p[0], REACH_XY[:, 1] - p[1])))
    return (float(REACH_XY[k, 0]), float(REACH_XY[k, 1]), float(p[2]))


out = {}


def scan(eyes, pts):
    void = []
    n = 0
    for e in eyes:
        o = Vector(e)
        for p in pts:
            d = Vector(p) - o
            L = d.length
            n += 1
            h = BV_V.ray_cast(o, d / L, L + 400.0)
            if h[0] is None:
                void.append([round(float(v), 4) for v in p] + [list(e)])
    return n, void


st = 0.003
for DO in F.doors:
    side, dc = DO["side"], (DO["a"] + DO["b"]) / 2
    u0, u1, z0, z1 = DO["cracks"]
    pts = [F.point(side, u, -0.12, z) for u in np.arange(u0, u1 + 1e-9, st) for z in np.arange(z0, z1, st)]
    eyes = [F.point(side, dc + du, d, z) for du, d, z in ((0, 2.0, 1.6), (-1.2, 1.0, 1.0), (1.2, 0.8, 0.4), (0, 0.5, 1.6))]
    if not F.legacy:
        eyes = [snap(e) for e in eyes]
    n, v = scan(eyes, pts)
    k = F.named("door", DO, F.doors)
    out[k] = dict(rays=n, void=len(v), examples=v[:8], eyes=[[round(c, 3) for c in e] for e in eyes])
    log(k, out[k]["rays"], out[k]["void"])
for WO in F.windows:
    side = WO["side"]
    u0, u1, z0, z1 = WO["cracks"]
    pts = [F.point(side, u, -0.45, z) for u in np.arange(u0, u1 + 1e-9, st) for z in np.arange(z0, z1, st)]
    if WO.get("eyes"):                                     # the check file's own (a manifest before G2b)
        eyes = [F.point(side, e[0], e[1], e[2]) for e in WO["eyes"]]
    else:
        c = (WO["a"] + WO["b"]) / 2
        eyes = [snap(F.point(side, c + du, d, z)) for du, d, z in ((0, 1.0, 1.6), (-1.0, 2.0, 1.2), (1.0, 3.5, 2.2))]
    n, v = scan(eyes, pts)
    k = F.named("window", WO, F.windows)
    out[k] = dict(rays=n, void=len(v), examples=v[:8], eyes=[[round(c, 3) for c in e] for e in eyes])
    log(k, out[k]["rays"], out[k]["void"])
C4 = [(FX0, FY0), (FX1, FY0), (FX1, FY1), (FX0, FY1)]
edges = [((x, y, 0.0), (x, y, CEIL)) for (x, y) in C4]
for k in range(4):
    (x0, y0), (x1, y1) = C4[k], C4[(k + 1) % 4]
    edges += [((x0, y0, 0.0), (x1, y1, 0.0)), ((x0, y0, CEIL), (x1, y1, CEIL))]
eps = 0.003


def off(v, lo, hi):
    return 1.0 if abs(v - hi) < 1e-6 else -1.0 if abs(v - lo) < 1e-6 else 0.0


edge_pts = []
for a, b in edges:
    a, b = np.array(a), np.array(b)
    for t in np.linspace(0.001, 0.999, 2500):
        p = a + t * (b - a)
        o_ = np.array([off(p[0], FX0, FX1), off(p[1], FY0, FY1),
                       (1.0 if p[2] > 1.5 else -1.0) if (abs(p[2] - CEIL) < 1e-6 or abs(p[2]) < 1e-6) else 0.0])
        edge_pts.append(tuple(p + eps * o_))
MX, MY, HX, HY = (FX0 + FX1) / 2, (FY0 + FY1) / 2, (FX1 - FX0) / 2, (FY1 - FY0) / 2
# the eyes' heights held 0.1 m under a low ceiling (the loft's 2.4 m: an eye at 2.6 stood over it); 2.7 m and up as before
eyes = [(MX + fx * HX, MY + fy * HY, min(z, CEIL - 0.1)) for fx, fy, z in ((0.0, 0.0, 1.6), (-0.6, -3 / 7, 0.8),
                                                                          (0.6, -4 / 7, 2.2), (-0.2, 2 / 7, 2.6))]
if not F.legacy:
    eyes = [snap(e) for e in eyes]
n, v = scan(eyes, edge_pts)
out["room_edges"] = dict(rays=n, void=len(v), examples=v[:8], eyes=[[round(c, 3) for c in e] for e in eyes])
log("edges", out["room_edges"]["rays"], out["room_edges"]["void"])
out["pass"] = all(x["void"] == 0 for x in out.values() if isinstance(x, dict)) and len(out) == (
    len(F.doors) + len(F.windows) + 1)
json.dump(out, open(os.path.join(OUTD, "cc_cracks.json"), "w"), indent=1)
log("done", out["pass"])
