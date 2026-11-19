"""Render locks, the writer (round 11, T4). Pure Python, stdlib only: no bpy, so the tests and the T5 check run anywhere.

Every render script writes `<out>/<atlas>/render.lock.json` beside its manifest:

    {"version": 1, "atlas": "props", "blender": "5.2.0 LTS", "host": "Linux x86_64", "flags": {...},
     "frames": {"prop_bell": "<sha256>", ...}}

A frame's hash covers the inputs that can change its pixels: the builder script that makes it, `rig_common`, `build_rig`
and the shared render code, the master (a `.blend` or a source GLB), the material lock entries of the roles the render
reads, the flags (`--style`, `--textured`), the model's sha256 from `models/models.lock.json`, and any per-frame
`extra` the script gives. The Blender build and the host are recorded but not hashed: they say where a lock was
made, and a renderer upgrade is a deliberate re-render, not a silent one.

`--changed` (taken out of argv like `--style`) skips a frame whose hash equals the lock's and whose PNG exists, so a
changed input re-renders only its frames. `assets/source/renders/` holds the committed copies; T5 checks them.
"""

from __future__ import annotations

import hashlib
import json
import os
import platform
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
LOCK_NAME = "render.lock.json"
VERSION = 1
# The shared sources every frame of every render depends on, beside the script that renders it.
COMMON_SOURCES = ("rig_common.py", "build_rig.py", "batch_render.py", "static_common.py")
MODELS_LOCK = os.path.join(HERE, "models", "models.lock.json")  # 11D's H1 (the lock of the character and prop GLBs)
MATERIALS_LOCK = os.path.join(HERE, "materials", "polyhaven.lock.json")


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def model_sha(model_id: str, lock_path: str | None = None) -> str | None:
    """The sha256 `models.lock.json` pins for a model id (`baker`), or None when the lock or the id is absent.

    The hook for 11D's H1: until its lock merges this returns None and the figure hash simply lacks the term."""
    lock_path = lock_path or MODELS_LOCK
    if not os.path.exists(lock_path):
        return None
    with open(lock_path) as fh:
        for entry in json.load(fh).get("models", []):
            if entry.get("id") == model_id:
                return entry.get("sha256")
    return None


def material_entries(slugs, lock_path: str | None = None) -> dict:
    """The material lock's entries for these slugs (their file names, md5 and sizes), sorted by slug."""
    lock_path = lock_path or MATERIALS_LOCK
    if not slugs or not os.path.exists(lock_path):
        return {}
    with open(lock_path) as fh:
        assets = json.load(fh).get("assets", {})
    return {s: assets[s] for s in sorted(set(slugs)) if s in assets}


def changed_from_argv(argv: list[str]) -> bool:
    """Strip `--changed` out of `argv` in place; True when it was there."""
    if "--changed" in argv:
        argv.remove("--changed")
        return True
    return False


def _canon(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":")).encode()


class Lock:
    """The lock of one atlas: frame hashes of this run, merged over the lock already on disk."""

    def __init__(self, out_dir: str, atlas: str, script: str, flags: dict | None = None, master: str | None = None,
                 model: str | None = None, materials=(), blender: str = "", changed: bool = False,
                 sources: tuple = COMMON_SOURCES, models_lock: str | None = None):
        self.path = os.path.join(out_dir, LOCK_NAME)
        self.atlas, self.blender, self.changed, self.flags = atlas, blender, changed, dict(flags or {})
        files = [os.path.abspath(script)] + [os.path.join(HERE, s) for s in sources]
        self.common = hashlib.sha256(_canon({
            "sources": {os.path.basename(f): sha256_file(f) for f in sorted(set(files))},
            "master": sha256_file(master) if master and os.path.exists(master) else None,
            "model": model_sha(model, models_lock) if model else None,
            "materials": material_entries(materials),
            "flags": self.flags,
        })).hexdigest()
        self.frames: dict[str, str] = {}
        self.old: dict[str, str] = {}
        if os.path.exists(self.path):
            with open(self.path) as fh:
                self.old = json.load(fh).get("frames", {})

    def frame_hash(self, name: str, extra=None) -> str:
        return hashlib.sha256(_canon([self.common, name, extra])).hexdigest()

    def unchanged(self, name: str, png: str, extra=None) -> bool:
        """True (and the hash is kept) when `--changed` is on, the lock has this very hash and the PNG exists."""
        h = self.frame_hash(name, extra)
        if self.changed and self.old.get(name) == h and os.path.exists(png):
            self.frames[name] = h
            return True
        return False

    def record(self, name: str, extra=None) -> None:
        self.frames[name] = self.frame_hash(name, extra)

    def write(self) -> None:
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        data = {"version": VERSION, "atlas": self.atlas, "blender": self.blender,
                "host": f"{platform.system()} {platform.machine()}", "flags": self.flags,
                "frames": {**self.old, **self.frames}}
        with open(self.path, "w") as fh:
            json.dump(data, fh, indent=1, sort_keys=True)
            fh.write("\n")
        print(f"render lock: {len(self.frames)} frames -> {self.path}", file=sys.stderr)
