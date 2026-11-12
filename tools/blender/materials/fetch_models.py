"""Fetch the locked Poly Haven models into the git-ignored cache, checking every hash (the 3D wild scenes' props).

    python3 tools/blender/materials/fetch_models.py [--slugs rock_07,fern_02]   # fetch (the default command)
    python3 tools/blender/materials/fetch_models.py lock      # rebuild polyhaven_models.lock.json from the API
    python3 tools/blender/materials/fetch_models.py credits   # the CREDITS.md rows of the lock

A model is one main file, the 1k `.gltf` (or the 1k `.blend` where the glTF drops an alpha or opacity map: the
alpha-card plants and the lantern's glass), plus every file the API lists as its `include` (`<slug>.bin`,
`textures/...`). They are cached under `.cache/polyhaven_models/<slug>/` at the include's own relative path, so the
main file finds them; `model_path(slug)` names the main file. The models keep their scanned textures, as the Meshy
models keep theirs.

The lock records, per model, the API's name, authors, size in mm and `polycount`, and `triangles`: the 1k glTF's own
meshes counted (`pieces`, per mesh node). The two differ where the API sums every LOD (`lods`) or counts a whole
geometry-nodes scatter (`geonodes`); `triangles` is what one placed copy costs (the glTF's LOD0, unscattered).

Stdlib only, the same rules as `fetch.py`: downloads carry the user agent `who-did-it-build`; a cached file with the
locked md5 is kept, one with another hash is fetched again; a download whose hash does not match the lock is
deleted and the run fails.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from dataclasses import dataclass

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch  # noqa: E402
import roles  # noqa: E402

API = fetch.API
LOCK_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "polyhaven_models.lock.json")
CACHE_DIR = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".cache",
                                          "polyhaven_models"))
MODEL_RESOLUTION = "1k"
FORMATS = {"gltf": "glTF", "blend": ".blend"}  # the API's format key -> its name in the credits


@dataclass(frozen=True)
class Model:
    format: str  # a key of FORMATS (the file extension too)
    use: str


MODELS: dict[str, Model] = {
    # the woods (Gallows Wood, The Fenwood)
    "rock_moss_set_01": Model("gltf", "forest outcrops (six mossy boulders up to 2.7 m)"),
    "rock_moss_set_02": Model("gltf", "forest boulders (seven smaller mossy rocks)"),
    "rock_face_01": Model("gltf", "rock faces: the woods' ridges, the rock round the Tin Gallery mouth"),
    "rock_face_02": Model("gltf", "smaller rock faces: outcrops, the sea-door cliff"),
    "tree_stump_01": Model("gltf", "stumps on the trails and in the clearings"),
    "single_root": Model("gltf", "surface roots"),
    "dry_branches_medium_01": Model("gltf", "windfall brush and deadfall on the trails"),
    "fern_02": Model("blend", "frost-killed bracken, tinted brown; the .blend keeps the alpha cut-outs"),
    "grass_medium_02": Model("blend", "fen-margin grass; the .blend keeps the alpha and the dead-grass map"),
    "shrub_02": Model("blend", "undergrowth, sparingly; the .blend keeps the alpha cut-outs"),
    # the mine (the Tin Gallery mouth, the sea door, the Flooded Gallery)
    "rock_07": Model("gltf", "mine rubble: fallen roof stone, the ore heap"),
    "picke_dirty_01": Model("gltf", "the pick beside the dropped lamp"),
    "rusted_spade_01": Model("gltf", "the shovel in the broken-ore heap"),
    "wooden_lantern_01": Model("blend", "the dropped miner's lamp; the .blend keeps the glass opacity"),
}


def model(slug: str) -> Model:
    if slug not in MODELS:
        raise KeyError(f"unknown Poly Haven model {slug!r}; the models are {', '.join(sorted(MODELS))}")
    return MODELS[slug]


def main_file(slug: str) -> str:
    """The main file's name, as the API names it: `<slug>_1k.gltf` or `<slug>_1k.blend`."""
    return f"{slug}_{MODEL_RESOLUTION}.{model(slug).format}"


def model_path(slug: str, cache: str = CACHE_DIR, must_exist: bool = False) -> str:
    """Absolute cache path of a model's main file; its includes sit beside it at their own relative paths.

    With `must_exist`, a missing file raises FileNotFoundError naming the command that fetches it.
    """
    path = os.path.abspath(os.path.join(cache, slug, main_file(slug)))
    if must_exist and not os.path.exists(path):
        raise FileNotFoundError(f"{path} is missing; run `python3 tools/blender/materials/fetch_models.py "
                                f"--slugs {slug}`")
    return path


def include_parts(rel: str) -> list[str]:
    """The parts of a file's path relative to its model's folder; a path that could leave the folder is refused."""
    parts = rel.split("/")
    if "\\" in rel or ":" in rel or any(p in ("", ".", "..") for p in parts):
        raise ValueError(f"unsafe file path {rel!r} in a model's file list")
    return parts


def cache_file(slug: str, rel: str, cache: str = CACHE_DIR) -> str:
    return os.path.join(cache, slug, *include_parts(rel))


# ---------------------------------------------------------------- fetching


def fetch_models(slug_list: list[str], cache: str = CACHE_DIR, lock_path: str = LOCK_FILE,
                 base_url: str | None = None, log=print) -> dict[str, int]:
    """Fetch every locked file of each model (main file and includes) unless cached with the locked md5."""
    lock = fetch.load_lock(lock_path)
    counts = {"kept": 0, "fetched": 0}
    for slug in slug_list:
        asset = lock["assets"].get(slug)
        if asset is None:
            raise SystemExit(f"{slug} is not in the models lock; run `fetch_models.py lock`")
        for rel, entry in sorted(asset["files"].items()):
            how = fetch.fetch_file({**entry, "file": rel}, cache_file(slug, rel, cache), base_url)
            counts[how] += 1
            if how == "fetched":
                log(f"models: {slug} {rel}")
    return counts


# ---------------------------------------------------------------- the lock


def gltf_pieces(doc: dict) -> dict[str, int]:
    """Triangles per mesh node of a glTF document."""
    accessors, meshes = doc.get("accessors", []), doc.get("meshes", [])
    pieces: dict[str, int] = {}
    for i, node in enumerate(doc.get("nodes", [])):
        if "mesh" not in node:
            continue
        tris = 0
        for prim in meshes[node["mesh"]]["primitives"]:
            idx = prim.get("indices")
            n = accessors[idx if idx is not None else prim["attributes"]["POSITION"]]["count"]
            mode = prim.get("mode", 4)
            tris += n // 3 if mode == 4 else max(n - 2, 0) if mode in (5, 6) else 0
        name = node.get("name") or f"node{i}"
        pieces[name] = pieces.get(name, 0) + tris
    return dict(sorted(pieces.items()))


def lock_model(slug: str, api: str = API, base_url: str | None = None) -> dict:
    """One model's lock entry from the API: name, authors, size in mm, triangles, the main file and its includes."""
    fmt = model(slug).format
    files = json.loads(fetch.get(f"{api}/files/{slug}"))
    info = json.loads(fetch.get(f"{api}/info/{slug}"))
    try:
        main = files[fmt][MODEL_RESOLUTION][fmt]
    except KeyError:
        raise SystemExit(f"{slug}: the API lists no {MODEL_RESOLUTION} {fmt}") from None
    name = main["url"].rsplit("/", 1)[-1]
    if name != main_file(slug):
        raise SystemExit(f"{slug}: the API's {fmt} is {name}, not {main_file(slug)}")
    locked = {name: {"md5": main["md5"], "size": main["size"], "url": main["url"]}}
    for rel, inc in sorted(main.get("include", {}).items()):
        include_parts(rel)
        locked[rel] = {"md5": inc["md5"], "size": inc["size"], "url": inc["url"]}
    # The 1k glTF's own meshes, counted (only its small JSON is read; for a .blend model it is not kept).
    g = files["gltf"][MODEL_RESOLUTION]["gltf"]
    raw = fetch.get(fetch.rebase(g["url"], base_url))
    if hashlib.md5(raw).hexdigest() != g["md5"]:
        raise fetch.HashMismatch(f"{slug}: the 1k glTF does not match the API's md5 {g['md5']}")
    pieces = gltf_pieces(json.loads(raw))
    return {"source": "polyhaven", "type": "model", "name": info["name"], "authors": info["authors"],
            "dimensionsMm": [round(d) for d in info["dimensions"]], "polycount": info["polycount"],
            "lods": bool(info.get("lods")), "geonodes": bool(info.get("geonodes")),
            "triangles": sum(pieces.values()), "pieces": pieces,
            "format": fmt, "res": MODEL_RESOLUTION, "main": name, "files": locked}


def write_lock(slug_list: list[str] | None = None, path: str = LOCK_FILE, api: str = API,
               base_url: str | None = None, log=print) -> dict:
    """Lock `slug_list` from the API, keeping the lock's other models; with no list, rebuild it from MODELS."""
    if slug_list is None or not os.path.exists(path):
        lock = {"version": fetch.LOCK_VERSION, "userAgent": roles.USER_AGENT, "sources": fetch.SOURCE, "assets": {}}
    else:
        lock = fetch.load_lock(path)
    for slug in sorted(MODELS) if slug_list is None else slug_list:
        entry = lock["assets"][slug] = lock_model(slug, api, base_url)
        size = sum(f["size"] for f in entry["files"].values())
        log(f"lock: {slug} ({entry['format']}, {len(entry['files'])} files, {size / 1e6:.2f} MB, "
            f"{entry['triangles']} triangles)")
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(fetch.dump_lock(lock))
    return lock


def credits_rows(lock: dict) -> list[str]:
    """One CREDITS.md row per locked model: slug, title, authors, URL, licence, the file taken, its use."""
    rows = []
    for slug, a in sorted(lock["assets"].items()):
        authors = ", ".join(sorted(a["authors"]))
        source = lock["sources"][a["source"]]
        use = MODELS[slug].use if slug in MODELS else ""
        rows.append(f"| `{slug}` | {a['name']} | {authors} | {source['site']}/a/{slug} | {source['licence']} "
                    f"| {a['res']} {FORMATS[a['format']]} | {use} |")
    return rows


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="fetch_models.py", description=__doc__.split("\n\n")[0])
    p.add_argument("command", nargs="?", default="fetch", choices=("fetch", "lock", "credits"))
    p.add_argument("--slugs", help="comma list of model slugs (default: every model in MODELS)")
    p.add_argument("--cache", default=CACHE_DIR)
    p.add_argument("--lock", default=LOCK_FILE)
    p.add_argument("--base-url", help="fetch from this origin instead of the locked urls (tests)")
    p.add_argument("--api", default=API, help="the Poly Haven API origin (`lock`)")
    a = p.parse_args(argv)
    slug_list = a.slugs.split(",") if a.slugs else None
    for slug in slug_list or []:
        model(slug)
    if a.command == "lock":
        write_lock(slug_list, a.lock, a.api, a.base_url)
        return
    if a.command == "credits":
        print("\n".join(credits_rows(fetch.load_lock(a.lock))))
        return
    counts = fetch_models(slug_list or sorted(MODELS), a.cache, a.lock, a.base_url)
    print(f"models: {counts['fetched']} fetched, {counts['kept']} already in {a.cache}")


if __name__ == "__main__":
    main()
