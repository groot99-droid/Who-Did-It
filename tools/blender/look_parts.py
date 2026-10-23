"""Shapes, materials and the part builder of the looks (art plan 4.2-4.3; ASSETS 6.3; round 8 art.md 2).

Every part is a chamfered box or a tapered box, flat-shaded, with one world-palette toon material
whose light and shadow bands are its ramp neighbours (rig_common.ramp_shades). Each part is
parented rigidly to one bone of the 22-bone armature of build_looks.py and tagged `wdi_part`
(`body`, `scarf` or `blood`). Costume pieces of the looks are functions of this module too; a look
lists them by name in looks_spec.py.

Round 8 (8F, DECISIONS A161): the base is about four heads tall with wide shoulders, big hands and
boots, a face of nose, brow and jaw (no drawn eyes), and every look carries layered cloth with a
tattered or stitched hem, a belt with pouches, one signature prop, and a back dressed as fully as the
front, so the figure reads in black from all eight directions (art.md 1, references 1, 3, 4, 10).

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


def teeth(bm, z, w, d, depth=0.07, count=8, offset=(0.0, 0.0), width=0.06):
    """A jagged hem (round 8): `count` small wedges hanging `depth` below the rectangle (w, d) at z,
    spaced round its perimeter, so a coat or shawl ends in a notched line in every direction."""
    ox, oy = offset
    per = 2 * (w + d)
    for i in range(count):
        t = (i + 0.5) / count * per
        if t < w:
            cx, cy = ox - w / 2 + t, oy + d / 2
        elif t < w + d:
            cx, cy = ox + w / 2, oy + d / 2 - (t - w)
        elif t < 2 * w + d:
            cx, cy = ox + w / 2 - (t - w - d), oy - d / 2
        else:
            cx, cy = ox - w / 2, oy - d / 2 + (t - 2 * w - d)
        frustum(bm, z - depth, z, (width * 0.4, width * 0.4), (width, width), (cx, cy))


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

# 1.7 m and about four heads tall (round 8, art.md 2): a 0.40 m head, shoulders 0.52 m, hips 0.38 m,
# the crotch at 0.78 m, hands 0.20 m long and 0.11 m wide, boots 0.30 m long. The height stays 1.7 m
# so the 112 px silhouette cap of SPRITES 10.3 and the GDD 3.1 height factors hold unchanged.
HEIGHT = 1.70
HEAD = (1.30, 1.70)  # chin to crown
HEAD_W, HEAD_D = 0.28, 0.28
NECK = (1.24, 1.31)
CHEST = (0.96, 1.26)  # waist to shoulder line
SHOULDER_W = 0.52
SPINE = (0.92, 1.06)  # the hips bone ends and the chest bone starts
HIPS = (0.78, 0.98)
HIP_W = 0.38
CROTCH = 0.78
KNEE = 0.42
ANKLE = 0.10
SHOULDER_X, ELBOW_X, HAND_X = 0.24, 0.27, 0.28
CLAVICLE_Z, ELBOW_Z, WRIST_Z, HAND_LEN = 1.21, 0.95, 0.73, 0.20
HAND_W = 0.11
PROP_Z = 0.62  # the prop bone under each hand
LEG_X = 0.11
BOOT_LEN, BOOT_W = 0.30, 0.14
BELT_Z = (0.94, 1.01)

# Costume pieces, by name, as functions (builder, spec) -> None; looks_spec.py lists them per look.
PIECES: dict = {}


def piece(fn):
    PIECES[fn.__name__] = fn
    return fn


H0, H1 = HEAD
C0, C1 = CHEST


def sides():
    return (("R", 1), ("L", -1))


# ---------------------------------------------------------------- hair


@piece
def hair_short(b: Builder, spec: dict) -> None:
    """Close-cropped hair: a cap over the crown and the back of the head."""
    b.part("Hair", "body", spec["hair"], "head", [
        (frustum, dict(z0=H1 - 0.13, z1=H1 + 0.015, bottom=(HEAD_W + 0.02, HEAD_D + 0.01), top=(0.26, 0.25),
                       offset=(0, -0.015))),
        (box, dict(center=(0.0, -0.135, H0 + 0.22), size=(0.28, 0.06, 0.20))),
    ])


@piece
def hair_bun(b: Builder, spec: dict) -> None:
    """Hair tied back into a bun at the nape."""
    hair_short(b, spec)
    b.part("Bun", "body", spec["hair"], "head", [(box, dict(center=(0.0, -0.18, H0 + 0.14), size=(0.12, 0.09, 0.11)))])


@piece
def hair_wisps(b: Builder, spec: dict) -> None:
    b.part("Wisps", "body", spec["hair"], "head", [
        (box, dict(center=(0.11, 0.11, H0 + 0.28), size=(0.06, 0.05, 0.07))),
        (box, dict(center=(-0.11, 0.11, H0 + 0.28), size=(0.06, 0.05, 0.07))),
    ], bevel=0.004)


@piece
def fringe(b: Builder, spec: dict) -> None:
    """A fringe of hair round a bald crown (under the hat)."""
    b.part("Fringe", "body", spec["hair"], "head", [
        (box, dict(center=(0.0, -0.13, H0 + 0.17), size=(0.28, 0.06, 0.12))),
        (box, dict(center=(0.14, -0.02, H0 + 0.19), size=(0.05, 0.20, 0.10))),
        (box, dict(center=(-0.14, -0.02, H0 + 0.19), size=(0.05, 0.20, 0.10))),
    ], bevel=0.006)


@piece
def plait(b: Builder, spec: dict) -> None:
    hair_short(b, spec)
    b.part("Plait", "body", spec["hair"], "head", [
        (rod, dict(a=(0.0, -0.16, H0 + 0.14), b=(0.03, -0.20, H0 - 0.26), width=0.06)),
    ], bevel=0)


# ---------------------------------------------------------------- faces: beards and whiskers in blocks


@piece
def beard(b: Builder, spec: dict) -> None:
    """A full beard falling in two blocks from the jaw (reference 1)."""
    b.part("Beard", "body", spec["hair"], "head", [
        (frustum, dict(z0=H0 - 0.10, z1=H0 + 0.12, bottom=(0.16, 0.10), top=(0.28, 0.13), offset=(0, 0.10))),
        (frustum, dict(z0=H0 - 0.17, z1=H0 - 0.09, bottom=(0.08, 0.07), top=(0.14, 0.09), offset=(0, 0.10))),
    ], bevel=0.01)


@piece
def whiskers(b: Builder, spec: dict) -> None:
    b.part("Whiskers", "body", spec["hair"], "head", [
        (box, dict(center=(0.13, 0.07, H0 + 0.11), size=(0.05, 0.12, 0.14))),
        (box, dict(center=(-0.13, 0.07, H0 + 0.11), size=(0.05, 0.12, 0.14))),
        (box, dict(center=(0.0, 0.15, H0 + 0.09), size=(0.13, 0.035, 0.035))),
    ], bevel=0.006)


@piece
def moustache(b: Builder, spec: dict) -> None:
    b.part("Moustache", "body", spec["hair"], "head", [
        (box, dict(center=(0.0, 0.16, H0 + 0.105), size=(0.17, 0.035, 0.04))),
    ], bevel=0.006)


# ---------------------------------------------------------------- shared costume pieces


def _hat_brim(b, name, colour, z, w, d, thick=0.025, offset=(0.0, 0.0)):
    b.part(name, "body", colour, "head", [
        (frustum, dict(z0=z, z1=z + thick, bottom=(w, d), top=(w - 0.01, d - 0.01), offset=offset)),
    ], bevel=0.006)


def _pouch(b, name, colour, bone, center, size=(0.09, 0.06, 0.10)):
    """A belt pouch with a flap, round 8: the small kit of a trade (references 3, 4)."""
    w, d, h = size
    cx, cy, cz = center
    b.part(name, "body", colour, bone, [
        (box, dict(center=center, size=size)),
        (box, dict(center=(cx, cy, cz + h / 2 - 0.015), size=(w + 0.015, d + 0.015, 0.03))),
    ], bevel=0.006)


@piece
def long_coat(b: Builder, spec: dict) -> None:
    """A knee-length coat skirt over the hips (trench, frock coat, greatcoat, smock), split at the back,
    with a tattered hem."""
    c = spec.get("coat", spec["jacket"])
    hem = spec.get("coat_hem", 0.44)
    b.part("CoatSkirt", "body", c, "hips", [
        (frustum, dict(z0=hem, z1=HIPS[1], bottom=(0.50, 0.36), top=(0.38, 0.26))),
        (teeth, dict(z=hem, w=0.50, d=0.36, depth=0.06, count=10, width=0.07)),
    ])
    # The back vent: a darker strip up the middle of the back.
    b.part("CoatVent", "body", (c[0], max(0, c[1] - 1)), "hips", [
        (box, dict(center=(0.0, -0.185, (hem + HIPS[1]) / 2), size=(0.03, 0.01, HIPS[1] - hem - 0.02))),
    ], bevel=0)


@piece
def belt(b: Builder, spec: dict) -> None:
    """A wide belt with a brass buckle at the front and a pouch on each hip."""
    c = spec.get("belt", ("ink", 0))
    b.part("Belt", "body", c, "spine", [
        (frustum, dict(z0=BELT_Z[0], z1=BELT_Z[1], bottom=(0.40, 0.27), top=(0.40, 0.27))),
    ], bevel=0.004)
    b.part("Buckle", "body", ("brass", 2), "spine", [
        (box, dict(center=(0.0, 0.14, (BELT_Z[0] + BELT_Z[1]) / 2), size=(0.06, 0.015, 0.05))),
    ], bevel=0)
    _pouch(b, "Pouch.R", c, "hips", (0.17, -0.06, 0.90))
    _pouch(b, "Pouch.L", c, "hips", (-0.19, 0.02, 0.89), size=(0.07, 0.10, 0.09))


@piece
def collar_up(b: Builder, spec: dict) -> None:
    """A turned-up coat collar behind and beside the neck (under the scarf)."""
    c = spec.get("coat", spec["jacket"])
    b.part("Collar", "body", c, "chest", [
        (frustum, dict(z0=C1 - 0.04, z1=C1 + 0.10, bottom=(0.34, 0.24), top=(0.30, 0.20), offset=(0, -0.03))),
    ], bevel=0.006)


@piece
def gloves(b: Builder, spec: dict) -> None:
    for s, x in sides():
        b.part(f"Glove.{s}", "body", spec["gloves"], f"hand.{s}", [
            (frustum, dict(z0=WRIST_Z - HAND_LEN - 0.004, z1=WRIST_Z + 0.03, bottom=(HAND_W - 0.01, HAND_W),
                           top=(HAND_W + 0.03, HAND_W + 0.03), offset=(x * HAND_X, 0.01))),
        ])


@piece
def pack(b: Builder, spec: dict) -> None:
    """A rolled pack across the shoulders at the back, with two straps over the chest (references 3, 4)."""
    c = spec.get("pack", ("wood", 2))
    b.part("Pack", "body", c, "chest", [
        (box, dict(center=(0.0, -0.21, C1 - 0.10), size=(0.36, 0.14, 0.14))),
    ], bevel=0.02)
    b.part("PackStraps", "body", ("ink", 0), "chest", [
        (rod, dict(a=(0.14, 0.13, C1 - 0.02), b=(0.14, -0.16, C1 - 0.08), width=0.03)),
        (rod, dict(a=(-0.14, 0.13, C1 - 0.02), b=(-0.14, -0.16, C1 - 0.08), width=0.03)),
    ], bevel=0)


# ---------------------------------------------------------------- the Baker


@piece
def toque(b: Builder, spec: dict) -> None:
    """A tall pleated toque: a band and a puffed crown 0.03 m above the head; with the crown's depth it tops
    out just under the 112 px silhouette cap (SPRITES 1, 10.3)."""
    b.part("ToqueBand", "body", ("bone", 2), "head", [
        (cylinder, dict(z0=H1 - 0.08, z1=H1 + 0.01, r0=0.155, r1=0.16, segments=10)),
    ], bevel=0.006)
    b.part("ToqueCrown", "body", ("bone", 3), "head", [
        (cylinder, dict(z0=H1 + 0.00, z1=H1 + 0.03, r0=0.16, r1=0.17, segments=10)),
    ], bevel=0.02)


@piece
def apron_long(b: Builder, spec: dict) -> None:
    """A long cream apron: a bib on the chest, a skirt to below the knees and the tie bow at the back."""
    c = spec["apron"]
    b.part("ApronBib", "body", c, "chest", [
        (frustum, dict(z0=C0, z1=C1 - 0.07, bottom=(0.34, 0.02), top=(0.24, 0.02), offset=(0, 0.13))),
    ], bevel=0.004)
    b.part("ApronSkirt", "body", c, "hips", [
        (frustum, dict(z0=0.36, z1=HIPS[1], bottom=(0.48, 0.04), top=(0.38, 0.03), offset=(0, 0.19),
                       top_offset=(0, 0.14))),
        (frustum, dict(z0=0.95, z1=1.00, bottom=(0.41, 0.28), top=(0.41, 0.28))),  # the tie band
        (box, dict(center=(0.0, -0.16, 0.95), size=(0.12, 0.04, 0.05))),  # the bow at the back
        (box, dict(center=(0.0, -0.17, 0.86), size=(0.05, 0.02, 0.14))),  # its tails
    ], bevel=0.004)


@piece
def flour(b: Builder, spec: dict) -> None:
    for s, x in sides():
        b.part(f"Flour.{s}", "body", ("bone", 3), f"forearm.{s}", [
            (box, dict(center=(x * HAND_X, 0.055, 0.83), size=(0.06, 0.02, 0.08))),
        ], bevel=0)


@piece
def peel(b: Builder, spec: dict) -> None:
    """The Baker's long wooden peel over the right shoulder (the signature prop, art.md 2), its blade
    behind the shoulder at ear height with a golden loaf on it (the accent); no higher, or the 112 px cap
    (SPRITES 1) clips it in the views that put it behind the figure."""
    b.part("PeelHaft", "body", ("wood", 2), "chest", [
        (rod, dict(a=(0.22, 0.30, 0.90), b=(0.21, -0.22, 1.30), width=0.035)),
    ], bevel=0)
    b.part("PeelBlade", "body", ("wood", 3), "chest", [
        (frustum, dict(z0=1.28, z1=1.52, bottom=(0.16, 0.03), top=(0.20, 0.02), offset=(0.21, -0.24),
                       top_offset=(0.21, -0.33))),
    ], bevel=0.004)
    b.part("Loaf", "body", ("brass", 2), "chest", [
        (box, dict(center=(0.21, -0.25, 1.40), size=(0.11, 0.05, 0.07))),
    ], bevel=0.015)


# ---------------------------------------------------------------- the Detective


@piece
def fedora(b: Builder, spec: dict) -> None:
    c = spec["hat"]
    _hat_brim(b, "FedoraBrim", c, H1 - 0.08, 0.40, 0.42)
    b.part("FedoraCrown", "body", c, "head", [
        (frustum, dict(z0=H1 - 0.07, z1=H1 + 0.03, bottom=(0.30, 0.31), top=(0.25, 0.23), offset=(0, 0.0),
                       top_offset=(0, -0.01))),
    ], bevel=0.012)
    b.part("FedoraBand", "body", ("ink", 0), "head", [
        (frustum, dict(z0=H1 - 0.06, z1=H1 - 0.03, bottom=(0.305, 0.315), top=(0.30, 0.31))),
    ], bevel=0)


@piece
def magnifier(b: Builder, spec: dict) -> None:
    """A brass magnifier in the left hand (the right hand swings), its lens a lantern glint (the accent)."""
    x = -HAND_X
    b.part("MagHandle", "body", ("brass", 1), "prop.L", [
        (rod, dict(a=(x, 0.03, PROP_Z - 0.02), b=(x, 0.10, PROP_Z - 0.16), width=0.03)),
        (frustum, dict(z0=PROP_Z - 0.24, z1=PROP_Z - 0.10, bottom=(0.035, 0.15), top=(0.035, 0.15), offset=(x, 0.13))),
    ], bevel=0)
    b.part("MagLens", "body", ("lantern", 3), "prop.L", [
        (frustum, dict(z0=PROP_Z - 0.22, z1=PROP_Z - 0.12, bottom=(0.045, 0.10), top=(0.045, 0.10), offset=(x, 0.13))),
    ], bevel=0, glow=True)


@piece
def notebook(b: Builder, spec: dict) -> None:
    """A notebook in the breast pocket, its pencil showing."""
    b.part("Notebook", "body", ("bone", 1), "chest", [
        (box, dict(center=(-0.12, 0.14, C1 - 0.12), size=(0.08, 0.02, 0.09))),
    ], bevel=0)
    b.part("Pencil", "body", ("brass", 1), "chest", [
        (box, dict(center=(-0.10, 0.145, C1 - 0.06), size=(0.015, 0.015, 0.05))),
    ], bevel=0)


# ---------------------------------------------------------------- the Doctor


@piece
def top_hat(b: Builder, spec: dict) -> None:
    c = spec["hat"]
    _hat_brim(b, "TopHatBrim", c, H1 - 0.07, 0.38, 0.40)
    b.part("TopHatCrown", "body", c, "head", [
        (cylinder, dict(z0=H1 - 0.06, z1=H1 + 0.03, r0=0.14, r1=0.15, segments=10, squash=1.05)),
    ], bevel=0.008)
    b.part("TopHatBand", "body", ("slate", 0), "head", [
        (cylinder, dict(z0=H1 - 0.055, z1=H1 - 0.025, r0=0.143, r1=0.143, segments=10, squash=1.05)),
    ], bevel=0)


@piece
def spectacles(b: Builder, spec: dict) -> None:
    b.part("Spectacles", "body", ("brass", 1), "head", [
        (box, dict(center=(0.065, 0.15, H0 + 0.20), size=(0.07, 0.015, 0.055))),
        (box, dict(center=(-0.065, 0.15, H0 + 0.20), size=(0.07, 0.015, 0.055))),
    ], bevel=0)


@piece
def waistcoat(b: Builder, spec: dict) -> None:
    """The front panel of a waistcoat with a watch chain; `waistcoat` names its colour, else the shirt's."""
    b.part("Waistcoat", "body", spec.get("waistcoat", spec["shirt"]), "chest", [
        (frustum, dict(z0=C0 - 0.02, z1=C1 - 0.05, bottom=(0.24, 0.02), top=(0.17, 0.02), offset=(0, 0.125))),
    ], bevel=0.004)
    b.part("WatchChain", "body", ("brass", 2), "chest", [
        (box, dict(center=(0.05, 0.14, C0 + 0.07), size=(0.12, 0.01, 0.015))),
        (box, dict(center=(0.10, 0.14, C0 + 0.075), size=(0.03, 0.012, 0.03))),  # the fob
    ], bevel=0)


@piece
def doctor_bag(b: Builder, spec: dict) -> None:
    """A squat black bag held low in the left hand, a brass clasp and corner studs."""
    x = -HAND_X - 0.03
    b.part("Bag", "body", ("ink", 1), "prop.L", [
        (frustum, dict(z0=PROP_Z - 0.30, z1=PROP_Z - 0.06, bottom=(0.14, 0.30), top=(0.12, 0.22), offset=(x, 0.05))),
        (rod, dict(a=(x, -0.03, PROP_Z - 0.06), b=(x, 0.05, PROP_Z + 0.01), width=0.022)),
        (rod, dict(a=(x, 0.05, PROP_Z + 0.01), b=(x, 0.13, PROP_Z - 0.06), width=0.022)),
    ], bevel=0.012)
    b.part("BagClasp", "body", ("brass", 2), "prop.L", [
        (box, dict(center=(x, 0.05, PROP_Z - 0.055), size=(0.13, 0.06, 0.02))),
        (box, dict(center=(x, -0.08, PROP_Z - 0.29), size=(0.06, 0.03, 0.02))),
        (box, dict(center=(x, 0.18, PROP_Z - 0.29), size=(0.06, 0.03, 0.02))),
    ], bevel=0)


# ---------------------------------------------------------------- the Vicar


@piece
def cassock(b: Builder, spec: dict) -> None:
    """An ankle-length cassock as one dark mass with a row of buttons, bone cuffs and a cincture whose
    tails hang down the back."""
    c = spec["coat"]
    b.part("Cassock", "body", c, "hips", [
        (frustum, dict(z0=0.10, z1=HIPS[1], bottom=(0.54, 0.40), top=(0.38, 0.26))),
    ])
    b.part("Buttons", "body", ("ink", 0), "hips", [
        (box, dict(center=(0.0, 0.16, z), size=(0.025, 0.02, 0.025))) for z in (0.52, 0.62, 0.72, 0.82, 0.92)
    ], bevel=0)
    b.part("Cincture", "body", ("slate", 1), "spine", [
        (frustum, dict(z0=BELT_Z[0], z1=BELT_Z[1] + 0.02, bottom=(0.41, 0.28), top=(0.41, 0.28))),
        (box, dict(center=(0.06, -0.17, 0.80), size=(0.05, 0.02, 0.26))),  # the tails at the back
        (box, dict(center=(0.12, -0.17, 0.84), size=(0.05, 0.02, 0.18))),
    ], bevel=0.004)
    for s, x in sides():
        b.part(f"Cuff.{s}", "body", ("bone", 2), f"forearm.{s}", [
            (box, dict(center=(x * HAND_X, 0, WRIST_Z + 0.03), size=(0.135, 0.135, 0.05))),
        ], bevel=0.004)


@piece
def collar_band(b: Builder, spec: dict) -> None:
    b.part("CollarBand", "body", ("bone", 2), "neck", [
        (box, dict(center=(0.0, 0.065, NECK[0] + 0.025), size=(0.07, 0.03, 0.05))),
    ], bevel=0)


@piece
def shovel_hat(b: Builder, spec: dict) -> None:
    """A wide shovel hat: a long brim rolled up at the sides, a low round crown; reads from all 8 directions.
    The brim is as long as the 112 px cap allows: its far end lifts on screen in the side views (SPRITES 1)."""
    c = spec["hat"]
    _hat_brim(b, "ShovelBrim", c, H1 - 0.085, 0.46, 0.52, thick=0.03)
    b.part("ShovelRoll", "body", c, "head", [
        (box, dict(center=(0.22, 0.0, H1 - 0.055), size=(0.035, 0.28, 0.06))),
        (box, dict(center=(-0.22, 0.0, H1 - 0.055), size=(0.035, 0.28, 0.06))),
    ], bevel=0.006)
    b.part("ShovelCrown", "body", c, "head", [
        (cylinder, dict(z0=H1 - 0.06, z1=H1 + 0.03, r0=0.15, r1=0.12, segments=10)),
    ], bevel=0.02)


@piece
def prayer_book(b: Builder, spec: dict) -> None:
    """A small prayer book at the chest: bone pages, ink boards, a brass clasp. It rides the chest bone, so
    it stays at the chest whatever the arms do."""
    b.part("BookBoards", "body", ("ink", 1), "chest", [
        (box, dict(center=(0.06, 0.17, C0 + 0.12), size=(0.15, 0.06, 0.20))),
    ], bevel=0.006)
    b.part("BookPages", "body", ("bone", 2), "chest", [
        (box, dict(center=(0.06, 0.17, C0 + 0.225), size=(0.14, 0.04, 0.014))),
    ], bevel=0)
    b.part("BookClasp", "body", ("brass", 2), "chest", [
        (box, dict(center=(0.13, 0.17, C0 + 0.12), size=(0.025, 0.065, 0.05))),
    ], bevel=0)


# ---------------------------------------------------------------- the Watchman


@piece
def shoulder_cape(b: Builder, spec: dict) -> None:
    """A short cape over the shoulders, to the elbows, its hem notched."""
    b.part("ShoulderCape", "body", spec["cape"], "chest", [
        (frustum, dict(z0=1.00, z1=C1 + 0.02, bottom=(0.66, 0.40), top=(0.34, 0.26))),
        (teeth, dict(z=1.00, w=0.66, d=0.40, depth=0.05, count=10, width=0.07)),
    ], bevel=0.01)


@piece
def helmet(b: Builder, spec: dict) -> None:
    """A domed watchman's helmet with a short brim, a comb and a brass badge."""
    c = spec["hat"]
    _hat_brim(b, "HelmetBrim", c, H1 - 0.11, 0.36, 0.40, thick=0.02)
    b.part("HelmetDome", "body", c, "head", [
        (cylinder, dict(z0=H1 - 0.10, z1=H1 + 0.02, r0=0.16, r1=0.135, segments=10)),
        (cylinder, dict(z0=H1 + 0.02, z1=H1 + 0.05, r0=0.135, r1=0.06, segments=10)),
    ], bevel=0.01)
    b.part("HelmetBadge", "body", ("brass", 2), "head", [
        (box, dict(center=(0.0, 0.155, H1 - 0.03), size=(0.05, 0.015, 0.06))),
    ], bevel=0)


@piece
def rattle(b: Builder, spec: dict) -> None:
    b.part("Rattle", "body", ("wood", 3), "hips", [
        (box, dict(center=(0.22, 0.07, 0.88), size=(0.05, 0.09, 0.16))),
    ], bevel=0.006)


@piece
def truncheon(b: Builder, spec: dict) -> None:
    """A truncheon hung at the back of the belt (the Watchman's back)."""
    b.part("Truncheon", "body", ("wood", 1), "hips", [
        (rod, dict(a=(-0.10, -0.19, 0.96), b=(-0.14, -0.20, 0.66), width=0.04)),
    ], bevel=0)


@piece
def pole_lantern(b: Builder, spec: dict) -> None:
    """A lantern on a tall pole in the left hand, beside the head (as high as the 112 px cap allows, SPRITES 1); its glass glows in every frame (the accent)."""
    x = -HAND_X
    b.part("LanternPole", "body", ("wood", 2), "prop.L", [
        (rod, dict(a=(x, 0.06, 0.12), b=(x, 0.06, 1.47), width=0.035)),
    ], bevel=0)
    b.part("LanternFrame", "body", ("ink", 1), "prop.L", [
        (box, dict(center=(x, 0.06, 1.49), size=(0.14, 0.14, 0.02))),
        (box, dict(center=(x, 0.06, 1.62), size=(0.12, 0.12, 0.03))),
    ], bevel=0)
    b.part("LanternGlass", "body", ("lantern", 3), "prop.L", [
        (box, dict(center=(x, 0.06, 1.555), size=(0.10, 0.10, 0.11))),
    ], bevel=0, glow=True)


# ---------------------------------------------------------------- the Herbalist


@piece
def hood_shawl(b: Builder, spec: dict) -> None:
    """A hooded shawl, hood up: the hood frames the face, the shawl covers the shoulders in a ragged hem."""
    c = spec["hood"]
    b.part("Hood", "body", c, "head", [
        (frustum, dict(z0=H0 - 0.02, z1=H1 + 0.01, bottom=(0.36, 0.36), top=(0.27, 0.28), offset=(0, -0.03))),
    ], bevel=0.02)
    b.part("Shawl", "body", c, "chest", [
        (frustum, dict(z0=1.02, z1=C1 + 0.03, bottom=(0.60, 0.38), top=(0.34, 0.28))),
        (teeth, dict(z=1.02, w=0.60, d=0.38, depth=0.06, count=10, width=0.08)),
    ], bevel=0.012)


@piece
def skirt_long(b: Builder, spec: dict) -> None:
    b.part("Skirt", "body", spec["coat"], "hips", [
        (frustum, dict(z0=0.16, z1=HIPS[1], bottom=(0.52, 0.40), top=(0.38, 0.27))),
    ])


@piece
def apron_pockets(b: Builder, spec: dict) -> None:
    c = spec["apron"]
    b.part("Apron", "body", c, "hips", [
        (frustum, dict(z0=0.34, z1=HIPS[1] - 0.02, bottom=(0.50, 0.03), top=(0.40, 0.03), offset=(0, 0.21),
                       top_offset=(0, 0.145))),
    ], bevel=0.004)
    b.part("Pockets", "body", ("bone", 0), "hips", [
        (box, dict(center=(0.12, 0.195, 0.70), size=(0.12, 0.03, 0.11))),
        (box, dict(center=(-0.12, 0.195, 0.70), size=(0.12, 0.03, 0.11))),
    ], bevel=0)


@piece
def herbs(b: Builder, spec: dict) -> None:
    b.part("Herbs", "body", ("wood", 4), "hips", [
        (frustum, dict(z0=0.52, z1=0.70, bottom=(0.03, 0.03), top=(0.11, 0.06), offset=(0.15, 0.21))),
        (frustum, dict(z0=0.55, z1=0.70, bottom=(0.03, 0.03), top=(0.10, 0.06), offset=(-0.14, 0.21))),
    ], bevel=0)


@piece
def satchel(b: Builder, spec: dict) -> None:
    b.part("Satchel", "body", ("wood", 3), "hips", [
        (box, dict(center=(-0.28, -0.02, 0.84), size=(0.09, 0.22, 0.18))),
        (box, dict(center=(-0.28, -0.02, 0.92), size=(0.10, 0.23, 0.03))),  # the flap
    ], bevel=0.01)


@piece
def vials(b: Builder, spec: dict) -> None:
    """Two small vials at the belt, brass stoppers (the accent)."""
    b.part("Vials", "body", ("bone", 1), "hips", [
        (box, dict(center=(0.23, 0.09, 0.91), size=(0.04, 0.04, 0.08))),
        (box, dict(center=(0.23, 0.0, 0.91), size=(0.04, 0.04, 0.08))),
    ], bevel=0)
    b.part("Stoppers", "body", ("brass", 2), "hips", [
        (box, dict(center=(0.23, 0.09, 0.965), size=(0.045, 0.045, 0.03))),
        (box, dict(center=(0.23, 0.0, 0.965), size=(0.045, 0.045, 0.03))),
    ], bevel=0)


@piece
def back_basket(b: Builder, spec: dict) -> None:
    """The Herbalist's wicker basket on her back, bundles poking out of it (the signature prop)."""
    b.part("BackBasket", "body", ("wood", 3), "chest", [
        (frustum, dict(z0=C0 - 0.06, z1=C1 - 0.02, bottom=(0.26, 0.14), top=(0.32, 0.18), offset=(0, -0.24))),
    ], bevel=0.01)
    b.part("BasketStraps", "body", ("wood", 1), "chest", [
        (rod, dict(a=(0.13, 0.13, C1 - 0.02), b=(0.13, -0.17, C1 - 0.06), width=0.03)),
        (rod, dict(a=(-0.13, 0.13, C1 - 0.02), b=(-0.13, -0.17, C1 - 0.06), width=0.03)),
    ], bevel=0)
    b.part("BasketHerbs", "body", ("wood", 4), "chest", [
        (frustum, dict(z0=C1 - 0.04, z1=C1 + 0.12, bottom=(0.06, 0.05), top=(0.14, 0.09), offset=(0.06, -0.24))),
        (frustum, dict(z0=C1 - 0.04, z1=C1 + 0.09, bottom=(0.06, 0.05), top=(0.12, 0.08), offset=(-0.08, -0.25))),
    ], bevel=0)


# ---------------------------------------------------------------- the Gamekeeper


@piece
def gaiters(b: Builder, spec: dict) -> None:
    for s, x in sides():
        b.part(f"Gaiter.{s}", "body", ("wood", 2), f"shin.{s}", [
            (frustum, dict(z0=0.16, z1=0.40, bottom=(0.15, 0.16), top=(0.17, 0.18), offset=(x * LEG_X, 0))),
            (box, dict(center=(x * (LEG_X + 0.085), 0, 0.28), size=(0.01, 0.06, 0.20))),  # the buckle strip
        ], bevel=0.006)


@piece
def deerstalker(b: Builder, spec: dict) -> None:
    c = spec["hat"]
    b.part("DeerCrown", "body", c, "head", [
        (cylinder, dict(z0=H1 - 0.08, z1=H1 + 0.04, r0=0.165, r1=0.12, segments=10)),
    ], bevel=0.012)
    b.part("DeerPeaks", "body", c, "head", [
        (frustum, dict(z0=H1 - 0.08, z1=H1 - 0.055, bottom=(0.18, 0.14), top=(0.15, 0.12), offset=(0, 0.21))),
        (frustum, dict(z0=H1 - 0.08, z1=H1 - 0.055, bottom=(0.18, 0.14), top=(0.15, 0.12), offset=(0, -0.21))),
        (box, dict(center=(0.0, 0.0, H1 + 0.05), size=(0.06, 0.06, 0.025))),  # the tied flaps
        (box, dict(center=(0.17, 0.0, H1 - 0.04), size=(0.02, 0.12, 0.08))),  # the ear flaps, tied up
        (box, dict(center=(-0.17, 0.0, H1 - 0.04), size=(0.02, 0.12, 0.08))),
    ], bevel=0.004)


@piece
def game_bag(b: Builder, spec: dict) -> None:
    b.part("GameBag", "body", ("wood", 3), "hips", [
        (box, dict(center=(-0.26, 0.05, 0.82), size=(0.09, 0.26, 0.20))),
        (box, dict(center=(-0.26, 0.05, 0.91), size=(0.10, 0.27, 0.03))),
    ], bevel=0.012)
    b.part("BagStrap", "body", ("wood", 2), "chest", [
        (rod, dict(a=(0.19, 0.14, C1 + 0.02), b=(-0.22, 0.14, 0.98), width=0.035)),
        (rod, dict(a=(0.19, -0.14, C1 + 0.02), b=(-0.22, -0.14, 0.98), width=0.035)),
    ], bevel=0)


@piece
def snare(b: Builder, spec: dict) -> None:
    """A coil of snare wire and a pouch of pegs on the belt."""
    b.part("SnareCoil", "body", ("brass", 0), "hips", [
        (ring, dict(z=0.90, radius=0.05, tube=0.012, segments=8, center=(0.21, -0.08), squash=0.3)),
    ], bevel=0)
    _pouch(b, "PegPouch", ("wood", 2), "hips", (0.18, -0.13, 0.86), size=(0.08, 0.06, 0.09))


@piece
def fowling_piece(b: Builder, spec: dict) -> None:
    """A long fowling piece slung barrel-up over the right shoulder: ink barrel, brass fittings, wood stock."""
    b.part("GunStock", "body", ("wood", 3), "chest", [
        (rod, dict(a=(0.21, -0.18, 0.78), b=(0.22, -0.15, 1.10), width=0.07)),
    ], bevel=0)
    b.part("GunBarrel", "body", ("ink", 1), "chest", [
        (rod, dict(a=(0.22, -0.15, 1.10), b=(0.24, -0.10, 1.66), width=0.04)),
    ], bevel=0)
    b.part("GunFittings", "body", ("brass", 1), "chest", [
        (box, dict(center=(0.22, -0.15, 1.11), size=(0.07, 0.07, 0.05))),
    ], bevel=0)
    b.part("GunSling", "body", ("wood", 1), "chest", [
        (rod, dict(a=(0.20, -0.16, 0.86), b=(0.24, -0.11, 1.46), width=0.02)),
    ], bevel=0)


# ---------------------------------------------------------------- the Lamplighter


@piece
def oilskin_cape(b: Builder, spec: dict) -> None:
    """A short oilskin cape, hood down at the back, its hem ragged."""
    c = spec["cape"]
    b.part("Cape", "body", c, "chest", [
        (frustum, dict(z0=0.92, z1=C1 + 0.02, bottom=(0.64, 0.40), top=(0.34, 0.26))),
        (teeth, dict(z=0.92, w=0.64, d=0.40, depth=0.06, count=10, width=0.08)),
    ], bevel=0.01)
    b.part("HoodDown", "body", c, "chest", [
        (box, dict(center=(0.0, -0.17, C1 - 0.01), size=(0.26, 0.10, 0.12))),
    ], bevel=0.01)


@piece
def match_pouch(b: Builder, spec: dict) -> None:
    """A tin of matches on a strap at the hip and a coil of wick at the back."""
    b.part("MatchTin", "body", ("brass", 1), "hips", [
        (box, dict(center=(0.22, 0.04, 0.90), size=(0.05, 0.09, 0.07))),
    ], bevel=0.004)
    b.part("WickCoil", "body", ("bone", 0), "hips", [
        (ring, dict(z=0.88, radius=0.055, tube=0.014, segments=8, center=(-0.12, -0.20), squash=0.3)),
    ], bevel=0)


@piece
def lighting_pole(b: Builder, spec: dict) -> None:
    """A long brass-hooked pole carried at a forward slant over the right shoulder, a flame at its tip."""
    b.part("LightPole", "body", ("wood", 2), "chest", [
        (rod, dict(a=(0.24, -0.46, 0.94), b=(0.25, 0.24, 1.50), width=0.035)),
    ], bevel=0)
    b.part("LightHook", "body", ("brass", 2), "chest", [
        (rod, dict(a=(0.25, 0.24, 1.50), b=(0.25, 0.34, 1.55), width=0.028)),
        (rod, dict(a=(0.25, 0.34, 1.55), b=(0.25, 0.36, 1.46), width=0.028)),
    ], bevel=0)
    b.part("LightFlame", "body", ("lantern", 3), "chest", [
        (box, dict(center=(0.25, 0.36, 1.415), size=(0.045, 0.045, 0.07))),
    ], bevel=0, glow=True)


# ---------------------------------------------------------------- the Fisher


@piece
def sea_boots(b: Builder, spec: dict) -> None:
    for s, x in sides():
        b.part(f"SeaBoot.{s}", "body", ("ink", 0), f"shin.{s}", [
            (frustum, dict(z0=0.16, z1=0.48, bottom=(0.155, 0.165), top=(0.19, 0.20), offset=(x * LEG_X, 0))),
        ], bevel=0.006)


@piece
def souwester(b: Builder, spec: dict) -> None:
    """A small sou'wester, its brim longer at the back (the look's mustard)."""
    c = spec["hat"]
    _hat_brim(b, "SouBrim", c, H1 - 0.09, 0.38, 0.48, offset=(0.0, -0.05))
    b.part("SouCrown", "body", c, "head", [
        (cylinder, dict(z0=H1 - 0.08, z1=H1 + 0.04, r0=0.155, r1=0.12, segments=10)),
    ], bevel=0.015)


@piece
def net_coil(b: Builder, spec: dict) -> None:
    """A coil of net over the left shoulder, cork floats hanging from it (the signature prop)."""
    b.part("Net", "body", ("bone", 0), "chest", [
        (ring, dict(z=1.19, radius=0.12, tube=0.05, segments=8, center=(-0.23, 0.0), squash=1.4)),
        (frustum, dict(z0=0.92, z1=1.21, bottom=(0.10, 0.20), top=(0.12, 0.24), offset=(-0.28, 0.0))),
    ], bevel=0)
    b.part("Cork", "body", ("wood", 4), "chest", [
        (box, dict(center=(-0.29, 0.12, 0.92), size=(0.08, 0.08, 0.08))),
        (box, dict(center=(-0.27, -0.13, 0.98), size=(0.07, 0.07, 0.07))),
    ], bevel=0.015)


@piece
def creel(b: Builder, spec: dict) -> None:
    """A wicker creel on the right hip, strapped across the body: the Fisher's back and side."""
    b.part("Creel", "body", ("wood", 3), "hips", [
        (frustum, dict(z0=0.72, z1=0.92, bottom=(0.14, 0.20), top=(0.17, 0.24), offset=(0.26, -0.04))),
        (box, dict(center=(0.26, -0.04, 0.93), size=(0.18, 0.25, 0.03))),
    ], bevel=0.01)
    b.part("CreelStrap", "body", ("wood", 1), "chest", [
        (rod, dict(a=(-0.19, 0.14, C1 + 0.02), b=(0.24, 0.12, 0.98), width=0.03)),
        (rod, dict(a=(-0.19, -0.14, C1 + 0.02), b=(0.24, -0.16, 0.98), width=0.03)),
    ], bevel=0)


# ---------------------------------------------------------------- the Tinner


@piece
def ore_dust(b: Builder, spec: dict) -> None:
    for s, x in sides():
        b.part(f"Ore.{s}", "body", ("stone", 4), f"shin.{s}", [
            (box, dict(center=(x * LEG_X, 0.07, 0.30), size=(0.10, 0.02, 0.12))),
        ], bevel=0)
        b.part(f"Roll.{s}", "body", spec["trousers"], f"shin.{s}", [
            (frustum, dict(z0=0.18, z1=0.24, bottom=(0.17, 0.18), top=(0.17, 0.18), offset=(x * LEG_X, 0))),
        ], bevel=0)


@piece
def felt_hat(b: Builder, spec: dict) -> None:
    c = spec["hat"]
    _hat_brim(b, "FeltBrim", c, H1 - 0.085, 0.40, 0.42)
    b.part("FeltCrown", "body", c, "head", [
        (cylinder, dict(z0=H1 - 0.07, z1=H1 + 0.02, r0=0.155, r1=0.14, segments=10)),
    ], bevel=0.015)


@piece
def candle(b: Builder, spec: dict) -> None:
    """A candle stuck to the hat's brim at the front in a lump of clay (low: a flame above the crown clips the
    112 px cap when the brim faces away); its flame is the accent."""
    b.part("Clay", "body", ("stone", 3), "head", [
        (box, dict(center=(0.0, 0.17, H1 - 0.06), size=(0.07, 0.05, 0.03))),
    ], bevel=0.006)
    b.part("Candle", "body", ("bone", 2), "head", [
        (box, dict(center=(0.0, 0.17, H1 - 0.025), size=(0.03, 0.03, 0.04))),
    ], bevel=0)
    b.part("CandleFlame", "body", ("lantern", 3), "head", [
        (box, dict(center=(0.0, 0.17, H1 + 0.005), size=(0.035, 0.035, 0.02))),
    ], bevel=0, glow=True)


@piece
def jerkin(b: Builder, spec: dict) -> None:
    """A sleeveless leather jerkin over the shirt, laced at the front, with a tool belt and a croust bag
    (the Tinner's lunch) at the back."""
    c = spec["jacket"]
    b.part("Jerkin", "body", c, "chest", [
        (frustum, dict(z0=C0 - 0.01, z1=C1 - 0.08, bottom=(0.38, 0.26), top=(0.46, 0.30))),
    ], bevel=0.01)
    b.part("Laces", "body", ("brass", 0), "chest", [
        (box, dict(center=(0.0, 0.15, z), size=(0.08, 0.01, 0.012))) for z in (C0 + 0.05, C0 + 0.11, C0 + 0.17)
    ], bevel=0)
    _pouch(b, "CroustBag", ("bone", 0), "hips", (-0.14, -0.17, 0.86), size=(0.12, 0.07, 0.11))


@piece
def pick(b: Builder, spec: dict) -> None:
    """A short miner's pick over the right shoulder: a wood haft, a stone head."""
    b.part("PickHaft", "body", ("wood", 3), "chest", [
        (rod, dict(a=(0.24, 0.28, 0.96), b=(0.23, -0.22, 1.42), width=0.04)),
    ], bevel=0)
    b.part("PickHead", "body", ("stone", 4), "chest", [
        (rod, dict(a=(0.23, -0.14, 1.54), b=(0.23, -0.30, 1.22), width=0.045)),
    ], bevel=0)


# ---------------------------------------------------------------- the villager family (round 8, townsfolk.md 2)
# The ambient townsfolk's variants dress the plain base with one silhouette change each and carry no trade
# prop and no hat-trait shape (no flat cap, no bowler), so a villager never reads as a seat's hat clue.


@piece
def bonnet(b: Builder, spec: dict) -> None:
    """A goodwife's bonnet: a soft crown tied under the chin, a shelf of brim shading the brow."""
    c = spec["hat"]
    b.part("BonnetCrown", "body", c, "head", [
        (frustum, dict(z0=H1 - 0.16, z1=H1 + 0.02, bottom=(0.33, 0.33), top=(0.24, 0.24), offset=(0, -0.03))),
    ], bevel=0.015)
    b.part("BonnetBrim", "body", c, "head", [
        (box, dict(center=(0.0, 0.19, H1 - 0.07), size=(0.34, 0.12, 0.05))),
    ], bevel=0.008)
    b.part("BonnetTies", "body", (c[0], max(0, c[1] - 1)), "head", [
        (rod, dict(a=(0.14, 0.10, H0 + 0.08), b=(0.06, 0.13, H0 - 0.06), width=0.025)),
        (rod, dict(a=(-0.14, 0.10, H0 + 0.08), b=(-0.06, 0.13, H0 - 0.06), width=0.025)),
    ], bevel=0)


@piece
def kerchief(b: Builder, spec: dict) -> None:
    """A head kerchief knotted at the nape, the hair showing at the front and the plait below."""
    c = spec["hat"]
    b.part("Kerchief", "body", c, "head", [
        (frustum, dict(z0=H1 - 0.15, z1=H1 + 0.015, bottom=(HEAD_W + 0.03, HEAD_D + 0.02), top=(0.24, 0.24),
                       offset=(0, -0.02))),
        (box, dict(center=(0.0, -0.17, H0 + 0.22), size=(0.10, 0.06, 0.08))),  # the knot
    ], bevel=0.01)


@piece
def stick(b: Builder, spec: dict) -> None:
    """A walking stick in the right hand, knob at the hip, tip near the ankle so the walk's swing keeps it off the ground."""
    x = HAND_X + 0.02
    b.part("Stick", "body", ("wood", 1), "prop.R", [
        (rod, dict(a=(x, 0.06, PROP_Z + 0.14), b=(x + 0.03, 0.10, ANKLE - 0.02), width=0.035)),
    ], bevel=0)
    b.part("StickKnob", "body", ("wood", 2), "prop.R", [
        (box, dict(center=(x, 0.06, PROP_Z + 0.15), size=(0.07, 0.07, 0.06))),
    ], bevel=0.01)


@piece
def hand_basket(b: Builder, spec: dict) -> None:
    """A wicker basket on the left arm, a cloth over its load."""
    x = -HAND_X - 0.04
    b.part("HandBasket", "body", ("wood", 3), "prop.L", [
        (frustum, dict(z0=PROP_Z - 0.24, z1=PROP_Z - 0.04, bottom=(0.16, 0.24), top=(0.20, 0.30), offset=(x, 0.04))),
        (rod, dict(a=(x, -0.10, PROP_Z - 0.04), b=(x, 0.04, PROP_Z + 0.08), width=0.025)),
        (rod, dict(a=(x, 0.04, PROP_Z + 0.08), b=(x, 0.18, PROP_Z - 0.04), width=0.025)),
    ], bevel=0.008)
    b.part("BasketCloth", "body", ("bone", 2), "prop.L", [
        (box, dict(center=(x, 0.04, PROP_Z - 0.03), size=(0.17, 0.26, 0.03))),
    ], bevel=0)


@piece
def pail(b: Builder, spec: dict) -> None:
    """A wooden pail in the right hand: slate hoops, a rope handle."""
    x = HAND_X + 0.04
    b.part("Pail", "body", ("wood", 2), "prop.R", [
        (cylinder, dict(z0=PROP_Z - 0.30, z1=PROP_Z - 0.06, r0=0.09, r1=0.11, segments=8, center=(x, 0.04))),
    ], bevel=0.008)
    b.part("PailHoops", "body", ("slate", 0), "prop.R", [
        (cylinder, dict(z0=PROP_Z - 0.28, z1=PROP_Z - 0.25, r0=0.095, r1=0.097, segments=8, center=(x, 0.04))),
        (cylinder, dict(z0=PROP_Z - 0.10, z1=PROP_Z - 0.07, r0=0.111, r1=0.113, segments=8, center=(x, 0.04))),
    ], bevel=0)
    b.part("PailHandle", "body", ("wood", 1), "prop.R", [
        (rod, dict(a=(x, -0.07, PROP_Z - 0.06), b=(x, 0.04, PROP_Z + 0.04), width=0.02)),
        (rod, dict(a=(x, 0.04, PROP_Z + 0.04), b=(x, 0.15, PROP_Z - 0.06), width=0.02)),
    ], bevel=0)


@piece
def sleeve_garters(b: Builder, spec: dict) -> None:
    """Garters above the elbows holding the shirt sleeves up: the clerk's desk habit."""
    for s, x in sides():
        b.part(f"Garter.{s}", "body", ("ink", 0), f"upper_arm.{s}", [
            (ring, dict(z=ELBOW_Z + 0.10, radius=0.08, tube=0.015, segments=8, center=(x * 0.258, 0.0))),
        ], bevel=0)


@piece
def ledger(b: Builder, spec: dict) -> None:
    """A long ledger tucked under the left arm (it rides the upper arm): ink boards round bone pages."""
    b.part("LedgerBoards", "body", ("ink", 1), "upper_arm.L", [
        (box, dict(center=(-0.32, 0.0, 1.05), size=(0.06, 0.24, 0.30))),
    ], bevel=0.006)
    b.part("LedgerPages", "body", ("bone", 2), "upper_arm.L", [
        (box, dict(center=(-0.32, 0.0, 1.05), size=(0.04, 0.25, 0.31))),
    ], bevel=0)
