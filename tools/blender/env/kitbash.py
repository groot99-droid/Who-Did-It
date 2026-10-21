"""Small modelling vocabulary for the world props, spots and portals (art plan 3.5-3.7).

Every prop is built around the origin, the ground point under its tile centre, from world-palette toon
materials (`T`), unlit colours (`F`) and the shape helpers of static_common; `part` makes one mesh from many
shapes. Blender +Y is world north and the camera sits to the south-east, so a prop's "front" is its -Y face
(screen lower left) and its "side" its +X face (screen lower right).
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import kit_import as ki  # noqa: E402
import static_common as sc  # noqa: E402
from static_common import blob, box, cylinder, frustum, mesh, slab, stroke  # noqa: E402,F401

# World-palette ramps (palette.json `world`), dark to light.
R = {
    "ink": ["#12141C", "#1A1D29"],
    "slate": ["#2C3240", "#3A4356", "#4D5A70", "#5E6C84"],
    "fog": ["#6F7A8C", "#8892A2", "#A6AEBA"],
    "moon": ["#24374F", "#466784", "#6A8EAD", "#7FA8FF", "#93C2E0", "#C3EAF2"],
    "bone": ["#8E8676", "#B2AA99", "#D9D2C2", "#FFF1DC"],
    "plaster": ["#9A9083", "#BFA27E", "#DCC4A1", "#F0DEB3"],
    "stone": ["#2E2A2D", "#453E3F", "#5E5553", "#7A7067", "#9A9083", "#B2AA99"],
    "wood": ["#24171A", "#3A231F", "#55332A", "#744733", "#94603F", "#B57F54"],
    "brick": ["#4E2620", "#6A3426", "#8A4630", "#AA5A39", "#C8744A", "#DE9767"],
    "lantern": ["#B06A35", "#DA9348", "#FFB457", "#FFD48A", "#FFF1DC"],
    "brass": ["#6E5428", "#A07C36", "#F2B33D"],
    "moss": ["#1B261B", "#26361F", "#3A5A33", "#4F8A4A", "#5FC266", "#A8F09A"],
    "litter": ["#3A2F1E", "#5C4A2A", "#80683A"],
    "teal": ["#1C504D", "#2EC4B6", "#9DF2E6"],
    "blood": ["#4A0D12", "#7E1119", "#B3121F"],
}


def T(ramp: str, i: int):
    """Toon material: ramp colour i as the mid band, its neighbours as light and shadow."""
    r = R[ramp]
    i = max(0, min(i, len(r) - 1))
    return sc.hex_toon(f"P_{ramp}_{i}", r[min(i + 1, len(r) - 1)], r[i], r[max(i - 1, 0)])


def F(ramp: str, i: int):
    """Unlit ramp colour (glass, glow, water, ink marks)."""
    return sc.hex_flat(f"PF_{ramp}_{i}", R[ramp][i])


def B(cx, cy, cz, sx, sy, sz):
    """A box shape centred at (cx, cy, cz) of size (sx, sy, sz)."""
    return (box, dict(center=(cx, cy, cz), size=(sx, sy, sz)))


def C(cx, cy, z0, r, h, seg=8, rt=None):
    """A prism (or frustum) shape along Z from z0."""
    return (cylinder, dict(center=(cx, cy, z0), radius=r, depth=h, segments=seg, radius_top=rt))


def S(points, z0=0.0, z1=0.01):
    """An extruded 2-D outline."""
    return (slab, dict(points=points, z0=z0, z1=z1))


def part(name, mat, *shapes, outline=True, bevel=0.0):
    return mesh(name, mat, list(shapes), outline=outline, bevel=bevel)


def kenney(pack, model, size=None, height=None, colours=None, ramp=None, at=(0.0, 0.0, 0.0), rot=0.0,
           outline=True):
    """A Kenney mesh fitted to a footprint `size` (max of x, y) or a `height`, placed at `at`, turned `rot`."""
    import bpy
    from mathutils import Vector

    o = ki.import_part(ki.kenney(pack, model), tag=f"kenney:{pack}/{model}", colours=colours, ramp=ramp,
                       outline=outline)
    d = o.dimensions
    k = height / d.z if height else (size / max(d.x, d.y) if size else 1.0)
    o.scale = (k, k, k)
    bpy.context.view_layer.update()
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    o.location = (o.location.x - (min(p.x for p in bb) + max(p.x for p in bb)) / 2 + at[0],
                  o.location.y - (min(p.y for p in bb) + max(p.y for p in bb)) / 2 + at[1],
                  o.location.z - min(p.z for p in bb) + at[2])
    if rot:
        o.rotation_euler.z = rot
    return o


def back_panel(name, mat, w=0.9, h=1.6, z0=0.2):
    """A board standing at the tile's north-west edges' corner: wall-hung things show against it."""
    return part(name, mat, B(0, 0.42, z0 + h / 2, w, 0.06, h))
