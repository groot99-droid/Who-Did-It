"""The room checks' last step: one summary of what the chain found, and the chain's exit code. No Blender.

Usage: python summary.py <roomId> [--glb F] [--out DIR] [--config F] [--quick]                      (roomcfg.py)
       python summary.py <roomId> ... --stamp before|after

--stamp writes the GLB's md5 to <out>/glb.md5 (before) or <out>/glb_after.md5 (after), as run.sh does round the chain:
the checks are read-only and the two must agree. Without it, reads the six result files in <out> and run.sh's
<out>/steps.tsv (step, exit code, seconds; `skipped` for a step --quick leaves out) and writes <out>/summary.json: per
script whether it ran and passed, its named checks, its failed ones, a few counts and the file it wrote. A fail the
room file lists under known_fails is marked known. Any fail, a script that did not run, a missing result or a GLB
that changed ends with exit code 1; otherwise 0. cc_display.py has no pass or fail of its own: it counts.
"""
import hashlib
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import roomcfg  # noqa: E402

SCRIPTS = (
    ("cc_struct", "the GLB's structure against the walk contract"),
    ("cc_geom", "the shell, the door and the window, collision, reach, ray fans, the bake data"),
    ("cc_cracks", "see-through scans at the door, the window and the room's edges"),
    ("cc_display", "what the viewer shows at every visible vertex, against ink"),
    ("cc_blend", "the .blend, built for a plain append"),
    ("r7_extra", "climbing, the eye, pockets, the approach to spots and props, the flame, names, pieces"),
)


def md5(path):
    h = hashlib.md5()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def read_md5(path):
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as fh:
        return fh.read().split()[0]


def pick(d, *path):
    for k in path:
        if not isinstance(d, dict) or k not in d:
            return None
        d = d[k]
    return d


def counts(name, d):
    """A few numbers of each result, for the summary's reader; the result file has the rest."""
    if name == "cc_struct":
        t = d.get("totals", {})
        c = {k: t.get(k) for k in ("bytes", "nodes", "primitives", "materials", "images", "textures", "triangles_room",
                                   "vertices")}
        c["lights"] = len(d.get("lights", []))
        return c
    if name == "cc_geom":
        return dict(primitives=pick(d, "decode", "primitives"), vertices=pick(d, "decode", "vertices"),
                    triangles=pick(d, "decode", "triangles"), collision_boxes=len(pick(d, "collision", "boxes") or []),
                    reach_cells=pick(d, "reach", "cells"), reach_m2=pick(d, "reach", "area_m2"),
                    reach_floor_share=pick(d, "reach", "floor_share"), walk_tiles=pick(d, "walk_tiles", "total"),
                    tiles_stood_on=pick(d, "walk_tiles", "stand_anywhere"),
                    tile_centres_reached=pick(d, "walk_tiles", "centre_reached"), fan_rays=pick(d, "fans", "rays"),
                    color0_vertices=pick(d, "color0", "vertices"),
                    visible_vertices=pick(d, "color0", "visible_vertices"),
                    visible_black_vertices=pick(d, "color0", "visible_black_vertices"))
    if name == "cc_cracks":
        return {k: dict(rays=pick(d, k, "rays"), void=pick(d, k, "void")) for k in ("door", "window", "room_edges")}
    if name == "cc_display":
        c = {k: d.get(k) for k in ("exposure", "ink_luma", "vertices", "visible", "visible_interior")}
        for lab in ("own_texel", "dark_texel_p3", "dark_texel_p1"):
            c["under_ink_" + lab] = pick(d, lab + ":interior", "under_ink")
        c["darkest_own_texel"] = pick(d, "own_texel:interior", "min")
        return c
    if name == "cc_blend":
        return dict(objects=d.get("objects_by_type"), lights=len(d.get("lights", [])),
                    datablocks={k: v for k, v in (d.get("datablocks") or {}).items() if v})
    if name == "r7_extra":
        return dict(pockets=len(d.get("pockets", [])), spots_and_props=len(d.get("approach", [])),
                    piece_intersections=len(d.get("piece_intersections", [])),
                    objects_resting=len(d.get("resting", [])))
    return {}


def main():
    argv = roomcfg.argv()
    stamp = None
    if "--stamp" in argv:
        i = argv.index("--stamp")
        stamp = argv[i + 1]
        argv = argv[:i] + argv[i + 2:]
    A = roomcfg.parse(argv)
    os.makedirs(A.out, exist_ok=True)
    if stamp:
        name = {"before": "glb.md5", "after": "glb_after.md5"}[stamp]
        with open(os.path.join(A.out, name), "w", encoding="utf-8", newline="\n") as fh:
            fh.write(f"{md5(A.glb)} *{roomcfg.shown(A.glb)}\n")
        return 0

    room = roomcfg.load(A.config)
    known = {k["check"] for k in room.get("known_fails", [])}
    steps = {}
    tsv = os.path.join(A.out, "steps.tsv")
    if os.path.exists(tsv):
        with open(tsv, encoding="utf-8") as fh:
            for line in fh:
                part = line.rstrip("\r\n").split("\t")
                if len(part) == 3:
                    steps[part[0]] = part[1:]
    before, after = read_md5(os.path.join(A.out, "glb.md5")), read_md5(os.path.join(A.out, "glb_after.md5"))
    S = dict(room=A.room, quick=bool(A.quick), glb=roomcfg.shown(A.glb), glb_md5=before, glb_md5_after=after,
             glb_unchanged=None if before is None or after is None else before == after, scripts=[])
    fails, broken = [], []
    for name, what in SCRIPTS:
        path = os.path.join(A.out, name + ".json")
        e = dict(script=name, about=what, file=roomcfg.shown(path), log=roomcfg.shown(path[:-5] + ".log"))
        code, secs = steps.get(name, (None, None))
        if code == "skipped":
            e.update(ran=False, skipped="--quick")
            e["pass"] = None
            S["scripts"].append(e)
            continue
        e["exit"] = None if code is None else int(code)
        e["seconds"] = None if secs is None else float(secs)
        d = None
        if os.path.exists(path):
            with open(path, encoding="utf-8") as fh:
                d = json.load(fh)
        e["ran"] = d is not None and e["exit"] in (None, 0)
        if not e["ran"]:
            e["pass"] = False
            e["problem"] = "no result file" if d is None else f"exit code {e['exit']}"
            broken.append(name)
            S["scripts"].append(e)
            continue
        if "checks" in d:
            e["checks"] = {k: bool(v["ok"]) for k, v in d["checks"].items()}
            e["failed"] = [k for k, ok in e["checks"].items() if not ok]
            e["pass"] = not e["failed"]
            fails += [f"{name}:{k}" for k in e["failed"]]
        elif "pass" in d:
            e["pass"] = bool(d["pass"])
            e["failed"] = [] if e["pass"] else [name]
            fails += [f"{name}:{k}" for k in e["failed"]]
        else:
            e["pass"] = None                               # cc_display: counts, no verdict of its own
        e["counts"] = counts(name, d)
        S["scripts"].append(e)
    S["fails"] = [dict(check=f, known=f in known) for f in fails]
    S["fails_new"] = [f for f in fails if f not in known]
    S["did_not_run"] = broken
    S["pass"] = not fails and not broken and S["glb_unchanged"] is not False
    out = os.path.join(A.out, "summary.json")
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(S, fh, indent=1)
        fh.write("\n")

    print(f"room {A.room}{' (quick)' if A.quick else ''}: {S['glb']}, md5 {before}"
          + ("" if S["glb_unchanged"] is None else ", unchanged by the checks" if S["glb_unchanged"] else
             ", CHANGED during the checks"))
    for e in S["scripts"]:
        if e.get("skipped"):
            print(f"  {e['script']:<10} skipped ({e['skipped']})")
        elif not e["ran"]:
            print(f"  {e['script']:<10} DID NOT RUN: {e['problem']}; see {e['log']}")
        elif "checks" in e:
            n = len(e["checks"])
            bad = ", ".join(k + (" (known)" if f"{e['script']}:{k}" in known else "") for k in e["failed"])
            print(f"  {e['script']:<10} {'PASS' if e['pass'] else 'FAIL'} {n - len(e['failed'])} of {n}"
                  + (": " + bad if bad else ""))
        elif e["pass"] is None:
            c = e["counts"]
            print(f"  {e['script']:<10} counted: {c.get('under_ink_own_texel')} of {c.get('visible_interior')} visible "
                  f"interior vertices under ink at their own texel, {c.get('under_ink_dark_texel_p3')} at the 3rd "
                  f"percentile texel")
        else:
            c = e["counts"]
            print(f"  {e['script']:<10} {'PASS' if e['pass'] else 'FAIL'}: "
                  + ", ".join(f"{k} {v['void']} void of {v['rays']} rays" for k, v in c.items()))
    if S["pass"]:
        print(f"PASS -> {roomcfg.shown(out)}")
    else:
        why = []
        if fails:
            why.append(f"{len(fails)} failed ({len(fails) - len(S['fails_new'])} known, {len(S['fails_new'])} new)")
        if broken:
            why.append("did not run: " + ", ".join(broken))
        if S["glb_unchanged"] is False:
            why.append("the GLB changed")
        print(f"FAIL: {'; '.join(why)} -> {roomcfg.shown(out)}")
    return 0 if S["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
