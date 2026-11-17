"""Tests of the first-person rooms' own files (meshy_rooms/<sceneId>.json) and of the regression gate's golden values
(meshy_rooms/golden.json). The files are read with the standard library alone; the builder's loader needs numpy
(meshy_room_build.py imports it), so its tests are skipped where numpy is missing."""

import json
import os
import subprocess
import sys
import tempfile
import unittest

BLENDER = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
ROOMS_DIR = os.path.join(BLENDER, "meshy_rooms")
SCENES_DIR = os.path.normpath(os.path.join(BLENDER, "..", "..", "packages", "content", "data", "scenes"))
sys.path.insert(0, BLENDER)
try:
    import meshy_room_build as mrb  # noqa: E402
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


if __name__ == "__main__":
    unittest.main()
