"""The model lock (docs/ASSETS.md 6.12): its schema, and fetch_models.py against a fake release server."""

import functools
import hashlib
import http.server
import io
import json
import os
import re
import sys
import tempfile
import threading
import unittest
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "models"))
import fetch_models as fm  # noqa: E402

HEX64 = re.compile(r"^[0-9a-f]{64}$")
ID = re.compile(r"^[a-z0-9_]+$")


class Lock(unittest.TestCase):  # the committed lock: every field well formed, the handoff's counts
    @classmethod
    def setUpClass(cls):
        cls.lock = fm.load_lock()

    def test_top_level(self):
        self.assertEqual(set(self.lock), {"schema", "repo", "sources", "releases", "models"})
        self.assertEqual(fm.release_url(self.lock, "char-models"),
                         "https://github.com/groot99-droid/Who-Did-It/releases/download/char-models/char-models.zip")
        self.assertEqual(set(self.lock["releases"]), {"char-models", "prop-models"})
        for tag, rel in self.lock["releases"].items():
            self.assertEqual(set(rel), {"asset", "sha256", "size"}, tag)
            self.assertEqual(rel["asset"], f"{tag}.zip")
            self.assertRegex(rel["sha256"], HEX64)
            self.assertIsInstance(rel["size"], int)
            self.assertGreater(rel["size"], 0)

    def test_sources_carry_a_licence(self):
        self.assertEqual(set(self.lock["sources"]), {"higgsfield", "meshy"})
        for name, src in self.lock["sources"].items():
            self.assertEqual(set(src), {"licence", "basis"}, name)
            self.assertIn(src["licence"], ("CC0-1.0", "CC-BY-4.0"), name)
            self.assertRegex(src["basis"], r"DECISIONS A\d+", name)
            self.assertNotIn("proposed", src["basis"], name)

    def test_models(self):
        ids, paths = set(), set()
        for m in self.lock["models"]:
            keys = set(m) - {"alternateOf"}
            self.assertEqual(keys, {"id", "kind", "path", "source", "release", "sha256", "size"}, m.get("id"))
            self.assertRegex(m["id"], ID)
            self.assertNotIn(m["id"], ids, "ids are unique")
            self.assertNotIn(m["path"], paths, "paths are unique")
            ids.add(m["id"])
            paths.add(m["path"])
            self.assertIn(m["kind"], fm.KINDS)
            self.assertIn(m["source"], self.lock["sources"])
            self.assertEqual(m["release"], "char-models" if m["kind"] == "character" else "prop-models", m["id"])
            self.assertTrue(m["path"].endswith(".glb"), m["path"])
            self.assertFalse(m["path"].startswith("/") or ".." in m["path"].split("/"), m["path"])
            self.assertRegex(m["sha256"], HEX64)
            self.assertIsInstance(m["size"], int)
            self.assertGreater(m["size"], 0)
        for m in self.lock["models"]:
            if "alternateOf" in m:
                self.assertIn(m["alternateOf"], ids)
                self.assertEqual(m["id"], m["alternateOf"] + "_alt")

    def test_counts(self):
        kinds = {k: sum(m["kind"] == k for m in self.lock["models"]) for k in fm.KINDS}
        self.assertEqual(kinds, {"character": 41, "prop": 132, "item": 32})
        chars = [m for m in self.lock["models"] if m["kind"] == "character"]
        self.assertEqual(sum(m["source"] == "higgsfield" for m in chars), 13)
        self.assertEqual(sum(m["source"] == "meshy" for m in chars), 28)
        self.assertTrue(all(m["source"] == "meshy" for m in self.lock["models"] if m["kind"] != "character"))


class _Handler(http.server.SimpleHTTPRequestHandler):
    hits: list = []

    def do_GET(self):  # noqa: N802
        _Handler.hits.append(self.path)
        super().do_GET()

    def log_message(self, *a):
        pass


def _glb(seed: str) -> bytes:
    return b"glTF\x02\x00\x00\x00" + seed.encode() * 50


def _cache(t, name):
    return os.path.join(t.root.name, "cache-" + name)


class Fetcher(unittest.TestCase):
    """fetch_models.py against a fake server: the zip and every GLB hash checked, HTML and mismatches refused."""

    @classmethod
    def setUpClass(cls):
        cls.root = tempfile.TemporaryDirectory()
        cls.glbs = {"characters/a/baker.glb": _glb("baker"), "characters/a/smith.glb": _glb("smith")}
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            for name, data in cls.glbs.items():
                z.writestr(name, data)
            z.writestr("README.txt", b"not locked, not extracted")
        cls.zip = buf.getvalue()
        d = os.path.join(cls.root.name, "o", "r", "releases", "download", "char-models")
        os.makedirs(d)
        # login.zip is a sign-in page served under a zip's name, so only its first bytes give it away.
        for name, data in (("char-models.zip", cls.zip), ("bad-glb.zip", cls.zip), ("login.zip", b"<!DOCTYPE html>")):
            with open(os.path.join(d, name), "wb") as fh:
                fh.write(data)
        handler = functools.partial(_Handler, directory=cls.root.name)
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}"
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.root.cleanup()

    def _lock(self, asset="char-models.zip", zip_sha=None, glb_sha=None, size=None) -> dict:
        models = [{"id": os.path.basename(p)[:-4], "kind": "character", "path": p, "source": "higgsfield",
                   "release": "char-models", "sha256": hashlib.sha256(d).hexdigest(), "size": len(d)}
                  for p, d in self.glbs.items()]
        if glb_sha:
            models[1]["sha256"] = glb_sha
        return {"schema": 1, "repo": "o/r", "sources": {}, "models": models,
                "releases": {"char-models": {"asset": asset, "size": size or len(self.zip),
                                             "sha256": zip_sha or hashlib.sha256(self.zip).hexdigest()}}}

    def test_fetch_extracts_and_verifies_then_keeps_the_cache(self):
        cache = _cache(self, "good")
        _Handler.hits.clear()
        paths = fm.fetch_release("char-models", self._lock(), cache, self.base, log=lambda *a: None)
        self.assertEqual(set(paths), {"baker", "smith"})
        for p, data in self.glbs.items():
            with open(os.path.join(cache, "char-models", "glb", p), "rb") as fh:
                self.assertEqual(fh.read(), data)
        self.assertFalse(os.path.exists(os.path.join(cache, "char-models", "glb", "README.txt")))
        self.assertEqual(len(_Handler.hits), 1)
        # A second run downloads nothing.
        fm.fetch_release("char-models", self._lock(), cache, self.base, log=lambda *a: None)
        self.assertEqual(len(_Handler.hits), 1)
        # A tampered GLB is extracted again from the cached zip.
        dest = paths["baker"]
        with open(dest, "wb") as fh:
            fh.write(b"stale")
        fm.fetch_release("char-models", self._lock(), cache, self.base, log=lambda *a: None)
        self.assertEqual(fm.sha256_of(dest), hashlib.sha256(self.glbs["characters/a/baker.glb"]).hexdigest())
        self.assertEqual(len(_Handler.hits), 1)
        self.assertEqual(fm.check(os.path.join(cache, "char-models", "glb"), self._lock()["models"]), [])

    def _write(self, lock) -> str:
        path = os.path.join(self.root.name, f"lock-{id(lock)}.json")
        with open(path, "w") as fh:
            json.dump(lock, fh)
        return path

    def _refused(self, lock, name):
        cache = _cache(self, name)
        with self.assertRaises(fm.FetchError) as cm:
            fm.fetch_release("char-models", lock, cache, self.base, log=lambda *a: None)
        rel = os.path.join(cache, "char-models")
        return str(cm.exception), (os.listdir(rel) if os.path.isdir(rel) else [])

    def test_bad_zip_is_refused_and_leaves_nothing(self):
        cases = {"sha256": self._lock(zip_sha="0" * 64), "bytes": self._lock(size=len(self.zip) + 1),
                 "HTML": self._lock(asset="login.zip")}
        for word, lock in cases.items():
            msg, left = self._refused(lock, word)
            self.assertIn(word, msg)
            self.assertEqual(left, [], word)

    def test_glb_hash_mismatch_is_refused(self):
        lock = self._lock(asset="bad-glb.zip", glb_sha="f" * 64)
        msg, _ = self._refused(lock, "glb")
        self.assertIn("characters/a/smith.glb", msg)
        self.assertEqual(fm.check(os.path.join(_cache(self, "glb"), "char-models", "glb"), lock["models"]),
                         ["characters/a/smith.glb: sha256 differs from the lock"])

    def test_missing_release_asset_fails_cleanly(self):
        lock = self._lock(asset="nope.zip")
        self.assertEqual(fm.main(["--cache", _cache(self, "404"), "--lock", self._write(lock),
                                  "--base-url", self.base]), 1)


if __name__ == "__main__":
    unittest.main()
