"""Room check 1 (the contract): the structure of a first-person room GLB, from its JSON. No Blender.

Usage: python cc_struct.py <roomId> [--glb F] [--scene F] [--manifest F] [--out DIR] [--config F]   (roomcfg.py)
Read-only. Frames: Blender room metres (x east, y north, z up) = glTF (x, -z, y). The manifest (the builder's
<roomId>.json) is read only for the lights' Blender watts, to test the COMPAT conversion (W / 4 pi). The room file
gives how many lights the room exports, the file's size window and the ids that carry no COLOR_0 on purpose.
Writes <out>/cc_struct.json.
"""
import json
import math
import os
import re
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import roomcfg  # noqa: E402

ARGS = roomcfg.parse()
GLB, SCENE, REPORT = ARGS.glb, ARGS.scene, ARGS.manifest
ROOM = roomcfg.load(ARGS.config)
os.makedirs(ARGS.out, exist_ok=True)
OUT = os.path.join(ARGS.out, "cc_struct.json")
raw = open(GLB, "rb").read()
magic, version, length = struct.unpack_from("<4sII", raw, 0)
CH = []
off = 12
while off + 8 <= len(raw):
    cl, ct = struct.unpack_from("<I4s", raw, off)
    CH.append((ct, off + 8, cl))
    off += 8 + cl
J = json.loads(raw[CH[0][1]:CH[0][1] + CH[0][2]])
BIN0 = CH[1][1]
scene = json.load(open(SCENE, encoding="utf-8"))
rep = json.load(open(REPORT, encoding="utf-8"))
SID, PFX = scene["id"], scene["prefix"]
WT, HT = scene["size"]["w"], scene["size"]["h"]
FX0, FX1, FY0, FY1 = -(WT - 2) / 2, (WT - 2) / 2, -(HT - 2) / 2, (HT - 2) / 2
R = {"file": roomcfg.shown(GLB), "checks": {}}
FAILS = []


def check(name, ok, **info):
    R["checks"][name] = dict(ok=bool(ok), **info)
    if not ok:
        FAILS.append(name)
    print(("PASS " if ok else "FAIL ") + name, json.dumps(info, default=str)[:400])


def r4(v):
    return [round(float(x), 4) for x in v]


check("glb_header", magic == b"glTF" and version == 2 and length == len(raw) and [c[0] for c in CH] == [b"JSON", b"BIN\x00"],
      version=version, length=length, bytes=len(raw), chunks=[(c[0].decode(errors="replace"), c[2]) for c in CH],
      generator=J.get("asset", {}).get("generator"))

# ------------------------------------------------------------------------------------------- extensions
used, req = J.get("extensionsUsed", []), J.get("extensionsRequired", [])
actual = set(J.get("extensions", {}))
for coll in ("materials", "textures", "nodes", "images", "samplers"):
    for x in J.get(coll, []):
        actual |= set(x.get("extensions", {}))
for me in J.get("meshes", []):
    for p in me["primitives"]:
        actual |= set(p.get("extensions", {}))
for m in J.get("materials", []):
    for slot in ("baseColorTexture", "metallicRoughnessTexture"):
        actual |= set(m.get("pbrMetallicRoughness", {}).get(slot, {}).get("extensions", {}))
    for slot in ("normalTexture", "occlusionTexture", "emissiveTexture"):
        actual |= set(m.get(slot, {}).get("extensions", {}))
README_REQ = ["KHR_draco_mesh_compression", "EXT_texture_webp", "KHR_texture_transform", "KHR_lights_punctual"]
README_USED = ["EXT_mesh_gpu_instancing", "KHR_materials_emissive_strength"]
THREE_READS = set(README_REQ + README_USED + ["KHR_materials_unlit"])   # three r186 GLTFLoader reads all seven
R["extensions"] = dict(used=used, required=req, actually_used=sorted(actual))
check("extensions_declared_and_readable", actual <= set(used) and set(req) <= set(used) and set(used) <= THREE_READS
      and all(e in req for e in ("KHR_draco_mesh_compression", "EXT_texture_webp")),
      used=used, required=req, actually_used=sorted(actual), undeclared=sorted(actual - set(used)),
      unknown_to_viewer=sorted(set(used) - THREE_READS),
      note="KHR_materials_unlit is outside the README's list (three r186 reads it; it is in extensionsUsed only); "
           "KHR_texture_transform is listed as required by the README for the village but this room does not use it")
tex = J.get("textures", [])
check("webp_without_fallback", all("source" not in t and "EXT_texture_webp" in t.get("extensions", {}) for t in tex),
      textures=len(tex))
prims = [(mi, k, p) for mi, me in enumerate(J["meshes"]) for k, p in enumerate(me["primitives"])]
check("draco_on_every_primitive", all("KHR_draco_mesh_compression" in p.get("extensions", {}) for _, _, p in prims),
      primitives=len(prims))

# ------------------------------------------------------------------------------------------- nodes
nodes = J["nodes"]
names = [n.get("name", "") for n in nodes]
PARENT = {c: i for i, n in enumerate(nodes) for c in n.get("children", [])}
roots = J["scenes"][J.get("scene", 0)]["nodes"]


def qmat(q):
    x, y, z, w = q
    return [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]


def mmul(A, B):
    return [[sum(A[i][k] * B[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def local_m(n):
    if "matrix" in n:
        m = n["matrix"]
        return [[m[c * 4 + r] for c in range(4)] for r in range(4)]
    Rm = qmat(n.get("rotation", [0, 0, 0, 1]))
    s = n.get("scale", [1, 1, 1])
    t = n.get("translation", [0, 0, 0])
    return [[Rm[r][0] * s[0], Rm[r][1] * s[1], Rm[r][2] * s[2], t[r]] for r in range(3)] + [[0, 0, 0, 1]]


def world_m(i):
    M = local_m(nodes[i])
    return mmul(world_m(PARENT[i]), M) if i in PARENT else M


def apply(M, v, w=1.0):
    return [M[r][0] * v[0] + M[r][1] * v[1] + M[r][2] * v[2] + M[r][3] * w for r in range(3)]


def to_b(v):
    return [v[0], -v[2], v[1]]


idx = {}
for i, nm in enumerate(names):
    idx.setdefault(nm, []).append(i)
dups = sorted(k for k, v in idx.items() if len(v) > 1)
AREA, COLN = f"Area_room_{SID}", f"HM_Collision_room_{SID}"
SPAWNS = {f"Spawn_{SID}_{s['id']}": s for s in scene["spawns"]}
PORTALS = {f"Portal_{p['id']}": p for p in scene["portals"]}
R["roots"] = [names[i] for i in roots]
check("roots_are_area_and_collision", sorted(R["roots"]) == sorted([AREA, COLN]), roots=R["roots"])
ai = idx.get(AREA, [None])[0]
desc = set()
if ai is not None:
    st = list(nodes[ai].get("children", []))
    while st:
        c = st.pop()
        desc.add(c)
        st += nodes[c].get("children", [])
    ex = nodes[ai].get("extras", {})
    ao = to_b(apply(world_m(ai), [0, 0, 0]))
    R["area"] = dict(origin_blender=r4(ao), extras=ex, descendants=len(desc),
                     transform={k: nodes[ai][k] for k in ("translation", "rotation", "scale", "matrix") if k in nodes[ai]})
    check("area_node", ai in roots and FX0 < ao[0] < FX1 and FY0 < ao[1] < FY1 and abs(ao[2]) < 1e-6
          and ex.get("wdi_indoor") is True and isinstance(ex.get("wdi_exposure"), (int, float)) and ex["wdi_exposure"] > 0
          and ex.get("wdi_baked") is True and not any(k in ex for k in ("fog_color", "fog_density")),
          origin_blender=r4(ao), wdi_indoor=ex.get("wdi_indoor"), wdi_exposure=ex.get("wdi_exposure"),
          wdi_baked=ex.get("wdi_baked"), other_extras=sorted(set(ex) - {"wdi_indoor", "wdi_exposure", "wdi_baked"}),
          fog=None, note="indoors and no fog extras: the viewer sets a black background, no fog, no moon/sky light/dome")
    others = [names[i] for i in range(len(nodes)) if i != ai and names[i] != COLN and i not in desc]
    check("every_room_node_under_the_area", not others, outside_area=others, descendants=len(desc))
else:
    check("area_node", False, missing=AREA)

R["spawns"] = []
for nm, s in SPAWNS.items():
    i = idx.get(nm, [None])[0]
    if i is None:
        check(f"spawn_{s['id']}", False, missing=nm)
        continue
    M = world_m(i)
    p = to_b(apply(M, [0, 0, 0]))
    fwd_g = apply(M, [0, 0, -1], 0.0)                  # the node's -Z in glTF world (what the viewer looks along)
    f = to_b(fwd_g)
    yaw = math.atan2(-fwd_g[0], -fwd_g[2])             # spawn.ts yawFromDirection
    want = (FX0 + s["x"] - 0.5, FY1 - s["y"] + 0.5)
    face = {"n": (0, 1), "s": (0, -1), "e": (1, 0), "w": (-1, 0)}[s["facing"]]
    into = (0.0 - p[0], 0.0 - p[1])
    ex = nodes[i].get("extras", {})
    e = dict(name=nm, blender=r4(p), forward_blender=r4(f), viewer_yaw_rad=round(yaw, 6), tile=[s["x"], s["y"]],
             tile_centre=list(want), extras=ex, under_area=i in desc,
             faces_into_room=round(face[0] * into[0] + face[1] * into[1], 3) > 0)
    R["spawns"].append(e)
    check(f"spawn_{s['id']}", math.hypot(p[0] - want[0], p[1] - want[1]) < 0.01 and abs(p[2]) < 1e-4
          and f[0] * face[0] + f[1] * face[1] > 0.9999 and abs(f[2]) < 1e-4 and i in desc
          and isinstance(ex.get("wdi_spawn"), str) and ex["wdi_spawn"].strip()
          and ex.get("wdi_district") == scene["name"] and not nodes[i].get("children"),
          at_blender=r4(p), tile=[s["x"], s["y"]], tile_centre=list(want), forward_blender=r4(f),
          glTF_forward=r4(fwd_g), viewer_yaw=round(yaw, 6), facing=s["facing"], wdi_spawn=ex.get("wdi_spawn"),
          wdi_district=ex.get("wdi_district"), scene_name=scene["name"])
stray = [n for n in names if n.startswith("Spawn_") and n not in SPAWNS]
check("no_stray_spawns_or_portals", not stray and not [n for n in names if n.startswith("Portal_") and n not in PORTALS],
      spawns=[n for n in names if n.startswith("Spawn_")], portals=[n for n in names if n.startswith("Portal_")])

R["portals"] = []
for nm, po in PORTALS.items():
    i = idx.get(nm, [None])[0]
    if i is None:
        check(f"portal_{po['id']}", False, missing=nm)
        continue
    p = to_b(apply(world_m(i), [0, 0, 0]))
    ex = nodes[i].get("extras", {})
    cx = FX0 + po["x"] - 0.5
    on_face = (abs(p[1] - FY0) if po["y"] == HT - 1 else abs(p[1] - FY1) if po["y"] == 0 else
               abs(p[0] - FX0) if po["x"] == 0 else abs(p[0] - FX1))
    along = abs(p[0] - cx) if po["y"] in (0, HT - 1) else abs(p[1] - (FY1 - po["y"] + 0.5))
    three_name = re.sub(r"[\[\]\.:/]", "", re.sub(r"\s", "_", nm))   # PropertyBinding.sanitizeNodeName
    R["portals"].append(dict(name=nm, blender=r4(p), extras=ex, three_name=three_name, three_id=three_name[len("Portal_"):]))
    check(f"portal_{po['id']}", ex.get("to") == po["to"] and ex.get("toSpawn") == po["toSpawn"] and ex.get("kind") == po["kind"]
          and on_face < 0.05 and along < 0.05 and abs(p[2]) < 0.05 and i in desc,
          at_blender=r4(p), on_wall_inner_face_m=round(on_face, 4), off_door_centre_m=round(along, 4),
          extras=ex, scene_portal=dict(to=po["to"], toSpawn=po["toSpawn"], kind=po["kind"], tile=[po["x"], po["y"]]),
          viewer_target=f"Spawn_{po['to']}_{po['toSpawn']}", three_name=three_name)

ci = idx.get(COLN, [None])[0]
if ci is not None:
    n = nodes[ci]
    me = J["meshes"][n["mesh"]]
    pa = J["accessors"][me["primitives"][0]["attributes"]["POSITION"]]
    lo, hi = to_b(pa["min"]), to_b(pa["max"])
    bb = [[min(lo[k], hi[k]) for k in range(3)], [max(lo[k], hi[k]) for k in range(3)]]
    R["collision_node"] = dict(extras=n.get("extras"), bbox_blender=[r4(bb[0]), r4(bb[1])],
                               triangles=sum(J["accessors"][p["indices"]]["count"] // 3 for p in me["primitives"]),
                               primitives=len(me["primitives"]))
    check("collision_node", ci in roots and not any(k in n for k in ("translation", "rotation", "scale", "matrix"))
          and n.get("extras", {}).get("wdi_collision") is True and not n.get("children")
          and all("material" not in p for p in me["primitives"]) and len(me["primitives"]) == 1,
          at_root=ci in roots, identity_transform=True, material=None, **R["collision_node"])
else:
    check("collision_node", False, missing=COLN)

# ------------------------------------------------------------------------------------------- lights
LT = J.get("extensions", {}).get("KHR_lights_punctual", {}).get("lights", [])
rep_l = {l["name"]: l for l in rep.get("lights", [])}
R["lights"] = []
light_ok = True
for i, n in enumerate(nodes):
    li = n.get("extensions", {}).get("KHR_lights_punctual", {}).get("light")
    if li is None:
        continue
    L = LT[li]
    M = world_m(i)
    p = to_b(apply(M, [0, 0, 0]))
    d = to_b(apply(M, [0, 0, -1], 0.0))
    e = dict(node=names[i], light=L.get("name"), type=L["type"], intensity=L.get("intensity"), color=L.get("color"),
             range=L.get("range"), spot=L.get("spot"), blender=r4(p), dir_blender=r4(d), extras=n.get("extras"),
             under_area=i in desc)
    w = rep_l.get(L.get("name"), {}).get("energyW")
    if w is not None and L["type"] in ("point", "spot"):
        e["blender_W"] = w
        e["W_over_4pi"] = round(w / (4 * math.pi), 6)
        e["compat_match"] = abs(L.get("intensity", 1.0) - w / (4 * math.pi)) < 1e-3 * max(1.0, w / (4 * math.pi))
        light_ok &= e["compat_match"]
    if L["type"] == "spot":
        # where the axis crosses the window's inner face (y = FY1: the north wall, the bedroom's) and the wall's outer
        # face, and lands on the floor; for the record, not a pass or fail
        for lab, yy in (("inner_face", FY1), ("outer_face", FY1 + 0.30)):
            if abs(d[1]) > 1e-9:
                t = (yy - p[1]) / d[1]
                e[f"axis_at_{lab}"] = r4([p[0] + t * d[0], yy, p[2] + t * d[2]])
        if d[2] < 0:
            t = -p[2] / d[2]
            e["axis_on_floor"] = r4([p[0] + t * d[0], p[1] + t * d[1], 0.0])
        e["cone_half_angle_deg"] = round(math.degrees(L["spot"].get("outerConeAngle", math.pi / 4)), 2)
        e["inner_cone_deg"] = round(math.degrees(L["spot"].get("innerConeAngle", 0.0)), 2)
    R["lights"].append(e)
types = sorted(l["type"] for l in LT)
names_l = [l.get("name", "") for l in LT]
check("lights_candle_and_moon_compat", len(LT) == ROOM["lights"]["exported"] and "directional" not in types
      and light_ok and all(x["under_area"] for x in R["lights"]) and all(x.startswith(SID + "_") for x in names_l),
      types=types, names=names_l,
      intensities=[(x["light"], x["intensity"], x.get("blender_W"), x.get("W_over_4pi")) for x in R["lights"]],
      note="COMPAT: candela = W / 4 pi (the README); no directional light, which would make main.ts drop the village moon")

# ------------------------------------------------------------------------------------------- materials, primitives
A = J["accessors"]
MATS = J["materials"]
mat_rows = []
for m in MATS:
    pb = m.get("pbrMetallicRoughness", {})
    f = pb.get("baseColorFactor", [1, 1, 1, 1])
    mat_rows.append(dict(name=m.get("name"), unlit="KHR_materials_unlit" in m.get("extensions", {}),
                         factor=r4(f), factor_in_0_1=all(0 <= v <= 1 for v in f),
                         texture=pb.get("baseColorTexture", {}).get("index"), alpha=m.get("alphaMode", "OPAQUE"),
                         double=m.get("doubleSided", False),
                         others=sorted(k for k in m if k not in ("name", "pbrMetallicRoughness", "extensions", "alphaMode",
                                                                 "doubleSided"))))
R["materials"] = mat_rows
check("every_material_unlit", all(r["unlit"] for r in mat_rows) and all(r["factor_in_0_1"] for r in mat_rows),
      materials=len(mat_rows), unlit=sum(r["unlit"] for r in mat_rows),
      blend=[r["name"] for r in mat_rows if r["alpha"] == "BLEND"], mask=[r["name"] for r in mat_rows if r["alpha"] == "MASK"],
      factors_out_of_0_1=[r["name"] for r in mat_rows if not r["factor_in_0_1"]],
      with_emissive_or_maps=[r["name"] for r in mat_rows if r["others"]])
rows = []
tri_room = tri_all = vert_all = 0
for i, n in enumerate(nodes):
    if "mesh" not in n:
        continue
    for k, p in enumerate(J["meshes"][n["mesh"]]["primitives"]):
        at = p["attributes"]
        dr = p.get("extensions", {}).get("KHR_draco_mesh_compression", {})
        tris = A[p["indices"]]["count"] // 3
        verts = A[at["POSITION"]]["count"]
        tri_all += tris
        vert_all += verts
        if names[i] != COLN:
            tri_room += tris
        c0 = A[at["COLOR_0"]] if "COLOR_0" in at else None
        mat = MATS[p["material"]] if "material" in p else None
        has_tex = bool(mat and mat.get("pbrMetallicRoughness", {}).get("baseColorTexture"))
        rows.append(dict(node=names[i], prim=k, tris=tris, verts=verts, mode=p.get("mode", 4), attrs=sorted(at),
                         draco_attrs=sorted(dr.get("attributes", {})),
                         color0=None if c0 is None else [c0["componentType"], c0["type"], c0.get("normalized", False)],
                         material=mat.get("name") if mat else None, textured=has_tex,
                         uv=("TEXCOORD_0" in at), what=n.get("extras", {}).get("wdi_what"), wid=n.get("extras", {}).get("wdi_id")))
R["primitives"] = rows
no_c = [r for r in rows if r["color0"] is None]
DELIBERATE = set(ROOM["no_color0"])
undeliberate = [r["node"] for r in no_c if r["node"] != COLN and r["wid"] not in DELIBERATE]
badfmt = [r["node"] for r in rows if r["color0"] is not None and r["color0"] != [5126, "VEC3", False]]
check("color0_on_every_room_primitive", not undeliberate and not badfmt and all(set(r["attrs"]) == set(r["draco_attrs"]) for r in rows),
      with_color0=len(rows) - len(no_c), primitives=len(rows),
      without=[(r["node"], r["material"], r["wid"]) for r in no_c], undeliberate=undeliberate, not_float_vec3=badfmt,
      triangles_only=all(r["mode"] == 4 for r in rows),
      textured_without_uv=[r["node"] for r in rows if r["textured"] and not r["uv"]],
      normals=sum("NORMAL" in r["attrs"] for r in rows))

# ------------------------------------------------------------------------------------------- images, size


def webp_size(b):
    if b[:4] != b"RIFF" or b[8:12] != b"WEBP":
        return None
    ch = b[12:16]
    if ch == b"VP8 ":
        w, h = struct.unpack_from("<HH", b, 26)
        return [w & 0x3FFF, h & 0x3FFF, "lossy"]
    if ch == b"VP8L":
        bits = struct.unpack_from("<I", b, 21)[0]
        return [(bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1, "lossless"]
    if ch == b"VP8X":
        return [int.from_bytes(b[24:27], "little") + 1, int.from_bytes(b[27:30], "little") + 1, "extended"]
    return None


BV = J["bufferViews"]
imgs = []
for im in J.get("images", []):
    bv = BV[im["bufferView"]]
    s = BIN0 + bv.get("byteOffset", 0)
    imgs.append(dict(name=im.get("name"), mime=im.get("mimeType"), bytes=bv["byteLength"],
                     size=webp_size(raw[s:s + bv["byteLength"]])))
img_bytes = sum(x["bytes"] for x in imgs)
used_src = {t.get("extensions", {}).get("EXT_texture_webp", {}).get("source") for t in tex}
R["images"] = imgs
R["totals"] = dict(bytes=len(raw), MB=round(len(raw) / 1e6, 3), MiB=round(len(raw) / 2 ** 20, 3), json_bytes=CH[0][2],
                   bin_bytes=CH[1][2], image_bytes=img_bytes, geometry_and_other_bytes=CH[1][2] - img_bytes,
                   images=len(imgs), textures=len(tex), materials=len(MATS), primitives=len(rows), nodes=len(nodes),
                   triangles_room=tri_room, triangles_with_collision=tri_all, vertices=vert_all,
                   texels=sum(x["size"][0] * x["size"][1] for x in imgs if x["size"]),
                   largest_image=max((x["size"][:2] for x in imgs if x["size"]), key=lambda s: s[0] * s[1]))
check("images_webp_sized", all(x["mime"] == "image/webp" and x["size"] for x in imgs)
      and all(max(x["size"][:2]) <= 2048 for x in imgs) and used_src == set(range(len(imgs))),
      images=len(imgs), textures=len(tex), sizes=sorted({f"{x['size'][0]}x{x['size'][1]}" for x in imgs}),
      image_bytes=img_bytes, unused_images=sorted(set(range(len(imgs))) - used_src))
SIZE = ROOM["glb_bytes"]
check(f"file_size_{roomcfg.tag(SIZE['min'] / 1e6)}_to_{roomcfg.tag(SIZE['max'] / 1e6)}_MB",
      SIZE["min"] <= len(raw) <= SIZE["max"],
      **{k: R["totals"][k] for k in ("bytes", "MB", "MiB", "image_bytes", "triangles_room")})

# ------------------------------------------------------------------------------------------- names (a plain append)
pre = SID + "_"
contract = {AREA, COLN} | set(SPAWNS) | set(PORTALS)
bad = {}
for coll in ("nodes", "meshes", "materials", "images", "textures", "samplers", "cameras", "skins", "animations"):
    nm = [x.get("name") for x in J.get(coll, [])]
    if coll in ("textures", "samplers") and all(v is None for v in nm):
        continue
    d = sorted({v for v in nm if v is not None and nm.count(v) > 1})
    b = [v for v in nm if v is None or not (v.startswith(pre) or v in contract)]
    if d or b:
        bad[coll] = dict(dups=d, unprefixed=b)
ln = [l.get("name") for l in LT]
if len(set(ln)) != len(ln) or not all(v and v.startswith(pre) for v in ln):
    bad["lights"] = ln
three = [re.sub(r"[\[\]\.:/]", "", re.sub(r"\s", "_", v)) for v in names]
three_dups = sorted({v for v in three if three.count(v) > 1})
changed = [(a, b) for a, b in zip(names, three) if a != b]
R["names"] = dict(scene=J["scenes"][0].get("name"), three_sanitized_changes=changed, three_dups=three_dups)
check("names_unique_and_prefixed", not bad and not dups and J["scenes"][0].get("name") == f"Room_{SID}" and not three_dups,
      problems=bad, node_dups=dups, scene=J["scenes"][0].get("name"), three_renames=changed,
      contract_names=sorted(contract))

R["fails"] = FAILS
R["pass"] = not FAILS
json.dump(R, open(OUT, "w"), indent=1)
print("FAILS", FAILS)
