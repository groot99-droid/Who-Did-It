"""Shapes, materials and the part builder of the round-5 looks (art plan 4.2-4.3; ASSETS 6.3).

Every part is a chamfered box or a tapered box, flat-shaded, with one world-palette toon material
whose light and shadow bands are its ramp neighbours (rig_common.ramp_shades). Each part is
parented rigidly to one bone of the 22-bone armature of build_looks.py and tagged `wdi_part`
(`body`, `scarf` or `blood`). Costume pieces of the looks are functions of this module too; a look
lists them by name in looks_spec.py.

The figure faces world +Y; its right hand is +X (bones `.R`), its left -X (`.L`).
"""

from __future__ import annotations

import math
import os
import sys

import bpy
import bmesh  # after bpy: the bpy wheel registers bmesh on import

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rig_common as rc  # noqa: E402

TOON_GROUP = "WDI_Toon"

# A colour is (ramp, step): a step of a named world ramp (palette.json `world.ramps`, dark to light).
Colour = tuple[str, int]


# ---------------------------------------------------------------- shapes (also used by 5K's static_common)


def frustum(bm, z0, z1, bottom, top, offset=(0.0, 0.0), top_offset=None):
    """Add a box whose bottom rectangle (w, d) at z0 tapers to the top rectangle at z1."""
    ox, oy = offset
    tx, ty = top_offset if top_offset is not None else offset
    (bw, bd), (tw, td) = bottom, top
    vs = [bm.verts.new((ox + sx * bw / 2, oy + sy * bd / 2, z0)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    vs += [bm.verts.new((tx + sx * tw / 2, ty + sy * td / 2, z1)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
        bm.faces.new([vs[i] for i in f])


def box(bm, center, size):
    cx, cy, cz = center
    w, d, h = size
    frustum(bm, cz - h / 2, cz + h / 2, (w, d), (w, d), (cx, cy))


def ring(bm, z, radius, tube, segments=8, center=(0.0, 0.0), squash=1.0):
    """A low-poly ring (square tube) around a vertical axis; `squash` scales its depth (Y)."""
    cx, cy = center
    prev = first = None
    for i in range(segments + 1):
        a = 2 * math.pi * i / segments
        c, s = math.cos(a), math.sin(a)
        quad = [bm.verts.new((cx + (radius + dr) * c, cy + (radius + dr) * s * squash, z + dz))
                for dr, dz in ((-tube, -tube), (tube, -tube), (tube, tube), (-tube, tube))]
        if i == segments:
            quad = first
        if prev is not None:
            for k in range(4):
                bm.faces.new((prev[k], prev[(k + 1) % 4], quad[(k + 1) % 4], quad[k]))
        prev = quad
        first = first or quad


def cylinder(bm, z0, z1, r0, r1, segments=8, center=(0.0, 0.0), squash=1.0):
    """A tapered prism around a vertical axis (crowns, helmets, toques, bottles)."""
    cx, cy = center
    rings = []
    for z, r in ((z0, r0), (z1, r1)):
        rings.append([bm.verts.new((cx + r * math.cos(2 * math.pi * i / segments),
                                    cy + r * math.sin(2 * math.pi * i / segments) * squash, z))
                      for i in range(segments)])
    lo, hi = rings
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    for i in range(segments):
        j = (i + 1) % segments
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))


def rod(bm, a, b, width):
    """A square bar of `width` from point a to point b (poles, gun barrels, picks)."""
    from mathutils import Vector

    pa, pb = Vector(a), Vector(b)
    axis = (pb - pa).normalized()
    side = axis.cross(Vector((0, 0, 1)))
    if side.length < 1e-6:
        side = Vector((1, 0, 0))
    side.normalize()
    up = side.cross(axis).normalized()
    h = width / 2
    corners = [side * sx * h + up * sy * h for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    vs = [bm.verts.new(pa + c) for c in corners] + [bm.verts.new(pb + c) for c in corners]
    for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
        bm.faces.new([vs[i] for i in f])


# ---------------------------------------------------------------- materials


def _toon_group() -> bpy.types.NodeTree:
    group = bpy.data.node_groups.get(TOON_GROUP)
    if group is None:
        import build_rig

        group = build_rig.make_toon_group()
    return group


def material(colour: Colour) -> bpy.types.Material:
    """The toon material of one world colour: mid = the step, light and shadow = its ramp neighbours.

    The ramp is named, because a colour can sit in two ramps (#55332A is wood and skin), and
    palettize.py keeps a toon material's inputs as they are when they are world colours.
    """
    ramp, step = colour
    name = f"Look_{ramp}_{step}"
    mat = bpy.data.materials.get(name)
    if mat is not None:
        return mat
    mid = rc.ramp_step(ramp, step)
    light, shadow = rc.ramp_shades(mid, ramp)
    mat = bpy.data.materials.new(name)
    mat.surface_render_method = "DITHERED"
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    group = nodes.new("ShaderNodeGroup")
    group.node_tree = _toon_group()
    for sock, value in (("Light", light), ("Mid", mid), ("Shadow", shadow)):
        group.inputs[sock].default_value = rc.hex_to_linear(value)
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(group.outputs["Shader"], out.inputs["Surface"])
    return mat


def flat(colour: Colour) -> bpy.types.Material:
    """A flat emission material (glowing glass, flames, the blood mask)."""
    ramp, step = colour
    name = f"Flat_{ramp}_{step}"
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
        mat.surface_render_method = "DITHERED"
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        nodes.clear()
        emit = nodes.new("ShaderNodeEmission")
        emit.inputs["Color"].default_value = rc.hex_to_linear(rc.ramp_step(ramp, step))
        out = nodes.new("ShaderNodeOutputMaterial")
        links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return mat


# ---------------------------------------------------------------- the part builder


class Builder:
    """Makes rigid parts on the armature and counts them."""

    def __init__(self, col: bpy.types.Collection, arm: bpy.types.Object):
        self.col, self.arm = col, arm

    def part(self, name: str, part: str, colour: Colour, bone: str, shapes, bevel: float = 0.012,
             glow: bool = False) -> bpy.types.Object:
        """One mesh object from shape callbacks, tagged and bone-parented in place."""
        bm = bmesh.new()
        for fn, kw in shapes:
            fn(bm, **kw)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        obj = bpy.data.objects.new(name, mesh)
        self.col.objects.link(obj)
        obj["wdi_part"] = part
        obj.data.materials.append(flat(colour) if glow else material(colour))
        if glow:
            obj["wdi_glow"] = True  # batch_render gives it no outline
        if bevel:
            mod = obj.modifiers.new("Chamfer", "BEVEL")
            mod.width, mod.segments, mod.limit_method = bevel, 1, "ANGLE"
        world = obj.matrix_world.copy()
        obj.parent, obj.parent_type, obj.parent_bone = self.arm, "BONE", bone
        bpy.context.view_layer.update()
        obj.matrix_world = world  # bone children sit at the bone tail otherwise
        return obj


# ---------------------------------------------------------------- the base body's landmarks (metres)

# 1.7 m and five heads tall: a 0.34 m head, shoulders 0.42 m, hips 0.32 m, the crotch at 0.85 m,
# hands 0.17 m, boots 0.26 m (art plan 4.2).
HEIGHT = 1.70
HEAD = (1.36, 1.70)  # chin to crown
NECK = (1.29, 1.38)
CHEST = (1.02, 1.32)  # waist to shoulder line
SHOULDER_W = 0.42
HIPS = (0.84, 1.04)
HIP_W = 0.32
CROTCH = 0.85
KNEE = 0.47
ANKLE = 0.10
SHOULDER_X, ELBOW_Z, WRIST_Z, HAND_LEN = 0.19, 1.02, 0.77, 0.17
LEG_X = 0.085
BOOT_LEN = 0.26

# Costume pieces, by name, as functions (builder, spec) -> None; looks_spec.py lists them per look.
PIECES: dict = {}


def piece(fn):
    PIECES[fn.__name__] = fn
    return fn


@piece
def hair_short(b: Builder, spec: dict) -> None:
    """Close-cropped hair: a cap over the crown and the back of the head."""
    h0, h1 = HEAD
    b.part("Hair", "body", spec["hair"], "head", [
        (frustum, dict(z0=h1 - 0.10, z1=h1 + 0.015, bottom=(0.255, 0.27), top=(0.22, 0.23), offset=(0, -0.01))),
        (box, dict(center=(0.0, -0.11, h0 + 0.20), size=(0.25, 0.06, 0.20))),
    ])


# ---------------------------------------------------------------- shared costume pieces

H0, H1 = HEAD


def _hat_brim(b, name, colour, z, w, d, thick=0.025, offset=(0.0, 0.0)):
    b.part(name, "body", colour, "head", [
        (frustum, dict(z0=z, z1=z + thick, bottom=(w, d), top=(w - 0.01, d - 0.01), offset=offset)),
    ], bevel=0.006)


@piece
def hair_bun(b: Builder, spec: dict) -> None:
    """Hair tied back into a bun at the nape."""
    hair_short(b, spec)
    b.part("Bun", "body", spec["hair"], "head", [(box, dict(center=(0.0, -0.15, H0 + 0.12), size=(0.10, 0.08, 0.09)))])


@piece
def long_coat(b: Builder, spec: dict) -> None:
    """A knee-length coat skirt over the hips (trench, frock coat, greatcoat, smock)."""
    c = spec.get("coat", spec["jacket"])
    b.part("CoatSkirt", "body", c, "hips", [
        (frustum, dict(z0=spec.get("coat_hem", 0.48), z1=HIPS[1], bottom=(0.44, 0.30), top=(0.33, 0.22))),
    ])


@piece
def belt(b: Builder, spec: dict) -> None:
    b.part("Belt", "body", spec.get("belt", spec["jacket"]), "spine", [
        (frustum, dict(z0=1.00, z1=1.06, bottom=(0.335, 0.215), top=(0.335, 0.215))),
    ], bevel=0.004)


@piece
def collar_up(b: Builder, spec: dict) -> None:
    """A turned-up coat collar behind and beside the neck (under the scarf)."""
    c = spec.get("coat", spec["jacket"])
    b.part("Collar", "body", c, "chest", [
        (frustum, dict(z0=CHEST[1] - 0.04, z1=CHEST[1] + 0.10, bottom=(0.30, 0.20), top=(0.26, 0.16), offset=(0, -0.02))),
    ], bevel=0.006)


@piece
def gloves(b: Builder, spec: dict) -> None:
    for s, x in (("R", 1), ("L", -1)):
        b.part(f"Glove.{s}", "body", spec["gloves"], f"hand.{s}", [
            (frustum, dict(z0=WRIST_Z - HAND_LEN - 0.004, z1=WRIST_Z + 0.03, bottom=(0.068, 0.088), top=(0.10, 0.10),
                           offset=(x * 0.215, 0.01))),
        ])


# ---------------------------------------------------------------- the Baker


@piece
def toque(b: Builder, spec: dict) -> None:
    """A tall pleated toque: a band and a puffed crown 0.07 m above the head; with the crown's depth it tops
    out just under the 112 px silhouette cap (SPRITES 10.3)."""
    white = ("bone", 2)
    b.part("ToqueBand", "body", white, "head", [
        (cylinder, dict(z0=H1 - 0.07, z1=H1 + 0.02, r0=0.128, r1=0.13, segments=10)),
    ], bevel=0.006)
    b.part("ToqueCrown", "body", ("bone", 3), "head", [
        (cylinder, dict(z0=H1 + 0.02, z1=H1 + 0.07, r0=0.13, r1=0.14, segments=10)),
    ], bevel=0.02)


@piece
def apron_long(b: Builder, spec: dict) -> None:
    """A long cream apron: a bib on the chest and a skirt to below the knees."""
    c = spec["apron"]
    b.part("ApronBib", "body", c, "chest", [
        (frustum, dict(z0=CHEST[0], z1=CHEST[1] - 0.06, bottom=(0.30, 0.02), top=(0.22, 0.02), offset=(0, 0.112))),
    ], bevel=0.004)
    b.part("ApronSkirt", "body", c, "hips", [
        (frustum, dict(z0=0.40, z1=HIPS[1], bottom=(0.42, 0.04), top=(0.33, 0.03), offset=(0, 0.16),
                       top_offset=(0, 0.118))),
        (frustum, dict(z0=0.98, z1=1.03, bottom=(0.35, 0.235), top=(0.35, 0.235))),  # the tie band
    ], bevel=0.004)


@piece
def flour(b: Builder, spec: dict) -> None:
    for s, x in (("R", 1), ("L", -1)):
        b.part(f"Flour.{s}", "body", ("bone", 3), f"forearm.{s}", [
            (box, dict(center=(x * 0.215, 0.045, 0.86), size=(0.05, 0.02, 0.07))),
        ], bevel=0)


@piece
def basket(b: Builder, spec: dict) -> None:
    """A wicker basket of loaves on the left hip; the crusts are the look's accent."""
    b.part("Basket", "body", ("wood", 4), "hips", [
        (frustum, dict(z0=0.80, z1=0.93, bottom=(0.16, 0.20), top=(0.22, 0.26), offset=(-0.29, 0.04))),
        (rod, dict(a=(-0.29, -0.06, 0.92), b=(-0.29, 0.04, 1.03), width=0.02)),
        (rod, dict(a=(-0.29, 0.04, 1.03), b=(-0.29, 0.14, 0.92), width=0.02)),
    ], bevel=0.008)
    b.part("Loaves", "body", ("brass", 2), "hips", [
        (box, dict(center=(-0.32, 0.02, 0.95), size=(0.09, 0.16, 0.06))),
        (box, dict(center=(-0.25, 0.08, 0.955), size=(0.08, 0.13, 0.06))),
    ], bevel=0.015)


# ---------------------------------------------------------------- the Detective


@piece
def fedora(b: Builder, spec: dict) -> None:
    c = spec["hat"]
    _hat_brim(b, "FedoraBrim", c, H1 - 0.07, 0.36, 0.38)
    b.part("FedoraCrown", "body", c, "head", [
        (frustum, dict(z0=H1 - 0.06, z1=H1 + 0.08, bottom=(0.24, 0.26), top=(0.20, 0.19))),
    ], bevel=0.012)
    b.part("FedoraBand", "body", ("ink", 0), "head", [
        (frustum, dict(z0=H1 - 0.05, z1=H1 - 0.02, bottom=(0.245, 0.265), top=(0.24, 0.26))),
    ], bevel=0)


@piece
def magnifier(b: Builder, spec: dict) -> None:
    """A brass magnifier in the right hand, its lens a lantern glint (the accent)."""
    b.part("MagHandle", "body", ("brass", 1), "prop.R", [
        (rod, dict(a=(0.215, 0.03, 0.62), b=(0.215, 0.09, 0.50), width=0.025)),
        (frustum, dict(z0=0.42, z1=0.54, bottom=(0.03, 0.12), top=(0.03, 0.12), offset=(0.215, 0.12))),
    ], bevel=0)
    b.part("MagLens", "body", ("lantern", 3), "prop.R", [
        (frustum, dict(z0=0.44, z1=0.52, bottom=(0.04, 0.08), top=(0.04, 0.08), offset=(0.215, 0.12))),
    ], bevel=0, glow=True)


# ---------------------------------------------------------------- the Doctor


@piece
def top_hat(b: Builder, spec: dict) -> None:
    c = spec["hat"]
    _hat_brim(b, "TopHatBrim", c, H1 - 0.06, 0.32, 0.34)
    b.part("TopHatCrown", "body", c, "head", [
        (cylinder, dict(z0=H1 - 0.05, z1=H1 + 0.08, r0=0.115, r1=0.12, segments=10, squash=1.05)),
    ], bevel=0.008)


@piece
def spectacles(b: Builder, spec: dict) -> None:
    b.part("Spectacles", "body", ("brass", 1), "head", [
        (box, dict(center=(0.05, 0.13, H0 + 0.175), size=(0.06, 0.015, 0.05))),
        (box, dict(center=(-0.05, 0.13, H0 + 0.175), size=(0.06, 0.015, 0.05))),
    ], bevel=0)


@piece
def whiskers(b: Builder, spec: dict) -> None:
    b.part("Whiskers", "body", spec["hair"], "head", [
        (box, dict(center=(0.10, 0.06, H0 + 0.09), size=(0.04, 0.10, 0.12))),
        (box, dict(center=(-0.10, 0.06, H0 + 0.09), size=(0.04, 0.10, 0.12))),
        (box, dict(center=(0.0, 0.12, H0 + 0.07), size=(0.10, 0.03, 0.03))),
    ], bevel=0.006)


@piece
def waistcoat(b: Builder, spec: dict) -> None:
    b.part("Waistcoat", "body", spec["shirt"], "chest", [
        (frustum, dict(z0=CHEST[0] - 0.02, z1=CHEST[1] - 0.04, bottom=(0.20, 0.02), top=(0.15, 0.02),
                       offset=(0, 0.108))),
    ], bevel=0.004)
    b.part("WatchChain", "body", ("brass", 2), "chest", [
        (box, dict(center=(0.04, 0.122, 1.08), size=(0.10, 0.01, 0.015))),
    ], bevel=0)


@piece
def doctor_bag(b: Builder, spec: dict) -> None:
    """A squat black bag held low in the left hand, a brass clasp."""
    b.part("Bag", "body", ("ink", 1), "prop.L", [
        (frustum, dict(z0=0.36, z1=0.56, bottom=(0.12, 0.26), top=(0.10, 0.20), offset=(-0.235, 0.05))),
        (rod, dict(a=(-0.235, -0.02, 0.56), b=(-0.235, 0.05, 0.62), width=0.02)),
        (rod, dict(a=(-0.235, 0.05, 0.62), b=(-0.235, 0.12, 0.56), width=0.02)),
    ], bevel=0.012)
    b.part("BagClasp", "body", ("brass", 2), "prop.L", [
        (box, dict(center=(-0.235, 0.05, 0.565), size=(0.11, 0.05, 0.02))),
    ], bevel=0)


# ---------------------------------------------------------------- the Vicar


@piece
def cassock(b: Builder, spec: dict) -> None:
    """An ankle-length cassock as one dark mass, with bone cuffs."""
    c = spec["coat"]
    b.part("Cassock", "body", c, "hips", [
        (frustum, dict(z0=0.10, z1=HIPS[1], bottom=(0.46, 0.34), top=(0.33, 0.22))),
    ])
    for s, x in (("R", 1), ("L", -1)):
        b.part(f"Cuff.{s}", "body", ("bone", 2), f"forearm.{s}", [
            (box, dict(center=(x * 0.215, 0, WRIST_Z + 0.025), size=(0.105, 0.105, 0.04))),
        ], bevel=0.004)


@piece
def collar_band(b: Builder, spec: dict) -> None:
    b.part("CollarBand", "body", ("bone", 2), "neck", [
        (box, dict(center=(0.0, 0.05, 1.31), size=(0.05, 0.03, 0.05))),
    ], bevel=0)


@piece
def shovel_hat(b: Builder, spec: dict) -> None:
    """A wide shovel hat: a long brim rolled up at the sides, a low round crown; reads from all 8 directions."""
    c = spec["hat"]
    _hat_brim(b, "ShovelBrim", c, H1 - 0.075, 0.40, 0.52, thick=0.03)
    b.part("ShovelRoll", "body", c, "head", [
        (box, dict(center=(0.19, 0.0, H1 - 0.03), size=(0.03, 0.30, 0.06))),
        (box, dict(center=(-0.19, 0.0, H1 - 0.03), size=(0.03, 0.30, 0.06))),
    ], bevel=0.006)
    b.part("ShovelCrown", "body", c, "head", [
        (cylinder, dict(z0=H1 - 0.05, z1=H1 + 0.05, r0=0.12, r1=0.10, segments=10)),
    ], bevel=0.02)


@piece
def fringe(b: Builder, spec: dict) -> None:
    """A fringe of hair round a bald crown (under the hat)."""
    b.part("Fringe", "body", spec["hair"], "head", [
        (box, dict(center=(0.0, -0.11, H0 + 0.15), size=(0.24, 0.05, 0.10))),
        (box, dict(center=(0.11, -0.02, H0 + 0.17), size=(0.04, 0.16, 0.08))),
        (box, dict(center=(-0.11, -0.02, H0 + 0.17), size=(0.04, 0.16, 0.08))),
    ], bevel=0.006)


@piece
def prayer_book(b: Builder, spec: dict) -> None:
    """A small prayer book at the chest: bone pages, ink boards, a brass clasp. It rides the chest bone, so
    it stays at the chest whatever the arms do."""
    b.part("BookBoards", "body", ("ink", 1), "chest", [
        (box, dict(center=(0.05, 0.15, 1.12), size=(0.13, 0.05, 0.17))),
    ], bevel=0.006)
    b.part("BookPages", "body", ("bone", 2), "chest", [
        (box, dict(center=(0.05, 0.15, 1.205), size=(0.12, 0.035, 0.012))),
    ], bevel=0)
    b.part("BookClasp", "body", ("brass", 2), "chest", [
        (box, dict(center=(0.11, 0.15, 1.12), size=(0.02, 0.055, 0.04))),
    ], bevel=0)
