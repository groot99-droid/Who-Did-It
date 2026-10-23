"""The boot atlas `props` (art plan 3.5-3.7): both maps' props, spots and the 20 portal frames.

Each entry is `frame -> (art width, art height, builder)`; a builder returns its objects, standing on the
origin (the ground point under the tile centre). build_props.py renders them through IsoCam.
"""

from __future__ import annotations

import math
import random

from env.kitbash import B, C, F, S, T, blob, frustum, kenney, part, stroke

# ---------------------------------------------------------------- props (from the round-4 shapes)


def notice_board():
    papers = [((-0.3, 1.36), (0.24, 0.3)), ((-0.0, 1.42), (0.22, 0.2)), ((0.28, 1.3), (0.24, 0.32)),
              ((0.02, 1.1), (0.2, 0.18)), ((-0.3, 1.04), (0.2, 0.16))]
    objs = [
        part("BoardPosts", T("wood", 2), *[B(sx * 0.5, 0, 0.9, 0.11, 0.11, 1.8) for sx in (1, -1)], bevel=0.02),
        part("Board", T("wood", 4), B(0, 0, 1.25, 1.04, 0.07, 0.66), bevel=0.015),
        part("BoardRoof", T("slate", 1), (frustum, dict(z0=1.62, z1=1.8, bottom=(1.26, 0.34), top=(1.08, 0.06)))),
    ]
    objs.append(part("Papers", T("bone", 2), *[B(x, -0.045, z, w, 0.012, h) for (x, z), (w, h) in papers],
                     outline=False))
    objs.append(part("Pins", F("blood", 2), *[B(x, -0.055, z + h / 2 - 0.04, 0.035, 0.02, 0.035)
                                              for (x, z), (w, h) in papers], outline=False))
    return objs


def kit_chest():
    return [
        part("ChestBody", T("wood", 3), B(0, 0, 0.21, 0.8, 0.5, 0.42), bevel=0.02),
        part("ChestLid", T("wood", 4), (frustum, dict(z0=0.42, z1=0.56, bottom=(0.82, 0.52), top=(0.74, 0.3))),
             bevel=0.02),
        part("ChestBands", T("slate", 1), *[B(sx * 0.26, 0, 0.29, 0.07, 0.54, 0.56) for sx in (1, -1)]),
        part("ChestLock", T("brass", 2), B(0, -0.26, 0.38, 0.12, 0.04, 0.14)),
    ]


def pump():
    return [
        part("WellHead", T("stone", 3), C(0, 0.05, 0, 0.42, 0.46, 10), bevel=0.02),
        part("WellRim", T("stone", 4), C(0, 0.05, 0.46, 0.45, 0.07, 10)),
        part("WellWater", F("moon", 0), C(0, 0.05, 0.48, 0.35, 0.06, 10), outline=False),
        part("PumpBody", T("slate", 1), C(0, 0.18, 0.5, 0.09, 0.78, 8), C(0, 0.18, 1.28, 0.12, 0.12, 8, rt=0.05)),
        part("PumpSpout", T("slate", 1), B(0, -0.04, 1.02, 0.07, 0.3, 0.08), B(0, -0.17, 0.96, 0.07, 0.07, 0.1)),
        part("PumpHandle", T("ink", 1),
             (frustum, dict(z0=1.24, z1=1.5, bottom=(0.05, 0.05), top=(0.05, 0.05), offset=(0.06, 0.22),
                            top_offset=(0.34, 0.4)))),
    ]


def lantern_post(lit: bool):
    glass = F("lantern", 3) if lit else T("fog", 0)
    objs = [
        part("PostBase", T("stone", 3), B(0, 0, 0.1, 0.32, 0.32, 0.2), bevel=0.02),
        part("Post", T("slate", 1), B(0, 0, 1.15, 0.1, 0.1, 1.95), B(0.16, 0, 2.06, 0.34, 0.07, 0.07)),
        part("LanternFrame", T("ink", 1),
             (frustum, dict(z0=1.9, z1=1.94, bottom=(0.3, 0.3), top=(0.3, 0.3), offset=(0.3, 0))),
             (frustum, dict(z0=1.56, z1=1.6, bottom=(0.24, 0.24), top=(0.28, 0.28), offset=(0.3, 0))),
             (frustum, dict(z0=1.94, z1=1.99, bottom=(0.24, 0.24), top=(0.1, 0.1), offset=(0.3, 0)))),
        part("LanternGlass", glass, (frustum, dict(z0=1.6, z1=1.9, bottom=(0.22, 0.22), top=(0.26, 0.26),
                                                   offset=(0.3, 0)))),
    ]
    if lit:
        objs.append(part("Flame", F("lantern", 4), B(0.3, -0.12, 1.72, 0.06, 0.02, 0.1), outline=False))
    return objs


# ---------------------------------------------------------------- spots shared by both maps (3.6)


def wardrobe():
    return [kenney("furniture-kit", "bookcaseClosedDoors", height=1.9, ramp=["#24171A", "#55332A", "#94603F"])]


def behind_counter():
    return [kenney("furniture-kit", "kitchenBar", size=0.95, ramp=["#3A231F", "#744733", "#B57F54"])]


def under_bed():
    return [kenney("furniture-kit", "bedSingle", size=1.0, ramp=["#3A231F", "#744733", "#B2AA99", "#D9D2C2"])]


def crawlspace():
    """A low dark gap under boards: a slatted skirt with a black opening."""
    return [
        part("Skirt", T("wood", 2), B(0, 0.1, 0.22, 0.95, 0.75, 0.44)),
        part("Gap", F("ink", 0), B(0, -0.27, 0.15, 0.55, 0.02, 0.24), outline=False),
        part("Slats", T("wood", 3), *[B(-0.42 + 0.21 * k, -0.28, 0.36, 0.12, 0.03, 0.16) for k in range(5)]),
    ]


def brush():
    rnd = random.Random("spot_brush")
    return [part("Brush", T("moss", 2), *[S(blob(rnd.uniform(-0.25, 0.25), rnd.uniform(-0.25, 0.25), 0.22, 0.2,
                                                  [(0.2, 5, rnd.random() * 6)], n=14), 0, rnd.uniform(0.4, 0.75))
                                            for _ in range(4)], bevel=0.06),
            part("Bramble", T("litter", 1), *[S(stroke(rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), 0.3, 0.05,
                                                       rnd.uniform(0, math.pi)), 0.5, 0.56) for _ in range(4)])]


def hollow_tree():
    return [part("Trunk", T("wood", 2), C(0, 0, 0, 0.42, 1.4, 10, rt=0.3), bevel=0.04),
            part("Hollow", F("ink", 0), B(0, -0.38, 0.45, 0.3, 0.05, 0.5), outline=False),
            part("Snag", T("wood", 3), B(0.15, 0.05, 1.5, 0.12, 0.12, 0.4))]


def timber_crib():
    logs = []
    for layer in range(5):
        z = 0.08 + 0.16 * layer
        if layer % 2:
            logs += [B(sx * 0.36, 0, z, 0.14, 0.9, 0.14) for sx in (1, -1)]
        else:
            logs += [B(0, sy * 0.36, z, 0.9, 0.14, 0.14) for sy in (1, -1)]
    return [part("Crib", T("wood", 3), *logs), part("CribDark", F("ink", 0), B(0, 0, 0.3, 0.55, 0.55, 0.5),
                                                    outline=False)]


def sump():
    return [part("SumpRim", T("stone", 2), S(blob(0, 0, 0.4, 0.34, [(0.1, 4, 0.3)], n=16), 0, 0.05)),
            part("SumpWater", F("moon", 0), S(blob(0, 0, 0.32, 0.27, [(0.1, 4, 0.3)], n=16), 0.05, 0.06),
                 outline=False),
            part("SumpGlint", F("moon", 2), S(stroke(-0.08, -0.05, 0.14, 0.02, 0.4), 0.06, 0.065), outline=False)]


# ---------------------------------------------------------------- portals (3.7), theme-neutral

H = 2.5  # a full frame is a wall's height


def _face(face: str, x, y, z, w, d, h):
    """A box on the south (`s`) face or, turned, on the east (`e`) face of the tile."""
    return B(x, y, z, w, d, h) if face == "s" else B(-y, -x, z, d, w, h)


def door(face):
    """A stained oak door with iron straps in a dark timber frame, filling the tile's face."""
    objs = [part("Frame", T("wood", 1), B(0, 0, H / 2, 1, 1, H), outline=False),
            part("Door", T("wood", 3), _face(face, 0, -0.505, 1.0, 0.62, 0.03, 2.0)),
            part("Straps", T("ink", 1), *[_face(face, 0, -0.522, z, 0.6, 0.02, 0.06) for z in (0.45, 1.0, 1.6)],
                 outline=False),
            part("Ring", T("brass", 1), _face(face, 0.2, -0.525, 1.0, 0.06, 0.02, 0.06), outline=False),
            part("Lintel", T("wood", 2), _face(face, 0, -0.52, 2.06, 0.9, 0.06, 0.14))]
    return objs


def stairs(face):
    """A flight climbing away from the face into the back wall, between two stringers, with a rail."""
    steps = [_face(face, 0, -0.45 + 0.1 * k, 0.12 * (k + 1) / 2 + 0.0, 0.8, 0.1, 0.12 * (k + 1)) for k in range(10)]
    return [part("Steps", T("wood", 3), *steps, outline=False),
            part("Stringers", T("wood", 1), *[_face(face, sx * 0.44, 0.0, 0.62, 0.08, 1.0, 1.24) for sx in (1, -1)],
                 outline=False),
            part("Back", T("wood", 0), _face(face, 0, 0.48, H / 2, 1.0, 0.04, H), outline=False),
            part("Rail", T("wood", 2), _face(face, 0.44, -0.05, 1.5, 0.05, 1.0, 0.05),
                 *[_face(face, 0.44, y, 1.0, 0.04, 0.04, 1.0) for y in (-0.4, 0.4)])]


def crawl(face):
    return [part("Wall", T("wood", 1), B(0, 0, H / 2, 1, 1, H), outline=False),
            part("Hatch", T("wood", 3), _face(face, 0, -0.51, 0.3, 0.5, 0.03, 0.46)),
            part("HatchGap", F("ink", 0), _face(face, 0.0, -0.53, 0.3, 0.36, 0.01, 0.32), outline=False)]


def cave_mouth(face):
    return [part("Rock", T("stone", 1), B(0, 0, H / 2, 1, 1, H), outline=False),
            part("Dark", F("ink", 0), _face(face, 0, -0.505, 0.95, 0.66, 0.02, 1.9), outline=False),
            part("Lintel", T("wood", 3), _face(face, 0, -0.53, 1.95, 0.9, 0.12, 0.16)),
            part("Posts", T("wood", 2), *[_face(face, sx * 0.38, -0.53, 0.95, 0.1, 0.1, 1.9) for sx in (1, -1)])]


def forest_gate(face):
    """A wooden stile between two posts; no wall, the gap is in the trees."""
    return [part("Posts", T("wood", 2), *[_face(face, sx * 0.42, -0.1, 0.65, 0.12, 0.12, 1.3) for sx in (1, -1)]),
            part("Rails", T("wood", 3), *[_face(face, 0, -0.1, z, 0.96, 0.07, 0.07) for z in (0.5, 0.95)]),
            part("Step", T("wood", 4), _face(face, 0, -0.3, 0.3, 0.6, 0.25, 0.06))]


def sill(kind):
    """The opening is in a front wall: only its threshold shows (`_sill`)."""
    if kind == "door":
        return [part("Threshold", T("wood", 3), B(0, -0.3, 0.04, 0.86, 0.3, 0.08)),
                part("Mat", T("brick", 1), B(0, 0.05, 0.01, 0.6, 0.4, 0.02), outline=False)]
    if kind == "stairs":
        return [part("TopStep", T("wood", 3), B(0, -0.2, 0.12, 0.86, 0.5, 0.24))]
    if kind == "crawl":
        return [part("Sill", T("wood", 2), B(sx * 0.32, -0.35, 0.08, 0.3, 0.2, 0.16)) for sx in (1, -1)]
    if kind == "cave_mouth":
        return [part("Lip", T("stone", 2), S(blob(0, -0.3, 0.45, 0.16, [(0.15, 4, 0.5)], n=14), 0, 0.12))]
    return [part("Stile", T("wood", 3), B(0, -0.3, 0.25, 0.9, 0.08, 0.08), B(0, -0.3, 0.1, 0.08, 0.08, 0.3))]


def hatch():
    return [part("Trap", T("wood", 3), B(0, 0, 0.015, 0.8, 0.8, 0.03)),
            part("TrapBands", T("ink", 1), *[B(0, y, 0.035, 0.82, 0.06, 0.01) for y in (-0.25, 0.25)], outline=False),
            part("TrapRing", T("brass", 1), B(0, -0.05, 0.04, 0.1, 0.1, 0.01), outline=False)]


def drop():
    return [part("Edge", T("stone", 2), S(blob(0, 0, 0.48, 0.48, [(0.08, 5, 0.3)], n=18), -0.02, 0.0)),
            part("Hole", F("ink", 0), S(blob(0.03, -0.02, 0.36, 0.32, [(0.15, 4, 1.1)], n=16), 0.0, 0.005),
                 outline=False)]


def boarded(face):
    """Two nailed planks across the opening, drawn over the frame or the building's door."""
    if face == "sill":
        return [part("Planks", T("wood", 4), B(0, -0.3, 0.2, 0.95, 0.06, 0.1), B(0, -0.32, 0.36, 0.95, 0.06, 0.1))]
    return [part("Boards", T("wood", 4), *[_face(face, 0, -0.56, z, 0.95, 0.04, 0.16) for z in (1.1, 0.8)]),
            part("Nails", T("ink", 1), *[_face(face, sx * 0.4, -0.585, z, 0.03, 0.01, 0.03)
                                         for sx in (1, -1) for z in (1.1, 0.8)], outline=False)]


def portal_frames():
    out = {}
    for kind, build in (("door", door), ("stairs", stairs), ("crawl", crawl), ("cave_mouth", cave_mouth),
                        ("forest_gate", forest_gate)):
        for face in ("s", "e"):
            out[f"portal_{kind}_{face}"] = (64, 112, lambda b=build, f=face: b(f))
        out[f"portal_{kind}_sill"] = (64, 48, lambda k=kind: sill(k))
    out["portal_hatch"] = (64, 48, hatch)
    out["portal_drop"] = (64, 48, drop)
    for face in ("s", "e"):
        out[f"portal_boarded_{face}"] = (64, 112, lambda f=face: boarded(f))
    out["portal_boarded_sill"] = (64, 48, lambda: boarded("sill"))
    return out


PROPS = {
    "prop_noticeBoard": (64, 96, notice_board),
    "prop_kitChest": (64, 64, kit_chest),
    "prop_pump": (64, 96, pump),
    "prop_lanternPost_lit": (64, 128, lambda: lantern_post(True)),
    "prop_lanternPost_unlit": (64, 128, lambda: lantern_post(False)),
    "spot_wardrobe": (64, 128, wardrobe),
    "spot_behindCounter": (64, 96, behind_counter),
    "spot_underBed": (64, 80, under_bed),
    "spot_crawlspace": (64, 64, crawlspace),
    "spot_brush": (64, 80, brush),
    "spot_hollowTree": (64, 112, hollow_tree),
    "spot_timberCrib": (64, 96, timber_crib),
    "spot_sump": (64, 48, sump),
    **portal_frames(),
}
