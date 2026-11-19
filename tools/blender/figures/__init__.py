"""The figure rig's constants and pure helpers (round 11, F1; plan v2 4.4, docs/round12/sprite-world.md).

No bpy here, so `tests/test_figures.py` runs under plain Python. `render_figures.py` is the Blender side.

A figure is one character GLB of `models/models.lock.json` rendered to the cells, pivots and keys of today's packed
character atlas (SPRITES 1, 10.3): 128 px display cells with the feet at row 112 under `IsoCam`, halved to 64 px
packed (feet at 56) by `tools/sprites` `pixel --finish off`, packed by `pack.ts` as `char/<lookId>/<anim>/<dir>/<nnn>`.
Two clips: the model's walk, and an idle taken from the walk's standing frame with a slow breath (A616 Q3).
"""

from __future__ import annotations

import json
import math
import os
import re
import struct

HERE = os.path.dirname(os.path.abspath(__file__))
LOOKS_JSON = os.path.join(HERE, "..", "..", "..", "packages", "content", "data", "looks.json")

# The figure clips: (frames, loop). The walk keeps the round-8 table's 8 frames (rig_common.R8_CLIPS). The idle is
# one breath over IDLE_FRAMES at 12 fps (2 s); the round-8 idle's 6 frames would make a breath of half a second.
# A breath is symmetric, so frame k and IDLE_FRAMES - k render the same pose and the packer stores them once.
IDLE_FRAMES = 24
FIGURE_CLIPS = {"idle": (IDLE_FRAMES, True), "walk": (8, True)}

# How far the chest rises at the top of a breath, metres before the 0.75 character root: 0.7 display px, a third
# of a packed pixel, which the 2 x 2 box halve keeps as a soft shift of the shoulders and head.
BREATH_LIFT_M = 0.016

# The tallest a figure stands, crown and hat included, in true metres (SPRITES 1: the figure is 1.7 m and nothing rises
# above the crown by more than about 0.05 m, so the 112 px cap keeps a few rows for the walk's bob and a lean). A
# taller model is shrunk to it whole; a shorter one keeps its height, so the deck's figures keep their differences.
MAX_HEIGHT_M = 1.75

# The least display rows between the figure's highest projected vertex and the cell's top, in any pose and direction
# (probe_cap.py's limit): a hat brim's far end or a lean away from the camera lifts on screen by half its depth, which
# the standing height alone does not see.
HEADROOM_ROWS = 3.0

# The sun (A616 Q4): CL3a's direction at the default heading, 25 degrees up, turned 45 degrees clockwise (seen from
# above) from today's key (rig_common.KEY_LIGHT: camera azimuth 225, which is world azimuth 180).
SUN_ELEVATION_DEG = 25.0
SUN_TURN_DEG = 45.0
SUN_STRENGTH = 3.0
SUN_ANGLE_DEG = 4.0  # a soft sun: the edge of a self-shadow (an arm over the coat) blurs over about a pixel
SUN_COLOR = "#FFF1DC"  # the key's warm white
AMBIENT_COLOR = "#D9D2C2"  # bone: the sky fill that keeps the faces turned from the sun readable, not tinted
AMBIENT_STRENGTH = 0.45
SAMPLES = 64  # Cycles samples a pixel; at 128 px a frame takes about 0.15 s on a CPU

# The model's facing in Blender after the glTF import: glTF's +Z front becomes -Y. The rig's turntable expects a
# figure facing +Y (SPRITES 10.3: +Y renders as `ne`), so a -Y figure is turned half a turn on its holder.
FORWARD_TURN = {"-Y": math.pi, "+Y": 0.0, "+X": math.pi / 2, "-X": -math.pi / 2}

# A walk clip is found by name; the Higgsfield clip is `Armature|Casual_Walk|baselayer`, the Meshy one `Walking`.
WALK_RE = re.compile(r"walk", re.IGNORECASE)
# The shortest cycle the period search accepts, in scene frames (a quarter second at 24 fps).
MIN_PERIOD = 6
# A lag is a cycle when the pose there differs from the pose a lag earlier by less than this share of the pose's
# spread over the clip (both squared). The Higgsfield walks are captured, not looped by hand: their best lag, 33
# frames, still differs by 4 %; half a cycle on, the stride is mirrored and differs by over 300 %.
PERIOD_TOLERANCE = 0.1


def sun_world_azimuth(key_camera_azimuth: float = 225.0, camera_yaw: float = 45.0) -> float:
    """World bearing (clockwise from +Y) towards the sun: the key's world bearing turned SUN_TURN_DEG clockwise."""
    return (key_camera_azimuth - camera_yaw + SUN_TURN_DEG) % 360.0


def toward(azimuth_deg: float, elevation_deg: float) -> tuple[float, float, float]:
    """Unit vector from the origin towards a light at this world bearing and elevation."""
    az, el = math.radians(azimuth_deg), math.radians(elevation_deg)
    return (math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el))


def fit_scale(height_m: float, max_height_m: float = MAX_HEIGHT_M) -> float:
    """The uniform scale that brings a figure of this standing height under the cap: 1 when it already fits."""
    if height_m <= 0.0:
        raise ValueError("a figure has a height")
    return 1.0 if height_m <= max_height_m else round(max_height_m / height_m, 6)


def screen_fit_scale(top_up_m: float, headroom_rows: float = HEADROOM_ROWS, feet_row: float = 112.0,
                     px_per_m: float = 90.51) -> float:
    """The uniform scale (about the feet) that keeps the highest projected point, `top_up_m` metres along the camera's
    up axis from the feet, `headroom_rows` display rows under the cell's top: 1 when it already does."""
    room = (feet_row - headroom_rows) / px_per_m
    return 1.0 if top_up_m <= room else round(room / top_up_m, 6)


def find_period(samples: list[list[float]], tolerance: float = PERIOD_TOLERANCE,
                min_lag: int = MIN_PERIOD) -> float | None:
    """The cycle length, in samples, of a looping clip sampled once a frame: the first lag at or past `min_lag`
    whose mean squared pose difference is a local minimum under `tolerance` of the pose spread, refined between its
    neighbours by a parabola (a captured cycle is rarely a whole number of frames). A clip that holds one cycle has
    no such lag inside it: None, and the whole clip is the cycle (its last key repeats its first)."""
    n = len(samples)
    if n < 2:
        raise ValueError("a clip needs at least two samples")
    dims = len(samples[0])
    mean = [sum(s[d] for s in samples) / n for d in range(dims)]
    spread = sum((s[d] - mean[d]) ** 2 for s in samples for d in range(dims)) / n
    if spread == 0.0:
        return None

    def err(lag: int) -> float:
        pairs = n - lag
        return sum((samples[t + lag][d] - samples[t][d]) ** 2 for t in range(pairs) for d in range(dims)) / pairs

    # A lag must leave half a cycle of overlap to be measured; past that the clip is a single cycle.
    lags = range(min_lag, (n + 1) // 2 + 1)
    errs = {lag: err(lag) for lag in range(min_lag, (n + 1) // 2 + 2) if lag < n}
    for lag in lags:
        e = errs.get(lag)
        if e is None or e > tolerance * spread:
            continue
        before, after = errs.get(lag - 1, math.inf), errs.get(lag + 1, math.inf)
        if e <= before and e <= after:
            curve = before - 2.0 * e + after
            if math.isinf(curve) or curve <= 0.0:
                return float(lag)
            return round(lag + 0.5 * (before - after) / curve, 4)
    return None


def pick_standing(spreads: list[float]) -> int:
    """The index of the walk sample that reads as standing: the feet closest together along the stride (the
    smallest spread of the low vertices along the walk axis). Ties go to the earliest."""
    if not spreads:
        raise ValueError("no samples")
    return min(range(len(spreads)), key=lambda i: (round(spreads[i], 6), i))


def walk_times(start: float, period: float, frames: int) -> list[float]:
    """Scene times of a loop's frames: `frames` even steps over one period from `start`, the last before the end."""
    return [round(start + period * k / frames, 4) for k in range(frames)]


def breath(k: int, frames: int = IDLE_FRAMES) -> float:
    """The breath at idle frame k, 0 (out) to 1 (in): a raised cosine, so k and frames - k are the same pose."""
    return round(0.5 - 0.5 * math.cos(2.0 * math.pi * k / frames), 6)


def load_looks(path: str = LOOKS_JSON) -> set[str]:
    """Every look id a figure may render under: the deck looks that have a world character, the villager family and
    the extra figures. A cover card (`bodyAtlas` null: the killer, the accomplice, the drifter) is never a world
    character, so it is never a figure: an atlas under its id would tell every client a cover is in play (A49)."""
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    deck = {k for k, v in data["looks"].items() if v.get("bodyAtlas")}
    return deck | set(data.get("villagers", {})) | set(data.get("figures", {}))


def cover_looks(path: str = LOOKS_JSON) -> set[str]:
    """The deck looks with no world character (the cover cards)."""
    with open(path, encoding="utf-8") as fh:
        return {k for k, v in json.load(fh)["looks"].items() if not v.get("bodyAtlas")}


def check_look(look: str, looks: set[str] | None = None) -> str:
    """The look id, or ValueError when it is a cover card or looks.json has no such look (a model without a look id
    is a named gap, F2)."""
    if look in cover_looks():
        raise ValueError(f"{look!r} is a cover card: it has no world character and is never rendered as a figure")
    looks = load_looks() if looks is None else looks
    if look not in looks:
        raise ValueError(f"no look {look!r} in looks.json; a model without a look id is a named gap")
    return look


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
# Text chunks: Cycles writes its render and sync times into them whatever the stamp settings, so two runs of the
# same frame differ in bytes, never in pixels.
TEXT_CHUNKS = (b"tEXt", b"zTXt", b"iTXt")


def strip_text_chunks(data: bytes) -> bytes:
    """A PNG's bytes without its text chunks; every other chunk is kept as it is, the pixels untouched."""
    if data[:8] != PNG_SIGNATURE:
        raise ValueError("not a PNG")
    out, pos = [data[:8]], 8
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos:pos + 4])
        end = pos + 12 + length
        if end > len(data):
            raise ValueError("a PNG chunk runs past the end of the file")
        if data[pos + 4:pos + 8] not in TEXT_CHUNKS:
            out.append(data[pos:end])
        pos = end
    return b"".join(out)
