"""Build the sprite world's wall textures (docs/round11/tiles-brief.md 3 and 4, P2b).

    python3 tools/world3/build_walls.py           # needs the 1k diffuse maps in tools/blender/.cache/materials
    python3 tools/world3/build_walls.py --check   # rebuild in memory, fail if a committed file differs

One seamless 64 x 64 PNG per wall or roof surface, pixel-finished to one 64-colour palette. The surfaces are those
the box walls (`W` wall, `X` cliff) and the building facades and roofs use; `tools/blender/build_buildings.py` names a
wall, a roof and for the office a painted tint per building art id. Sources are the roles of `roles.py`, CC0.
Fetch first: python3 tools/blender/materials/fetch.py fetch --roles <roles> --res 1k --maps diff
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

OUT = os.path.join(ROOT, "apps", "client", "public", "assets", "world3", "walls")
TILE = 64
COLOURS = 64
# surface name -> (role, tint). A tint multiplies the texture, as the Blender building build does.
SURFACES = {
    "plaster": ("plaster", None),
    "brick": ("brick", None),
    "stone_wall": ("stone_wall", None),
    "wood_boards": ("wood_boards", None),
    "clapboard": ("wood_boards", "#DCC4A1"),  # the office's painted boards
    "logs": ("logs", None),
    "shakes": ("wood_plank", "#9A9083"),  # shake roofs
    "slate_roof": ("slate_roof", None),
    "rock_face": ("rock_face", None),
}
# The box solids of `packages/content/src/tilemap.ts` KIT that take a wall texture.
SOLIDS = {"W": "stone_wall", "X": "rock_face"}
# building art id -> (wall, roof); a roof `ground:moss` is the sod of the ground tiles, not a file here.
BUILDINGS = {
    "manor": ("stone_wall", "slate_roof"), "barn": ("wood_boards", "slate_roof"), "bakery": ("plaster", "slate_roof"),
    "apoth": ("plaster", "slate_roof"), "widow": ("stone_wall", "slate_roof"), "tavern": ("plaster", "slate_roof"),
    "chapel": ("stone_wall", "slate_roof"), "netloft": ("wood_boards", "slate_roof"),
    "mollHut": ("logs", "ground:moss"), "lodge": ("logs", "shakes"), "mill": ("wood_boards", "shakes"),
    "office": ("clapboard", "shakes"), "smithy": ("stone_wall", "shakes"), "woodshed": ("logs", "shakes"),
}


def texture(name: str) -> Image.Image:
    role, tint = SURFACES[name]
    slug = roles.ROLES[role].slug
    img = Image.open(os.path.join(roles.CACHE_DIR, slug, roles.texture_file(slug, "diff", "1k"))).convert("RGB")
    a = np.asarray(img).astype(np.float32)
    if tint:
        t = np.array([int(tint[i:i + 2], 16) for i in (1, 3, 5)], np.float32) / 255.0
        a = a * (0.55 + 0.45 * t * 1.1)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).resize((TILE, TILE), Image.LANCZOS)


def build() -> tuple[dict[str, bytes], dict]:
    lock = json.load(open(roles.LOCK_FILE, encoding="utf-8"))["assets"]
    tiles = {n: texture(n) for n in SURFACES}
    pool = Image.new("RGB", (TILE * len(tiles), TILE))
    for i, t in enumerate(tiles.values()):
        pool.paste(t, (i * TILE, 0))
    pal = pool.quantize(COLOURS, Image.MEDIANCUT, dither=Image.NONE)
    files: dict[str, bytes] = {}
    surfaces = {}
    for name, t in tiles.items():
        buf = io.BytesIO()
        t.quantize(palette=pal, dither=Image.NONE).convert("RGB").save(buf, "PNG", optimize=True)
        role, tint = SURFACES[name]
        slug = roles.ROLES[role].slug
        files[f"{name}.png"] = buf.getvalue()
        row = {"file": f"{name}.png", "source": f"polyhaven:{slug}", "md5": lock[slug]["files"]["1k"]["diff"]["md5"],
               "licence": "CC0-1.0"}
        if tint:
            row["tint"] = tint
        surfaces[name] = row
    index = {"tile": TILE, "surfaces": surfaces, "solids": SOLIDS,
             "buildings": {k: {"wall": w, "roof": r} for k, (w, r) in BUILDINGS.items()}}
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
            if not os.path.exists(path) or open(path, "rb").read() != data:
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
