"""Fetch the locked Poly Haven files into the git-ignored cache, checking every hash (docs/round8/art.md 5).

    python3 tools/blender/materials/fetch.py [--roles wood_plank,plaster] [--style hd | --res 1k,2k] [--maps diff,nor_gl,rough]
    python3 tools/blender/materials/fetch.py lock      # rebuild polyhaven.lock.json from the API for every role's slug
    python3 tools/blender/materials/fetch.py credits   # the CREDITS.md rows of the lock

A run without `--roles` or `--slugs` also fetches the HDRIs of `roles.HDRIS` (the PBR finish's sky, `pbr.py`),
unless `--style` names a style that does not read them (8-bit, low poly).

Stdlib only. Downloads carry the user agent `who-did-it-build` (the API's one ask). A file already in the cache
with the locked md5 is kept; one with another hash is fetched again; a download whose hash does not match the
lock is deleted and the run fails. Nothing here is called at render time beyond a missing file.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import roles  # noqa: E402

API = "https://api.polyhaven.com"
SOURCE = {"polyhaven": {"api": API, "site": "https://polyhaven.com", "licence": "CC0-1.0",
                        "licenceUrl": "https://polyhaven.com/license"}}
LOCK_VERSION = 1


class HashMismatch(Exception):
    """A fetched file does not match the lock."""


def get(url: str, timeout: float = 120.0) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": roles.USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def md5_of(path: str) -> str:
    h = hashlib.md5()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_lock(path: str = roles.LOCK_FILE) -> dict:
    with open(path, encoding="utf-8") as fh:
        lock = json.load(fh)
    if lock.get("version") != LOCK_VERSION:
        raise SystemExit(f"{path}: lock version {lock.get('version')!r}, expected {LOCK_VERSION}")
    return lock


def rebase(url: str, base_url: str | None) -> str:
    """The same path under another origin (the tests' fake server)."""
    if not base_url:
        return url
    parts = urllib.parse.urlsplit(url)
    return base_url.rstrip("/") + parts.path + (f"?{parts.query}" if parts.query else "")


def wanted(lock: dict, slug_list: list[str], res_list: list[str], map_list: list[str]) -> list[tuple[str, str, str, dict]]:
    """(slug, res, map, entry) for every locked file asked for; an unlocked slug or map is an error."""
    out = []
    for slug in slug_list:
        asset = lock["assets"].get(slug)
        if asset is None:
            raise SystemExit(f"{slug} is not in the lock; run `fetch.py lock`")
        for res in res_list:
            for m in map_list:
                try:
                    out.append((slug, res, m, asset["files"][res][m]))
                except KeyError:
                    raise SystemExit(f"{slug}: no {m} at {res} in the lock") from None
    return out


def fetch_file(entry: dict, dest: str, base_url: str | None = None) -> str:
    """Fetch one locked file to `dest` unless it is already there with the locked hash. Returns `kept`, `fetched`."""
    if os.path.exists(dest):
        if md5_of(dest) == entry["md5"]:
            return "kept"
        os.remove(dest)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    data = get(rebase(entry["url"], base_url))
    digest = hashlib.md5(data).hexdigest()
    if digest != entry["md5"]:
        raise HashMismatch(f"{entry['file']}: fetched md5 {digest}, lock says {entry['md5']}")
    tmp = dest + ".part"
    with open(tmp, "wb") as fh:
        fh.write(data)
    os.replace(tmp, dest)
    return "fetched"


def fetch(slug_list: list[str], res_list: list[str], map_list: list[str], cache: str = roles.CACHE_DIR,
          lock_path: str = roles.LOCK_FILE, base_url: str | None = None, log=print) -> dict[str, int]:
    lock = load_lock(lock_path)
    counts = {"kept": 0, "fetched": 0}
    for slug, res, m, entry in wanted(lock, slug_list, res_list, map_list):
        how = fetch_file(entry, os.path.join(cache, slug, entry["file"]), base_url)
        counts[how] += 1
        if how == "fetched":
            log(f"materials: {slug} {m} {res}")
    return counts


# ---------------------------------------------------------------- the lock


def lock_asset(slug: str, api: str = API) -> dict:
    """One asset's lock entry from the API: name, authors, size in mm and every map at every resolution."""
    files = json.loads(get(f"{api}/files/{slug}"))
    info = json.loads(get(f"{api}/info/{slug}"))
    api_map = {"diff": "Diffuse", "nor_gl": "nor_gl", "rough": "Rough"}
    entry: dict = {"source": "polyhaven", "type": "texture", "name": info["name"], "authors": info["authors"],
                   "dimensionsMm": [round(d) for d in info["dimensions"]], "files": {}}
    for res in roles.RESOLUTIONS:
        entry["files"][res] = {}
        for m, key in api_map.items():
            f = files[key][res]["jpg"]
            # `file` is the cache name (`<slug>_<map>_<res>.jpg`); the API's own name (`_albedo_` on some) stays in `url`.
            entry["files"][res][m] = {"file": roles.texture_file(slug, m, res), "md5": f["md5"], "size": f["size"],
                                      "url": f["url"]}
    return entry


def lock_hdri(slug: str, api: str = API) -> dict:
    """One HDRI's lock entry from the API: name, authors and the `.hdr` at `roles.HDRI_RESOLUTION`."""
    files = json.loads(get(f"{api}/files/{slug}"))
    info = json.loads(get(f"{api}/info/{slug}"))
    res = roles.HDRI_RESOLUTION
    f = files["hdri"][res]["hdr"]
    return {"source": "polyhaven", "type": "hdri", "name": info["name"], "authors": info["authors"],
            "files": {res: {"hdr": {"file": roles.hdri_file(slug, res), "md5": f["md5"], "size": f["size"],
                                    "url": f["url"]}}}}


def hdri_slugs() -> list[str]:
    return sorted(set(roles.HDRIS.values()))


def write_lock(path: str = roles.LOCK_FILE, api: str = API, log=print) -> dict:
    lock = {"version": LOCK_VERSION, "userAgent": roles.USER_AGENT, "sources": SOURCE, "assets": {}}
    for slug in roles.slugs():
        lock["assets"][slug] = lock_asset(slug, api)
        log(f"lock: {slug} ({', '.join(roles.roles_of(slug))})")
    for slug in hdri_slugs():
        lock["assets"][slug] = lock_hdri(slug, api)
        log(f"lock: {slug} (hdri)")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(dump_lock(lock))
    return lock


def dump_lock(lock: dict) -> str:
    """The lock as JSON, one line per asset header and per resolution, so a diff reads by file."""
    head = {k: v for k, v in lock.items() if k != "assets"}
    lines = [json.dumps(head, indent=1, ensure_ascii=False)[:-2].rstrip() + ",", ' "assets": {']
    for i, (slug, a) in enumerate(sorted(lock["assets"].items())):
        meta = json.dumps({k: v for k, v in a.items() if k != "files"}, ensure_ascii=False)
        lines.append(f'  {json.dumps(slug)}: {{{meta[1:-1]},')
        lines.append('   "files": {')
        for j, (res, maps) in enumerate(sorted(a["files"].items())):
            lines.append(f'    {json.dumps(res)}: {json.dumps(maps, ensure_ascii=False)}'
                         + ("," if j < len(a["files"]) - 1 else ""))
        lines.append("   }}" + ("," if i < len(lock["assets"]) - 1 else ""))
    lines += [" }", "}", ""]
    return "\n".join(lines)


def credits_rows(lock: dict) -> list[str]:
    """One CREDITS.md row per locked asset: slug, title, authors, roles, licence."""
    rows = []
    for slug, a in sorted(lock["assets"].items()):
        authors = ", ".join(sorted(a["authors"]))
        site = lock["sources"][a["source"]]["site"]
        uses = ", ".join(f"`{r}`" for r in roles.roles_of(slug))
        if a.get("type") == "hdri":
            uses = "the world fill of the PBR finish (`materials/pbr.py`)"
        rows.append(f"| `{slug}` | {a['name']} | {authors} | {site}/a/{slug} | {lock['sources'][a['source']]['licence']} "
                    f"| {uses} |")
    return rows


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="fetch.py", description=__doc__.split("\n\n")[0])
    p.add_argument("command", nargs="?", default="fetch", choices=("fetch", "lock", "credits"))
    p.add_argument("--roles", help="comma list of roles (default: every role)")
    p.add_argument("--slugs", help="comma list of slugs instead of roles")
    p.add_argument("--style", choices=sorted(roles.STYLE_RESOLUTION), help="the resolution that style reads")
    p.add_argument("--res", help="comma list of resolutions (default: every locked one)")
    p.add_argument("--maps", default=",".join(roles.MAPS), help="comma list of maps")
    p.add_argument("--cache", default=roles.CACHE_DIR)
    p.add_argument("--lock", default=roles.LOCK_FILE)
    p.add_argument("--base-url", help="fetch from this origin instead of the locked urls (tests)")
    p.add_argument("--api", default=API, help="the Poly Haven API origin (`lock`)")
    a = p.parse_args(argv)
    if a.command == "lock":
        write_lock(a.lock, a.api)
        return
    if a.command == "credits":
        print("\n".join(credits_rows(load_lock(a.lock))))
        return
    if a.slugs:
        slug_list = a.slugs.split(",")
    elif a.roles:
        slug_list = sorted({roles.role(r).slug for r in a.roles.split(",")})
    else:
        slug_list = roles.slugs()
    res_list = a.res.split(",") if a.res else [roles.STYLE_RESOLUTION[a.style]] if a.style else list(roles.RESOLUTIONS)
    counts = fetch(slug_list, res_list, a.maps.split(","), a.cache, a.lock, a.base_url)
    if not (a.slugs or a.roles) and a.style in (None, "hd"):
        more = fetch(hdri_slugs(), [roles.HDRI_RESOLUTION], ["hdr"], a.cache, a.lock, a.base_url)
        counts = {k: counts[k] + more[k] for k in counts}
    print(f"materials: {counts['fetched']} fetched, {counts['kept']} already in {a.cache}")


if __name__ == "__main__":
    main()
