"""Plain-Python tests for render_lock (no bpy), round 11 T4."""

import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import render_lock as rl  # noqa: E402


class Fixture(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = self.tmp.name
        self.script = self.put("build_x.py", "print('x')\n")
        self.rig = self.put("rig_common.py", "A = 1\n")
        self.master = self.put("baker.blend", "master v1")
        self.models = self.put("models.lock.json", json.dumps({"models": [{"id": "baker", "sha256": "aa"}]}))
        self.mats = self.put("polyhaven.lock.json", json.dumps({"assets": {"bark": {"md5": "1"}, "wool": {"md5": "2"}}}))
        self.out = os.path.join(self.dir, "out", "atlas")

    def put(self, name, text):
        path = os.path.join(self.dir, name)
        with open(path, "w") as fh:
            fh.write(text)
        return path

    def lock(self, **kw):
        args = dict(script=self.script, flags={"style": "8bit"}, master=self.master, model="baker",
                    sources=(self.rig,), models_lock=self.models)
        args.update(kw)
        return rl.Lock(self.out, "atlas", **args)


class HashCovers(Fixture):
    def h(self, **kw):
        return self.lock(**kw).frame_hash("f")

    def test_it_is_stable(self):
        self.assertEqual(self.h(), self.h())

    def test_builder_source(self):
        before = self.h()
        self.put("build_x.py", "print('y')\n")
        self.assertNotEqual(before, self.h())

    def test_rig_common_and_the_shared_sources(self):
        before = self.h()
        self.put("rig_common.py", "A = 2\n")
        self.assertNotEqual(before, self.h())

    def test_master(self):
        before = self.h()
        self.put("baker.blend", "master v2")
        self.assertNotEqual(before, self.h())

    def test_flags(self):
        self.assertNotEqual(self.h(), self.h(flags={"style": "hd"}))

    def test_material_lock_entries_of_the_roles_read(self):
        orig = rl.MATERIALS_LOCK
        rl.MATERIALS_LOCK = self.mats
        self.addCleanup(setattr, rl, "MATERIALS_LOCK", orig)
        kw = dict(materials=["bark"])
        before = self.lock(**kw).frame_hash("f")
        self.assertNotEqual(before, self.h())  # the term is there
        self.put("polyhaven.lock.json", json.dumps({"assets": {"bark": {"md5": "9"}, "wool": {"md5": "2"}}}))
        self.assertNotEqual(before, self.lock(**kw).frame_hash("f"))
        # a role the render does not read leaves the hash alone
        self.put("polyhaven.lock.json", json.dumps({"assets": {"bark": {"md5": "9"}, "wool": {"md5": "3"}}}))
        self.assertEqual(self.lock(**kw).frame_hash("f"), self.lock(**kw).frame_hash("f"))
        self.assertEqual(rl.material_entries(["bark"], self.mats), {"bark": {"md5": "9"}})

    def test_the_models_pinned_sha256(self):
        before = self.h()
        self.put("models.lock.json", json.dumps({"models": [{"id": "baker", "sha256": "bb"}]}))
        self.assertNotEqual(before, self.h())
        # another model's entry is not this figure's input
        self.put("models.lock.json", json.dumps({"models": [{"id": "baker", "sha256": "bb"},
                                                            {"id": "miller", "sha256": "cc"}]}))
        after = self.h()
        self.put("models.lock.json", json.dumps({"models": [{"id": "baker", "sha256": "bb"},
                                                            {"id": "miller", "sha256": "dd"}]}))
        self.assertEqual(after, self.h())

    def test_model_hook_without_a_lock(self):
        self.assertIsNone(rl.model_sha("baker", os.path.join(self.dir, "absent.json")))
        self.assertEqual(rl.model_sha("baker", self.models), "aa")
        self.assertIsNone(rl.model_sha("nobody", self.models))

    @unittest.skipUnless(os.path.exists(rl.MODELS_LOCK),
                         "tools/blender/models/models.lock.json is not in the tree yet (11D's H1 has not merged)")
    def test_the_real_models_lock_feeds_the_hash(self):
        with open(rl.MODELS_LOCK) as fh:
            first = json.load(fh)["models"][0]
        self.assertEqual(rl.model_sha(first["id"]), first["sha256"])


class Changed(Fixture):
    def render(self, frames, changed, extras=None):
        """What a script does: returns the frames it rendered."""
        lock = self.lock(changed=changed)
        rendered = []
        for name in frames:
            png = os.path.join(self.out, name + ".png")
            extra = (extras or {}).get(name)
            if lock.unchanged(name, png, extra):
                continue
            os.makedirs(self.out, exist_ok=True)
            with open(png, "wb") as fh:
                fh.write(b"png")
            lock.record(name, extra)
            rendered.append(name)
        lock.write()
        return rendered

    def test_a_changed_input_rerenders_only_its_frames(self):
        names = ["a", "b", "c"]
        self.assertEqual(self.render(names, True), names)  # first run: nothing locked
        self.assertEqual(self.render(names, True), [])  # nothing changed: nothing renders
        self.assertEqual(self.render(names, True, {"b": "new mask"}), ["b"])  # one frame's own input moved
        self.assertEqual(self.render(names, True, {"b": "new mask"}), [])
        self.assertEqual(self.render(names, False), names)  # without --changed everything renders

    def test_a_missing_png_renders_again(self):
        self.render(["a"], True)
        os.remove(os.path.join(self.out, "a.png"))
        self.assertEqual(self.render(["a"], True), ["a"])

    def test_the_shared_sources_rerender_everything(self):
        names = ["a", "b"]
        self.render(names, True)
        self.put("rig_common.py", "A = 3\n")
        self.assertEqual(self.render(names, True), names)

    def test_the_lock_file(self):
        self.render(["b", "a"], False)
        with open(os.path.join(self.out, rl.LOCK_NAME)) as fh:
            data = json.load(fh)
        self.assertEqual((data["version"], data["atlas"], data["flags"]), (1, "atlas", {"style": "8bit"}))
        self.assertEqual(list(data["frames"]), ["a", "b"])
        self.assertTrue(all(len(h) == 64 for h in data["frames"].values()))
        self.assertIn("host", data)

    def test_a_partial_run_keeps_the_other_frames(self):
        self.render(["a", "b"], False)
        self.render(["a"], False)
        with open(os.path.join(self.out, rl.LOCK_NAME)) as fh:
            self.assertEqual(list(json.load(fh)["frames"]), ["a", "b"])

    def test_changed_is_taken_out_of_argv(self):
        argv = ["x", "--", "--changed", "--out", "o"]
        self.assertTrue(rl.changed_from_argv(argv))
        self.assertEqual(argv, ["x", "--", "--out", "o"])
        self.assertFalse(rl.changed_from_argv(argv))


if __name__ == "__main__":
    unittest.main()
