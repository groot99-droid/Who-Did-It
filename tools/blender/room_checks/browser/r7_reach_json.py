"""cc_geom.py's capsule grid (<out>/cc_grid.npz) as JSON for the browser walk test (r7_walk.html). No Blender.

Usage: python tools/blender/room_checks/browser/r7_reach_json.py <roomId> [--out DIR]               (roomcfg.py)
Reads <out>/cc_grid.npz and writes <out>/browser/reach.json, where serve.py's /out/ finds it.
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import roomcfg  # noqa: E402

ARGS = roomcfg.parse()
Z = np.load(os.path.join(ARGS.out, "cc_grid.npz"))
xs, ys = Z["xs"], Z["ys"]
out = dict(x0=float(xs[0]), y0=float(ys[0]), cell=float(round(xs[1] - xs[0], 4)), nx=int(len(xs)), ny=int(len(ys)),
           reach=["".join("1" if v else "0" for v in row) for row in Z["REACH"]],
           free=["".join("1" if v else "0" for v in row) for row in Z["FREE"]])
os.makedirs(os.path.join(ARGS.out, "browser"), exist_ok=True)
with open(os.path.join(ARGS.out, "browser", "reach.json"), "w", encoding="utf-8") as fh:
    json.dump(out, fh)
print(out["nx"], out["ny"], out["cell"], int(Z["REACH"].sum()), int(Z["FREE"].sum()))
