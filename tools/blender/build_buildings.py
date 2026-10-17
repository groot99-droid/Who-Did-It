"""Render the four Small-profile building exteriors (docs/SPRITES.md 8) through the rig.

    python tools/blender/build_buildings.py -- --out build/render
    # -> build/render/buildings/bld_<id>_ext.png

Stand-ins for the M6 kit-bash (ASSETS.md 6.3): each house is modelled from code in palette colours
like the props, a plastered box on a stone plinth under a slate gable roof, with the door and the
lit windows on the camera side and one detail that names it (the tavern's hanging lantern sign,
the apothecary's teal bottle panes, the widow's dark windows and wreath, the bakery's loaf sign and
flue). Same geometry as the placeholder: `w` tiles wide, a 3 m wall (123 px) and a roof `d` tiles deep
(d x 49 px), the image cut so its bottom middle is the middle of the front wall's base, which the
manifest's `origin: [0.5, 1]` puts on the door tile.
"""

from __future__ import annotations

import math
import os
import sys

import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import static_common as sc  # noqa: E402
from batch_render import render_to  # noqa: E402
from build_loft import frame  # noqa: E402
from static_common import box, cylinder, flat, mesh, slab, toon  # noqa: E402

WALL = 3.0
RISE = 1.7  # roof ridge above the wall top
EAVE = 0.3  # roof overhang at the sides and the back
FRONT_EAVE = 0.12  # a short front overhang, so the eave does not hide the upper windows
GROUND_PX_PER_M = 64 * math.cos(math.radians(40))  # 49 px of screen per metre of depth
WALL_PX_PER_M = 64 * math.sin(math.radians(40))  # 41 px of screen per metre of height

# id -> footprint (w, d) in tiles, as tools/sprites/placeholder.ts BUILDINGS
BUILDINGS = {"tavern": (8, 5), "apoth": (6, 4), "widow": (6, 4), "bakery": (6, 4)}


def prism_x(name, mat, profiles, half_w, outline=True, bevel=0.0):
    """Shapes drawn as (y, z) profiles, extruded along X over -half_w..half_w."""
    ob = mesh(name, mat, [(slab, dict(points=p, z0=-half_w, z1=half_w)) for p in profiles], outline=outline,
              bevel=bevel)
    for v in ob.data.vertices:  # slab builds the profile in XY, extruded on Z: map (y, z, x) -> (x, y, z)
        y, z, x = v.co
        v.co = (x, y, z)
    ob.data.update()
    return ob


def gable(w, d, z0, rise, eave, thick=0.18):
    """A roof prism along X over the depth 0..d, from the eaves at z0 to the ridge, with shingle rows."""
    hw = w / 2 + EAVE
    front = (-eave, z0)
    ridge = (d / 2, z0 + rise)
    prof = [front, ridge, (d + EAVE, z0), (d + EAVE, z0 - thick), (d / 2, z0 + rise - thick * 1.4),
            (-eave, z0 - thick)]
    (y0, za), (y1, zb) = front, ridge
    length = math.hypot(y1 - y0, zb - za)
    ty, tz = (y1 - y0) / length, (zb - za) / length  # along the front slope, and its outward normal
    ny, nz = -tz, ty
    rows = []
    for k in range(1, 7):
        t = k / 7
        py, pz = y0 + (y1 - y0) * t, za + (zb - za) * t
        rows.append([(py + ny * a + ty * b, pz + nz * a + tz * b) for a, b in
                     ((0.004, -0.03), (0.004, 0.03), (0.02, 0.03), (0.02, -0.03))])
    return [prism_x("Roof", toon("ink"), [prof], hw, bevel=0.02),
            prism_x("Shingles", flat("ink"), rows, hw - 0.04, outline=False)]


def window(name, x, z, w=0.9, h=0.8, glass="lantern"):
    y = -0.02
    return [
        mesh(f"{name}Glass", flat(glass), [(box, dict(center=(x, y, z), size=(w, 0.02, h)))], outline=False),
        mesh(f"{name}Frame", toon("slate"), [
            (box, dict(center=(x, y - 0.03, z + sz * (h / 2 + 0.04)), size=(w + 0.16, 0.06, 0.08))) for sz in (1, -1)
        ] + [(box, dict(center=(x + sx * (w / 2 + 0.04), y - 0.03, z), size=(0.08, 0.06, h + 0.16))) for sx in (1, -1)]
          + [(box, dict(center=(x, y - 0.02, z), size=(0.05, 0.04, h))),
             (box, dict(center=(x, y - 0.02, z), size=(w, 0.04, 0.05)))]),
    ]


def house(w, d, wall="bone", door_x=0.0):
    """The shared shell: plinth, plastered walls, corner timbers, roof, door."""
    return [
        mesh("Plinth", toon("fog"), [(box, dict(center=(0, d / 2, 0.2), size=(w + 0.08, d + 0.08, 0.4)))], bevel=0.02),
        mesh("Walls", toon(wall), [(box, dict(center=(0, d / 2, WALL / 2 + 0.2), size=(w, d, WALL - 0.4)))]),
        mesh("Timbers", toon("slate"), [
            (box, dict(center=(sx * (w / 2 - 0.06), -0.02, WALL / 2), size=(0.18, 0.08, WALL))) for sx in (1, -1)
        ] + [(box, dict(center=(0, -0.02, WALL - 0.08), size=(w, 0.08, 0.16)))]),
        *gable(w, d, WALL, RISE, FRONT_EAVE),
        mesh("Ridge", toon("slate"), [(box, dict(center=(0, d / 2, WALL + RISE + 0.02), size=(w + 2 * EAVE, 0.2, 0.1)))]),
        mesh("Door", toon("slate"), [(box, dict(center=(door_x, -0.03, 1.05), size=(1.0, 0.06, 1.9)))], bevel=0.01),
        mesh("DoorFrame", toon("ink"), [
            (box, dict(center=(door_x + sx * 0.56, -0.05, 1.05), size=(0.12, 0.06, 2.1))) for sx in (1, -1)
        ] + [(box, dict(center=(door_x, -0.05, 2.13), size=(1.24, 0.06, 0.14)))]),
        mesh("Knob", toon("mustard"), [(box, dict(center=(door_x + 0.32, -0.08, 1.0), size=(0.08, 0.04, 0.08)))],
             outline=False),
        mesh("Step", toon("fog"), [(box, dict(center=(door_x, -0.2, 0.06), size=(1.3, 0.4, 0.12)))]),
    ]


def chimney(x, y, top, token="slate"):
    return [mesh("Chimney", toon(token), [
        (box, dict(center=(x, y, (WALL + top) / 2), size=(0.5, 0.5, top - WALL))),
        (box, dict(center=(x, y, top + 0.05), size=(0.62, 0.62, 0.12))),
    ], bevel=0.01)]


def bld_tavern(w, d):
    objs = house(w, d, "bone", door_x=0.0)
    objs += mesh_list(window("WinL1", -2.4, 1.1, 0.9, 0.7), window("WinR1", 2.4, 1.1, 0.9, 0.7), window("WinL2", -1.6, 2.25, 0.7, 0.5),
                      window("WinR2", 1.6, 2.25, 0.7, 0.5))
    objs.append(mesh("Floorbeam", toon("slate"), [(box, dict(center=(0, -0.02, 1.75), size=(w, 0.08, 0.12)))]))
    objs += [  # the Drowned Lantern's sign: a bracket, a board and a lit lantern
        mesh("SignArm", toon("ink"), [(box, dict(center=(-3.4, -0.45, 2.55), size=(0.08, 0.9, 0.08)))]),
        mesh("SignBoard", toon("slate"), [(box, dict(center=(-3.4, -0.8, 2.05), size=(0.9, 0.06, 0.7)))], bevel=0.01),
        mesh("SignWave", flat("moon"), [(box, dict(center=(-3.4, -0.84, 1.95), size=(0.6, 0.01, 0.1)))], outline=False),
        mesh("SignLamp", flat("lantern"), [(box, dict(center=(-3.4, -0.84, 2.2), size=(0.2, 0.02, 0.24)))],
             outline=False),
    ]
    objs += chimney(2.6, d * 0.3, WALL + RISE + 0.5, "fog")
    return objs


def bld_apoth(w, d):
    objs = house(w, d, "fog", door_x=0.8)
    objs += mesh_list(window("Shop", -1.4, 1.25, 1.6, 1.0, glass="teal"), window("Upper", -1.4, 2.4, 0.7, 0.4))
    objs.append(mesh("Bottles", flat("bone"), [
        (box, dict(center=(-1.4 + dx, -0.035, 1.05), size=(0.08, 0.01, 0.22))) for dx in (-0.55, -0.3, 0.3, 0.55)
    ], outline=False))
    objs.append(mesh("Mortar", toon("mustard"), [
        (cylinder, dict(center=(2.2, -0.5, 2.35), radius=0.16, radius_top=0.22, depth=0.22, segments=8)),
    ]))
    objs.append(mesh("MortarArm", toon("ink"), [(box, dict(center=(2.2, -0.3, 2.65), size=(0.06, 0.6, 0.06)))]))
    return objs


def bld_widow(w, d):
    objs = house(w, d, "fog", door_x=-0.6)
    objs += mesh_list(window("WinL", -2.1, 1.3, glass="ink"), window("WinR", 1.6, 1.3, glass="moon"),
                      window("Attic", 0.4, 2.4, 0.6, 0.4, glass="ink"))
    objs.append(mesh("Wreath", toon("ink"), [
        (cylinder, dict(center=(-0.6, -0.1, 1.45), radius=0.22, depth=0.06, segments=10)),
    ]))
    objs.append(mesh("WreathBow", flat("blood"), [(box, dict(center=(-0.6, -0.14, 1.25), size=(0.12, 0.01, 0.08)))],
                     outline=False))
    objs += chimney(-1.8, d * 0.3, WALL + RISE + 0.3, "fog")
    return objs


def bld_bakery(w, d):
    objs = house(w, d, "bone", door_x=0.0)
    objs += mesh_list(window("WinL", -1.8, 1.3, 1.1, 0.9), window("WinR", 1.8, 1.3, 1.1, 0.9))
    objs += [  # Crumb's Ovens: a loaf on a bracket over the door, and the oven's brick flue
        mesh("LoafArm", toon("ink"), [(box, dict(center=(0, -0.3, 2.78), size=(0.06, 0.6, 0.06)))]),
        mesh("LoafSign", toon("mustard"), [
            (cylinder, dict(center=(0, -0.55, 2.42), radius=0.2, radius_top=0.08, depth=0.24, segments=10)),
        ]),
    ]
    objs[-1].scale.x = 1.8
    objs += chimney(-2.2, d * 0.3, WALL + RISE + 0.6, "fog")
    return objs


def mesh_list(*groups):
    return [o for g in groups for o in g]


BUILDERS = {"tavern": bld_tavern, "apoth": bld_apoth, "widow": bld_widow, "bakery": bld_bakery}


def image_size(w, d):
    """Pixel size of a building image: the roof's overhang wide, the ridge or chimney high."""
    width = int(w * 64 + 2 * EAVE * 64 + 16)
    ridge = d / 2 * GROUND_PX_PER_M + (WALL + RISE) * WALL_PX_PER_M
    eave = (d + EAVE) * GROUND_PX_PER_M + WALL * WALL_PX_PER_M
    stack = d * 0.3 * GROUND_PX_PER_M + (WALL + RISE + 0.7) * WALL_PX_PER_M  # the tallest chimney top
    return width, int(math.ceil(max(ridge, eave, stack) + 10))


def main() -> None:
    out = os.path.join(sc.args_out(sys.argv, "build_buildings.py"), "buildings")
    os.makedirs(out, exist_ok=True)
    scene = sc.setup()
    for bid, (w, d) in BUILDINGS.items():
        size = image_size(w, d)
        frame(scene, size, 64, centre=(0.0, -size[1] / 2 / 64))
        objs = BUILDERS[bid](w, d)
        bpy.context.view_layer.update()
        co = world_to_camera_view(scene, scene.camera, Vector((0.0, 0.0, 0.0)))
        pivot = (co.x * size[0], (1 - co.y) * size[1])
        if abs(pivot[0] - size[0] / 2) > 0.5 or abs(pivot[1] - size[1]) > 0.5:
            raise SystemExit(f"bld_{bid}_ext: origin at {pivot}, want the bottom middle of {size}")
        render_to(scene, os.path.join(out, f"bld_{bid}_ext.png"))
        sc.clear(objs)
        print(f"bld_{bid}_ext: {size[0]}x{size[1]}")


if __name__ == "__main__":
    main()
