"""The cave's rock: wall detail in the field, and the formations, fallen rock and breakdown that dress a section.

Plain Python with numpy, no Blender; meshy_cave_core.py calls it. Two parts:

- `detail` and `rubble`: terms added to the field you see (never to the walker's field, so the flood, the collision
  and every traversal check stay as they were): bedding ledges that follow each geology's dip, solution scallops on
  limestone, joints (two vertical sets per geology), and a rubble edge where the floor meets the wall. Below 1.8 m a
  term only takes rock away (the old builder's wall rule, noise_term): the walker, held by the smooth collision wall,
  never meets rock you cannot see. The rubble stays under RUBBLE_MAX, below the walker's step.
- `decor`: formations placed by geology on the section's own floors, roofs and walls: stalactites in clusters, from
  straws to large, stalagmites under them, columns where the two meet, flowstone curtains, rimstone pools, crystals,
  icicles, breakdown blocks and fallen rocks. Anything you could bump into above STEP_FREE stands at least COLLIDE_MIN
  tall, with a collision proxy and a flood solid; nothing stands on a route, in a zone, by a seam, a spawn, a portal,
  a drop, a guard or a bridge; hanging things end DECOR_HEAD above the floor under them.

Geometry stays repeatable: integer hashing and splitmix64 only, no sin, exp, log or fractional power in a geometry
path, positions rounded by the core to 1e-5 m.
"""

from __future__ import annotations

import numpy as np

# ---------------------------------------------------------------- the geologies

# Per geology: dip [dz/dx, dz/dy] of the beds, ledge (m, the beds' step), scallop (m, the dimples' depth), joints
# ([[ux, uy] strike of the first set, spacing m, depth m]; a second set runs square to it at 1.7 times the spacing),
# rubble (m, the floor edge's height) and decor (each formation kind's weight; 1 is limestone's).
ROCK = {
    "limestone": {"dip": [0.07, 0.025], "ledge": 0.075, "scallop": 0.06, "joints": [[0.8, 0.6], 3.4, 0.09],
                  "rubble": 0.2, "decor": {"stalactite": 1.0, "stalagmite": 1.0, "column": 1.0, "curtain": 1.0,
                                           "rimstone": 1.0, "blocks": 0.5, "rocks": 1.0}},
    "flowstone": {"dip": [0.02, 0.01], "ledge": 0.03, "scallop": 0.02, "joints": [[0.7, 0.71], 4.5, 0.05],
                  "rubble": 0.12, "decor": {"stalactite": 1.6, "stalagmite": 1.4, "column": 1.5, "curtain": 1.8,
                                            "rimstone": 1.8, "blocks": 0.2, "rocks": 0.5}},
    "breakdown": {"dip": [0.05, 0.05], "ledge": 0.05, "scallop": 0.0, "joints": [[0.6, 0.8], 2.2, 0.14],
                  "rubble": 0.28, "decor": {"stalactite": 0.3, "stalagmite": 0.25, "column": 0.2, "curtain": 0.2,
                                            "rimstone": 0.1, "blocks": 2.0, "rocks": 2.2}},
    "gypsum": {"dip": [0.03, 0.0], "ledge": 0.05, "scallop": 0.0, "joints": [[1.0, 0.0], 3.0, 0.07],
               "rubble": 0.16, "decor": {"stalactite": 0.25, "stalagmite": 0.2, "crystal": 0.8, "curtain": 0.2,
                                         "blocks": 0.6, "rocks": 1.0}},
    "lakeclay": {"dip": [0.02, 0.0], "ledge": 0.04, "scallop": 0.0, "joints": [[0.9, 0.44], 4.0, 0.05],
                 "rubble": 0.15, "decor": {"stalactite": 0.8, "stalagmite": 0.8, "column": 0.6, "curtain": 0.45,
                                           "rimstone": 0.8, "blocks": 0.8, "rocks": 1.4}},
    "ice": {"dip": [0.0, 0.0], "ledge": 0.02, "scallop": 0.0, "joints": [[1.0, 0.0], 5.0, 0.03], "rubble": 0.1,
            "decor": {"icicle": 1.6, "blocks": 0.3, "rocks": 0.5}},
    "slate": {"dip": [0.35, 0.12], "ledge": 0.06, "scallop": 0.0, "joints": [[0.3, 0.95], 1.8, 0.12],
              "rubble": 0.24, "decor": {"stalactite": 0.15, "stalagmite": 0.1, "blocks": 1.2, "rocks": 1.6}},
    "skarn": {"dip": [0.12, 0.2], "ledge": 0.05, "scallop": 0.0, "joints": [[0.5, 0.87], 2.6, 0.1], "rubble": 0.2,
              "decor": {"stalactite": 0.3, "stalagmite": 0.2, "crystal": 1.6, "blocks": 0.9, "rocks": 1.2}},
    "granite": {"dip": [0.0, 0.0], "ledge": 0.0, "scallop": 0.0, "joints": [[0.95, 0.3], 2.4, 0.13], "rubble": 0.24,
                "decor": {"stalactite": 0.05, "blocks": 1.4, "rocks": 1.5}},
    "flooded": {"dip": [0.04, 0.02], "ledge": 0.05, "scallop": 0.05, "joints": [[0.8, 0.6], 3.4, 0.07],
                "rubble": 0.14, "decor": {"stalactite": 0.7, "stalagmite": 0.4, "column": 0.4, "curtain": 0.5,
                                          "rimstone": 0.3, "blocks": 0.4, "rocks": 0.8}},
}
PLAIN = {"dip": [0.0, 0.0], "ledge": 0.0, "scallop": 0.0, "joints": [[1.0, 0.0], 4.0, 0.0], "rubble": 0.0,
         "decor": {}}
DECOR_KINDS = ("stalactite", "stalagmite", "column", "curtain", "rimstone", "crystal", "icicle", "blocks", "rocks")

# The formations' tags in the core's form_kind (0 to 3 are the hand-placed features'; 10 to 12 the guards', bridges'
# and seam walls' proxies).
TAG = {"stalactite": 0, "stalagmite": 1, "column": 2, "block": 3, "straw": 5, "curtain": 6, "rimstone": 7,
       "crystal": 8, "icicle": 9, "rock": 13, "pool": 14}

SCALLOP_M = 0.6     # metres between scallops (feature points of a jittered lattice)
RUBBLE_MAX = 0.3    # the rubble edge never stands higher than this: the walker steps over it (STEP is 0.35)
RUBBLE_REACH = 0.55  # metres out from the wall's foot the rubble reaches
LOW = (1.8, 0.8)    # below LOW[0] a term only takes rock away; it is fully on LOW[1] higher
STEP_FREE = 0.3     # a floor item at most this tall has no collision (the walker steps over it)
COLLIDE_MIN = 0.5   # a floor item taller than STEP_FREE stands at least this tall, with collision
DECOR_HEAD = 2.3    # hanging things end at least this far above the floor under them (the walker is 1.75 m)
SEAM_KEEP = 1.5     # metres from a seam plane, a spawn, a portal or an arrival nothing is placed
ROUTE_KEEP = 0.9    # metres from a route's centre line (beyond the clear core's half width) no floor item stands
ZONE_KEEP = 1.0     # metres round a traversal zone's box nothing is placed
SOLID_TOP = 2.6     # a collision item's flood solid reaches this far above its floor: nothing stands on it


def profile(name, geo=None):
    """The rock profile of a geology: ROCK's row (PLAIN for one it does not know), overridden by the network's
    geology "rock" object."""
    base = ROCK.get(name, PLAIN)
    out = {k: (dict(v) if isinstance(v, dict) else v) for k, v in base.items()}
    over = (geo or {}).get("rock") or {}
    for k, v in over.items():
        if k == "decor":
            out["decor"].update(v)
        else:
            out[k] = v
    return out


# ---------------------------------------------------------------- hashing (as the core's, standalone)

_P1, _P2, _P3 = np.uint64(0x9E3779B97F4A7C15), np.uint64(0xC2B2AE3D27D4EB4F), np.uint64(0x165667B19E3779F9)
_M1, _M2 = np.uint64(0xBF58476D1CE4E5B9), np.uint64(0x94D049BB133111EB)
M64 = (1 << 64) - 1


def hash3(i, j, k, seed):
    """A number in [0, 1) per integer triple."""
    with np.errstate(over="ignore"):
        h = (np.asarray(i, np.int64).astype(np.uint64) * _P1) ^ (np.asarray(j, np.int64).astype(np.uint64) * _P2)
        h = h ^ (np.asarray(k, np.int64).astype(np.uint64) * _P3) ^ np.uint64(seed & M64)
        h = h ^ (h >> np.uint64(30))
        h = h * _M1
        h = h ^ (h >> np.uint64(27))
        h = h * _M2
        h = h ^ (h >> np.uint64(31))
    return (h >> np.uint64(11)).astype(np.float64) * (2.0 ** -53)


def frac(a):
    return a - np.floor(a)


# ---------------------------------------------------------------- the field terms


def scallops(X, Y, Z, seed, s=SCALLOP_M):
    """Solution scallops: 1 at a dimple's centre, 0 on the sharp ridges between, from the nearest feature point of a
    jittered lattice (cell s, each feature within the middle 60 % of its cell, the 2 x 2 x 2 nearest cells read).
    The features are hashed once per cell of the points' box when it is small (a block), else per point."""
    fx, fy, fz = X / s, Y / s, Z / s
    i0, j0, k0 = np.floor(fx - 0.5), np.floor(fy - 0.5), np.floor(fz - 0.5)
    lo = [int(np.min(a)) for a in (i0, j0, k0)]
    span = [int(np.max(a)) - l_ + 2 for a, l_ in zip((i0, j0, k0), lo)]
    table = None
    if span[0] * span[1] * span[2] <= 65536:
        K, J, I = np.meshgrid(np.arange(span[2]) + lo[2], np.arange(span[1]) + lo[1], np.arange(span[0]) + lo[0],
                              indexing="ij")
        table = [hash3(I, J, K, seed + q) for q in range(3)]
    best = None
    for di in (0.0, 1.0):
        for dj in (0.0, 1.0):
            for dk in (0.0, 1.0):
                i, j, k = i0 + di, j0 + dj, k0 + dk
                if table is not None:
                    ix = (i - lo[0]).astype(np.int64)
                    iy = (j - lo[1]).astype(np.int64)
                    iz = (k - lo[2]).astype(np.int64)
                    hx, hy, hz = (t[iz, iy, ix] for t in table)
                else:
                    ii, jj, kk = np.broadcast_arrays(i, j, k)
                    hx, hy, hz = (hash3(ii, jj, kk, seed + q) for q in range(3))
                dx = fx - (i + 0.2 + 0.6 * hx)
                dy = fy - (j + 0.2 + 0.6 * hy)
                dz = fz - (k + 0.2 + 0.6 * hz)
                d2 = dx * dx + dy * dy + dz * dz
                best = d2 if best is None else np.minimum(best, d2)
    return np.clip(1.0 - best / 0.36, 0.0, 1.0)


def ledges(X, Y, Z, thick, dip, warp):
    """The beds' face across a bed, in [-1, 1]: recessed (+, air) towards a bed's top, standing out (-, rock) at its
    foot, with a sharp step between (the bed above overhangs the one below). The beds dip by `dip` and wander by
    `warp` metres."""
    zt = (Z - dip[0] * X - dip[1] * Y + warp) / thick
    f = frac(zt)
    p = np.where(f < 0.85, f / 0.85, (1.0 - f) / 0.15)
    return 2.0 * p - 1.0


def joints(X, Y, strike, spacing, warp):
    """Two sets of vertical joints: a V groove 0.36 m wide, 1 on a joint's plane, 0 away from it."""
    ux, uy = strike
    n = float(np.sqrt(ux * ux + uy * uy)) or 1.0
    ux, uy = ux / n, uy / n
    out = 0.0
    for (ax, ay), sp, w in (((ux, uy), spacing, 1.0), ((-uy, ux), 1.7 * spacing, 0.7)):
        s = (X * ax + Y * ay + warp) / sp
        g = frac(s)
        d = np.minimum(g, 1.0 - g) * sp
        q = np.clip(1.0 - d / 0.18, 0.0, 1.0)
        out = np.maximum(out, w * q * q)
    return out


def low_rule(D, v):
    """Below LOW[0] a term only takes rock away; it may add rock fully LOW[1] higher (noise_term's rule)."""
    t = np.clip((v - LOW[0]) / LOW[1], 0.0, 1.0)
    return np.maximum(D, 0.0) + t * np.minimum(D, 0.0)


def detail(c, v, rk, bed):
    """The wall detail of one primitive (rock profile rk, bedding [thickness, step]) at the points of c, v metres
    above its floor: + is air. Zero in the walker's field."""
    if c.collision or c.walls or rk is None:
        return 0.0
    D = 0.0
    warp = 0.12 * c.nb
    if rk.get("ledge", 0.0) > 0:
        thick = float(bed[0]) if bed and bed[0] > 0 else 0.6
        D = D + rk["ledge"] * ledges(c.X, c.Y, c.Z, thick, rk.get("dip", (0.0, 0.0)), warp)
    if rk.get("scallop", 0.0) > 0:
        if getattr(c, "_scal", None) is None:
            c._scal = scallops(c.X, c.Y, c.Z, getattr(c, "seed", 1) * 31 + 7)
        D = D + rk["scallop"] * c._scal
    jt = rk.get("joints")
    if jt and jt[2] > 0:
        D = D + jt[2] * (0.6 + 0.4 * c.nb) * joints(c.X, c.Y, jt[0], float(jt[1]), 3.0 * warp)
    if isinstance(D, float):
        return 0.0
    return low_rule(D, v)


def rubble(c, wall, rk):
    """The rubble edge's height (m) at the points of c: up to rk["rubble"] (at most RUBBLE_MAX) where the wall's
    foot is within RUBBLE_REACH, patchy by the lump noise. Zero in the walker's field."""
    if c.collision or c.walls or rk is None or rk.get("rubble", 0.0) <= 0:
        return 0.0
    near = np.clip(1.0 - wall / RUBBLE_REACH, 0.0, 1.0)
    lump = np.clip(0.3 + 1.1 * c.n, 0.0, 1.0)
    return min(float(rk["rubble"]), RUBBLE_MAX) * near * near * lump


# ---------------------------------------------------------------- meshes (no trig: rings from square roots)

_S3, _S2 = float(np.sqrt(3.0)), float(np.sqrt(0.5))
RINGS = {
    5: [(1.0, 0.0), (0.30901699437494745, 0.9510565162951535), (-0.8090169943749475, 0.5877852522924731),
        (-0.8090169943749475, -0.5877852522924731), (0.30901699437494745, -0.9510565162951535)],
    6: [(1.0, 0.0), (0.5, 0.5 * _S3), (-0.5, 0.5 * _S3), (-1.0, 0.0), (-0.5, -0.5 * _S3), (0.5, -0.5 * _S3)],
    8: [(1.0, 0.0), (_S2, _S2), (0.0, 1.0), (-_S2, _S2), (-1.0, 0.0), (-_S2, -_S2), (0.0, -1.0), (_S2, -_S2)],
}
DIR8 = RINGS[8]


def lathe(rings, n, turn=(1.0, 0.0), wobble=None, tip=None, cap=False):
    """A closed tube: rings of (cx, cy, cz, r) round the vertical, n sides turned by (c, s), each vertex's radius
    times wobble[ring][side] when given; `tip` closes the last ring to a point, `cap` closes the first ring flat.
    Returns (V, F), wound outward."""
    ring = RINGS[n]
    rc, rs = turn
    V = []
    for i, (cx, cy, cz, r) in enumerate(rings):
        for k, (x, y) in enumerate(ring):
            rr = r * (wobble[i][k] if wobble is not None else 1.0)
            V.append((cx + rr * (x * rc - y * rs), cy + rr * (x * rs + y * rc), cz))
    F = []
    for i in range(len(rings) - 1):
        for k in range(n):
            a, b = i * n + k, i * n + (k + 1) % n
            c, d = a + n, b + n
            F += [(a, b, d), (a, d, c)]
    last = (len(rings) - 1) * n
    if tip is not None:
        t = len(V)
        V.append(tuple(tip))
        F += [(last + k, last + (k + 1) % n, t) for k in range(n)]
    if cap:
        t = len(V)
        V.append(tuple(rings[0][:3]))
        F += [(k, t, (k + 1) % n) for k in range(n)]
    V = np.array(V, dtype=np.float64)
    F = np.array(F, dtype=np.int64)
    # the faces are wound one way round by construction; the whole is turned outward by its signed volume
    a_, b_, d_ = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    if float(np.einsum("ij,ij->i", a_ - V[0], np.cross(b_ - V[0], d_ - V[0])).sum()) < 0:
        F = F[:, ::-1].copy()
    return V, F


def outward(V, F, centre=None):
    """Winds each triangle away from a centre (for convex pieces)."""
    c = V.mean(0) if centre is None else np.asarray(centre, np.float64)
    a, b, d = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    n = np.cross(b - a, d - a)
    flip = ((n * ((a + b + d) / 3.0 - c)).sum(1)) < 0
    F = F.copy()
    F[flip] = F[flip][:, ::-1]
    return F


def frame(axis):
    """The unit axis and two unit vectors square to it (and to each other), without trig."""
    u = np.asarray(axis, np.float64)
    u = u / np.sqrt((u * u).sum())
    ref = np.array([1.0, 0.0, 0.0]) if abs(u[0]) < 0.8 else np.array([0.0, 1.0, 0.0])
    e1 = np.cross(u, ref)
    e1 = e1 / np.sqrt((e1 * e1).sum())
    return u, e1, np.cross(u, e1)


def sides(rb):
    return 5 if rb < 0.05 else 6 if rb < 0.16 else 8


def stalactite(x, y, roof, length, rb, turn, rng, icicle=False):
    """A carrot hanging from 0.3 m inside the roof to `length` below it: radius rb (1 - t)^1.5 (an icicle's
    (1 - t)^2), swollen just under the roof, swaying a little."""
    k = 3 if length < 0.3 else 5 if length < 1.0 else 7
    total = length + 0.3
    sway = rng.uniform(-0.2, 0.2) * rb
    rings = []
    for s in range(k):
        t = s / k
        q = 1.0 - t
        r = rb * (q * q if icicle else q * float(np.sqrt(q))) * (1.3 if s == 1 else 1.0)
        rings.append((x + sway * t * turn[0], y + sway * t * turn[1], roof + 0.3 - total * t, max(r, 0.003)))
    return lathe(rings, sides(rb), turn, tip=(x + sway * turn[0], y + sway * turn[1], roof - length), cap=True)


STALAGMITE_SHAPES = ("cone", "candle", "mound", "stack")


def stalagmite(x, y, floor, height, rb, turn, rng, n=None, shape=None):
    """A stalagmite from 0.25 m under the floor to `height` over it, its base flared into the floor and its top
    rounded: a cone (tapering), a candle (straight, then a dome), a mound (low and wide) or a stack (stacked
    bulges); lumpy. rb is its radius at the floor."""
    n = n or sides(rb)
    shape = shape or STALAGMITE_SHAPES[int(rng.uniform() * 4) % 4]
    k = 4 if height < 0.4 else 7
    rings = [(x, y, floor - 0.25, 1.25 * rb), (x, y, floor + 0.02, 1.15 * rb)]
    for s in range(1, k):
        t = s / k
        if shape == "candle":
            r = rb * (0.75 if t < 0.8 else 0.75 * float(np.sqrt(max(1.0 - ((t - 0.8) / 0.2) ** 2, 0.0))) + 0.02)
        elif shape == "mound":
            r = rb * float(np.sqrt(max(1.0 - t * t, 0.0)))
        elif shape == "stack":
            q = (3.0 * t) % 1.0
            r = rb * (1.0 - 0.7 * t) * (0.82 + 0.3 * 4.0 * q * (1.0 - q))
        else:
            r = rb * (1.0 - 0.85 * t) * (1.0 - 0.15 * t * t)
        rings.append((x, y, floor + height * t, max(r, 0.01)))
    wob = [[rng.uniform(0.84, 1.16) for _ in range(n)] for _ in range(len(rings))]
    top = (x + rng.uniform(-0.05, 0.05) * rb, y + rng.uniform(-0.05, 0.05) * rb, floor + height)
    return lathe(rings, n, turn, wobble=wob, tip=top, cap=True)


def column(x, y, floor, roof, rb, turn, rng):
    """A column from 0.25 m under the floor to 0.3 m into the roof: waisted, flared at both ends, fluted."""
    n, k = 8, 9
    span = roof - floor + 0.55
    wob = [[(1.1 if (j + i) % 2 else 0.94) * rng.uniform(0.94, 1.06) for j in range(n)] for i in range(k)]
    rings = []
    for s in range(k):
        t = s / (k - 1)
        rings.append((x, y, floor - 0.25 + span * t, rb * (1.0 - 0.45 * 4.0 * t * (1.0 - t))))
    return lathe(rings, n, turn, wobble=wob, tip=(x, y, roof + 0.35), cap=True)


def block(x, y, floor, sx, sy, sz, turn, rng, tc_v, tc_f, sink=0.15):
    """A fallen block: the truncated cube, each corner moved by up to 18 %, turned, sunk `sink` of its height.
    Returns (V, F, the corners in the block's own frame)."""
    ux, uy = turn
    J = np.array([[rng.uniform(0.82, 1.18) for _ in range(3)] for _ in range(len(tc_v))])
    L = np.asarray(tc_v) * J * np.array([0.5 * sx, 0.5 * sy, 0.5 * sz])
    cz = floor - sink * sz + 0.5 * sz
    V = np.stack([x + L[:, 0] * ux - L[:, 1] * uy, y + L[:, 0] * uy + L[:, 1] * ux, cz + L[:, 2]], axis=1)
    return V, np.array(tc_f, np.int64), L  # the truncated cube's own winding: outward, kept by the turn


def curtain(P, nrm, tops, bottoms, thick=0.035):
    """A drapery: a folded sheet along the points P (K, 2), the folds already in P, hung from tops to bottoms (K,);
    closed (front, back, both ends, the lower edge and the buried top) so it shows from both sides."""
    K, rows = len(P), 4
    V = []
    for side in (0.5, -0.5):
        for i in range(K):
            for r in range(rows):
                t = r / (rows - 1)
                z = tops[i] + (bottoms[i] - tops[i]) * t
                V.append((P[i, 0] + side * thick * nrm[i, 0], P[i, 1] + side * thick * nrm[i, 1], z))
    V = np.array(V, dtype=np.float64)
    off = K * rows
    F, W = [], []
    for i in range(K - 1):
        nm = 0.5 * (np.asarray(nrm[i]) + np.asarray(nrm[i + 1]))
        for r in range(rows - 1):
            for s, sg in ((0, 1.0), (1, -1.0)):
                a, b = s * off + i * rows + r, s * off + (i + 1) * rows + r
                F += [(a, b, b + 1), (a, b + 1, a + 1)]
                W += [(sg * nm[0], sg * nm[1], 0.0)] * 2
        for r, sg in ((0, 1.0), (rows - 1, -1.0)):  # the top (up, buried in the roof) and the lower edge (down)
            a, b = i * rows + r, (i + 1) * rows + r
            F += [(a, b, off + b), (a, off + b, off + a)]
            W += [(0.0, 0.0, sg)] * 2
    tan = np.asarray(P[-1], np.float64) - np.asarray(P[0], np.float64)
    for i, sg in ((0, -1.0), (K - 1, 1.0)):
        for r in range(rows - 1):
            a = i * rows + r
            F += [(a, off + a, off + a + 1), (a, off + a + 1, a + 1)]
            W += [(sg * tan[0], sg * tan[1], 0.0)] * 2
    F = np.array(F, dtype=np.int64)
    W = np.array(W, dtype=np.float64)
    a, b, d = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    flip = (np.cross(b - a, d - a) * W).sum(1) < 0
    F[flip] = F[flip][:, ::-1]
    return V, F


def circle(n):
    """n points round the unit circle by the rational parametrisation (no trig), n even."""
    half = n // 2
    pts = []
    for i in range(half):
        t = -1.0 + 2.0 * i / half
        d = 1.0 + t * t
        pts.append(((1.0 - t * t) / d, 2.0 * t / d))
    return pts + [(-a, -b) for a, b in pts]


def rim(cx, cy, ring, radii, floors, height, thick):
    """A rimstone dam: a low closed wall round (cx, cy) at radii (n,) along ring (n unit vectors), standing `height`
    over each point's floor (floors (n,)) from 0.05 m under it; a box section, wound outward."""
    V = []
    for (x, y), r, f in zip(ring, radii, floors):
        for rr, zz in ((r - 0.4 * thick, f - 0.05), (r - 0.1 * thick, f + height),
                       (r + 0.15 * thick, f + 0.92 * height), (r + 0.8 * thick, f - 0.05)):
            V.append((cx + rr * x, cy + rr * y, zz))
    V = np.array(V, dtype=np.float64)
    F = []
    m = len(ring)
    for i in range(m):
        j = (i + 1) % m
        for q in range(4):
            a, b = 4 * i + q, 4 * i + (q + 1) % 4
            c, d = 4 * j + (q + 1) % 4, 4 * j + q
            F += [(a, b, c), (a, c, d)]
    F = np.array(F, dtype=np.int64)
    # away from the wall's own centre line at that point (the section's middle)
    a, b, d = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    n = np.cross(b - a, d - a)
    cen = (a + b + d) / 3.0
    k = F[:, 0] // 4
    mid = 0.25 * (V[4 * k] + V[4 * k + 1] + V[4 * k + 2] + V[4 * k + 3])
    kk = F[:, 2] // 4
    mid = 0.5 * (mid + 0.25 * (V[4 * kk] + V[4 * kk + 1] + V[4 * kk + 2] + V[4 * kk + 3]))
    flip = (n * (cen - mid)).sum(1) < 0
    F[flip] = F[flip][:, ::-1]
    return V, F


def pool(cx, cy, ring, radii, level):
    """The still water inside a rimstone dam: a flat fan at `level`, facing up (seen from above only)."""
    V = [(cx, cy, level)] + [(cx + r * x, cy + r * y, level) for (x, y), r in zip(ring, radii)]
    m = len(ring)
    F = [(0, 1 + i, 1 + (i + 1) % m) for i in range(m)]
    V, F = np.array(V, dtype=np.float64), np.array(F, dtype=np.int64)
    a, b, d = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    flip = np.cross(b - a, d - a)[:, 2] < 0
    F[flip] = F[flip][:, ::-1]
    return V, F


def crystal(base, axis, length, r):
    """A spar crystal: a six-sided prism with a pointed tip, from 0.06 m inside its base along axis."""
    u, e1, e2 = frame(axis)
    b = np.asarray(base, np.float64) - 0.06 * u
    V = []
    for h in (0.0, 0.75 * length + 0.06):
        for x, y in RINGS[6]:
            V.append(b + h * u + r * (x * e1 + y * e2))
    V.append(b + (length + 0.06) * u)
    V.append(b)
    V = np.array(V)
    F = []
    for k in range(6):
        a, c = k, (k + 1) % 6
        F += [(a, c, c + 6), (a, c + 6, a + 6), (a + 6, c + 6, 12), (c, a, 13)]
    return V, outward(V, np.array(F, dtype=np.int64), b + 0.4 * length * u)


# ---------------------------------------------------------------- the grid's columns


class Cols:
    """Floors and roofs from the flood's columns (the walker's field: the same as the shell's above 2.6 m)."""

    def __init__(self, grid):
        self.g = grid

    def _lv(self, x, y):
        col = self.g.col_at(np.atleast_1d(np.asarray(x, np.float64)), np.atleast_1d(np.asarray(y, np.float64)))
        ok = col >= 0
        c = np.where(ok, col, 0)
        AF, AC = self.g.AF[:, c].copy(), self.g.AC[:, c].copy()
        AF[:, ~ok] = np.nan
        AC[:, ~ok] = np.nan
        return AF, AC

    def interval(self, x, y, z):
        """(floor, roof) of the air interval holding z, NaN in rock."""
        AF, AC = self._lv(x, y)
        z = np.atleast_1d(np.asarray(z, np.float64))
        inside = (AF <= z[None, :]) & (AC >= z[None, :])
        f = np.where(inside, AF, np.nan)
        c = np.where(inside, AC, np.nan)
        return np.nanmax(np.where(np.isnan(f), -np.inf, f), 0).astype(float), \
            np.nanmax(np.where(np.isnan(c), -np.inf, c), 0).astype(float)

    def floors_between(self, x, y, lo, hi):
        """The highest floor in (lo, hi) of each column, -inf when none."""
        AF, _ = self._lv(x, y)
        lo, hi = np.atleast_1d(lo), np.atleast_1d(hi)
        m = (AF > lo[None, :]) & (AF < hi[None, :])
        return np.max(np.where(m, AF, -np.inf), 0)


def _fin(a):
    a = np.asarray(a, np.float64)
    return np.where(np.isfinite(a), a, np.nan)


def seg_dist(x, y, a, b):
    """Plan distance from points to the segment a-b (square roots only)."""
    ax, ay = b[0] - a[0], b[1] - a[1]
    L2 = ax * ax + ay * ay
    t = np.clip(((x - a[0]) * ax + (y - a[1]) * ay) / L2, 0.0, 1.0) if L2 > 1e-12 else 0.0
    dx, dy = x - (a[0] + t * ax), y - (a[1] + t * ay)
    return np.sqrt(dx * dx + dy * dy)


# ---------------------------------------------------------------- placing them


CAND = 0.7  # metres between the candidate spots (one jittered spot per cell of a global plan grid)


class KeepOut:
    """Where nothing may stand. Called with points (x, y, floor): (route clearance m, floor items allowed, hanging
    items allowed). The route clearance is the plan distance from the nearest walking route's clear core (a
    passage's centre line, a chamber's lines between its mouths, spawns and arrivals) at that floor's height."""

    def __init__(self, sec, zones, guards, C):
        self.sec, self.zones, self.guards, self.C = sec, zones, guards, C
        d = sec.d
        pts = [s["at"] for s in d.get("spawns", [])] + [p["at"] for p in d.get("portals", []) or []]
        for sm in d.get("seams", []):
            pts += [sm["portal"], sm["arrival"]["at"]]
        self.pts = pts
        self.segs = []  # (a, b, z) of the chambers' lines between their mouths
        for p in sec.prims:
            if not (isinstance(p, C.Chamber) and p.walk):
                continue
            ends = []
            for q in sec.prims:
                if isinstance(q, C.Passage) and q.profile != "shaft":
                    for e in (q.P[0], q.P[-1]):
                        lx, ly = p.local(np.array([e[0]]), np.array([e[1]]))
                        if float(p.plan_sdf(lx, ly)[0]) <= 1.5 and abs(e[2] - p.c[2]) < 2.5:
                            ends.append((float(e[0]), float(e[1])))
            for q in pts:
                lx, ly = p.local(np.array([q[0]]), np.array([q[1]]))
                if float(p.plan_sdf(lx, ly)[0]) <= 1.0 and abs(q[2] - p.c[2]) < 2.5:
                    ends.append((float(q[0]), float(q[1])))
            nodes = ends + [(float(p.c[0]), float(p.c[1]))]
            for i in range(len(nodes)):
                for j in range(i + 1, len(nodes)):
                    self.segs.append((nodes[i], nodes[j], float(p.c[2])))

    def __call__(self, X, Y, Fz):
        sec, zones, guards, C = self.sec, self.zones, self.guards, self.C
        N = len(X)
        bb = (float(X.min()) - 3.0, float(Y.min()) - 3.0, float(Fz.min()) - 4.0, float(X.max()) + 3.0,
              float(Y.max()) + 3.0, float(Fz.max()) + 4.0)
        floor_ok = np.ones(N, bool)
        hang_ok = np.ones(N, bool)
        route = np.full(N, np.inf)
        d = sec.d
        for sm, ax, at, plus in sec.seam_boxes:
            u = X if ax == 0 else Y
            bad = np.abs(u - at) < SEAM_KEEP
            floor_ok &= ~bad
            hang_ok &= ~bad
        for p in self.pts:
            dd = np.sqrt((X - p[0]) ** 2 + (Y - p[1]) ** 2)
            bad = (dd < SEAM_KEEP + 0.5) & (np.abs(Fz - p[2]) < 3.0)
            floor_ok &= ~bad
            hang_ok &= ~bad
        for zn in zones:
            lx, ly, lz = zn.local(X, Y, Fz)
            bad = ((np.abs(lx) <= zn.half[0] + ZONE_KEEP) & (np.abs(lz) <= zn.half[2] + ZONE_KEEP)
                   & (np.abs(ly) <= zn.half[1] + 2.5))
            floor_ok &= ~bad
            hang_ok &= ~bad
        for dr in d.get("drops", []):
            a, b = dr["from"], dr["to"]
            bad = (seg_dist(X, Y, a, b) < float(dr.get("radius", 1.0)) + 1.0) & \
                (Fz > min(a[2], b[2]) - 1.5) & (Fz < max(a[2], b[2]) + 2.5)
            floor_ok &= ~bad
            hang_ok &= ~bad
        for gid, a, b, base, h, th in guards:
            bad = (seg_dist(X, Y, a, b) < 1.0 + th) & (np.abs(Fz - base) < 2.5)
            floor_ok &= ~bad
        for br in d.get("bridges", []):
            x0, y0, x1, y1 = br["box"]
            bad = (X > x0 - 1.0) & (X < x1 + 1.0) & (Y > y0 - 1.0) & (Y < y1 + 1.0) & (np.abs(Fz - br["top_z"]) < 3.0)
            floor_ok &= ~bad
            hang_ok &= ~bad
        prims = {p.id: p for p in sec.own}
        for w in d.get("water", []):
            if "chamber" in w and w["chamber"] in prims:
                c = prims[w["chamber"]]
                lx, ly = c.local(X, Y)
                rx, ry = 0.3 * c.sx + 1.1, 0.3 * c.sy + 1.1
                bad = ((lx / rx) ** 2 + (ly / ry) ** 2 < 1.0) & (Fz < c.c[2] + 1.5) & (Fz > c.c[2] - c.basin - 1.5)
                floor_ok &= ~bad
            elif w.get("along") in prims:
                p = prims[w["along"]]
                dpl, jj, tj = p.plan(X, Y)
                _, base, _ = p.floors(jj, tj, Fz, True)
                A, B = p.A[jj], p.B[jj]
                lat = ((B[:, 0] - A[:, 0]) * (Y - A[:, 1]) - (B[:, 1] - A[:, 1]) * (X - A[:, 0])) / np.maximum(p.L[jj],
                                                                                                             1e-9)
                W, _ = p.size_at(jj, tj)
                side = w.get("side", "all")
                near = (np.abs(Fz - base) < 1.5) & (dpl < 0.5 * W + 0.5)
                if side == "all":
                    bad = near
                else:
                    sg = 1.0 if side == "left" else -1.0
                    bad = near & (sg * lat > 0.5 * W - float(w.get("width", 1.0)) - 0.5)
                floor_ok &= ~bad
        for p in sec.prims:
            if isinstance(p, C.Passage) and p.hits(bb):
                if p.profile == "climb_face":
                    b = p.box
                    bad = (X > b[0]) & (X < b[3]) & (Y > b[1]) & (Y < b[4]) & (Fz > b[2] - 1.0) & (Fz < b[5])
                    floor_ok &= ~bad
                    hang_ok &= ~bad
                    continue
                dpl, jj, tj = p.plan(X, Y)
                W, _ = p.size_at(jj, tj)
                if p.profile == "shaft":
                    bad = (dpl < 0.5 * W + 1.2) & (Fz > p.P[:, 2].min() - 1.0) & (Fz < p.P[:, 2].max() + 1.0)
                    floor_ok &= ~bad
                    continue
                _, base, _ = p.floors(jj, tj, Fz, True)
                near = np.abs(Fz - base) < 2.0
                if p.profile in ("crawl", "fissure"):
                    bad = near & (dpl < 0.5 * W + 1.0)
                    floor_ok &= ~bad
                    hang_ok &= ~bad
                elif p.walk:
                    route = np.minimum(route, np.where(near, dpl - 0.5 * C.CORE["walk"][0], np.inf))
        for a, b, z in self.segs:
            near = np.abs(Fz - z) < 2.5
            if not near.any():
                continue
            dd = seg_dist(X, Y, a, b) - 0.5 * C.CORE["walk"][0]
            route = np.minimum(route, np.where(near, dd, np.inf))
        return route, floor_ok, hang_ok


def candidates(sec, cols, seed):
    """One jittered spot per CAND cell of the plan inside the section's own boxes, at every air interval there:
    (x, y, floor, roof, cell i, cell j, level)."""
    own = np.array(sec.own_boxes, np.float64)
    i0, i1 = int(np.floor(own[:, 0].min() / CAND)), int(np.ceil(own[:, 3].max() / CAND))
    j0, j1 = int(np.floor(own[:, 1].min() / CAND)), int(np.ceil(own[:, 4].max() / CAND))
    J, I = np.meshgrid(np.arange(j0, j1), np.arange(i0, i1), indexing="ij")
    I, J = I.ravel(), J.ravel()
    x = (I + 0.15 + 0.7 * hash3(I, J, 1, seed)) * CAND
    y = (J + 0.15 + 0.7 * hash3(I, J, 2, seed)) * CAND
    inplan = np.zeros(len(x), bool)
    for b in own:
        inplan |= (x > b[0] + 0.2) & (x < b[3] - 0.2) & (y > b[1] + 0.2) & (y < b[4] - 0.2)
    x, y, I, J = x[inplan], y[inplan], I[inplan], J[inplan]
    AF, AC = cols._lv(x, y)
    out = []
    for li in range(AF.shape[0]):
        f, c = AF[li], AC[li]
        ok = np.isfinite(f) & np.isfinite(c) & (c - f >= 0.6)
        inbox = np.zeros(len(x), bool)
        for b in own:
            inbox |= (x > b[0]) & (x < b[3]) & (y > b[1]) & (y < b[4]) & (f + 0.2 > b[2]) & (f + 0.2 < b[5])
        ok &= inbox
        k = np.nonzero(ok)[0]
        out.append(np.stack([x[k], y[k], f[k], c[k], I[k], J[k], np.full(len(k), li)], 1))
    return np.concatenate(out) if out else np.zeros((0, 7))


def probes(cols, X, Y, Fz, Cz):
    """Per candidate: the distance to the wall at 0.6 m (the first probe radius that meets rock, 4.5 when none), the
    direction it met it in (index into DIR8), the floor's flatness (largest rise or fall of the floors 0.45 m round)
    and the highest floor within a metre round (for hanging things)."""
    N = len(X)
    wd = np.full(N, 4.5)
    wdir = np.zeros(N, np.int64)
    found = np.zeros(N, bool)
    for R in (0.25, 0.5, 0.8, 1.2, 1.8, 2.6, 3.6):
        for k, (dx, dy) in enumerate(DIR8):
            f, _ = cols.interval(X + R * dx, Y + R * dy, Fz + 0.6)
            rock_ = ~np.isfinite(f)
            new = rock_ & ~found
            wd[new] = R
            wdir[new] = k
        found |= wd < 4.5
    flat = np.zeros(N)
    fnear = Fz.copy()
    for k, (dx, dy) in enumerate(DIR8):
        f, _ = cols.interval(X + 0.45 * dx, Y + 0.45 * dy, Fz + 0.3)
        flat = np.maximum(flat, np.where(np.isfinite(f), np.abs(f - Fz), 0.0))
        for R in (0.5, 1.0):
            fb = cols.floors_between(X + R * dx, Y + R * dy, Fz - 0.5, Cz - 0.3)
            fnear = np.maximum(fnear, fb)
    return wd, wdir, flat, fnear


class Placed:
    """Floor items placed so far, by 1 m plan cell, so no two overlap."""

    def __init__(self):
        self.cells = {}

    def free(self, x, y, z, r):
        cx, cy = int(np.floor(x)), int(np.floor(y))
        for i in range(cx - 3, cx + 4):
            for j in range(cy - 3, cy + 4):
                for (px, py, pz, pr) in self.cells.get((i, j), ()):
                    if abs(pz - z) < 2.0 and (px - x) ** 2 + (py - y) ** 2 < (pr + r) ** 2:
                        return False
        return True

    def add(self, x, y, z, r):
        self.cells.setdefault((int(np.floor(x)), int(np.floor(y))), []).append((x, y, z, r))


def decor(sec, grid, zones, guards, C):
    """The section's formations, fallen rock and breakdown, placed by geology (see the module's docstring). Returns
    (pieces [(V, F, tag, geology index)], proxies [(V, F, tag)], flood solids, report)."""
    seed = int(sec.seed) * 1000003 + (C.zlib.crc32(sec.key.encode("utf-8")) & 0xFFFFFF)
    cols = Cols(grid)
    cand = candidates(sec, cols, seed)
    rep = {"candidates": int(len(cand)), "made": {k: 0 for k in TAG}, "collide": 0, "skipped": {}}
    if not len(cand):
        return [], [], [], rep
    X, Y, Fz, Cz = cand[:, 0], cand[:, 1], cand[:, 2], cand[:, 3]
    keep_out = KeepOut(sec, zones, guards, C)
    route, floor_ok, hang_ok = keep_out(X, Y, Fz)
    wd, wdir, flat, fnear = probes(cols, X, Y, Fz, Cz)
    # each spot's geology: the primitive that shapes the field 0.6 m above its floor
    _, _, dom, _ = sec.field_points(np.stack([X, Y, Fz + 0.6], 1), track=True)
    geo = np.array([sec.prims[i].geo if i >= 0 else 0 for i in dom], np.int64)
    profs = [profile(n, sec.geology.get(n)) for n in sec.geo_names]
    pieces, proxies, solids = [], [], []
    placed = Placed()
    own = np.array(sec.own_boxes, np.float64)
    seams = [(ax, at) for _sm, ax, at, _p in sec.seam_boxes]

    def inside(x, y):
        if not any(b[0] < x < b[3] and b[1] < y < b[4] for b in own):
            return False
        return all(abs((x if ax == 0 else y) - at) >= SEAM_KEEP - 0.3 for ax, at in seams)

    def iv(x, y, z):
        f, c = cols.interval(x, y, z)
        return (float(f[0]) if np.isfinite(f[0]) else None), (float(c[0]) if np.isfinite(c[0]) else None)

    def route_at(x, y, z):
        r, fo, _ = keep_out(np.array([x]), np.array([y]), np.array([z]))
        return float(r[0]) if fo[0] else -1.0

    def made(kind, V, F, g, coll=None):
        pieces.append((V, F, TAG[kind], g))
        rep["made"][kind] += 1
        if coll is not None:
            proxies.append(coll)
            rep["collide"] += 1

    def skip(why):
        rep["skipped"][why] = rep["skipped"].get(why, 0) + 1

    def mite(x, y, f, roof, rng, g, w, tall):
        """A stalagmite at (x, y) on floor f: small (no collision) or tall (collision), if it fits."""
        if tall:
            h = min(rng.uniform(COLLIDE_MIN, 0.6 + 1.9 * rng.uniform() ** 2), roof - f - 0.6)
            if h < COLLIDE_MIN:
                return False
            rb = min(0.12 + 0.16 * h * rng.uniform(0.7, 1.3), 0.6)
        else:
            h = rng.uniform(0.06, STEP_FREE)
            rb = 0.04 + 0.25 * h * rng.uniform(0.7, 1.3)
        keep = (ROUTE_KEEP if tall else 0.25) + rb
        if route_at(x, y, f) < keep or not placed.free(x, y, f, rb):
            skip("mite_room")
            return False
        turn = rng.turn()
        V, F = stalagmite(x, y, f, h, rb, turn, rng)
        coll = None
        if tall:
            PV, PF = lathe([(x, y, f - 0.1, rb), (x, y, f + 0.5 * h, 0.75 * rb)], 6, turn, tip=(x, y, f + h),
                           cap=True)
            coll = (PV, PF, TAG["stalagmite"])
            solids.append(("disk", x, y, 1.12 * rb, f - 0.2, f + SOLID_TOP))
        placed.add(x, y, f, 1.12 * rb)
        made("stalagmite", V, F, g, coll)
        return True

    order = np.lexsort((cand[:, 6], cand[:, 5], cand[:, 4]))
    for idx in order:
        x, y, f, c = float(X[idx]), float(Y[idx]), float(Fz[idx]), float(Cz[idx])
        g = int(geo[idx])
        w = profs[g]["decor"]
        rng = C.Rng(seed, int(cand[idx, 4]), int(cand[idx, 5]), int(cand[idx, 6]))
        u, u2 = rng.uniform(), rng.uniform()
        h = c - f
        near_wall = wd[idx] < 1.3
        # ---- the floor
        if floor_ok[idx] and flat[idx] < 0.2:
            pb = 0.02 * w.get("blocks", 0.0) * (1.6 if wd[idx] < 2.0 else 0.6)
            pm = 0.035 * w.get("stalagmite", 0.0) * (1.0 if h > 3.0 else 0.4)
            pc = (0.03 if h <= 5.5 else 0.01) * w.get("column", 0.0) if 2.4 <= h <= 9.0 else 0.0
            pr = 0.012 * w.get("rimstone", 0.0) if flat[idx] < 0.08 else 0.0
            px = 0.05 * w.get("crystal", 0.0) if near_wall else 0.0
            pk = 0.4 * w.get("rocks", 0.0) * (1.8 if near_wall else 0.7)
            acc = 0.0
            if u < (acc := acc + pb):
                sx = 0.5 + 1.2 * rng.uniform() ** 2
                sy, sz = sx * rng.uniform(0.6, 1.0), sx * rng.uniform(0.45, 0.8)
                sink = rng.uniform(0.08, 0.25)
                top = sz * (1.0 - sink)
                if top < COLLIDE_MIN:
                    sz = COLLIDE_MIN / (1.0 - sink) + 0.02
                rr = 0.5 * float(np.sqrt(sx * sx + sy * sy)) * 1.18
                if route_at(x, y, f) >= ROUTE_KEEP + rr and placed.free(x, y, f, rr) and sz * (1 - sink) < h - 0.6:
                    turn = rng.turn()
                    V, F, L = block(x, y, f, sx, sy, sz, turn, rng, C.TC_V, C.TC_F, sink)
                    hx, hy = float(np.abs(L[:, 0]).max()), float(np.abs(L[:, 1]).max())
                    solids.append(("rect", x, y, hx, hy, turn[0], turn[1], f - 0.2, f + SOLID_TOP))
                    placed.add(x, y, f, rr)
                    made("block", V, F, g, (V, F, TAG["block"]))
                else:
                    skip("block_room")
            elif u < (acc := acc + pm):
                n = 1 + int(4 * rng.uniform() ** 2)
                for k in range(n):
                    ox, oy = (rng.uniform(-0.7, 0.7), rng.uniform(-0.7, 0.7)) if k else (0.0, 0.0)
                    xm, ym = x + ox, y + oy
                    fm, cm = iv(xm, ym, f + 0.3)
                    if fm is None or abs(fm - f) > 0.15 or not inside(xm, ym):
                        continue
                    mite(xm, ym, fm, cm, rng, g, w, tall=rng.uniform() < 0.45)
            elif u < (acc := acc + pc):
                rb = 0.12 + 0.05 * h + 0.4 * rng.uniform() ** 2
                if route_at(x, y, f) >= ROUTE_KEEP + 1.12 * rb and placed.free(x, y, f, 1.12 * rb):
                    turn = rng.turn()
                    V, F = column(x, y, f, c, rb, turn, rng)
                    PV, PF = lathe([(x, y, f - 0.1, 1.05 * rb), (x, y, c + 0.2, 1.05 * rb)], 8, turn, cap=True,
                                   tip=(x, y, c + 0.3))
                    solids.append(("disk", x, y, 1.15 * rb, f - 0.2, c + 0.5))
                    placed.add(x, y, f, 1.15 * rb)
                    made("column", V, F, g, (PV, PF, TAG["column"]))
                else:
                    skip("column_room")
            elif u < (acc := acc + pr):
                R = 0.4 + 0.8 * rng.uniform()
                if route_at(x, y, f) >= 0.3 + R and placed.free(x, y, f, R):
                    ring = circle(14)
                    for step in range(1 + int(2 * rng.uniform())):
                        cx_, cy_ = x + 0.35 * R * step * DIR8[wdir[idx]][0], y + 0.35 * R * step * DIR8[wdir[idx]][1]
                        Rk = R * (1.0 - 0.3 * step)
                        radii = [Rk * rng.uniform(0.75, 1.2) for _ in ring]
                        fl = []
                        for (ex, ey), rk_ in zip(ring, radii):
                            fz, _ = iv(cx_ + rk_ * ex, cy_ + rk_ * ey, f + 0.3)
                            fl.append(fz if fz is not None and abs(fz - f) < 0.25 else f)
                        hd = rng.uniform(0.03, 0.08)
                        V, F = rim(cx_, cy_, ring, radii, fl, hd, rng.uniform(0.1, 0.2))
                        made("rimstone", V, F, g)
                        V, F = pool(cx_, cy_, ring, [r_ - 0.04 for r_ in radii], min(fl) + 0.75 * hd)
                        made("pool", V, F, g)
                    placed.add(x, y, f, R)
                else:
                    skip("rim_room")
            elif u < (acc := acc + px):
                if route_at(x, y, f) >= 0.3 + 0.45 and placed.free(x, y, f, 0.4):
                    for _k in range(3 + int(7 * rng.uniform())):
                        bx, by = x + rng.uniform(-0.35, 0.35), y + rng.uniform(-0.35, 0.35)
                        fz, _ = iv(bx, by, f + 0.2)
                        if fz is None or abs(fz - f) > 0.15:
                            continue
                        L = rng.uniform(0.06, 0.28)
                        V, F = crystal((bx, by, fz), (rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6), 1.0), L,
                                       rng.uniform(0.012, 0.045))
                        made("crystal", V, F, g)
                    placed.add(x, y, f, 0.4)
            elif u < (acc := acc + pk):
                for _k in range(1 + int(3 * rng.uniform() ** 2)):
                    bx, by = x + rng.uniform(-0.3, 0.3), y + rng.uniform(-0.3, 0.3)
                    fz, _ = iv(bx, by, f + 0.2)
                    if fz is None or abs(fz - f) > 0.15 or not inside(bx, by):
                        continue
                    s = 0.06 + 0.26 * rng.uniform() ** 2
                    sx, sy, sz = s, s * rng.uniform(0.55, 1.0), s * rng.uniform(0.3, 0.65)
                    if route_at(bx, by, fz) < 0.2 + s or not placed.free(bx, by, fz, 0.5 * s):
                        continue
                    V, F, _L = block(bx, by, fz, sx, sy, sz, rng.turn(), rng, C.TC_V, C.TC_F, rng.uniform(0.2, 0.4))
                    placed.add(bx, by, fz, 0.5 * s)
                    made("rock", V, F, g)
        # ---- the roof
        tipmin = max(f, float(fnear[idx])) + DECOR_HEAD
        if not hang_ok[idx] or c - tipmin < 0.3:
            continue
        pt = 0.12 * w.get("stalactite", 0.0)
        pi_ = pt + 0.12 * w.get("icicle", 0.0)
        pu = pi_ + (0.08 * w.get("curtain", 0.0) if (wd[idx] <= 1.2 and h >= 3.2) else 0.0)
        px = pu + 0.04 * w.get("crystal", 0.0)
        if u2 < pi_:
            ice = u2 >= pt
            n = (4 + int(16 * rng.uniform() ** 2)) if ice else (3 + int(14 * rng.uniform() ** 2))
            spread = rng.uniform(0.4, 1.3)
            for k in range(n):
                ox, oy = (rng.uniform(-spread, spread), rng.uniform(-spread, spread)) if k else (0.0, 0.0)
                if ox * ox + oy * oy > spread * spread:
                    continue
                xm, ym = x + ox, y + oy
                if not inside(xm, ym):
                    continue
                fm, cm = iv(xm, ym, c - 0.2)
                if cm is None or fm is None or abs(cm - c) > 0.8:
                    continue
                low = max(tipmin, fm + DECOR_HEAD)
                room = cm - low
                if room < 0.05:
                    continue
                q = rng.uniform()
                L = min((0.08 + 1.3 * q * q * q) if ice else (0.06 + 2.4 * q * q * q * q), room)
                if ice:
                    rb = 0.012 + 0.05 * L
                elif L < 0.4 and rng.uniform() < 0.55:
                    rb = rng.uniform(0.005, 0.011)  # a straw
                else:
                    rb = min(0.02 + 0.1 * L * rng.uniform(0.6, 1.4), 0.45)
                # a big one has its stalagmite under it, on a floor off the route; where the two would all but
                # meet, they are one column
                if not ice and L > 0.6 and rng.uniform() < 0.5 * w.get("stalagmite", 0.0):
                    hm = min(0.6 + 1.9 * rng.uniform() ** 2, cm - fm - 0.6)
                    rc = max(1.4 * rb, 0.15)
                    meet = (cm - L) - (fm + hm) < 0.6 and w.get("column", 0.0) > 0
                    if meet and route_at(xm, ym, fm) >= ROUTE_KEEP + 1.12 * rc and placed.free(xm, ym, fm, 1.12 * rc):
                        turn = rng.turn()
                        V, F = column(xm, ym, fm, cm, rc, turn, rng)
                        PV, PF = lathe([(xm, ym, fm - 0.1, 1.05 * rc), (xm, ym, cm + 0.2, 1.05 * rc)], 8, turn,
                                       cap=True, tip=(xm, ym, cm + 0.3))
                        solids.append(("disk", xm, ym, 1.15 * rc, fm - 0.2, cm + 0.5))
                        placed.add(xm, ym, fm, 1.15 * rc)
                        made("column", V, F, g, (PV, PF, TAG["column"]))
                        continue
                    mite(xm + rng.uniform(-0.1, 0.1), ym + rng.uniform(-0.1, 0.1), fm, cm, rng, g, w,
                         tall=hm >= COLLIDE_MIN and rng.uniform() < 0.6)
                V, F = stalactite(xm, ym, cm, L, rb, rng.turn(), rng, icicle=ice)
                made("icicle" if ice else ("straw" if rb < 0.012 else "stalactite"), V, F, g)
        elif u2 < pu:
            k_ = int(wdir[idx])
            nx, ny = DIR8[k_]
            tx, ty = -ny, nx
            Lc = rng.uniform(1.0, 3.2)
            K = max(6, int(Lc / 0.1))
            amp = rng.uniform(0.07, 0.16)
            wave = rng.uniform(0.22, 0.4)
            phase = rng.uniform()
            drop = rng.uniform(0.5, 1.8)
            P, nrm, tops, bots = [], [], [], []
            steps = 0.1 * np.arange(1, 40)
            for i in range(K):
                s = -0.5 * Lc + Lc * i / (K - 1)
                q = (s / wave + phase) % 1.0
                crest = 4.0 * q * (1.0 - q)
                fold = amp * (crest - 0.67)
                # the wall just under the roof, out along the wall's direction at the floor: the sheet follows it
                bx, by = x + s * tx, y + s * ty
                fa_, _ = cols.interval(bx + steps * nx, by + steps * ny, np.full(len(steps), c - 0.7))
                hit = np.nonzero(~np.isfinite(fa_))[0]
                if not len(hit):
                    break
                off = float(steps[hit[0]]) - 0.12 - amp + fold
                if off < 0.0:
                    break
                pxp, pyp = bx + off * nx, by + off * ny
                if not inside(pxp, pyp):
                    break
                fm, cm = iv(pxp, pyp, c - 0.6)
                if cm is None or fm is None or abs(cm - c) > 1.0:
                    break
                env = 1.0 - (2.0 * s / Lc) ** 2  # longest in the middle, tapering to both ends
                bot = cm - drop * (0.2 + 0.8 * env * (0.7 + 0.3 * crest))
                bot = max(bot, max(fm, tipmin - DECOR_HEAD) + DECOR_HEAD)
                if bot > cm - 0.1:
                    bot = cm - 0.1
                P.append((pxp, pyp))
                nrm.append((nx, ny))
                tops.append(cm + 0.3)
                bots.append(bot)
            if len(P) >= 4:
                V, F = curtain(np.array(P), np.array(nrm), np.array(tops), np.array(bots))
                made("curtain", V, F, g)
            else:
                skip("curtain_room")
        elif u2 < px:
            for _k in range(3 + int(6 * rng.uniform())):
                bx, by = x + rng.uniform(-0.4, 0.4), y + rng.uniform(-0.4, 0.4)
                if not inside(bx, by):
                    continue
                _, cm = iv(bx, by, c - 0.2)
                if cm is None or cm - 0.3 < tipmin:
                    continue
                V, F = crystal((bx, by, cm), (rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6), -1.0),
                               rng.uniform(0.06, 0.25), rng.uniform(0.012, 0.04))
                made("crystal", V, F, g)
    rep["pieces"] = len(pieces)
    rep["triangles"] = int(sum(len(p[1]) for p in pieces))
    rep["proxy_triangles"] = int(sum(len(p[1]) for p in proxies))
    return pieces, proxies, solids, rep
