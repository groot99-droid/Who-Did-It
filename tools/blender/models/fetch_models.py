"""Fetch the model releases into the git-ignored cache, checking every hash against the lock (docs/ASSETS.md 6.12).

    python3 tools/blender/models/fetch_models.py [--release char-models]

Stdlib only. See README.md: a zip that is HTML, not a zip, or off the lock's size or sha256 is refused; only the
locked GLBs are extracted, each checked against its own sha256; files that already match are kept.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
LOCK_FILE = os.path.join(HERE, "models.lock.json")
CACHE_DIR = os.path.join(HERE, "..", "build", "models")
LOCK_SCHEMA = 1
USER_AGENT = "who-did-it-build"
KINDS = ("character", "prop", "item")
CHUNK = 1 << 20


class FetchError(Exception):
    """A download or a cached file does not match the lock."""


def load_lock(path: str = LOCK_FILE) -> dict:
    with open(path, encoding="utf-8") as fh:
        lock = json.load(fh)
    if lock.get("schema") != LOCK_SCHEMA:
        raise SystemExit(f"{path}: lock schema {lock.get('schema')!r}, expected {LOCK_SCHEMA}")
    return lock


def release_url(lock: dict, tag: str, base_url: str | None = None) -> str:
    base = (base_url or "https://github.com").rstrip("/")
    return f"{base}/{lock['repo']}/releases/download/{tag}/{lock['releases'][tag]['asset']}"


def sha256_of(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(CHUNK), b""):
            h.update(chunk)
    return h.hexdigest()


def models_of(lock: dict, tag: str) -> list[dict]:
    return [m for m in lock["models"] if m["release"] == tag]


def download(url: str, dest: str, want_sha: str, want_size: int, timeout: float = 120.0) -> None:
    """Stream `url` to `dest`, refusing an HTML page, a wrong size or a wrong sha256; nothing is left on failure."""
    tmp = dest + ".part"
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    h = hashlib.sha256()
    size = 0
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r, open(tmp, "wb") as fh:
            ctype = (r.headers.get("Content-Type") or "").lower()
            first = r.read(CHUNK)
            if "text/html" in ctype or first.lstrip()[:15].lower().startswith((b"<!doctype", b"<html")):
                raise FetchError(f"{url}: got an HTML page, not the release zip")
            if not first.startswith(b"PK\x03\x04"):
                raise FetchError(f"{url}: not a zip")
            chunk = first
            while chunk:
                h.update(chunk)
                fh.write(chunk)
                size += len(chunk)
                chunk = r.read(CHUNK)
        if size != want_size:
            raise FetchError(f"{url}: {size} bytes, lock says {want_size}")
        if h.hexdigest() != want_sha:
            raise FetchError(f"{url}: sha256 {h.hexdigest()}, lock says {want_sha}")
        os.replace(tmp, dest)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def extract(zip_path: str, out: str, models: list[dict]) -> int:
    """Extract the locked GLBs (only those) into `out`; returns how many were written."""
    written = 0
    with zipfile.ZipFile(zip_path) as z:
        names = set(z.namelist())
        for m in models:
            dest = os.path.join(out, m["path"])
            if os.path.exists(dest) and sha256_of(dest) == m["sha256"]:
                continue
            if m["path"] not in names:
                raise FetchError(f"{zip_path}: {m['path']} ({m['id']}) is not in the zip")
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            with z.open(m["path"]) as src, open(dest + ".part", "wb") as fh:
                shutil.copyfileobj(src, fh, CHUNK)
            os.replace(dest + ".part", dest)
            written += 1
    return written


def check(out: str, models: list[dict]) -> list[str]:
    """Every locked GLB that is missing or has another hash, as `path: reason`."""
    bad = []
    for m in models:
        p = os.path.join(out, m["path"])
        if not os.path.exists(p):
            bad.append(f"{m['path']}: missing")
        elif sha256_of(p) != m["sha256"]:
            bad.append(f"{m['path']}: sha256 differs from the lock")
    return bad


def fetch_release(tag: str, lock: dict, cache: str = CACHE_DIR, base_url: str | None = None, log=print) -> dict:
    """Download (unless cached), extract and verify one release. Returns {id: absolute GLB path}."""
    rel = lock["releases"].get(tag)
    if rel is None:
        raise SystemExit(f"{tag} is not a release of the lock")
    root = os.path.join(cache, tag)
    zip_path = os.path.join(root, rel["asset"])
    if not (os.path.exists(zip_path) and sha256_of(zip_path) == rel["sha256"]):
        log(f"models: downloading {tag}/{rel['asset']} ({rel['size'] / 1e6:.1f} MB)")
        download(release_url(lock, tag, base_url), zip_path, rel["sha256"], rel["size"])
    models = models_of(lock, tag)
    out = os.path.join(root, "glb")
    n = extract(zip_path, out, models)
    bad = check(out, models)
    if bad:
        raise FetchError(f"{tag}: " + "; ".join(bad))
    log(f"models: {tag}: {len(models)} GLBs verified ({n} extracted)")
    return {m["id"]: os.path.abspath(os.path.join(out, m["path"])) for m in models}


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="fetch_models.py", description=__doc__.split("\n\n")[0])
    p.add_argument("--release", action="append", help="a release tag (default: every release of the lock)")
    p.add_argument("--cache", default=CACHE_DIR)
    p.add_argument("--lock", default=LOCK_FILE)
    p.add_argument("--base-url", help=argparse.SUPPRESS)
    a = p.parse_args(argv)
    lock = load_lock(a.lock)
    try:
        for tag in a.release or sorted(lock["releases"]):
            fetch_release(tag, lock, a.cache, a.base_url)
    except (FetchError, OSError) as e:
        print(f"models: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
