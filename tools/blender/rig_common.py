"""Constants and pure helpers shared by the rig scripts (docs/ASSETS.md 6.2, docs/SPRITES.md).

No bpy import here, so the unit tests run under plain Python.
"""

from __future__ import annotations

import math
import re

# docs/SPRITES.md 1: clockwise from screen up; index i sets TT.rotation_euler.z = -i * 45 deg.
DIRECTIONS = ("n", "ne", "e", "se", "s", "sw", "w", "nw")

ANIMS = ("idle", "walk", "run", "interact", "swing", "carry", "die", "hide")

# V1 clips and frame counts (docs/ASSETS.md 6.3).
V1_CLIPS = {"idle": 8, "walk": 8, "swing": 6, "die": 8}

PASSES = ("body", "scarf", "hat_cap", "hat_bowler", "blood")

FRAME_RE = re.compile(
    r"^char_(\w+)_(idle|walk|run|interact|swing|carry|die|hide)_(n|ne|e|se|s|sw|w|nw)_(\d{3})$"
)
BODY_RE = re.compile(r"^[a-z][a-z0-9]*$")

CELL_PX = 128
TILE_PX = 64
OUTPUT_FPS = 12

# Tilted camera: X = 40 deg, Z = 0. Orthographic scale gives 64 px per metre in a 128 px cell.
CAMERA_TILT_DEG = 40.0
CAMERA_ORTHO_SCALE = CELL_PX / TILE_PX  # 2.0 m across the cell
# The world origin (the Feet empty) lands this many pixels from the top of the cell.
FEET_ROW_PX = 112

# Clips that need a bigger cell, as (cell px, feet row px). A body falling towards the camera spans
# about 90 px below the feet, so die renders 256 px cells with the feet at the centre; the scale stays
# 64 px per metre. The packer trims every frame and the per-frame Feet pivot keeps clips registered.
CLIP_CELL = {"die": (256, 128)}

# Inverted-hull outline thickness per asset class, metres (Solidify thickness).
OUTLINE_PRESETS = {"character": -0.02, "prop64": -0.035}

# Toon ramp (Constant interpolation) and rim (Layer Weight blend). The ramp sees the luma of the lit
# diffuse, about 0.87 x N.L of the key (3 / pi for a strength-3 sun, times the key colour's luma) plus a
# little fill: measured 0.35 on a camera-facing face and 0.77 on a top face or the ground. At 0.42 / 0.78
# both sat just under a stop (front faces in the shadow band, tops and ground in the mid band).
TOON_RAMP_STOPS = (0.30, 0.70)
TOON_RIM_BLEND = 0.35

# Azimuth is clockwise from world +Y (screen up). The key comes from the camera side, screen left
# (225 deg); 315 deg, the first draft, put every camera-facing surface in the shadow band.
KEY_LIGHT = {"azimuth": 225.0, "elevation": 55.0, "strength": 3.0, "color": "#FFF1DC"}
FILL_LIGHT = {"azimuth": 45.0, "elevation": 55.0, "strength": 0.6, "color_token": "moon", "size": 12.0, "distance": 30.0}
# Area-light watts per metre squared of distance that give the irradiance of a strength-1 sun.
# Measured with Blender 5.2 EEVEE (a diffuse plane lit head-on by each light): 220 W at 10 m ~ sun 0.6.
AREA_WATTS_PER_SUN_M2 = 3.67
WORLD_STRENGTH = 0.15

# docs/ASSETS.md 6.1; machine copy in packages/content/data/palette.json.
PALETTE = {
    "ink": "#12141C",
    "slate": "#2C3240",
    "fog": "#6F7A8C",
    "bone": "#D9D2C2",
    "mustard": "#F2B33D",
    "teal": "#2EC4B6",
    "magenta": "#E04E9A",
    "blood": "#B3121F",
    "lantern": "#FFB457",
    "moon": "#7FA8FF",
}

# Toon bands for a palettized flat colour: mid token -> (light, shadow). Shadows lean to slate or
# ink, never black (docs/ASSETS.md 6.1).
SHADES = {
    "ink": ("slate", "ink"),
    "slate": ("fog", "ink"),
    "fog": ("bone", "slate"),
    "bone": ("bone", "fog"),
    "mustard": ("lantern", "slate"),
    "teal": ("teal", "slate"),
    "magenta": ("magenta", "slate"),
    "blood": ("blood", "ink"),
    "lantern": ("lantern", "mustard"),
    "moon": ("moon", "slate"),
}


def frame_name(body: str, anim: str, direction: str, index: int) -> str:
    """Build a frame name that matches FRAME_RE, or raise ValueError."""
    if not BODY_RE.match(body):
        raise ValueError(f"body id {body!r} must match {BODY_RE.pattern}")
    if anim not in ANIMS:
        raise ValueError(f"unknown anim {anim!r}")
    if direction not in DIRECTIONS:
        raise ValueError(f"unknown direction {direction!r}")
    if not 0 <= index <= 999:
        raise ValueError(f"frame index {index} out of range")
    name = f"char_{body}_{anim}_{direction}_{index:03d}"
    assert FRAME_RE.match(name)
    return name


def turntable_z(direction_index: int) -> float:
    """TT.rotation_euler.z in radians for direction index 0..7."""
    return math.radians(-45.0 * direction_index)


def frame_step(scene_fps: float, output_fps: int = OUTPUT_FPS) -> int:
    """Whole-frame step that samples a clip at the output rate."""
    step = round(scene_fps / output_fps)
    if step < 1 or abs(scene_fps / step - output_fps) > 0.01:
        raise ValueError(f"scene fps {scene_fps} is not a whole multiple of {output_fps}")
    return step


def sample_frames(start: int, end: int, step: int) -> list[int]:
    """Scene frames to render for an action range [start, end), end exclusive for loops."""
    return list(range(start, end, step))


def hex_to_rgb(hex_colour: str) -> tuple[float, float, float]:
    """sRGB hex to 0..1 floats (display space)."""
    h = hex_colour.lstrip("#")
    return tuple(int(h[i : i + 2], 16) / 255.0 for i in (0, 2, 4))  # type: ignore[return-value]


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def linear_to_srgb(c: float) -> float:
    c = min(max(c, 0.0), 1.0)
    return c * 12.92 if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def hex_to_linear(hex_colour: str) -> tuple[float, float, float, float]:
    """Hex to linear RGBA, the space Blender stores colour sockets in."""
    r, g, b = (srgb_to_linear(c) for c in hex_to_rgb(hex_colour))
    return (r, g, b, 1.0)


def nearest_palette(rgb: tuple[float, float, float]) -> str:
    """Token of the palette entry nearest to an sRGB 0..1 colour (squared distance)."""
    best, best_d = "", math.inf
    for token, hex_colour in PALETTE.items():
        pr, pg, pb = hex_to_rgb(hex_colour)
        d = (rgb[0] - pr) ** 2 + (rgb[1] - pg) ** 2 + (rgb[2] - pb) ** 2
        if d < best_d:
            best, best_d = token, d
    return best


def light_direction(azimuth_deg: float, elevation_deg: float) -> tuple[float, float, float]:
    """Unit vector from the origin towards the light; azimuth is clockwise from world +Y."""
    az, el = math.radians(azimuth_deg), math.radians(elevation_deg)
    return (math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el))


def clip_cell(anim: str) -> tuple[int, int]:
    """(cell px, feet row px) for a clip."""
    return CLIP_CELL.get(anim, (CELL_PX, FEET_ROW_PX))


def camera_shift_y(feet_row_px: float, cell: int = CELL_PX) -> float:
    """Camera shift_y that puts the origin on feet_row_px in a square cell of `cell` px.

    The unshifted camera puts the origin (FEET_ROW_PX - CELL_PX / 2) px below the cell centre.
    """
    unshifted = cell / 2 + (FEET_ROW_PX - CELL_PX / 2)
    return -(unshifted - feet_row_px) / cell


def feet_pixels(u: float, v: float, cell: int = CELL_PX) -> tuple[float, float]:
    """Normalised camera-view coords (v up) to cell pixels from the top-left corner."""
    return (round(u * cell, 2), round((1.0 - v) * cell, 2))
