"""Room check 4, the maths (the contract and the collision): what the viewer shows for every visible vertex.

Usage: python cc_display.py <roomId> [--glb F] [--out DIR]                                          (roomcfg.py)
Inputs: the GLB (its materials and WebP images, decoded with Pillow) and cc_geom.py's per-vertex dump
<out>/cc_vertices.npz (COLOR_0 and TEXCOORD_0 from the Draco bridge, and which vertices an eye 1.6 m above the
reachable floor sees). No Blender; needs numpy and Pillow. Writes <out>/cc_display.json: counts and percentiles, no
pass or fail of its own.
Display (the viewer, three r186): MeshBasicMaterial, baseColor = factor x texture(sRGB -> linear) x COLOR_0; AgX with
toneMappingExposure = the area's wdi_exposure; then the sRGB OETF. Luma = Rec.709 weights on the 8-bit sRGB values (as the
builder's palette check). Ink #12141C has luma 20.15. Read-only.
"""
import io
import json
import os
import struct
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import roomcfg  # noqa: E402

ARGS = roomcfg.parse()
GLB = ARGS.glb
NPZ, OUT = os.path.join(ARGS.out, "cc_vertices.npz"), os.path.join(ARGS.out, "cc_display.json")
raw = open(GLB, "rb").read()
cl, _ = struct.unpack_from("<II", raw, 12)
J = json.loads(raw[20:20 + cl])
B0 = 20 + cl + 8
E = next(n for n in J["nodes"] if n.get("name", "").startswith("Area_room_"))["extras"]["wdi_exposure"]

# three r186 tonemapping_pars_fragment: GLSL mat3 columns as rows here, so out = v @ M
S2020 = np.array([[0.6274, 0.0691, 0.0164], [0.3293, 0.9195, 0.0880], [0.0433, 0.0113, 0.8956]])
T2SRGB = np.array([[1.6605, -0.1246, -0.0182], [-0.5876, 1.1329, -0.1006], [-0.0728, -0.0083, 1.1187]])
INSET = np.array([[0.856627153315983, 0.137318972929847, 0.11189821299995],
                  [0.0951212405381588, 0.761241990602591, 0.0767994186031903],
                  [0.0482516061458583, 0.101439036467562, 0.811302368396859]])
OUTSET = np.array([[1.1271005818144368, -0.1413297634984383, -0.14132976349843826],
                   [-0.11060664309660323, 1.157823702216272, -0.11060664309660294],
                   [-0.016493938717834573, -0.016493938717834257, 1.2519364065950405]])


def agx_display(lin, exposure):
    c = np.atleast_2d(lin) * exposure
    c = c @ S2020
    c = c @ INSET
    c = np.log2(np.maximum(c, 1e-10))
    c = np.clip((c + 12.47393) / (4.026069 + 12.47393), 0.0, 1.0)
    x2 = c * c
    x4 = x2 * x2
    c = 15.5 * x4 * x2 - 40.14 * x4 * c + 31.96 * x4 - 6.868 * x2 * c + 0.4298 * x2 + 0.1191 * c - 0.00232
    c = c @ OUTSET
    c = np.power(np.maximum(c, 0.0), 2.2)
    c = np.clip(c @ T2SRGB, 0.0, 1.0)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def luma255(srgb):
    return 255.0 * (0.2126 * srgb[..., 0] + 0.7152 * srgb[..., 1] + 0.0722 * srgb[..., 2])


INK = np.array([0x12, 0x14, 0x1C]) / 255.0
INK_L = float(luma255(INK))


def eotf(s):
    return np.where(s <= 0.04045, s / 12.92, np.power((s + 0.055) / 1.055, 2.4))


imgs = []
for im in J["images"]:
    bv = J["bufferViews"][im["bufferView"]]
    s = B0 + bv.get("byteOffset", 0)
    a = np.asarray(Image.open(io.BytesIO(raw[s:s + bv["byteLength"]])).convert("RGB"), np.float64) / 255.0
    imgs.append(eotf(a))
tex_img = [t["extensions"]["EXT_texture_webp"]["source"] for t in J["textures"]]
MAT = []
for m in J["materials"]:
    pb = m.get("pbrMetallicRoughness", {})
    ti = pb.get("baseColorTexture", {}).get("index")
    MAT.append(dict(name=m["name"], factor=np.array(pb.get("baseColorFactor", [1, 1, 1, 1])[:3]),
                    img=None if ti is None else tex_img[ti], alpha=m.get("alphaMode", "OPAQUE")))


def sample(img, uv):
    """Bilinear, REPEAT, texel centres at (i + 0.5) / W; glTF UV (0, 0) is the image's top-left."""
    H, W, _ = img.shape
    x = np.mod(uv[:, 0], 1.0) * W - 0.5
    y = np.mod(uv[:, 1], 1.0) * H - 0.5
    x0 = np.floor(x).astype(int)
    y0 = np.floor(y).astype(int)
    fx = (x - x0)[:, None]
    fy = (y - y0)[:, None]
    x0m, x1m = np.mod(x0, W), np.mod(x0 + 1, W)
    y0m, y1m = np.mod(y0, H), np.mod(y0 + 1, H)
    return ((img[y0m, x0m] * (1 - fx) + img[y0m, x1m] * fx) * (1 - fy)
            + (img[y1m, x0m] * (1 - fx) + img[y1m, x1m] * fx) * fy)


def lum(c):
    return 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]


# each material's dark texels: the texel at the 1st and 3rd percentile of luminance (x factor)
dark = {}
for k, m in enumerate(MAT):
    if m["img"] is None:
        dark[k] = {p: m["factor"] for p in (0.1, 1, 3)}
        continue
    img = imgs[m["img"]].reshape(-1, 3)
    L = lum(img)
    order = np.argsort(L)
    dark[k] = {p: img[order[int(p / 100 * (len(order) - 1))]] * m["factor"] for p in (0.1, 1, 3)}

Z = np.load(NPZ)
prim, P, C, UV, vis = Z["prim"], Z["P"], Z["C"], Z["UV"], Z["visible"]
names, what, pmat = Z["names"], Z["what"], Z["mat"]
alb = np.zeros_like(C)
albp = {p: np.zeros_like(C) for p in (0.1, 1, 3)}
for p_i in np.unique(prim):
    sel = prim == p_i
    k = int(pmat[p_i])
    m = MAT[k]
    if m["img"] is not None and not np.isnan(UV[sel]).any():
        alb[sel] = sample(imgs[m["img"]], UV[sel]) * m["factor"]
    else:
        alb[sel] = m["factor"]
    for p in albp:
        albp[p][sel] = dark[k][p]
outside = np.isin(what[prim], ["outside", "sky"])
glass_m = next(m for m in MAT if m["alpha"] == "BLEND")
glass_disp = agx_display(glass_m["factor"], E)[0]
GLASS_A = float(next(m for m in J["materials"] if m.get("alphaMode") == "BLEND")["pbrMetallicRoughness"]["baseColorFactor"][3])


def show(a):
    d = agx_display(a * C, E)
    d[outside] = (1 - GLASS_A) * d[outside] + GLASS_A * glass_disp     # seen through the 10 % glass (blended sRGB)
    return luma255(d), d


Lv, Dv = show(alb)
Lp = {p: show(albp[p])[0] for p in albp}
V = vis.astype(bool)
inside_v = V & ~outside
R = dict(file=roomcfg.shown(GLB), exposure=E, ink_luma=round(INK_L, 3), vertices=int(len(C)), visible=int(V.sum()),
         visible_interior=int(inside_v.sum()), visible_outside=int((V & outside).sum()))
for lab, LL in (("own_texel", Lv), ("dark_texel_p3", Lp[3]), ("dark_texel_p1", Lp[1]), ("dark_texel_p0.1", Lp[0.1])):
    for part, msk in (("interior", inside_v), ("outside_through_glass", V & outside)):
        x = LL[msk]
        if not len(x):
            continue
        R[f"{lab}:{part}"] = dict(min=round(float(x.min()), 2), p01=round(float(np.percentile(x, 0.1)), 2),
                                  p1=round(float(np.percentile(x, 1)), 2), p5=round(float(np.percentile(x, 5)), 2),
                                  median=round(float(np.median(x)), 2), under_ink=int((x < INK_L - 0.5).sum()),
                                  under_ink_share=round(float((x < INK_L - 0.5).mean()), 5))
# per object: the darkest visible vertex, at its own texel and with the material's 3rd-percentile texel
per = {}
for p_i in np.unique(prim):
    sel = (prim == p_i) & V
    if not sel.any():
        continue
    j = np.nonzero(sel)[0]
    k = j[np.argmin(Lv[j])]
    k3 = j[np.argmin(Lp[3][j])]
    per[f"{names[p_i]}#{int(p_i)}"] = dict(
        material=MAT[int(pmat[p_i])]["name"], visible=int(sel.sum()),
        min_own=round(float(Lv[k]), 2), at=[round(float(v), 3) for v in P[k]], color0=[round(float(v), 5) for v in C[k]],
        min_dark_p3=round(float(Lp[3][k3]), 2), at_p3=[round(float(v), 3) for v in P[k3]],
        under_ink_own=int((Lv[j] < INK_L - 0.5).sum()), under_ink_p3=int((Lp[3][j] < INK_L - 0.5).sum()),
        color0_lum_min=round(float(lum(C[j]).min()), 6))
R["per_object"] = dict(sorted(per.items(), key=lambda kv: kv[1]["min_own"]))
# the darkest visible interior vertices
o = np.argsort(np.where(inside_v, Lv, np.inf))[:15]
R["darkest_interior_own"] = [dict(obj=str(names[prim[i]]), at=[round(float(v), 3) for v in P[i]], luma=round(float(Lv[i]), 2),
                                  color0=[round(float(v), 5) for v in C[i]], albedo=[round(float(v), 4) for v in alb[i]])
                             for i in o]
o3 = np.argsort(np.where(inside_v, Lp[3], np.inf))[:15]
R["darkest_interior_p3"] = [dict(obj=str(names[prim[i]]), at=[round(float(v), 3) for v in P[i]], luma=round(float(Lp[3][i]), 2),
                                 color0=[round(float(v), 5) for v in C[i]]) for i in o3]
# the builder's design point: COLOR_0 x E x (3rd-percentile albedo) >= ink, in grey terms
ink_lin = 1e-6
lo, hi = 1e-6, 1.0
for _ in range(80):
    mid = (lo * hi) ** 0.5
    if luma255(agx_display(np.array([mid] * 3), 1.0))[0] < INK_L:
        lo = mid
    else:
        hi = mid
R["ink_scene_linear_grey"] = round(hi, 6)
R["ink_scene_linear_over_exposure"] = round(hi / E, 7)
json.dump(R, open(OUT, "w"), indent=1)
print(json.dumps({k: v for k, v in R.items() if not k.startswith(("per_object", "darkest"))}, indent=1))
print("darkest own:", json.dumps(R["darkest_interior_own"][:6]))
print("darkest objects:", json.dumps(list(R["per_object"].items())[:8]))
