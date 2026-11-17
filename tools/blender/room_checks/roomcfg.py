"""Shared by the room checks: the arguments every check takes, their defaults from the repo root, and the room's own
numbers (rooms/<roomId>.json). Plain Python, no bpy: the same module runs inside Blender and outside it.

    <check>.py <roomId> [--glb F] [--blend F] [--scene F] [--manifest F] [--out DIR] [--config F] [--quick]

    roomId      the scene id, e.g. widow_bedroom
    --glb       the room's GLB                  default tools/blender/build/rooms/<roomId>.glb
    --blend     the room's .blend               default tools/blender/build/rooms/<roomId>.blend
    --scene     the game's scene file           default packages/content/data/scenes/<roomId>.json
    --manifest  the builder's manifest          default tools/blender/build/rooms/<roomId>.json
    --out       the folder the results go to    default tools/blender/build/rooms/checks/<roomId>/ (git-ignored;
                                                <roomId>_quick/ with --quick)
    --config    the room's own numbers          default tools/blender/room_checks/rooms/<roomId>.json
    --quick     cc_geom.py's coarse run

Every check takes the same list and ignores what it does not read, so run.sh passes one list to all of them. Under
Blender the list is what follows `--`. Run as a script, this file prints the resolved list, one value a line in the
order of ORDER (run.sh reads it).
"""
import argparse
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", "..", ".."))
ORDER = ("room", "glb", "blend", "scene", "manifest", "out", "config", "quick")


def shown(path):
    """A path as the results record it: from the repo root when it lies inside the repo, with forward slashes."""
    p = os.path.abspath(path)
    try:
        rel = os.path.relpath(p, ROOT)
    except ValueError:                                     # another drive
        rel = None
    if rel is not None and rel != os.pardir and not rel.startswith(os.pardir + os.sep):
        p = rel
    return p.replace("\\", "/")


def argv():
    """The check's own arguments: what follows `--` under Blender, else the whole command line."""
    a = sys.argv
    return a[a.index("--") + 1:] if "--" in a else a[1:]


def parse(args=None):
    ap = argparse.ArgumentParser(prog=os.path.basename(sys.argv[0]), description="A room check; see roomcfg.py.")
    ap.add_argument("room")
    ap.add_argument("--glb")
    ap.add_argument("--blend")
    ap.add_argument("--scene")
    ap.add_argument("--manifest")
    ap.add_argument("--out")
    ap.add_argument("--config")
    ap.add_argument("--quick", action="store_true")
    a = ap.parse_args(argv() if args is None else args)
    if not re.fullmatch(r"[A-Za-z0-9_]+", a.room):
        ap.error("the room id is a scene id (letters, digits, _): " + a.room)
    rooms = os.path.join(ROOT, "tools", "blender", "build", "rooms")
    a.glb = a.glb or os.path.join(rooms, a.room + ".glb")
    a.blend = a.blend or os.path.join(rooms, a.room + ".blend")
    a.manifest = a.manifest or os.path.join(rooms, a.room + ".json")
    a.scene = a.scene or os.path.join(ROOT, "packages", "content", "data", "scenes", a.room + ".json")
    a.out = a.out or os.path.join(rooms, "checks", a.room + ("_quick" if a.quick else ""))
    a.config = a.config or os.path.join(HERE, "rooms", a.room + ".json")
    return a


def load(path):
    """The room's own numbers. A missing file stops the check: no number is guessed."""
    if not os.path.exists(path):
        raise SystemExit("no room file " + shown(path) + ": the checks read the room's own numbers from it")
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def need_walls(room, who):
    """The door and window scans are written for the bedroom's walls: a door in the south wall, a window in the north
    wall. Another room file stops here, before a scan measures the wrong wall."""
    d, w = room["door"]["wall"], room["window"]["wall"]
    if (d, w) != ("S", "N"):
        raise SystemExit(f"{who} scans a door in the south wall and a window in the north wall; the room file says "
                         f"{d} and {w}")


def tag(x):
    """A number as a check's name carries it: 0.9 -> 0_9, 2.15 -> 2_15, 2 -> 2."""
    return f"{x:g}".replace(".", "_")


def cc_geom_head(until):
    """cc_geom.py's sections above the one named `until`, run in a namespace of their own (cc_cracks.py and r7_extra.py
    reuse its GLB decode this way). Returns that namespace."""
    path = os.path.join(HERE, "cc_geom.py")
    with open(path, encoding="utf-8") as fh:
        src = fh.read()
    m = re.search(r"^# -{20,} " + re.escape(until) + "$", src, re.M)
    if not m:
        raise SystemExit("cc_geom.py has no section named '" + until + "'")
    ns = {"__file__": path, "__name__": "cc_geom_head"}
    exec(compile(src[:m.start()], path, "exec"), ns)
    return ns


if __name__ == "__main__":
    A = parse()
    rows = [A.room] + [shown(getattr(A, k)) for k in ORDER[1:-1]] + ["--quick" if A.quick else ""]
    sys.stdout.buffer.write(("\n".join(rows) + "\n").encode("utf-8"))
