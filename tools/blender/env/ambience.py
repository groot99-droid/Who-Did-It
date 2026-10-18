"""The ambient loops `amb_<biome>` (art plan 3.9, SPRITES 10.13): fetched CC0 sources, mastered with ffmpeg.

    python3 tools/blender/env/ambience.py --out apps/client/public/assets/audio [--src assets/external/audio]
        [--licences LICENSES/vendors]

Pure Python plus ffmpeg (no bpy). Each source is fetched once into git-ignored `assets/external/audio/`, then
cut to its loop length, mixed to mono, normalised to -18 LUFS with a -1 dBFS limiter, its first 2 s crossfaded
onto the tail so the loop has no seam, and encoded as Vorbis q5, as Session Y did for `storm`. With
`--licences` the page of each source (licence, author, date) is recorded under `LICENSES/vendors/`.
"""

from __future__ import annotations

import argparse
import datetime
import os
import subprocess
import urllib.request

# key -> (OpenGameArt page, file, author, upload date, seconds of the loop)
SOURCES = {
    "amb_village": ("https://opengameart.org/content/amb-outside-1",
                    "https://opengameart.org/sites/default/files/amb_outdoor1_loop.ogg",
                    "Kresiek The Furry", "2023-02-09", 40),
    "amb_house": ("https://opengameart.org/content/rain-gutter-loop",
                  "https://opengameart.org/sites/default/files/rain-gutter-loop_0.mp3",
                  "Ogrebane", "2013-04-13", 32),
    "amb_forest": ("https://opengameart.org/content/crickets-ambient-noise-loopable",
                   "https://opengameart.org/sites/default/files/crickets_1.mp3",
                   "Wolfgang_", "2021-09-03", 40),
    "amb_cave": ("https://opengameart.org/content/loopable-dungeon-ambience",
                 "https://opengameart.org/sites/default/files/dungeon_ambient_1_0.ogg",
                 "JaggedStone", "2017-03-11", 40),
}
XFADE_S = 2.0
LUFS = -18


def fetch(url: str, path: str) -> None:
    if os.path.exists(path):
        return
    req = urllib.request.Request(url, headers={"User-Agent": "who-did-it-ambience/1"})
    with urllib.request.urlopen(req, timeout=120) as r, open(path, "wb") as fh:
        fh.write(r.read())


def duration(path: str) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                         check=True, capture_output=True, text=True)
    return float(out.stdout.strip())


def master(src: str, dst: str, seconds: float) -> None:
    """Loop length L: take L + 2 s (looping the source if it is shorter), crossfade the head onto the tail."""
    total = seconds + XFADE_S
    tmp = dst + ".wav"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-stream_loop", "-1", "-i", src, "-t", str(total),
                    "-af", "aresample=44100", "-ac", "1", tmp], check=True)
    graph = (
        f"[0:a]atrim={XFADE_S}:{total},asetpts=N/SR/TB[body];"
        f"[1:a]atrim=0:{XFADE_S},asetpts=N/SR/TB[head];"
        f"[body][head]acrossfade=d={XFADE_S}:c1=tri:c2=tri,"
        f"loudnorm=I={LUFS}:TP=-1:LRA=11,alimiter=limit=0.89,aresample=44100[out]"
    )
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", tmp, "-i", tmp, "-filter_complex", graph, "-map", "[out]",
                    "-ac", "1", "-c:a", "libvorbis", "-q:a", "5", "-map_metadata", "-1", dst], check=True)
    os.remove(tmp)


def main() -> None:
    p = argparse.ArgumentParser(prog="ambience.py")
    p.add_argument("--out", default="apps/client/public/assets/audio")
    p.add_argument("--src", default="assets/external/audio")
    p.add_argument("--licences", default=None)
    p.add_argument("--date", default=datetime.date.today().isoformat())
    a = p.parse_args()
    os.makedirs(a.src, exist_ok=True)
    for key, (page, url, author, date, seconds) in SOURCES.items():
        src = os.path.join(a.src, os.path.basename(url))
        fetch(url, src)
        master(src, os.path.join(a.out, f"{key}.ogg"), seconds)
        print(f"ambience: {key} <- {os.path.basename(url)} ({seconds} s)")
    if a.licences:
        rows = "\n".join(f"- `{k}`: {page}, file `{os.path.basename(url)}` by {author}, uploaded {date}; licence CC0"
                         for k, (page, url, author, date, _) in SOURCES.items())
        with open(os.path.join(a.licences, f"opengameart-ambience-license-{a.date}.md"), "w") as fh:
            fh.write(f"Source: the OpenGameArt pages below, checked {a.date}\n\n"
                     "Each entry is published under CC0 1.0 Universal (https://creativecommons.org/publicdomain/zero/1.0/),"
                     " as its page's License(s) field states.\n\n" + rows + "\n")


if __name__ == "__main__":
    main()
