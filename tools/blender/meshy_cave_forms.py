"""meshy_cave_forms.py: the shapes of the cave's formations that need more than a lathe (the realism pass 3).

Plain Python with numpy, no Blender; meshy_cave_rock.py calls it. Like the rock module, geometry stays repeatable: no
sin, cos, exp, log or fractional power in any shape, only + - * / and sqrt (which are exact in IEEE), and the numbers
come from the core's splitmix64 Rng.

- `tube`: a closed tube along any path (helictites, gypsum flowers, curved straws).
- `helictite`: a thin tube that grows in every direction, thinning to a tip.
- `flower`: a gypsum flower, curled blades from one point.
- `wall_mesh`: a sheet over a grid of wall points, raised by a height per point (flowstone sheets, shelfstone, bosses,
  crusts): its rim is buried in the wall, so it is open at the back and is drawn from the front only.
- `bump`, `saw`: the profiles the shapes use (parabolas and a triangle wave, no trig).
"""

from __future__ import annotations

import numpy as np

_S3, _S2 = float(np.sqrt(3.0)), float(np.sqrt(0.5))
RINGS = {
    5: [(1.0, 0.0), (0.30901699437494745, 0.9510565162951535), (-0.8090169943749475, 0.5877852522924731),
        (-0.8090169943749475, -0.5877852522924731), (0.30901699437494745, -0.9510565162951535)],
    6: [(1.0, 0.0), (0.5, 0.5 * _S3), (-0.5, 0.5 * _S3), (-1.0, 0.0), (-0.5, -0.5 * _S3), (0.5, -0.5 * _S3)],
}


def bump(t, c: float, w: float):
    """1 at t = c falling to 0 at c +- w by a parabola (0 beyond): the bulges and narrows of a column."""
    x = (np.asarray(t, np.float64) - c) / w
    return np.maximum(1.0 - x * x, 0.0)


def saw(t):
    """A triangle wave of period 1 from 0 to 1 (0 at integers): the scallops of a curtain's lower edge."""
    f = np.asarray(t, np.float64)
    f = f - np.floor(f)
    return 1.0 - np.abs(2.0 * f - 1.0)


def unit(v):
    v = np.asarray(v, np.float64)
    return v / np.sqrt((v * v).sum(-1, keepdims=True))


def frame(axis):
    """The unit axis and two unit vectors square to it (and to each other), without trig."""
    u = unit(axis)
    ref = np.array([1.0, 0.0, 0.0]) if abs(u[0]) < 0.8 else np.array([0.0, 1.0, 0.0])
    e1 = unit(np.cross(u, ref))
    return u, e1, np.cross(u, e1)


def tube(P, R, n: int, wobble=None, tip=None, cap: bool = True):
    """A closed tube along the path P (K, 3) with radius R (K,) and n (5 or 6) sides; the rings stand square to the
    path, turned along it so they do not twist. `wobble` (K, n) scales each vertex's radius; `tip` closes the last
    ring to a point, `cap` the first ring flat. Wound outward by the signed volume. Returns (V, F)."""
    P = np.asarray(P, np.float64)
    R = np.asarray(R, np.float64)
    K = len(P)
    T = np.empty_like(P)
    T[1:-1] = P[2:] - P[:-2]
    T[0] = P[1] - P[0]
    T[-1] = P[-1] - P[-2]
    T = unit(T)
    ring = RINGS[n]
    e1 = None
    V = []
    for i in range(K):
        t = T[i]
        if e1 is None:
            _u, e1, e2 = frame(t)
        else:
            e1 = unit(e1 - t * float(e1 @ t))
            e2 = np.cross(t, e1)
        for k, (x, y) in enumerate(ring):
            rr = R[i] * (wobble[i][k] if wobble is not None else 1.0)
            V.append(P[i] + rr * (x * e1 + y * e2))
    F = []
    for i in range(K - 1):
        for k in range(n):
            a, b = i * n + k, i * n + (k + 1) % n
            c, d = a + n, b + n
            F += [(a, b, d), (a, d, c)]
    last = (K - 1) * n
    if tip is not None:
        t_ = len(V)
        V.append(tuple(tip))
        F += [(last + k, last + (k + 1) % n, t_) for k in range(n)]
    if cap:
        t_ = len(V)
        V.append(tuple(P[0]))
        F += [(k, t_, (k + 1) % n) for k in range(n)]
    V = np.array(V, np.float64)
    F = np.array(F, np.int64)
    a_, b_, d_ = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    if float(np.einsum("ij,ij->i", a_ - V[0], np.cross(b_ - V[0], d_ - V[0])).sum()) < 0:
        F = F[:, ::-1].copy()
    return V, F


def helictite(base, axis, length: float, r: float, rng, K: int = 8):
    """A helictite or an eccentric: a thin tube from `base` (0.04 m inside it) that bends at every ring, thinning to a
    rounded tip, along `axis` at first."""
    d = unit(axis)
    p = np.asarray(base, np.float64) - 0.04 * d
    P = [p]
    R = [r * 1.25]
    step = (length + 0.04) / K
    for i in range(1, K + 1):
        t = i / K
        d = unit(d + (0.5 + 0.5 * t) * np.array([rng.uniform(-0.55, 0.55), rng.uniform(-0.55, 0.55),
                                                 rng.uniform(-0.55, 0.55)]))
        p = p + step * d
        P.append(p.copy())
        R.append(max(r * (1.0 - 0.6 * t), 0.004))
    V, F = tube(np.array(P), np.array(R), 5, tip=P[-1] + 0.5 * step * d, cap=True)
    return V, F


def flower(base, axis, size: float, rng, petals: int = 6):
    """A gypsum flower: `petals` curled blades from `base` (a ring of curling tubes that open and curl at the tip),
    `size` metres long. Returns the petals' (V, F) pieces; each is a closed tube."""
    u, e1, e2 = frame(axis)
    out = []
    for k in range(petals):
        q = k / petals + rng.uniform(-0.06, 0.06)
        # a unit vector round the axis by the rational parametrisation (no trig)
        t = -1.0 + 2.0 * q
        d_ = 1.0 + t * t
        cx, cy = (1.0 - t * t) / d_, 2.0 * t / d_
        out_dir = cx * e1 + cy * e2
        curl = 0.55 + 0.35 * rng.uniform()
        L = size * rng.uniform(0.7, 1.0)
        pts, rad = [], []
        for i in range(6):
            s = i / 5.0
            pts.append(np.asarray(base, np.float64) + u * (L * s * (1.0 - 0.35 * s)) + out_dir * (curl * L * s * s))
            rad.append(max(0.014 * (1.0 - 0.55 * s) * (0.6 + 4.0 * size), 0.005))
        pts[0] = pts[0] - 0.04 * u
        V, F = tube(np.array(pts), np.array(rad), 5, tip=pts[-1] + 0.2 * L * (u * 0.3 + out_dir * 0.9), cap=True)
        out.append((V, F))
    return out


def wall_mesh(S, N, h):
    """A sheet over a grid of wall points S (R, C, 3) with their outward normals N (R, C, 3), each point raised by
    h (R, C) metres (negative: buried), as (V, F), wound toward N."""
    R, C = h.shape
    V = (S + N * h[..., None]).reshape(-1, 3)
    idx = np.arange(R * C).reshape(R, C)
    a, b, c, d = idx[:-1, :-1], idx[1:, :-1], idx[1:, 1:], idx[:-1, 1:]
    F = np.concatenate([np.stack([a.ravel(), b.ravel(), c.ravel()], 1),
                        np.stack([a.ravel(), c.ravel(), d.ravel()], 1)])
    nn = N.reshape(-1, 3)
    n = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    flip = (n * nn[F[:, 0]]).sum(1) < 0
    F[flip] = F[flip][:, ::-1]
    return V, F
