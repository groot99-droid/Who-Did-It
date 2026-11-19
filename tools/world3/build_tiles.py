"""Build the sprite world's ground tiles (docs/round11/tiles-brief.md 2 and 4, P2a).

    python3 tools/world3/build_tiles.py           # needs the 1k diffuse maps in tools/blender/.cache/materials
    python3 tools/world3/build_tiles.py --check   # rebuild in memory, fail if a committed file differs

One 256 x 64 strip per theme and floor material: four 64 x 64 seamless variants (the texture, then three turned or
flipped and shifted copies), pixel-finished to one palette per theme. `O` (deep water) has no Poly Haven role and is
drawn here. Sources are the roles of `GROUND_ROLES` (`tools/blender/materials/roles.py`), CC0.
Fetch first: python3 tools/blender/materials/fetch.py --roles <roles> --res 1k --maps diff
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "blender", "materials"))
import roles  # noqa: E402

OUT = os.path.join(ROOT, "apps", "client", "public", "assets", "world3", "tiles")
TILE = 64
COLOURS = 48
# FLOOR_MATERIALS of packages/content/src/tilemap.ts, by character; O is the deep water.
NAMES = {"g": "grass", "l": "litter", "m": "moss", "p": "path", "d": "earth", "c": "cobble", "f": "flags",
         "w": "planks", "r": "rock", "s": "shingle", "~": "shallows", "u": "brush", "=": "rails", "O": "water"}
WATER = {"harbour": ((22, 52, 78), (38, 84, 112)), "timber": ((18, 40, 52), (30, 66, 74))}


def source_path(slug: str) -> str:
    return os.path.join(roles.CACHE_DIR, slug, roles.texture_file(slug, "diff", "1k"))


def variants(src: Image.Image) -> list[Image.Image]:
    """Four seamless 64 px variants of one square texture: turns, flips and shifts keep it seamless."""
    a = np.asarray(src.convert("RGB"))
    n = a.shape[0]
    forms = [a, np.roll(np.rot90(a), (n // 3, n // 5), (0, 1)), np.roll(a[:, ::-1], (n // 2, n // 7), (0, 1)),
             np.roll(np.rot90(a, 2), (n // 5, n // 2), (0, 1))]
    return [Image.fromarray(np.ascontiguousarray(f)).resize((TILE, TILE), Image.LANCZOS) for f in forms]


def water(theme: str) -> list[Image.Image]:
    """Four drawn, seamless water tiles: a flat deep colour with a few lighter ripple dashes (wrapped)."""
    base, light = WATER[theme]
    out = []
    for v in range(4):
        rng = np.random.default_rng(1000 + v)
        a = np.full((TILE, TILE, 3), base, np.uint8)
        for _ in range(14):
            x, y, w = int(rng.integers(0, TILE)), int(rng.integers(0, TILE)), int(rng.integers(4, 10))
            for i in range(w):
                a[y, (x + i) % TILE] = light
        out.append(Image.fromarray(a))
    return out


def theme_tiles(theme: str) -> dict[str, list[Image.Image]]:
    tiles: dict[str, list[Image.Image]] = {}
    for ch, name in NAMES.items():
        role = roles.GROUND_ROLES[theme][ch]
        tiles[name] = water(theme) if role is None else variants(Image.open(source_path(roles.ROLES[role].slug)))
    return tiles


def palette_of(tiles: dict[str, list[Image.Image]]) -> Image.Image:
    pool = Image.new("RGB", (TILE * 4, TILE * len(tiles)))
    for row, vs in enumerate(tiles.values()):
        for col, v in enumerate(vs):
            pool.paste(v, (col * TILE, row * TILE))
    return pool.quantize(COLOURS, Image.MEDIANCUT, dither=Image.NONE)


def strip(vs: list[Image.Image], pal: Image.Image) -> bytes:
    s = Image.new("RGB", (TILE * 4, TILE))
    for i, v in enumerate(vs):
        s.paste(v, (i * TILE, 0))
    buf = io.BytesIO()
    s.quantize(palette=pal, dither=Image.NONE).convert("RGB").save(buf, "PNG", optimize=True)
    return buf.getvalue()


def build() -> tuple[dict[str, bytes], dict]:
    lock = json.load(open(roles.LOCK_FILE, encoding="utf-8"))["assets"]
    files: dict[str, bytes] = {}
    index: dict = {"tile": TILE, "variants": 4, "themes": {}}
    for theme in roles.GROUND_ROLES:
        tiles = theme_tiles(theme)
        pal = palette_of(tiles)
        rows = {}
        for ch, name in NAMES.items():
            role = roles.GROUND_ROLES[theme][ch]
            rel = f"{theme}/{name}.png"
            files[rel] = strip(tiles[name], pal)
            if role is None:
                rows[ch] = {"name": name, "file": rel, "source": "drawn", "licence": "CC0-1.0"}
            else:
                slug = roles.ROLES[role].slug
                md5 = lock[slug]["files"]["1k"]["diff"]["md5"]
                rows[ch] = {"name": name, "file": rel, "source": f"polyhaven:{slug}", "md5": md5, "licence": "CC0-1.0"}
        index["themes"][theme] = rows
    index["gaps"] = []
    return files, index


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    files, index = build()
    files["index.json"] = (json.dumps(index, indent=2) + "\n").encode()
    bad = 0
    for rel, data in files.items():
        path = os.path.join(OUT, rel)
        if args.check:
            if not os.path.exists(path) or hashlib.sha256(open(path, "rb").read()).digest() != hashlib.sha256(data).digest():
                print("differs:", rel)
                bad += 1
            continue
        os.makedirs(os.path.dirname(path), exist_ok=True)
        open(path, "wb").write(data)
    if args.check and bad:
        raise SystemExit(1)
    print(f"{len(files)} files {'checked' if args.check else 'written'} in {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
