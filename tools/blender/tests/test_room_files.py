"""Tests of the first-person rooms' own files (meshy_rooms/<sceneId>.json) and of the regression gate: its golden values
(meshy_rooms/golden.json) and the steps of room_checks/regress.py that run without Blender, on stand-in files. The
files are read with the standard library alone; the builder's loader needs numpy (meshy_room_build.py imports it), so
its tests are skipped where numpy is missing."""

import hashlib
import json
import math
import os
import struct
import subprocess
import sys
import tempfile
import unittest

BLENDER = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
ROOMS_DIR = os.path.join(BLENDER, "meshy_rooms")
SCENES_DIR = os.path.normpath(os.path.join(BLENDER, "..", "..", "packages", "content", "data", "scenes"))
REGRESS = os.path.join(BLENDER, "room_checks", "regress.py")
BUILT = os.path.join(BLENDER, "build", "rooms")             # the finished rooms' builds: local files, git-ignored
sys.path.insert(0, BLENDER)
sys.path.insert(0, os.path.join(BLENDER, "room_checks"))
import regress  # noqa: E402  (standard library only)
import meshy_room_file as rf  # noqa: E402  (standard library only)

try:
    import meshy_room_build as mrb  # noqa: E402
    import numpy as np  # noqa: E402
except ImportError:  # no numpy here: the files are still checked
    mrb = None


def room_ids():
    return sorted(f[:-5] for f in os.listdir(ROOMS_DIR) if f.endswith(".json") and f != "golden.json")


def read(name):
    with open(os.path.join(ROOMS_DIR, name), encoding="utf-8") as fh:
        return json.load(fh)


def is_note(key, obj):
    """The builder's rule (meshy_room_build.is_note): `note`, or `<key>_note` beside `<key>`."""
    return key == "note" or (key.endswith("_note") and key[:-5] in obj)


def walk(x, where=""):
    """Every (path, key, value, the object it stands in) of the dictionaries in a JSON value."""
    if isinstance(x, dict):
        for k, v in x.items():
            yield where, k, v, x
            yield from walk(v, f"{where}/{k}")
    elif isinstance(x, (list, tuple)):
        for i, v in enumerate(x):
            yield from walk(v, f"{where}[{i}]")


def md5_of(path):
    with open(path, "rb") as fh:
        return hashlib.md5(fh.read()).hexdigest()


def tiny_glb(path, generator=None, extra=None, indent=None):
    """A GLB with a JSON chunk only: what regress.py reads of a rebuild, without Blender. `indent` writes the same
    JSON with other bytes."""
    asset = {"version": "2.0"} if generator is None else {"version": "2.0", "generator": generator}
    j = json.dumps({"asset": asset, "extras": extra}, indent=indent).encode()
    j += b" " * (-len(j) % 4)
    with open(path, "wb") as fh:
        fh.write(b"glTF" + struct.pack("<II", 2, 20 + len(j)) + struct.pack("<I4s", len(j), b"JSON") + j)
    return path


class RoomFiles(unittest.TestCase):
    def test_the_bedroom_has_a_file(self):
        self.assertIn("widow_bedroom", room_ids())

    def test_every_file_names_its_own_room_and_a_scene(self):
        for rid in room_ids():
            self.assertEqual(read(rid + ".json").get("room"), rid)
            self.assertTrue(os.path.isfile(os.path.join(SCENES_DIR, rid + ".json")), f"{rid} is not a scene")

    def test_every_note_is_text(self):
        for rid in room_ids():
            for where, key, value, obj in walk(read(rid + ".json"), rid):
                if is_note(key, obj):
                    self.assertIsInstance(value, str, f"{where}/{key}")

    def test_a_layout_overrides_pieces_the_room_has(self):
        for rid in room_ids():
            data = read(rid + ".json")
            ids = {p["id"] for p in data["pieces"]}
            self.assertEqual(len(ids), len(data["pieces"]), f"{rid}: a piece id twice")
            self.assertNotIn(data.get("layout"), data.get("layouts") or {}, f"{rid}: its own layout among the others")
            for name, lay in (data.get("layouts") or {}).items():
                for pid in lay.get("pieces", {}):
                    self.assertIn(pid, ids, f"{rid}: layout {name}")


class Golden(unittest.TestCase):
    def test_every_row_describes_a_room_that_has_a_file(self):
        rows = read("golden.json")["rooms"]
        self.assertIn("widow_bedroom", rows)
        for rid, row in rows.items():
            self.assertIn(rid, room_ids())
            data = read(rid + ".json")
            self.assertRegex(row["glbMd5"], r"^[0-9a-f]{32}$")
            self.assertRegex(row["recorded"], r"^\d{4}-\d{2}-\d{2}$")
            for key in ("glbBytes", "vertices", "triangles"):
                self.assertIs(type(row[key]), int, f"{rid}: {key}")
                self.assertGreater(row[key], 0, f"{rid}: {key}")
            self.assertIsInstance(row["light"], str)
            self.assertIn(row["layout"], {data.get("layout", "default"), *(data.get("layouts") or {})})
            if "rawMd5" in row:
                self.assertRegex(row["rawMd5"], r"^[0-9a-f]{32}$")
            self.assertRegex(row["generator"], r"^Khronos glTF Blender I/O v\d+\.\d+\.\d+$", f"{rid}: generator")

    def test_a_row_names_the_writer_of_its_glb_where_the_build_is_here(self):
        """Where a room's finished build is on this machine (never on CI), the row's generator is its GLB's own."""
        here = 0
        for rid, row in read("golden.json")["rooms"].items():
            glb = os.path.join(BUILT, rid + ".glb")
            if os.path.isfile(glb) and md5_of(glb) == row["glbMd5"]:
                here += 1
                self.assertEqual(regress.generator(glb), row["generator"], rid)
        if not here:
            self.skipTest("no finished room's build is on this machine")


class GatePlan(unittest.TestCase):
    """`regress.py plan`, whose six lines regress.sh reads one value a line before it clears the room's files in the
    scratch folder: a golden row that would shift the lines is a bad call, refused before anything is looked for on
    disk (so the answer is the same where the saved bake is missing, as on CI)."""

    def plan(self, **change):
        gold = read("golden.json")
        gold["rooms"]["widow_bedroom"].update(change)
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "golden.json")
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(gold, fh)
            return subprocess.run([sys.executable, os.path.join(BLENDER, "room_checks", "regress.py"), "plan",
                                   "widow_bedroom", "--golden", path], capture_output=True, text=True)

    def test_a_value_that_is_not_one_plain_line_is_refused(self):
        for change in (dict(light="midway\nX\nY\ntools/blender/build/rooms"), dict(layout="bed_north\r\nX"),
                       dict(light=3), dict(layout=""), dict(layout="bed north"), dict(raw="a\nb.npz")):
            done = self.plan(**change)
            self.assertEqual(done.returncode, 2, f"{change}: {done.stdout!r} {done.stderr!r}")
            self.assertEqual(done.stdout, "", f"{change}: a plan was printed")

    def test_the_repo_row_gives_six_lines_or_says_the_bake_is_missing(self):
        done = self.plan()
        self.assertIn(done.returncode, (0, 3), done.stderr)     # 3: the saved bake is a local file, git-ignored
        if done.returncode == 0:
            self.assertEqual(len(done.stdout.splitlines()), 6, done.stdout)
        else:
            self.assertEqual(done.stdout, "")

    def test_a_row_that_does_not_name_its_writer_is_refused(self):
        gold = read("golden.json")
        del gold["rooms"]["widow_bedroom"]["generator"]
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "golden.json")
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(gold, fh)
            done = subprocess.run([sys.executable, REGRESS, "plan", "widow_bedroom", "--golden", path],
                                  capture_output=True, text=True)
        self.assertEqual(done.returncode, 2, done.stderr)
        self.assertIn("lacks generator", done.stderr)


class GateWriter(unittest.TestCase):
    """The golden row names the program that wrote its GLB (`generator`, the GLB's asset.generator): `regress.py
    record` writes it, and the verdict on a rebuild that another Blender build wrote says so before anything else, as
    that md5 cannot match. On stand-in files, no Blender; the room id is no room of the repo, so no golden GLB of it is
    on this machine to compare part by part."""

    ROOM = "test_room"
    OURS, NEWER = "Khronos glTF Blender I/O v5.2.40", "Khronos glTF Blender I/O v5.3.1"

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = self.tmp.name

    def tearDown(self):
        self.tmp.cleanup()

    def regress(self, *args):
        return subprocess.run([sys.executable, REGRESS, *args], capture_output=True, text=True)

    def build(self, name, generator, extra=None):
        """A stand-in build in the folder `name`: the GLB and the manifest regress.py reads."""
        folder = os.path.join(self.dir, name)
        os.makedirs(folder)
        glb = tiny_glb(os.path.join(folder, self.ROOM + ".glb"), generator, extra)
        manifest = dict(scene=self.ROOM, glb=dict(bytes=os.path.getsize(glb)), light=dict(setting="midway"),
                        layout="bed_north", counts=dict(vertices=8, triangles=12), source={})
        with open(os.path.join(folder, self.ROOM + ".json"), "w", encoding="utf-8") as fh:
            json.dump(manifest, fh)
        return folder, glb

    def golden(self, glb):
        """A golden file whose one row is `glb`'s."""
        row = dict(glbMd5=md5_of(glb), glbBytes=os.path.getsize(glb), generator=regress.generator(glb),
                   light="midway", layout="bed_north", vertices=8, triangles=12, raw="test_room_raw_groups.npz",
                   recorded="2026-11-19")
        path = os.path.join(self.dir, "golden.json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump({"rooms": {self.ROOM: row}}, fh)
        return path

    def verdict(self, folder, golden):
        done = self.regress("verdict", self.ROOM, "--out", folder, "--golden", golden)
        with open(os.path.join(folder, "regress.json"), encoding="utf-8") as fh:
            return done, json.load(fh)

    def test_the_glb_of_the_row_matches(self):
        folder, glb = self.build("rebuild", self.OURS)
        done, res = self.verdict(folder, self.golden(glb))
        self.assertEqual(done.returncode, 0, done.stdout + done.stderr)
        self.assertIn("MATCH", done.stdout.splitlines()[0])
        self.assertEqual((res["built"]["generator"], res["golden"]["generator"]), (self.OURS, self.OURS))

    def test_another_blender_is_said_first(self):
        _, ours = self.build("golden_build", self.OURS)
        folder, _ = self.build("rebuild", self.NEWER)
        done, res = self.verdict(folder, self.golden(ours))
        self.assertEqual(done.returncode, 1, done.stdout + done.stderr)
        first = done.stdout.splitlines()[0]
        self.assertIn("MISMATCH, another Blender build: the md5 cannot match; record again only after the room has "
                      "been checked again", first)
        self.assertIn(f"generator  {self.NEWER}  (golden {self.OURS})", done.stdout.splitlines()[1])
        self.assertTrue(res["anotherBlender"])
        self.assertIn("generator", res["fieldsThatDiffer"])

    def test_the_same_blender_with_other_bytes_is_a_plain_mismatch(self):
        _, ours = self.build("golden_build", self.OURS)
        folder, _ = self.build("rebuild", self.OURS, extra="a change")
        done, res = self.verdict(folder, self.golden(ours))
        self.assertEqual(done.returncode, 1, done.stdout + done.stderr)
        self.assertIn("MISMATCH. The rebuilt GLB is not the golden one.", done.stdout.splitlines()[0])
        self.assertNotIn("another Blender", done.stdout)
        self.assertFalse(res["anotherBlender"])

    def test_record_writes_the_writer_and_plan_takes_the_row(self):
        folder, glb = self.build("finished", self.OURS)
        raw = os.path.join(folder, "saved_bake.npz")
        with open(raw, "wb") as fh:
            fh.write(b"a stand-in for the saved bake")
        golden = os.path.join(self.dir, "golden_new.json")
        done = self.regress("record", self.ROOM, "--glb", glb, "--manifest", os.path.join(folder, self.ROOM + ".json"),
                            "--raw", raw, "--golden", golden)
        self.assertEqual(done.returncode, 0, done.stderr)
        with open(golden, encoding="utf-8") as fh:
            row = json.load(fh)["rooms"][self.ROOM]
        self.assertEqual(list(row)[:3], ["glbMd5", "glbBytes", "generator"])
        self.assertEqual(row["generator"], self.OURS)
        done = self.regress("plan", self.ROOM, "--golden", golden, "--raw", raw, "--out", os.path.join(self.dir, "o"))
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertEqual(len(done.stdout.splitlines()), 6, done.stdout)

    def test_record_refuses_a_glb_that_names_no_writer(self):
        folder, glb = self.build("finished", None)
        raw = os.path.join(folder, "saved_bake.npz")
        with open(raw, "wb") as fh:
            fh.write(b"a stand-in for the saved bake")
        golden = os.path.join(self.dir, "golden_new.json")
        done = self.regress("record", self.ROOM, "--glb", glb, "--manifest", os.path.join(folder, self.ROOM + ".json"),
                            "--raw", raw, "--golden", golden)
        self.assertEqual(done.returncode, 2, done.stdout)
        self.assertIn("asset.generator", done.stderr)
        self.assertFalse(os.path.exists(golden))

    def test_parts_all_alike_under_a_mismatch_say_the_bytes_differ_elsewhere(self):
        a = tiny_glb(os.path.join(self.dir, "a.glb"), self.OURS)
        b = tiny_glb(os.path.join(self.dir, "b.glb"), self.OURS, indent=1)    # the same JSON, other bytes
        self.assertNotEqual(md5_of(a), md5_of(b))
        lines = regress.glb_differences(b, a)
        self.assertIn("the file's own fields: the same", lines)
        self.assertTrue(lines[-1].startswith("every part named above is the same, so the bytes differ outside them"),
                        lines)
        c = tiny_glb(os.path.join(self.dir, "c.glb"), self.NEWER)
        lines = regress.glb_differences(c, a)
        self.assertIn("the file's own fields: differ in asset", lines)
        self.assertFalse(any(r.startswith("every part named above") for r in lines), lines)


@unittest.skipIf(mrb is None, "numpy is not installed, so meshy_room_build cannot be imported")
class Loader(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.real, mrb.ROOMS_DIR = mrb.ROOMS_DIR, self.tmp.name

    def tearDown(self):
        mrb.ROOMS_DIR = self.real
        self.tmp.cleanup()

    def put(self, rid, data):
        with open(os.path.join(self.tmp.name, rid + ".json"), "w", encoding="utf-8") as fh:
            fh.write(data if isinstance(data, str) else json.dumps(data))

    def stops(self, rid):
        with self.assertRaises(SystemExit) as caught:
            mrb.load_room(rid)
        return str(caught.exception)

    def whole(self, rid, **more):
        """A file with every key the builder reads, each a placeholder."""
        return dict.fromkeys(mrb.ROOM_KEYS, 0) | {"room": rid, "pieces": [], "views": {}} | more

    def test_every_room_loads_as_a_row(self):
        mrb.ROOMS_DIR = self.real
        for rid in room_ids():
            row = mrb.load_room(rid)
            self.assertNotIn("room", row)
            self.assertNotIn("about", row)
            self.assertIsInstance(row["pieces"], list)
            notes = [k for _w, k, _v, o in walk(row) if is_note(k, o)]
            self.assertEqual(notes, [], f"{rid}: a note reached the builder")
            lists = [f"{w}/{k}" for w, k, v, _o in walk(row) if isinstance(v, list) and (w, k) != ("", "pieces")]
            self.assertEqual(lists, [], f"{rid}: an array that is not a tuple")
            for name in [None, *(row.get("layouts") or {})]:
                cfg = dict(row)
                self.assertEqual(mrb.apply_layout(cfg, name), name or row.get("layout", "default"))
                for view in cfg["views"].values():
                    eye, target, vfov = view
                    self.assertEqual((len(eye), len(target)), (3, 3))
                    self.assertGreater(vfov, 0)

    def test_a_missing_file_is_a_plain_message(self):
        said = self.stops("no_such_room")
        self.assertIn("no room file for no_such_room", said)
        self.assertIn("no_such_room.json is missing", said)

    def test_a_broken_file_is_a_plain_message(self):
        self.put("r1", "{ not json")
        self.assertIn("r1.json cannot be read", self.stops("r1"))
        self.put("r2", {"room": "another"})
        self.assertIn("is not r2's room file", self.stops("r2"))
        self.put("r3", ["a", "list"])
        self.assertIn("is not r3's room file", self.stops("r3"))
        self.put("r4", {"room": "r4", "pieces": [], "views": {}})
        said = self.stops("r4")
        self.assertIn("lacks district", said)
        self.assertNotIn("pieces", said)
        self.put("r5", self.whole("r5", moon={"note": 3}))
        self.assertIn("`note` is a comment and must be text", self.stops("r5"))
        self.put("r6", '{"room": "r6", "height": 3.0, "height": 2.7}')
        self.assertIn('the key "height" stands twice', self.stops("r6"))

    def test_a_note_is_dropped_and_other_keys_are_kept(self):
        self.put("r7", self.whole("r7", wall_colour="#80866E", wall_colour_note="sage", note="a room",
                                  spawn_labels={"door": "By the door", "ransom_note": "By the note"},
                                  floor={"factor": [0.86, 1.0, 0.78], "note": "a scan"}))
        row = mrb.load_room("r7")
        self.assertNotIn("wall_colour_note", row)
        self.assertNotIn("note", row)
        self.assertEqual(row["floor"], {"factor": (0.86, 1.0, 0.78)})
        self.assertEqual(row["spawn_labels"]["ransom_note"], "By the note")     # no `ransom` beside it: not a comment

    def test_the_bake_md5_follows_what_the_bake_sees(self):
        mrb.ROOMS_DIR = self.real
        row = mrb.load_room("widow_bedroom")

        def md5(change=None, layout=None):
            cfg = dict(row)
            mrb.apply_layout(cfg, layout)
            if change:
                change(cfg)
            return mrb.bake_room_md5(cfg)

        base = md5()
        self.assertRegex(base, r"^[0-9a-f]{32}$")
        self.assertEqual(base, md5(lambda c: c.update(district="x", spawn_labels={}, exposure=1.0, layouts={})))
        self.assertEqual(base, md5(lambda c: c["views"].pop("bed")))
        self.assertNotEqual(base, md5(lambda c: c.update(wall_colour="#000000")))
        self.assertNotEqual(base, md5(lambda c: c["pieces"][0].update(face="S")))
        self.assertNotEqual(base, md5(layout="mapped"))


# ---------------------------------------------------------------- room file v2: meshy_room_file (standard library)

FIXTURES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")
PARLOUR = os.path.join(FIXTURES, "widow_parlour.v2.json")
BED_NORTH_MD5, MAPPED_MD5 = "db685d9053b69283a6d56d372dc269d4", "21f73be1809e29ae39544f61d2b2ceeb"
LOOK_MD5 = "3acc7a8b6eb250f8d62d5970117abec3"


def scene(rid):
    return rf.load_scene(rid)


def raw(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


class RoomFileV2(unittest.TestCase):
    """The loader and the derived reading (room_file_v2.md): each rule's message on a small change to a real file
    (the bedroom's or the parlour fixture's), written to a scratch folder and read with --room-file's path."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, data, name="room.json"):
        path = os.path.join(self.tmp.name, name)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(data, fh)
        return path

    def bedroom(self):
        return raw(os.path.join(ROOMS_DIR, "widow_bedroom.json"))

    def read(self, data, rid=None, layout=None, sc=None, tasks=frozenset()):
        rid = rid or data["room"]
        row = rf.load_room(rid, path=self.write(data))
        cfg = dict(row)
        rf.apply_layout(cfg, layout)
        return cfg, rf.derive(cfg, sc or scene(rid), shown="room.json", tasks=None if tasks is None else set(tasks))

    def stops(self, data, sc=None):
        with self.assertRaises(SystemExit) as caught:
            self.read(data, sc=sc)
        return str(caught.exception)

    # -- the bedroom reads as section 8 of the design says, and its bake md5s do not move
    def test_the_bedroom_reads_as_the_legacy_path(self):
        cfg, spec = self.read(self.bedroom())
        self.assertEqual((spec["schema"], spec["names"], spec["pending"]), ("legacy", "legacy", []))
        door, win = spec["openings"]
        self.assertEqual((door["kind"], door["id"], door["side"], door["at"], door["knob"]), ("door", "wb.door", "S", -2.5, "E"))
        self.assertEqual((door["width"], door["height"], door["foot"]), (0.9, 2.15, [-2.5, -3.5]))
        self.assertEqual((win["kind"], win["id"], win["side"], win["at"], win["outside"]), ("window", "wb.draped_window", "N", -0.5, "snow"))
        lights = {r["id"]: r for r in spec["lights"]}
        self.assertEqual(sorted(lights), ["wb.lt_candle", "wb.lt_moon"])
        self.assertEqual((lights["wb.lt_candle"]["role"], lights["wb.lt_candle"]["group"]), ("lamp", "candle"))
        self.assertEqual(lights["wb.lt_candle"]["anchor"], {"piece": "wb.candle", "name": "flame"})
        self.assertEqual((lights["wb.lt_moon"]["group"], lights["wb.lt_moon"]["window"]), ("moon", "wb.draped_window"))
        self.assertEqual([d["id"] for d in spec["lightsDropped"]], ["wb.lt_window"])
        self.assertEqual(spec["groups"], ["candle", "moon", "fill"])
        self.assertEqual((spec["exposureFrom"], spec["hosts"]), (["wb.lt_candle"], ["wb.candle"]))
        self.assertEqual(spec["underBed"], {"wb.under_bed": "wb.bed"})
        self.assertEqual(spec["coverage"]["wb.draped_window"], {"by": "opening", "id": "wb.draped_window"})
        self.assertEqual(len(spec["coverage"]), 12)        # 9 props and 3 spots, every one named
        self.assertEqual(len(spec["plannedNames"]), 26)
        self.assertNotIn("openings", cfg)                  # nothing derived reaches the row

    def test_the_bedroom_explains_itself_as_its_snapshot(self):
        cfg, spec = self.read(self.bedroom(), tasks=None)       # the game's own tasks.json
        with open(os.path.join(FIXTURES, "widow_bedroom.explain.txt"), encoding="utf-8") as fh:
            want = fh.read()
        self.assertEqual(rf.explain(cfg, spec, "tools/blender/meshy_rooms/widow_bedroom.json"), want)

    def test_the_bake_md5s_hold_and_the_droppable_keys_leave_them(self):
        row = rf.load_room("widow_bedroom")

        def md5(layout=None, change=None):
            cfg = dict(row)
            rf.apply_layout(cfg, layout)
            if change:
                change(cfg)
            return rf.bake_room_md5(cfg)

        self.assertEqual(md5(), BED_NORTH_MD5)
        self.assertEqual(md5("mapped"), MAPPED_MD5)
        for key, value in (("light", "midway"), ("exposure_from", ("wb.lt_candle",)), ("skip", {"x": "y"}),
                           ("look", {"lights": {}})):
            self.assertEqual(md5(change=lambda c: c.update({key: value})), BED_NORTH_MD5, key)

        def moved(c):
            c["pieces"][0] = dict(c["pieces"][0], moved="0.3 m along the wall")

        def label(c):
            c["pieces"][0] = dict(c["pieces"][0], spec=dict(c["pieces"][0]["spec"], label="a label"))
        self.assertEqual(md5(change=moved), BED_NORTH_MD5)
        self.assertEqual(md5(change=label), BED_NORTH_MD5)
        self.assertNotEqual(md5(change=lambda c: c["pieces"][0].update(covers=("wb.rug",))), BED_NORTH_MD5)
        self.assertNotEqual(md5(change=lambda c: c["pieces"][0].update(name="wb.other")), BED_NORTH_MD5)

    def test_the_look_md5_is_the_saved_bakes(self):
        self.assertEqual(rf.bake_look_md5(raw(os.path.join(BLENDER, "meshy_looks", "interior_fp.json"))), LOOK_MD5)

    def test_the_parlour_fixture_reads_as_v2(self):
        data = raw(PARLOUR)
        cfg, spec = self.read(data)
        self.assertEqual(spec["schema"], "v2")
        self.assertEqual([(e["id"], e["side"], e["at"]) for e in spec["openings"]],
                         [("wp.door", "E", 0.0), ("wp.bedroom", "N", -4.5), ("wp.draped_window_0", "N", -2.5),
                          ("wp.draped_window_1", "N", 3.5)])
        self.assertEqual([e["outside"] for e in spec["openings"][2:]], ["snow", "sky"])
        self.assertEqual(spec["groups"], ["candle", "fire", "moon", "fill"])
        self.assertEqual({r["id"]: r["group"] for r in spec["lights"]},
                         {"wp.lt_lamp": "candle", "wp.lt_lamp_chair": "candle", "wp.lt_fire": "fire", "wp.lt_moon": "moon"})
        self.assertEqual(len(spec["plannedNames"]), 44)
        self.assertEqual(len(spec["coverage"]), 19)       # 17 props and 2 spots
        # not built yet: the day bed (G7) and the hearth (G6); the openings (G3), the look override (G9) and every
        # light (G4) are built
        self.assertEqual(len(spec["pending"]), 2)
        self.assertFalse([p for p in spec["pending"] if "light" in p])
        self.assertEqual(spec["pieces"]["wp.letter_box"]["ref"], [6.5, 5.0])

    # -- R0: the whole file
    def test_strict_keys_at_the_top_and_inside(self):
        data = self.bedroom()
        data["skiting"] = 0.2
        self.assertIn('the key "skiting" is not a room file key (did you mean "skirting"?) (R0.1)', self.stops(data))
        data = self.bedroom()
        data["pieces"][3]["rize"] = 0.1
        self.assertIn('pieces[3] (wb.dressing_table): the key "rize" is not a piece key (did you mean "rise"?)',
                      self.stops(data))
        data = self.bedroom()
        data["pieces"][0]["spec"]["tal"] = 2.0
        self.assertIn('the key "tal" is not a spec key (did you mean "tall"?)', self.stops(data))
        data = self.bedroom()
        data["moon"]["azimut"] = 3.0
        self.assertIn('moon: the key "azimut" is not a moon key', self.stops(data))
        data = self.bedroom()
        data["window"]["sil"] = 0.7
        self.assertIn('window: the key "sil" is not a opening key', self.stops(data))

    def test_a_comment_without_its_key(self):
        data = raw(PARLOUR)
        data["look"]["look_note"] = "a stray comment"
        self.assertIn('look.look_note: a comment is "note", or "<key>_note" beside "<key>"; "look" is not in this '
                      'object (R0.7)', self.stops(data))
        data = self.bedroom()
        data["pieces"][0]["placement_note"] = "x"
        self.assertIn("placement_note", self.stops(data))

    def test_the_openings_one_way(self):
        data = self.bedroom()
        data["openings"] = []
        self.assertIn("give the openings one way", self.stops(data))
        data = self.bedroom()
        del data["window"]
        self.assertIn("lacks window", self.stops(data))     # a legacy file without its pair is a file that lacks one
        data = self.bedroom()
        data["lights"] = []
        self.assertIn("the legacy light rig", self.stops(data))

    def test_no_lilac_or_magenta(self):
        data = self.bedroom()
        data["wall_colour"] = "#8A6FA8"
        self.assertIn("wall_colour #8A6FA8 is lilac or magenta", self.stops(data))
        data = self.bedroom()
        data["window"]["curtain_colour"] = "#C040A0"
        self.assertIn("window.curtain_colour #C040A0 is lilac or magenta", self.stops(data))
        self.assertFalse(rf.lilac("#4A5264"))       # the bedroom's slate curtains
        self.assertFalse(rf.lilac("#7FA8FF"))       # the moon

    def test_the_scene_names_the_spawns_and_the_district(self):
        data = self.bedroom()
        data["spawn_labels"] = {"door": "By the door", "window": "By the window"}
        self.assertIn("spawn_labels names 'window', which the scene has not", self.stops(data))
        data["spawn_labels"] = {}
        self.assertIn("spawn_labels lacks 'door'", self.stops(data))
        data = self.bedroom()
        data["district"] = "Widow Vane's parlour"
        self.assertIn("is not the scene's name \"Widow's bedroom\"", self.stops(data))

    def test_names_unique_after_threejs(self):
        data = self.bedroom()
        data["pieces"] += [dict(id="wb.decor.x", decor=True, name="wb.p:q", place=["at", 0.0, 0.0],
                                spec=dict(model="box", size=[0.3, 0.3, 0.3], label="a box")),
                           dict(id="wb.decor.y", decor=True, name="wb.pq", place=["at", 1.0, 0.0],
                                spec=dict(model="box", size=[0.3, 0.3, 0.3], label="a box"))]
        self.assertIn("read the same in three.js", self.stops(data))
        self.assertEqual(rf.three_name("a.b [c]:d/e f"), "ab_cde_f")
        data = self.bedroom()
        data["pieces"].append(dict(id="wb.decor_a.b", decor=True, place=["at", 0, 0],
                                   spec=dict(model="box", size=[0.3, 0.3, 0.3], label="a box")))
        data["pieces"].append(dict(id="wb.decor_ab", decor=True, place=["at", 1, 0],
                                   spec=dict(model="box", size=[0.3, 0.3, 0.3], label="a box")))
        self.assertIn('the ids "wb.decor_a.b" and "wb.decor_ab" read the same in three.js (R-P1)', self.stops(data))

    # -- R-P: pieces, grey boxes, the coverage rule
    def test_every_scene_prop_is_named(self):
        data = self.bedroom()
        data["pieces"] = [p for p in data["pieces"] if p["id"] != "wb.rug"]
        said = self.stops(data)
        self.assertIn("the scene's prop wb.rug has no piece: add one (a grey box", said)
        data["skip"] = {"wb.rug": "a floor decal, G19"}
        cfg, spec = self.read(data)
        self.assertEqual(spec["coverage"]["wb.rug"], {"by": "skip", "reason": "a floor decal, G19"})
        data["skip"] = {"wb.nothing": "x"}
        self.assertIn("skip names wb.nothing, which is not in the scene (R-P2c)", self.stops(data))

    def test_a_piece_not_in_the_scene_says_decor(self):
        data = self.bedroom()
        data["pieces"].append(dict(id="wb.birdcage", place=["at", 0.0, 0.0],
                                   spec=dict(model="box", size=[0.4, 0.4, 1.6], label="Birdcage")))
        self.assertIn('piece wb.birdcage is not in the scene: a piece of the first person\'s own says "decor": true',
                      self.stops(data))

    def test_covers_name_scene_ids(self):
        data = self.bedroom()
        data["pieces"][0]["covers"] = ["wb.cupboard"]
        self.assertIn("piece wb.wardrobe: covers wb.cupboard, which is not in the scene (R-P2c)", self.stops(data))

    def test_a_grey_box_has_a_size_and_a_label(self):
        data = self.bedroom()
        data["pieces"][9]["spec"] = {"model": "box", "size": [1.1, 0.03]}
        self.assertIn('piece wb.photos: a grey box needs "size": [w, d, h]', self.stops(data))
        data["pieces"][9]["spec"] = {"model": "box", "size": [1.1, 0.03, 2.9], "label": "Photographs"}
        self.assertIn("piece wb.photos is 3.18 m tall under a 3 m ceiling (R-P3b)", self.stops(data))
        data["pieces"][9]["spec"] = {"model": "oven"}
        self.assertIn('piece wb.photos: no first-person builder for model "oven"', self.stops(data))

    def test_place_forms(self):
        data = self.bedroom()
        data["pieces"][4]["place"] = ["wal", "N", 0.9]
        self.assertIn('piece wb.washstand: place [\'wal\', \'N\', 0.9]: the forms are', self.stops(data))
        data = self.bedroom()
        data["pieces"][7]["place"] = ["beside", "wb.rug", "S", 2.0]   # the rug stands later in the list
        self.assertIn("`beside` names a piece that stands earlier in the list", self.stops(data))

    def test_a_null_place_is_for_a_run_or_a_footprint_prop(self):
        data = self.bedroom()
        data["pieces"][4]["place"] = ["wall", "N", None]
        self.assertIn("piece wb.washstand: place or size has a null: only a piece with \"covers\" or a footprint prop",
                      self.stops(data))

    def test_a_run_takes_its_length_and_place_from_its_covers(self):
        data = self.bedroom()
        data["pieces"] = [p for p in data["pieces"] if p["id"] != "wb.washstand"]
        run = next(p for p in data["pieces"] if p["id"] == "wb.dressing_table")
        run.update(covers=["wb.washstand"], place=["wall", "N", None])
        run["spec"] = {"model": "box", "size": [None, 0.5, 1.0], "label": "Dressing table and washstand (a run)"}
        run.pop("cloth", None)
        run.pop("dress_lod", None)
        run.pop("key", None)
        cfg, spec = self.read(data)
        res = spec["pieces"]["wb.dressing_table"]
        self.assertEqual((res["place"], res["size"], res["ref"]), (["wall", "N", -1.0], [4.0, 0.5, 1.0], [-1.0, 3.0]))
        self.assertEqual(spec["coverage"]["wb.washstand"], {"by": "covers", "id": "wb.dressing_table"})
        self.assertEqual(run["place"], ["wall", "N", None])     # the file's own data is not changed
        self.assertEqual(cfg["pieces"][3]["place"], ("wall", "N", None))
        run["face"] = "E"                                       # its width now runs along y: the row does not fit
        self.assertIn("do not run along its width", self.stops(data))

    def test_an_under_bed_spot_has_its_bed(self):
        sc = scene("widow_bedroom")
        sc["props"] = [dict(p, x=2, y=6) if p["id"] == "wb.bed" else p for p in sc["props"]]   # the bed moved away
        self.assertIn("spot wb.under_bed (underBed) has no bed prop beside it", self.stops(self.bedroom(), sc=sc))
        data = self.bedroom()
        next(p for p in data["pieces"] if p["id"] == "wb.bed")["covers"] = ["wb.under_bed"]
        cfg, spec = self.read(data, sc=sc)
        self.assertEqual(spec["underBed"], {"wb.under_bed": "wb.bed"})

    def test_needs_owner_lists_the_spots_and_task_pieces_moved_first(self):
        cfg, spec = self.read(self.bedroom())
        spec["taskPieces"] = ["wb.candle"]
        rows = [dict(id="wb.candle", fromRefM=1.781), dict(id="wb.bed", fromRefM=1.846),
                dict(id="wb.wardrobe", fromRefM=0.287, moved="0.3 m along the wall"),
                dict(id="wb.wardrobe_body", fromRefM=0.287)]
        out = rf.needs_owner(spec, rows, [dict(id="wb.under_bed", piece="wb.bed", fromTileM=1.512)])
        self.assertEqual([r["id"] for r in out], ["wb.wardrobe", "wb.candle", "wb.under_bed", "wb.wardrobe_body"])
        by = {r["id"]: r for r in out}
        self.assertEqual((by["wb.under_bed"]["piece"], by["wb.under_bed"]["fromM"]), ("wb.bed", 1.512))
        self.assertEqual([r["id"] for r in out if r["show"]], ["wb.wardrobe", "wb.candle", "wb.under_bed"])

    # -- openings and lights on the v2 path (the parlour fixture)
    def test_opening_rules(self):
        cases = [(lambda d: d["openings"][1].update(knob="N"), 'knob "N" on the N wall: the ends are "E" and "W"'),
                 (lambda d: d["openings"][0].update(portal="wp.dor"), 'portal "wp.dor" is not in the scene'),
                 (lambda d: d["openings"].pop(1), "the scene's portal wp.bedroom has no opening"),
                 (lambda d: d["openings"].pop(2), "the scene's window prop wp.draped_window_0 has no opening"),
                 (lambda d: d["openings"][1].update(at=-5.1), '"at" -5.1 is 0.60 m from its tile\'s centre'),
                 (lambda d: d["openings"][1].update({"in": "wp.wall"}), '"in": wall-pieces are not built yet (G21)'),
                 (lambda d: d["openings"][2].update(style="shutters"), 'style "shutters" is not built yet (G14)'),
                 (lambda d: d["openings"][3].update(at=-1.6), "overlap on the N wall"),
                 (lambda d: d["openings"][0].update(kind="gate"), 'kind "gate" is not one of door, window'),
                 (lambda d: d["openings"][3].update(outside="snow"), "snow windows on the N walls" if False else None)]
        for change, said in cases:
            data = raw(PARLOUR)
            change(data)
            if said is None:
                self.read(data)         # two snow windows on one wall are allowed
                continue
            self.assertIn(said, self.stops(data), said)

    def test_light_rules(self):
        data = raw(PARLOUR)
        data["lights"].append({"id": "wp.lt_window", "role": "lamp"})
        self.assertIn("wp.lt_window is a day and dusk light: a night room does not build it", self.stops(data))
        data, sc = raw(PARLOUR), scene("widow_parlour")
        for i, g in enumerate(("a", "b", "c")):
            data["lights"][i]["group"] = g
        sc["lights"] += [dict(id="wp.lt_x", kind="lamp", x=5, y=5), dict(id="wp.lt_y", kind="lamp", x=6, y=5)]
        data["lights"] += [{"id": "wp.lt_x", "group": "d", "anchor": {"at": [0.0, 0.0, 1.0]}},
                           {"id": "wp.lt_y", "anchor": {"wall": "S", "along": 0.0, "z": 1.8}}]
        self.assertIn("the room bakes 7 light groups (candle, a, b, c, d, moon, fill): at most 5",
                      self.stops(data, sc=sc))
        data = raw(PARLOUR)
        data["exposure_from"] = ["wp.lt_moon"]
        self.assertIn("exposure_from: wp.lt_moon is a moon light; its pool cannot set the exposure", self.stops(data))
        data = raw(PARLOUR)
        data["lights"][0]["anchor"] = {"piece": "wp.rug"}
        self.assertIn('piece wp.rug has no anchor "flame"', self.stops(data))
        data = raw(PARLOUR)
        data["lights"][3]["window"] = "wp.draped_window_9"
        self.assertIn('its window "wp.draped_window_9" is not a window opening of this file (R-L5)', self.stops(data))

    def test_the_trims(self):
        data = raw(PARLOUR)
        data["skirting"] = 0
        self.assertIn("skirting 0: give a height in metres, or null", self.stops(data))
        data = raw(PARLOUR)
        data["height"], data["cornice"] = 2.7, 0.3
        self.assertIn("picture_rail 2.5 m and cornice 0.3 m do not fit under a ceiling of 2.7 m (R-S1)",
                      self.stops(data))

    # -- md5s over LF text, paths in the manifest
    def test_text_md5_is_the_lf_form_and_either_form_agrees(self):
        a, b = os.path.join(self.tmp.name, "lf.txt"), os.path.join(self.tmp.name, "crlf.txt")
        with open(a, "wb") as fh:
            fh.write(b"one\ntwo\n")
        with open(b, "wb") as fh:
            fh.write(b"one\r\ntwo\r\n")
        self.assertEqual(rf.text_md5(a), rf.text_md5(b))
        self.assertEqual(rf.text_md5(a), hashlib.md5(b"one\ntwo\n").hexdigest())
        self.assertEqual(rf.text_md5_forms(b), (hashlib.md5(b"one\ntwo\n").hexdigest(),
                                                hashlib.md5(b"one\r\ntwo\r\n").hexdigest()))

    def test_paths_are_shown_from_the_repo_root_or_by_name(self):
        self.assertEqual(rf.from_root(os.path.join(ROOMS_DIR, "widow_bedroom.json")),
                         "tools/blender/meshy_rooms/widow_bedroom.json")
        self.assertEqual(rf.from_root(os.path.join(self.tmp.name, "scratch", "room.json")), "room.json")

    def test_the_command_line_explains(self):
        done = subprocess.run([sys.executable, os.path.join(BLENDER, "meshy_room_file.py"), "widow_parlour",
                               "--room-file", PARLOUR, "--explain"], capture_output=True, text=True)
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertIn("path v2", done.stdout)
        self.assertIn("bake groups: candle, fire, moon, fill", done.stdout)

    # -- G4: the lights (room_file_v2, section 3)
    def test_every_night_light_is_built_with_its_values(self):
        cfg, spec = self.read(self.bedroom())
        self.assertEqual([(r["id"], r["role"], r["group"]) for r in spec["lights"]],
                         [("wb.lt_candle", "lamp", "candle"), ("wb.lt_moon", "moon", "moon")])
        self.assertEqual((spec["groups"], spec["exposureFrom"], spec["hosts"], spec["pending"]),
                         (["candle", "moon", "fill"], ["wb.lt_candle"], ["wb.candle"], []))
        look = raw(os.path.join(BLENDER, "meshy_looks", "interior_fp.json"))
        vals = rf.light_values(spec["lights"], look)
        self.assertEqual((vals[0]["power"], vals[0]["color"], vals[0]["radius"]), (38.0, "#FFB457", 0.04))
        self.assertIsNone(vals[1]["glow"])                  # a moon has no glow
        # the parlour: two lamps, a fire, the moon; the fire's role needs a look entry (R-L4)
        cfg, spec = self.read(raw(PARLOUR))
        with self.assertRaises(SystemExit) as cm:
            rf.light_values(spec["lights"], look, shown="parlour.json")
        self.assertIn('light wp.lt_fire: role "fire" is not in the look' + "'" + 's lights (lamp, moon, fill); add it '
                      'to the room' + "'" + 's "look" (R-L4)', str(cm.exception))
        merged = rf.merge_look(look, {"lights": {"fire": {"color": "#FFB457", "power": 120.0, "radius": 0.2}}})
        vals = {r["id"]: v for r, v in zip(spec["lights"], rf.light_values(spec["lights"], merged, {"power": 30.0}))}
        self.assertEqual(vals["wp.lt_lamp"]["power"], 30.0)            # the file's candle block over the lamp role
        self.assertEqual(vals["wp.lt_fire"]["power"], 120.0)           # ... not over the fire's
        lamp = dict(spec["lights"][0], power=50.0, color="#FFB457")    # a light entry's own values over both
        self.assertEqual(rf.light_values([lamp], merged, {"power": 30.0})[0]["power"], 50.0)

    def test_a_glow_is_checked_and_a_flame_anchor_has_one_by_default(self):
        flame = dict(id="x", role="lamp", anchor={"piece": "p", "name": "flame"})
        self.assertEqual(rf.glow_of(flame), rf.FLAME_GLOW)
        self.assertIsNone(rf.glow_of(dict(flame, glow=False)))
        self.assertIsNone(rf.glow_of(dict(flame, anchor={"piece": "p", "name": "fire"})))
        look = raw(os.path.join(BLENDER, "meshy_looks", "interior_fp.json"))
        bad = dict(flame, glow={"shape": "cube", "size": [0.1], "material": "coal"})
        with self.assertRaises(SystemExit) as cm:
            rf.light_values([bad], look)
        self.assertIn("glow shape 'cube' is not one of cone, sphere, box, card", str(cm.exception))
        coal = dict(flame, glow={"shape": "box", "size": [0.4, 0.2, 0.08], "material": "coal"})
        with self.assertRaises(SystemExit) as cm:
            rf.light_values([coal], look)
        self.assertIn("the look has no emit_display entry M_coal for its glow", str(cm.exception))
        merged = rf.merge_look(look, {"emit_display": {"M_coal": [3.0, 1.0, 0.3]}})
        self.assertEqual(rf.light_values([coal], merged)[0]["glow"]["material"], "coal")
        # a piece's glow needs its points
        row = {"pieces": [{"id": "p", "spec": {"model": "box", "glow": {"shape": "card", "size": [0.3, 0.2],
                                                                         "material": "teal"}}}]}
        merged = rf.merge_look(look, {"emit_display": {"M_teal": [0.2, 0.9, 0.8]}})
        with self.assertRaises(SystemExit) as cm:
            rf.piece_glows(row, merged)
        self.assertIn('piece p: a piece' + "'" + 's glow needs "at"', str(cm.exception))
        row["pieces"][0]["spec"]["glow"]["at"] = [[0.0, 0.0, 1.0]]
        self.assertEqual(list(rf.piece_glows(row, merged)), ["p"])

    def test_the_moon_needs_its_angles_and_a_bearing_is_built(self):
        data = raw(PARLOUR)
        del data["moon"]
        self.assertIn('a moon light needs "moon": {"azimuth"', self.stops(data))
        data = raw(PARLOUR)
        data["moon"] = {"bearing": 20.0}
        self.assertIn('a moon light needs "moon"', self.stops(data))           # a bearing needs its elevation too
        data["moon"] = {"bearing": 20.0, "elevation": 30.0}
        _cfg, spec = self.read(data)
        self.assertFalse([p for p in spec["pending"] if "moon" in p])
        x, y, z = rf.bearing_dir(90.0, 30.0)                                    # due east, 30 degrees up
        self.assertAlmostEqual(x, math.cos(math.radians(30.0)))
        self.assertAlmostEqual(y, 0.0)
        self.assertAlmostEqual(z, 0.5)
        self.assertAlmostEqual(x * x + y * y + z * z, 1.0)

    def test_the_fill_is_scaled_by_its_area_in_v2(self):
        self.assertEqual(rf.fill_energy(16.0, 57.04, rf.FILL_AREA_REF), 16.0)
        self.assertAlmostEqual(rf.fill_energy(16.0, 332.0, rf.FILL_AREA_REF), 16.0 * 332.0 / 57.04)
        self.assertEqual(rf.fill_energy(16.0, 332.0, None), 16.0)               # null: no scaling

    # -- G9: the look override (room_file_v2, section 5)
    def look(self):
        return raw(os.path.join(BLENDER, "meshy_looks", "interior_fp.json"))

    def look_stops(self, over, light=None):
        bag = rf.Problems("room.json")
        rf.look_rules(self.look(), over, light, bag)
        return "\n".join(bag)

    def test_no_override_is_the_look_itself(self):
        look = self.look()
        merged, light, own = rf.room_look(look, rf.load_room("widow_bedroom"))
        self.assertEqual(merged, look)
        self.assertEqual((light, own), (None, None))
        self.assertEqual(rf.bake_look_md5(merged), LOOK_MD5)

    def test_the_override_merges_deep_replaces_arrays_and_null_deletes(self):
        look = self.look()
        over = {"lights": {"fire": {"color": "#FFB457", "power": 60.0}, "lamp": {"power": 30.0}},
                "exposure": {"pool_display": 0.35}, "ink_lift": {"scan_contrast": {"gamma_min": 0.4}, "form": None},
                "black_cloth": [0.01, 0.01, 0.01]}
        before = json.dumps(look, sort_keys=True)
        merged = rf.merge_look(look, over)
        self.assertEqual(json.dumps(look, sort_keys=True), before)              # the look file's data is not changed
        self.assertEqual(merged["lights"]["lamp"]["power"], 30.0)
        self.assertEqual(merged["lights"]["lamp"]["color"], look["lights"]["lamp"]["color"])
        self.assertEqual(merged["lights"]["fire"]["power"], 60.0)
        self.assertEqual(merged["exposure"]["pool_display"], 0.35)
        self.assertEqual(merged["exposure"]["pool_radius_m"], look["exposure"]["pool_radius_m"])
        self.assertEqual(merged["ink_lift"]["scan_contrast"]["gamma_min"], 0.4)
        self.assertEqual(merged["ink_lift"]["scan_contrast"]["dark_below"], look["ink_lift"]["scan_contrast"]["dark_below"])
        self.assertNotIn("form", merged["ink_lift"])
        self.assertEqual(merged["black_cloth"], [0.01, 0.01, 0.01])
        self.assertEqual(self.look_stops(over), "")
        self.assertRegex(rf.look_room_md5(over), r"^[0-9a-f]{32}$")
        self.assertNotEqual(rf.bake_look_md5(merged), LOOK_MD5)     # the room's merged look is its bake's own

    def test_look_rules(self):
        cases = [({"exposure": {"pool_dispaly": 0.4}}, 'look.exposure.pool_dispaly: no such key in the look file '
                                                       '(did you mean "pool_display"?) (R-K1)'),
                 ({"lights": {"fire": {"colour": "#FFB457"}}}, 'look.lights.fire: the key "colour" is not a light '
                                                               'role key (did you mean "color"?) (R-K1)'),
                 ({"lights": {"lamp": {"powr": 3.0}}}, "look.lights.lamp.powr: no such key"),
                 ({"settings": {"dusk": {"mix": {"candle": 1.0}, "lable": "x"}}}, 'the key "lable" is not a setting'),
                 ({"emit_display": {"M_coal": [1.0, 2.0]}}, "look.emit_display.M_coal: an emitter's display colour is"),
                 ({"outside": {"sky": "x"}}, "look.outside.sky: only outside.gain may change"),
                 ({"hot": {"knee": None, "kneee": 1.0}}, "look.hot.kneee: no such key"),
                 ({"ao": {"walls": {"strenght": 0.3}}}, "look.ao.walls.strenght: no such key"),
                 ({"lights": {"fire": {"color": "#FF00FF"}}}, "look.lights.fire.color #FF00FF is not a palette light "
                                                             "colour"),
                 ({"lights": {"fill": {"color": "#C08060"}}}, "is not a palette light colour")]
        for over, said in cases:
            self.assertIn(said, self.look_stops(over), said)
        # allowed: a new role, a new setting, a new emitter, a near-white, outside.gain, a null on a key the look has
        self.assertEqual(self.look_stops({"lights": {"teal": {"color": "#2EC4B6", "power": 5.0},
                                                     "fill": {"color": "#F4F2EE", "area_ref_m2": None}},
                                          "settings": {"dusk": {"label": "dusk", "mix": {"fire": 1.2}}},
                                          "emit_display": {"M_coal": [3.0, 1.2, 0.3]}, "outside": {"gain": 0.4},
                                          "hot": {"knee": None}}), 'look.lights.fill.area_ref_m2: null deletes a key, '
                                                                    'and the look file has none here (R-K1)')
        # R-K3: the room's light setting is one of the merged look's
        self.assertIn('light "dusk": no such setting (the merged look has first, last, midway) (R-K3)',
                      self.look_stops(None, "dusk"))
        self.assertEqual(self.look_stops({"settings": {"dusk": {"mix": {"candle": 1.0}}}}, "dusk"), "")
        # R-K2 and an unknown top key are the loader's own (load_room)
        data = raw(PARLOUR)
        data["look"] = {"bake": {}, "ink_lft": 0.3}
        said = self.stops(data)
        self.assertIn("look.bake: the look's bake is not overridable (R-K2)", said)
        self.assertIn('look: the key "ink_lft" is not a look key (did you mean "ink_lift"?)', said)

    def test_the_room_look_stops_with_its_problems(self):
        row = dict(rf.load_room("widow_parlour", path=PARLOUR))
        merged, light, own = rf.room_look(self.look(), row)
        self.assertEqual((light, merged["lights"]["fire"]["power"]), ("midway", 60.0))
        self.assertEqual(own, rf.look_room_md5(row["look"]))
        row["light"] = "dawn"
        with self.assertRaises(SystemExit) as caught:
            rf.room_look(self.look(), row, shown="p.json")
        self.assertIn('meshy_room_build: p.json: light "dawn": no such setting', str(caught.exception))

    def test_the_emit_cap_is_the_rooms_own_emitters(self):
        shown = dict(self.look()["emit_display"], M_fire=[9.0, 4.0, 1.0])
        self.assertEqual(rf.emit_cap(shown, ["M_flame", "M_moon", "M_lit_window", "M_glass"]), 6.0)
        self.assertEqual(rf.emit_cap(shown, ["M_flame", "M_fire"]), 9.0)
        self.assertEqual(rf.emit_cap(shown, ["M_glass"]), 0.04)
        self.assertEqual(rf.emit_cap(shown, []), 1.0)


class GateDigest(unittest.TestCase):
    """The manifest digest and the bake gate's arithmetic in regress.py, on stand-in manifests."""

    def manifest(self, **change):
        m = dict(light=dict(numbers={"farWall": 0.391}), walk={"r0.30": {"tilesReached": 62}}, spots=[{"id": "s"}],
                 exposure=dict(E=5.0121, k=0.79557, wdi_exposure=6.3, bakeSeconds=1.0),
                 collision=dict(boxes=40, boxesSha1="ab"), pieces=[dict(id="p", box=[0, 0, 0, 1, 1, 1], slug="x")],
                 source=dict(roomBakeMd5="r", lookBakeMd5="l", blender="5.2.1 LTS"))
        m.update(change)
        return m

    def test_the_digest_sees_its_parts_and_nothing_else(self):
        base = regress.manifest_digest(self.manifest())
        self.assertEqual(sorted(base["parts"]), sorted(regress.DIGEST_PARTS))
        same = regress.manifest_digest(self.manifest(notes=["x"], built="another day",
                                                     exposure=dict(E=5.0121, k=0.79557, wdi_exposure=6.3,
                                                                   bakeSeconds=9.0)))
        self.assertEqual(same, base)
        moved = regress.manifest_digest(self.manifest(pieces=[dict(id="p", box=[0, 0, 0, 1, 1, 1.01])]))
        self.assertNotEqual(moved["sha1"], base["sha1"])
        off, parts = regress.extras_differ(dict(manifestDigest=base, roomBakeMd5="r"),
                                           regress.manifest_extras(self.manifest(
                                               pieces=[dict(id="p", box=[0, 0, 0, 1, 1, 1.01])])))
        self.assertEqual((off, parts), (["manifestDigest"], ["pieces"]))

    def test_the_verdict_fails_a_glb_match_whose_numbers_moved(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = os.path.join(tmp, "rebuild")
            os.makedirs(folder)
            glb = tiny_glb(os.path.join(folder, "test_room.glb"), "Khronos glTF Blender I/O v5.2.40")
            m = self.manifest(scene="test_room", layout="bed_north", counts=dict(vertices=8, triangles=12))
            m["light"]["setting"] = "midway"
            with open(os.path.join(folder, "test_room.json"), "w", encoding="utf-8") as fh:
                json.dump(m, fh)
            row = dict(glbMd5=md5_of(glb), glbBytes=os.path.getsize(glb), generator=regress.generator(glb),
                       light="midway", layout="bed_north", vertices=8, triangles=12, raw="x.npz",
                       recorded="2026-11-21", **regress.manifest_extras(m))
            golden = os.path.join(tmp, "golden.json")
            with open(golden, "w", encoding="utf-8") as fh:
                json.dump({"rooms": {"test_room": row}}, fh)
            done = subprocess.run([sys.executable, REGRESS, "verdict", "test_room", "--out", folder, "--golden", golden],
                                  capture_output=True, text=True)
            self.assertEqual(done.returncode, 0, done.stdout + done.stderr)
            m["walk"] = {"r0.30": {"tilesReached": 61}}
            with open(os.path.join(folder, "test_room.json"), "w", encoding="utf-8") as fh:
                json.dump(m, fh)
            done = subprocess.run([sys.executable, REGRESS, "verdict", "test_room", "--out", folder, "--golden", golden],
                                  capture_output=True, text=True)
            self.assertEqual(done.returncode, 1, done.stdout)
            self.assertIn("MISMATCH in the manifest", done.stdout)
            self.assertIn("the digest's walk", done.stdout)

    def test_stamp_adds_the_numbers_to_a_matching_row_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = os.path.join(tmp, "rebuild")
            os.makedirs(folder)
            glb = tiny_glb(os.path.join(folder, "test_room.glb"), "Khronos glTF Blender I/O v5.2.40")
            with open(os.path.join(folder, "test_room.json"), "w", encoding="utf-8") as fh:
                json.dump(self.manifest(), fh)
            row = dict(glbMd5=md5_of(glb), glbBytes=os.path.getsize(glb), generator=regress.generator(glb),
                       light="midway", layout="bed_north", vertices=8, triangles=12, raw="x.npz", recorded="2026-11-21")
            golden = os.path.join(tmp, "golden.json")
            with open(golden, "w", encoding="utf-8") as fh:
                json.dump({"rooms": {"test_room": dict(row, glbMd5="0" * 32)}}, fh)
            args = [sys.executable, REGRESS, "stamp", "test_room", "--out", folder, "--golden", golden, "--raw", glb]
            done = subprocess.run(args, capture_output=True, text=True)
            self.assertEqual(done.returncode, 1, done.stderr)       # not the golden GLB: nothing written
            self.assertIn("is not the golden GLB", done.stderr)
            with open(golden, "w", encoding="utf-8") as fh:
                json.dump({"rooms": {"test_room": row}}, fh)
            done = subprocess.run(args, capture_output=True, text=True)
            self.assertEqual(done.returncode, 0, done.stderr)
            with open(golden, encoding="utf-8") as fh:
                got = json.load(fh)["rooms"]["test_room"]
            self.assertEqual(got["manifestDigest"], regress.manifest_digest(self.manifest()))
            self.assertEqual((got["roomBakeMd5"], got["lookBakeMd5"], got["blender"]), ("r", "l", "5.2.1 LTS"))
            self.assertEqual(got["glbMd5"], row["glbMd5"])

    def test_the_repo_row_has_the_bake_gate_and_the_digest(self):
        row = read("golden.json")["rooms"]["widow_bedroom"]
        self.assertEqual(row["roomBakeMd5"], BED_NORTH_MD5)
        self.assertEqual(row["lookBakeMd5"], LOOK_MD5)
        self.assertEqual(sorted(row["manifestDigest"]["parts"]), sorted(regress.DIGEST_PARTS))
        self.assertEqual(row["bake1spp"]["samples"], 1)
        for k in ("candle", "moon", "fill", "ao", "co"):
            self.assertRegex(row["bake1spp"][k], r"^[0-9a-f]{40}$")
        self.assertRegex(row["rig"]["sha1"], r"^[0-9a-f]{40}$")


@unittest.skipIf(mrb is None, "numpy is not installed, so meshy_room_build cannot be imported")
class BuilderV2(unittest.TestCase):
    def test_the_builder_keeps_its_names_as_the_loaders(self):
        self.assertIs(mrb.bake_room_md5, rf.bake_room_md5)
        self.assertIs(mrb.bake_look_md5, rf.bake_look_md5)
        self.assertEqual(mrb.ROOM_KEYS, rf.ROOM_KEYS)
        for k in ("exposure_from", "light", "skip", "look"):
            self.assertIn(k, mrb.BAKE_ROOM_DROP)

    def test_the_manifest_argv_carries_no_local_folder(self):
        outside = os.path.join(tempfile.gettempdir(), "someone", "scratch", "out")
        argv = ["--scene", "widow_bedroom", "--out", outside, "--raw",
                os.path.join(BUILT, "widow_bedroom_raw_groups.npz"), "--room-file", os.path.join(outside, "r.json")]
        self.assertEqual(mrb.shown_argv(argv), ["--scene", "widow_bedroom", "--out", "out", "--raw",
                                                "tools/blender/build/rooms/widow_bedroom_raw_groups.npz",
                                                "--room-file", "r.json"])

    # -- G3: the openings' plain-number parts (the rest is proven by the gate and the scratch rooms' builds)
    @staticmethod
    def frame(x0=-5.0, x1=5.0, y0=-4.0, y1=4.0):
        fr = object.__new__(mrb.Frame)      # the room box alone: wall_frame, to_s and point need no scene
        fr.x0, fr.x1, fr.y0, fr.y1 = x0, x1, y0, y1
        return fr

    # -- G4: the exposure's and the light numbers' many lights (plain numpy)
    def test_one_light_measures_as_it_always_has(self):
        rng = np.random.default_rng(7)
        co = rng.uniform(-4.0, 4.0, (500, 3))
        f = (0.6, -1.2, 1.31)
        self.assertTrue(np.array_equal(mrb.near_dist(co, mrb._points(f)), np.linalg.norm(co - np.asarray(f), axis=1)))
        self.assertTrue(np.array_equal(mrb.near_dist(co, mrb._points([f])), np.linalg.norm(co - np.asarray(f), axis=1)))
        g = (-2.0, 2.0, 1.0)
        both = mrb.near_dist(co, mrb._points([f, g]))
        self.assertTrue(np.array_equal(both, np.minimum(np.linalg.norm(co - np.asarray(f), axis=1),
                                                        np.linalg.norm(co - np.asarray(g), axis=1))))
        sq = [(-1.0, -1.0), (1.0, -1.0), (1.0, 1.0), (-1.0, 1.0)]
        xy = co[:, :2]
        self.assertTrue(np.array_equal(mrb.patch_signed(sq, xy), mrb._poly_signed(sq, xy)))      # one polygon
        self.assertTrue(np.array_equal(mrb.patch_signed([sq], xy), mrb._poly_signed(sq, xy)))    # a list of one
        self.assertTrue(np.array_equal(mrb.patch_signed([], xy), np.full(len(xy), -1e9)))
        sq2 = [(x + 2.5, y) for x, y in sq]
        u = mrb.patch_signed([sq, sq2], xy)
        self.assertTrue(np.array_equal(u, np.maximum(mrb._poly_signed(sq, xy), mrb._poly_signed(sq2, xy))))
        self.assertTrue(((u > 0) == ((mrb._poly_signed(sq, xy) > 0) | (mrb._poly_signed(sq2, xy) > 0))).all())

    def test_the_strongest_pool_sets_the_exposure(self):
        rng = np.random.default_rng(3)
        a, b, c = rng.uniform(0.0, 1.0, 300), rng.uniform(0.0, 3.0, 200), rng.uniform(0.0, 0.2, 100)
        # one light: the percentile of its pool, the objects' arrays joined as they always were
        self.assertEqual(mrb.pool_level([[a, c]], 90), float(np.percentile(np.concatenate([a, c]), 90)))
        # several: the largest of their percentiles, not the percentile of the union
        got = mrb.pool_level([[a], [b], [c]], 90)
        self.assertEqual(got, float(np.percentile(b, 90)))
        self.assertGreater(got, float(np.percentile(np.concatenate([a, b, c]), 90)))
        self.assertEqual(mrb.pool_level([[a], [], [np.array([])]], 90), float(np.percentile(a, 90)))   # an empty pool
        self.assertEqual(mrb.pool_level([], 90), 0.05)                     # no pool light: the old fallback

    def test_light_numbers_take_a_list_of_lights_and_patches(self):
        rng = np.random.default_rng(11)
        surf = {}
        for k, (x, y) in {"Wall_N": (None, 3.5), "Wall_S": (None, -3.5), "Wall_E": (5.0, None),
                          "Wall_W": (-5.0, None)}.items():
            n = 400
            co = np.column_stack([rng.uniform(-5, 5, n) if x is None else np.full(n, x),
                                  rng.uniform(-3.5, 3.5, n) if y is None else np.full(n, y), rng.uniform(0, 3, n)])
            surf[k] = (co, rng.uniform(5.0, 120.0, n))
        fl = np.column_stack([rng.uniform(-5, 5, 2000), rng.uniform(-3.5, 3.5, 2000), np.zeros(2000)])
        surf["Floor"] = (fl, rng.uniform(5.0, 120.0, 2000))
        f = (3.6, -2.4, 1.3)
        patch = [(-1.6, 1.0), (0.6, 1.0), (0.6, 3.2), (-1.6, 3.2)]
        one = mrb.light_numbers(surf, f, [], patch)
        self.assertEqual(mrb.light_numbers(surf, [f], [], [patch]), one)     # the list forms read the same
        self.assertIn("far_over_candle", one)
        self.assertIn("moon_over_floor", one)
        two = mrb.light_numbers(surf, [f, (-3.6, 2.4, 1.3)], [], [patch])
        self.assertIn("candle_wall", two)
        none = mrb.light_numbers(surf, None, [], None)             # no pool light, no moon: the floor's median alone
        self.assertEqual(set(none), {"dim_floor"})

    def test_the_bake_box_keeps_every_hole_of_a_wall(self):
        self.assertEqual(mrb.tight_cuts(-1.0, 11.0, -0.3, 3.3, []), [(-1.0, 11.0, -0.3, 3.3)])
        # one hole: the four panels the box has always had, in their order
        self.assertEqual(mrb.tight_cuts(-1.0, 11.0, -0.3, 3.3, [(4.0, 5.0, 0.75, 2.3)]),
                         [(-1.0, 4.0, -0.3, 3.3), (5.0, 11.0, -0.3, 3.3), (4.0, 5.0, -0.3, 0.75), (4.0, 5.0, 2.3, 3.3)])
        # two holes, given out of order: both kept (the old loop kept only the last)
        got = mrb.tight_cuts(-1.0, 11.0, -0.3, 3.3, [(7.0, 8.0, 0.8, 2.2), (2.0, 3.0, 0.75, 2.3)])
        self.assertEqual(got, [(-1.0, 2.0, -0.3, 3.3), (3.0, 7.0, -0.3, 3.3), (8.0, 11.0, -0.3, 3.3),
                               (2.0, 3.0, -0.3, 0.75), (2.0, 3.0, 2.3, 3.3), (7.0, 8.0, -0.3, 0.8), (7.0, 8.0, 2.2, 3.3)])

    def test_the_skirting_breaks_at_every_door(self):
        fr = self.frame()
        door = lambda side, a, b: dict(kind="door", side=side, a=a, b=b)     # noqa: E731
        # one door on the south wall: the one path the builder has always swept (its end, the four corners from the
        # south wall's far corner, its start)
        runs = mrb.skirting_runs(fr, [door("S", -2.95, -2.05)])
        self.assertEqual(runs, [[fr.point("S", 2.95 + 0.115, 0.0, 0.0), (5.0, -4.0, 0.0), (5.0, 4.0, 0.0),
                                 (-5.0, 4.0, 0.0), (-5.0, -4.0, 0.0), fr.point("S", 2.05 - 0.115, 0.0, 0.0)]])
        # the same for a door on the east wall: the corners from the east wall's far corner on
        runs = mrb.skirting_runs(fr, [door("E", -0.45, 0.45)])
        self.assertEqual([p[:2] for p in runs[0][1:-1]], [(5.0, 4.0), (-5.0, 4.0), (-5.0, -4.0), (5.0, -4.0)])
        # the parlour's two: the east door and the north one; two runs, each from one door to the next
        # (the parlour's box, 14 x 9 m; the north wall's s runs west, so the north door's near end is its east end)
        fr = self.frame(-7.0, 7.0, -4.5, 4.5)
        runs = mrb.skirting_runs(fr, [door("E", -0.45, 0.45), door("N", -4.95, -4.05)])
        self.assertEqual(len(runs), 2)
        ends = [(tuple(round(v, 3) for v in r[0][:2]), tuple(round(v, 3) for v in r[-1][:2]), len(r) - 2) for r in runs]
        self.assertEqual(sorted(ends), sorted([((7.0, 0.565), (-3.935, 4.5), 1),          # E door north to the N door
                                              ((-5.065, 4.5), (7.0, -0.565), 3)]))       # N door round to the E door
        fr = self.frame()
        # two doors on one wall whose architraves all but meet: no run between them
        runs = mrb.skirting_runs(fr, [door("S", -1.0, -0.1), door("S", 0.13, 1.0)])
        self.assertEqual(len(runs), 1)

    def test_a_knob_letter_is_an_end_seen_from_inside(self):
        # the wall coordinate s runs E, N, W, S round the S, E, N, W walls: the letter of the higher-s end is each
        # wall's default, and the legacy reading ("E" or "N" toward +s) agrees on the S and E walls only
        fr = self.frame()
        for side, end in rf.KNOB_DEFAULT.items():
            self.assertIn(end, rf.KNOB_ENDS[side])
            (_o, (dx, dy), _n, _L) = fr.wall_frame(side)
            self.assertEqual({(1.0, 0.0): "E", (0.0, 1.0): "N", (-1.0, 0.0): "W", (0.0, -1.0): "S"}[(dx, dy)], end)
            self.assertEqual(end in ("E", "N"), side in ("S", "E"))

    def test_the_credits_are_the_textures_the_room_used(self):
        used = {"M_floor", "M_wall", "M_wood", "M_curtain_2", "M_snow"}
        self.assertEqual(mrb.texture_roles(used, "floor_boards", rug=False),
                         ["floor_boards", "wall_plaster", "joinery", "snow", "wool"])
        self.assertEqual(mrb.texture_roles({"M_floor", "M_wood"}, "floor_boards", rug=True),
                         ["floor_boards", "joinery", "carpet"])

    def test_a_bake_is_hashed_by_group(self):
        import numpy as np
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "b.npz")
            np.savez(path, **{"meta|samples": np.array(1), "a|candle": np.ones((2, 3), np.float32),
                              "a|co": np.zeros((2, 3), np.float32), "a|mat": np.array(["m", "m"]),
                              "b|candle": np.ones((1, 3), np.float32), "a|ao": np.ones(2, np.float32)})
            got = regress.bake_arrays(path)
            self.assertEqual((got["meshes"], got["samples"]), (2, 1))
            self.assertEqual(sorted(k for k in got if k not in ("meshes", "samples")), ["ao", "candle", "co"])
            np.savez(path, **{"meta|samples": np.array(1), "a|candle": np.ones((2, 3), np.float32) * 1.0000001,
                              "a|co": np.zeros((2, 3), np.float32), "b|candle": np.ones((1, 3), np.float32),
                              "a|ao": np.ones(2, np.float32)})
            other = regress.bake_arrays(path)
            self.assertNotEqual(got["candle"], other["candle"])
            self.assertEqual(got["co"], other["co"])


if __name__ == "__main__":
    unittest.main()
