"""meshy_cave_lightmap.py: the cave shell's lightmap, the plain-Python part (numpy only; tests/test_cave_lightmap.py).

The cave builder (meshy_cave_build.py) bakes the shell's light into textures instead of per vertex. This module holds
everything about that which needs no Blender:

- the charts: the shell's faces grouped by chunk, material, facing (the six box directions), seam side and a tile of
  TILE_M metres, then by shared edges; each chart is the faces' projection on the plane its facing names, so a chart
  never folds over itself and its texels are square in metres;
- the resolution rule (`tpm_for`): texels per metre from the shell's area, the page's side and the packing's
  measured efficiency, at most TPM_MAX and at least TPM_MIN, so one page of at most MAX_SIDE x MAX_SIDE holds the
  section (a 2048 page with no mip chain is 16.8 MB of GPU memory, and the file stays under its 10 MB);
- the packing (`pack`): shelves of charts sorted by height, PAD texels of padding round each chart;
- the rasterizer (`rasterize`): for each texel centre inside a face its face and barycentric weights, and the padding
  filled from the chart's own texels (`dilate`), so the viewer's bilinear filter never reads a neighbour chart;
- the texels' world points and normals, the seam weight (`seam_weight`: 0 on a seam plane, 1 a band inside the file,
  so both files show the same light on the plane, fading in at its region's edge), a chart-aware smoothing of the
  bake's noise;
- the ink floor's darkest-texel ratio relaxed across the materials' edges (`relax_floor`), and the chart borders
  stitched (`border_edges`, `stitch_edges`: the linear filter reads the same light on both sides of a border);
- the GLB patch (`patch_glb`): the lightmap pages go into the file as images, each lightmapped material gets
  `emissiveTexture` (texCoord 1, the lightmap's UV set) with `emissiveFactor` the page's scale and the material extras
  `wdi_lightmap`, the shape docs/walk-areas.md (section 4, "A cave's lightmap") gives the viewer.
"""

from __future__ import annotations

import json
import math
import struct

import numpy as np

TPM_MAX = 32.0      # texels per metre at most: four texels to the core's 0.125 m cell
TPM_MIN = 8.0       # and at least: the vertex light's own spacing
MAX_SIDE = 2048     # a page's side at most (texels)
PAD = 2             # texels of padding round each chart (the bilinear filter reads one)
TILE_M = 4.0        # metres: a chart's extent at most, along each of its plane's axes
PACK_EFF = 0.46     # metres of plane x tpm^2 over the page's texels (measured: the Great Gallery 0.46 at 26 tpm)
SEAM_BAND_M = 1.0   # metres inside a file over which its own texel light gives way to the shared vertex light
SEAM_HOLD_M = 0.9   # metres inside a file next to a seam plane where its texels show the shared vertex light alone: the seam
                    # check's 0.6 m window plus 0.3 m, the reach of a shell face (a face is drawn vertex-lit only when every
                    # vertex is in the hold, so a face whose centre is within 0.6 m must have all of them within it; at 0.6
                    # the faces astride it were page-lit in one file and vertex-lit in the other: well_north showed 12 %
                    # of its faces between 0.3 and 0.6 m, p95 16 %, under that rule)
UV_SET = "lightmap"  # the lightmap's UV map in Blender; the second UV set (TEXCOORD_1) in the GLB


# ---------------------------------------------------------------- charts


def face_normals(V: np.ndarray, F: np.ndarray) -> np.ndarray:
    V = np.asarray(V, np.float64)
    return np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])


def face_dirs(V: np.ndarray, F: np.ndarray) -> np.ndarray:
    """Each face's box direction, 0..5: 2 x its normal's largest axis, plus 1 where that component is negative."""
    n = face_normals(V, F)
    ax = np.argmax(np.abs(n), axis=1)
    neg = n[np.arange(len(n)), ax] < 0
    return (2 * ax + neg).astype(np.int64)


PLANE_AXES = np.array([[1, 2], [1, 2], [0, 2], [0, 2], [0, 1], [0, 1]])


def plane_coords(P: np.ndarray, d: np.ndarray) -> np.ndarray:
    """Points' (N x 3) coordinates in metres on the plane of box direction d (N): the two axes it does not name."""
    pick = PLANE_AXES[np.asarray(d, np.int64)]
    return np.take_along_axis(np.asarray(P, np.float64), pick, axis=1)


def components(n: int, a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Connected components of n items joined by the pairs (a, b): each item's label, the least item of its
    component (a union-find by hooking roots to the lesser root, then halving paths, vectorized)."""
    parent = np.arange(n, dtype=np.int64)
    a = np.asarray(a, np.int64)
    b = np.asarray(b, np.int64)
    while True:
        pa, pb = parent[a], parent[b]
        lo, hi = np.minimum(pa, pb), np.maximum(pa, pb)
        diff = lo != hi
        if not diff.any():
            break
        np.minimum.at(parent, hi[diff], lo[diff])
        while True:
            p2 = parent[parent]
            if np.array_equal(p2, parent):
                break
            parent = p2
    return parent


def edge_pairs(F: np.ndarray) -> tuple:
    """Pairs of faces (i, j) sharing an edge (by vertex index; every pair of faces on each edge)."""
    F = np.asarray(F, np.int64)
    e = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]])
    e.sort(axis=1)
    f = np.tile(np.arange(len(F)), 3)
    key = e[:, 0] * (int(F.max()) + 1 if len(F) else 1) + e[:, 1]
    o = np.argsort(key, kind="stable")
    key, f = key[o], f[o]
    same = key[1:] == key[:-1]
    return f[:-1][same], f[1:][same]


SEAM_MARGIN_M = 3.0  # metres round a seam's window (across the plane and up) that its region takes in
SEAM_RAMP_M = 1.0    # metres inside the region's edges over which its hold on the light fades in (no hard edge)


def _ramp(x: np.ndarray, lo: float, hi: float, r: float) -> np.ndarray:
    """1 well inside [lo, hi], 0 outside it, linear over r metres inside each end."""
    return np.clip(np.minimum(x - lo, hi - x) / r, 0.0, 1.0)


def seam_soft(P: np.ndarray, sm) -> tuple:
    """For a seam ((id, axis, at, sign) or that with its window (u0, z0, u1, z1) and stub length): each point's signed
    distance s past the plane into the neighbour's side, and how far it lies in the seam's region, 0 to 1: 1 within
    SEAM_MARGIN_M - SEAM_RAMP_M of the window across the plane and in height (and from the band inside to the stub's
    end), falling to 0 over SEAM_RAMP_M to the region's edge. A seam plane is a local cut: elsewhere the section may
    lie on either side of it, and the region's edge never shows as a hard line in the light."""
    P = np.asarray(P, np.float64)
    ax, at, sign = int(sm[1]), float(sm[2]), float(sm[3])
    s = (P[:, ax] - at) * sign
    if len(sm) < 6:
        return s, np.ones(len(P))
    u0, z0, u1, z1 = (float(v) for v in sm[4])
    stub = float(sm[5])
    M, r = SEAM_MARGIN_M, SEAM_RAMP_M
    soft = _ramp(P[:, 1 - ax], u0 - M, u1 + M, r) * _ramp(P[:, 2], z0 - M, z1 + M, r)
    soft *= _ramp(s, -SEAM_BAND_M - M, stub + M, r)
    return s, soft


def seam_region(P: np.ndarray, sm) -> tuple:
    """seam_soft's distance and whether the point lies in the seam's region at all (its charts are split there)."""
    s, soft = seam_soft(P, sm)
    if len(sm) < 6:
        return s, np.ones(len(P), bool)
    u0, z0, u1, z1 = (float(v) for v in sm[4])
    stub = float(sm[5])
    P = np.asarray(P, np.float64)
    u = P[:, 1 - int(sm[1])]
    M = SEAM_MARGIN_M
    inr = (u >= u0 - M) & (u <= u1 + M) & (P[:, 2] >= z0 - M) & (P[:, 2] <= z1 + M)
    inr &= (s >= -SEAM_BAND_M - M) & (s <= stub + M)
    return s, inr


def seam_side(P: np.ndarray, planes: list) -> np.ndarray:
    """A code per point: bit i set when it lies on the neighbour's side of seam i, in the seam's region."""
    code = np.zeros(len(P), np.int64)
    for i, sm in enumerate(planes):
        s, inr = seam_region(P, sm)
        code |= ((s > 0) & inr).astype(np.int64) << i
    return code


def charts(V: np.ndarray, F: np.ndarray, group: np.ndarray, planes: list = (), tile_m: float = TILE_M) -> tuple:
    """The charts: faces with the same group (chunk and material, as one int per face), box direction, seam side and
    tile of tile_m metres, joined by shared edges. Returns (chart per face, numbered 0.. in order of first face, box
    direction per face)."""
    V = np.asarray(V, np.float64)
    F = np.asarray(F, np.int64)
    d = face_dirs(V, F)
    C = V[F].mean(axis=1)
    pc = plane_coords(C, d)
    tile = np.floor(pc / tile_m).astype(np.int64)
    side = seam_side(C, list(planes))
    key = np.stack([np.asarray(group, np.int64), d, side, tile[:, 0], tile[:, 1]], axis=1)
    _u, kid = np.unique(key, axis=0, return_inverse=True)
    kid = kid.ravel()
    a, b = edge_pairs(F)
    same = kid[a] == kid[b]
    lab = components(len(F), a[same], b[same])
    _u2, first, chart = np.unique(lab, return_index=True, return_inverse=True)
    # number the charts by their first face, so the numbering follows the faces' order
    order = np.argsort(first, kind="stable")
    rank = np.empty_like(order)
    rank[order] = np.arange(len(order))
    return rank[chart.ravel()].astype(np.int64), d


# ---------------------------------------------------------------- the resolution rule and the packing


def tpm_for(plane_area_m2: float, side: int = MAX_SIDE, eff: float = PACK_EFF, tpm_max: float = TPM_MAX,
            tpm_min: float = TPM_MIN) -> float:
    """Texels per metre for a shell of `plane_area_m2` (its faces' areas projected on their charts' planes): the most
    that fills one side x side page at the packing's efficiency, between tpm_min and tpm_max, in steps of 0.5."""
    if plane_area_m2 <= 0:
        return float(tpm_max)
    t = math.sqrt(eff * side * side / plane_area_m2)
    return float(min(tpm_max, max(tpm_min, math.floor(t * 2.0) / 2.0)))


def chart_boxes(V: np.ndarray, F: np.ndarray, chart: np.ndarray, d: np.ndarray, tpm: float) -> tuple:
    """Each face corner's plane coordinates in texels (F x 3 x 2) and each chart's (min corner, size) in texels."""
    P = np.asarray(V, np.float64)[np.asarray(F, np.int64)]                    # F x 3 x 3
    pc = plane_coords(P.reshape(-1, 3), np.repeat(d, 3)).reshape(-1, 3, 2) * tpm
    n = int(chart.max()) + 1 if len(chart) else 0
    lo = np.full((n, 2), np.inf)
    hi = np.full((n, 2), -np.inf)
    np.minimum.at(lo, chart, pc.min(axis=1))
    np.maximum.at(hi, chart, pc.max(axis=1))
    size = np.ceil(hi - lo).astype(np.int64) + 1
    return pc, lo, size


def pack(size: np.ndarray, pad: int = PAD, width: int | None = None, max_side: int = MAX_SIDE) -> tuple | None:
    """Shelf packing of charts (n x 2 sizes in texels, padding added): tallest first, left to right, a new shelf when
    a row is full. The page is square-ish: `width` (else the side of the area's square, rounded up to 64) by the
    height used, rounded up to 64. Returns (chart origins n x 2 inside their padding, page width, page height), or
    None when it does not fit in max_side x max_side."""
    sz = np.asarray(size, np.int64) + 2 * pad
    if not len(sz):
        return np.zeros((0, 2), np.int64), 64, 64
    if width is None:
        width = int(math.ceil(math.sqrt(float((sz[:, 0] * sz[:, 1]).sum()) * 1.08) / 64.0) * 64)
        width = max(width, int(math.ceil(sz[:, 0].max() / 64.0) * 64))
    if width > max_side or sz[:, 0].max() > width:
        return None
    order = np.lexsort((-sz[:, 0], -sz[:, 1]))
    org = np.zeros((len(sz), 2), np.int64)
    x = y = shelf = 0
    for i in order.tolist():
        w, h = int(sz[i, 0]), int(sz[i, 1])
        if x + w > width:
            y += shelf
            x = shelf = 0
        org[i] = (x + pad, y + pad)
        x += w
        shelf = max(shelf, h)
    height = int(math.ceil((y + shelf) / 64.0) * 64)
    if height > max_side:
        return None
    return org, int(width), max(height, 64)


def layout(V: np.ndarray, F: np.ndarray, group: np.ndarray, planes: list = (), tpm: float | None = None,
           max_side: int = MAX_SIDE, pad: int = PAD) -> dict:
    """The lightmap's layout for a shell (V, F, a group per face): charts, the resolution rule, the packing (the
    texels per metre come down 5 % at a time until one page holds it). Returns the charts, each face corner's texel
    coordinates (F x 3 x 2, from the page's bottom-left corner as Blender's UVs), the UVs (the same over the page's
    size), each chart's rectangle with its padding, the page's size and the texels per metre."""
    chart, d = charts(V, F, group, planes)
    P = np.asarray(V, np.float64)[np.asarray(F, np.int64)]
    n = face_normals(V, F)
    plane_area = float(0.5 * np.abs(n[np.arange(len(n)), d // 2]).sum())
    t = float(tpm) if tpm else tpm_for(plane_area, max_side)
    while True:
        pc, lo, size = chart_boxes(V, F, chart, d, t)
        got = pack(size, pad, max_side=max_side)
        if got is not None:
            break
        if t <= TPM_MIN / 4:
            raise SystemExit(f"lightmap: {len(size)} charts do not fit one {max_side} page even at {t:.2f} texels/m")
        t = round(t * 0.95, 3)
    org, W, H = got
    tex = pc - lo[chart][:, None, :] + org[chart][:, None, :] + 0.5   # the box's corner at a texel's centre
    rect = np.concatenate([org - pad, org + size + pad], axis=1)        # x0, y0, x1, y1 (exclusive)
    uv = tex / np.array([W, H], np.float64)[None, None, :]
    used = float((size[:, 0] * size[:, 1]).sum()) / float(W * H)
    del P
    return {"chart": chart, "dir": d, "tex": tex, "uv": uv, "rect": rect, "W": W, "H": H, "tpm": t,
            "charts": int(len(size)), "plane_area_m2": round(plane_area, 2), "chart_share": round(used, 4)}


def layout_md5(lay: dict) -> str:
    import hashlib
    h = hashlib.md5()
    h.update(np.round(lay["tex"] * 64).astype(np.int64).tobytes())
    h.update(np.array([lay["W"], lay["H"]], np.int64).tobytes())
    return h.hexdigest()


# ---------------------------------------------------------------- texels


def rasterize(tex: np.ndarray, W: int, H: int, chunk: int = 200000) -> tuple:
    """For each texel centre inside a face (tex: F x 3 x 2 corner coordinates in texels), its face and barycentric
    weights; -1 and zeros elsewhere. A centre on an edge two faces share goes to the later face. Faces of any size."""
    tex = np.asarray(tex, np.float64)
    face = np.full(H * W, -1, np.int64)
    bary = np.zeros((H * W, 3), np.float32)
    lo = np.floor(tex.min(axis=1) - 0.5).astype(np.int64)
    hi = np.ceil(tex.max(axis=1) - 0.5).astype(np.int64)
    span = np.maximum(hi - lo + 1, 1)
    a, b, c = tex[:, 0], tex[:, 1], tex[:, 2]
    den = (b[:, 1] - c[:, 1]) * (a[:, 0] - c[:, 0]) + (c[:, 0] - b[:, 0]) * (a[:, 1] - c[:, 1])
    ok = np.abs(den) > 1e-12
    big = int(span.max()) if len(span) else 0
    for dy in range(big):
        for dx in range(big):
            sel = np.nonzero(ok & (span[:, 0] > dx) & (span[:, 1] > dy))[0]
            for s0 in range(0, len(sel), chunk):
                s = sel[s0:s0 + chunk]
                px = lo[s, 0] + dx
                py = lo[s, 1] + dy
                inside = (px >= 0) & (px < W) & (py >= 0) & (py < H)
                x = px + 0.5
                y = py + 0.5
                w0 = ((b[s, 1] - c[s, 1]) * (x - c[s, 0]) + (c[s, 0] - b[s, 0]) * (y - c[s, 1])) / den[s]
                w1 = ((c[s, 1] - a[s, 1]) * (x - c[s, 0]) + (a[s, 0] - c[s, 0]) * (y - c[s, 1])) / den[s]
                w2 = 1.0 - w0 - w1
                e = -1e-9
                inside &= (w0 >= e) & (w1 >= e) & (w2 >= e)
                if not inside.any():
                    continue
                k = py[inside] * W + px[inside]
                face[k] = s[inside]
                bary[k] = np.stack([w0[inside], w1[inside], w2[inside]], axis=1).astype(np.float32)
    # a face too small to hold a texel centre takes the texel under its centroid when no face holds it, so every
    # chart has light of its own to fill its padding from
    hit = np.zeros(len(tex), bool)
    hit[face[face >= 0]] = True
    miss = np.nonzero(~hit)[0]
    if len(miss):
        cx = np.clip(np.floor(tex[miss, :, 0].mean(axis=1)).astype(np.int64), 0, W - 1)
        cy = np.clip(np.floor(tex[miss, :, 1].mean(axis=1)).astype(np.int64), 0, H - 1)
        k = cy * W + cx
        free = face[k] < 0
        face[k[free]] = miss[free]
        bary[k[free]] = np.float32(1.0 / 3.0)
    return face.reshape(H, W), bary.reshape(H, W, 3)


def srgb_decode(a: np.ndarray) -> np.ndarray:
    """sRGB-encoded values (0..1, as an 8-bit image's pixels read) to linear."""
    a = np.asarray(a, np.float64)
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def owner_map(rect: np.ndarray, W: int, H: int) -> np.ndarray:
    """Each texel's chart (its rectangle with the padding), -1 between rectangles."""
    own = np.full((H, W), -1, np.int64)
    for i, (x0, y0, x1, y1) in enumerate(np.asarray(rect, np.int64).tolist()):
        own[max(y0, 0):min(y1, H), max(x0, 0):min(x1, W)] = i
    return own


NB8 = ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1))


def _shift(a: np.ndarray, dy: int, dx: int, fill) -> np.ndarray:
    out = np.full_like(a, fill)
    H, W = a.shape[:2]
    ys, yd = (slice(0, H - dy), slice(dy, H)) if dy >= 0 else (slice(-dy, H), slice(0, H + dy))
    xs, xd = (slice(0, W - dx), slice(dx, W)) if dx >= 0 else (slice(-dx, W), slice(0, W + dx))
    out[yd, xd] = a[ys, xs]
    return out


def dilate(values: np.ndarray, filled: np.ndarray, owner: np.ndarray, iters: int = PAD + 1) -> tuple:
    """The empty texels of each chart's rectangle filled from their filled neighbours of the same chart (the mean of
    those found), `iters` rings out. Returns (values, filled)."""
    v = np.array(values, dtype=np.float64, copy=True)
    f = np.array(filled, dtype=bool, copy=True)
    for _ in range(iters):
        acc = np.zeros_like(v)
        cnt = np.zeros(f.shape, np.int64)
        for dy, dx in NB8:
            fn = _shift(f, dy, dx, False)
            on = _shift(owner, dy, dx, -2)
            ok = fn & ~f & (on == owner) & (owner >= 0)
            if ok.any():
                acc[ok] += _shift(v, dy, dx, 0.0)[ok]
                cnt[ok] += 1
        new = cnt > 0
        if not new.any():
            break
        v[new] = acc[new] / cnt[new][:, None] if v.ndim == 3 else acc[new] / cnt[new]
        f |= new
    return v, f


def smooth(values: np.ndarray, filled: np.ndarray, chart_of: np.ndarray, passes: int = 1, keep: float = 0.5) -> np.ndarray:
    """The bake's noise: each filled texel `keep` of itself and the rest the mean of its filled 8 neighbours of the
    same chart, `passes` times (a chart never takes light from another)."""
    v = np.array(values, dtype=np.float64, copy=True)
    for _ in range(passes):
        acc = np.zeros_like(v)
        cnt = np.zeros(filled.shape, np.int64)
        for dy, dx in NB8:
            ok = _shift(filled, dy, dx, False) & filled & (_shift(chart_of, dy, dx, -2) == chart_of)
            if ok.any():
                acc[ok] += _shift(v, dy, dx, 0.0)[ok]
                cnt[ok] += 1
        has = cnt > 0
        v[has] = keep * v[has] + (1.0 - keep) * acc[has] / cnt[has][:, None]
    return v


def bilinear(img: np.ndarray, xy: np.ndarray) -> np.ndarray:
    """img (H x W x C) sampled at texel coordinates xy (N x 2, texel centres at i + 0.5), clamped at the edges, as the
    viewer's linear filter samples it."""
    H, W = img.shape[:2]
    x = np.clip(np.asarray(xy, np.float64)[:, 0] - 0.5, 0, W - 1)
    y = np.clip(np.asarray(xy, np.float64)[:, 1] - 0.5, 0, H - 1)
    x0 = np.floor(x).astype(np.int64)
    y0 = np.floor(y).astype(np.int64)
    x1 = np.minimum(x0 + 1, W - 1)
    y1 = np.minimum(y0 + 1, H - 1)
    fx = (x - x0)[:, None]
    fy = (y - y0)[:, None]
    return ((1 - fx) * (1 - fy) * img[y0, x0] + fx * (1 - fy) * img[y0, x1] + (1 - fx) * fy * img[y1, x0]
            + fx * fy * img[y1, x1])


def texel_rows(face: np.ndarray, bary: np.ndarray) -> tuple:
    """The filled texels (face >= 0) as rows: their flat index, face and barycentric weights."""
    flat = np.nonzero(face.ravel() >= 0)[0]
    return flat, face.ravel()[flat], bary.reshape(-1, 3)[flat].astype(np.float64)


def interp(vals: np.ndarray, F: np.ndarray, faces: np.ndarray, w: np.ndarray) -> np.ndarray:
    """Per-vertex values (V x C, or V) at points given by face and barycentric weights."""
    vals = np.asarray(vals, np.float64)
    tri = np.asarray(F, np.int64)[faces]
    if vals.ndim == 1:
        return (vals[tri] * w).sum(axis=1)
    return (vals[tri] * w[:, :, None]).sum(axis=1)


def seam_weight(P: np.ndarray, planes: list, band: float = SEAM_BAND_M, hold: float = SEAM_HOLD_M) -> np.ndarray:
    """A texel's own share of its light near the built seams: 0 past a seam plane (the stub) and within `hold` metres
    inside it, rising to 1 over the next `band` metres, and 1 outside every seam's region, fading in over the
    region's edge (seam_soft), so the weight is continuous everywhere. Both files then show the vertex light, which
    their stitch made the same, everywhere within `hold` of the plane: on the plane and on the faces both files
    have."""
    w = np.ones(len(P))
    for sm in planes:
        s, soft = seam_soft(P, sm)
        w = np.minimum(w, 1.0 - soft * (1.0 - np.clip((-s - hold) / band, 0.0, 1.0)))
    return w


# ---------------------------------------------------------------- the ink floor across materials


def relax_floor(V: np.ndarray, F: np.ndarray, r_face: np.ndarray, per_m: float, iters: int = 400) -> np.ndarray:
    """Per vertex, the darkest-texel ratio (darkest kept texel over mean, a luminance ratio) the ink floor uses: the
    least of the faces' round it, rising by at most a factor exp(per_m) a metre along the mesh's edges (vertices at
    the same place are one). It is never over the vertex's own faces' ratio (the floor gives at least the light their
    darkest texel needs) and continuous across a material's edge, so the light does not step where two scans meet.
    Returns the ratio per vertex of V."""
    V = np.asarray(V, np.float64)
    F = np.asarray(F, np.int64)
    _u, pid = np.unique(np.rint(V * 1e4).astype(np.int64), axis=0, return_inverse=True)
    pid = pid.ravel()
    n = int(pid.max()) + 1 if len(pid) else 0
    lr = np.full(n, np.inf)
    lf = np.log(np.maximum(np.asarray(r_face, np.float64), 1e-9))
    for k in range(3):
        np.minimum.at(lr, pid[F[:, k]], lf)
    e = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]])
    a, b = pid[e[:, 0]], pid[e[:, 1]]
    step = per_m * np.linalg.norm(V[e[:, 0]] - V[e[:, 1]], axis=1)
    for _ in range(iters):
        old = lr.copy()
        np.minimum.at(lr, a, lr[b] + step)
        np.minimum.at(lr, b, lr[a] + step)
        if np.array_equal(old, lr):
            break
    return np.exp(lr)[pid]


# ---------------------------------------------------------------- chart borders


def border_edges(V: np.ndarray, F: np.ndarray, tex: np.ndarray, chart: np.ndarray, max_samples: int = 64) -> dict:
    """The mesh's edges where two charts meet (vertices at the same place are one: chunks and materials split them),
    as sample points along each edge on both sides' texel coordinates (tex: F x 3 x 2), about one a texel. Returns
    {"a": N x 2, "b": N x 2, "edges": the count}: the same point of the surface at a on one chart and b on the
    other."""
    V = np.asarray(V, np.float64)
    F = np.asarray(F, np.int64)
    tex = np.asarray(tex, np.float64)
    _u, pid = np.unique(np.rint(V * 1e4).astype(np.int64), axis=0, return_inverse=True)
    pid = pid.ravel()
    nf = len(F)
    k0 = np.repeat(np.arange(3)[None, :], nf, axis=0).ravel()
    fi = np.repeat(np.arange(nf), 3)
    k1 = (k0 + 1) % 3
    p0, p1 = pid[F[fi, k0]], pid[F[fi, k1]]
    t0, t1 = tex[fi, k0], tex[fi, k1]
    flip = p0 > p1                       # each half-edge from its lesser point to its greater
    lo, hi = np.where(flip, p1, p0), np.where(flip, p0, p1)
    ta = np.where(flip[:, None], t1, t0)
    tb = np.where(flip[:, None], t0, t1)
    key = lo * (int(pid.max()) + 1 if len(pid) else 1) + hi
    o = np.argsort(key, kind="stable")
    key, fi, ta, tb = key[o], fi[o], ta[o], tb[o]
    same = key[1:] == key[:-1]
    i, j = np.nonzero(same)[0], np.nonzero(same)[0] + 1
    ch = np.asarray(chart, np.int64)
    cross = ch[fi[i]] != ch[fi[j]]
    i, j = i[cross], j[cross]
    la = np.linalg.norm(tb[i] - ta[i], axis=1)
    lb = np.linalg.norm(tb[j] - ta[j], axis=1)
    ns = np.clip(np.ceil(np.maximum(la, lb)).astype(np.int64) + 1, 2, max_samples)
    e = np.repeat(np.arange(len(i)), ns)
    start = np.concatenate([[0], np.cumsum(ns)[:-1]]) if len(ns) else np.zeros(0, np.int64)
    t = ((np.arange(len(e)) - np.repeat(start, ns)) + 0.5) / np.repeat(ns, ns)
    A = ta[i][e] + (tb[i][e] - ta[i][e]) * t[:, None]
    B = ta[j][e] + (tb[j][e] - ta[j][e]) * t[:, None]
    return {"a": A, "b": B, "edges": int(len(i))}


def bilinear_taps(xy: np.ndarray, W: int, H: int) -> tuple:
    """The four texels (flat indices, N x 4) and weights (N x 4) the viewer's linear filter reads at xy (texel
    coordinates, centres at i + 0.5), clamped at the page's edges."""
    x = np.clip(np.asarray(xy, np.float64)[:, 0] - 0.5, 0, W - 1)
    y = np.clip(np.asarray(xy, np.float64)[:, 1] - 0.5, 0, H - 1)
    x0 = np.floor(x).astype(np.int64)
    y0 = np.floor(y).astype(np.int64)
    x1 = np.minimum(x0 + 1, W - 1)
    y1 = np.minimum(y0 + 1, H - 1)
    fx, fy = x - x0, y - y0
    idx = np.stack([y0 * W + x0, y0 * W + x1, y1 * W + x0, y1 * W + x1], axis=1)
    w = np.stack([(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy], axis=1)
    return idx, w


def stitch_edges(img: np.ndarray, be: dict, iters: int = 24) -> np.ndarray:
    """The page (H x W x C) changed near the chart borders so the linear filter reads the same value on both sides of
    every border point (border_edges): each round, each texel a border sample reads moves by the weighted mean of what
    its samples lack of the two sides' mean. Only texels the samples read change (a chart's edge and its padding)."""
    H, W = img.shape[:2]
    C = img.shape[2]
    flat = np.array(img, dtype=np.float64, copy=True).reshape(-1, C)
    if not len(be["a"]):
        return flat.reshape(H, W, C)
    ia, wa = bilinear_taps(be["a"], W, H)
    ib, wb = bilinear_taps(be["b"], W, H)
    idx = np.concatenate([ia, ib]).ravel()
    ww = np.concatenate([wa, wb]).ravel()
    wsum = np.zeros(len(flat))
    np.add.at(wsum, idx, ww)
    touched = wsum > 1e-9
    for _ in range(iters):
        va = (flat[ia] * wa[:, :, None]).sum(axis=1)
        vb = (flat[ib] * wb[:, :, None]).sum(axis=1)
        mid = 0.5 * (va + vb)
        res = np.concatenate([mid - va, mid - vb])             # 2N x C
        acc = np.zeros_like(flat)
        np.add.at(acc, idx, (ww[:, None] * np.repeat(res, 4, axis=0)))
        flat[touched] += acc[touched] / wsum[touched][:, None]
        np.maximum(flat, 0.0, out=flat)
    return flat.reshape(H, W, C)


def border_gaps(img: np.ndarray, be: dict, scale_a=None, scale_b=None) -> np.ndarray:
    """At each border sample, |a - b| over their mean (luminance) of the page read on both sides, each side's value
    divided by its own scale (N, or None) first, e.g. the light under a material's factor."""
    H, W = img.shape[:2]
    C = img.shape[2]
    flat = np.asarray(img, np.float64).reshape(-1, C)
    ia, wa = bilinear_taps(be["a"], W, H)
    ib, wb = bilinear_taps(be["b"], W, H)
    va = (flat[ia] * wa[:, :, None]).sum(axis=1)
    vb = (flat[ib] * wb[:, :, None]).sum(axis=1)
    if scale_a is not None:
        va = va / np.maximum(np.asarray(scale_a, np.float64), 1e-12).reshape(-1, 1)
        vb = vb / np.maximum(np.asarray(scale_b, np.float64), 1e-12).reshape(-1, 1)
    if C == 3:
        la = 0.2126 * va[:, 0] + 0.7152 * va[:, 1] + 0.0722 * va[:, 2]
        lb = 0.2126 * vb[:, 0] + 0.7152 * vb[:, 1] + 0.0722 * vb[:, 2]
    else:
        la, lb = va[:, 0], vb[:, 0]
    return np.abs(la - lb) / np.maximum(0.5 * (la + lb), 1e-12)


# ---------------------------------------------------------------- the GLB


def read_glb(path: str) -> tuple:
    with open(path, "rb") as fh:
        b = fh.read()
    magic, _ver, _n = struct.unpack("<4sII", b[:12])
    if magic != b"glTF":
        raise ValueError(f"{path}: not a GLB")
    jl, jt = struct.unpack("<I4s", b[12:20])
    js = json.loads(b[20:20 + jl].decode("utf-8"))
    off = 20 + jl
    bin_ = b""
    if off < len(b):
        bl, bt = struct.unpack("<I4s", b[off:off + 8])
        bin_ = b[off + 8:off + 8 + bl]
    return js, bytearray(bin_)


def write_glb(path: str, js: dict, bin_: bytes) -> int:
    j = json.dumps(js, separators=(",", ":")).encode("utf-8")
    j += b" " * ((4 - len(j) % 4) % 4)
    bin_ = bytes(bin_) + b"\x00" * ((4 - len(bin_) % 4) % 4)
    total = 12 + 8 + len(j) + 8 + len(bin_)
    with open(path, "wb") as fh:
        fh.write(struct.pack("<4sII", b"glTF", 2, total))
        fh.write(struct.pack("<I4s", len(j), b"JSON"))
        fh.write(j)
        fh.write(struct.pack("<I4s", len(bin_), b"BIN\x00"))
        fh.write(bin_)
    return total


SAMPLER_LM = {"magFilter": 9729, "minFilter": 9729, "wrapS": 33071, "wrapT": 33071}  # linear, no mips, clamped


def patch_glb(path: str, pages: list, lit: dict, scene_extras: dict | None = None, ao: str | None = None) -> dict:
    """Adds the lightmap pages to a GLB in place. pages: [{"bytes": WebP data, "name": str, "scale": S}], lit:
    {material name: page index}. Each such material gets emissiveTexture {index, texCoord 1}, emissiveFactor
    [S, S, S] and extras wdi_lightmap {page, texCoord 1, scale S, encoding srgb}, with vertex_fallback true when its
    primitives also carry COLOR_0 (the same light per vertex, for a viewer without the lightmap hookup; a viewer
    with it turns that material's vertex colours off). `ao`, when given, is a note of where the baked ambient
    occlusion is, written into the extras as `ao` (the cave builder writes it in the `_OCCL` attribute and says so
    in the scene's extras instead). Every primitive drawn with one of them must have TEXCOORD_1 (else a ValueError).
    scene_extras go into scenes[0].extras. Returns a summary."""
    js, bin_ = read_glb(path)
    names = {m.get("name"): i for i, m in enumerate(js.get("materials", []))}
    missing = sorted(set(lit) - set(names))
    if missing:
        raise ValueError(f"{path}: no material {missing}")
    c0 = {}
    for mesh in js.get("meshes", []):
        for pr in mesh.get("primitives", []):
            mi = pr.get("material")
            if mi is None:
                continue
            nm_ = js["materials"][mi].get("name")
            if nm_ in lit and "TEXCOORD_1" not in pr.get("attributes", {}):
                raise ValueError(f"{path}: mesh {mesh.get('name')} draws {nm_} without TEXCOORD_1")
            if nm_ in lit:
                c0[nm_] = c0.get(nm_, True) and "COLOR_0" in pr.get("attributes", {})
    tex_of = []
    if pages:
        js.setdefault("samplers", []).append(dict(SAMPLER_LM))
        si = len(js["samplers"]) - 1
    for p in pages:
        while len(bin_) % 4:
            bin_.append(0)
        off = len(bin_)
        bin_ += p["bytes"]
        js.setdefault("bufferViews", []).append({"buffer": 0, "byteOffset": off, "byteLength": len(p["bytes"])})
        js.setdefault("images", []).append({"bufferView": len(js["bufferViews"]) - 1, "mimeType": "image/webp",
                                            "name": p["name"]})
        js.setdefault("textures", []).append({"sampler": si,
                                              "extensions": {"EXT_texture_webp": {"source": len(js["images"]) - 1}}})
        tex_of.append(len(js["textures"]) - 1)
    for nm_, pi in lit.items():
        m = js["materials"][names[nm_]]
        s = float(pages[pi]["scale"])
        m["emissiveTexture"] = {"index": tex_of[pi], "texCoord": 1}
        m["emissiveFactor"] = [s, s, s]
        m.setdefault("extras", {})["wdi_lightmap"] = {"page": pi, "texCoord": 1, "scale": s, "encoding": "srgb"}
        if ao:
            m["extras"]["wdi_lightmap"]["ao"] = ao
        if c0.get(nm_):
            m["extras"]["wdi_lightmap"]["vertex_fallback"] = True
    for ext in ("EXT_texture_webp",):
        if ext not in js.setdefault("extensionsUsed", []):
            js["extensionsUsed"].append(ext)
        if ext not in js.setdefault("extensionsRequired", []):
            js["extensionsRequired"].append(ext)
    if scene_extras:
        js["scenes"][js.get("scene", 0)].setdefault("extras", {}).update(scene_extras)
    while len(bin_) % 4:
        bin_.append(0)
    js["buffers"][0]["byteLength"] = len(bin_)
    size = write_glb(path, js, bin_)
    return {"bytes": size, "pages": [{"name": p["name"], "bytes": len(p["bytes"]), "scale": p["scale"]} for p in pages],
            "materials": sorted(lit)}


def glb_lightmap_facts(path: str) -> dict:
    """What a GLB says about its lightmaps: the lit materials, their pages and scales, and the primitives that draw
    them with and without TEXCOORD_1 and COLOR_0."""
    js, _b = read_glb(path)
    lit = {m["name"]: m["extras"]["wdi_lightmap"] for m in js.get("materials", [])
           if isinstance(m.get("extras"), dict) and "wdi_lightmap" in m["extras"]}
    with_uv = without_uv = with_c0 = 0
    for mesh in js.get("meshes", []):
        for pr in mesh.get("primitives", []):
            mi = pr.get("material")
            if mi is None or js["materials"][mi].get("name") not in lit:
                continue
            at = pr.get("attributes", {})
            with_uv += "TEXCOORD_1" in at
            without_uv += "TEXCOORD_1" not in at
            with_c0 += "COLOR_0" in at
    return {"lit_materials": lit, "primitives_with_uv1": with_uv, "primitives_without_uv1": without_uv,
            "primitives_with_color0": with_c0, "scene_extras": js["scenes"][js.get("scene", 0)].get("extras", {})}
