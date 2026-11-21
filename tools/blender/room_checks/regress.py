"""The room regression gate's own arithmetic; regress.sh runs Blender between its two steps. Which room, which saved
bake and which golden value; then whether the rebuilt GLB is the golden one and, when it is not, what differs. Plain
Python, standard library only.

    regress.py plan    <roomId> [--out DIR] [--raw F] [--golden F]
    regress.py verdict <roomId> [--out DIR] [--raw F] [--golden F] [--build-exit N] [--seconds S]
    regress.py record  <roomId> [--glb F] [--manifest F] [--raw F] [--golden F] [--note TEXT] [--replace]
    regress.py rooms   [--golden F]

    roomId      the scene id, e.g. widow_bedroom
    --out       the scratch folder of the rebuild     default tools/blender/build/rooms/regress/<roomId>/
    --raw       the room's saved bake                 default tools/blender/build/rooms/<the golden row's `raw`>;
                                                      for record, tools/blender/build/rooms/<roomId>_raw_groups.npz
    --golden    the golden values                     default tools/blender/meshy_rooms/golden.json
    --glb, --manifest   (record) the finished build   default tools/blender/build/rooms/<roomId>.glb and .json

`plan` prints what regress.sh needs, one value a line in the order of PLAN. `verdict` reads the rebuilt GLB and its
manifest in --out, compares them with the room's golden row, prints the result and writes <out>/regress.json; a GLB
that differs is compared part by part with the golden GLB when that one is on this machine (the room's own build).
`record` writes a room's golden row from a finished build: for a room that has just passed its checks, or (--replace)
for one that was changed on purpose and checked again. It runs no Blender: run regress.sh after it, because a golden
value that the room's own saved bake cannot rebuild is of no use. `rooms` prints the ids that have a golden row, one
a line.

A row records the program that wrote its GLB (`generator`, the GLB's asset.generator, e.g. "Khronos glTF Blender I/O
v5.2.40"): another version of Blender's glTF exporter writes other bytes for the same room, so its md5 cannot match.
The verdict says so first; the row is recorded again only after the room, built with that Blender, has passed its
checks again. A Blender release that keeps the exporter's version gives a plain MISMATCH.

Exit codes, regress.sh's too: 0 the rebuilt GLB has the golden md5; 1 it differs, or the rebuild failed; 2 a bad
call; 3 the saved bake is not on this machine (tools/blender/build/ is git-ignored), so nothing was compared.
"""
import argparse
import hashlib
import json
import os
import re
import struct
import sys
import time

import roomcfg

ROOT = roomcfg.ROOT
ROOMS = os.path.join(ROOT, "tools", "blender", "build", "rooms")
GOLDEN = os.path.join(ROOT, "tools", "blender", "meshy_rooms", "golden.json")
PLAN = ("room", "light", "layout", "raw", "out", "golden")
# what a golden row says of its GLB besides md5
FIELDS = ("light", "layout", "vertices", "triangles", "glbBytes", "generator")
# what a row may say of the rebuild's manifest besides (`stamp` writes them; the verdict compares each one the row has):
# the digest of the numbers the GLB's md5 does not carry, the md5s of the room's and the look's data that reach the
# bake, and the Blender that built it
EXTRAS = ("manifestDigest", "roomBakeMd5", "lookBakeMd5", "blender")
# the parts of the manifest the digest holds (manifest_digest)
DIGEST_PARTS = ("lightNumbers", "walk", "spots", "exposure", "collision", "pieces")
# the arrays of a saved bake whose one-sample values `bake` compares: the groups, the AO and the vertices
BAKE_KEYS = ("candle", "moon", "fill", "ao", "co")
PLAIN = re.compile(r"[A-Za-z0-9_.-]+")      # a light setting's or a layout's name, as the builder's arguments take it
shown = roomcfg.shown


def stop(code, text):
    sys.stderr.write("regress: " + text + "\n")
    sys.exit(code)


def file_md5(path):
    h = hashlib.md5()
    with open(path, "rb") as fh:
        for part in iter(lambda: fh.read(1 << 20), b""):
            h.update(part)
    return h.hexdigest()


def generator(path):
    """The program that wrote a GLB (its JSON chunk's asset.generator), or None when the file does not say."""
    try:
        with open(path, "rb") as fh:
            head = fh.read(20)
            if len(head) < 20 or head[:4] != b"glTF":
                return None
            clen, ctype = struct.unpack_from("<I4s", head, 12)
            if ctype != b"JSON":
                return None
            j = json.loads(fh.read(clen))
    except (OSError, ValueError):
        return None
    g = (j.get("asset") or {}).get("generator") if isinstance(j, dict) else None
    return g if isinstance(g, str) and g else None


def load_golden(path):
    if not os.path.isfile(path):
        stop(2, "no golden file " + shown(path))
    with open(path, encoding="utf-8") as fh:
        try:
            gold = json.load(fh)
        except ValueError as err:
            stop(2, f"{shown(path)} is not JSON: {err}")
    if not isinstance(gold, dict) or not isinstance(gold.get("rooms", {}), dict):
        stop(2, f"{shown(path)} is not a golden file: it wants an object with `rooms`, an object by room id")
    return gold


def golden_row(gold, room, path):
    rows = gold.get("rooms") or {}
    if room not in rows:
        stop(2, f"{room} has no golden row in {shown(path)} (it has: {', '.join(sorted(rows)) or 'none'}). A room "
                "gets one when it has passed its checks: regress.py record")
    row = rows[room]
    lacks = [k for k in ("glbMd5",) + FIELDS if k not in row]
    if lacks:
        stop(2, f"{room}'s golden row in {shown(path)} lacks {', '.join(lacks)}")
    return row


def same_path(a, b):
    return os.path.normcase(os.path.realpath(a)) == os.path.normcase(os.path.realpath(b))


def paths(a, row):
    """The saved bake and the scratch folder of a run, from the arguments and the golden row."""
    raw = os.path.abspath(a.raw) if a.raw else os.path.join(ROOMS, row.get("raw") or a.room + "_raw_groups.npz")
    out = os.path.abspath(a.out) if a.out else os.path.join(ROOMS, "regress", a.room)
    if same_path(out, ROOMS):
        stop(2, f"--out is the rooms' own build folder ({shown(ROOMS)}): the rebuild would overwrite the build it "
                "is compared with. Give a scratch folder")
    return raw, out


# ---------------------------------------------------------------- a GLB in named parts


def glb_parts(path):
    """A GLB as named parts that can be compared one by one: its nodes, meshes, materials and images by name, each
    with what the file says of it and the md5 of its own bytes (a mesh's Draco data, an image's file). Buffer offsets
    and indices are left out: they move when any part before them changes size."""
    with open(path, "rb") as fh:
        data = fh.read()
    if data[:4] != b"glTF":
        raise ValueError(shown(path) + " is not a GLB")
    off, J, B = 12, None, b""
    while off + 8 <= len(data):
        clen, ctype = struct.unpack_from("<I4s", data, off)
        if ctype == b"JSON":
            J = json.loads(data[off + 8:off + 8 + clen])
        elif ctype == b"BIN\x00":
            B = data[off + 8:off + 8 + clen]
        off += 8 + clen
    acc, views = J.get("accessors", []), J.get("bufferViews", [])
    images, textures, materials = J.get("images", []), J.get("textures", []), J.get("materials", [])
    meshes, nodes = J.get("meshes", []), J.get("nodes", [])

    def named(rows, kind):
        seen, out = {}, []
        for i, r in enumerate(rows):
            n = r.get("name") or f"{kind}#{i}"
            seen[n] = seen.get(n, 0) + 1
            out.append(n if seen[n] == 1 else f"{n} ({seen[n]})")
        return out

    def view_md5(i):
        v = views[i]
        o = v.get("byteOffset", 0)
        return hashlib.md5(B[o:o + v["byteLength"]]).hexdigest()

    def accessor(i):
        return {k: acc[i].get(k) for k in ("count", "type", "componentType", "normalized", "min", "max")}

    image_names, material_names = named(images, "image"), named(materials, "material")
    mesh_names, node_names = named(meshes, "mesh"), named(nodes, "node")

    def texture_image(t):
        tx = textures[t]
        src = tx.get("extensions", {}).get("EXT_texture_webp", {}).get("source", tx.get("source"))
        return None if src is None else image_names[src]

    def by_image(x):
        """A material's JSON with each texture index replaced by its image's name."""
        if isinstance(x, dict):
            return {k: (texture_image(v) if k == "index" and isinstance(v, int) else by_image(v))
                    for k, v in x.items()}
        return [by_image(v) for v in x] if isinstance(x, list) else x

    parts = {"nodes": {}, "meshes": {}, "materials": {}, "images": {}}
    for name, m in zip(mesh_names, meshes):
        prims = []
        for p in m.get("primitives", []):
            draco = p.get("extensions", {}).get("KHR_draco_mesh_compression")
            prims.append(dict(material=None if p.get("material") is None else material_names[p["material"]],
                              mode=p.get("mode", 4),
                              attributes={k: accessor(i) for k, i in sorted(p.get("attributes", {}).items())},
                              indices=None if p.get("indices") is None else accessor(p["indices"]),
                              data=view_md5(draco["bufferView"]) if draco else None))
        parts["meshes"][name] = prims
    for name, m in zip(material_names, materials):
        parts["materials"][name] = by_image({k: v for k, v in m.items() if k != "name"})
    for name, im in zip(image_names, images):
        parts["images"][name] = dict(mimeType=im.get("mimeType"), bytes=views[im["bufferView"]]["byteLength"],
                                     data=view_md5(im["bufferView"]))
    for name, n in zip(node_names, nodes):
        row = {k: n.get(k) for k in ("translation", "rotation", "scale", "matrix", "extras") if k in n}
        if "mesh" in n:
            row["mesh"] = mesh_names[n["mesh"]]
        if "children" in n:
            row["children"] = [node_names[c] for c in n["children"]]
        if "extensions" in n:
            row["extensions"] = n["extensions"]
        parts["nodes"][name] = row
    scenes = [[node_names[i] for i in s.get("nodes", [])] for s in J.get("scenes", [])]
    parts["file"] = dict(asset=J.get("asset"), extensionsUsed=J.get("extensionsUsed"),
                         extensionsRequired=J.get("extensionsRequired"), extensions=J.get("extensions"),
                         roots=scenes, samplers=J.get("samplers"))
    return parts


DATA_ONLY = "the same counts and bounds, other data (positions within the bounds, UVs or the baked light)"


def mesh_change(a, b):
    """What differs between two meshes' primitives, in words."""
    if len(a) != len(b):
        return f"{len(a)} primitives, golden {len(b)}"
    said = []
    for p, q in zip(a, b):
        if p["material"] != q["material"]:
            said.append(f"material {p['material']}, golden {q['material']}")
        for k in sorted(set(p["attributes"]) | set(q["attributes"])):
            x, y = p["attributes"].get(k), q["attributes"].get(k)
            if x is None or y is None:
                said.append(f"{k} {'added' if y is None else 'gone'}")
            elif x["count"] != y["count"]:
                said.append(f"{x['count']:,} vertices, golden {y['count']:,}")
                break
            elif x != y:
                said.append(f"{k}'s bounds or type")
        if (p["indices"] or {}).get("count") != (q["indices"] or {}).get("count"):
            said.append(f"{(p['indices'] or {}).get('count')} indices, golden {(q['indices'] or {}).get('count')}")
    return "; ".join(dict.fromkeys(said)) or DATA_ONLY


def glb_differences(got, golden, limit=12):
    """Plain lines saying where a rebuilt GLB differs from the golden one."""
    A, B = glb_parts(got), glb_parts(golden)
    lines, alike = [], 0

    def some(names):
        return ", ".join(names[:limit]) + (f" and {len(names) - limit} more" if len(names) > limit else "")

    for kind in ("nodes", "meshes", "materials", "images"):
        a, b = A[kind], B[kind]
        new, gone = sorted(set(a) - set(b)), sorted(set(b) - set(a))
        changed = [n for n in a if n in b and a[n] != b[n]]
        if not (new or gone or changed):
            lines.append(f"{kind}: all {len(b)} the same")
            alike += 1
            continue
        lines.append(f"{kind}: {len(changed)} of {len(b)} differ" + (f", {len(new)} new" if new else "")
                     + (f", {len(gone)} gone" if gone else ""))
        if new:
            lines.append("  new: " + some(new))
        if gone:
            lines.append("  gone: " + some(gone))
        why = {}
        for n in changed:
            if kind == "meshes":
                w = mesh_change(a[n], b[n])
            elif kind == "images":
                w = f"{a[n]['bytes']:,} bytes, golden {b[n]['bytes']:,}"
            else:
                w = "its " + ", ".join(k for k in sorted(set(a[n]) | set(b[n])) if a[n].get(k) != b[n].get(k))
            why.setdefault(w, []).append(n)
        shown_rows = 0
        for w, names in why.items():
            if len(names) > 1:                      # many parts changed the same way: one line for them
                lines.append(f"  {w}: {len(names)}: {some(names)}")
            elif shown_rows < limit:
                lines.append(f"  {names[0]}: {w}")
                shown_rows += 1
        left = sum(1 for names in why.values() if len(names) == 1) - shown_rows
        if left > 0:
            lines.append(f"  ... and {left} more")
    keys = [k for k in A["file"] if A["file"][k] != B["file"][k]]
    lines.append("the file's own fields: " + ("the same" if not keys else "differ in " + ", ".join(keys)))
    if alike == 4 and not keys:
        lines.append("every part named above is the same, so the bytes differ outside them: the file's length, the "
                     "order or padding of its buffer, or a field of its JSON that is not compared here")
    return lines


# ---------------------------------------------------------------- the manifest's numbers, a saved bake's arrays


def _sha1(x):
    return hashlib.sha1(json.dumps(x, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def manifest_digest(m):
    """The digest of a build's numbers that its GLB's md5 does not carry (implementation plan, S0): the light numbers
    (what the look file's setting notes quote), the walk check, the spots, the exposure (E, k and wdi_exposure), the
    collision (its boxes' count and their sha1) and every piece's box. {"sha1": all, "parts": {part: sha1}}."""
    ex = m.get("exposure") or {}
    col = m.get("collision") or {}
    parts = dict(lightNumbers=(m.get("light") or {}).get("numbers"), walk=m.get("walk"), spots=m.get("spots"),
                 exposure={k: ex.get(k) for k in ("E", "k", "wdi_exposure")},
                 collision={k: col.get(k) for k in ("boxes", "boxesSha1")},
                 pieces={p.get("id"): p.get("box") for p in m.get("pieces") or []})
    each = {k: _sha1(parts[k]) for k in DIGEST_PARTS}
    return dict(sha1=_sha1(each), parts=each)


def manifest_extras(m):
    """What `stamp` writes into a golden row from a rebuild's manifest (EXTRAS)."""
    src = m.get("source") or {}
    return dict(manifestDigest=manifest_digest(m), roomBakeMd5=src.get("roomBakeMd5"),
                lookBakeMd5=src.get("lookBakeMd5"), blender=src.get("blender"))


def extras_differ(row, got):
    """The EXTRAS the row has whose value the rebuild does not share, and the digest's parts that differ."""
    off, parts = [], []
    for k in EXTRAS:
        if k not in row:
            continue
        if k == "manifestDigest":
            a, b = (got.get(k) or {}), (row.get(k) or {})
            if a.get("sha1") != b.get("sha1"):
                off.append(k)
                parts = [p for p in DIGEST_PARTS if (a.get("parts") or {}).get(p) != (b.get("parts") or {}).get(p)]
        elif got.get(k) != row[k]:
            off.append(k)
    return off, parts


def bake_arrays(npz):
    """A saved bake's arrays (meshy_room_build.save_raw) as one sha1 per group (BAKE_KEYS): each mesh's array bytes in
    the order of the mesh names, the name and shape with them, so a renamed or a reshaped mesh changes it too. Needs
    numpy."""
    import numpy as np
    z = np.load(npz)
    by = {}
    for key in sorted(z.files):
        if key.startswith("meta|") or "|" not in key:
            continue
        mesh, g = key.rsplit("|", 1)
        if g in BAKE_KEYS:
            by.setdefault(g, []).append((mesh, z[key]))
    out = {}
    for g in BAKE_KEYS:
        if g not in by:
            continue
        h = hashlib.sha1()
        for mesh, arr in by[g]:
            a = np.ascontiguousarray(arr, dtype=np.float32)
            h.update(mesh.encode() + b"\0" + str(a.shape).encode() + b"\0" + a.tobytes())
        out[g] = h.hexdigest()
    meta = {k.split("|", 1)[1]: str(z[k]) for k in z.files if k.startswith("meta|")}
    out["meshes"] = len({m for rows in by.values() for m, _a in rows})
    out["samples"] = int(meta.get("samples", "0") or 0)
    return out


# ---------------------------------------------------------------- plan, verdict, record


def plan(a):
    row = golden_row(load_golden(a.golden), a.room, a.golden)
    # regress.sh reads the six values one a line, hands light and layout to the builder and clears the room's files in
    # `out` before the rebuild. A row written by hand with a line break in a value would shift the lines, and the
    # folder cleared would no longer be the scratch folder: refuse it here, before anything is looked for on disk
    for k in ("light", "layout"):
        if not isinstance(row[k], str) or not PLAIN.fullmatch(row[k]):
            stop(2, f"{a.room}'s golden row in {shown(a.golden)} has a {k} that is not a plain name (letters, digits, "
                    f"_ . -): {row[k]!r}")
    raw, out = paths(a, row)
    vals = dict(room=a.room, light=row["light"], layout=row["layout"], raw=shown(raw), out=shown(out),
                golden=shown(a.golden))
    broken = [k for k in PLAN if "\n" in vals[k] or "\r" in vals[k]]
    if broken:
        stop(2, f"a line break in the {' and the '.join(broken)} of {a.room}'s plan: regress.sh reads one value a line")
    if not os.path.isfile(raw):
        stop(3, f"{a.room}'s saved bake {shown(raw)} is not on this machine. tools/blender/build/ is git-ignored: the "
                "bake exists only where the room was baked. Nothing was rebuilt or compared")
    sys.stdout.buffer.write(("\n".join(vals[k] for k in PLAN) + "\n").encode("utf-8"))


def log_tail(path, n=12):
    if not os.path.isfile(path):
        return []
    with open(path, encoding="utf-8", errors="replace") as fh:
        rows = [r.rstrip() for r in fh if r.strip()]
    return rows[-n:]


def verdict(a):
    row = golden_row(load_golden(a.golden), a.room, a.golden)
    raw, out = paths(a, row)
    glb, manifest = os.path.join(out, a.room + ".glb"), os.path.join(out, a.room + ".json")
    res = dict(room=a.room, verdict=None, golden={k: row.get(k) for k in ("glbMd5",) + FIELDS + ("recorded",)},
               goldenFile=shown(a.golden), out=shown(out), raw=shown(raw), seconds=a.seconds, buildExit=a.build_exit)
    say = []
    if a.build_exit != 0 or not os.path.isfile(glb) or not os.path.isfile(manifest):
        res["verdict"] = "failed"
        missing = [os.path.basename(p) for p in (glb, manifest) if not os.path.isfile(p)]
        say.append(f"regress {a.room}: FAILED. The rebuild did not finish (the builder or the lock wrapper ended with "
                   f"exit code {a.build_exit}" + (", not written: " + ", ".join(missing) if missing else "")
                   + "), so nothing was compared.")
        tail = log_tail(os.path.join(out, "build.log"))
        if tail:
            say.append(f"  the end of {shown(os.path.join(out, 'build.log'))}:")
            say += ["    " + r for r in tail]
            if any("does not match this build's geometry" in r for r in tail):
                say.append("  The saved bake no longer fits the room's geometry: the change moved, added or removed "
                           "vertices of a finished room.")
    else:
        with open(manifest, encoding="utf-8") as fh:
            m = json.load(fh)
        got = dict(glbMd5=file_md5(glb), glbBytes=os.path.getsize(glb), generator=generator(glb),
                   light=(m.get("light") or {}).get("setting"), layout=m.get("layout"),
                   vertices=(m.get("counts") or {}).get("vertices"), triangles=(m.get("counts") or {}).get("triangles"))
        src = m.get("source") or {}
        raw_md5 = (src.get("raw") or {}).get("fileMd5")        # the bake the build says it was made from
        res.update(built=got, rawMd5=raw_md5, source={k: src.get(k) for k in (
            "scriptMd5", "roomMd5", "roomBakeMd5", "lookMd5", "lookBakeMd5", "kitMd5", "rawAgrees")})
        extras = manifest_extras(m)
        res["extras"] = extras
        off = [k for k in FIELDS if got[k] != row[k]]
        off_x, parts_x = extras_differ(row, extras)
        off += off_x
        res["digestPartsThatDiffer"] = parts_x
        same = got["glbMd5"] == row["glbMd5"]
        # another glTF exporter (another Blender build) writes other bytes for the same room: the md5 cannot match
        other_blender = not same and got["generator"] is not None and got["generator"] != row["generator"]
        res["verdict"] = "match" if same and not off else "mismatch"
        res["fieldsThatDiffer"] = off
        res["anotherBlender"] = other_blender
        when = f"recorded {row.get('recorded')}" if row.get("recorded") else "no date recorded"

        def num(v):
            return f"{v:,}" if isinstance(v, int) and not isinstance(v, bool) else str(v)

        if same and not off:
            say.append(f"regress {a.room}: MATCH. The rebuilt GLB is the golden one, byte for byte.")
            say.append(f"  glb md5    {got['glbMd5']}  ({got['glbBytes']:,} bytes; golden {when})")
            say.append(f"  built      light {got['light']}, layout {got['layout']}, {num(got['vertices'])} vertices, "
                       f"{num(got['triangles'])} triangles")
            have = [k for k in EXTRAS if k in row]
            if have:
                say.append(f"  manifest   {', '.join(have)} as the row has them (digest "
                           f"{(extras['manifestDigest'] or {}).get('sha1')})")
            else:
                say.append("  manifest   the row has no digest of the manifest's numbers: regress.py stamp writes it")
        else:
            if same and off_x and not [k for k in off if k not in off_x]:
                say.append(f"regress {a.room}: MISMATCH in the manifest. The rebuilt GLB has the golden md5, but the "
                           f"build's {', '.join(off_x)} differ from the row's: the change moved what the GLB does not "
                           "carry" + (f" (the digest's {', '.join(parts_x)})" if parts_x else "") + ".")
                for k in off_x:
                    if k != "manifestDigest":
                        say.append(f"  {k:<10} {extras.get(k)}  (golden {row.get(k)})")
            elif same:
                say.append(f"regress {a.room}: MISMATCH in the golden row. The rebuilt GLB has the golden md5, but "
                           f"the row's {', '.join(off)} do not describe it: write the row again from the build "
                           "(regress.py record --replace).")
            elif other_blender:
                say.append(f"regress {a.room}: MISMATCH, another Blender build: the md5 cannot match; record again "
                           "only after the room has been checked again.")
                say.append(f"  generator  {got['generator']}  (golden {row['generator']})")
            else:
                say.append(f"regress {a.room}: MISMATCH. The rebuilt GLB is not the golden one.")
            say.append(f"  glb md5    {got['glbMd5']}  ({got['glbBytes']:,} bytes)")
            say.append(f"  golden     {row['glbMd5']}  ({row['glbBytes']:,} bytes; {when})")
            keys = ["light", "layout", "vertices", "triangles"]
            if got["generator"] != row["generator"] and not other_blender:
                keys.append("generator")
            for k in keys:
                say.append(f"  {k:<10} {num(got[k])}" + ("" if got[k] == row[k] else f"  (golden {num(row[k])})"))
        if raw_md5 is None:
            say.append("  saved bake the build in --out was not made from one (its manifest names none)")
        elif row.get("rawMd5"):
            say.append(f"  saved bake md5 {raw_md5}: " + (
                "the one the golden row was recorded from" if raw_md5 == row["rawMd5"] else
                f"NOT the one the golden row was recorded from ({row['rawMd5']}); another bake can change the "
                "light by itself"))
        if not same:
            agrees = src.get("rawAgrees")
            if agrees:
                say.append("  the saved bake against this run's code and data (the manifest's source.rawAgrees): "
                           + ", ".join(f"{k} {json.dumps(v)}" for k, v in agrees.items()))
            ref = os.path.join(ROOMS, a.room + ".glb")
            if os.path.isfile(ref) and not same_path(ref, glb) and file_md5(ref) == row["glbMd5"]:
                try:
                    res["differences"] = glb_differences(glb, ref)
                    say.append(f"  against the golden GLB ({shown(ref)}):")
                    say += ["    " + r for r in res["differences"]]
                except (ValueError, KeyError, IndexError, struct.error) as err:
                    say.append(f"  the two GLBs could not be compared part by part: {err}")
            else:
                say.append(f"  The golden GLB itself is not on this machine ({shown(ref)} is missing or is another "
                           "build), so the two were not compared part by part.")
            if other_blender:
                say.append("  This Blender writes the room's GLB with other bytes. Build the room with it, run its "
                           "checks (run.sh), and only when they end as they did before record the row again: python "
                           f"tools/blender/room_checks/regress.py record {a.room} --replace")
            else:
                say.append("  A change to shared builder code must leave a finished room as it was: find what "
                           "changed it. Only when the room itself was changed on purpose and has passed its checks "
                           f"again is the row replaced: python tools/blender/room_checks/regress.py record {a.room} "
                           "--replace")
    if a.seconds is not None:
        say.append(f"  rebuilt into {shown(out)} in {a.seconds:g} s")
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "regress.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump(res, fh, indent=1)
        fh.write("\n")
    sys.stdout.write("\n".join(say) + "\n")
    sys.exit(0 if res["verdict"] == "match" else 1)


def record(a):
    glb = os.path.abspath(a.glb) if a.glb else os.path.join(ROOMS, a.room + ".glb")
    manifest = os.path.abspath(a.manifest) if a.manifest else os.path.join(ROOMS, a.room + ".json")
    raw = os.path.abspath(a.raw) if a.raw else os.path.join(ROOMS, a.room + "_raw_groups.npz")
    for p in (glb, manifest, raw):
        if not os.path.isfile(p):
            stop(2, "no such file: " + shown(p))
    with open(manifest, encoding="utf-8") as fh:
        m = json.load(fh)
    size = os.path.getsize(glb)
    if m.get("scene") != a.room or (m.get("glb") or {}).get("bytes") != size:
        stop(2, f"{shown(manifest)} is not the manifest of {shown(glb)} (scene {m.get('scene')!r}, GLB bytes "
                f"{(m.get('glb') or {}).get('bytes')} against {size})")
    raw_md5 = file_md5(raw)
    used = ((m.get("source") or {}).get("raw") or {}).get("fileMd5")
    if used and used != raw_md5:
        stop(2, f"the build was made from another saved bake (md5 {used}) than {shown(raw)} (md5 {raw_md5}): the "
                "gate could not rebuild it from this one")
    gen = generator(glb)
    if gen is None:
        stop(2, f"{shown(glb)} does not name the program that wrote it (asset.generator): not a GLB of Blender's "
                "glTF exporter")
    gold = load_golden(a.golden) if os.path.isfile(a.golden) else {"rooms": {}}
    rows = gold.setdefault("rooms", {})
    try:
        row = dict(glbMd5=file_md5(glb), glbBytes=size, generator=gen, light=m["light"]["setting"],
                   layout=m["layout"], vertices=m["counts"]["vertices"], triangles=m["counts"]["triangles"],
                   raw=os.path.basename(raw), rawMd5=raw_md5, recorded=time.strftime("%Y-%m-%d"))
    except (KeyError, TypeError):
        stop(2, f"{shown(manifest)} lacks light.setting, layout or counts: not a manifest of meshy_room_build.py")
    if a.note:
        row["note"] = a.note
    row.update({k: v for k, v in manifest_extras(m).items() if v is not None})
    old = rows.get(a.room)
    if old and not a.replace:
        if old.get("glbMd5") == row["glbMd5"]:
            stop(2, f"{a.room}'s golden row already holds this GLB (md5 {row['glbMd5']}); nothing written")
        stop(2, f"{a.room} already has a golden row (glb md5 {old.get('glbMd5')}, recorded {old.get('recorded')}). "
                "It is replaced only when the room was changed on purpose and has passed its checks again: --replace")
    for k in ("bake1spp", "rig"):     # the bake gate's rows stay: they describe the room's bake, not its GLB
        if old and k in old and k not in row:
            row[k] = old[k]
    rows[a.room] = row
    write_golden(a.golden, gold)
    print(f"regress: {a.room}'s golden row written to {shown(a.golden)}: glb md5 {row['glbMd5']} ({row['generator']}), "
          f"light {row['light']}, layout {row['layout']}, {row['vertices']:,} vertices, {row['triangles']:,} "
          f"triangles, saved bake {row['raw']} (md5 {row['rawMd5']}). Now run: bash "
          f"tools/blender/room_checks/regress.sh {a.room}")


def write_golden(path, gold):
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(gold, fh, indent=2, ensure_ascii=False)
        fh.write("\n")


def stamp(a):
    """Add the manifest's EXTRAS to a room's golden row from a rebuild in --out whose GLB is the golden one: the GLB's
    fields are not touched, so a row written before the digest existed gains it without being recorded again."""
    gold = load_golden(a.golden)
    row = golden_row(gold, a.room, a.golden)
    _raw, out = paths(a, row)
    glb, manifest = os.path.join(out, a.room + ".glb"), os.path.join(out, a.room + ".json")
    for p in (glb, manifest):
        if not os.path.isfile(p):
            stop(2, "no such file: " + shown(p) + " (run regress.sh first)")
    if file_md5(glb) != row["glbMd5"]:
        stop(1, f"{shown(glb)} is not the golden GLB (md5 {file_md5(glb)}, golden {row['glbMd5']}): only a rebuild "
                "that matches gives the row its manifest's numbers")
    with open(manifest, encoding="utf-8") as fh:
        m = json.load(fh)
    ex = manifest_extras(m)
    had = [k for k in EXTRAS if k in row]
    if [k for k in had if row.get(k) != ex.get(k)] and not a.replace:
        stop(2, f"{a.room}'s row already has {', '.join(had)} and the rebuild's differ; --replace only when that "
                "change was made on purpose")
    row.update({k: v for k, v in ex.items() if v is not None})
    row["extrasRecorded"] = time.strftime("%Y-%m-%d")
    write_golden(a.golden, gold)
    print(f"regress: {a.room}'s golden row now holds the manifest digest {ex['manifestDigest']['sha1']}, roomBakeMd5 "
          f"{ex['roomBakeMd5']}, lookBakeMd5 {ex['lookBakeMd5']}, Blender {ex['blender']}")


def bake(a):
    """The one-sample group bake gate (regress_bake.sh): each group's arrays of the saved bake in --out and the rig's
    fingerprint against the row's `bake1spp` and `rig`. With --record (two runs, run1 and run2, in --out) the row gets
    them only when the two runs agree bit for bit."""
    gold = load_golden(a.golden)
    row = golden_row(gold, a.room, a.golden)
    runs = ["run1", "run2"] if a.record else ["."]
    got = []
    for d in runs:
        folder = os.path.join(a.out, d)
        npz, rig = os.path.join(folder, a.room + "_bake1.npz"), os.path.join(folder, "rig.json")
        for p in (npz, rig):
            if not os.path.isfile(p):
                stop(1, "no such file: " + shown(p) + " (the build did not finish: see the build.log beside it)")
        with open(rig, encoding="utf-8") as fh:
            fp = json.load(fh)
        got.append(dict(bake1spp=bake_arrays(npz), rig=dict(sha1=fp["sha1"], parts=fp["parts"],
                                                            lights=len(fp.get("lights") or []))))
    res = dict(room=a.room, runs=got)
    say = []
    if a.record:
        if got[0] != got[1]:
            diff = sorted(k for k in BAKE_KEYS if got[0]["bake1spp"].get(k) != got[1]["bake1spp"].get(k))
            rd = got[0]["rig"] != got[1]["rig"]
            say.append(f"regress bake {a.room}: the two runs DIFFER ({', '.join(diff) or 'no group'}"
                       f"{', the rig' if rd else ''}): one sample is not bit-deterministic here, so nothing was "
                       "recorded. The fallback is the rig's fingerprint and a 16-sample pair compared by its noise "
                       "(implementation plan, S0)")
            res["verdict"] = "differ"
        elif (row.get("bake1spp") or row.get("rig")) and not a.replace:
            stop(2, f"{a.room}'s row already has bake1spp or rig: --replace only when the bake was changed on purpose")
        else:
            row["bake1spp"] = dict(got[0]["bake1spp"], recorded=time.strftime("%Y-%m-%d"))
            row["rig"] = dict(got[0]["rig"], recorded=time.strftime("%Y-%m-%d"))
            write_golden(a.golden, gold)
            say.append(f"regress bake {a.room}: the two runs agree bit for bit; the row's bake1spp and rig are "
                       f"written (rig {got[0]['rig']['sha1']})")
            res["verdict"] = "recorded"
    else:
        want_b, want_r = row.get("bake1spp"), row.get("rig")
        if not want_b or not want_r:
            stop(2, f"{a.room}'s golden row has no bake1spp or rig: regress_bake.sh {a.room} --record writes them")
        g = got[0]
        off = [k for k in BAKE_KEYS if k in want_b and g["bake1spp"].get(k) != want_b[k]]
        rig_off = [k for k in want_r.get("parts", {}) if g["rig"]["parts"].get(k) != want_r["parts"][k]]
        res.update(groupsThatDiffer=off, rigPartsThatDiffer=rig_off)
        if not off and not rig_off and g["rig"]["sha1"] == want_r["sha1"]:
            res["verdict"] = "match"
            say.append(f"regress bake {a.room}: MATCH. The rig's fingerprint and the one-sample bake's "
                       f"{', '.join(k for k in BAKE_KEYS if k in want_b)} are the golden ones, bit for bit.")
        else:
            res["verdict"] = "mismatch"
            say.append(f"regress bake {a.room}: MISMATCH. " + "; ".join(
                x for x in (f"the arrays {', '.join(off)} differ" if off else "",
                            f"the rig's {', '.join(rig_off) or 'fingerprint'} differ" if rig_off or not off else "")
                if x) + ".")
            say.append("  A step that changes the rig or the bake says how its change is proven (implementation "
                       "plan, section 4); for any other step this is a change that should not have reached the bake.")
    os.makedirs(a.out, exist_ok=True)
    with open(os.path.join(a.out, "regress_bake.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump(res, fh, indent=1)
        fh.write("\n")
    sys.stdout.write("\n".join(say) + "\n")
    sys.exit(0 if res["verdict"] in ("match", "recorded") else 1)


def rooms(a):
    ids = sorted(load_golden(a.golden).get("rooms") or {})
    sys.stdout.buffer.write("".join(i + "\n" for i in ids).encode("utf-8"))


def main():
    ap = argparse.ArgumentParser(prog="regress.py", description="The room regression gate; see the file's head.")
    sub = ap.add_subparsers(dest="step", required=True)
    for name in ("plan", "verdict", "record", "rooms", "stamp", "bake"):
        p = sub.add_parser(name)
        p.add_argument("--golden")
        if name == "rooms":
            continue
        p.add_argument("room")
        p.add_argument("--raw")
        if name != "record":
            p.add_argument("--out")
        if name in ("stamp", "bake"):
            p.add_argument("--replace", action="store_true")
        if name == "bake":
            p.add_argument("--record", action="store_true")
        if name == "verdict":
            p.add_argument("--build-exit", type=int, default=0)
            p.add_argument("--seconds", type=float)
        if name == "record":
            p.add_argument("--glb")
            p.add_argument("--manifest")
            p.add_argument("--note")
            p.add_argument("--replace", action="store_true")
    a = ap.parse_args()
    if a.step != "rooms" and not re.fullmatch(r"[A-Za-z0-9_]+", a.room):
        ap.error("the room id is a scene id (letters, digits, _): " + a.room)
    a.golden = os.path.abspath(a.golden) if a.golden else GOLDEN
    if a.step == "bake":
        if not a.out:
            ap.error("bake needs --out (regress_bake.sh's folder)")
        a.out = os.path.abspath(a.out)
    {"plan": plan, "verdict": verdict, "record": record, "rooms": rooms, "stamp": stamp, "bake": bake}[a.step](a)


if __name__ == "__main__":
    main()
