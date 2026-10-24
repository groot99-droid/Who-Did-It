"""Constants and pure helpers shared by the rig scripts (docs/ASSETS.md 6.2, docs/SPRITES.md).

No bpy import here, so the unit tests run under plain Python.
"""

from __future__ import annotations

import json
import math
import os
import re

# docs/SPRITES.md 1 and 10.4: clockwise from screen up (screen frame); index i sets
# TT.rotation_euler.z = 45 deg - i * 45 deg under IsoCam.
DIRECTIONS = ("n", "ne", "e", "se", "s", "sw", "w", "nw")

# Round 8 appends the clips of docs/round8/motion.md 1 (ids in seams.md 2), keeping the old order.
R8_ANIMS = ("strike", "hurt", "knockdown", "down", "getup", "limp", "stagger", "stunned", "inspect", "threaten",
            "cower", "fidget", "stomp", "eat", "rob")
ANIMS = ("idle", "walk", "run", "interact", "swing", "carry", "die", "hide", *R8_ANIMS)

# V1 clips and frame counts (docs/ASSETS.md 6.3, round 5): 38 frames x 8 directions = 304 per pass.
V1_CLIPS = {"idle": 8, "walk": 8, "swing": 6, "interact": 8, "die": 8}

# The four screen diagonals a 4-direction clip renders (6Z's budget ruling, round 8: one-shots and mood idles in
# four rendered directions, never mirrored). The client plays the nearest of the four.
FOUR_DIRS = ("ne", "se", "sw", "nw")


class Clip:
    """A clip's rendered frames, whether it loops, its directions and whether it sits on the lazy second page."""

    def __init__(self, frames: int, loop: bool, dirs: tuple[str, ...] = DIRECTIONS, lazy: bool = False):
        self.frames, self.loop, self.dirs, self.lazy = frames, loop, dirs, lazy

    def span(self) -> int:
        """Scene frames from the first key to the last at 24 fps sampled every 2: a loop's last key repeats its
        first and is not rendered, a one-shot renders its last key."""
        return 2 * self.frames if self.loop else 2 * (self.frames - 1)


# Round 8 clips (motion.md 1, the budget ruling of A141's open column): the V1 five, the gaits and `strike` and
# `hurt` in eight directions; the one-shots and mood idles in four; the rare clips on a lazy second page. The frame
# counts are the full plan sent to 6Z with the measured budget; a clip that the budget trims gets fewer frames
# here and nowhere else, since every key of build_looks.py is placed in normalised time.
R8_CLIPS: dict[str, Clip] = {
    "idle": Clip(8, True), "walk": Clip(8, True), "swing": Clip(6, False), "interact": Clip(8, True),
    "die": Clip(8, False),
    "run": Clip(8, True), "limp": Clip(8, True), "stagger": Clip(8, True),
    "strike": Clip(6, False), "hurt": Clip(4, False),
    "inspect": Clip(6, False, FOUR_DIRS), "cower": Clip(6, True, FOUR_DIRS), "fidget": Clip(6, True, FOUR_DIRS),
    "stomp": Clip(6, True, FOUR_DIRS), "stunned": Clip(6, True, FOUR_DIRS),
    "knockdown": Clip(6, False, FOUR_DIRS, lazy=True), "down": Clip(4, True, FOUR_DIRS, lazy=True),
    "getup": Clip(6, False, FOUR_DIRS, lazy=True), "rob": Clip(6, False, FOUR_DIRS, lazy=True),
    "eat": Clip(6, False, FOUR_DIRS, lazy=True), "threaten": Clip(6, False, FOUR_DIRS, lazy=True),
}

# Round 5: hats are nameplate glyphs, so the hat passes are gone (art plan 4.2).
PASSES = ("body", "scarf", "blood")

FRAME_RE = re.compile(r"^char_(\w+)_(" + "|".join(ANIMS) + r")_(n|ne|e|se|s|sw|w|nw)_(\d{3})$")
BODY_RE = re.compile(r"^[a-z][a-z0-9]*$")

CELL_PX = 128
TILE_PX = 64  # world px per metre (WORLD.md 4.2); the straight-down TileCam keeps 64 px per metre
OUTPUT_FPS = 12

# IsoCam (docs/SPRITES.md 10.3): orthographic, rotation X 60, Y 0, Z 45, so it looks north-west and
# down 30 deg. Every frame renders at the display scale, 90.51 px per ground metre (a 1 m tile is a
# 128 x 64 diamond); tools/sprites/pixel.ts finishes it to half that.
CAMERA_TILT_DEG = 60.0
CAMERA_YAW_DEG = 45.0
DISPLAY_PX_PER_M = 90.51
# Heights render at 0.75 of true scale (metrics.json iso.zScale): the environment root is scaled
# (1, 1, Z_SCALE), the character root Z_SCALE on every axis so figures keep their proportions.
Z_SCALE = 0.75
ENV_ROOT_SCALE = (1.0, 1.0, Z_SCALE)
CHAR_ROOT_SCALE = (Z_SCALE, Z_SCALE, Z_SCALE)
# The world origin (the Feet empty) lands this many pixels from the top of a 128 px cell.
FEET_ROW_PX = 112

# Clips that need a bigger cell, as (cell px, feet row px). A fallen body reaches about 115 display px
# to the side of the feet, so die and the knockout set (knockdown, down, getup; round 8) render 256 px cells with
# the feet at the centre; the scale stays
# the display scale. The packer trims every frame and the per-frame Feet pivot keeps clips registered.
CLIP_CELL = {"die": (256, 128), "knockdown": (256, 128), "down": (256, 128), "getup": (256, 128)}

# Inverted-hull outline thickness per asset class, metres (Solidify thickness).
# -0.022 m at the display scale lands on one art pixel after the 2 x 2 finish (art plan S3.3).
OUTLINE_PRESETS = {"character": -0.022, "prop64": -0.035}

# Toon ramp (Constant interpolation) and rim (Layer Weight blend). The ramp sees the luma of the lit
# diffuse, about 0.87 x N.L of the key plus a little fill. Re-measured under IsoCam (round 5, Blender 5.2
# EEVEE, tools/blender/README.md): tops and ground 0.77; the camera-facing wall the key reaches 0.49
# (world south face), both walls of a cube turned 45 deg 0.35; the wall turned from the key 0.02 (world
# east face, screen right). At 0.25 / 0.65 every class sits at least 0.10 from a stop: tops and ground in
# the light band, lit walls in the mid band, faces turned from the key in the shadow band.
TOON_RAMP_STOPS = (0.25, 0.65)
TOON_RIM_BLEND = 0.35

# Azimuth is clockwise from screen up, in the camera's frame: the lights are parented to the camera,
# so they turn with it (world_azimuth gives the world bearing). The key comes from the camera side,
# screen left (225 deg); 315 deg, the round-1 draft, put every camera-facing surface in the shadow band.
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
    """TT.rotation_euler.z in radians for screen direction index 0..7 under IsoCam (SPRITES 10.3).

    A figure facing Blender +Y (world north) renders as `ne`; turned +45 deg it faces screen up (`n`).
    """
    return math.radians(45.0 - 45.0 * direction_index)


def ortho_scale(width_px: float) -> float:
    """IsoCam ortho_scale for an output `width_px` wide at the display scale."""
    return width_px / DISPLAY_PX_PER_M


def world_azimuth(camera_azimuth_deg: float) -> float:
    """World bearing (clockwise from world +Y) of a camera-frame azimuth (clockwise from screen up).

    IsoCam's Z = +45 deg turns its view from world north to north-west, i.e. 45 deg anticlockwise.
    """
    return (camera_azimuth_deg - CAMERA_YAW_DEG) % 360.0


def display_px_per_vertical_m() -> float:
    """Screen px per true vertical metre of a figure under the character root (about 59, SPRITES 10.3)."""
    return DISPLAY_PX_PER_M * math.sin(math.radians(CAMERA_TILT_DEG)) * Z_SCALE


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


# ---------------------------------------------------------------- world palette (art plan S3)

_PALETTE_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "packages", "content",
                             "data", "palette.json")


def _load_world_ramps() -> dict[str, tuple[str, ...]]:
    with open(_PALETTE_JSON, encoding="utf-8") as fh:
        ramps = json.load(fh)["world"]["ramps"]
    return {name: tuple(c.upper() for c in steps) for name, steps in ramps.items()}


# The 16 named ramps of palette.json `world`, each dark to light; 64 distinct colours in all.
WORLD_RAMPS: dict[str, tuple[str, ...]] = _load_world_ramps()
WORLD: tuple[str, ...] = tuple(dict.fromkeys(c for steps in WORLD_RAMPS.values() for c in steps))


def srgb_to_oklab(rgb: tuple[float, float, float]) -> tuple[float, float, float]:
    """sRGB 0..1 to OKLab (the space tools/sprites/oklab.ts snaps in)."""
    r, g, b = (srgb_to_linear(c) for c in rgb)
    l_ = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
    m_ = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
    s_ = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3)
    return (
        0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
        1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
        0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
    )


_WORLD_LAB = {c: srgb_to_oklab(hex_to_rgb(c)) for c in WORLD}


def nearest_world(rgb: tuple[float, float, float]) -> str:
    """The world colour nearest an sRGB 0..1 colour in OKLab; an exact tie goes to the darker colour."""
    lab = srgb_to_oklab(rgb)
    best, best_key = "", (math.inf, math.inf)
    for c, (L, a, b) in _WORLD_LAB.items():
        d = (lab[0] - L) ** 2 + (lab[1] - a) ** 2 + (lab[2] - b) ** 2
        if (d, L) < best_key:
            best, best_key = c, (d, L)
    return best


def ramp_of(colour: str, ramp: str | None = None) -> tuple[str, int]:
    """(ramp name, step index) of a world colour; the first ramp in file order unless one is named."""
    c = colour.upper()
    names = [ramp] if ramp else list(WORLD_RAMPS)
    for name in names:
        steps = WORLD_RAMPS[name]
        if c in steps:
            return name, steps.index(c)
    raise ValueError(f"{colour} is not a step of {ramp or 'any world ramp'}")


def ramp_shades(colour: str, ramp: str | None = None) -> tuple[str, str]:
    """(light, shadow) tones of a flat world colour: its ramp neighbours (ASSETS 6.2, art plan S5.3).

    The top step lights to itself. Below a ramp's lowest step the shadow falls into slate, then ink.
    """
    name, i = ramp_of(colour, ramp)
    steps = WORLD_RAMPS[name]
    light = steps[min(i + 1, len(steps) - 1)]
    if i > 0:
        shadow = steps[i - 1]
    else:
        slate, ink = WORLD_RAMPS["slate"][0], WORLD_RAMPS["ink"][0]
        shadow = ink if steps[0] in (slate, ink) else slate
    return light, shadow


def ramp_step(ramp: str, step: int) -> str:
    """One step of a named ramp; a negative step counts from the light end."""
    return WORLD_RAMPS[ramp][step]
