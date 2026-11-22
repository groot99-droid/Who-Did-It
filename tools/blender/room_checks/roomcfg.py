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
    """The room's check file: optional since G2b ({} when there is none; see `optional`)."""
    return optional(path)


# the owner's look rules (decision D7): no name or extra in a room's GLB holds one of these, in any letter case. The
# chapel's bell rope, the fisher's nets and a cellar's torch stay as objects; their names must still pass this scan.
BANNED = ("crepe", "crape", "georgette", "gallows", "noose", "rope", "torch", "sconce")
SIDES = "NESW"


def strip_allowed(text, allowed):
    """An extra's value with every allowed scene id taken out, before the banned-word scan: a scene id the owner's
    rule lets stand in the game's own data (decision D7: the cellar's single torches, `cl.lt_torch_*`) may be carried
    as a light's or a glow's `wdi_light_id` / `wdi_id`, while every node name still passes the scan. Names and extra
    keys are never stripped."""
    out = str(text)
    for a in sorted(allowed, key=len, reverse=True):
        out = out.replace(a, "")
    return out



def read_json(path, what):
    """A JSON file the checks need (the manifest, the scene); a missing one stops the check: no number is guessed."""
    if not os.path.exists(path):
        raise SystemExit(f"no {what} {shown(path)}")
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def manifest(path):
    return read_json(path, "builder's manifest")


def scene(path):
    return read_json(path, "scene file")


def optional(path):
    """The room's check file, optional since G2b: its judgements (known_fails, the browser's sweep points) and, for a
    manifest written before G2b, the numbers that manifest does not carry. {} when there is none."""
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def need(cfg, key, path):
    if key not in cfg:
        raise SystemExit(f"the manifest has no field for this and the check file {shown(path)} has no `{key}`: "
                         "rebuild the room with the current builder")
    return cfg[key]


class Facts:
    """What the checks know of a room: the builder's manifest and the game's scene first, the check file only where an
    older manifest has no field for it (a manifest without `openings` was written before G2b: the check file's door
    and window then stand in, as they did for the bedroom). Metres in the room's frame (x east, y north, z up, the
    floor's centre on the origin). An opening is a dict: id, kind (door, window, ...), side (N, E, S, W), a and b (its
    span along the wall: x on the N and S walls, y on the E and W walls), z0 and z1, portal, the scans' spans `search`
    and `cracks` ([u0, u1, z0, z1]) and `eyes` (the cracks scan's eye points as [u, metres in from the wall, z]; derived
    from the reach grid when None)."""

    def __init__(self, A):
        self.scene = scene(A.scene)
        self.man = manifest(A.manifest)
        self.cfg = optional(A.config)
        sc, man, cfg = self.scene, self.man, self.cfg
        self.sid, self.pfx = sc["id"], sc["prefix"]
        self.wt, self.ht = sc["size"]["w"], sc["size"]["h"]
        b = (man.get("bounds") or {}).get("room")
        if b:
            self.fx0, self.fy0, _, self.fx1, self.fy1, self.ceil = (float(v) for v in b)
        else:
            self.fx0, self.fx1 = -(self.wt - 2) / 2.0, (self.wt - 2) / 2.0
            self.fy0, self.fy1 = -(self.ht - 2) / 2.0, (self.ht - 2) / 2.0
            self.ceil = float(need(cfg, "ceiling_m", A.config))
        self.legacy = man.get("openings") is None
        self.openings = self._legacy_openings(A) if self.legacy else [self._opening(e) for e in man["openings"]]
        self.doors = [e for e in self.openings if e["kind"] == "door" and e.get("a") is not None]
        self.windows = [e for e in self.openings if e["kind"] == "window" and e.get("search")]
        self.no_color0 = man["noColor0"] if man.get("noColor0") is not None else need(cfg, "no_color0", A.config)
        self.banned = tuple(dict.fromkeys(BANNED + tuple(w.lower() for w in cfg.get("banned_words", ()))))
        self.known_fails = cfg.get("known_fails", [])
        # the scene ids whose banned word the owner allows in an extra's value (strip_allowed): the check file's
        self.allowed_ids = tuple(str(x) for x in cfg.get("allowed_ids", ()))

    # ------------------------------------------------------------------ the walls
    def plane(self, side):
        return {"N": self.fy1, "S": self.fy0, "E": self.fx1, "W": self.fx0}[side]

    @staticmethod
    def inward(side):
        """The unit vector (x, y) from the wall into the room."""
        return {"N": (0.0, -1.0), "S": (0.0, 1.0), "E": (-1.0, 0.0), "W": (1.0, 0.0)}[side]

    def point(self, side, u, d, z):
        """A point by side's wall: u along it, d metres in front of its inner face (negative: in the wall or beyond
        it), z up."""
        nx, ny = self.inward(side)
        w = self.plane(side) + d * (nx if side in "EW" else ny)
        return (w, u, z) if side in "EW" else (u, w, z)

    def outward(self, side):
        nx, ny = self.inward(side)
        return (-nx, -ny, 0.0)

    @staticmethod
    def along_axis(side):
        return (0.0, 1.0, 0.0) if side in "EW" else (1.0, 0.0, 0.0)

    @staticmethod
    def along(side, p):
        """A point's coordinate along side's wall."""
        return p[1] if side in "EW" else p[0]

    def depth(self, side, p):
        """How far a point lies beyond side's inner face (out of the room); negative inside the room."""
        return {"N": p[1] - self.fy1, "S": self.fy0 - p[1], "E": p[0] - self.fx1, "W": self.fx0 - p[0]}[side]

    def span(self, side):
        """The wall's inner face, end to end along it."""
        return (self.fy0, self.fy1) if side in "EW" else (self.fx0, self.fx1)

    def tile_centre(self, tx, ty):
        return self.fx0 + (tx - 1) + 0.5, self.fy1 - (ty - 1) - 0.5

    # ------------------------------------------------------------------ openings
    def _opening(self, e):
        o = dict(id=e["id"], kind=e["kind"], side=e["side"], a=e.get("a"), b=e.get("b"), z0=e.get("z0"),
                 z1=e.get("z1"), portal=e.get("portal"), style=e.get("style"), eyes=None,
                 well=None if (e.get("flight") or {}).get("up") else (e.get("flight") or {}).get("well"),
                 hole=(e.get("flight") or {}).get("well") if (e.get("flight") or {}).get("up") else None,
                 shaft=self._shaft(e.get("flight")))
        if o["side"] not in SIDES or o["a"] is None or o["z1"] is None:
            return o                                       # a hatch in the floor, a marker: no wall scan
        lo, hi = self.span(o["side"])
        m = 0.35 if o["kind"] == "door" else 0.65
        u0, u1 = o["a"] - m, o["b"] + m
        for x in self.man["openings"]:                     # never into a neighbour on the same wall: half the gap
            if x is e or x.get("side") != o["side"] or x.get("a") is None:
                continue
            if x["b"] <= o["a"]:
                u0 = max(u0, (x["b"] + o["a"]) / 2)
            elif x["a"] >= o["b"]:
                u1 = min(u1, (o["b"] + x["a"]) / 2)
        u0, u1 = max(u0, lo + 0.02), min(u1, hi - 0.02)
        z0 = o["z0"] or 0.0
        if o["kind"] == "door":
            o["search"] = [u0, u1, 0.0025, min(o["z1"] + 0.45, self.ceil - 0.05)]
            o["cracks"] = [o["a"] - 0.2, o["b"] + 0.2, -0.02, min(o["z1"] + 0.25, self.ceil - 0.02)]
        else:
            o["search"] = [u0, u1, max(z0 - 0.45, 0.02), min(o["z1"] + 0.5, self.ceil - 0.05)]
            o["cracks"] = [o["a"] - 0.2, o["b"] + 0.2, max(z0 - 0.2, 0.02), min(o["z1"] + 0.2, self.ceil - 0.02)]
        return o

    @staticmethod
    def _shaft(fl):
        """A stairs flight's shaft (G12) as [x0, y0, x1, y1, z0, z1]: a flight down's well run on under the floor
        along `dir` to the end of its steps, from its bottom to the floor (z 0); a flight up's hole in the ceiling run
        on along `dir` to the end of its steps, from the ceiling (the flight's collision box's top) to its cap; None
        for no flight (the manifest's opening row carries the loader's flight)."""
        if not fl:
            return None
        x0, y0, x1, y1 = fl["well"]
        run, d = fl["steps"][-1][1], fl["dir"]
        end = fl["head"] + (run if d in ("N", "E") else -run)
        z0, z1 = (fl["box"][5], fl["top"]) if fl.get("up") else (fl["bottom"], 0.0)
        if d in ("N", "S"):
            y0, y1 = min(y0, y1, end), max(y0, y1, end)
        else:
            x0, x1 = min(x0, x1, end), max(x0, x1, end)
        return [x0, y0, x1, y1, z0, z1]

    def _legacy_openings(self, A):
        """A manifest written before G2b: the check file's door and window (the bedroom's; its door is the scene's
        first portal)."""
        cfg = self.cfg
        d, w = need(cfg, "door", A.config), need(cfg, "window", A.config)
        po = self.scene["portals"][0]
        cx, cy = self.tile_centre(po["x"], po["y"])
        c = cy if d["wall"] in "EW" else cx
        hw = d["width_m"] / 2
        door = dict(id=po["id"], kind="door", side=d["wall"], a=c - hw, b=c + hw, z0=0.0, z1=d["height_m"],
                    portal=po["id"], style=None, search=[c - 0.8, c + 0.8, 0.0025, 2.6], eyes=None,
                    cracks=[c - 0.65, c + 0.65, -0.02, 2.40])
        s, k = w["search"], w["cracks"]
        win = dict(id="window", kind="window", side=w["wall"], a=None, b=None, z0=None, z1=None, portal=None,
                   style=None, search=[s["x"][0], s["x"][1], s["z"][0], s["z"][1]],
                   cracks=[k["x"][0], k["x"][1], k["z"][0], k["z"][1]], eyes=[list(e) for e in k["eyes"]])
        return [door, win]

    def named(self, base, o, many):
        """A check's name for one opening: the bedroom's own name when the room has one of that kind, else one name
        per opening (the opening's id after the name)."""
        return base if len(many) == 1 else f"{base}:{o['id']}"


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
