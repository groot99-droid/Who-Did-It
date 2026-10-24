"""Tests of the material library (docs/round8/art.md 6): roles, the lock and the fetcher against a fake server."""

import functools
import hashlib
import http.server
import json
import os
import sys
import tempfile
import threading
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "materials"))
import fetch  # noqa: E402
import roles  # noqa: E402


class Roles(unittest.TestCase):
    def test_every_role_resolves_to_a_locked_slug(self):
        lock = fetch.load_lock()
        for name, r in roles.ROLES.items():
            self.assertIn(r.slug, lock["assets"], f"role {name}")
            self.assertIn(r.ramp, ("ink", "slate", "fog", "moon", "bone", "plaster", "stone", "wood", "brick",
                                   "lantern", "brass", "moss", "litter", "teal", "blood", "skin"))
            self.assertGreater(r.metres, 0)
            for res in roles.RESOLUTIONS:
                for m in roles.MAPS:
                    entry = lock["assets"][r.slug]["files"][res][m]
                    self.assertEqual(entry["file"], roles.texture_file(r.slug, m, res))
                    self.assertRegex(entry["md5"], r"^[0-9a-f]{32}$")
        self.assertEqual(set(lock["assets"]), set(roles.slugs()))  # nothing locked that no role names

    def test_legacy_tables_mirror_env_kits(self):
        """The tables `env/kits.py` still renders from, mirrored here slug for slug (6Z's condition on #138)."""
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "env"))
        import kits  # noqa: E402

        self.assertEqual(set(roles.LEGACY_SURFACES), set(kits.SURFACE_TEXTURES))
        for name, slug in kits.SURFACE_TEXTURES.items():
            self.assertEqual(roles.role(roles.LEGACY_SURFACES[name]).slug, slug, f"surface {name}")
        self.assertEqual(set(roles.GROUND_ROLES), set(kits.GROUND_TEXTURES))
        for theme, chars in kits.GROUND_TEXTURES.items():
            self.assertEqual(set(roles.GROUND_ROLES[theme]), set(chars), f"theme {theme}")
            for char, slug in chars.items():
                name = roles.GROUND_ROLES[theme][char]
                self.assertEqual(None if name is None else roles.role(name).slug, slug, f"{theme} {char!r}")

    def test_legacy_tables_and_paths(self):
        for name in roles.LEGACY_SURFACES.values():
            roles.role(name)
        for theme in roles.GROUND_ROLES.values():
            self.assertEqual(len(theme), 14)
            for name in theme.values():
                if name:
                    roles.role(name)
        self.assertEqual(roles.texture_path("wood_plank", cache="/c"), "/c/brown_planks_05/brown_planks_05_diff_1k.jpg")
        self.assertEqual(roles.texture_path("wood_plank", "nor_gl", style="hd", cache="/c"),
                         "/c/brown_planks_05/brown_planks_05_nor_gl_2k.jpg")
        self.assertEqual(roles.STYLE_RESOLUTION, {"8bit": "1k", "lowpoly": "1k", "hd": "2k"})
        with self.assertRaises(KeyError):
            roles.role("marble")
        with self.assertRaises(ValueError):
            roles.texture_file("x", "ao", "1k")


class Retexture(unittest.TestCase):
    def test_every_ramp_role_is_a_role(self):
        for table in (roles.WORLD_ROLES, roles.FIGURE_ROLES):
            for ramp, name in table.items():
                self.assertIn(name, roles.ROLES, f"{ramp} -> {name}")
        for name in roles.LEGACY_EXTRA.values():
            self.assertIn(name, roles.ROLES)

    def test_legacy_material_names(self):
        self.assertEqual(roles.legacy_role("KitTex_plaster"), ("plaster", None))
        self.assertEqual(roles.legacy_role("BldTex_planks_#8A5A3C"), ("wood_plank", "#8A5A3C"))
        self.assertEqual(roles.legacy_role("BldTex_shakes"), ("wood_plank", None))
        self.assertIsNone(roles.legacy_role("KitTex_nosuch"))
        self.assertIsNone(roles.legacy_role("P_wood_2"))
        self.assertIsNone(roles.legacy_role("RT_hd_plaster_plain"))


class _Handler(http.server.SimpleHTTPRequestHandler):
    agents: list = []

    def log_message(self, *a):  # quiet
        pass

    def do_GET(self):
        _Handler.agents.append(self.headers.get("User-Agent"))
        super().do_GET()


class Fetcher(unittest.TestCase):
    """fetch.py against a fake server: hashes checked, a mismatch refused, the user agent sent."""

    @classmethod
    def setUpClass(cls):
        cls.root = tempfile.TemporaryDirectory()
        cls.data = b"not really a jpeg " * 100
        path = os.path.join(cls.root.name, "file", "ph-assets", "Textures", "jpg", "1k", "fake_wood")
        os.makedirs(path)
        with open(os.path.join(path, "fake_wood_diff_1k.jpg"), "wb") as fh:
            fh.write(cls.data)
        with open(os.path.join(path, "fake_wood_rough_1k.jpg"), "wb") as fh:
            fh.write(cls.data[::-1])
        api = os.path.join(cls.root.name, "files")
        os.makedirs(api)
        os.makedirs(os.path.join(cls.root.name, "info"))
        handler = functools.partial(_Handler, directory=cls.root.name)
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}"
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.root.cleanup()

    def _lock(self, md5: str, rough_md5: str | None = None) -> str:
        url = "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/fake_wood/"
        entry = lambda f, h: {"file": f, "md5": h, "size": len(self.data), "url": url + f}  # noqa: E731
        lock = {"version": fetch.LOCK_VERSION, "userAgent": roles.USER_AGENT, "sources": fetch.SOURCE,
                "assets": {"fake_wood": {"source": "polyhaven", "type": "texture", "name": "Fake", "authors": {},
                                         "dimensionsMm": [1000, 1000],
                                         "files": {"1k": {"diff": entry("fake_wood_diff_1k.jpg", md5),
                                                          "rough": entry("fake_wood_rough_1k.jpg", rough_md5 or md5)}}}}}
        path = os.path.join(self.root.name, "lock.json")
        with open(path, "w") as fh:
            fh.write(fetch.dump_lock(lock))
        self.assertEqual(json.loads(fetch.dump_lock(lock)), lock)
        return path

    def test_fetch_checks_hashes_and_sends_the_user_agent(self):
        good = hashlib.md5(self.data).hexdigest()
        lock = self._lock(good, hashlib.md5(self.data[::-1]).hexdigest())
        cache = os.path.join(self.root.name, "cache")
        _Handler.agents.clear()
        counts = fetch.fetch(["fake_wood"], ["1k"], ["diff", "rough"], cache, lock, self.base, log=lambda *a: None)
        self.assertEqual(counts, {"kept": 0, "fetched": 2})
        self.assertEqual(set(_Handler.agents), {"who-did-it-build"})
        dest = os.path.join(cache, "fake_wood", "fake_wood_diff_1k.jpg")
        with open(dest, "rb") as fh:
            self.assertEqual(fh.read(), self.data)
        # A second run keeps what matches and fetches nothing.
        counts = fetch.fetch(["fake_wood"], ["1k"], ["diff", "rough"], cache, lock, self.base, log=lambda *a: None)
        self.assertEqual(counts, {"kept": 2, "fetched": 0})
        # A cached file with another hash is fetched again.
        with open(dest, "wb") as fh:
            fh.write(b"stale")
        counts = fetch.fetch(["fake_wood"], ["1k"], ["diff"], cache, lock, self.base, log=lambda *a: None)
        self.assertEqual(counts, {"kept": 0, "fetched": 1})

    def test_mismatch_is_refused_and_leaves_no_file(self):
        lock = self._lock("0" * 32)
        cache = os.path.join(self.root.name, "cache-bad")
        with self.assertRaises(fetch.HashMismatch):
            fetch.fetch(["fake_wood"], ["1k"], ["diff"], cache, lock, self.base, log=lambda *a: None)
        self.assertFalse(os.path.exists(os.path.join(cache, "fake_wood", "fake_wood_diff_1k.jpg")))
        self.assertFalse(os.path.exists(os.path.join(cache, "fake_wood", "fake_wood_diff_1k.jpg.part")))

    def test_unlocked_slug_or_map_is_an_error(self):
        lock = self._lock(hashlib.md5(self.data).hexdigest())
        with self.assertRaises(SystemExit):
            fetch.fetch(["other"], ["1k"], ["diff"], self.root.name, lock, self.base)
        with self.assertRaises(SystemExit):
            fetch.fetch(["fake_wood"], ["2k"], ["diff"], self.root.name, lock, self.base)

    def test_lock_from_a_fake_api_and_credits(self):
        files = {"Diffuse": {}, "nor_gl": {}, "Rough": {}}
        for key, part in (("Diffuse", "albedo"), ("nor_gl", "nor_gl"), ("Rough", "rough")):
            for res in roles.RESOLUTIONS:
                files[key][res] = {"jpg": {"size": 1, "md5": "a" * 32,
                                           "url": f"https://dl.polyhaven.org/x/{res}/s/s_{part}_{res}.jpg"}}
        with open(os.path.join(self.root.name, "files", "brown_planks_05"), "w") as fh:
            json.dump(files, fh)
        with open(os.path.join(self.root.name, "info", "brown_planks_05"), "w") as fh:
            json.dump({"name": "Brown Planks 05", "authors": {"Rob Tuytel": "All"}, "dimensions": [999.6, 1000.4]}, fh)
        entry = fetch.lock_asset("brown_planks_05", self.base)
        self.assertEqual(entry["dimensionsMm"], [1000, 1000])
        self.assertEqual(entry["files"]["2k"]["diff"],
                         {"file": "brown_planks_05_diff_2k.jpg", "md5": "a" * 32, "size": 1,
                          "url": "https://dl.polyhaven.org/x/2k/s/s_albedo_2k.jpg"})
        lock = {"version": 1, "sources": fetch.SOURCE, "assets": {"brown_planks_05": entry}}
        self.assertEqual(fetch.credits_rows(lock), [
            "| `brown_planks_05` | Brown Planks 05 | Rob Tuytel | https://polyhaven.com/a/brown_planks_05 | CC0-1.0 "
            "| `wood_plank` |"])


if __name__ == "__main__":
    unittest.main()
