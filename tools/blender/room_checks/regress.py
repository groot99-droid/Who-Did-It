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
FIELDS = ("light", "layout", "vertices", "triangles", "glbBytes")     # what a golden row says of its GLB besides md5
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
    lines = []

    def some(names):
        return ", ".join(names[:limit]) + (f" and {len(names) - limit} more" if len(names) > limit else "")

    for kind in ("nodes", "meshes", "materials", "images"):
        a, b = A[kind], B[kind]
        new, gone = sorted(set(a) - set(b)), sorted(set(b) - set(a))
        changed = [n for n in a if n in b and a[n] != b[n]]
        if not (new or gone or changed):
            lines.append(f"{kind}: all {len(b)} the same")
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
    return lines


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
        say.append(f"regress {a.room}: FAILED. The rebuild did not finish (Blender's exit code {a.build_exit}"
                   + (", not written: " + ", ".join(missing) if missing else "") + "), so nothing was compared.")
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
        got = dict(glbMd5=file_md5(glb), glbBytes=os.path.getsize(glb), light=(m.get("light") or {}).get("setting"),
                   layout=m.get("layout"), vertices=(m.get("counts") or {}).get("vertices"),
                   triangles=(m.get("counts") or {}).get("triangles"))
        src = m.get("source") or {}
        raw_md5 = (src.get("raw") or {}).get("fileMd5")        # the bake the build says it was made from
        res.update(built=got, rawMd5=raw_md5, source={k: src.get(k) for k in (
            "scriptMd5", "roomMd5", "roomBakeMd5", "lookMd5", "lookBakeMd5", "kitMd5", "rawAgrees")})
        off = [k for k in FIELDS if got[k] != row[k]]
        same = got["glbMd5"] == row["glbMd5"]
        res["verdict"] = "match" if same and not off else "mismatch"
        res["fieldsThatDiffer"] = off
        when = f"recorded {row.get('recorded')}" if row.get("recorded") else "no date recorded"

        def num(v):
            return f"{v:,}" if isinstance(v, int) and not isinstance(v, bool) else str(v)

        if same and not off:
            say.append(f"regress {a.room}: MATCH. The rebuilt GLB is the golden one, byte for byte.")
            say.append(f"  glb md5    {got['glbMd5']}  ({got['glbBytes']:,} bytes; golden {when})")
            say.append(f"  built      light {got['light']}, layout {got['layout']}, {num(got['vertices'])} vertices, "
                       f"{num(got['triangles'])} triangles")
        else:
            if same:
                say.append(f"regress {a.room}: MISMATCH in the golden row. The rebuilt GLB has the golden md5, but "
                           f"the row's {', '.join(off)} do not describe it: write the row again from the build "
                           "(regress.py record --replace).")
            else:
                say.append(f"regress {a.room}: MISMATCH. The rebuilt GLB is not the golden one.")
            say.append(f"  glb md5    {got['glbMd5']}  ({got['glbBytes']:,} bytes)")
            say.append(f"  golden     {row['glbMd5']}  ({row['glbBytes']:,} bytes; {when})")
            for k in ("light", "layout", "vertices", "triangles"):
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
            say.append("  A change to shared builder code must leave a finished room as it was: find what changed it. "
                       "Only when the room itself was changed on purpose and has passed its checks again is the row "
                       f"replaced: python tools/blender/room_checks/regress.py record {a.room} --replace")
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
    gold = load_golden(a.golden) if os.path.isfile(a.golden) else {"rooms": {}}
    rows = gold.setdefault("rooms", {})
    try:
        row = dict(glbMd5=file_md5(glb), glbBytes=size, light=m["light"]["setting"], layout=m["layout"],
                   vertices=m["counts"]["vertices"], triangles=m["counts"]["triangles"], raw=os.path.basename(raw),
                   rawMd5=raw_md5, recorded=time.strftime("%Y-%m-%d"))
    except (KeyError, TypeError):
        stop(2, f"{shown(manifest)} lacks light.setting, layout or counts: not a manifest of meshy_room_build.py")
    if a.note:
        row["note"] = a.note
    old = rows.get(a.room)
    if old and not a.replace:
        if old.get("glbMd5") == row["glbMd5"]:
            stop(2, f"{a.room}'s golden row already holds this GLB (md5 {row['glbMd5']}); nothing written")
        stop(2, f"{a.room} already has a golden row (glb md5 {old.get('glbMd5')}, recorded {old.get('recorded')}). "
                "It is replaced only when the room was changed on purpose and has passed its checks again: --replace")
    rows[a.room] = row
    with open(a.golden, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(gold, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    print(f"regress: {a.room}'s golden row written to {shown(a.golden)}: glb md5 {row['glbMd5']}, light "
          f"{row['light']}, layout {row['layout']}, {row['vertices']:,} vertices, {row['triangles']:,} triangles, "
          f"saved bake {row['raw']} (md5 {row['rawMd5']}). Now run: bash tools/blender/room_checks/regress.sh {a.room}")


def rooms(a):
    ids = sorted(load_golden(a.golden).get("rooms") or {})
    sys.stdout.buffer.write("".join(i + "\n" for i in ids).encode("utf-8"))


def main():
    ap = argparse.ArgumentParser(prog="regress.py", description="The room regression gate; see the file's head.")
    sub = ap.add_subparsers(dest="step", required=True)
    for name in ("plan", "verdict", "record", "rooms"):
        p = sub.add_parser(name)
        p.add_argument("--golden")
        if name == "rooms":
            continue
        p.add_argument("room")
        p.add_argument("--raw")
        if name != "record":
            p.add_argument("--out")
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
    {"plan": plan, "verdict": verdict, "record": record, "rooms": rooms}[a.step](a)


if __name__ == "__main__":
    main()
