"""The CC0 packs and textures of the world art (docs/round5/art-plan.md 3.1), and their fetch.

    python3 tools/blender/env/kits.py --out assets/external/kits [--licences LICENSES/vendors]

Pure Python (no bpy). Downloads go to git-ignored `assets/external/kits/<pack>/`; with `--licences` the
licence text of each vendor is also written to `LICENSES/vendors/<vendor>-<pack>-license-<date>.txt`, the day
of the fetch, as the vendor README row requires. A pack already on disk is not fetched again.

Poly Haven textures are the 1k diffuse map only (`<id>_diff_1k.jpg`): the pixel finish snaps every pixel to the
world palette at 64 x 32 per tile, so normal and roughness maps would add nothing the finish keeps.
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import shutil
import urllib.request
import zipfile

# Kenney packs (CC0 1.0): name -> download URL, as linked from https://kenney.nl/assets/<name> on the fetch day.
KENNEY = {
    "fantasy-town-kit": "https://kenney.nl/media/pages/assets/fantasy-town-kit/efe948d309-1754222374/kenney_fantasy-town-kit_2.0.zip",
    "nature-kit": "https://kenney.nl/media/pages/assets/nature-kit/37ac38a37b-1677698939/kenney_nature-kit.zip",
    "survival-kit": "https://kenney.nl/media/pages/assets/survival-kit/4065a8185b-1712149243/kenney_survival-kit.zip",
    "furniture-kit": "https://kenney.nl/media/pages/assets/furniture-kit/440e0608a4-1677580847/kenney_furniture-kit.zip",
    "graveyard-kit": "https://kenney.nl/media/pages/assets/graveyard-kit/ba8d4b4517-1760691807/kenney_graveyard-kit_5.0.zip",
}

# Ground textures per theme and material char of GROUND_ROWS (SPRITES 10.12). None = no texture: the
# material is drawn from flat palette colours (deep water) by build_ground.py.
GROUND_TEXTURES: dict[str, dict[str, str | None]] = {
    "harbour": {
        "g": "leafy_grass",
        "l": "forest_leaves_02",
        "m": "mossy_rock",
        "p": "muddy_tracks",
        "d": "mud_forest",
        "c": "mossy_cobblestone",
        "f": "stone_floor",
        "w": "old_wood_floor",
        "r": "rock_ground",
        "s": "clean_pebbles",
        "~": "river_small_rocks",
        "u": "forest_floor",
        "=": "gravel",
        "O": None,
    },
    "timber": {
        "g": "withered_grass",
        "l": "forrest_ground_01",
        "m": "moss_wood",
        "p": "brown_mud_02",
        "d": "forest_ground_04",
        "c": "rocky_trail",
        "f": "slate_floor_02",
        "w": "weathered_planks",
        "r": "rocky_gravel",
        "s": "gravel_floor",
        "~": "brown_mud_rocks_01",
        "u": "forest_ground_05",
        "=": "gravel_stones",
        "O": None,
    },
}

# Wall and building textures (kit, buildings, props); keyed by use.
SURFACE_TEXTURES = {
    "plaster": "worn_mossy_plasterwall",
    "brick": "red_brick_03",
    "granite": "rock_wall_08",
    "slate_roof": "roof_slates_02",
    "logs": "wood_trunk_wall",
    "boards": "weathered_plank_siding",
    "planks": "brown_planks_05",
    "hill_rock": "rock_face",
    "bark": "bark_brown_02",
    "pine_bark": "pine_bark",
}

POLYHAVEN_LICENCE = """Poly Haven assets licence (fetched {date} from https://polyhaven.com/license)

All assets on Poly Haven are licensed as CC0 1.0 Universal (public domain dedication):
https://creativecommons.org/publicdomain/zero/1.0/

You may use them for any purpose, commercial or not, without attribution, and redistribute and modify
them. Who Did It credits Poly Haven anyway (CREDITS.md, "Third-party").

Assets taken (1k diffuse maps, via https://api.polyhaven.com/files/<id>):
{ids}
"""


def texture_ids() -> list[str]:
    ids = {t for theme in GROUND_TEXTURES.values() for t in theme.values() if t}
    return sorted(ids | set(SURFACE_TEXTURES.values()))


def _get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "who-did-it-kits/1"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def fetch_kenney(out: str, licences: str | None, date: str) -> None:
    for name, url in KENNEY.items():
        dest = os.path.join(out, f"kenney_{name}")
        if not os.path.isdir(dest):
            zpath = dest + ".zip"
            with open(zpath, "wb") as fh:
                fh.write(_get(url))
            with zipfile.ZipFile(zpath) as z:
                z.extractall(dest)
            os.remove(zpath)
            print(f"kits: kenney {name} -> {dest}")
        if licences:
            shutil.copyfile(os.path.join(dest, "License.txt"),
                            os.path.join(licences, f"kenney-{name}-license-{date}.txt"))


def fetch_polyhaven(out: str, licences: str | None, date: str) -> None:
    dest = os.path.join(out, "polyhaven")
    os.makedirs(dest, exist_ok=True)
    for tid in texture_ids():
        path = os.path.join(dest, f"{tid}_diff_1k.jpg")
        if os.path.exists(path):
            continue
        files = json.loads(_get(f"https://api.polyhaven.com/files/{tid}"))
        with open(path, "wb") as fh:
            fh.write(_get(files["Diffuse"]["1k"]["jpg"]["url"]))
        print(f"kits: polyhaven {tid}")
    if licences:
        ids = "\n".join(f"- {t}" for t in texture_ids())
        with open(os.path.join(licences, f"polyhaven-textures-license-{date}.txt"), "w") as fh:
            fh.write(POLYHAVEN_LICENCE.format(date=date, ids=ids))


def texture_path(root: str, tid: str) -> str:
    return os.path.join(root, "polyhaven", f"{tid}_diff_1k.jpg")


def main() -> None:
    p = argparse.ArgumentParser(prog="kits.py")
    p.add_argument("--out", default="assets/external/kits")
    p.add_argument("--licences", default=None, help="LICENSES/vendors, to save the licence texts")
    p.add_argument("--date", default=datetime.date.today().isoformat())
    a = p.parse_args()
    os.makedirs(a.out, exist_ok=True)
    if a.licences:
        os.makedirs(a.licences, exist_ok=True)
    fetch_kenney(a.out, a.licences, a.date)
    fetch_polyhaven(a.out, a.licences, a.date)


if __name__ == "__main__":
    main()
