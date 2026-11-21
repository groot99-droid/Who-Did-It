"""The first-person rooms' own files (`meshy_rooms/<sceneId>.json`): their loader, their rules and the reading the builder
takes from them (room file v2). Plain Python, standard library only, so the builder, the checks, the exporter and the
tests read a room the same way without Blender.

    python tools/blender/meshy_room_file.py <roomId> [--room-file F] [--layout NAME] [--explain] [--json]

prints what the file means against its scene (`--explain`: the openings, the lights and their groups, the exposure's
lights, the flame hosts, where every scene prop and spot went, the pieces' reference points, the planned node names),
or with neither flag only whether it loads. Exit code 0 when it does; a broken file stops with a plain message.

Two layers, kept apart because a saved bake records the md5 of the room's data (`bake_room_md5`):

- `load_room` returns the file's data as the builder has always had it (notes dropped, arrays as tuples, `pieces` a
  list) and holds the file's keys to the rules: every key a known one at every level (R0.1, R0.1b), comments (R0.7),
  the openings given one way (R0.2, R0.2b). It never writes a default into that data.
- `derive(row, scene)` reads it against the scene (`packages/content/data/scenes/<id>.json`) into a separate `RoomSpec`
  (a plain dict), after the rules on the values (no magenta or lilac, R0.3; the trims, R-S2; the pieces' ids,
  places, models and grey boxes, R-P1, R-P3 to R-P5, R-N2) and the scene's (the rest): the path (`legacy` for a file with `door` and `window`, `v2` for one with `openings`), the openings,
  the night lights with their roles, anchors and bake groups, the lights that set the exposure, the flame hosts, the
  coverage map (every scene prop and spot: a piece, an opening, covered by a piece, the under-bed spot of a bed, or
  skipped), the under-bed map, each piece's place with a `null` taken from the scene and its reference point, the task
  pieces and spots the owner is shown, the planned node names, and what the builder does not build yet (`pending`).

The rules' ids are those of the design (room_file_v2.md); each message starts `meshy_room_build: <file>: `.
"""
from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
ROOMS_DIR = os.path.join(HERE, "meshy_rooms")
SCENES_DIR = os.path.join(ROOT, "packages", "content", "data", "scenes")
TASKS_FILE = os.path.join(ROOT, "packages", "content", "data", "tasks.json")

# what the builder reads without a default; `door`, `window`, `outside` and `moon` only on the legacy path
ROOM_KEYS = ("district", "spawn_labels", "height", "wall_t", "floor", "wall_colour", "ceiling_colour", "paint_colour",
             "wood_colour", "skirting", "picture_rail", "cornice", "door", "window", "outside", "moon", "pieces",
             "views")
LEGACY_ONLY = ("door", "window", "outside", "moon")
# R0.1: every top-level key (`export` is reserved for the exporter: copied into the manifest, read by no builder)
TOP_KEYS = frozenset(ROOM_KEYS) | {"room", "about", "layout", "layouts", "exposure", "candle", "fill", "emit_display",
                                   "export", "openings", "lights", "exposure_from", "look", "light", "skip"}
# R0.1b: the keys of the objects whose keys the builder reads
PIECE_KEYS = frozenset("id spot key face place spec sheets cloth dress_lod lift bedding gap rise decor covers moved "
                       "name".split())
SPEC_KEYS = frozenset("model slug name scale tall size kmax lod extras dress doors mirror bed centre drop sheets rot "
                      "wall drape head label finish anchors glow style opening surface mantel breast firebox beam "
                      "seats".split())
OPENING_KEYS = frozenset("id kind portal prop side in at width height style knob sill head panes rod curtains swag "
                         "curtain_colour outside foot flight hatch".split())
LIGHT_KEYS = frozenset("id role anchor z group power color radius glow window pool name".split())
ANCHOR_KEYS = frozenset("piece name offset at wall along out z".split())
GLOW_KEYS = frozenset("shape size material at".split())
MOON_KEYS = frozenset("azimuth bearing elevation strength color angle".split())
OUTSIDE_KEYS = frozenset("ground fence_y houses trees lit_window gain meshy".split())
LOOK_KEYS = frozenset("lights settings exposure ink_lift hot ao emit_display outside black_cloth linen".split())
LOOK_NOT_OVERRIDABLE = frozenset(("ink", "view", "bake"))     # R-K2
# a data map: its keys are ids or names, not schema keys (no strict keys, no R0.7 in it)
DATA_MAPS = ("spawn_labels", "views", "layouts", "skip", "emit_display", "doors", "dress_lod", "anchors")

MODELS = ("ph", "meshy", "rug", "photos", "box", "hearth")     # R-P5: the builders' models
# a box's finishes: the grey of a piece with no model, and the room's joinery wood (a beam, a rafter: G11's first part)
BOX_FINISHES = ("grey", "wood")
BUILT_MODELS = ("ph", "meshy", "rug", "photos", "box", "hearth")   # what the builder builds today
# the hearth (G6, room_file_v2 section 6): its styles (R-H1), the two built first (the inglenook and the stove come
# with the tavern), each style's default surface, the surfaces the builder has (brick waits for G11's fetch), the
# mirrors whose glass and cloth the builder knows (R-H3) and their height at scale 1 (R-H5)
HEARTH_STYLES = ("surround", "stone", "inglenook", "stove")
HEARTH_BUILT = ("surround", "stone")
HEARTH_SURFACE = {"surround": "marble", "stone": "stone", "inglenook": "brick", "stove": "iron"}
SURFACES = ("marble", "stone", "brick", "iron")
SURFACES_BUILT = ("marble", "stone", "iron")
MIRROR_H = {"ornate_mirror_01": 0.744}
MANTEL_KEYS = frozenset("z depth overhang thickness".split())
BREAST_KEYS = frozenset("width depth to".split())
FIREBOX_KEYS = frozenset("depth glow".split())
DRESS_KEYS = frozenset("slug scale at lod rot cloth model size label".split())
# a bed object (G7, section 7): its keys, the kinds built (cot, iron and pallet are G20's), the pillows each holds
BED_KEYS = frozenset("kind axis head cover pillows mattress colour".split())
BED_BUILT = ("gothic", "day")
BED_PILLOWS = {"gothic": 2, "day": 3}
BED_COVERS = ("coverlet", "blanket", "none")
KINDS = ("door", "window", "stairs", "hatch", "drop")          # R-O1
MARKERS = ("stairs", "hatch", "drop")
SIDES = ("N", "E", "S", "W")
KNOB_ENDS = {"N": "EW", "S": "EW", "E": "NS", "W": "NS"}       # R-O2b: the ends of an opening seen from inside
KNOB_DEFAULT = {"S": "E", "E": "N", "N": "W", "W": "S"}        # the end at the higher wall coordinate s
DOOR_STYLES, WINDOW_STYLES = ("panel",), ("sash",)             # R-O8: what the builder has
# a visible flight down from a stairs marker (G12, first part: apoth_loft): a well cut in the floor, steps descending
# from its head edge toward `dir` and on under the floor for `under` metres, a lined shaft, a balustrade on the open
# edges (R-F1 to R-F8)
FLIGHT_KEYS = frozenset("well dir riser tread under rail rail_h up base over".split())
FLIGHT_DEFAULTS = dict(riser=0.22, tread=0.22, under=1.0, rail_h=0.9)
# a flight up (G12, second part: apoth_shop): `up` true, `well` the hole in the ceiling, steps rising from `base` (the
# first riser's line, default the wall opposite `dir`) toward `dir`, through the hole and on above the ceiling for
# `over` metres into a lined shaft; the open sides closed by a stepped string down to the floor (R-F9 to R-F12)
FLIGHT_UP_DEFAULTS = dict(riser=0.22, tread=0.22, over=1.0)
HEAD_CLEAR = 2.0          # under the ceiling, a tread of a flight up stands this far under it at least (R-F11)
SHAFT_UP = 2.2            # a flight up's shaft rises this far over its top tread, to its cap
FLOOR_T = 0.25            # the floor's thickness under the boards: the collision slab's, the well's header
STEP_MAX = 0.35           # a step the walker climbs (the viewer's stepHeight)
RAIL_OUT = 0.07           # a balustrade's outer face past the well's edge (its string and handrail)
# a trap hatch in the floor (G12, third part: tavern_back): a plank leaf in a frame lying on the boards, iron strap
# hinges along its `hinge` edge and a ring pull at the other; boarded (shut, walked over) is built, open is later
# (R-T1 to R-T3)
HATCH_KEYS = frozenset("state size hinge".split())
HATCH_STATES = ("boarded", "open")
HATCH_BUILT = ("boarded",)
HATCH_DEFAULTS = dict(state="boarded", size=[0.9, 0.9], hinge="E")
HATCH_FRAME = 0.06        # the frame's width round the leaf
HATCH_CLEAR = 0.3         # the frame's outer edge stands this far from every wall at least
HEADROOM_MIN = 0.5        # the tread under the well's far edge stands this far under the floor's underside
ARCH_W, CURTAIN_W = 0.095, 0.52                                # a door's architrave, a window's curtain, each side
# the default numbers of an opening (the bedroom's own)
DOOR_DEFAULTS = dict(width=0.9, height=2.15, style="panel")
WINDOW_DEFAULTS = dict(width=0.9, sill=0.75, head=2.3, panes=(2, 2), rod=2.44, curtains=True, swag=False,
                       style="sash")
# a window prop (R-O4b): its id without the scene's prefix (coverage.py's WINDOW_TAIL)
WINDOW_TAIL = re.compile(r"^(draped_window(_\d)?|window|shutters|stained_glass(_e)?(_\d)?)$")
BED_KINDS = ("bed", "innBed", "cot")                           # R-B4: scene props a bed spot stands beside
RESERVED_SUFFIXES = ("_flame", "_cloth", "_pillows", "_coverlet", "_linen", "_sheets", "_glow")   # R-N2
# lights (room_file_v2, section 3): the role a scene light takes, the role's bake group and whether its pool may set
# the exposure
ROLE_GROUP = {"lamp": "candle", "lantern": "candle", "wall": "candle", "teal": "candle", "cold": "candle",
              "fire": "fire", "moon": "moon"}
ROLE_POOL = {"lamp": True, "lantern": True, "wall": True, "cold": True, "fire": True, "teal": False, "moon": False}
KIND_ROLE = {"lamp": "lamp", "lantern": "lantern", "torch": "wall", "fire": "fire", "moon": "moon"}
GROUP_ORDER = ("candle", "fire", "moon", "fill")
LEGACY_GROUPS = ("candle", "moon", "fill")                     # the bedroom's saved bake keys its arrays by these
MAX_GROUPS = 5                                                 # R-L6
MOVE_LIMIT = 1.0                                               # R-P7: metres from the reference point (D4)

# the md5s a saved bake records: these keys never reach the bake. A piece's `moved` and a spec's `label` are stripped
# inside `pieces` (PIECE_DROP, SPEC_DROP); `name` and `covers` stay in (a renamed piece is another object name in the
# saved bake, `covers` can set a run's length)
BAKE_LOOK_DROP = ("settings", "ink_lift", "hot", "exposure", "ink", "view", "name", "about")
BAKE_ROOM_DROP = ("district", "spawn_labels", "views", "layout", "layouts", "exposure", "exposure_from", "light",
                  "skip", "look")
PIECE_DROP, SPEC_DROP = ("moved",), ("label",)
SCHEMA = "2"                                                   # source.roomSchema's version of the rules


# ---------------------------------------------------------------- paths and md5s


def from_root(path: str) -> str:
    """A path as a message and the manifest give it: from the repo root with forward slashes, or only its file name
    when it lies outside the repo (a scratch file's absolute path would carry the local user's folders)."""
    full = os.path.abspath(path)
    try:
        rel = os.path.relpath(full, ROOT)
    except ValueError:      # another drive
        return os.path.basename(full)
    if rel == ".." or rel.startswith(".." + os.sep) or os.path.isabs(rel):
        return os.path.basename(full)
    return rel.replace("\\", "/")


def text_md5(path: str) -> str:
    """The md5 of a text file with its line ends made LF: the same on a Windows working tree (CRLF) and in git (LF)."""
    with open(path, "rb") as fh:
        return hashlib.md5(fh.read().replace(b"\r\n", b"\n")).hexdigest()


def text_md5_forms(path: str) -> tuple:
    """The LF and the CRLF md5 of a text file: a saved bake's recorded md5 agrees with the file when it is either."""
    with open(path, "rb") as fh:
        lf = fh.read().replace(b"\r\n", b"\n")
    return hashlib.md5(lf).hexdigest(), hashlib.md5(lf.replace(b"\n", b"\r\n")).hexdigest()


def room_path(scene_id: str, rooms_dir: str | None = None) -> str:
    return os.path.join(rooms_dir or ROOMS_DIR, f"{scene_id}.json")


# ---------------------------------------------------------------- reading the file


def is_note(key: str, obj: dict) -> bool:
    """A comment in a room file: a key named `note`, or `<key>_note` beside `<key>` in the same object."""
    return key == "note" or (key.endswith("_note") and key[:-5] in obj)


def _room_object(pairs: list) -> dict:
    """A JSON object of a room file. A key that stands twice stops the load: JSON would keep the last one and say
    nothing."""
    out = {}
    for k, v in pairs:
        if k in out:
            raise ValueError(f'the key "{k}" stands twice in one object')
        out[k] = v
    return out


def _room_value(x, where: str):
    """A room file's value as the builder uses it: every note dropped, an array a tuple (as the table had them)."""
    if isinstance(x, dict):
        out = {}
        for k, v in x.items():
            if is_note(k, x):
                if not isinstance(v, str):
                    raise SystemExit(f"meshy_room_build: {where}: `{k}` is a comment and must be text")
                continue
            out[k] = _room_value(v, where)
        return out
    if isinstance(x, list):
        return tuple(_room_value(v, where) for v in x)
    return x


class Problems(list):
    """The rules' messages for one file; stop() ends the load with all of them."""

    def __init__(self, shown: str):
        super().__init__()
        self.shown = shown

    def stop(self) -> None:
        if not self:
            return
        if len(self) == 1:
            raise SystemExit(f"meshy_room_build: {self.shown}: {self[0]}")
        raise SystemExit(f"meshy_room_build: {self.shown}: {len(self)} problems:\n  " + "\n  ".join(self))


def _did_you_mean(key: str, allowed) -> str:
    m = difflib.get_close_matches(key, sorted(allowed), n=1, cutoff=0.7)
    return f' (did you mean "{m[0]}"?)' if m else ""


def _strict(obj, allowed, where: str, what: str, bag: Problems) -> None:
    """R0.1b and R0.7 for one object: every key known, and no `<key>_note` left without its `<key>` (load_room has
    dropped every comment, so a key that still ends in `_note` is one whose base key is not beside it)."""
    if not isinstance(obj, dict):
        return
    for k in obj:
        if k.endswith("_note"):
            bag.append(f'{where}.{k}: a comment is "note", or "<key>_note" beside "<key>"; "{k[:-5]}" is not in this '
                       f'object (R0.7)')
        elif k not in allowed:
            bag.append(f'{where}: the key "{k}" is not a {what} key{_did_you_mean(k, allowed)} (R0.1b)')


def _stray_notes(obj, where: str, bag: Problems) -> None:
    """R0.7 at any depth of an object whose nested keys are schema keys (the look)."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k.endswith("_note"):
                bag.append(f'{where}.{k}: a comment is "note", or "<key>_note" beside "<key>"; "{k[:-5]}" is not in '
                           f'this object (R0.7)')
            _stray_notes(v, f"{where}.{k}", bag)
    elif isinstance(obj, (list, tuple)):
        for i, v in enumerate(obj):
            _stray_notes(v, f"{where}[{i}]", bag)


def _hsv(hexc: str):
    h = hexc.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    mx, mn = max(r, g, b), min(r, g, b)
    d = mx - mn
    if d == 0:
        hue = 0.0
    elif mx == r:
        hue = 60.0 * (((g - b) / d) % 6)
    elif mx == g:
        hue = 60.0 * ((b - r) / d + 2)
    else:
        hue = 60.0 * ((r - g) / d + 4)
    return hue, (0.0 if mx == 0 else d / mx), mx


HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")


def lilac(hexc) -> bool:
    """R0.3: hue 265 to 345 degrees with saturation over 0.15 (the owner's rule: no magenta, no lilac)."""
    if not isinstance(hexc, str) or not HEX.match(hexc):
        return False
    h, s, _v = _hsv(hexc)
    return 265.0 <= h <= 345.0 and s > 0.15


def _colours(row: dict) -> list:
    """Every colour of the room's own (walls, ceiling, paint, wood, curtains, the lights' and the look's)."""
    out = [(k, row.get(k)) for k in ("wall_colour", "ceiling_colour", "paint_colour", "wood_colour")]
    w = row.get("window")
    if isinstance(w, dict):
        out.append(("window.curtain_colour", w.get("curtain_colour")))
    for i, o in enumerate(row.get("openings") or ()):
        if isinstance(o, dict):
            out.append((f"openings[{i}].curtain_colour", o.get("curtain_colour")))
    for k in ("candle", "moon", "fill"):
        if isinstance(row.get(k), dict):
            out.append((f"{k}.color", row[k].get("color")))
    for i, lt in enumerate(row.get("lights") or ()):
        if isinstance(lt, dict):
            out.append((f"lights[{i}].color", lt.get("color")))
    for p in row.get("pieces") or ():
        bed = ((p.get("spec") or {}) if isinstance(p, dict) and isinstance(p.get("spec"), dict) else {}).get("bed")
        if isinstance(bed, dict):
            out.append((f"piece {p.get('id')}: bed.colour", bed.get("colour")))
    lk =(row.get("look") or {}) if isinstance(row.get("look"), dict) else {}
    for role, v in (lk.get("lights") or {}).items():
        if isinstance(v, dict):
            out.append((f"look.lights.{role}.color", v.get("color")))
    return [(k, c) for k, c in out if isinstance(c, str)]


def key_rules(row: dict, bag: Problems) -> None:
    """The rules on the file's keys, which load_room holds it to: every key known at every level (R0.1, R0.1b), no
    comment without its key (R0.7), the openings given one way and the legacy rig (R0.2, R0.2b)."""
    for k in row:
        if k.endswith("_note"):
            bag.append(f'{k}: a comment is "note", or "<key>_note" beside "<key>"; "{k[:-5]}" is not in this object '
                       f'(R0.7)')
        elif k not in TOP_KEYS:
            bag.append(f'the key "{k}" is not a room file key{_did_you_mean(k, TOP_KEYS)} (R0.1)')
    pieces = row.get("pieces") or []
    for i, p in enumerate(pieces):
        where = f"pieces[{i}] ({p.get('id')})" if isinstance(p, dict) else f"pieces[{i}]"
        if not isinstance(p, dict):
            bag.append(f"{where}: a piece is an object")
            continue
        _strict(p, PIECE_KEYS, where, "piece", bag)
        _strict(p.get("spec"), SPEC_KEYS, where + ".spec", "spec", bag)
        if isinstance(p.get("spec"), dict):
            sp = p["spec"]
            _strict(sp.get("glow"), GLOW_KEYS, where + ".spec.glow", "glow", bag)
            _strict(sp.get("bed"), BED_KEYS, where + ".spec.bed", "bed", bag)
            if sp.get("model") == "hearth":
                for k, keys in (("mantel", MANTEL_KEYS), ("breast", BREAST_KEYS), ("firebox", FIREBOX_KEYS)):
                    _strict(sp.get(k), keys, f"{where}.spec.{k}", k, bag)
                if isinstance(sp.get("firebox"), dict):
                    _strict(sp["firebox"].get("glow"), GLOW_KEYS, where + ".spec.firebox.glow", "glow", bag)
                for j, d in enumerate(sp.get("dress") or ()):
                    _strict(d, DRESS_KEYS, f"{where}.spec.dress[{j}]", "dress", bag)
    for name, lay in (row.get("layouts") or {}).items() if isinstance(row.get("layouts"), dict) else ():
        for pid, over in ((lay or {}).get("pieces") or {}).items():
            _strict(over, PIECE_KEYS, f"layouts.{name}.pieces.{pid}", "piece", bag)
            if isinstance(over, dict):
                _strict(over.get("spec"), SPEC_KEYS, f"layouts.{name}.pieces.{pid}.spec", "spec", bag)
    for i, o in enumerate(row.get("openings") or ()):
        _strict(o, OPENING_KEYS, f"openings[{i}]", "opening", bag)
    for k in ("door", "window"):
        _strict(row.get(k), OPENING_KEYS, k, "opening", bag)
    for i, lt in enumerate(row.get("lights") or ()):
        _strict(lt, LIGHT_KEYS, f"lights[{i}]", "light", bag)
        if isinstance(lt, dict):
            _strict(lt.get("anchor"), ANCHOR_KEYS, f"lights[{i}].anchor", "anchor", bag)
            if isinstance(lt.get("glow"), dict):
                _strict(lt["glow"], GLOW_KEYS, f"lights[{i}].glow", "glow", bag)
    _strict(row.get("moon"), MOON_KEYS, "moon", "moon", bag)
    _strict(row.get("outside"), OUTSIDE_KEYS, "outside", "outside", bag)
    if isinstance(row.get("look"), dict):
        for k in row["look"]:
            if k in LOOK_NOT_OVERRIDABLE:
                bag.append(f"look.{k}: the look's {k} is not overridable (R-K2)")
            elif k.endswith("_note"):
                pass    # said by _stray_notes
            elif k not in LOOK_KEYS:
                bag.append(f'look: the key "{k}" is not a look key{_did_you_mean(k, LOOK_KEYS)} (R0.1b)')
        _stray_notes(row["look"], "look", bag)
    # R0.2, R0.2b: the openings one way; the legacy rig
    legacy = "door" in row or "window" in row
    if "openings" in row and legacy:
        bag.append('give the openings one way: "door" and "window" (a room with one of each), or "openings" (R0.2)')
    if legacy and ("lights" in row or "exposure_from" in row):
        bag.append('a file with "door" and "window" has the legacy light rig: "lights" and "exposure_from" need '
                   '"openings" (R0.2b)')


def value_rules(row: dict, bag: Problems) -> None:
    """The rules on the file's values that need no scene: colours, trims, places, models, grey boxes, ids (derive runs
    them, so that load_room stays the reader it was: a file of placeholders still loads)."""
    pieces = row.get("pieces") or []
    # R0.3
    for k, c in _colours(row):
        if not HEX.match(c):
            bag.append(f"{k} {c!r} is not a colour (#RRGGBB, sRGB)")
        elif lilac(c):
            bag.append(f"{k} {c} is lilac or magenta: the palette has none (the owner's rule) (R0.3)")
    # R-S2
    for k in ("skirting", "picture_rail", "cornice"):
        if k in row and row[k] is not None and not (_num(row[k]) and row[k] > 0):
            bag.append(f"{k} {row[k]!r}: give a height in metres, or null for no {k.replace('_', ' ')} (R-S2)")
    # pieces: places, models, grey boxes, ids
    seen, seen3 = {}, {}
    for i, p in enumerate(pieces):
        if not isinstance(p, dict):
            continue
        pid = p.get("id")
        where = f"piece {pid}"
        if not isinstance(pid, str) or not pid:
            bag.append(f"pieces[{i}]: a piece has an `id`")
            continue
        if pid in seen:
            bag.append(f"pieces: the id {pid} stands twice (R-P1)")
        s3 = three_name(pid)
        if s3 in seen3 and seen3[s3] != pid:
            bag.append(f'pieces: the ids "{seen3[s3]}" and "{pid}" read the same in three.js (R-P1)')
        seen[pid], seen3[s3] = i, pid
        if pid.replace(".", "_").endswith(RESERVED_SUFFIXES):
            bag.append(f"{where}: its node name would end in a part's suffix ({', '.join(RESERVED_SUFFIXES)}) (R-N2)")
        _place_rule(p, seen, where, bag)
        spec = p.get("spec") if isinstance(p.get("spec"), dict) else {}
        model = spec.get("model")
        if model is not None and model not in MODELS:
            bag.append(f'{where}: no first-person builder for model "{model}" (the builders: {", ".join(MODELS)}) '
                       f'(R-P5)')
        if model == "box":
            size = spec.get("size")
            ok = isinstance(size, (list, tuple)) and len(size) == 3 and all(
                (v is None and j == 0) or (_num(v) and v > 0) for j, v in enumerate(size))
            label = spec.get("label")
            if not ok or not (isinstance(label, str) and len(label.strip()) >= 3):
                bag.append(f'{where}: a grey box needs "size": [w, d, h] in metres (w may be null on a run or a '
                           f'footprint prop) and a "label" of 3 characters or more (R-P3)')
            elif _num(row.get("height")) and size[2] + float(p.get("rise") or 0.0) > row["height"]:
                bag.append(f"{where} is {size[2] + float(p.get('rise') or 0.0):g} m tall under a {row['height']:g} m "
                           f"ceiling (R-P3b)")
            if spec.get("finish", "grey") not in BOX_FINISHES:
                bag.append(f'{where}: finish "{spec["finish"]}" is not built yet (G15 to G19); a box is '
                           f'{" or ".join(chr(34) + x + chr(34) for x in BOX_FINISHES)}')
        if model == "hearth":
            hearth_values(spec, row.get("height"), where, bag)
        if isinstance(spec.get("bed"), dict):
            bed_values(p, spec, where, bag)
        if "covers" in p and not (isinstance(p["covers"], (list, tuple)) and all(isinstance(c, str) for c in p["covers"])):
            bag.append(f"{where}: covers is a list of scene ids")
        if "moved" in p and not (isinstance(p["moved"], str) and p["moved"].strip()):
            bag.append(f"{where}: moved is a text saying why the piece stands away from its place")
        if "rise" in p and p["rise"] is not None and not (_num(p["rise"]) and p["rise"] >= 0):
            bag.append(f"{where}: rise is metres off the floor, 0 or more")
    skip = row.get("skip")
    if skip is not None and not (isinstance(skip, dict) and all(isinstance(v, str) and v.strip() for v in skip.values())):
        bag.append('skip is {"<scene id>": "<the reason, and which task waits>"}')


def _num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _place_rule(p: dict, earlier: dict, where: str, bag: Problems) -> None:
    """R-P4 (with R-P6's form: which places may take a null)."""
    pl = p.get("place")
    forms = '["wall", side, along], ["at", x, y] and ["beside", piece, side, along]'
    if not isinstance(pl, (list, tuple)) or not pl:
        bag.append(f"{where}: place is one of {forms} (R-P4)")
        return
    kind = pl[0]
    if kind == "wall" and len(pl) == 3 and pl[1] in SIDES and (_num(pl[2]) or pl[2] in SIDES or pl[2] is None):
        return
    if kind == "at" and len(pl) == 3 and all(_num(v) or v is None for v in pl[1:]):
        return
    if kind == "beside" and len(pl) == 4 and pl[2] in SIDES and _num(pl[3]):
        if pl[1] not in earlier or pl[1] == p.get("id"):
            bag.append(f"{where}: place beside {pl[1]}: `beside` names a piece that stands earlier in the list (R-P4)")
        return
    bag.append(f"{where}: place {list(pl)}: the forms are {forms} (R-P4)")


# ---------------------------------------------------------------- the hearth (G6) and the bed object (G7)


def _nums(v, n: int) -> bool:
    return isinstance(v, (list, tuple)) and len(v) == n and all(_num(x) for x in v)


GLOW_DEFAULT_SIZE = {"sphere": lambda ow, fd: [0.12], "cone": lambda ow, fd: [round(0.3 * ow, 3), 0.2],
                     "box": lambda ow, fd: [round(0.7 * ow, 3), round(0.6 * fd, 3), 0.08],
                     "card": lambda ow, fd: [round(0.6 * ow, 3), 0.25]}


def hearth_values(spec: dict, height=None, where: str = "the hearth", bag: Problems | None = None) -> dict | None:
    """A hearth's numbers with every default filled (room_file_v2 section 6), in the piece's frame: x along its width
    (centred), y toward its back (the wall at +d/2, its front at -d/2), z up from the floor. Holds R-H1 to R-H3 and
    R-H5 (R-H4 is the lights' R-L3: a hearth always gives `fire`), and that the fire anchor stands in the firebox.
    With no `bag` it stops on a problem (the builder's call); with one it adds to it (value_rules)."""
    own = bag is None
    bag = Problems("the room file") if own else bag
    n0 = len(bag)

    def done(v):
        if own:
            bag.stop()
        return v if len(bag) == n0 else None

    style = spec.get("style")
    if style not in HEARTH_STYLES:
        bag.append(f'{where}: hearth style {style!r} is not one of {", ".join(HEARTH_STYLES)} (R-H1)')
        return done(None)
    if style not in HEARTH_BUILT:
        bag.append(f'{where}: hearth style "{style}" is not built yet (it comes with the tavern); the builder has '
                   f'{", ".join(HEARTH_BUILT)} (R-H1)')
        return done(None)
    size = spec.get("size")
    if not (_nums(size, 3) and all(v > 0 for v in size)):
        bag.append(f"{where}: a hearth's size is [w, d, h] in metres: its width along the wall, its depth out of it and "
                   f"the mantel's height (R-H2)")
        return done(None)
    w, d, h = (float(v) for v in size)
    surface = spec.get("surface") or HEARTH_SURFACE[style]
    if surface not in SURFACES:
        bag.append(f'{where}: surface {surface!r} is not one of {", ".join(SURFACES)}')
    elif surface not in SURFACES_BUILT:
        bag.append(f'{where}: surface "{surface}" waits for G11\'s fetch; the builder has {", ".join(SURFACES_BUILT)}')
    if spec.get("glow") is not None:
        bag.append(f"{where}: a hearth's glow is its firebox's (spec.firebox.glow), not spec.glow")
    mdef = dict(z=h, depth=min(0.3, d), overhang=0.05, thickness=0.06) if style == "surround" else \
        dict(z=h, depth=min(0.24, d), overhang=0.04, thickness=0.1)
    m = dict(mdef, **{k: v for k, v in (spec.get("mantel") or {}).items() if v is not None})
    if not all(_num(m[k]) for k in ("z", "depth", "overhang", "thickness")) or min(
            m["z"], m["depth"], m["thickness"]) <= 0 or m["overhang"] < 0:
        bag.append(f"{where}: the mantel's z, depth and thickness are metres over 0, its overhang 0 or more (R-H2)")
        return done(None)
    z1, z0 = float(m["z"]), float(m["z"]) - float(m["thickness"])
    ovh = float(m["overhang"])
    yb, yf = d / 2, -d / 2 + ovh                    # the body: from the wall out to its front face
    half = w / 2 - ovh                              # the body's half width (the shelf overhangs it)
    if half <= 0.1 or yb - yf <= 0.1:
        bag.append(f"{where}: the mantel's {ovh:g} m overhang leaves no body under it (R-H2)")
        return done(None)
    shelf = dict(x0=-w / 2, x1=w / 2, y0=-d / 2, y1=min(-d / 2 + float(m["depth"]), d / 2), z0=z0, z1=z1)
    if float(m["depth"]) <= ovh:
        bag.append(f"{where}: the mantel is {m['depth']:g} m deep and overhangs {ovh:g} m: it would stand on nothing "
                   f"(R-H2)")
    op = spec.get("opening")
    if op is None:
        op = (round(min(0.8, 0.45 * w), 3), round(min(0.9, 0.7 * z0), 3)) if style == "surround" else \
            (round(0.5 * w, 3), round(0.72 * z0, 3))
    if not (_nums(op, 2) and all(v > 0 for v in op)):
        bag.append(f"{where}: opening is [w, h] in metres, the firebox's mouth (R-H2)")
        return done(None)
    ow, oh = (float(v) for v in op)
    if z0 < oh:
        bag.append(f"{where}: the mantel at {z0:g} m is lower than the opening's top ({oh:g} m) (R-H2)")
    if ow > 2 * half - 0.1:
        bag.append(f"{where}: the opening is {ow:g} m wide: the jambs need 5 cm each of the body's {2 * half:g} m (R-H2)")
    if _num(height) and z1 > height:
        bag.append(f"{where}: the mantel at {z1:g} m is over the {height:g} m ceiling (R-H2)")
    fb = spec.get("firebox") or {}
    fd = fb.get("depth")
    fd = min(0.3, yb - yf - 0.04) if fd is None else fd
    if not (_num(fd) and 0 < fd <= yb - yf - 0.02):
        bag.append(f"{where}: the firebox's depth is over 0 and at most the body's {yb - yf - 0.02:.2f} m less 2 cm of "
                   f"back (R-H2)")
        return done(None)
    fd = float(fd)
    firebox = dict(x0=-ow / 2, x1=ow / 2, y0=yf, y1=yf + fd, z1=oh, depth=fd, cy=round(yf + fd / 2, 4))
    breast = None
    b = spec.get("breast")
    if b:
        to = b.get("to", "ceiling")
        top = height if to == "ceiling" else to
        bwid = b.get("width", 2 * half)
        bdep = b.get("depth", min(0.3, yb - yf))
        if not (_num(top) and _num(bwid) and _num(bdep) and bwid > 0 and bdep > 0):
            bag.append(f'{where}: the breast is {{"width": m, "depth": m, "to": "ceiling" or m}} (R-H2)')
            return done(None)
        if top <= z1:
            bag.append(f"{where}: the mantel at {z1:g} m is not under the breast's top ({top:g} m) (R-H2)")
        if _num(height) and top > height:
            bag.append(f"{where}: the breast's top ({top:g} m) is over the {height:g} m ceiling (R-H2)")
        if bwid > w:
            bag.append(f"{where}: the breast is {bwid:g} m wide, wider than the hearth's {w:g} m (R-H2)")
        if bdep > d - 0.02:
            bag.append(f"{where}: the breast is {bdep:g} m deep: it stands behind the mantel's front, at most "
                       f"{d - 0.02:.2f} m (R-H2)")
        breast = dict(x0=-bwid / 2, x1=bwid / 2, y0=yb - bdep, y1=yb, z0=z1, z1=float(top), width=float(bwid),
                      depth=float(bdep))
    g = fb.get("glow", dict(shape="box", material="coal"))
    glow = None
    if g:
        glow = dict(g)
        if glow.get("shape") in GLOW_DEFAULT_SIZE and "size" not in glow:
            glow["size"] = GLOW_DEFAULT_SIZE[glow["shape"]](ow, fd)
        glow.setdefault("at", [[0.0, firebox["cy"], 0.02]])
    anchors = dict(spec.get("anchors") or {})
    anchors.setdefault("fire", (0.0, firebox["cy"], 0.32))
    fa = anchors["fire"]
    if not _nums(fa, 3):
        bag.append(f"{where}: anchors.fire is [x, y, z] in the piece's frame")
    elif not (abs(fa[0]) < ow / 2 and yf <= fa[1] <= yf + fd and 0 < fa[2] < oh):
        bag.append(f"{where}: its fire anchor [{', '.join(f'{v:g}' for v in fa)}] is not in its firebox (x within "
                   f"{ow / 2:g}, y {yf:g} to {yf + fd:g}, z 0 to {oh:g})")
    dress = []
    for j, r in enumerate(spec.get("dress") or ()):
        at = r.get("at", (0.0, 0.0, 0.0))
        if not _nums(at, 3):
            bag.append(f"{where}: dress[{j}]'s at is [x, y in from the back, z over the mantel's top]")
            continue
        if r.get("model") == "box":
            sz = r.get("size")
            if not (_nums(sz, 3) and all(v > 0 for v in sz)) or not (isinstance(r.get("label"), str)
                                                                       and len(r["label"].strip()) >= 3):
                bag.append(f'{where}: dress[{j}] is a grey box: "size": [w, d, h] and a "label" of 3 characters or more')
                continue
            dress.append(dict(model="box", size=[float(v) for v in sz], at=[float(v) for v in at], label=r["label"]))
            continue
        if r.get("model") not in (None, "ph") or not isinstance(r.get("slug"), str):
            bag.append(f"{where}: dress[{j}] is a Poly Haven model (\"slug\") or a labelled box (\"model\": \"box\")")
            continue
        k = r.get("scale", 1.0)
        if not (_num(k) and k > 0):
            bag.append(f"{where}: dress[{j}]'s scale is a number over 0")
            continue
        if r.get("cloth") and r["slug"] not in MIRROR_H:
            bag.append(f'{where}: dress[{j}] has "cloth" but {r["slug"]} is not a mirror (R-H3)')
        if r["slug"] in MIRROR_H:
            mtop = z1 + float(at[2]) + MIRROR_H[r["slug"]] * float(k)
            if breast is None:
                bag.append(f"{where}: dress[{j}] {r['slug']} is a mirror and the hearth has no breast to hang it on "
                           f"(R-H5)")
            elif mtop > breast["z1"] + 1e-6:
                bag.append(f"{where}: the mirror's top ({mtop:.2f} m) is over the breast, which stops at "
                           f"{breast['z1']:.2f} m (R-H5)")
        dress.append(dict(slug=r["slug"], scale=float(k), at=[float(v) for v in at], rot=float(r.get("rot", 0.0)),
                          lod=r.get("lod"), cloth=bool(r.get("cloth"))))
    return done(dict(style=style, surface=surface, size=[w, d, h], opening=[ow, oh], body=dict(
        x0=-half, x1=half, y0=yf, y1=yb), shelf=shelf, mantel=m, firebox=firebox, breast=breast, glow=glow,
        anchors=anchors, dress=dress))


def bed_values(piece: dict, spec: dict, where: str = "the bed", bag: Problems | None = None) -> dict | None:
    """A bed object's choices with every default filled (room_file_v2 section 7), held to R-B1 to R-B3. `spec.bed:
    true` is not one (the Gothic bed's path, untouched). With no `bag` it stops on a problem."""
    own = bag is None
    bag = Problems("the room file") if own else bag
    n0 = len(bag)
    b = spec.get("bed")
    kind = b.get("kind", "gothic")
    if kind not in BED_BUILT:
        bag.append(f'{where}: bed.kind "{kind}" is not built yet (G20); the builder has {" and ".join(BED_BUILT)} '
                   f'(R-B1)')
    elif kind == "gothic" and [k for k in b if k != "kind"]:
        bag.append(f"{where}: a gothic bed is today's, number for number: {', '.join(k for k in b if k != 'kind')} "
                   f"is for a day bed (R-B1)")
    if spec.get("model") != "ph" or not spec.get("slug"):
        bag.append(f'{where}: a bed stands on a Poly Haven model ("model": "ph" and its "slug")')
    v = dict(kind=kind, axis=b.get("axis", "y"), head=b.get("head", "+"),
             cover=b.get("cover", "coverlet" if kind == "gothic" else "blanket"),
             pillows=b.get("pillows", 2 if kind == "gothic" else 1), mattress=b.get("mattress"), colour=b.get("colour"))
    if v["axis"] not in ("x", "y"):
        bag.append(f'{where}: bed.axis is "x" or "y", the model\'s long axis')
    if v["head"] not in ("+", "-"):
        bag.append(f'{where}: bed.head is "+" or "-", the end of the long axis at the head')
    if v["cover"] not in BED_COVERS:
        bag.append(f'{where}: bed.cover is one of {", ".join(BED_COVERS)}')
    n = v["pillows"]
    if not (isinstance(n, int) and not isinstance(n, bool) and n >= 0):
        bag.append(f"{where}: bed.pillows is a whole number")
    elif kind in BED_PILLOWS and n > BED_PILLOWS[kind]:
        bag.append(f"{where}: {n} pillows do not fit a {kind} bed (at most {BED_PILLOWS[kind]}) (R-B2)")
    mm = v["mattress"]
    if mm is not None and not (_nums(mm, 5) and mm[0] < mm[1] and mm[2] < mm[3] and mm[4] > 0):
        bag.append(f"{where}: bed.mattress is [x0, x1, y0, y1, z] in the model's own metres (x0 < x1, y0 < y1), or "
                   f"null to probe it")
    if v["colour"] is not None and v["cover"] != "blanket":
        bag.append(f"{where}: bed.colour is the blanket's tint; a coverlet is the damask's own scan")
    if kind != "gothic" and piece.get("lift"):
        bag.append(f'{where}: "lift" is for the gothic bed\'s posts (R-B3)')
    if own:
        bag.stop()
    return v if len(bag) == n0 else None


def load_room(scene_id: str, rooms_dir: str | None = None, path: str | None = None) -> dict:
    """The per-room choices of `scene_id` from its file (`path`, else `<rooms_dir>/<scene_id>.json`), as the table's
    row was: the file's own `room` and `about` and every note left out, arrays as tuples, `pieces` a list. Stops with a
    plain message when the file is missing, is not JSON, gives a key twice, names another room, lacks a key the builder
    reads or breaks a rule on its keys (key_rules). Nothing is added to the data."""
    path = path or room_path(scene_id, rooms_dir)
    shown = from_root(path)
    if not os.path.isfile(path):
        raise SystemExit(f"meshy_room_build: no room file for {scene_id}: {shown} is missing (each first-person room "
                         f"has its own file in {os.path.dirname(shown) or '.'}/)")
    with open(path, encoding="utf-8") as fh:
        try:
            data = json.load(fh, object_pairs_hook=_room_object)
        except ValueError as err:
            raise SystemExit(f"meshy_room_build: {shown} cannot be read: {err}")
    if not isinstance(data, dict) or data.get("room") != scene_id:
        named = data.get("room") if isinstance(data, dict) else None
        raise SystemExit(f"meshy_room_build: {shown} is not {scene_id}'s room file: its `room` is {named!r}")
    row = _room_value(data, shown)
    del row["room"]
    row.pop("about", None)
    need = [k for k in ROOM_KEYS if "openings" not in row or k not in LEGACY_ONLY]
    missing = [k for k in need if k not in row]
    if missing:
        raise SystemExit(f"meshy_room_build: {shown} lacks {', '.join(missing)}")
    bag = Problems(shown)
    key_rules(row, bag)
    bag.stop()
    row["pieces"] = list(row["pieces"])
    return row


def apply_layout(cfg: dict, name: str | None) -> str:
    """Make `cfg` (a copy of a room's row, load_room) the named arrangement: the file's own when `name` is None or
    its `layout`; otherwise that layout's piece overrides (a piece's keys replaced whole) and views. Returns the
    name."""
    own = cfg.get("layout", "default")
    name = name or own
    cfg["pieces"] = [dict(p) for p in cfg["pieces"]]
    cfg["views"] = dict(cfg["views"])
    if name != own:
        lay = (cfg.get("layouts") or {}).get(name)
        if lay is None:
            raise SystemExit(f"meshy_room_build: no layout {name!r} (the room file has {own!r} and "
                             f"{sorted(cfg.get('layouts') or {})})")
        ids = {p["id"] for p in cfg["pieces"]}
        for pid in lay.get("pieces", {}):
            if pid not in ids:
                raise SystemExit(f"meshy_room_build: layout {name!r} names a piece the room file has not: {pid}")
        for p in cfg["pieces"]:
            p.update(lay.get("pieces", {}).get(p["id"], {}))
        cfg["views"].update(lay.get("views", {}))
    cfg["layout"] = name
    return name


def bake_look_md5(look: dict) -> str:
    """The md5 of the look file's bake-relevant part: the lamps, the bake's own settings, the night outside, the
    emitters and the cloths' colours, and the AO's distance and samples. A later --raw run tunes the rest (the light
    settings, the ink floor, the highlights, the AO's strength) on a saved bake without changing it, so a saved bake
    and the build made from it agree on this md5 while their whole-file md5s may differ."""
    part = {k: v for k, v in look.items() if k not in BAKE_LOOK_DROP}
    if isinstance(part.get("ao"), dict):
        part["ao"] = {k: part["ao"].get(k) for k in ("distance_m", "samples")}
    return hashlib.md5(json.dumps(part, sort_keys=True).encode()).hexdigest()


# ---------------------------------------------------------------- a room's look override (G9: room_file_v2, section 5)

# the light colours a look may give (R-K4): the palette's warm, moon and teal (teal only as emitted light) and the
# fill's near-white
LIGHT_PALETTE = {"#FFB457": "warm", "#7FA8FF": "moon", "#2EC4B6": "teal", "#F2EDE4": "the fill's near-white"}
LIGHT_ROLE_KEYS = frozenset("color power radius strength angle area_ref_m2".split())   # a new role's keys
SETTING_KEYS = frozenset("label mix tint".split())                                     # a new setting's keys
OPEN_BLOCKS = ("lights", "settings", "emit_display")    # R-K1: these may add a role, a setting, an emitter


def near_white(hexc: str) -> bool:
    """A colour with little hue and much value (the fill's kind): saturation at most 0.12, value at least 0.85."""
    _h, s, v = _hsv(hexc)
    return s <= 0.12 and v >= 0.85


def merge_look(look: dict, over) -> dict:
    """The room's look: `over` deep-merged over the look file's (objects key by key, arrays and scalars replace,
    `null` deletes a key). Neither argument is changed; with no override the result equals the look."""
    def merge(a, b):
        out = dict(a)
        for k, v in b.items():
            if v is None:
                out.pop(k, None)
            elif isinstance(v, dict) and isinstance(a.get(k), dict):
                out[k] = merge(a[k], v)
            else:
                out[k] = json.loads(json.dumps(v))
        return out

    base = json.loads(json.dumps(look))
    return merge(base, over) if isinstance(over, dict) else base


def look_rules(look: dict, over, light, bag: Problems, shown_look: str = "the look file") -> None:
    """R-K1, R-K3 and R-K4 on a room's `look` and `light` against the look file (R-K2 and the look's own top keys are
    key_rules')."""
    over = over if isinstance(over, dict) else {}

    def walk(o, base, where):
        for k, v in o.items():
            if is_note(k, o):
                continue
            here = f"{where}.{k}"
            if isinstance(base, dict) and k in base:
                if isinstance(v, dict) and isinstance(base[k], dict):
                    walk(v, base[k], here)
                continue
            if v is None:
                bag.append(f"{here}: null deletes a key, and {shown_look} has none here (R-K1)")
                continue
            keys = [x for x in base if not str(x).endswith("note")] if isinstance(base, dict) else []
            bag.append(f"{here}: no such key in {shown_look}{_did_you_mean(k, keys)} (R-K1)")

    for k, v in over.items():
        if is_note(k, over) or k in LOOK_NOT_OVERRIDABLE or k not in LOOK_KEYS:
            continue        # key_rules says these
        base = look.get(k)
        if k == "outside":
            for kk in (v if isinstance(v, dict) else {}):
                if not is_note(kk, v) and kk != "gain":
                    bag.append(f"look.outside.{kk}: only outside.gain may change (the sky is meshy_looks/final.json's)"
                               f" (R-K1)")
        elif k in OPEN_BLOCKS and isinstance(v, dict):
            for name, ent in v.items():
                if is_note(name, v):
                    continue
                here = f"look.{k}.{name}"
                old = base.get(name) if isinstance(base, dict) else None
                if k == "emit_display":
                    if ent is not None and not (isinstance(ent, (list, tuple)) and len(ent) == 3 and
                                                all(_num(x) and x >= 0 for x in ent)):
                        bag.append(f"{here}: an emitter's display colour is [r, g, b], scene-linear (R-K1)")
                elif isinstance(ent, dict) and isinstance(old, dict):
                    walk(ent, old, here)
                elif isinstance(ent, dict):
                    allowed = LIGHT_ROLE_KEYS if k == "lights" else SETTING_KEYS
                    for kk in ent:
                        if not is_note(kk, ent) and kk not in allowed:
                            what = "light role" if k == "lights" else "setting"
                            bag.append(f'{here}: the key "{kk}" is not a {what} key{_did_you_mean(kk, allowed)} (R-K1)')
                elif ent is None and old is None:
                    bag.append(f"{here}: null deletes a key, and {shown_look} has none here (R-K1)")
        elif isinstance(v, dict) and isinstance(base, dict):
            walk(v, base, f"look.{k}")
        elif base is None and v is not None:
            bag.append(f"look.{k}: no such key in {shown_look} (R-K1)")
    # R-K4: the light colours
    lights = over.get("lights") if isinstance(over.get("lights"), dict) else {}
    for role, ent in lights.items():
        c = ent.get("color") if isinstance(ent, dict) else None
        if c is None:
            continue
        if not (isinstance(c, str) and HEX.match(c)):
            bag.append(f"look.lights.{role}.color {c!r} is not a colour (#RRGGBB, sRGB)")
        elif c.upper() not in LIGHT_PALETTE and not near_white(c):
            bag.append(f"look.lights.{role}.color {c} is not a palette light colour (warm #FFB457, moon #7FA8FF, teal "
                       f"#2EC4B6 as a light, the fill's #F2EDE4) or a near-white (R-K4)")
    # R-K3: the room's light setting
    if light is not None:
        sets = merge_look(look, over).get("settings") or {}
        names = sorted(n for n, s in sets.items() if isinstance(s, dict))
        if not isinstance(light, str) or light not in names:
            bag.append(f'light {json.dumps(light)}: no such setting (the merged look has {", ".join(names) or "none"}) '
                       f'(R-K3)')


def room_look(look: dict, row: dict, shown: str = "", shown_look: str = "the look file") -> tuple:
    """The room's merged look, its default light setting and its override's md5 (source.lookRoomMd5, None for none),
    after R-K1 to R-K4; stops with every problem found."""
    bag = Problems(shown or f"{row.get('room')}'s room file")
    look_rules(look, row.get("look"), row.get("light"), bag, shown_look)
    bag.stop()
    return merge_look(look, row.get("look")), row.get("light"), look_room_md5(row.get("look"))


def look_room_md5(over) -> str | None:
    """source.lookRoomMd5: the md5 of a room's own look override (its data, notes dropped), None for none."""
    if not isinstance(over, dict):
        return None
    return hashlib.md5(json.dumps(over, sort_keys=True).encode()).hexdigest()


def emit_cap(emit_display: dict, used) -> float:
    """The emit cap in `k` (post_bake): the largest display value among the emitters the room uses (`used`: their
    material keys, e.g. M_flame), 1.0 with none. An emitter only another room has does not cap this one (coupling 11
    of the implementation plan: the look's largest entry capped every room)."""
    used = set(used)
    vals = [max(v) for kk, v in (emit_display or {}).items() if kk in used and isinstance(v, (list, tuple)) and v]
    return max(vals or [1.0])


def _bake_piece(p):
    if not isinstance(p, dict):
        return p
    q = {k: v for k, v in p.items() if k not in PIECE_DROP}
    if isinstance(q.get("spec"), dict):
        q["spec"] = {k: v for k, v in q["spec"].items() if k not in SPEC_DROP}
    return q


def bake_room_md5(cfg: dict) -> str:
    """The md5 of a room's bake-relevant part: its row with the layout applied (apply_layout; before the look's
    defaults are merged into it), without the labels, the stills' views, the exposure override and its lights, the
    light setting, the skipped ids, the look override (its md5 is the merged look's), the layout's name (recorded and
    compared apart) and the table of the other layouts, and inside each piece without its `moved` text and its grey
    box's `label`. It is taken from the data, not from the file: a note, a view or a layout that is not built can
    change, and the file can be laid out anew, while a saved bake and the build made from it still agree on it."""
    part = {k: v for k, v in cfg.items() if k not in BAKE_ROOM_DROP}
    if isinstance(part.get("pieces"), (list, tuple)):
        part["pieces"] = [_bake_piece(p) for p in part["pieces"]]
    return hashlib.md5(json.dumps(part, sort_keys=True).encode()).hexdigest()


# ---------------------------------------------------------------- the scene


def load_scene(scene_id: str, scenes_dir: str | None = None) -> dict:
    path = os.path.join(scenes_dir or SCENES_DIR, f"{scene_id}.json")
    if not os.path.isfile(path):
        raise SystemExit(f"meshy_room_build: no scene {scene_id}: {from_root(path)} is missing")
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def three_name(s: str) -> str:
    """three.js PropertyBinding.sanitizeNodeName: whitespace to _, then . [ ] : / removed."""
    return re.sub(r"[\[\].:/]", "", re.sub(r"\s", "_", s))


def task_ids(path: str | None = None) -> set:
    """The props the game's tasks name (a task's `source` or `targets`): the owner is shown every one that moves."""
    path = path or TASKS_FILE
    if not os.path.isfile(path):
        return set()
    with open(path, encoding="utf-8") as fh:
        d = json.load(fh)
    out = set()
    rows = d.get("tasks") if isinstance(d, dict) else d
    for t in (rows.values() if isinstance(rows, dict) else rows) or ():
        if not isinstance(t, dict):
            continue
        for ref in [t.get("source")] + list(t.get("targets") or []):
            if isinstance(ref, dict) and ref.get("prop"):
                out.add(ref["prop"])
    return out


class Scene:
    """What the loader needs of a scene file: its tiles in room metres (1 m a tile, the grid's centre on the origin)."""

    def __init__(self, d: dict):
        self.d = d
        self.id, self.name, self.prefix = d["id"], d.get("name"), d.get("prefix", "")
        self.w, self.h = int(d["size"]["w"]), int(d["size"]["h"])
        self.props, self.spots = d.get("props") or [], d.get("spots") or []
        self.portals, self.lights, self.spawns = d.get("portals") or [], d.get("lights") or [], d.get("spawns") or []
        self.by_id = {r["id"]: r for r in self.props + self.spots}
        # the room's inner rectangle: the grid's non-border tiles (meshy_room_build.Frame)
        self.x0, self.x1 = -(self.w - 2) / 2.0, (self.w - 2) / 2.0
        self.y0, self.y1 = -(self.h - 2) / 2.0, (self.h - 2) / 2.0

    def centre(self, tx, ty) -> tuple:
        return (tx + 0.5 - self.w / 2.0, self.h / 2.0 - ty - 0.5)

    def border_side(self, tx, ty):
        """The wall of a border tile, None for an inner tile (a corner tile answers its N or S wall first)."""
        if ty == 0:
            return "N"
        if ty == self.h - 1:
            return "S"
        if tx == 0:
            return "W"
        if tx == self.w - 1:
            return "E"
        return None

    def footprint_centre(self, r: dict):
        f = r.get("footprint")
        if not f:
            return None
        return (f["x"] + f["w"] / 2.0 - self.w / 2.0, self.h / 2.0 - (f["y"] + f["h"] / 2.0))

    def night(self, lt: dict) -> bool:
        return not lt.get("phases") or "night" in lt["phases"]

    def is_window_prop(self, pid: str) -> bool:
        tail = pid[len(self.prefix) + 1:] if self.prefix and pid.startswith(self.prefix + ".") else pid.split(".", 1)[-1]
        return bool(WINDOW_TAIL.match(tail))


# ---------------------------------------------------------------- the kit's rows (meshy_interior_build), when here

_KIT: list = []


def _kit():
    """meshy_interior_build's prop and spot tables (plain Python, no Blender), or None where it cannot be imported."""
    if not _KIT:
        try:
            sys.path.insert(0, HERE)
            import meshy_interior_build as mib
            _KIT.append((mib.PROP_MODELS, mib.SPOT_MODELS))
        except Exception:   # noqa: BLE001  (numpy or another import missing: the kit's rows are not read)
            _KIT.append(None)
    return _KIT[0]


def merged_spec(piece: dict):
    """A piece's spec as the builder's spec_for makes it: the kit's row (by the piece's id, then its key) with the
    piece's own `spec` over it (null removes a key). None when the kit cannot be read here and the piece names a key."""
    kit = _kit()
    own = piece.get("spec") if isinstance(piece.get("spec"), dict) else {}
    if kit is None:
        if piece.get("key"):
            return None
        return {k: v for k, v in own.items() if v is not None}
    table = kit[1] if piece.get("spot") else kit[0]
    base = next((dict(table[k]) for k in (piece.get("id"), piece.get("key")) if k and k in table), {})
    for k, v in own.items():
        if v is None:
            base.pop(k, None)
        else:
            base[k] = v
    return base


def anchor_names(spec: dict) -> set:
    """The light anchors a piece gives: its `spec.anchors`, `flame` with `extras: ["flame"]`, `fire` on a hearth."""
    names = set((spec.get("anchors") or {}).keys())
    if "flame" in (spec.get("extras") or ()):
        names.add("flame")
    if spec.get("model") == "hearth":
        names.add("fire")
    return names


# ---------------------------------------------------------------- the derived reading


def flight_values(f, sc, where: str = "the flight", bag: Problems | None = None, height=None) -> dict | None:
    """A stairs opening's visible flight (G12, first part) with every default filled, in room metres: the `well`
    [x0, y0, x1, y1] cut in the floor; `dir` the wall the flight descends toward (its head is the well's opposite
    edge); treads `tread` deep and `riser` high from the head edge, on under the floor past the well's far edge for
    `under` metres; a balustrade `rail_h` high on the `rail` edges (default: every edge of the well that is not on a
    wall). Derived: `head` (the head edge's coordinate), `length` (the well along dir), the `steps` [u0, u1, top z]
    (u from the head edge), the shaft's `bottom`, the walls the well touches (`on_wall`) and the collision box `box`
    [x0, y0, 0, x1, y1, rail_h] (the well and the balustrade's width). Holds R-F2 to R-F7. `sc` needs the room's x0,
    x1, y0, y1. With no `bag` it stops on a problem; with one it adds to it. A flight with `up` true is read by
    _flight_up (R-F9 to R-F12), which needs the room's `height`."""
    own = bag is None
    bag = Problems("the room file") if own else bag
    n0 = len(bag)

    def done(v):
        if own:
            bag.stop()
        return v if len(bag) == n0 else None

    if not isinstance(f, dict):
        bag.append(f"{where}: flight is an object (R-F2)")
        return done(None)
    _strict(f, FLIGHT_KEYS, f"{where}.flight", "flight", bag)
    if f.get("up") is not None and not isinstance(f.get("up"), bool):
        bag.append(f"{where}: flight.up is true (a flight up into the ceiling) or false (R-F9)")
        return done(None)
    if f.get("up"):
        return done(_flight_up(f, sc, where, bag, height))
    for k in ("base", "over"):
        if f.get(k) is not None:
            bag.append(f'{where}: flight.{k} is a flight up\'s ("up": true) (R-F9)')
    w = f.get("well")
    if not (_nums(w, 4) and w[0] < w[2] and w[1] < w[3]):
        bag.append(f"{where}: flight.well is [x0, y0, x1, y1] in metres, x0 < x1 and y0 < y1 (R-F3)")
        return done(None)
    x0, y0, x1, y1 = (float(v) for v in w)
    e = 1e-6
    if x0 < sc.x0 - e or x1 > sc.x1 + e or y0 < sc.y0 - e or y1 > sc.y1 + e:
        bag.append(f"{where}: the well {[x0, y0, x1, y1]} reaches out of the room (x {sc.x0:g}..{sc.x1:g}, "
                   f"y {sc.y0:g}..{sc.y1:g}) (R-F3)")
    if min(x1 - x0, y1 - y0) < 0.6 - e:
        bag.append(f"{where}: the well is {x1 - x0:.2f} x {y1 - y0:.2f} m: 0.6 m each way at least (R-F3)")
    d = f.get("dir")
    if d not in SIDES:
        bag.append(f'{where}: flight.dir is the wall the flight descends toward: one of {", ".join(SIDES)} (R-F4)')
        return done(None)
    v = {k: f.get(k, dv) for k, dv in FLIGHT_DEFAULTS.items()}
    if not (_num(v["riser"]) and 0.0 < v["riser"] <= STEP_MAX + e):
        bag.append(f"{where}: flight.riser is a step's height, over 0 and at most {STEP_MAX:g} m (R-F4)")
    if not (_num(v["tread"]) and 0.12 - e <= v["tread"] <= 0.45 + e):
        bag.append(f"{where}: flight.tread is a step's depth, 0.12 to 0.45 m (R-F4)")
    if not (_num(v["under"]) and 0.0 <= v["under"] <= 3.0 + e):
        bag.append(f"{where}: flight.under is the metres the flight runs on under the floor, 0 to 3 (R-F4)")
    if not (_num(v["rail_h"]) and 0.8 - e <= v["rail_h"] <= 1.2 + e):
        bag.append(f"{where}: flight.rail_h is the balustrade's height, 0.8 to 1.2 m (R-F5)")
    if len(bag) > n0:
        return done(None)
    on_wall = [s for s, ok in (("W", abs(x0 - sc.x0) < e), ("E", abs(x1 - sc.x1) < e), ("S", abs(y0 - sc.y0) < e),
                               ("N", abs(y1 - sc.y1) < e)) if ok]
    rail = f.get("rail", [s for s in SIDES if s not in on_wall])
    if not (isinstance(rail, (list, tuple)) and all(s in SIDES for s in rail) and len(set(rail)) == len(rail)):
        bag.append(f"{where}: flight.rail lists the well's edges with a balustrade, each one of {', '.join(SIDES)} "
                   f"once (R-F5)")
        return done(None)
    for s in rail:
        if s in on_wall:
            bag.append(f"{where}: flight.rail {s}: the well's {s} edge is on the {s} wall (R-F5)")
    head = {"N": y0, "S": y1, "E": x0, "W": x1}[d]
    length = (y1 - y0) if d in ("N", "S") else (x1 - x0)
    room_end = {"N": sc.y1, "S": sc.y0, "E": sc.x1, "W": sc.x0}[d]
    riser, tread, under = float(v["riser"]), float(v["tread"]), float(v["under"])
    if abs(room_end - head) < length + under - e:
        bag.append(f"{where}: the flight runs {length + under:.2f} m from its head edge, past the {d} wall (it has "
                   f"{abs(room_end - head):.2f} m) (R-F6)")
    run = length + under
    n = max(1, int(math.ceil(run / tread - 1e-9)))
    steps = [[round((i - 1) * tread, 6), round(min(i * tread, run), 6), round(-i * riser, 6)] for i in range(1, n + 1)]
    if under > e:
        edge = next(s_ for s_ in steps if s_[1] > length + e)[2]
        if edge > -(FLOOR_T + HEADROOM_MIN) + e:
            bag.append(f"{where}: the tread under the well's far edge stands at {edge:.2f} m: "
                       f"{FLOOR_T + HEADROOM_MIN:.2f} m under the floor at least (a steeper flight or a longer well) "
                       f"(R-F7)")
    bottom = round(-n * riser - 0.12, 6)
    bx = [x0 - (RAIL_OUT if "W" in rail else 0.0), y0 - (RAIL_OUT if "S" in rail else 0.0),
          x1 + (RAIL_OUT if "E" in rail else 0.0), y1 + (RAIL_OUT if "N" in rail else 0.0)]
    out = dict(well=[x0, y0, x1, y1], dir=d, riser=riser, tread=tread, under=under, rail=list(rail),
               rail_h=float(v["rail_h"]), head=head, length=round(length, 6), steps=steps, bottom=bottom,
               on_wall=on_wall, box=[round(bx[0], 6), round(bx[1], 6), 0.0, round(bx[2], 6), round(bx[3], 6),
                                     float(v["rail_h"])])
    return done(out)


def hatch_values(h, sc, foot, where: str = "the hatch", bag: Problems | None = None) -> dict | None:
    """A floor hatch's numbers (G12, third part) with every default filled, in room metres: its `state` (boarded: shut,
    walked over), the leaf's `size` [along x, along y] centred on the marker's `foot`, the `hinge` edge (a wall's
    letter: the edge the hinges run along). Derived: the leaf's `box` [x0, y0, x1, y1] and the frame's `outer` box
    (HATCH_FRAME round it). Holds R-T1 to R-T3. `sc` needs the room's x0, x1, y0, y1. With no `bag` it stops on a
    problem; with one it adds to it."""
    own = bag is None
    bag = Problems("the room file") if own else bag
    n0 = len(bag)

    def done(v):
        if own:
            bag.stop()
        return v if len(bag) == n0 else None

    if not isinstance(h, dict):
        bag.append(f"{where}: hatch is an object (R-T1)")
        return done(None)
    _strict(h, HATCH_KEYS, f"{where}.hatch", "hatch", bag)
    v = {k: h.get(k) if h.get(k) is not None else d for k, d in HATCH_DEFAULTS.items()}
    if v["state"] not in HATCH_STATES:
        bag.append(f'{where}: hatch.state is one of {", ".join(HATCH_STATES)} (R-T2)')
    elif v["state"] not in HATCH_BUILT:
        bag.append(f'{where}: hatch.state "{v["state"]}" is not built yet; the builder has: '
                   f'{", ".join(HATCH_BUILT)} (R-T2)')
    if not (_nums(v["size"], 2) and all(0.5 <= float(x) <= 1.5 for x in v["size"])):
        bag.append(f"{where}: hatch.size is the leaf's [along x, along y], each 0.5 to 1.5 m (R-T2)")
        return done(None)
    if v["hinge"] not in SIDES:
        bag.append(f'{where}: hatch.hinge is the edge its hinges run along: one of {", ".join(SIDES)} (R-T2)')
    fx, fy = float(foot[0]), float(foot[1])
    w, d = (float(x) for x in v["size"])
    box = [round(fx - w / 2, 6), round(fy - d / 2, 6), round(fx + w / 2, 6), round(fy + d / 2, 6)]
    F = HATCH_FRAME
    outer = [round(box[0] - F, 6), round(box[1] - F, 6), round(box[2] + F, 6), round(box[3] + F, 6)]
    gap = min(outer[0] - sc.x0, outer[1] - sc.y0, sc.x1 - outer[2], sc.y1 - outer[3])
    if gap < HATCH_CLEAR - 1e-9:
        bag.append(f"{where}: the hatch's frame {outer} stands {gap:.2f} m from a wall (the room x {sc.x0:g}..{sc.x1:g}, "
                   f"y {sc.y0:g}..{sc.y1:g}): {HATCH_CLEAR:g} m at least, the leaf centred on its marker (R-T3)")
    return done(dict(state=v["state"], size=[w, d], hinge=v["hinge"], box=box, outer=outer, frame=F))


def _flight_up(f: dict, sc, where: str, bag: Problems, height) -> dict | None:
    """A flight up into the ceiling (G12, second part) with every default filled, in room metres: the `well` [x0, y0,
    x1, y1] is the hole in the ceiling and gives the flight its width across; treads `tread` deep and `riser` high rise
    from `base` (the first riser's line on `dir`'s axis; default the wall opposite `dir`) toward `dir`, through the
    hole and on above the ceiling for `over` metres past its far edge. Derived: `head` (= base), `near` and `far` (the
    hole's edges as u from the base), `length` (= far: the flight's run under the ceiling), the `steps` [u0, u1, top
    z], `top` (the shaft's cap), `on_wall`, an empty `rail` and the collision box `box` [x0, y0, 0, x1, y1, height]
    over the flight's run under the ceiling (its base to the hole's far edge). Holds R-F9 to R-F12 (with R-F3, R-F4
    and R-F6 as a flight down reads them)."""
    n0 = len(bag)
    e = 1e-6
    if not _num(height) or height <= 0:
        bag.append(f"{where}: a flight up needs the room's height (R-F9)")
        return None
    H = float(height)
    w = f.get("well")
    if not (_nums(w, 4) and w[0] < w[2] and w[1] < w[3]):
        bag.append(f"{where}: flight.well is the hole in the ceiling, [x0, y0, x1, y1] in metres, x0 < x1 and y0 < y1 "
                   f"(R-F3)")
        return None
    x0, y0, x1, y1 = (float(v) for v in w)
    if x0 < sc.x0 - e or x1 > sc.x1 + e or y0 < sc.y0 - e or y1 > sc.y1 + e:
        bag.append(f"{where}: the well {[x0, y0, x1, y1]} reaches out of the room (x {sc.x0:g}..{sc.x1:g}, "
                   f"y {sc.y0:g}..{sc.y1:g}) (R-F3)")
    if min(x1 - x0, y1 - y0) < 0.6 - e:
        bag.append(f"{where}: the well is {x1 - x0:.2f} x {y1 - y0:.2f} m: 0.6 m each way at least (R-F3)")
    d = f.get("dir")
    if d not in SIDES:
        bag.append(f'{where}: flight.dir is the wall the flight rises toward: one of {", ".join(SIDES)} (R-F4)')
        return None
    if f.get("under") is not None or f.get("rail") is not None or f.get("rail_h") is not None:
        bag.append(f"{where}: a flight up has no under, rail or rail_h (a string closes its open sides) (R-F9)")
    v = {k: f.get(k, dv) for k, dv in FLIGHT_UP_DEFAULTS.items()}
    sg = 1.0 if d in ("N", "E") else -1.0
    base = f.get("base", {"N": sc.y0, "S": sc.y1, "E": sc.x0, "W": sc.x1}[d])
    if not _num(base):
        bag.append(f"{where}: flight.base is the first riser's line, in metres on the {d} wall's axis (R-F10)")
        return None
    base = float(base)
    if not (_num(v["riser"]) and 0.0 < v["riser"] <= STEP_MAX + e):
        bag.append(f"{where}: flight.riser is a step's height, over 0 and at most {STEP_MAX:g} m (R-F4)")
    if not (_num(v["tread"]) and 0.12 - e <= v["tread"] <= 0.45 + e):
        bag.append(f"{where}: flight.tread is a step's depth, 0.12 to 0.45 m (R-F4)")
    if not (_num(v["over"]) and 0.0 <= v["over"] <= 3.0 + e):
        bag.append(f"{where}: flight.over is the metres the flight runs on above the ceiling, 0 to 3 (R-F4)")
    if len(bag) > n0:
        return None
    lo_a, hi_a = (sc.y0, sc.y1) if d in ("N", "S") else (sc.x0, sc.x1)
    if not (lo_a - e <= base <= hi_a + e):
        bag.append(f"{where}: flight.base {base:g} is out of the room ({lo_a:g}..{hi_a:g}) (R-F10)")
        return None
    lo_d, hi_d = (y0, y1) if d in ("N", "S") else (x0, x1)
    near, far = sorted(((lo_d - base) * sg, (hi_d - base) * sg))
    if near < -e:
        bag.append(f"{where}: the well starts {-near:.2f} m behind the flight's base: the hole lies along the flight, "
                   f"from its base toward {d} (R-F10)")
        return None
    riser, tread, over = float(v["riser"]), float(v["tread"]), float(v["over"])
    run = far + over
    room_end = {"N": sc.y1, "S": sc.y0, "E": sc.x1, "W": sc.x0}[d]
    if abs(room_end - base) < run - e:
        bag.append(f"{where}: the flight runs {run:.2f} m from its base, past the {d} wall (it has "
                   f"{abs(room_end - base):.2f} m) (R-F6)")
    n = max(1, int(math.ceil(run / tread - 1e-9)))
    steps = [[round((i - 1) * tread, 6), round(min(i * tread, run), 6), round(i * riser, 6)] for i in range(1, n + 1)]
    low = [s_ for s_ in steps if s_[0] < near - e and H - s_[2] < HEAD_CLEAR - e]
    if low:
        bag.append(f"{where}: the tread at {low[0][0]:.2f} m from the base stands {H - low[0][2]:.2f} m under the "
                   f"ceiling, short of the hole: {HEAD_CLEAR:g} m at least (start the hole nearer the base) (R-F11)")
    through = [s_ for s_ in steps if s_[1] > far + e and s_[2] < H - e]
    if through:
        bag.append(f"{where}: the tread at {through[0][0]:.2f} m from the base runs past the hole's far edge at "
                   f"{through[0][2]:.2f} m, under the ceiling ({H:g} m): a longer hole or a steeper flight (R-F12)")
    if steps[-1][2] < H + e:
        bag.append(f"{where}: the flight's top tread stands at {steps[-1][2]:.2f} m: it must rise over the ceiling "
                   f"({H:g} m) (R-F12)")
    if len(bag) > n0:
        return None
    on_wall = [s for s, ok in (("W", abs(x0 - sc.x0) < e), ("E", abs(x1 - sc.x1) < e), ("S", abs(y0 - sc.y0) < e),
                               ("N", abs(y1 - sc.y1) < e)) if ok]
    end = base + sg * far
    if d in ("N", "S"):
        bx = [x0, min(base, end), x1, max(base, end)]
    else:
        bx = [min(base, end), y0, max(base, end), y1]
    return dict(up=True, well=[x0, y0, x1, y1], dir=d, riser=riser, tread=tread, over=over, base=base, head=base,
                near=round(near, 6), far=round(far, 6), length=round(far, 6), steps=steps,
                top=round(steps[-1][2] + SHAFT_UP, 6), on_wall=on_wall, rail=[],
                box=[round(bx[0], 6), round(bx[1], 6), 0.0, round(bx[2], 6), round(bx[3], 6), H])


def _opening_rows(row: dict, sc: Scene, legacy: bool, bag: Problems) -> list:
    """The openings, as one list of entries with every default filled (R-O1 to R-O11)."""
    if legacy:
        d, w = row["door"], row["window"]
        src = [dict(id=d.get("portal"), kind="door", portal=d.get("portal"), width=d.get("width"),
                    height=d.get("height"), knob=d.get("knob", "E")),
               dict(id=w.get("prop"), kind="window", prop=w.get("prop"), width=w.get("width"), sill=w.get("sill"),
                    head=w.get("head"), panes=w.get("panes"), rod=w.get("rod"), curtains=True,
                    curtain_colour=w.get("curtain_colour"), swag=w.get("swag", False))]
    else:
        src = [dict(o) for o in row.get("openings") or ()]
    portals = {p["id"]: p for p in sc.portals}
    out, ids, ids3 = [], {}, {}
    first_window = True
    for i, o in enumerate(src):
        where = f"openings[{i}]" + (f" ({o.get('id')})" if o.get("id") else "")
        kind = o.get("kind")
        if kind not in KINDS:
            bag.append(f'{where}: kind "{kind}" is not one of {", ".join(KINDS)} (R-O1)')
            continue
        if kind != "window" and o.get("portal") is not None and o.get("portal") not in portals:
            bag.append(f'{where}: portal "{o.get("portal")}" is not in the scene (its portals: '
                       f'{", ".join(sorted(portals)) or "none"}) (R-O3)')
            continue
        if kind == "window" and o.get("prop") not in sc.by_id:
            bag.append(f'{where}: prop "{o.get("prop")}" is not in the scene (R-O3)')
            continue
        if kind in MARKERS and not o.get("portal"):
            bag.append(f"{where}: a {kind} names its scene portal (R-O1)")
            continue
        if kind == "door" and not o.get("portal") and not o.get("prop"):
            bag.append(f"{where}: a door names its scene portal, or a prop for a closed door with no portal (R-O1)")
            continue
        if kind == "door" and not o.get("portal") and o.get("prop") not in sc.by_id:
            bag.append(f'{where}: prop "{o.get("prop")}" is not in the scene (R-O3)')
            continue
        oid = o.get("id") or (o.get("portal") if kind != "window" else o.get("prop"))
        if oid in ids:
            bag.append(f"openings: the id {oid} stands twice (R-O2)")
        s3 = three_name(oid)
        if s3 in ids3 and ids3[s3] != oid:
            bag.append(f'openings: the ids "{ids3[s3]}" and "{oid}" read the same in three.js (R-O2)')
        ids[oid], ids3[s3] = i, oid
        if o.get("in") is not None:
            bag.append(f'{where}: "in": wall-pieces are not built yet (G21) (R-O11)')
        tile_of = portals[o["portal"]] if o.get("portal") else sc.by_id[o["prop"]]
        tx, ty = tile_of["x"], tile_of["y"]
        side = o.get("side") or sc.border_side(tx, ty)
        if side is None:
            near = [s for s, ok in (("N", ty == 1), ("S", ty == sc.h - 2), ("W", tx == 1), ("E", tx == sc.w - 2)) if ok]
            bag.append(f"{where}: {o.get('portal') or o.get('prop')} is on an inner tile ({tx}, {ty})"
                       + (f" that touches the {' and '.join(near)} walls" if near else "") + ': give "side" (R-O5)')
            continue
        if side == "floor" and kind not in ("hatch", "drop"):
            bag.append(f'{where}: side "floor" is for a hatch or a drop (R-O5b)')
            continue
        if side not in SIDES + ("floor",):
            bag.append(f'{where}: side "{side}" is one of N, E, S, W, floor')
            continue
        cx, cy = sc.centre(tx, ty)
        e = dict(id=oid, kind=kind, portal=o.get("portal"), prop=o.get("prop"), side=side, tile=[tx, ty],
                 inner=sc.border_side(tx, ty) is None)
        if o.get("hatch") is not None and not (kind == "hatch" and side == "floor"):
            bag.append(f"{where}: a hatch object is a hatch opening's in the floor (R-T1)")
            continue
        if side == "floor":
            if o.get("at") is not None:
                bag.append(f'{where}: a hatch or a drop in the floor has no "at" (R-O5b)')
            e.update(at=None, foot=list(o.get("foot") or (cx, cy)), cut=False)
            if o.get("hatch") is not None:          # a visible trap hatch (G12, third part): the walker steps on it
                hv = hatch_values(o["hatch"], sc, e["foot"], where, bag)
                if hv is not None:
                    e["hatch"] = hv
            out.append(e)
            continue
        centre_along = cx if side in ("N", "S") else cy
        at = o.get("at", centre_along)
        if not _num(at):
            bag.append(f"{where}: at is the opening's centre along its wall, in metres")
            continue
        if abs(at - centre_along) > 0.5 + 1e-9:
            bag.append(f'{where}: "at" {at:g} is {abs(at - centre_along):.2f} m from its tile\'s centre '
                       f'({centre_along:g}): the limit is 0.5 m (R-O10)')
        e["at"] = at
        if kind == "door":
            e.update({k: o.get(k) if o.get(k) is not None else v for k, v in DOOR_DEFAULTS.items()})
            knob = o.get("knob", KNOB_DEFAULT[side])
            if knob not in KNOB_ENDS[side]:
                bag.append(f'{where}: knob "{knob}" on the {side} wall: the ends are "{KNOB_ENDS[side][0]}" and '
                           f'"{KNOB_ENDS[side][1]}" (R-O2b)')
            e["knob"] = knob
            if e["style"] not in DOOR_STYLES:
                bag.append(f'{where}: style "{e["style"]}" is not built yet (G13); the builder has: '
                           f'{", ".join(DOOR_STYLES)} (R-O8)')
        elif kind == "window":
            e.update({k: o.get(k) if o.get(k) is not None else v for k, v in WINDOW_DEFAULTS.items()})
            if e["style"] not in WINDOW_STYLES:
                bag.append(f'{where}: style "{e["style"]}" is not built yet (G14); the builder has: '
                           f'{", ".join(WINDOW_STYLES)} (R-O8)')
            if e["curtains"] and not o.get("curtain_colour"):
                bag.append(f"{where}: curtains need a curtain_colour")
            e["curtain_colour"] = o.get("curtain_colour")
            default_out = "snow" if (first_window and isinstance(row.get("outside"), dict)) else "sky"
            e["outside"] = o.get("outside", default_out)
            if e["outside"] == "snow" and not isinstance(row.get("outside"), dict):
                bag.append(f'{where}: outside "snow" needs the room\'s "outside" block (R-O9)')
            first_window = False
        else:
            e["width"] = o.get("width", DOOR_DEFAULTS["width"])
        if o.get("flight") is not None and kind != "stairs":
            bag.append(f"{where}: a flight is a stairs opening's (R-F1)")
        e["cut"] = kind in ("door", "window")
        if o.get("foot") is not None:
            e["foot"] = list(o["foot"])
        elif e["inner"]:
            e["foot"] = [cx, cy]
        else:
            fx = at if side in ("N", "S") else (sc.x1 if side == "E" else sc.x0)
            fy = at if side in ("E", "W") else (sc.y1 if side == "N" else sc.y0)
            e["foot"] = [fx, fy]
        if o.get("flight") is not None and kind == "stairs":
            fv = flight_values(o["flight"], sc, where, bag, height=row.get("height"))
            if fv is not None:
                e["flight"] = fv
                b_ = fv["box"]          # a flight up: the walker meets the portal at the flight's foot (R-F8)
                x0, y0, x1, y1 = (b_[0], b_[1], b_[3], b_[4]) if fv.get("up") else fv["well"]
                fx, fy = e["foot"][:2]
                gap = math.hypot(max(x0 - fx, 0.0, fx - x1), max(y0 - fy, 0.0, fy - y1))
                if gap > 1.0 + 1e-9:
                    bag.append(f"{where}: its foot ({fx:g}, {fy:g}) is {gap:.2f} m from its well: at most 1 m, so "
                               f"the walker meets the portal at the well's rail (R-F8)")
        out.append(e)
    # R-O4, R-O4b: every scene portal and window prop has its opening, or a skip
    skip = row.get("skip") or {}
    named = [e["portal"] for e in out if e["portal"]]
    for pt in sc.portals:
        n = named.count(pt["id"])
        if n == 0 and pt["id"] not in skip:
            bag.append(f'the scene\'s portal {pt["id"]} has no opening: add {{"kind": "{pt.get("kind", "door")}", '
                       f'"portal": "{pt["id"]}"}} (R-O4)')
        elif n > 1:
            bag.append(f"the scene's portal {pt['id']} has {n} openings: one (R-O4)")
    wins = {e["prop"] for e in out if e["kind"] == "window"}
    for p in sc.props:
        if sc.is_window_prop(p["id"]) and p["id"] not in wins and p["id"] not in skip:
            bag.append(f"the scene's window prop {p['id']} has no opening: add a window, or name it under \"skip\" "
                       f"with a reason (R-O4b)")
    # R-O9: snow windows on one wall
    snow = sorted({e["side"] for e in out if e["kind"] == "window" and e.get("outside") == "snow"})
    if len(snow) > 1:
        bag.append(f"snow windows on the {' and '.join(snow)} walls: the others say \"sky\" until G14 (R-O9)")
    # R-O6, R-O7, R-O7b
    walls = {}
    for e in out:
        if e["side"] in SIDES and e["kind"] in ("door", "window"):
            ext = CURTAIN_W if e["kind"] == "window" and e.get("curtains") else ARCH_W
            walls.setdefault(e["side"], []).append((e["at"] - e["width"] / 2 - ext, e["at"] + e["width"] / 2 + ext,
                                                    e["id"]))
    for side, rows_ in walls.items():
        lo, hi = (sc.x0, sc.x1) if side in ("N", "S") else (sc.y0, sc.y1)
        rows_.sort()
        for (a0, b0, i0), (a1, b1, i1) in zip(rows_, rows_[1:]):
            if a1 - b0 < 0.1:
                bag.append(f"openings {i0} and {i1} overlap on the {side} wall (with their trims and curtains: "
                           f"{a0:.2f}..{b0:.2f} and {a1:.2f}..{b1:.2f}; 0.1 m apart at least) (R-O6)")
        for a0, b0, i0 in rows_:
            if a0 < lo + 0.05 or b0 > hi - 0.05:
                bag.append(f"opening {i0} reaches a corner of the {side} wall with its trims ({a0:.2f}..{b0:.2f}, "
                           f"the wall {lo:g}..{hi:g}) (R-O6)")
    rail = row.get("picture_rail")
    if _num(rail):
        for e in out:
            top = e.get("height") if e["kind"] == "door" else e.get("head") if e["kind"] == "window" else None
            if _num(top) and top + ARCH_W + 0.03 > rail - 0.02:
                bag.append(f"opening {e['id']}: its top at {top:g} m and its architrave would touch the picture rail "
                           f"at {rail:g} m; lower it or raise the rail" + (" (or set picture_rail to null)" if
                                                                          e["kind"] == "window" else "")
                           + (" (R-O7)" if e["kind"] == "door" else " (R-O7b)"))
    ck, cn = row.get("picture_rail"), row.get("cornice")
    if _num(ck) and _num(cn) and _num(row.get("height")) and ck + 0.03 > row["height"] - cn:
        bag.append(f"picture_rail {ck:g} m and cornice {cn:g} m do not fit under a ceiling of {row['height']:g} m (R-S1)")
    return out


def _resolve_pieces(row: dict, sc: Scene, bag: Problems) -> dict:
    """Each piece's place and grey-box size with a `null` taken from the scene (R-P6: the covered tiles of a run, or a
    footprint prop's own), and its reference point (R-P7: the footprint's centre, else the centroid of the tiles of its
    own id and its `covers`, else none)."""
    out = {}
    for p in row["pieces"]:
        pid = p["id"]
        src = sc.by_id.get(pid)
        covers = list(p.get("covers") or ())
        tiles = ([(src["x"], src["y"])] if src else []) + [(sc.by_id[c]["x"], sc.by_id[c]["y"]) for c in covers
                                                           if c in sc.by_id]
        fpc = sc.footprint_centre(src) if src else None
        if fpc is not None:
            ref = fpc
        elif tiles:
            cs = [sc.centre(*t) for t in tiles]
            ref = (sum(c[0] for c in cs) / len(cs), sum(c[1] for c in cs) / len(cs))
        else:
            ref = None
        spec = p.get("spec") if isinstance(p.get("spec"), dict) else {}
        size = spec.get("size") if spec.get("model") == "box" else None
        pl = list(p.get("place") or ())
        nulls = [j for j, v in enumerate(pl) if j > 0 and v is None] + ([0] if size and size[0] is None else [])
        res = dict(place=pl, size=list(size) if size else None, ref=[round(ref[0], 4), round(ref[1], 4)] if ref else None,
                   tiles=[list(t) for t in tiles], footprint=bool(fpc))
        if nulls:
            where = f"piece {pid}"
            if not (covers or fpc is not None):
                bag.append(f"{where}: place or size has a null: only a piece with \"covers\" or a footprint prop may take "
                           f"it from the scene (R-P6)")
                out[pid] = res
                continue
            face = p.get("face", "S")
            along_x = face in ("N", "S")       # the piece's width runs along x when it faces north or south
            if fpc is not None:
                f = src["footprint"]
                length = float(f["w"] if along_x else f["h"])
                cx, cy = fpc
            else:
                xs, ys = {t[0] for t in tiles}, {t[1] for t in tiles}
                if len(xs) > 1 and len(ys) > 1:
                    bag.append(f"{where}: its covered tiles are not in one row or column (R-P6)")
                    out[pid] = res
                    continue
                if size and size[0] is None and len(tiles) > 1 and len(ys if along_x else xs) != 1:
                    bag.append(f"{where}: size[0] is null but its covered tiles do not run along its width (it faces "
                               f"{face}) (R-P6)")
                    out[pid] = res
                    continue
                span = (max(xs) - min(xs) + 1) if along_x else (max(ys) - min(ys) + 1)
                length = float(span)
                cx, cy = ref
            if size and size[0] is None:
                res["size"] = [length] + list(size[1:])
            if pl and pl[0] == "at":
                res["place"] = ["at", cx if pl[1] is None else pl[1], cy if pl[2] is None else pl[2]]
            elif pl and pl[0] == "wall" and pl[2] is None:
                res["place"] = ["wall", pl[1], cx if pl[1] in ("N", "S") else cy]
            res["fromScene"] = True
        out[pid] = res
    return out


def _coverage(row: dict, sc: Scene, openings: list, bag: Problems) -> tuple:
    """R-P2, R-P2b, R-P2c and R-B4: where every scene prop and spot went, and each under-bed spot's bed piece."""
    pieces = {p["id"]: p for p in row["pieces"]}
    skip = row.get("skip") or {}
    scene_ids = set(sc.by_id) | {p["id"] for p in sc.portals}
    for k in skip:
        if k not in scene_ids:
            bag.append(f"skip names {k}, which is not in the scene (R-P2c)")
    for pid, p in pieces.items():
        for c in p.get("covers") or ():
            if c not in sc.by_id:
                bag.append(f"piece {pid}: covers {c}, which is not in the scene (R-P2c)")
        if pid not in sc.by_id and not p.get("decor"):
            bag.append(f'piece {pid} is not in the scene: a piece of the first person\'s own says "decor": true '
                       f'(R-P2b)')
    beds = []
    for pid, p in pieces.items():
        sp = merged_spec(p)
        if (sp or {}).get("bed") or (sp is None and p.get("key") == "bed"):
            beds.append(pid)
    cover = {}
    for pid, p in pieces.items():
        if pid in sc.by_id:
            cover[pid] = dict(by="piece", id=pid)
    for e in openings:
        if e["kind"] == "window" or (e["kind"] == "door" and not e.get("portal") and e.get("prop")):
            cover.setdefault(e["prop"], dict(by="opening", id=e["id"]))
    for pid, p in pieces.items():
        for c in p.get("covers") or ():
            if c in sc.by_id:
                cover.setdefault(c, dict(by="covers", id=pid))
    under, first_bed = {}, (beds[0] if beds else None)
    for s in sc.spots:
        if s.get("variant") != "underBed":
            continue
        beside = [q["id"] for q in sc.props if q.get("kind") in BED_KINDS
                  and abs(q["x"] - s["x"]) + abs(q["y"] - s["y"]) == 1 and q["id"] in beds]
        named = [pid for pid in beds if s["id"] in (pieces[pid].get("covers") or ())]
        bed = (named or beside or [None])[0]
        if s["id"] in pieces:
            continue                                 # the spot is a piece of its own
        if bed is None:
            bag.append(f'spot {s["id"]} (underBed) has no bed prop beside it: add a bed piece with "covers": '
                       f'["{s["id"]}"] ("decor": true) (R-B4)')
            continue
        under[s["id"]] = bed
        cover.setdefault(s["id"], dict(by="underBed", id=bed))
    for k, why in skip.items():
        if k in sc.by_id:
            cover.setdefault(k, dict(by="skip", reason=why))
    for r in sc.props + sc.spots:
        if r["id"] not in cover:
            what = "spot" if r in sc.spots else "prop"
            bag.append(f'the scene\'s {what} {r["id"]} has no piece: add one (a grey box: {{"spec": {{"model": "box", '
                       f'"size": [w, d, h], "label": "..."}}}}), or name it under "skip" with a reason (R-P2)')
    return cover, under, first_bed


def _lights(row: dict, sc: Scene, openings: list, legacy: bool, bag: Problems) -> tuple:
    """The night lights (R-L1 to R-L9): role, group, anchor, window, pool; and the dropped ones with the reason."""
    entries = {lt.get("id"): lt for lt in row.get("lights") or ()}
    pieces = {p["id"]: p for p in row["pieces"]}
    scene_lights = {lt["id"]: lt for lt in sc.lights}
    for lid, ent in entries.items():
        if lid not in scene_lights:
            bag.append(f"lights: {lid} is not a scene light (R-L1)")
        elif not sc.night(scene_lights[lid]):
            bag.append(f"lights: {lid} is a {' and '.join(scene_lights[lid]['phases'])} light: a night room does not "
                       f"build it; remove the entry (R-L1)")
    # the piece standing on a tile: a scene prop that is a piece, or a prop a piece covers (a run), or a footprint
    on_tile = {}
    for q in sc.props:
        tiles = [(q["x"], q["y"])]
        f = q.get("footprint")
        if f:
            tiles += [(x, y) for y in range(f["y"], f["y"] + f["h"]) for x in range(f["x"], f["x"] + f["w"])]
        owner = q["id"] if q["id"] in pieces else next((pid for pid, p in pieces.items()
                                                        if q["id"] in (p.get("covers") or ())), None)
        if owner:
            for t in tiles:
                on_tile.setdefault(t, owner)
    windows = [e for e in openings if e["kind"] == "window"]
    out, dropped = [], []
    for lt in sc.lights:
        if not sc.night(lt):
            dropped.append(dict(id=lt["id"], reason=f"a {' and '.join(lt.get('phases') or ())} light: the walk is night"))
            continue
        ent = entries.get(lt["id"], {})
        role = ent.get("role") or ("teal" if lt.get("color") == "teal" else "cold" if lt.get("color") == "moon" and
                                   lt.get("kind") == "lamp" else KIND_ROLE.get(lt.get("kind")))
        if role is None:
            bag.append(f"light {lt['id']}: kind {lt.get('kind')!r} has no role (the roles: "
                       f"{', '.join(sorted(ROLE_GROUP))}); give one (R-L4)")
            continue
        r = dict(id=lt["id"], kind=lt.get("kind"), role=role, group=ent.get("group") or ROLE_GROUP.get(role, "candle"),
                 tile=[lt["x"], lt["y"]], name=ent.get("name") or lt["id"],
                 pool=bool(ent.get("pool", ROLE_POOL.get(role, False))),
                 radiusTiles=float(lt.get("radiusTiles", 2)))
        for k in ("power", "color", "radius"):     # the entry's own values over its role's look entry (S5)
            if ent.get(k) is not None:
                r[k] = ent[k]
        if "glow" in ent:
            r["glow"] = ent["glow"]
        if role == "moon":
            r["pool"] = False
            win = ent.get("window")
            if win is None:
                same = [e for e in windows if e["tile"] == [lt["x"], lt["y"]]]
                near = sorted(windows, key=lambda e: abs(e["tile"][0] - lt["x"]) + abs(e["tile"][1] - lt["y"]))
                win = (same or near or [None])[0]
                win = win["id"] if win else None
            if not windows:
                bag.append(f"{sc.id} has no window: the moon light {lt['id']} has nothing to shine through (R-L8)")
                continue
            if win not in {e["id"] for e in windows}:
                bag.append(f'light {lt["id"]}: its window "{win}" is not a window opening of this file (R-L5)')
                continue
            r["window"] = win
            out.append(r)
            continue
        a = ent.get("anchor")
        if a is None:
            pid = on_tile.get((lt["x"], lt["y"]))
            if pid is None:
                bag.append(f'light {lt["id"]}: no piece stands on its tile ({lt["x"]}, {lt["y"]}) and it has no '
                           f'"anchor"; give one (R-L2)')
                continue
            a = dict(piece=pid)
        if "piece" in a:
            if a["piece"] not in pieces:
                bag.append(f"light {lt['id']}: its anchor's piece {a['piece']} is not a piece of this file (R-L3)")
                continue
            if "offset" not in a:
                sp = merged_spec(pieces[a["piece"]])
                want = a.get("name") or ("fire" if (sp or {}).get("model") == "hearth" else "flame")
                a = dict(a, name=want)
                if sp is not None and want not in anchor_names(sp):
                    bag.append(f'light {lt["id"]}: piece {a["piece"]} has no anchor "{want}" (a hearth gives "fire", '
                               f'a candle stand "flame", any piece what its "anchors" declare) (R-L3)')
                    continue
        elif "wall" in a:
            if a["wall"] not in SIDES or not _num(a.get("z")) or not _num(a.get("along")):
                bag.append(f'light {lt["id"]}: a wall anchor is {{"wall": side, "along": m, "out": m, "z": m}} (R-L2)')
                continue
        elif "at" not in a:
            bag.append(f"light {lt['id']}: an anchor names a piece, a wall or a point \"at\" (R-L2)")
            continue
        r["anchor"] = a
        out.append(r)
    # groups (R-L6), exposure_from (R-L7), the moon's walls (R-L9)
    if legacy:
        groups = list(LEGACY_GROUPS)
    else:
        used = [r["group"] for r in out]
        groups = [g for g in ("candle", "fire") if g in used]
        groups += [g for g in dict.fromkeys(used) if g not in GROUP_ORDER]
        groups += [g for g in ("moon",) if g in used] + ["fill"]
    if len(groups) > MAX_GROUPS:
        bag.append(f"the room bakes {len(groups)} light groups ({', '.join(groups)}): at most {MAX_GROUPS} (each is one "
                   f"full bake, about 1.3 s per 1,000 vertices) (R-L6)")
    by_id = {r["id"]: r for r in out}
    if "exposure_from" in row:
        ef = list(row["exposure_from"] or ())
        for lid in ef:
            if lid not in by_id:
                bag.append(f"exposure_from: {lid} is not a night light of the room (R-L7)")
            elif by_id[lid]["role"] == "moon" or not by_id[lid]["pool"]:
                bag.append(f"exposure_from: {lid} is a {by_id[lid]['role']} light; its pool cannot set the exposure "
                           f"(R-L7)")
    else:
        ef = [r["id"] for r in out if r["pool"]] or [r["id"] for r in out if r["role"] != "moon"][:1]
    sides = sorted({e["side"] for e in openings if e["id"] in {r.get("window") for r in out}})
    moon = row.get("moon") if isinstance(row.get("moon"), dict) else {}
    if len(sides) > 1 and ("bearing" not in moon or "azimuth" in moon):
        bag.append(f"the moon-lit windows stand on the {' and '.join(sides)} walls: give moon.bearing (a compass "
                   f"angle) in place of moon.azimuth (R-L9)")
    hosts = list(dict.fromkeys(r["anchor"]["piece"] for r in out if "piece" in (r.get("anchor") or {})))
    return out, dropped, groups, ef, hosts


def _names(row: dict, sc: Scene, openings: list, lights: list, legacy: bool, bag: Problems) -> list:
    """R0.4: the node names the room adds, each unique after three.js strips it."""
    P = f"{sc.id}_"
    names = []
    for p in row["pieces"]:
        names.append(("piece " + p["id"], P + (p.get("name") or p["id"]).replace(".", "_")))
    if legacy:
        names += [("door", P + "Door"), ("door", P + "DoorKnob")]
        names += [("window", P + s) for s in ("Window", "WindowGlass", "SillSnow", "WindowArchitrave", "Curtains",
                                               "CurtainRod", "Swag")]
        names += [("light", P + "Light_candle"), ("light", P + "Light_moon")]
    else:
        for e in openings:
            base = e["id"].replace(".", "_")
            stems = ["Door", "DoorKnob"] if e["kind"] == "door" else \
                ["Window", "WindowGlass", "SillSnow", "WindowArchitrave", "Curtains", "CurtainRod", "Swag"] \
                if e["kind"] == "window" else []
            names += [("opening " + e["id"], f"{P}{s}_{base}") for s in stems]
        names += [("light " + r["id"], P + "Light_" + r["name"].replace(".", "_")) for r in lights]
    names += [("portal " + p["id"], "Portal_" + p["id"]) for p in sc.portals]
    names += [("spawn " + s["id"], f"Spawn_{sc.id}_{s['id']}") for s in sc.spawns]
    seen = {}
    for what, n in names:
        k = three_name(n)
        if k in seen and seen[k][1] != n:
            bag.append(f'the names "{seen[k][1]}" ({seen[k][0]}) and "{n}" ({what}) read the same in three.js '
                       f'(PropertyBinding strips . [ ] : /) (R0.4)')
        elif k in seen:
            bag.append(f'the name "{n}" stands twice ({seen[k][0]}, {what}) (R0.4)')
        seen[k] = (what, n)
    return [n for _w, n in names]


def derive(row: dict, scene: dict, shown: str = "", tasks: set | None = None) -> dict:
    """The room's reading against its scene (the RoomSpec). Stops with every problem it finds. `row` is load_room's
    (a layout applied or not); nothing is written into it."""
    sc = Scene(scene)
    bag = Problems(shown or f"{sc.id}'s room file")
    legacy = "openings" not in row
    value_rules(row, bag)
    # R0.5, R0.6
    labels = row.get("spawn_labels") or {}
    sp_ids = [s["id"] for s in sc.spawns]
    lacks = [s for s in sp_ids if s not in labels]
    extra = [s for s in labels if s not in sp_ids]
    if lacks:
        bag.append(f"spawn_labels lacks {', '.join(repr(s) for s in lacks)} (the scene's spawns: "
                   f"{', '.join(sp_ids) or 'none'}) (R0.5)")
    if extra:
        bag.append(f"spawn_labels names {', '.join(repr(s) for s in extra)}, which the scene has not (its spawns: "
                   f"{', '.join(sp_ids) or 'none'}) (R0.5)")
    if row.get("district") != sc.name:
        bag.append(f"district {row.get('district')!r} is not the scene's name {sc.name!r} (cc_struct compares each "
                   f"spawn's wdi_district with it) (R0.6)")
    openings = _opening_rows(row, sc, legacy, bag)
    resolved = _resolve_pieces(row, sc, bag)
    cover, under, first_bed = _coverage(row, sc, openings, bag)
    lights, dropped, groups, ef, hosts = _lights(row, sc, openings, legacy, bag)
    names = _names(row, sc, openings, lights, legacy, bag)
    moon = row.get("moon") if isinstance(row.get("moon"), dict) else {}
    if not legacy and any(r["role"] == "moon" for r in lights) and not (
            (_num(moon.get("azimuth")) or _num(moon.get("bearing"))) and _num(moon.get("elevation"))):
        bag.append('a moon light needs "moon": {"azimuth": degrees from straight out of its window toward the wall\'s '
                   '+s side, or "bearing": a compass angle toward the moon, and "elevation": degrees}')
    bag.stop()
    if legacy and first_bed is not None:
        # the legacy path keeps spot_rows' own rule: an under-bed spot is the first bed piece's (the bedroom's is
        # the bed beside it too)
        under = {s: first_bed for s in under}
    tasks = task_ids() if tasks is None else tasks
    task_pieces = sorted({r["id"] for r in sc.props if r["id"] in tasks or r.get("kind") in ("keyCache", "lockedDoor")})
    pending = []        # what this builder cannot build yet (none since G6 and G7: kept for the steps after)
    return dict(
        room=sc.id, schema="legacy" if legacy else "v2", names="legacy" if legacy else "v2", rules=SCHEMA,
        openings=openings, lights=lights, lightsDropped=dropped, groups=groups, exposureFrom=ef, hosts=hosts,
        coverage=cover, underBed=under, pieces=resolved, skip=dict(row.get("skip") or {}),
        spots=[s["id"] for s in sc.spots], taskPieces=task_pieces, plannedNames=names, pending=pending,
        moveLimitM=MOVE_LIMIT)


# ---------------------------------------------------------------- the lights' values and glows (G4, S5)

GLOW_SHAPES = {"cone": 2, "sphere": 1, "box": 3, "card": 2}    # a glow's shape and the numbers its `size` takes
EMIT_ROLES = ("flame", "bulb", "coal", "teal")                 # a glow's `material`: its look key is M_<material>
FLAME_GLOW = dict(shape="cone", size=[0.012, 0.035], material="flame")   # the default glow of a `flame` anchor
FILL_AREA_REF = 57.04                                          # the bedroom's fill panel (9.2 x 6.2 m), in m2


def light_values(lights: list, look: dict, candle: dict | None = None, shown: str = "") -> list:
    """Each night light's power (W), colour and radius (m) for the rig and the export, and its glow: its role's entry
    in the merged look's `lights`, under the file's `candle` block for a lamp (the legacy override, kept for v2),
    under the light entry's own `power`, `color` and `radius`. Stops when a role has no look entry (R-L4) or a glow is
    not one the builder makes. A moon light shines with the room's moon (the Sun's `strength`): no power here."""
    bag = Problems(shown or "the room file")
    roles = (look or {}).get("lights") or {}
    known = ", ".join(k for k in roles if isinstance(roles[k], dict))
    emit = (look or {}).get("emit_display") or {}
    out = []
    for r in lights:
        base = roles.get(r["role"])
        if not isinstance(base, dict):
            bag.append(f'light {r["id"]}: role "{r["role"]}" is not in the look\'s lights ({known}); add it to the '
                       f'room\'s "look" (R-L4)')
            continue
        v = {k: base[k] for k in ("power", "color", "radius") if k in base}
        if r["role"] == "lamp":
            v.update({k: candle[k] for k in ("power", "color", "radius") if k in (candle or {})})
        v.update({k: r[k] for k in ("power", "color", "radius") if r.get(k) is not None})
        if r["role"] != "moon":
            for k in ("power", "color"):
                if k not in v:
                    bag.append(f'light {r["id"]}: role "{r["role"]}" gives no {k} (the look\'s lights.{r["role"]})')
            v.setdefault("radius", 0.04)
        g = glow_of(r)
        if g is not None:
            _glow_rule(g, f"light {r['id']}", emit, bag)
        out.append(dict(v, glow=g))
    bag.stop()
    return out


def glow_of(r: dict):
    """A light's glow: its own (`false` for none), or the flame cone for a `flame` anchor, else none."""
    if "glow" in r:
        return r["glow"] or None
    a = r.get("anchor") or {}
    return dict(FLAME_GLOW) if r["role"] != "moon" and a.get("name") == "flame" else None


def _glow_rule(g, where: str, emit: dict, bag: Problems, need_at: bool = False) -> None:
    if not isinstance(g, dict):
        bag.append(f'{where}: a glow is false or {{"shape", "size", "material", "at"}}')
        return
    shape = g.get("shape")
    if shape not in GLOW_SHAPES:
        bag.append(f'{where}: glow shape {shape!r} is not one of {", ".join(GLOW_SHAPES)}')
    elif not (isinstance(g.get("size"), (list, tuple)) and len(g["size"]) == GLOW_SHAPES[shape]
              and all(_num(x) and x > 0 for x in g["size"])):
        bag.append(f"{where}: a {shape} glow's size is {GLOW_SHAPES[shape]} positive numbers in metres")
    if g.get("material") not in EMIT_ROLES:
        bag.append(f'{where}: glow material {g.get("material")!r} is not one of {", ".join(EMIT_ROLES)}')
    elif emit_key(g["material"]) not in emit:
        bag.append(f'{where}: the look has no emit_display entry {emit_key(g["material"])} for its glow; add it to '
                   f'the room\'s "look"')
    at = g.get("at")
    if at is None and need_at:
        bag.append(f'{where}: a piece\'s glow needs "at" (points in the piece\'s frame)')
    if at is not None and not (isinstance(at, (list, tuple)) and at and all(
            isinstance(q, (list, tuple)) and len(q) == 3 and all(_num(x) for x in q) for q in at)):
        bag.append(f'{where}: glow "at" is a list of [x, y, z] points')


def piece_glows(row: dict, look: dict, shown: str = "") -> dict:
    """The light-less glows the pieces declare (`spec.glow`, its `at` required, and a hearth's `firebox.glow`, its
    coals by default): {piece id: glow}."""
    bag = Problems(shown or "the room file")
    emit = (look or {}).get("emit_display") or {}
    out = {}
    for p in row.get("pieces") or ():
        spec = p.get("spec") if isinstance(p.get("spec"), dict) else {}
        if spec.get("model") == "hearth":       # the coals in its firebox (G6), their size and place filled
            hv = hearth_values(spec, row.get("height"), f"piece {p['id']}")
            if hv["glow"]:
                _glow_rule(hv["glow"], f"piece {p['id']}: its firebox", emit, bag, need_at=True)
                out[p["id"]] = hv["glow"]
        elif spec.get("glow") is not None:
            _glow_rule(spec["glow"], f"piece {p['id']}", emit, bag, need_at=True)
            out[p["id"]] = spec["glow"]
    bag.stop()
    return out


def emit_key(material: str) -> str:
    """A glow material's look key: M_flame, M_bulb, M_coal, M_teal."""
    return f"M_{material}"


def fill_energy(power: float, area: float, ref) -> float:
    """The fill panel's energy in a v2 file: its power times the panel's area over the bedroom's 57.04 m2 (`ref`;
    None: no scaling), so a large room's panel lights a square metre as the bedroom's does."""
    return float(power) if ref is None else float(power) * (float(area) / float(ref))


def bearing_dir(bearing: float, elevation: float) -> tuple:
    """The unit vector toward the moon from a compass bearing (0 north, 90 east) and an elevation, in degrees."""
    b, e = math.radians(float(bearing)), math.radians(float(elevation))
    return (math.sin(b) * math.cos(e), math.cos(b) * math.cos(e), math.sin(e))


def needs_owner(spec: dict, rows: list, spots: list | None = None) -> list:
    """The manifest's `needsOwner`: every scene spot and every task piece, with how far it stands from its place and
    its `moved`, those with `moved` first; `show` when the owner is shown it (it has `moved`, or it stands beyond
    1.0 m). `rows` are the manifest's piece rows (id, fromRefM, moved); `spots` its spot rows (id, piece, fromTileM: a
    spot that another piece stands for, the bed of an under-bed spot, is measured from the spot's own tile)."""
    by = {r["id"]: r for r in rows}
    sp = {r["id"]: r for r in spots or ()}
    out = []
    for sid in list(spec["spots"]) + [t for t in spec["taskPieces"] if t not in spec["spots"]]:
        c = spec["coverage"].get(sid) or {}
        pid = sid if sid in by else c.get("id") if c.get("by") in ("covers", "underBed", "piece") else None
        r = by.get(pid) or {}
        far = r.get("fromRefM") if pid == sid else (sp.get(sid) or {}).get("fromTileM")
        out.append(dict(id=sid, what="spot" if sid in spec["spots"] else "task", piece=pid, fromM=far,
                        moved=r.get("moved"), show=bool(r.get("moved")) or (far or 0.0) > MOVE_LIMIT))
    out.sort(key=lambda r: (not r["moved"], r["id"]))
    return out


# ---------------------------------------------------------------- --explain


def explain(row: dict, spec: dict, shown: str) -> str:
    """The derived reading as text (room_file_v2.md, section 8)."""
    L = [f"{shown}: room {spec['room']}, path {spec['schema']} (node names {spec['names']}; rules v{spec['rules']})"]
    L.append("openings:")
    for i, e in enumerate(spec["openings"]):
        at = "in the floor" if e["side"] == "floor" else f"{e['side']} wall at {e['at']:g}"
        bits = [f"  [{i}] {e['kind']} {e['id']}", f"tile ({e['tile'][0]}, {e['tile'][1]})", at]
        if e["kind"] == "door":
            bits.append(f"{e['width']:g} x {e['height']:g} m, knob {e['knob']}, foot ({e['foot'][0]:g}, {e['foot'][1]:g})")
        elif e["kind"] == "window":
            bits.append(f"{e['width']:g} m, sill {e['sill']:g}, head {e['head']:g}, outside {e['outside']}"
                        + (", curtains" if e["curtains"] else "") + (", swag" if e["swag"] else ""))
        else:
            bits.append(f"marker at ({e['foot'][0]:g}, {e['foot'][1]:g})")
            hv = e.get("hatch")
            if hv:
                bits.append(f"hatch {hv['state']}, leaf {hv['size'][0]:g} x {hv['size'][1]:g} m {hv['box']}, hinges "
                            f"on its {hv['hinge']} edge")
            fl = e.get("flight")
            if fl and fl.get("up"):
                bits.append(f"flight up toward {fl['dir']} from {fl['base']:g}: hole in the ceiling {fl['well']}, "
                            f"{len(fl['steps'])} steps of {fl['riser']:g} x {fl['tread']:g} m to "
                            f"{fl['steps'][-1][2]:g} m, shaft to {fl['top']:g} m")
            elif fl:
                bits.append(f"flight down toward {fl['dir']}: well {fl['well']}, {len(fl['steps'])} steps of "
                            f"{fl['riser']:g} x {fl['tread']:g} m to {fl['steps'][-1][2]:g} m, rail "
                            f"{''.join(fl['rail']) or 'none'}")
        L.append(", ".join(bits))
    L.append("lights (night):")
    for r in spec["lights"]:
        a = r.get("anchor") or {}
        how = f"window {r['window']}" if r["role"] == "moon" else (
            f"anchor piece {a['piece']}" + (f" {a['name']}" if a.get("name") else "")
            + (f" offset {list(a['offset'])}" if a.get("offset") else "") if "piece" in a else f"anchor {dict(a)}")
        L.append(f"  {r['id']}: role {r['role']}, group {r['group']}, {how}" + (", pool" if r["pool"] else "")
                 + (f", name {r['name']}" if r["name"] != r["id"] else ""))
    for d in spec["lightsDropped"]:
        L.append(f"  {d['id']}: dropped ({d['reason']})")
    L.append(f"bake groups: {', '.join(spec['groups'])}")
    L.append(f"exposure from: {', '.join(spec['exposureFrom']) or 'none'}; flame hosts: {', '.join(spec['hosts']) or 'none'}")
    L.append("scene props and spots:")
    for sid in sorted(spec["coverage"]):
        c = spec["coverage"][sid]
        L.append(f"  {sid}: " + (f"skipped ({c['reason']})" if c["by"] == "skip" else f"{c['by']} {c['id']}"))
    if spec["underBed"]:
        L.append("under-bed spots: " + ", ".join(f"{s} -> {b}" for s, b in sorted(spec["underBed"].items())))
    L.append("pieces (reference point; a null taken from the scene):")
    for p in row["pieces"]:
        r = spec["pieces"][p["id"]]
        ref = f"ref ({r['ref'][0]:g}, {r['ref'][1]:g})" if r["ref"] else "no reference point (decor)"
        L.append(f"  {p['id']}: {ref}" + (f", place {r['place']}" if r.get("fromScene") else "")
                 + (f", size {r['size']}" if r.get("fromScene") and r.get("size") else "")
                 + (", moved" if p.get("moved") else ""))
    if spec["taskPieces"] or spec["spots"]:
        L.append(f"shown to the owner when moved: spots {', '.join(spec['spots']) or 'none'}; task pieces "
                 f"{', '.join(spec['taskPieces']) or 'none'}")
    L.append(f"planned node names: {len(spec['plannedNames'])}, unique after three.js")
    L.append("not built yet: " + ("; ".join(spec["pending"]) if spec["pending"] else "nothing"))
    return "\n".join(L) + "\n"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="meshy_room_file.py", description="Load a first-person room's file and read it "
                                 "against its scene (see the file's head).")
    ap.add_argument("room", help="the scene id, e.g. widow_bedroom")
    ap.add_argument("--room-file", help="a room file outside meshy_rooms/ (its `room` is still the scene's id)")
    ap.add_argument("--layout", help="read this layout of the file (default: the file's own)")
    ap.add_argument("--explain", action="store_true", help="print the derived reading")
    ap.add_argument("--json", action="store_true", help="print the derived reading as JSON")
    a = ap.parse_args(argv)
    path = a.room_file or room_path(a.room)
    row = load_room(a.room, path=path)
    cfg = dict(row)
    apply_layout(cfg, a.layout)
    spec = derive(cfg, load_scene(a.room), shown=from_root(path))
    if a.json:
        sys.stdout.write(json.dumps(spec, indent=1) + "\n")
    elif a.explain:
        sys.stdout.write(explain(cfg, spec, from_root(path)))
    else:
        print(f"{from_root(path)}: loads ({spec['schema']} path, {len(cfg['pieces'])} pieces, "
              f"{len(spec['openings'])} openings, {len(spec['lights'])} night lights)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
