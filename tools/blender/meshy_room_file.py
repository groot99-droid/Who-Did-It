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
                         "curtain_colour outside foot".split())
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
BUILT_MODELS = ("ph", "meshy", "rug", "photos", "box")         # what the builder builds today (the hearth is G6)
KINDS = ("door", "window", "stairs", "hatch", "drop")          # R-O1
MARKERS = ("stairs", "hatch", "drop")
SIDES = ("N", "E", "S", "W")
KNOB_ENDS = {"N": "EW", "S": "EW", "E": "NS", "W": "NS"}       # R-O2b: the ends of an opening seen from inside
KNOB_DEFAULT = {"S": "E", "E": "N", "N": "W", "W": "S"}        # the end at the higher wall coordinate s
DOOR_STYLES, WINDOW_STYLES = ("panel",), ("sash",)             # R-O8: what the builder has
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
    lk = (row.get("look") or {}) if isinstance(row.get("look"), dict) else {}
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
            _strict(p["spec"].get("glow"), GLOW_KEYS, where + ".spec.glow", "glow", bag)
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
            if spec.get("finish", "grey") != "grey":
                bag.append(f'{where}: finish "{spec["finish"]}" is not built yet (G15 to G19); a box is "grey"')
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
        if side == "floor":
            if o.get("at") is not None:
                bag.append(f'{where}: a hatch or a drop in the floor has no "at" (R-O5b)')
            e.update(at=None, foot=list(o.get("foot") or (cx, cy)), cut=False)
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
        e["cut"] = kind in ("door", "window")
        if o.get("foot") is not None:
            e["foot"] = list(o["foot"])
        elif e["inner"]:
            e["foot"] = [cx, cy]
        else:
            fx = at if side in ("N", "S") else (sc.x1 if side == "E" else sc.x0)
            fy = at if side in ("E", "W") else (sc.y1 if side == "N" else sc.y0)
            e["foot"] = [fx, fy]
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
                 pool=bool(ent.get("pool", ROLE_POOL.get(role, False))))
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
    bag.stop()
    if legacy and first_bed is not None:
        # the legacy path keeps spot_rows' own rule: an under-bed spot is the first bed piece's (the bedroom's is
        # the bed beside it too)
        under = {s: first_bed for s in under}
    tasks = task_ids() if tasks is None else tasks
    task_pieces = sorted({r["id"] for r in sc.props if r["id"] in tasks or r.get("kind") in ("keyCache", "lockedDoor")})
    pending = []
    if not legacy:
        pending.append("openings: the builder reads `door` and `window` until G3 (S3a)")
    if "look" in row or "light" in row:
        pending.append("look, light: a room's look override waits for G9 (S4)")
    for p in row["pieces"]:
        spec = p.get("spec") if isinstance(p.get("spec"), dict) else {}
        if spec.get("model") == "hearth":
            pending.append(f"piece {p['id']}: the hearth waits for G6 (S6)")
        if isinstance(spec.get("bed"), dict):
            pending.append(f"piece {p['id']}: a bed object (a day bed) waits for G7 (S7)")
        if spec.get("glow") is not None:
            pending.append(f"piece {p['id']}: a glow waits for G4 (S5e: an emitter must not raise the emit cap)")
    return dict(
        room=sc.id, schema="legacy" if legacy else "v2", names="legacy" if legacy else "v2", rules=SCHEMA,
        openings=openings, lights=lights, lightsDropped=dropped, groups=groups, exposureFrom=ef, hosts=hosts,
        coverage=cover, underBed=under, pieces=resolved, skip=dict(row.get("skip") or {}),
        spots=[s["id"] for s in sc.spots], taskPieces=task_pieces, plannedNames=names, pending=pending,
        moveLimitM=MOVE_LIMIT)


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
