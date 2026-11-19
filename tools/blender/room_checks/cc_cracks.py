"""Room check (the contract and the collision): dense see-through scans of the visible shell, in Blender. Read-only.

Usage: bash tools/blender/bl.sh -b --factory-startup -P tools/blender/room_checks/cc_cracks.py --
           <roomId> [--glb F] [--scene F] [--out DIR] [--config F]                                 (roomcfg.py)
Reuses cc_geom.py's decode sections (the GLB parser and the add-on's Draco bridge; `roomcfg.cc_geom_head`). Rays from
eye points to dense grids behind the door, beyond the window and 3 mm outside the room's 12 edges; a ray that meets no
visible surface would show the viewer's black background (a crack). The room's check file (rooms/<roomId>.json) gives
the window's span and the eye points that look through it. Still the bedroom's own here:
  the door in the south wall and the window in the north wall (`roomcfg.need_walls`), the first portal as the door;
  the door's grid, 0.12 m behind the wall's inner face, 0.65 m either side of the door's centre and from 0.02 m under
  the floor to 2.40 m up, and its four eye points, 0.5 to 2 m in front of the door and up to 1.2 m to either side;
  the window's grid, 0.45 m beyond the wall's inner face;
  the four eye points of the edge scan (inside a 10 x 7 m room).
Writes <out>/cc_cracks.json.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import roomcfg  # noqa: E402

H = roomcfg.cc_geom_head("collision boxes")
np, Vector, log, tile_centre = H["np"], H["Vector"], H["log"], H["tile_centre"]
scene, ROOM, OUTD, BV_V = H["scene"], H["ROOM"], H["OUTD"], H["BV_V"]
FX0, FX1, FY0, FY1, CEIL = H["FX0"], H["FX1"], H["FY0"], H["FY1"], H["CEIL"]
roomcfg.need_walls(ROOM, "cc_cracks.py")

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
DX = tile_centre(scene["portals"][0]["x"], scene["portals"][0]["y"])[0]
door_pts = [(x, FY0 - 0.12, z) for x in np.arange(DX - 0.65, DX + 0.65 + 1e-9, st) for z in np.arange(-0.02, 2.40, st)]
n, v = scan([(DX, FY0 + 2.0, 1.6), (DX - 1.2, FY0 + 1.0, 1.0), (DX + 1.2, FY0 + 0.8, 0.4), (DX, FY0 + 0.5, 1.6)], door_pts)
out["door"] = dict(rays=n, void=len(v), examples=v[:8])
log("door", out["door"]["rays"], out["door"]["void"])
WIN = ROOM["window"]["cracks"]
win_pts = [(x, FY1 + 0.45, z) for x in np.arange(WIN["x"][0], WIN["x"][1] + 1e-9, st)
           for z in np.arange(WIN["z"][0], WIN["z"][1], st)]
n, v = scan([(e[0], FY1 - e[1], e[2]) for e in WIN["eyes"]], win_pts)
out["window"] = dict(rays=n, void=len(v), examples=v[:8])
log("window", out["window"]["rays"], out["window"]["void"])
C4 = [(FX0, FY0), (FX1, FY0), (FX1, FY1), (FX0, FY1)]
edges = [((x, y, 0.0), (x, y, CEIL)) for (x, y) in C4]
for k in range(4):
    (x0, y0), (x1, y1) = C4[k], C4[(k + 1) % 4]
    edges += [((x0, y0, 0.0), (x1, y1, 0.0)), ((x0, y0, CEIL), (x1, y1, CEIL))]
eps = 0.003
edge_pts = []
for a, b in edges:
    a, b = np.array(a), np.array(b)
    for t in np.linspace(0.001, 0.999, 2500):
        p = a + t * (b - a)
        o_ = np.array([np.sign(p[0]) if abs(abs(p[0]) - FX1) < 1e-6 else 0.0,
                       np.sign(p[1]) if abs(abs(p[1]) - FY1) < 1e-6 else 0.0,
                       (1.0 if p[2] > 1.5 else -1.0) if (abs(p[2] - CEIL) < 1e-6 or abs(p[2]) < 1e-6) else 0.0])
        edge_pts.append(tuple(p + eps * o_))
n, v = scan([(0.0, 0.0, 1.6), (-3.0, -1.5, 0.8), (3.0, -2.0, 2.2), (-1.0, 1.0, 2.6)], edge_pts)
out["room_edges"] = dict(rays=n, void=len(v), examples=v[:8])
log("edges", out["room_edges"]["rays"], out["room_edges"]["void"])
out["pass"] = all(out[k]["void"] == 0 for k in ("door", "window", "room_edges"))
json.dump(out, open(os.path.join(OUTD, "cc_cracks.json"), "w"), indent=1)
log("done", out["pass"])
