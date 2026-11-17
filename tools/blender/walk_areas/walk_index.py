#!/usr/bin/env python3
"""walk_index.py: builds walk-index.json from area files and checks them against docs/walk-areas.md (version 1).

    python walk_index.py <folder>                     build <folder>/walk-index.json from its walk-*.glb / walk-*.gltf
    python walk_index.py <folder> --check             write nothing: check the index in the folder against the files
    python walk_index.py --legacy --out <index.json> <file.glb> [<file.glb> ...]
                                                      today's files as they are: each difference is a WARNING

Plain Python 3, standard library only. It reads the JSON part of every file, the headers of the images and, when a
collision mesh is not Draco-compressed (the fixture), its triangles. It never decodes Draco data, so three things are
left to the exporter's Blender checks on real files: that spawns and portals stand on the ground, that a seam's wall
is closed and 3 m high, and that the rest of a village section's edge is closed too. Triangles in view are not
measured here either.

Every line it prints starts with PASS, FAIL, WARN or NOTE, then the rule's name, then what was found.
A file or an index that cannot be read is a FAIL line (<file>.readable, index.readable), not a Python trace.
Exit code: 0 no rule failed, 1 at least one FAIL, 2 the command could not run.
"""
import argparse
import base64
import binascii
import hashlib
import json
import math
import os
import re
import struct
import sys
from decimal import Decimal

FORMAT = 1
AXES_NOTE = ("Metres. Every 3-number vector is in glTF world axes: x east, y up, z = -north. Every field whose name "
             "ends in _xy is a plan view in Blender axes: x east, y north. yaw_deg is the yaw of the viewer: 0 looks "
             "along -z (north), positive turns left, so west is 90.")

# The numbers of the contract (docs/walk-areas.md, section 6). Metres and degrees.
SEAM = dict(
    portal_to_wall=0.45,       # a seam portal stands this far in front of its file's wall
    arrival_inside=1.65,       # an arrival spawn stands this far inside its file's wall
    arrival_beyond=2.10,       # ... which is this far beyond the portal the walker left by
    gap_max=1.80,              # neighbours in a row are at most this far apart
    end_gap_max=1.00,          # the first and last point are at most this far from the ends of the opening
    lateral_max=0.10,          # the arrival is at the same sideways place as the departure portal, within this
    yaw_max=15.0,              # the arrival faces the direction of travel, within this
    arrival_clear_min=1.20,    # the arrival is at least this far from EVERY portal of its file (its return row too)
    row_clear_min=2.00,        # no portal outside a seam's row stands this close to a point of it (two 1 m discs)
    height_max=0.15,           # the two files put the ground at the seam line at the same height, within this
    wall_height=3.0,           # the wall is at least this high above the ground across the whole opening
    tol=0.05,                  # measuring tolerance for the distances above
    width_max=100.0,           # not a rule of the contract: these tools do not sample an opening wider than this (a typo
                               # such as 5000 for 5 would otherwise keep them busy for minutes)
)
# The closed edge of a village section (docs/walk-areas.md, section 4). Metres.
EDGE = dict(
    step=0.25,                 # the edge is sampled this often (a gap the walker's capsule, 0.6 m across, fits through is wider)
    corner=0.3,                # ... but not within this of a corner of the outline (see check_edge)
    inside=0.5,                # a ray starts this far inside the edge ...
    face_tol=0.3,              # ... and must meet a wall whose face is within this of the edge (the walker's radius)
    reach=3.0,                 # how far a ray looks
    max_length=100_000.0,      # an edge longer than this is not sampled: it is no village section
)
SEAM_KINDS = ("gate", "level_crossing", "footbridge", "lychgate", "stile", "cutting", "belt_gate")
PORTAL_RADIUS = 1.0            # the viewer's walk-in radius (apps/walk/src/portals.ts, PortalTrigger)
PORTAL_HEIGHT_WINDOW = 2.0     # ... and it does not see a portal more than this above or below the player
WAY_BACK_FAR_M = 10.0          # a note: a room's way out arrives farther than this from the door that leads in
SLOT_FIRST_M, SLOT_STEP_M = 3000.0, 600.0     # the far grid of the old single file (meshy_walk_export.py ROOM_SLOTS)

# What an area file may REQUIRE: an allow-list chosen by this contract (docs/walk-areas.md, section 4). It is NOT the
# list of what the viewer's loader reads: three.js's GLTFLoader reads more (r160: clearcoat, ior, sheen, specular,
# transmission, iridescence, anisotropy, volume, EXT_materials_bump, EXT_texture_avif) and, for an extension it does not
# know that a file requires, only prints a warning. The first six names are the ones apps/walk/README.md ("The GLB
# contract") lists; unlit is how rooms are written; the last three are the decoders the viewer's src/load.ts sets up
# (meshopt, KTX2) and what three.js reads without one (quantization). No file uses those three today. To allow another
# extension, add its name here, in check_areas.mjs and in section 4 of the contract, once the viewer's author has tried
# a file that needs it.
EXTENSIONS_ALLOWED = {
    "KHR_draco_mesh_compression", "EXT_texture_webp", "KHR_texture_transform", "KHR_lights_punctual",
    "EXT_mesh_gpu_instancing", "KHR_materials_emissive_strength", "KHR_materials_unlit",
    "EXT_meshopt_compression", "KHR_texture_basisu", "KHR_mesh_quantization",
}
# Extras the viewer reads from the glTF SCENE (world.ts fogFromExtras, look.ts exposureFromScene). An area file has
# none of them there: its look is on its Area node. Scene-level fog is the harmful one: it makes the background flat
# and hides the sky (main.ts lines 121-123). A scene exposure is read only when the Area has none (main.ts lines
# 125-126), so it changes nothing while the Area has one; it is kept off as a precaution.
SCENE_LOOK_KEYS = ("fog_color", "fog_density", "fog_near", "fog_far",
                   "wdi_exposure", "tone_mapping_exposure", "toneMappingExposure", "exposure")

# Planning targets. docs/walk-areas.md, section 9, says where each figure comes from: a planning note of the
# exporter's session, the exporter's own constants, or a choice of this work. They are NOT viewer limits and NOT
# repo rules; a file over one of them gets a NOTE (a FAIL only with --strict-targets). Triangles in view (target
# 1.0 M, ceiling 1.5 M) are not measured here.
PLANNING_TARGETS = {
    "section": dict(bytes=15_000_000, triangles_loaded=2_000_000, texture_gpu_mb=192.0, draw_calls=248, lights=24,
                    triangles_collision=150_000),
    "room": dict(bytes=6_000_000, triangles_loaded=600_000, texture_gpu_mb=64.0, triangles_collision=10_000),
}
PLANNING_TARGETS["wild"] = PLANNING_TARGETS["section"]   # no figures were set for wild areas; the section ones are used
TEXTURE_CEILING_MB = 255.0

LEGACY_AREA_ID = "village"
LEGACY_OK_MISSING = ("wdi_area", "wdi_kind", "wdi_scene", "wdi_walk_region")   # extras today's two files lack
AREA_ID_RE = re.compile(r"^[a-z][a-z0-9_]*$")
SPAWN_ID_RE = re.compile(r"^[a-z0-9_]+$")
SEAM_ID_RE = re.compile(r"^[a-z][a-z0-9]*(_[a-z0-9]+)*$")
SEAM_PORTAL_RE = re.compile(r"^seam_(.+)_([ab])_([1-9][0-9]*)$")
SEAM_SPAWN_RE = re.compile(r"^overworld_seam_(.+)_([ab])_([1-9][0-9]*)$")
# node names as they are written in the file (docs/walk-areas.md, section 2)
RAW_AREA_RE = re.compile(r"^Area_[a-z][a-z0-9_]*$")
RAW_COLLISION_RE = re.compile(r"^HM_Collision(_[a-z][a-z0-9_]*)?$")
RAW_SPAWN_RE = re.compile(r"^Spawn_[a-z0-9_]+$")
RAW_PORTAL_RE = re.compile(r"^Portal_[a-z0-9_]+(\.[a-z0-9_]+)*$")


# --------------------------------------------------------------------------------------------- results

class Results:
    def __init__(self, legacy=False, strict_targets=False):
        self.rows = []
        self.legacy = legacy
        self.strict_targets = strict_targets

    def add(self, status, rule, detail=""):
        self.rows.append((status, rule, detail))

    def check(self, rule, ok, detail="", legacy_ok=False):
        """PASS or FAIL; in --legacy mode a failure that is one of the accepted differences is a WARN."""
        if ok:
            self.add("PASS", rule, detail)
        elif self.legacy and legacy_ok:
            self.add("WARN", rule, detail + "  [accepted only with --legacy]")
        else:
            self.add("FAIL", rule, detail)
        return ok

    def note(self, rule, detail):
        self.add("NOTE", rule, detail)

    def count(self, status):
        return sum(1 for r in self.rows if r[0] == status)


# --------------------------------------------------------------------------------------------- small helpers

def num(v, d=6):
    """A JSON number: rounded, never -0, an integer when it is one."""
    v = round(float(v), d) + 0.0
    return int(v) if v == int(v) and abs(v) < 1e15 else v


def fmt(v, d=2):
    return ("%." + str(d) + "f") % v


# The index is written the way Prettier leaves JSON (CI runs `prettier --check .`, and the fixture's index is in the
# repository): every object that holds something is opened out, one key a line; an array stays on one line when it
# fits in 110 columns; an array that holds an object, or two or more arrays of two or more things each, is always
# opened out; a long array of numbers is filled line by line. Checked against Prettier 3.9.10. The fixture generator
# has the same writer in JavaScript, and the two give the same bytes.
PRINT_WIDTH = 110


def number_text(v):
    if isinstance(v, int):
        return str(v)
    if v == int(v) and abs(v) < 1e15:
        return str(int(v))
    r = repr(float(v))
    return format(Decimal(r), "f") if "e" in r.lower() else r     # no exponents in these files


def flat_json(v):
    """The one-line form of a value, or None when it cannot stand on one line."""
    if isinstance(v, list):
        if len(v) > 1 and all(isinstance(e, list) and len(e) > 1 for e in v):
            return None
        parts = [flat_json(e) for e in v]
        return None if None in parts else "[%s]" % ", ".join(parts)
    if isinstance(v, dict):
        return "{}" if not v else None
    if is_number(v):
        return number_text(v)
    return json.dumps(v, ensure_ascii=False)


def pretty_json(v, indent="", used=0, tail=0):
    """`used` columns are already on the line before the value; `tail` columns (a comma) follow it."""
    flat = flat_json(v)
    if flat is not None and (not isinstance(v, list) or used + len(flat) + tail <= PRINT_WIDTH):
        return flat
    inner = indent + "  "
    if isinstance(v, list):
        if flat is not None and len(v) > 1 and all(is_number(e) for e in v):
            lines, line = [], inner
            for k, e in enumerate(v):
                item = number_text(e) + ("," if k < len(v) - 1 else "")
                if line == inner:
                    line += item
                elif len(line) + 1 + len(item) <= PRINT_WIDTH:
                    line += " " + item
                else:
                    lines.append(line)
                    line = inner + item
            lines.append(line)
            return "[\n%s\n%s]" % ("\n".join(lines), indent)
        items = []
        for k, e in enumerate(v):
            comma = "," if k < len(v) - 1 else ""
            items.append(inner + pretty_json(e, inner, len(inner), len(comma)) + comma)
        return "[\n%s\n%s]" % ("\n".join(items), indent)
    items, keys = [], list(v)
    for k, key in enumerate(keys):
        head = "%s%s: " % (inner, json.dumps(key, ensure_ascii=False))
        comma = "," if k < len(keys) - 1 else ""
        items.append(head + pretty_json(v[key], inner, len(head), len(comma)) + comma)
    return "{\n%s\n%s}" % ("\n".join(items), indent)


def plain_words(raw):
    """apps/walk/src/spawn.ts plainWords: 'station_street' -> 'Station street'."""
    t = re.sub(r"[_-]+", " ", raw).strip()
    return t[:1].upper() + t[1:]


def spawn_label(spawn_id, wdi_spawn=None, wdi_district=None):
    """apps/walk/src/spawn.ts spawnLabel."""
    name = plain_words(wdi_spawn if isinstance(wdi_spawn, str) and wdi_spawn else spawn_id)
    district = plain_words(wdi_district) if isinstance(wdi_district, str) else ""
    return "%s (%s)" % (name, district) if district and district.lower() != name.lower() else name


def sanitize(name):
    """three.js PropertyBinding.sanitizeNodeName: white space becomes '_', then [ ] . : / are removed."""
    return re.sub(r"[\[\]\.:/]", "", re.sub(r"\s", "_", name))


def reserved_name(name):
    """True when three.js would read the name as one of the four the viewer looks for by prefix."""
    return isinstance(name, str) and sanitize(name).startswith(("Area_", "HM_Collision", "Spawn_", "Portal_"))


def yaw_norm(deg):
    v = ((deg + 180.0) % 360.0 + 360.0) % 360.0 - 180.0
    return 180.0 if v <= -180.0 + 1e-9 else v


def ang_diff(a, b):
    return abs(((a - b + 540.0) % 360.0) - 180.0)


def is_number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def extras_of(obj):
    """An object's extras when they are a JSON object. three.js ignores extras of any other type, and so does this."""
    x = obj.get("extras")
    return x if isinstance(x, dict) else {}


def plan_gap(a, b):
    """The distance on the ground plan between two glTF positions, or None when they are more than 2 m apart in
    height: the viewer's trigger does not see a portal that far above or below the player (portals.ts, nearest)."""
    if abs(a[1] - b[1]) > PORTAL_HEIGHT_WINDOW:
        return None
    return math.hypot(a[0] - b[0], a[2] - b[2])


def mat_mul(a, b):
    return [[sum(a[r][k] * b[k][c] for k in range(4)) for c in range(4)] for r in range(4)]


def node_matrix(n):
    if "matrix" in n:
        m = n["matrix"]
        return [[m[c * 4 + r] for c in range(4)] for r in range(4)]
    t = n.get("translation", [0, 0, 0])
    x, y, z, w = n.get("rotation", [0, 0, 0, 1])
    s = n.get("scale", [1, 1, 1])
    r = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
         [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
         [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
    return [[r[0][0] * s[0], r[0][1] * s[1], r[0][2] * s[2], t[0]],
            [r[1][0] * s[0], r[1][1] * s[1], r[1][2] * s[2], t[1]],
            [r[2][0] * s[0], r[2][1] * s[1], r[2][2] * s[2], t[2]],
            [0.0, 0.0, 0.0, 1.0]]


def has_transform(n):
    """True when a node moves, turns or scales what is under it."""
    if "matrix" in n:
        ident = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
        return any(abs(a - b) > 1e-9 for a, b in zip(n["matrix"], ident))
    return (any(abs(v) > 1e-9 for v in n.get("translation", [0, 0, 0]))
            or any(abs(a - b) > 1e-9 for a, b in zip(n.get("rotation", [0, 0, 0, 1]), [0, 0, 0, 1]))
            or any(abs(v - 1) > 1e-9 for v in n.get("scale", [1, 1, 1])))


def image_size(b):
    """(width, height) from the header of a WebP, PNG or JPEG, or None."""
    if len(b) >= 30 and b[:4] == b"RIFF" and b[8:12] == b"WEBP":
        kind = b[12:16]
        if kind == b"VP8 ":
            w, h = struct.unpack_from("<HH", b, 26)
            return w & 0x3FFF, h & 0x3FFF
        if kind == b"VP8L":
            v = struct.unpack_from("<I", b, 21)[0]
            return (v & 0x3FFF) + 1, ((v >> 14) & 0x3FFF) + 1
        if kind == b"VP8X":
            return int.from_bytes(b[24:27], "little") + 1, int.from_bytes(b[27:30], "little") + 1
    if b[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack_from(">II", b, 16)
    if b[:2] == b"\xff\xd8":
        i = 2
        while i + 9 < len(b):
            if b[i] != 0xFF:
                i += 1
                continue
            if b[i + 1] in (0xC0, 0xC1, 0xC2):
                h, w = struct.unpack_from(">HH", b, i + 5)
                return w, h
            i += 2 + struct.unpack_from(">H", b, i + 2)[0]
    return None


def data_uri_bytes(uri):
    return base64.b64decode(uri[uri.index(",") + 1:])


COMPONENT = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2), 5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def ray_first_hit(tris, o, d, tmax):
    """Distance along the ray (origin o, unit direction d) to the nearest triangle within tmax, or None."""
    best = None
    for ax, ay, az, bx, by, bz, cx, cy, cz in tris:
        e1x, e1y, e1z = bx - ax, by - ay, bz - az
        e2x, e2y, e2z = cx - ax, cy - ay, cz - az
        px, py, pz = d[1] * e2z - d[2] * e2y, d[2] * e2x - d[0] * e2z, d[0] * e2y - d[1] * e2x
        det = e1x * px + e1y * py + e1z * pz
        if abs(det) < 1e-12:
            continue
        inv = 1.0 / det
        tx, ty, tz = o[0] - ax, o[1] - ay, o[2] - az
        u = (tx * px + ty * py + tz * pz) * inv
        if u < -1e-9 or u > 1 + 1e-9:
            continue
        qx, qy, qz = ty * e1z - tz * e1y, tz * e1x - tx * e1z, tx * e1y - ty * e1x
        v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv
        if v < -1e-9 or u + v > 1 + 1e-9:
            continue
        t = (e2x * qx + e2y * qy + e2z * qz) * inv
        if 1e-9 < t <= tmax and (best is None or t < best):
            best = t
    return best


class TriGrid:
    """The triangles of a collision mesh sorted into 4 m cells of the ground plan (x, z), so that a ray tests only the
    triangles near it. It changes how long a rule takes, never what it finds: the closed-edge rule casts thousands of
    rays, and a real section's collision has up to 150,000 triangles."""
    CELL = 4.0
    MANY = 4096        # a triangle that covers more cells than this is kept apart and tested by every ray

    def __init__(self, tris):
        self.cells, self.many = {}, []
        self.top, self.bottom = -math.inf, math.inf
        for t in tris:
            self.top = max(self.top, t[1], t[4], t[7])
            self.bottom = min(self.bottom, t[1], t[4], t[7])
            i0, i1 = (int(math.floor(f(t[0], t[3], t[6]) / self.CELL)) for f in (min, max))
            k0, k1 = (int(math.floor(f(t[2], t[5], t[8]) / self.CELL)) for f in (min, max))
            if (i1 - i0 + 1) * (k1 - k0 + 1) > self.MANY:
                self.many.append(t)
                continue
            for i in range(i0, i1 + 1):
                for k in range(k0, k1 + 1):
                    self.cells.setdefault((i, k), []).append(t)

    def first_hit(self, o, d, tmax):
        """What ray_first_hit gives for the same ray over every triangle."""
        ex, ez = o[0] + d[0] * tmax, o[2] + d[2] * tmax
        i0, i1 = (int(math.floor(f(o[0], ex) / self.CELL)) for f in (min, max))
        k0, k1 = (int(math.floor(f(o[2], ez) / self.CELL)) for f in (min, max))
        near = list(self.many)
        for i in range(i0, i1 + 1):
            for k in range(k0, k1 + 1):
                near.extend(self.cells.get((i, k), ()))
        return ray_first_hit(near, o, d, tmax)


# --------------------------------------------------------------------------------------------- one area file

class AreaFile:
    """What one .glb or .gltf says, read without Draco."""

    def __init__(self, path):
        self.path = path
        self.base = os.path.basename(path)
        with open(path, "rb") as fh:
            self.raw = fh.read()
        self.size = len(self.raw)
        self.sha256 = hashlib.sha256(self.raw).hexdigest()
        self.bin = None
        if self.base.lower().endswith(".gltf"):
            self.g = json.loads(self.raw.decode("utf-8"))
            uri = (self.g.get("buffers") or [{}])[0].get("uri", "")
            if uri.startswith("data:"):
                self.bin = data_uri_bytes(uri)
        else:
            if self.raw[:4] != b"glTF":
                raise ValueError("%s is not a GLB file" % self.base)
            off, self.g = 12, None
            while off + 8 <= len(self.raw):
                clen, ctype = struct.unpack_from("<I4s", self.raw, off)
                if ctype == b"JSON":
                    self.g = json.loads(self.raw[off + 8:off + 8 + clen].decode("utf-8"))
                elif ctype[:3] == b"BIN":
                    self.bin = self.raw[off + 8:off + 8 + clen]
                off += 8 + clen
            if self.g is None:
                raise ValueError("%s has no JSON chunk" % self.base)
        g = self.g
        scene = self._shape()
        self.nodes = g["nodes"]
        self.scene_count = len(g["scenes"])
        self.scene_name = scene.get("name") if isinstance(scene.get("name"), str) else ""
        self.scene_extras = extras_of(scene)
        self.roots = list(scene.get("nodes", []))
        lights = ((g.get("extensions") or {}).get("KHR_lights_punctual") or {}).get("lights") or []
        cameras = g.get("cameras") or []
        # The names GLTFLoader gives (three.js GLTFParser.createUniqueName, read in r160's source and measured with
        # r160; the viewer pins 0.186.1, not run): one table for the whole file. The scene's name is taken first;
        # then the nodes, depth first, each node's own name before the name of the camera and of the light
        # definition it holds (a light with no name is light_<index>); a name already taken gets _1, _2 ...
        # Mesh names are taken after every node name, so they never change a node's.
        used, self.loader_name, self.renamed, self.parent, self.world, self.order = {}, {}, [], {}, {}, []
        seen_light, seen_camera, self.sun_nodes = set(), set(), []

        def unique(raw):
            s = sanitize(raw)
            if s in used:
                used[s] += 1
                return "%s_%d" % (s, used[s])
            used[s] = 0
            return s

        if self.scene_name:
            unique(self.scene_name)
        ident = [[1.0 if r == c else 0.0 for c in range(4)] for r in range(4)]
        todo = [(r, ident, None) for r in reversed(self.roots)]          # a stack, so a deep tree is no trouble
        while todo:
            i, parent_world, parent = todo.pop()
            if i in self.parent:
                raise ValueError("node %d is reached twice: the node tree loops or a node has two parents" % i)
            n = self.nodes[i]
            self.parent[i] = parent
            raw = n.get("name") if isinstance(n.get("name"), str) else ""
            name = unique(raw) if raw else ""
            self.loader_name[i] = name
            if raw and name != sanitize(raw):
                self.renamed.append((raw, name))
            cam = n.get("camera")
            if isinstance(cam, int) and 0 <= cam < len(cameras) and cam not in seen_camera:
                seen_camera.add(cam)
                if isinstance(cameras[cam], dict) and isinstance(cameras[cam].get("name"), str) and cameras[cam]["name"]:
                    unique(cameras[cam]["name"])
            li = ((n.get("extensions") or {}).get("KHR_lights_punctual") or {}).get("light")
            if isinstance(li, int) and 0 <= li < len(lights) and isinstance(lights[li], dict):
                if li not in seen_light:
                    seen_light.add(li)
                    unique(lights[li]["name"] if isinstance(lights[li].get("name"), str) and lights[li]["name"] else "light_%d" % li)
                if lights[li].get("type") == "directional":
                    self.sun_nodes.append(raw or "(no name)")
            self.world[i] = mat_mul(parent_world, node_matrix(n))
            self.order.append(i)
            todo.extend((c, self.world[i], i) for c in reversed(n.get("children", [])))

        # A name with a reserved prefix on something that is not a node. three.js can add an object of that name to
        # the scene (measured with r160: a light definition or a camera Spawn_x on a node that also holds a mesh; a
        # mesh Spawn_x of two primitives; the scene itself), and the viewer would take it for a spawn or an Area.
        # A mesh may be named so only when three.js gives its object the node's name: one primitive, and every node
        # that holds it has a name and no camera or light (today's collision meshes).
        self.reserved_elsewhere = []
        if reserved_name(self.scene_name):
            self.reserved_elsewhere.append("the scene %r" % self.scene_name)
        self.reserved_elsewhere += ["camera %d %r" % (k, c["name"]) for k, c in enumerate(cameras) if isinstance(c, dict) and reserved_name(c.get("name"))]
        self.reserved_elsewhere += ["light definition %d %r" % (k, d["name"]) for k, d in enumerate(lights) if isinstance(d, dict) and reserved_name(d.get("name"))]
        for k, m in enumerate(g.get("meshes") if isinstance(g.get("meshes"), list) else []):
            if not (isinstance(m, dict) and reserved_name(m.get("name"))):
                continue
            holders = [n for n in self.nodes if n.get("mesh") == k]
            if not (isinstance(m.get("primitives"), list) and len(m["primitives"]) == 1
                    and all(isinstance(n.get("name"), str) and n["name"] and "camera" not in n
                            and "KHR_lights_punctual" not in (n.get("extensions") or {}) for n in holders)):
                self.reserved_elsewhere.append("mesh %d %r" % (k, m["name"]))

        self.area_nodes = [i for i in self.order if self.loader_name[i].startswith("Area_")]
        self.area_roots = [i for i in self.roots if self.loader_name[i].startswith("Area_")]
        self.coll_nodes = [i for i in self.order
                           if self.loader_name[i] == "HM_Collision" or self.loader_name[i].startswith("HM_Collision_")]
        self.area_root = self.area_roots[0] if self.area_roots else None
        self.area_name = self.loader_name[self.area_root] if self.area_root is not None else None
        self.id = self.area_name[len("Area_"):] if self.area_name else None
        self.extras = extras_of(self.nodes[self.area_root]) if self.area_root is not None else {}
        self._derive()
        self._spawns_and_portals()
        self._collision()
        self._stats()

    def _shape(self):
        """The default scene, after a look at the parts this script walks. Raises ValueError, in plain words, when
        the JSON is not shaped like glTF there, so that a broken file is one FAIL line and not a Python trace."""
        g = self.g
        if not isinstance(g, dict):
            raise ValueError("its JSON part is not an object")
        nodes, scenes = g.get("nodes"), g.get("scenes")
        if not isinstance(nodes, list) or not all(isinstance(n, dict) for n in nodes):
            raise ValueError("it has no list of nodes")
        if not isinstance(scenes, list) or not scenes or not all(isinstance(s, dict) for s in scenes):
            raise ValueError("it has no list of scenes")
        k = g.get("scene", 0)
        if not isinstance(k, int) or isinstance(k, bool) or not 0 <= k < len(scenes):
            raise ValueError("its default scene is not one of its scenes")

        def node_numbers(v, what):
            if not isinstance(v, list) or not all(isinstance(c, int) and not isinstance(c, bool) and 0 <= c < len(nodes) for c in v):
                raise ValueError("%s is not a list of node numbers" % what)

        node_numbers(scenes[k].get("nodes", []), "the scene's list of root nodes")
        meshes = g.get("meshes") if isinstance(g.get("meshes"), list) else []
        for i, n in enumerate(nodes):
            label = "node %d (%s)" % (i, n.get("name", "no name"))
            node_numbers(n.get("children", []), "the children of " + label)
            for key, size in (("translation", 3), ("rotation", 4), ("scale", 3), ("matrix", 16)):
                if key in n and not (isinstance(n[key], list) and len(n[key]) == size and all(is_number(v) for v in n[key])):
                    raise ValueError("the %s of %s is not %d numbers" % (key, label, size))
            if "mesh" in n and not (isinstance(n["mesh"], int) and not isinstance(n["mesh"], bool) and 0 <= n["mesh"] < len(meshes)):
                raise ValueError("the mesh of %s is not one of the file's meshes" % label)
        return scenes[k]

    # ---- the values the index needs; where an extra is missing the value is derived and the rule reports it
    def _derive(self):
        x, i = self.extras, self.id or ""
        k = x.get("wdi_kind")
        if k in ("section", "room", "wild"):
            self.kind = k
        elif i.startswith("room_"):
            self.kind = "room"
        elif i == LEGACY_AREA_ID or i.startswith("village_"):
            self.kind = "section"
        else:
            self.kind = "wild"
        s = x.get("wdi_scene")
        if isinstance(s, str) and s:
            self.scene = s
        else:
            self.scene = i[len("room_"):] if self.kind == "room" and i.startswith("room_") else ("overworld" if self.kind == "section" else i)
        self.name = x.get("wdi_name") if isinstance(x.get("wdi_name"), str) and x.get("wdi_name") else plain_words(i)
        self.indoor = x.get("wdi_indoor") is True or (self.area_name or "").startswith("Area_room_")   # the viewer's rule
        self.baked = x.get("wdi_baked") is True
        self.look = {k: x[k] for k in ("wdi_exposure", "fog_color", "fog_density", "fog_near", "fog_far") if k in x}

    def under_area(self, i):
        p = self.parent.get(i)
        while p is not None:
            if p == self.area_root:
                return True
            p = self.parent.get(p)
        return False

    def _spawns_and_portals(self):
        self.spawns, self.portals = [], []
        for i in self.order:
            name, n, m = self.loader_name[i], self.nodes[i], self.world[i]
            ex = extras_of(n)
            pos = [m[0][3], m[1][3], m[2][3]]
            if name.startswith("Spawn_") and len(name) > len("Spawn_"):
                fx, fz = -m[0][2], -m[2][2]                       # the node's -Z in world axes
                ln = math.hypot(fx, fz) or 1.0
                sid = name[len("Spawn_"):]
                self.spawns.append(dict(
                    id=sid, node=i, raw_name=n.get("name", ""), pos=pos, extras=ex, under=self.under_area(i),
                    yaw=yaw_norm(math.degrees(math.atan2(-fx, -fz))), face_xy=(fx / ln, -fz / ln),
                    label=spawn_label(sid, ex.get("wdi_spawn"), ex.get("wdi_district")),
                    name=spawn_label(sid, ex.get("wdi_spawn")),
                    group=plain_words(ex["wdi_district"]) if isinstance(ex.get("wdi_district"), str) else ""))
            elif name.startswith("Portal_"):
                self.portals.append(dict(
                    id=name[len("Portal_"):], node=i, raw_name=n.get("name", ""), pos=pos, extras=ex,
                    under=self.under_area(i), to=ex.get("to"), toSpawn=ex.get("toSpawn"), kind=ex.get("kind"),
                    portal_id=ex.get("wdi_portal_id"),
                    read_by_viewer=isinstance(ex.get("to"), str) and isinstance(ex.get("toSpawn"), str)))

    def _collision(self):
        self.coll = None
        if not self.coll_nodes:
            return
        i = self.coll_nodes[0]
        n = self.nodes[i]
        c = dict(node=i, name=self.loader_name[i], extras=extras_of(n), tris=0, lo=None, hi=None,
                 draco=False, triangles=None, has_mesh="mesh" in n, material=False,
                 transform=has_transform(n), children=len(n.get("children", [])), at_root=i in self.roots)
        if "mesh" in n:
            acc = self.g.get("accessors", [])
            for p in self.g["meshes"][n["mesh"]]["primitives"]:
                pa = acc[p["attributes"]["POSITION"]]
                c["tris"] += (acc[p["indices"]]["count"] if "indices" in p else pa["count"]) // 3
                if "material" in p:
                    c["material"] = True
                if "KHR_draco_mesh_compression" in (p.get("extensions") or {}):
                    c["draco"] = True
                if pa.get("min") and pa.get("max"):
                    c["lo"] = pa["min"] if c["lo"] is None else [min(a, b) for a, b in zip(c["lo"], pa["min"])]
                    c["hi"] = pa["max"] if c["hi"] is None else [max(a, b) for a, b in zip(c["hi"], pa["max"])]
            if not c["draco"] and self.bin is not None:
                c["triangles"] = self._triangles(n["mesh"])
        self.coll = c

    def _accessor(self, idx):
        a = self.g["accessors"][idx]
        bv = self.g["bufferViews"][a["bufferView"]]
        code, size = COMPONENT[a["componentType"]]
        ncomp = NCOMP[a["type"]]
        start = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        stride = bv.get("byteStride", ncomp * size)
        out = []
        for k in range(a["count"]):
            out.extend(struct.unpack_from("<%d%s" % (ncomp, code), self.bin, start + k * stride))
        return out

    def _triangles(self, mesh_index):
        tris = []
        for p in self.g["meshes"][mesh_index]["primitives"]:
            if p.get("mode", 4) != 4:
                continue
            pos = self._accessor(p["attributes"]["POSITION"])
            idx = self._accessor(p["indices"]) if "indices" in p else list(range(len(pos) // 3))
            for t in range(0, len(idx) - 2, 3):
                a, b, c = idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3
                tris.append((pos[a], pos[a + 1], pos[a + 2], pos[b], pos[b + 1], pos[b + 2], pos[c], pos[c + 1], pos[c + 2]))
        return tris

    def _stats(self):
        g, acc = self.g, self.g.get("accessors", [])
        meshes = g.get("meshes", [])

        def mesh_tris(m):
            return sum((acc[p["indices"]]["count"] if "indices" in p else acc[p["attributes"]["POSITION"]]["count"]) // 3
                       for p in m["primitives"])

        loaded = draws = groups = 0
        coll = set(self.coll_nodes)
        for i in self.order:
            n = self.nodes[i]
            if "mesh" not in n or i in coll:
                continue
            m = meshes[n["mesh"]]
            inst = (n.get("extensions") or {}).get("EXT_mesh_gpu_instancing")
            copies = 1
            if inst:
                groups += 1
                attrs = inst.get("attributes", {})
                copies = acc[attrs.get("TRANSLATION", next(iter(attrs.values())))]["count"]
            loaded += mesh_tris(m) * copies
            draws += len(m["primitives"])
        pixels, unknown, largest = 0, 0, 0
        for im in g.get("images", []):
            b = None
            if "bufferView" in im and self.bin is not None:
                bv = g["bufferViews"][im["bufferView"]]
                b = self.bin[bv.get("byteOffset", 0):bv.get("byteOffset", 0) + bv["byteLength"]]
            elif str(im.get("uri", "")).startswith("data:"):
                b = data_uri_bytes(im["uri"])
            s = image_size(b) if b else None
            if s:
                pixels += s[0] * s[1]
                largest = max(largest, s[0], s[1])
            else:
                unknown += 1
        self.images_unknown, self.image_largest = unknown, largest
        self.stats = dict(
            triangles_loaded=loaded, triangles_collision=self.coll["tris"] if self.coll else 0, draw_calls=draws,
            instanced_groups=groups, images=len(g.get("images", [])),
            texture_gpu_mb=num(pixels * 4 * 4 / 3 / 1e6, 1),      # RGBA8 with a full mip chain, in MB of 1e6 bytes
            lights=sum(1 for i in self.order if "KHR_lights_punctual" in (self.nodes[i].get("extensions") or {})))

    def walk_region(self):
        """wdi_walk_region when the Area has it, else the plan of the collision box (legacy)."""
        w = self.extras.get("wdi_walk_region")
        if isinstance(w, list) and len(w) == 4 and all(is_number(v) for v in w):
            return [num(v) for v in w]
        if self.coll and self.coll["lo"]:
            lo, hi = self.coll["lo"], self.coll["hi"]
            return [num(lo[0]), num(-hi[2]), num(hi[0]), num(-lo[2])]
        return None

    def walk_polygon(self):
        """The optional outline wdi_walk_polygon as [[x, y], ...], or None. Three forms are read (docs/walk-areas.md,
        section 4): a flat list of numbers [x0, y0, x1, y1, ...], which is what a Blender custom property can hold
        (wdi_walk_region is one); the same list of points as a JSON string, which is how today's exporter writes
        nested data (wdi_look_json); and a list of [x, y] pairs, which a writer that is not Blender may use."""
        p = self.extras.get("wdi_walk_polygon")
        if isinstance(p, str):
            try:
                p = json.loads(p)
            except ValueError:
                return None
        if isinstance(p, list) and len(p) >= 6 and len(p) % 2 == 0 and all(is_number(v) and math.isfinite(v) for v in p):
            p = [[p[k], p[k + 1]] for k in range(0, len(p), 2)]
        if (isinstance(p, list) and len(p) >= 3
                and all(isinstance(q, list) and len(q) == 2 and all(is_number(v) and math.isfinite(v) for v in q) for q in p)):
            return [[num(q[0]), num(q[1])] for q in p]
        return None


def slot_in(region):
    """The point (3000 + 600 i, 3000 + 600 j) m of the old single file's far grid that lies inside a plan rectangle
    [x0, y0, x1, y1], or None."""
    x0, y0, x1, y1 = region
    sx = SLOT_FIRST_M + SLOT_STEP_M * max(0, math.ceil((x0 - SLOT_FIRST_M) / SLOT_STEP_M - 1e-9))
    sy = SLOT_FIRST_M + SLOT_STEP_M * max(0, math.ceil((y0 - SLOT_FIRST_M) / SLOT_STEP_M - 1e-9))
    return (sx, sy) if sx <= x1 + 1e-6 and sy <= y1 + 1e-6 else None


def in_polygon(x, y, poly):
    inside = False
    for k in range(len(poly)):
        (x1, y1), (x2, y2) = poly[k], poly[(k + 1) % len(poly)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


# --------------------------------------------------------------------------------------------- rules for one file

def check_file(a, R, known_scenes):
    i = a.id or a.base
    x = a.extras
    # names
    ext_ok = a.base.lower().endswith((".glb", ".gltf"))
    R.check(i + ".file_name", a.id is not None and ext_ok and os.path.splitext(a.base)[0] == "walk-" + a.id,
            "%s; the contract's name is walk-%s.glb" % (a.base, a.id), legacy_ok=True)
    req = a.g.get("extensionsRequired") or []
    bad = [e for e in req if e not in EXTENSIONS_ALLOWED]
    R.check(i + ".extensions", not bad, "required: %s%s" % (", ".join(req) or "none", "; not on the contract's list of required extensions: " + ", ".join(bad) if bad else ""))
    odd = [e for e in (a.g.get("extensionsUsed") or []) if e not in EXTENSIONS_ALLOWED]
    if odd:
        R.note(i + ".extensions_used", "used and not on the contract's list (the list limits what a file may require, not what it may use): " + ", ".join(odd))
    # one Area, at the scene root
    names = [a.loader_name[n] for n in a.area_nodes]
    R.check(i + ".one_area", len(a.area_nodes) == 1 and len(a.area_roots) == 1,
            "Area nodes in the file: %s; at the scene root: %d" % (", ".join(names) or "none", len(a.area_roots)))
    if a.area_root is None:
        return
    # one collision node, named for the area, at the scene root
    cn = [a.loader_name[n] for n in a.coll_nodes]
    want = "HM_Collision_" + a.id
    legacy_coll = cn == ["HM_Collision"]
    R.check(i + ".one_collision", cn == [want] and a.coll["at_root"],
            "collision nodes: %s; the contract's name is %s" % (", ".join(cn) or "none", want), legacy_ok=legacy_coll and a.coll["at_root"])
    stray = [a.loader_name[n] or "(no name)" for n in a.roots if n != a.area_root and n not in a.coll_nodes]
    R.check(i + ".scene_roots", not stray and a.scene_count == 1,
            "%s; scene roots: %s%s" % ("one scene" if a.scene_count == 1 else "%d scenes in the file, and an area file holds one" % a.scene_count,
                                       ", ".join(a.loader_name[n] or "(no name)" for n in a.roots), "" if not stray else "; only the Area and its collision node belong at the root"))
    look_keys = [k for k in SCENE_LOOK_KEYS if k in a.scene_extras]
    R.check(i + ".scene_extras", not look_keys,
            "the glTF scene carries no fog or exposure extras (%s)" % ("its extras: " + ", ".join(sorted(a.scene_extras)) if a.scene_extras else "it has no extras") if not look_keys
            else "the glTF scene carries %s. The viewer reads fog from the scene for the whole file and then paints a flat background and hides the sky. A scene exposure changes nothing while the Area has its own (the Area's is read first); it is kept off as a precaution. An area's look belongs on its Area node" % ", ".join(look_keys))
    if a.coll:
        c = a.coll
        R.check(i + ".collision_form", c["has_mesh"] and not c["transform"] and not c["material"] and c["children"] == 0 and c["extras"].get("wdi_collision") is True,
                "mesh %s, no transform %s, no material %s, no children %s, wdi_collision %s; %d triangles%s" % (
                    c["has_mesh"], not c["transform"], not c["material"], c["children"] == 0, c["extras"].get("wdi_collision"), c["tris"],
                    ", Draco" if c["draco"] else ""))
    # the Area keeps the file's own coordinates: no move, turn or scale on the node
    t = a.nodes[a.area_root].get("translation", [0, 0, 0])
    R.check(i + ".area_at_origin", not has_transform(a.nodes[a.area_root]),
            "Area node at glTF (%s, %s, %s)%s" % (num(t[0], 3), num(t[1], 3), num(t[2], 3), "" if not has_transform(a.nodes[a.area_root]) else "; an area file's coordinates are its own, the Area node carries no transform"))
    # a room and a wild area are built around their own origin: the origin lies on the ground the player can walk
    region = a.walk_region()
    if a.kind in ("room", "wild") and region:
        at_home = region[0] - 1e-6 <= 0 <= region[2] + 1e-6 and region[1] - 1e-6 <= 0 <= region[3] + 1e-6
        R.check(i + ".origin_in_walk_region", at_home,
                "the file's origin lies inside the walk region x %s..%s, y %s..%s" % (region[0], region[2], region[1], region[3]) if at_home
                else "the walk region is x %s..%s, y %s..%s, which does not hold the file's origin (0, 0): a %s sits at its own origin" % (region[0], region[2], region[1], region[3], "room" if a.kind == "room" else "wild area"))
        slot = slot_in(region) or slot_in([t[0], -t[2], t[0], -t[2]])
        if slot:
            R.note(i + ".slot", "it stands on the far grid of the old single file, around (%d, %d) m. Slots are not used for separate files: a room sits at its own origin" % slot)
    # the id and what it says
    id_ok = bool(AREA_ID_RE.match(a.id))
    form = ("village_<key>" if a.kind == "section" else "room_<sceneId>" if a.kind == "room" else "<sceneId>")
    kind_ok = ((a.kind == "section" and a.id.startswith("village_") and len(a.id) > 8)
               or (a.kind == "room" and a.id.startswith("room_") and len(a.id) > 5)
               or (a.kind == "wild" and not a.id.startswith(("village_", "room_")) and a.id != LEGACY_AREA_ID))
    scene_ok = ((a.kind == "section" and a.scene == "overworld") or (a.kind == "room" and a.scene == a.id[len("room_"):])
                or (a.kind == "wild" and a.scene == a.id))
    clash = known_scenes is not None and ((a.kind in ("section", "room") and a.id in known_scenes) or (a.kind in ("room", "wild") and a.scene not in known_scenes))
    R.check(i + ".area_id", id_ok and kind_ok and scene_ok and not clash,
            "id %s, kind %s (form %s), scene %s%s" % (a.id, a.kind, form, a.scene, "; clashes with or is missing from the game's scene ids" if clash else ""),
            legacy_ok=a.id == LEGACY_AREA_ID and id_ok and scene_ok and not clash)
    # the Area's extras: every missing or wrong one is named
    missing, wrong = [], []

    def need(key, ok, why):
        if key not in x:
            missing.append(key)
        elif not ok:
            wrong.append("%s (%s)" % (key, why))

    need("wdi_area", x.get("wdi_area") == a.id, "is %r, the node says %r" % (x.get("wdi_area"), a.id))
    need("wdi_kind", x.get("wdi_kind") in ("section", "room", "wild"), "is %r" % (x.get("wdi_kind"),))
    need("wdi_scene", isinstance(x.get("wdi_scene"), str) and x.get("wdi_scene") != "", "must be a scene id")
    need("wdi_name", isinstance(x.get("wdi_name"), str) and x.get("wdi_name") != "", "must be words")
    w = x.get("wdi_walk_region")
    need("wdi_walk_region", isinstance(w, list) and len(w) == 4 and all(is_number(v) for v in w) and w[0] < w[2] and w[1] < w[3], "must be [x0, y0, x1, y1] with x0 < x1 and y0 < y1")
    need("wdi_exposure", is_number(x.get("wdi_exposure")) and x.get("wdi_exposure") > 0, "must be a number above 0")
    if "wdi_walk_polygon" in x and a.walk_polygon() is None:
        wrong.append("wdi_walk_polygon (must be three or more points: a flat list [x0, y0, x1, y1, ...], a list of [x, y] pairs, or either of them as a JSON string)")
    if a.kind == "room":
        need("wdi_indoor", x.get("wdi_indoor") is True, "a room says true")
    elif a.kind == "section" and x.get("wdi_indoor") is True:
        wrong.append("wdi_indoor (a village section is outdoors)")
    if "wdi_baked" in x and not isinstance(x["wdi_baked"], bool):
        wrong.append("wdi_baked (must be true or false)")
    if not a.indoor:
        fc = x.get("fog_color")
        need("fog_color", isinstance(fc, str) or (isinstance(fc, list) and len(fc) >= 3 and all(is_number(v) for v in fc)), "must be a colour")
        if not ((is_number(x.get("fog_density")) and x.get("fog_density") > 0) or (is_number(x.get("fog_near")) and is_number(x.get("fog_far")))):
            missing.append("fog_density (or fog_near and fog_far)")
    ok = not missing and not wrong
    only_legacy = not wrong and all(k in LEGACY_OK_MISSING for k in missing)
    R.check(i + ".area_extras", ok,
            "all present: wdi_area, wdi_kind, wdi_scene, wdi_name, wdi_walk_region, wdi_exposure%s" % (", wdi_indoor" if a.kind == "room" else ", fog") if ok
            else "missing: %s%s" % (", ".join(missing) or "none", "; wrong: " + "; ".join(wrong) if wrong else ""), legacy_ok=only_legacy)
    # names the loader would change
    mine = [(raw, name) for raw, name in a.renamed if raw.startswith(("Area_", "HM_Collision", "Spawn_", "Portal_"))]
    R.check(i + ".names_unique_in_file", not mine,
            "no Area, collision, spawn or portal name is used twice" if not mine
            else "the loader would rename: " + ", ".join("%s -> %s" % m for m in mine))
    R.check(i + ".reserved_names", not a.reserved_elsewhere,
            "no scene, camera or light definition is named Area_, HM_Collision, Spawn_ or Portal_ something; no mesh is, but a one-primitive mesh whose node gives the object its own name" if not a.reserved_elsewhere
            else "%s. three.js keeps these names in one table with the node names and can put an object of that name into the scene, which the viewer would take for an Area, a collision mesh, a spawn or a portal" % ", ".join(a.reserved_elsewhere))
    # the names as they are written in the file, before three.js strips anything from them
    odd = ([a.nodes[n].get("name") for n in a.area_nodes if not RAW_AREA_RE.match(str(a.nodes[n].get("name")))]
           + [a.nodes[n].get("name") for n in a.coll_nodes if not RAW_COLLISION_RE.match(str(a.nodes[n].get("name")))]
           + [s["raw_name"] for s in a.spawns if not RAW_SPAWN_RE.match(s["raw_name"])]
           + [p["raw_name"] for p in a.portals if not RAW_PORTAL_RE.match(p["raw_name"])])
    R.check(i + ".raw_names", not odd,
            "the names of the Area, the collision node, %d spawns and %d portals are written with lower-case letters, digits and _ (a portal's id may hold dots)" % (len(a.spawns), len(a.portals)) if not odd
            else "written with other characters, which three.js strips or changes without a word: %s. After the prefix a name holds lower-case letters, digits and _; a portal's id may hold dots between them" % ", ".join(repr(o) for o in odd))
    if a.kind == "section":
        R.check(i + ".no_directional_light", not a.sun_nodes,
                "none of the %d lights is directional: the viewer adds the look's moon and sky light, as in every section" % a.stats["lights"] if not a.sun_nodes
                else "a directional light on %s. The viewer adds its own moon and sky light only to a file that has none, so this section would be lit differently from its neighbours" % ", ".join(a.sun_nodes))
    lost = [s["raw_name"] for s in a.spawns if not s["under"]] + [p["raw_name"] for p in a.portals if not p["under"]]
    R.check(i + ".nodes_under_area", not lost, "%d spawns and %d portals under the Area%s" % (len(a.spawns), len(a.portals), "; outside it: " + ", ".join(lost) if lost else ""))
    # spawns
    bad_ids = [s["id"] for s in a.spawns if not SPAWN_ID_RE.match(s["id"])]
    no_words = [s["id"] for s in a.spawns if not (isinstance(s["extras"].get("wdi_spawn"), str) and s["extras"].get("wdi_spawn") and isinstance(s["extras"].get("wdi_district"), str) and s["extras"].get("wdi_district"))]
    bad_flag = [s["id"] for s in a.spawns if "wdi_picker" in s["extras"] and not isinstance(s["extras"]["wdi_picker"], bool)]
    # in a room or a wild area every spawn is Spawn_<sceneId>_<spawnId>: only such a spawn can be a portal's target
    no_scene = [s["id"] for s in a.spawns if a.kind in ("room", "wild") and not s["id"].startswith(a.scene + "_")]
    R.check(i + ".spawn_extras", not bad_ids and not no_words and not bad_flag and not no_scene,
            "%d spawns: ids are lower-case words%s, wdi_spawn and wdi_district give the picker words" % (len(a.spawns), " that start with %s_" % a.scene if a.kind in ("room", "wild") else "") if not (bad_ids or no_words or bad_flag or no_scene)
            else "bad id: %s; id does not start with the scene id %s_: %s; no picker words: %s; wdi_picker not true or false: %s" % (bad_ids or "-", a.scene, no_scene or "-", no_words or "-", bad_flag or "-"))
    # portals
    unread = [p["raw_name"] for p in a.portals if not p["read_by_viewer"]]
    bad_p = [p["raw_name"] for p in a.portals if not (isinstance(p["kind"], str) and isinstance(p["portal_id"], str) and p["portal_id"] == p["raw_name"][len("Portal_"):])]
    R.check(i + ".portal_extras", not unread and not bad_p,
            "%d portals: to, toSpawn, kind and wdi_portal_id are present" % len(a.portals) if not (unread or bad_p)
            else "no to or toSpawn (the viewer skips these): %s; kind or wdi_portal_id missing or not the node's id: %s" % (unread or "-", bad_p or "-"))
    # where they stand
    wr, poly = a.walk_region(), a.walk_polygon()
    if wr:
        out = [q["raw_name"] for q in a.spawns + a.portals
               if not (wr[0] - 1e-6 <= q["pos"][0] <= wr[2] + 1e-6 and wr[1] - 1e-6 <= -q["pos"][2] <= wr[3] + 1e-6)
               or (poly is not None and not in_polygon(q["pos"][0], -q["pos"][2], poly))]
        R.check(i + ".inside_walk_region", not out,
                "all spawns and portals are inside x %s..%s, y %s..%s%s" % (wr[0], wr[2], wr[1], wr[3], " and inside the %d-point outline" % len(poly) if poly else "") if not out
                else "outside the walk region%s: %s" % (" or its outline" if poly else "", ", ".join(out)))
    if a.coll and a.coll["lo"]:
        lo, hi = a.coll["lo"], a.coll["hi"]
        out = [s["raw_name"] for s in a.spawns if not (lo[0] <= s["pos"][0] <= hi[0] and lo[2] <= s["pos"][2] <= hi[2])]
        R.check(i + ".spawn_inside_collision", not out, "every spawn is inside the collision mesh's box" if not out else "outside the collision box: " + ", ".join(out))
    # a spawn inside a portal's walk-in radius: the trigger stays off there until the player has stepped out
    near, gaps = [], []
    for s in a.spawns:
        for p in a.portals:
            d = plan_gap(s["pos"], p["pos"])
            if d is None:
                continue
            gaps.append(d)
            if d <= PORTAL_RADIUS + 1e-6:
                near.append("%s is %s m from %s" % (s["raw_name"], fmt(d), p["raw_name"]))
    if a.kind == "section":
        R.check(i + ".spawn_clear_of_portals", not near,
                "%d spawns, each more than %s m from every portal of the file%s" % (len(a.spawns), num(PORTAL_RADIUS), " (the nearest pair is %s m apart)" % fmt(min(gaps)) if gaps else "") if not near
                else "%s. In a village section every spawn stands more than %s m from every portal: inside the radius the walk-in trigger is off until the player steps out, and the nearest portal takes the door prompt" % ("; ".join(near), num(PORTAL_RADIUS)))
    elif near:
        R.note(i + ".spawn_inside_portal_radius", "%s: arriving there the walk-in trigger stays off until the player steps out and comes back. The arrival of a room or a wild area may stand like this; a spawn of a village section may not" % "; ".join(near))
    # geometry that needs triangles
    if a.coll and a.coll["triangles"] is not None:
        off = []
        for q in a.spawns + a.portals:
            t_hit = ray_first_hit(a.coll["triangles"], (q["pos"][0], q["pos"][1] + 1.0, q["pos"][2]), (0.0, -1.0, 0.0), 1e4)
            h = None if t_hit is None else t_hit - 1.0
            if h is None or not (-0.01 <= h <= 0.10):
                off.append("%s %s" % (q["raw_name"], "no ground" if h is None else fmt(h, 3) + " m"))
        R.check(i + ".stand_on_ground", not off, "%d spawns and portals stand 0 to 0.10 m above the collision floor" % len(a.spawns + a.portals) if not off else "off the ground: " + ", ".join(off))
        if a.kind == "section":
            check_edge(a, R)
    elif a.coll and a.coll["draco"]:
        R.note(i + ".geometry_not_checked", "the collision mesh is Draco-compressed: standing on the ground, the closed edge of a section and seam walls are not checked here (the exporter's Blender checks do that)")


def region_outline(a):
    """The outline of a section's walk region in Blender plan, [(x, y), ...]: its wdi_walk_polygon when it has one,
    else the rectangle wdi_walk_region. None when it has neither."""
    poly = a.walk_polygon()
    if poly:
        return [(p[0], p[1]) for p in poly]
    r = a.walk_region()
    return [(r[0], r[1]), (r[2], r[1]), (r[2], r[3]), (r[0], r[3])] if r else None


def check_edge(a, R):
    """docs/walk-areas.md, section 4: the whole edge of a village section's walk region is closed by collision at least
    3 m above the ground, its face on the edge within the walker's radius. Run on collision that is not Draco-compressed.
    Every 0.25 m along the outline, a ray finds the ground 0.5 m inside the edge, then four rays at 0.25, 1, 2 and
    2.95 m above that ground go outward; each must meet a wall 0.5 m +/- 0.3 m away. The seam walls of section 6 are
    part of the edge and are held to this as well."""
    rule = a.id + ".edge_closed"
    outline = region_outline(a)
    if not outline:
        return
    length = sum(math.hypot(outline[(k + 1) % len(outline)][0] - outline[k][0], outline[(k + 1) % len(outline)][1] - outline[k][1])
                 for k in range(len(outline)))
    if length > EDGE["max_length"]:
        R.check(rule, False, "the edge of the walk region is %s m long: longer than the %s m this script samples; a village section is smaller" % (num(length, 1), num(EDGE["max_length"])))
        return
    c = a.coll
    if not c["triangles"]:
        R.check(rule, False, "the collision mesh holds no triangle, so there is no wall at the edge")
        return
    if "grid" not in c:
        c["grid"] = TriGrid(c["triangles"])
    grid = c["grid"]
    heights = (0.25, 1.0, 2.0, SEAM["wall_height"] - 0.05)
    places, rays, holes, bad_places = 0, 0, [], 0
    for k in range(len(outline)):
        (x1, y1), (x2, y2) = outline[k], outline[(k + 1) % len(outline)]
        seg = math.hypot(x2 - x1, y2 - y1)
        if seg < 1e-9:
            continue
        ux, uy = (x2 - x1) / seg, (y2 - y1) / seg
        # not within 0.3 m of a corner of the outline: there a ray's start can lie inside the thickness of the next wall,
        # and a gap that close to a corner is narrower than the walker (0.6 m) and cannot be walked through
        span = seg - 2 * EDGE["corner"]
        count = max(1, int(math.ceil(span / EDGE["step"] - 1e-9))) if span > 0 else 1
        for j in range(count):
            t = EDGE["corner"] + (j + 0.5) / count * span if span > 0 else seg / 2
            px, py = x1 + ux * t, y1 + uy * t
            ix, iy = -uy, ux                                          # the left normal ...
            if not in_polygon(px + ix * 0.1, py + iy * 0.1, outline):  # ... is inward when the outline runs counter-clockwise
                ix, iy = -ix, -iy
            places += 1
            gx, gz = px + ix * EDGE["inside"], -(py + iy * EDGE["inside"])       # the ray's start in glTF axes
            rays += 1
            down = grid.first_hit((gx, grid.top + 1.0, gz), (0.0, -1.0, 0.0), grid.top - grid.bottom + 2.0)
            if down is None:
                bad_places += 1
                holes.append("at (%s, %s): no ground %s m inside the edge" % (fmt(px), fmt(py), num(EDGE["inside"])))
                continue
            ground = grid.top + 1.0 - down
            found = []
            for h in heights:
                rays += 1
                hit = grid.first_hit((gx, ground + h, gz), (-ix, 0.0, iy), EDGE["reach"])
                if hit is None or abs(hit - EDGE["inside"]) > EDGE["face_tol"] + 1e-6:
                    found.append("%s m above the ground: %s" % (h, "no wall within %s m" % num(EDGE["reach"]) if hit is None else "wall %s m from the ray's start" % fmt(hit)))
            if found:
                bad_places += 1
                holes.append("at (%s, %s), %s" % (fmt(px), fmt(py), "; ".join(found)))
    R.check(rule, not holes,
            "the %s m edge is closed: at %d places, %s m apart, four rays up to %s m above the ground, from %s m inside the edge, all meet a wall within %s m of it (%d rays)"
            % (num(length, 1), places, num(EDGE["step"]), SEAM["wall_height"] - 0.05, num(EDGE["inside"]), num(EDGE["face_tol"]), rays) if not holes
            else "%d of %d places along the %s m edge are open: %s%s. The whole edge of a village section is closed by collision at least %s m high with its face within %s m of the edge: a gap lets the player walk off into the void"
            % (bad_places, places, num(length, 1), "; ".join(holes[:3]), " ..." if len(holes) > 3 else "", num(SEAM["wall_height"]), num(EDGE["face_tol"])))


def check_targets(a, R):
    t = PLANNING_TARGETS[a.kind]
    have = dict(a.stats, bytes=a.size)
    over = []
    for key, limit in t.items():
        if have[key] > limit:
            over.append("%s %s against %s" % (key, have[key], limit))
    if a.stats["texture_gpu_mb"] > TEXTURE_CEILING_MB:
        over.append("texture_gpu_mb is above the planning ceiling of %s" % TEXTURE_CEILING_MB)
    text = ("%s: %s B, %s triangles loaded, %s collision triangles, %s draw calls, %s MB of GPU texture (%d images, largest side %d px), %s lights"
            % (a.kind, a.size, a.stats["triangles_loaded"], a.stats["triangles_collision"], a.stats["draw_calls"], a.stats["texture_gpu_mb"],
               a.stats["images"], a.image_largest, a.stats["lights"]))
    if over:
        R.add("FAIL" if R.strict_targets else "NOTE", (a.id or a.base) + ".planning_targets", "over a planning target (not a viewer limit): %s. %s" % ("; ".join(over), text))
    else:
        R.add("PASS", (a.id or a.base) + ".planning_targets", "within the planning targets. " + text)
    if a.images_unknown:
        R.note((a.id or a.base) + ".images_unread", "%d image headers could not be read; the texture figure leaves them out" % a.images_unknown)


# --------------------------------------------------------------------------------------------- rules across files

def seam_tables(areas):
    """Every seam portal and arrival spawn, grouped by seam id and side."""
    seams = {}
    for a in areas:
        for p in a.portals:
            if not p["raw_name"].startswith("Portal_seam_"):
                continue
            m = SEAM_PORTAL_RE.match(p["raw_name"][len("Portal_"):])
            sid = p["extras"].get("wdi_seam") if isinstance(p["extras"].get("wdi_seam"), str) else (m.group(1) if m else "?")
            side, n = (m.group(2), int(m.group(3))) if m else ("?", 0)
            if m and m.group(1) != sid:      # the name and wdi_seam disagree: keep the name's side and number
                side, n = m.group(2), int(m.group(3))
            s = seams.setdefault(sid, dict(portals={}, arrivals={}, bad_names=[]))
            if not m or m.group(1) != sid:
                s["bad_names"].append(p["raw_name"])
            s["portals"].setdefault(side, []).append(dict(p, n=n, area=a.id))
        for sp in a.spawns:
            m = SEAM_SPAWN_RE.match(sp["id"])
            if m:
                s = seams.setdefault(m.group(1), dict(portals={}, arrivals={}, bad_names=[]))
                s["arrivals"].setdefault(m.group(2), []).append(dict(sp, n=int(m.group(3)), area=a.id))
    return seams


def xy(pos):
    return (pos[0], -pos[2])


def row_height(row, row_lat, s):
    """The height of a seam's row at the sideways place s: between two portal points, on the straight line through
    their heights; beyond the ends, on the line through the last two. With one point, that point's height."""
    if len(row) < 2:
        return row[0]["pos"][1]
    k = 0
    while k < len(row) - 2 and s > row_lat[k + 1]:
        k += 1
    span = row_lat[k + 1] - row_lat[k]
    if abs(span) < 1e-9:
        return row[k]["pos"][1]
    return row[k]["pos"][1] + (row[k + 1]["pos"][1] - row[k]["pos"][1]) * (s - row_lat[k]) / span


def check_seams(areas, R):
    by_id = {a.id: a for a in areas}
    out = []
    for sid, s in sorted(seam_tables(areas).items()):
        rule = "seam.%s." % sid
        P, A = s["portals"], s["arrivals"]
        rows = {side: sorted(P.get(side, []), key=lambda p: p["n"]) for side in ("a", "b")}
        homes = {side: sorted({p["area"] for p in rows[side]}) for side in ("a", "b")}
        sides_ok = (bool(SEAM_ID_RE.match(sid)) and not s["bad_names"] and set(P) <= {"a", "b"} and len(homes["a"]) == 1 and len(homes["b"]) == 1
                    and homes["a"] != homes["b"] and all(by_id[h[0]].kind == "section" for h in homes.values()))
        R.check(rule + "sides", sides_ok,
                "side a is %s, side b is %s" % (homes["a"][0], homes["b"][0]) if sides_ok
                else "seam id %r; side a in %s, side b in %s; names that do not fit Portal_seam_<seamId>_<a or b>_<n>: %s; a seam joins two village sections" % (sid, homes["a"] or "no file", homes["b"] or "no file", s["bad_names"] or "-"))
        if not sides_ok:
            continue
        a_area, b_area = homes["a"][0], homes["b"][0]
        na, nb = [p["n"] for p in rows["a"]], [p["n"] for p in rows["b"]]
        count = len(na)
        R.check(rule + "numbering", na == list(range(1, count + 1)) and nb == na,
                "%d points a side, numbered 1 to %d" % (count, count) if na == list(range(1, count + 1)) and nb == na else "side a has %s, side b has %s; both rows count 1, 2, 3 ... with the same numbers" % (na, nb))
        # extras
        width = rows["a"][0]["extras"].get("wdi_width_m")
        kind = rows["a"][0]["extras"].get("wdi_seam_kind")
        bad = []
        for side in ("a", "b"):
            other = "b" if side == "a" else "a"
            for p in rows[side]:
                e, want_id = p["extras"], "seam_%s_%s_%d" % (sid, side, p["n"])
                probs = []
                if e.get("to") != "overworld":
                    probs.append("to is %r, not 'overworld'" % (e.get("to"),))
                if e.get("toSpawn") != "seam_%s_%s_%d" % (sid, other, p["n"]):
                    probs.append("toSpawn is %r" % (e.get("toSpawn"),))
                if e.get("kind") != "gate":
                    probs.append("kind is %r, not 'gate'" % (e.get("kind"),))
                if e.get("wdi_portal_id") != want_id:
                    probs.append("wdi_portal_id is %r" % (e.get("wdi_portal_id"),))
                if e.get("wdi_seam") != sid:
                    probs.append("wdi_seam is %r" % (e.get("wdi_seam"),))
                if e.get("wdi_seam_kind") not in SEAM_KINDS or e.get("wdi_seam_kind") != kind:
                    probs.append("wdi_seam_kind is %r" % (e.get("wdi_seam_kind"),))
                if not is_number(e.get("wdi_width_m")) or not 0 < e.get("wdi_width_m") <= SEAM["width_max"] or e.get("wdi_width_m") != width:
                    probs.append("wdi_width_m is %r (a number above 0, the same on every portal of the seam; these tools do not sample an opening wider than %s m)" % (e.get("wdi_width_m"), num(SEAM["width_max"])))
                if probs:
                    bad.append("%s: %s" % (p["raw_name"], ", ".join(probs)))
        R.check(rule + "extras", not bad, "to overworld, kind gate, wdi_seam_kind %s, wdi_width_m %s on all %d portals" % (kind, width, 2 * count) if not bad else "; ".join(bad))
        if not is_number(width) or not 0 < width <= SEAM["width_max"] or count == 0 or len(rows["b"]) == 0:
            continue
        # the two rows: straight, parallel, 0.9 m apart, the same numbers facing each other
        ca = [sum(xy(p["pos"])[k] for p in rows["a"]) / count for k in (0, 1)]
        cb = [sum(xy(p["pos"])[k] for p in rows["b"]) / len(rows["b"]) for k in (0, 1)]
        if count >= 2:
            first, last = xy(rows["a"][0]["pos"]), xy(rows["a"][-1]["pos"])
            ln = math.hypot(last[0] - first[0], last[1] - first[1]) or 1.0
            tg = ((last[0] - first[0]) / ln, (last[1] - first[1]) / ln)
            d = (cb[0] - ca[0], cb[1] - ca[1])
            along = d[0] * tg[0] + d[1] * tg[1]
            nx, ny = d[0] - along * tg[0], d[1] - along * tg[1]
        else:
            nx, ny = cb[0] - ca[0], cb[1] - ca[1]
        nl = math.hypot(nx, ny) or 1.0
        nrm = (nx / nl, ny / nl)                       # from side a to side b
        if count < 2:
            tg = (-nrm[1], nrm[0])
        mid = ((ca[0] + cb[0]) / 2, (ca[1] + cb[1]) / 2)

        def lat(p):
            q = xy(p)
            return (q[0] - mid[0]) * tg[0] + (q[1] - mid[1]) * tg[1]

        def fwd(p):
            q = xy(p)
            return (q[0] - mid[0]) * nrm[0] + (q[1] - mid[1]) * nrm[1]

        la, lb = [lat(p["pos"]) for p in rows["a"]], [lat(p["pos"]) for p in rows["b"]]
        fa, fb = [fwd(p["pos"]) for p in rows["a"]], [fwd(p["pos"]) for p in rows["b"]]
        apart = (sum(fb) / len(fb)) - (sum(fa) / len(fa))
        straight = max(abs(v - sum(fa) / len(fa)) for v in fa) <= SEAM["tol"] and max(abs(v - sum(fb) / len(fb)) for v in fb) <= SEAM["tol"]
        facing = len(la) == len(lb) and all(abs(u - v) <= SEAM["lateral_max"] for u, v in zip(la, lb))
        row_ok = straight and facing and abs(apart - 2 * SEAM["portal_to_wall"]) <= 2 * SEAM["tol"]
        R.check(rule + "row", row_ok,
                "the rows are straight, %s m apart (2 x %s), and the same numbers face each other" % (fmt(apart), SEAM["portal_to_wall"]) if row_ok
                else "straight %s; rows %s m apart (should be %s); same numbers face each other %s" % (straight, fmt(apart), fmt(2 * SEAM["portal_to_wall"]), facing))
        gaps = [la[k + 1] - la[k] for k in range(len(la) - 1)] + [lb[k + 1] - lb[k] for k in range(len(lb) - 1)]
        sp_ok = all(1e-6 < g <= SEAM["gap_max"] + 1e-3 for g in gaps)
        R.check(rule + "spacing", sp_ok,
                "gaps between neighbours: %s m (at most %s)" % (", ".join(fmt(g) for g in gaps[:len(la) - 1]) or "one point", SEAM["gap_max"]) if sp_ok
                else "gaps between neighbours: %s m; the rule is at most %s m, counted in one direction" % (", ".join(fmt(g) for g in gaps), SEAM["gap_max"]))
        end_gaps = []
        for row in (la, lb):
            end_gaps += [width / 2 + min(row), width / 2 - max(row)]
        cov_ok = all(-1e-3 <= g <= SEAM["end_gap_max"] + 1e-3 for g in end_gaps)
        R.check(rule + "coverage", cov_ok,
                "the opening is %s m wide; the end points stand %s m from its ends (at most %s)" % (num(width, 3), fmt(max(end_gaps)), SEAM["end_gap_max"]) if cov_ok
                else "the opening is %s m wide; end points stand %s m from its ends: at most %s m, and no point outside the opening (an opening wider than 2 m needs a row)" % (num(width, 3), ", ".join(fmt(g) for g in end_gaps), SEAM["end_gap_max"]))
        # arrivals: the walker who leaves by portal <side>_<n> arrives at spawn <other side>_<n>
        bad, worst = [], dict(beyond=[], lateral=0.0, yaw=0.0, ret=1e9)
        for side, other, travel in (("a", "b", nrm), ("b", "a", (-nrm[0], -nrm[1]))):
            arr = {s2["n"]: s2 for s2 in A.get(other, [])}
            wrong_file = [s2["raw_name"] for s2 in A.get(other, []) if s2["area"] != homes[other][0]]
            if wrong_file:
                bad.append("in the wrong file: " + ", ".join(wrong_file))
            for p in rows[side]:
                sp = arr.get(p["n"])
                if sp is None:
                    bad.append("no Spawn_overworld_seam_%s_%s_%d" % (sid, other, p["n"]))
                    continue
                dx, dy = xy(sp["pos"])[0] - xy(p["pos"])[0], xy(sp["pos"])[1] - xy(p["pos"])[1]
                beyond = dx * travel[0] + dy * travel[1]
                side_off = abs(dx * tg[0] + dy * tg[1])
                yaw_err = math.degrees(math.acos(max(-1.0, min(1.0, sp["face_xy"][0] * travel[0] + sp["face_xy"][1] * travel[1]))))
                # every portal of the file the arrival stands in, the return row and any door or other seam alike
                close = sorted((g, q["raw_name"]) for g, q in ((plan_gap(sp["pos"], q["pos"]), q) for q in by_id[sp["area"]].portals) if g is not None)
                worst["beyond"].append(beyond)
                worst["lateral"], worst["yaw"] = max(worst["lateral"], side_off), max(worst["yaw"], yaw_err)
                worst["ret"] = min(worst["ret"], close[0][0]) if close else worst["ret"]
                probs = []
                if abs(beyond - SEAM["arrival_beyond"]) > SEAM["tol"]:
                    probs.append("%s m beyond its departure portal, not %s" % (fmt(beyond), SEAM["arrival_beyond"]))
                if side_off > SEAM["lateral_max"] + 1e-6:
                    probs.append("%s m sideways" % fmt(side_off))
                if yaw_err > SEAM["yaw_max"]:
                    probs.append("faces %s degrees off the direction of travel" % fmt(yaw_err, 1))
                for g, q_name in close:
                    if g < SEAM["arrival_clear_min"] - 1e-3:
                        probs.append("%s m from %s, under %s" % (fmt(g), q_name, SEAM["arrival_clear_min"]))
                if sp["extras"].get("wdi_picker") is not False:
                    probs.append("wdi_picker is not false")
                if probs:
                    bad.append("%s: %s" % (sp["raw_name"], ", ".join(probs)))
        for side in ("a", "b"):
            extra = [s2["raw_name"] for s2 in A.get(side, []) if s2["n"] not in [p["n"] for p in rows["b" if side == "a" else "a"]]]
            if extra:
                bad.append("arrival with no portal leading to it: " + ", ".join(extra))
        R.check(rule + "arrival", not bad,
                "%d arrivals: %s m beyond the departure portal, at most %s m sideways, at most %s degrees off, at least %s m from every portal of their file, wdi_picker false"
                % (len(worst["beyond"]), fmt(sum(worst["beyond"]) / max(1, len(worst["beyond"]))), fmt(worst["lateral"]), fmt(worst["yaw"], 1), fmt(worst["ret"])) if not bad else "; ".join(bad))
        # nothing else near the rows: a portal that is not of this seam's row stands at least 2 m from every point of
        # it, so that no other 1 m disc reaches into the discs of the row
        crowd, nearest_other = [], None
        for side in ("a", "b"):
            own = {p["node"] for p in rows[side]}
            for q in by_id[homes[side][0]].portals:
                if q["node"] in own:
                    continue
                for p in rows[side]:
                    g = plan_gap(q["pos"], p["pos"])
                    if g is None:
                        continue
                    nearest_other = g if nearest_other is None else min(nearest_other, g)
                    if g < SEAM["row_clear_min"] - 1e-3:
                        crowd.append("%s is %s m from %s" % (q["raw_name"], fmt(g), p["raw_name"]))
        R.check(rule + "clear", not crowd,
                "no other portal within %s m of a point of either row%s" % (num(SEAM["row_clear_min"]), " (the nearest is %s m away)" % fmt(nearest_other) if nearest_other is not None else " (the two files hold no other portal at that height)") if not crowd
                else "%s. No portal outside a seam's own row stands within %s m of a point of it: the two walk-in discs would overlap and the wrong one could fire" % ("; ".join(crowd), num(SEAM["row_clear_min"])))
        # the two files agree on the height of the ground at the seam line. Each side's ground is carried to the line
        # from its portal and the arrival behind it; this needs no collision data, so it runs on Draco files too
        line_h = {}
        for side in ("a", "b"):
            arr = {s2["n"]: s2 for s2 in A.get(side, [])}
            for p in rows[side]:
                hp, dp = p["pos"][1], abs(fwd(p["pos"]))
                sp = arr.get(p["n"])
                da = abs(fwd(sp["pos"])) if sp else 0.0
                line_h[(side, p["n"])] = hp + (hp - sp["pos"][1]) * dp / (da - dp) if sp and da - dp > 0.1 else hp
        steps = [(abs(line_h[("a", n)] - line_h[("b", n)]), n) for n in na if ("a", n) in line_h and ("b", n) in line_h]
        step_bad = ["point %d: side a puts the ground at the line at %s m, side b at %s m" % (n, fmt(line_h[("a", n)]), fmt(line_h[("b", n)])) for d, n in steps if d > SEAM["height_max"] + 1e-6]
        R.check(rule + "height", bool(steps) and not step_bad,
                "the two files put the ground at the seam line at the same height: at most %s m apart at %d points (the rule is %s m)" % (fmt(max(d for d, _ in steps)), len(steps), SEAM["height_max"]) if steps and not step_bad
                else "%s. Village sections share the village's coordinates, heights too: the two sides differ by more than %s m" % ("; ".join(step_bad) or "no pair of points to compare", SEAM["height_max"]))
        # the look is the same on both sides, in the files. wdi_baked is part of it: the viewer switches off every
        # light of an area that says so (world.ts, switchOffBakedLights), so one baked side changes the picture
        la_, lb_ = by_id[a_area].look, by_id[b_area].look
        ba_, bb_ = by_id[a_area].baked, by_id[b_area].baked
        same_look = la_ == lb_ and ba_ == bb_
        R.check(rule + "look_equal", same_look and "wdi_exposure" in la_,
                "both files: %s, wdi_baked %s" % (json.dumps(la_, sort_keys=True), json.dumps(ba_)) if same_look
                else "%s has %s, wdi_baked %s; %s has %s, wdi_baked %s: the crossing would change the picture" % (a_area, json.dumps(la_, sort_keys=True), json.dumps(ba_), b_area, json.dumps(lb_, sort_keys=True), json.dumps(bb_)))
        # the wall across the opening, in each file whose collision can be read
        for side, area_id, toward in (("a", a_area, nrm), ("b", b_area, (-nrm[0], -nrm[1]))):
            c = by_id[area_id].coll
            if not c or c["triangles"] is None:
                R.note(rule + "barrier_not_checked." + side, "%s: the collision mesh is %s, so the wall across the opening is not checked here" % (area_id, "Draco-compressed" if c and c["draco"] else "missing"))
                continue
            row = rows[side]
            base = (sum(xy(p["pos"])[0] for p in row) / len(row), sum(xy(p["pos"])[1] for p in row) / len(row))
            base_lat = (base[0] - mid[0]) * tg[0] + (base[1] - mid[1]) * tg[1]
            row_lat = [lat(p["pos"]) for p in row]
            d3 = (toward[0], 0.0, -toward[1])
            holes, rays, cols = [], 0, max(1, int(round((width - 0.1) / 0.25)))
            for k in range(cols + 1):
                s_lat = -width / 2 + 0.05 + (width - 0.1) * k / cols
                px, py = base[0] + tg[0] * (s_lat - base_lat), base[1] + tg[1] * (s_lat - base_lat)
                # the wall's height is measured from the ground under each ray, so ground that slopes is no fault
                start = row_height(row, row_lat, s_lat) + 1.0
                t_down = ray_first_hit(c["triangles"], (px, start, -py), (0.0, -1.0, 0.0), 6.0)
                if t_down is None:
                    rays += 4
                    holes.append("at %s m along the opening: no ground under the row" % fmt(s_lat))
                    continue
                ground = start - t_down
                for h in (0.25, 1.0, 2.0, SEAM["wall_height"] - 0.05):
                    rays += 1
                    t_hit = ray_first_hit(c["triangles"], (px, ground + h, -py), d3, 50.0)
                    if t_hit is None or abs(t_hit - SEAM["portal_to_wall"]) > SEAM["tol"]:
                        holes.append("at %s m along the opening, %s m above the ground: %s" % (fmt(s_lat), h, "nothing within 50 m" if t_hit is None else "wall at %s m" % fmt(t_hit)))
            back = []
            for sp in A.get(side, []):
                rays += 1
                t_hit = ray_first_hit(c["triangles"], (sp["pos"][0], sp["pos"][1] + 1.0, sp["pos"][2]), d3, 50.0)
                if t_hit is None or abs(t_hit - SEAM["arrival_inside"]) > SEAM["tol"]:
                    back.append("%s: %s" % (sp["raw_name"], "no wall behind it" if t_hit is None else "wall %s m behind it, not %s" % (fmt(t_hit), SEAM["arrival_inside"])))
            R.check(rule + "barrier." + side, not holes and not back,
                    "%s: %d rays across the %s m opening, up to %s m above the ground under each, all meet the wall %s m in front of the row; arrivals stand %s m inside it"
                    % (area_id, rays, num(width, 3), SEAM["wall_height"] - 0.05, SEAM["portal_to_wall"], SEAM["arrival_inside"]) if not holes and not back
                    else "%s: %d of %d rays find no wall %s m in front of the row (%s)%s" % (area_id, len(holes), rays, SEAM["portal_to_wall"], "; ".join(holes[:3]), "; " + "; ".join(back[:3]) if back else ""))
        half = width / 2
        out.append(dict(id=sid, kind=kind, width_m=num(width), a=a_area, b=b_area, portals=count,
                        opening_xy=[[num(mid[0] - tg[0] * half), num(mid[1] - tg[1] * half)], [num(mid[0] + tg[0] * half), num(mid[1] + tg[1] * half)]],
                        normal_xy=[num(nrm[0]), num(nrm[1])]))
    return out


def check_world(areas, R, known_scenes, declared_pending, pending_is_declared):
    """Rules across the files. Returns (spawn id -> area id, pending scene ids, seams)."""
    by_id = {a.id: a for a in areas}
    homes = {}
    for a in areas:
        for s in a.spawns:
            homes.setdefault(s["id"], []).append(a.id)
    dup = {k: v for k, v in homes.items() if len(v) > 1}
    total = sum(len(a.spawns) for a in areas)
    R.check("world.spawn_unique", not dup, "%d spawn ids in %d files, each used once" % (total, len(areas)) if not dup
            else "used more than once: " + "; ".join("%s in %s" % (k, " and ".join(v)) for k, v in sorted(dup.items())))
    seen, dup_p = {}, []
    for a in areas:
        for p in a.portals:
            for key in {p["id"], p["portal_id"] if isinstance(p["portal_id"], str) else p["id"]}:
                if key in seen and seen[key] != (a.id, p["node"]):
                    dup_p.append(key)
                seen[key] = (a.id, p["node"])
    R.check("world.portal_unique", not dup_p, "%d portal ids, each used once" % sum(len(a.portals) for a in areas) if not dup_p else "used more than once: " + ", ".join(sorted(set(dup_p))))
    # where every portal leads: the exact id <to>_<toSpawn>, looked up across all files
    built = {a.scene for a in areas}
    pending, needed_by, waiting_bare = set(), {}, []
    for a in areas:
        bad, n_ok = [], 0
        for p in a.portals:
            if not p["read_by_viewer"]:
                continue
            exact = "%s_%s" % (p["to"], p["toSpawn"])
            home = homes.get(exact, [])
            p["target_area"] = home[0] if home else None
            if home:
                if by_id[home[0]].scene != p["to"]:
                    bad.append("%s: Spawn_%s is in %s, whose scene is %s, not %s" % (p["raw_name"], exact, home[0], by_id[home[0]].scene, p["to"]))
                else:
                    n_ok += 1
                continue
            bare = homes.get(p["toSpawn"])
            hint = " (a spawn with the bare id %r exists in %s: the single-file fallback of today would take it; with an index it is not used)" % (p["toSpawn"], bare[0]) if bare else ""
            if p["to"] in built:
                bad.append("%s: scene %s is built and has no Spawn_%s%s" % (p["raw_name"], p["to"], exact, hint))
            elif known_scenes is not None and p["to"] not in known_scenes:
                bad.append("%s: %r is not one of the game's scene ids%s" % (p["raw_name"], p["to"], hint))
            elif known_scenes is None and p["to"] not in declared_pending:
                bad.append("%s: scene %r is in no file and is not %s%s" % (p["raw_name"], p["to"], "listed under pending in the index" if pending_is_declared else "named with --pending (or known through --scene-ids)", hint))
            else:
                # a scene that is not built yet: with an index the viewer says so and never looks at the bare id, so a
                # spawn of another scene that happens to have the bare id is no fault (docs/walk-areas.md, section 5)
                pending.add(p["to"])
                needed_by.setdefault(p["to"], []).append("%s in %s" % (p["raw_name"], a.id))
                if bare:
                    waiting_bare.append("%s in %s (scene %s is not built yet, so the viewer says so; the bare id %r is a spawn in %s)"
                                        % (p["raw_name"], a.id, p["to"], p["toSpawn"], bare[0]))
        R.check(a.id + ".portal_target", not bad, "%d of %d portals lead to a spawn in the index by the exact id; %d lead to scenes that are not built yet" % (n_ok, len(a.portals), len([p for p in a.portals if p.get("target_area") is None and p["read_by_viewer"]])) if not bad else "; ".join(bad))
    for scene in sorted(pending):
        R.note("world.pending." + scene, "not built yet, needed by " + "; ".join(needed_by[scene]))
    hazards = []
    for a in areas:
        for p in a.portals:
            if p.get("target_area") and p["toSpawn"] in homes and "%s_%s" % (p["to"], p["toSpawn"]) != p["toSpawn"]:
                hazards.append("%s in %s (exact target Spawn_%s_%s in %s; the bare id %r is a spawn in %s)" % (p["raw_name"], a.id, p["to"], p["toSpawn"], p["target_area"], p["toSpawn"], homes[p["toSpawn"]][0]))
    hazards += waiting_bare
    if hazards:
        R.note("world.bare_id_hazard", "a loader that falls back to the bare toSpawn would go wrong at: " + "; ".join(hazards) + ". With an index the exact id is the only lookup")
    # a crossing between two village sections is always a seam; the stem seam_ is reserved for seams
    bad = []
    for a in areas:
        for p in a.portals:
            t = p.get("target_area")
            is_seam = p["raw_name"].startswith("Portal_seam_")
            if t and t != a.id and a.kind == "section" and by_id[t].kind == "section" and not is_seam:
                bad.append("%s crosses from %s to %s and is not a seam portal" % (p["raw_name"], a.id, t))
            if is_seam and a.kind != "section":
                bad.append("%s is a seam portal in %s, which is not a village section" % (p["raw_name"], a.id))
            if not is_seam and (p["id"].startswith("seam_") or str(p["toSpawn"]).startswith("seam_")):
                bad.append("%s uses the stem seam_, which is kept for seams" % p["raw_name"])
        for s in a.spawns:
            if s["id"].startswith("seam_") or (s["id"].startswith("overworld_seam_") and not SEAM_SPAWN_RE.match(s["id"])):
                bad.append("Spawn_%s uses the stem seam_, which is kept for seam arrivals" % s["id"])
    R.check("world.seams_only_between_sections", not bad, "every crossing between two village sections is a seam, and only seams use the stem seam_" if not bad else "; ".join(bad))
    seams = check_seams(areas, R)
    return {k: v[0] for k, v in homes.items()}, sorted(pending), seams


def note_reach(areas, R, spawn_home, start):
    """Two notes, never failures. An area that no portal of another area leads into (the area the viewer starts in is
    left out). And a way out of a room or a wild area that arrives in another file than the door that leads in, or
    more than 10 m from that door."""
    by_id = {a.id: a for a in areas}
    into = {}
    for a in areas:
        for p in a.portals:
            t = p.get("target_area")
            if t and t != a.id:
                into.setdefault(t, []).append((a, p))
    for a in sorted(areas, key=lambda q: q.id):
        if a.id not in into:
            if a.id != spawn_home.get(start):
                R.note(a.id + ".no_way_in", "no portal of another area leads into %s: the player reaches it only through the picker, or a link that names one of its spawns" % a.id)
            continue
        if a.kind not in ("room", "wild"):
            continue
        for p in a.portals:
            t = p.get("target_area")
            if not t or t == a.id:
                continue
            spawn = next((s for s in by_id[t].spawns if s["id"] == "%s_%s" % (p["to"], p["toSpawn"])), None)
            if spawn is None:
                continue
            doors = [q for src, q in into[a.id] if src.id == t]
            if not doors:
                R.note(a.id + ".way_back", "%s arrives at Spawn_%s in %s, and no door into %s stands in that file (its doors are in %s): the player comes out in another file than the one they went in by"
                       % (p["raw_name"], spawn["id"], t, a.id, ", ".join(sorted({src.id for src, _ in into[a.id]}))))
                continue
            d, q = min(((math.hypot(spawn["pos"][0] - q["pos"][0], spawn["pos"][2] - q["pos"][2]), q) for q in doors), key=lambda row: row[0])
            if d > WAY_BACK_FAR_M:
                R.note(a.id + ".way_back", "%s arrives at Spawn_%s, %s m from %s, the nearest door into %s: more than %s m from where the player went in"
                       % (p["raw_name"], spawn["id"], fmt(d, 1), q["raw_name"], a.id, num(WAY_BACK_FAR_M)))


# --------------------------------------------------------------------------------------------- the index

def build_index(areas, world, start, pending, seams):
    idx = dict(format=FORMAT, world=world, axes=AXES_NOTE, start=start, areas={}, scenes={}, seams=seams, pending=pending)
    for a in sorted(areas, key=lambda q: q.id):
        e = dict(file=a.base, bytes=a.size, sha256=a.sha256, kind=a.kind, scene=a.scene, name=a.name, indoor=a.indoor, baked=a.baked,
                 walk_region_xy=a.walk_region())
        if a.walk_polygon() is not None:
            e["walk_polygon_xy"] = a.walk_polygon()
        e.update(look=a.look, spawns=[], portals=[], stats=a.stats)
        for s in a.spawns:
            row = dict(id=s["id"], label=s["label"], name=s["name"], group=s["group"], position=[num(v) for v in s["pos"]], yaw_deg=num(s["yaw"]))
            if s["extras"].get("wdi_picker") is False:
                row["picker"] = False
            e["spawns"].append(row)
        for p in a.portals:
            if not p["read_by_viewer"]:
                continue
            row = dict(id=p["id"], portal_id=p["portal_id"] if isinstance(p["portal_id"], str) else p["raw_name"][len("Portal_"):],
                       position=[num(v) for v in p["pos"]], to=p["to"], toSpawn=p["toSpawn"], kind=p["kind"] if isinstance(p["kind"], str) else "door",
                       target_area=p.get("target_area"))
            if p["raw_name"].startswith("Portal_seam_") and isinstance(p["extras"].get("wdi_seam"), str):
                row["seam"] = p["extras"]["wdi_seam"]
            e["portals"].append(row)
        idx["areas"][a.id] = e
        idx["scenes"].setdefault(a.scene, []).append(a.id)
    for v in idx["scenes"].values():
        v.sort()
    return idx


def schema_errors(value, schema, root, path="index"):
    """A small JSON Schema checker for the keywords schema/walk-index.schema.json uses."""
    errs = []
    if "$ref" in schema:
        target = root
        for part in schema["$ref"].lstrip("#/").split("/"):
            target = target[part]
        return schema_errors(value, target, root, path)
    if "anyOf" in schema:
        if all(schema_errors(value, s, root, path) for s in schema["anyOf"]):
            errs.append("%s fits none of the allowed forms" % path)
    t = schema.get("type")
    if t is not None:
        kinds = t if isinstance(t, list) else [t]
        ok = any((k == "object" and isinstance(value, dict)) or (k == "array" and isinstance(value, list))
                 or (k == "string" and isinstance(value, str)) or (k == "boolean" and isinstance(value, bool))
                 or (k == "null" and value is None) or (k == "number" and is_number(value))
                 or (k == "integer" and is_number(value) and float(value) == int(value)) for k in kinds)
        if not ok:
            return errs + ["%s should be %s" % (path, " or ".join(kinds))]
    if "const" in schema and value != schema["const"]:
        errs.append("%s should be %r" % (path, schema["const"]))
    if "enum" in schema and value not in schema["enum"]:
        errs.append("%s is %r, not one of %s" % (path, value, schema["enum"]))
    if isinstance(value, str):
        if "pattern" in schema and not re.search(schema["pattern"], value):
            errs.append("%s is %r, which does not fit %s" % (path, value, schema["pattern"]))
        if len(value) < schema.get("minLength", 0):
            errs.append("%s is too short" % path)
    if is_number(value):
        if "minimum" in schema and value < schema["minimum"]:
            errs.append("%s is under %s" % (path, schema["minimum"]))
        if "exclusiveMinimum" in schema and value <= schema["exclusiveMinimum"]:
            errs.append("%s must be above %s" % (path, schema["exclusiveMinimum"]))
    if isinstance(value, list):
        if len(value) < schema.get("minItems", 0) or len(value) > schema.get("maxItems", 1 << 60):
            errs.append("%s has %d items" % (path, len(value)))
        if schema.get("uniqueItems") and len({json.dumps(v, sort_keys=True) for v in value}) != len(value):
            errs.append("%s repeats an item" % path)
        if "items" in schema:
            for k, v in enumerate(value):
                errs += schema_errors(v, schema["items"], root, "%s[%d]" % (path, k))
    if isinstance(value, dict):
        props = schema.get("properties", {})
        for key in schema.get("required", []):
            if key not in value:
                errs.append("%s has no %s" % (path, key))
        if len(value) < schema.get("minProperties", 0):
            errs.append("%s is empty" % path)
        names = schema.get("propertyNames", {}).get("pattern")
        extra = schema.get("additionalProperties", True)
        for key, v in value.items():
            if names and not re.search(names, key):
                errs.append("%s has the key %r, which does not fit %s" % (path, key, names))
            if key in props:
                errs += schema_errors(v, props[key], root, "%s.%s" % (path, key))
            elif extra is False:
                errs.append("%s has an unknown field %s" % (path, key))
            elif isinstance(extra, dict):
                errs += schema_errors(v, extra, root, "%s.%s" % (path, key))
    return errs


def check_schema(index, R, what):
    here = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(here, "schema", "walk-index.schema.json")
    if not os.path.exists(path):
        R.note("index.schema", "schema/walk-index.schema.json is not beside this script: the shape of the index was not checked")
        return
    with open(path, "r", encoding="utf-8") as fh:
        schema = json.load(fh)
    errs = schema_errors(index, schema, schema)
    R.check("index.schema", not errs, "%s fits schema/walk-index.schema.json" % what if not errs else "%s: %s%s" % (what, "; ".join(errs[:8]), " ... and %d more" % (len(errs) - 8) if len(errs) > 8 else ""))


def differences(a, b, path=""):
    """Where two JSON values differ: a is the index on disk, b is what the files say. Numbers may differ by 1e-6;
    yaw_deg is compared as an angle with 0.01 degrees to spare."""
    if isinstance(a, dict) and isinstance(b, dict):
        out = []
        for k in sorted(set(a) | set(b)):
            p = "%s.%s" % (path, k) if path else k
            if k not in a:
                out.append("%s is missing (the files say %s)" % (p, json.dumps(b[k])[:80]))
            elif k not in b:
                out.append("%s is %s, which the files do not give" % (p, json.dumps(a[k])[:80]))
            else:
                out += differences(a[k], b[k], p)
        return out
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            return ["%s has %d entries, the files give %d" % (path, len(a), len(b))]
        out = []
        for k, (u, v) in enumerate(zip(a, b)):
            tag = u.get("id", k) if isinstance(u, dict) else k
            out += differences(u, v, "%s[%s]" % (path, tag))
        return out
    if is_number(a) and is_number(b):
        close = ang_diff(a, b) < 0.01 if path.endswith("yaw_deg") else abs(a - b) <= 1e-6
        return [] if close else ["%s is %s, the files say %s" % (path, a, b)]
    return [] if a == b else ["%s is %s, the files say %s" % (path, json.dumps(a)[:80], json.dumps(b)[:80])]


def compare_index(disk, built, R):
    """--check: the index in the folder against what the files say, reported under the rule each part belongs to."""
    ids_d, ids_b = set(disk.get("areas", {})), set(built["areas"])
    R.check("index.areas", ids_d == ids_b, "the index lists the %d area files" % len(ids_b) if ids_d == ids_b
            else "in the index and not among the files: %s; files not in the index: %s" % (sorted(ids_d - ids_b) or "-", sorted(ids_b - ids_d) or "-"))
    for i in sorted(ids_d & ids_b):
        d, b = disk["areas"][i], built["areas"][i]
        buckets = dict(bytes=[], sha256=[], look_matches_index=[], spawns_match_index=[], portals_match_index=[], stats_match_index=[], index_fields=[])
        for line in differences(d, b):
            key = line.split(" ")[0]
            top = re.split(r"[.\[]", key)[0]
            name = {"bytes": "bytes", "sha256": "sha256", "look": "look_matches_index", "spawns": "spawns_match_index", "portals": "portals_match_index", "stats": "stats_match_index"}.get(top, "index_fields")
            buckets[name].append(line)
        says = dict(bytes="%s bytes" % b["bytes"], sha256="the content hash is the file's", look_matches_index="the index's look is the Area's: %s" % json.dumps(b["look"], sort_keys=True),
                    spawns_match_index="%d spawns: ids, words, places and facings are the file's" % len(b["spawns"]), portals_match_index="%d portals: ids, places and targets are the file's" % len(b["portals"]),
                    stats_match_index="the counts are the file's", index_fields="file, kind, scene, name, indoor, baked and walk_region_xy are the file's")
        for name, lines in buckets.items():
            R.check("%s.%s" % (i, name), not lines, says[name] if not lines else "; ".join(lines[:6]) + (" ... and %d more" % (len(lines) - 6) if len(lines) > 6 else ""))
    for key in ("scenes", "seams"):
        lines = differences(disk.get(key), built[key], key)
        R.check("index." + key, not lines, "%s in the index are what the files give" % key if not lines else "; ".join(lines[:6]))


# --------------------------------------------------------------------------------------------- the command

def read_scene_ids(path):
    if os.path.isdir(path):
        return {f[:-5] for f in os.listdir(path) if f.endswith(".json") and not f.endswith(".nav.json")}
    with open(path, "r", encoding="utf-8") as fh:
        return set(json.load(fh))


def main(argv=None):
    ap = argparse.ArgumentParser(description="Build or check walk-index.json (docs/walk-areas.md, version 1).")
    ap.add_argument("inputs", nargs="+", help="a folder of walk-*.glb / walk-*.gltf files, or the files themselves")
    ap.add_argument("--check", action="store_true", help="write nothing: check the index in the folder against the files")
    ap.add_argument("--out", help="where to write the index (default: walk-index.json in the folder)")
    ap.add_argument("--start", help="the spawn the viewer starts at (default: square when a file has it, else the first spawn)")
    ap.add_argument("--world", default="hollowmere", help="a label for the world")
    ap.add_argument("--scene-ids", help="the game's scene ids: a JSON list, or a folder of <sceneId>.json files (packages/content/data/scenes)")
    ap.add_argument("--pending", default="", help="scene ids that are not built yet, with commas (needed when --scene-ids is not given)")
    ap.add_argument("--legacy", action="store_true", help="accept today's files: each difference from the contract is a WARNING")
    ap.add_argument("--strict-targets", action="store_true", help="count a file over a planning target as a failure")
    ap.add_argument("--json", help="also write the results as JSON here")
    ap.add_argument("--quiet", action="store_true", help="print only what is not a PASS")
    args = ap.parse_args(argv)

    folder, paths = None, []
    for item in args.inputs:
        if os.path.isdir(item):
            folder = item
            paths += [os.path.join(item, f) for f in sorted(os.listdir(item)) if re.match(r"^walk-.+\.(glb|gltf)$", f)]
        elif os.path.isfile(item):
            paths.append(item)
        else:
            print("no such file or folder: %s" % os.path.basename(item), file=sys.stderr)
            return 2
    if not paths:
        print("no area files found (walk-*.glb or walk-*.gltf)", file=sys.stderr)
        return 2
    index_path = args.out or (os.path.join(folder, "walk-index.json") if folder else None)
    if args.check and not (index_path and os.path.exists(index_path)):
        print("--check needs a folder that holds walk-index.json", file=sys.stderr)
        return 2
    if not args.check and index_path is None:
        print("give --out <index.json> when the inputs are files, not a folder", file=sys.stderr)
        return 2
    try:
        known = read_scene_ids(args.scene_ids) if args.scene_ids else None
    except (OSError, ValueError) as err:
        print("--scene-ids: could not read the scene ids (%s)" % err.__class__.__name__, file=sys.stderr)
        return 2
    if known is not None and not known:
        print("--scene-ids: no scene ids found there", file=sys.stderr)
        return 2

    R = Results(legacy=args.legacy, strict_targets=args.strict_targets)

    def finish(wrote=""):
        fails = R.count("FAIL")
        for status, rule, detail in R.rows:
            if not (args.quiet and status == "PASS"):
                print("%s  %s  %s" % (status, rule, detail))
        print("--- %d pass, %d fail, %d warnings, %d notes%s" % (R.count("PASS"), fails, R.count("WARN"), R.count("NOTE"), wrote))
        return 1 if fails else 0

    # a file that is not glTF where this script reads it is one FAIL line; the other files are still checked
    broken = (OSError, ValueError, KeyError, IndexError, TypeError, AttributeError, RecursionError, OverflowError, struct.error, binascii.Error)
    areas, read = [], []
    for p in paths:
        try:
            read.append(AreaFile(p))
        except broken as err:
            R.add("FAIL", os.path.basename(p) + ".readable", "could not be read as glTF: %s" % (str(err) or err.__class__.__name__))
    for a in read:
        try:
            check_file(a, R, known)
            areas.append(a)
        except broken as err:
            R.add("FAIL", a.base + ".readable", "the checks could not finish on this file (%s: %s); it is left out of the rules across files" % (err.__class__.__name__, err))
    areas = [a for a in areas if a.id is not None]
    if not areas:
        return finish("; no area file could be read, so nothing else was checked" + ("" if args.check else "; the index was NOT written"))
    ids = [a.id for a in areas]
    R.check("index.area_ids_unique", len(ids) == len(set(ids)), "%d files, %d area ids" % (len(ids), len(set(ids))))
    R.check("index.one_folder", len({os.path.dirname(os.path.abspath(a.path)) for a in areas}) == 1,
            "all area files are in one folder, where the index goes too" if len({os.path.dirname(os.path.abspath(a.path)) for a in areas}) == 1
            else "the files are in different folders; the index gives base names and has to sit beside all of them", legacy_ok=True)
    if len(ids) != len(set(ids)):
        areas = list({a.id: a for a in areas}.values())

    disk, disk_pending = None, []
    declared = {s for s in args.pending.split(",") if s}
    if args.check:
        try:
            with open(index_path, "r", encoding="utf-8") as fh:
                disk = json.load(fh)
            if not isinstance(disk, dict):
                raise ValueError("it is not a JSON object")
        except (OSError, ValueError) as err:
            R.add("FAIL", "index.readable", "walk-index.json could not be read as JSON: %s" % err)
            return finish("; the index could not be read, so it was not compared with the files")
        if isinstance(disk.get("pending"), list):
            disk_pending = sorted({s for s in disk["pending"] if isinstance(s, str)})
        declared |= set(disk_pending)
    spawn_home, pending, seams = check_world(areas, R, known, declared, args.check)
    all_spawns = [s["id"] for a in areas for s in a.spawns]
    start = disk.get("start") if args.check else args.start
    if not (isinstance(start, str) and start):
        start = "square" if "square" in all_spawns else (all_spawns[0] if all_spawns else None)
    R.check("index.start", start in spawn_home, "the viewer starts at Spawn_%s in %s" % (start, spawn_home.get(start)) if start in spawn_home else "the start spawn %r is in no file" % (start,))
    note_reach(areas, R, spawn_home, start)
    world = disk.get("world") if args.check and isinstance(disk.get("world"), str) else args.world
    built = build_index(areas, world, start, pending, seams)
    if args.check:
        built["pending"] = disk_pending
        stale = [s for s in built["pending"] if s in built["scenes"]]
        unused = [s for s in built["pending"] if s not in pending and s not in stale]
        unknown = [s for s in built["pending"] if known is not None and s not in known]
        R.check("index.pending", not stale and not unknown,
                "pending: %s" % (", ".join(built["pending"]) or "nothing") if not stale and not unknown else "listed as pending and yet built: %s; not a scene id of the game: %s" % (stale or "-", unknown or "-"))
        if unused:
            R.note("index.pending_unused", "listed under pending and no portal leads there: " + ", ".join(unused))
        check_schema(disk, R, "the index in the folder")
        try:
            compare_index(disk, built, R)
        except broken as err:
            R.add("FAIL", "index.readable", "walk-index.json is not shaped like an index, so it could not be compared with the files (%s: %s)" % (err.__class__.__name__, err))
    else:
        check_schema(built, R, "the index built here")
    for a in areas:
        check_targets(a, R)

    wrote = ""
    if not args.check:
        if R.count("FAIL") == 0:
            os.makedirs(os.path.dirname(os.path.abspath(index_path)), exist_ok=True)
            with open(index_path, "w", encoding="utf-8", newline="\n") as fh:
                fh.write(pretty_json(built) + "\n")
            wrote = "; wrote %s" % os.path.basename(index_path)
        else:
            wrote = "; the index was NOT written"
    code = finish(wrote)
    if args.json:
        with open(args.json, "w", encoding="utf-8", newline="\n") as fh:
            json.dump(dict(results=[dict(status=s, rule=r, detail=d) for s, r, d in R.rows], index=built), fh, indent=1)
    return code


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as err:      # never a pass, never a bare trace: one FAIL line, and the trace only when asked for
        if os.environ.get("WALK_INDEX_TRACE"):
            raise
        print("FAIL  checker.internal  walk_index.py itself stopped before it finished (%s: %s). Set WALK_INDEX_TRACE=1 to see Python's trace"
              % (err.__class__.__name__, err))
        sys.exit(1)
