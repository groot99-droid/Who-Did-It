"""Build the V1 `villager` body as a hand-made low-poly block-out (docs/ASSETS.md 6.3, SPRITES.md).

    python tools/blender/build_villager.py -- --out assets/external/villager/villager.blend [--glb ...]

The block-out replaces the Higgsfield image-to-3D step, whose concepts kept drifting from the
3-heads-tall formula (`docs/ASSETS.md` 6.3). It follows the character file contract of
`tools/blender/README.md`: an `Export` collection, mesh parts tagged `wdi_part`, a `Feet` empty, and
one action per V1 clip at 24 fps, so each samples to its V1 frame count at 12 fps.

Proportions: 1.7 m tall, the head one third of that (0.57 m), torso and coat one third, legs and
block boots one third; oversized hands, block feet, a fog (grey) vest for palette swap. It faces
world +Y (direction `n`). Every part is a chamfered box with a flat palette colour, which
`palettize.py` turns into the toon material at render time.
"""

from __future__ import annotations

import argparse
import math
import os
import sys

import bpy
import bmesh

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rig_common as rc  # noqa: E402

FPS = 24
HEAD_Z = (1.13, 1.70)  # the head is one third of the 1.7 m height

# Bones: name -> (head, tail, parent). Arms and legs point down, the rest up; rolls are set so every
# bone's local X is world X, so a positive X rotation swings a limb forward (+Y).
BONES = {
    "root": ((0, 0, 0), (0, 0, 0.25), None),
    "hips": ((0, 0, 0.56), (0, 0, 0.72), "root"),
    "spine": ((0, 0, 0.72), (0, 0, 1.12), "hips"),
    "head": ((0, 0, 1.13), (0, 0, 1.55), "spine"),
    "arm.L": ((0.30, 0, 1.04), (0.40, 0, 0.66), "spine"),
    "arm.R": ((-0.30, 0, 1.04), (-0.40, 0, 0.66), "spine"),
    "leg.L": ((0.10, 0, 0.56), (0.10, 0, 0.14), "hips"),
    "leg.R": ((-0.10, 0, 0.56), (-0.10, 0, 0.14), "hips"),
}


def _material(token: str) -> bpy.types.Material:
    name = f"Villager_{token}"
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
        bsdf = mat.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = rc.hex_to_linear(rc.PALETTE[token])
        bsdf.inputs["Metallic"].default_value = 0.0
    return mat


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


def ring(bm, z, radius, tube, segments=8):
    """A low-poly ring (square tube) around the Z axis, for the scarf and hat brims."""
    prev = None
    first = None
    for i in range(segments + 1):
        a = 2 * math.pi * i / segments
        c, s = math.cos(a), math.sin(a)
        quad = [bm.verts.new(((radius + dr) * c, (radius + dr) * s, z + dz))
                for dr, dz in ((-tube, -tube), (tube, -tube), (tube, tube), (-tube, tube))]
        if i == segments:
            quad = first
        if prev is not None:
            for k in range(4):
                bm.faces.new((prev[k], prev[(k + 1) % 4], quad[(k + 1) % 4], quad[k]))
        prev = quad
        first = first or quad


class Builder:
    def __init__(self, col, arm):
        self.col, self.arm = col, arm

    def part(self, name, part, token, bone, shapes, bevel=0.02):
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
        obj.data.materials.append(_material(token))
        if bevel:
            mod = obj.modifiers.new("Chamfer", "BEVEL")
            mod.width, mod.segments, mod.limit_method = bevel, 1, "ANGLE"
        world = obj.matrix_world.copy()
        obj.parent, obj.parent_type, obj.parent_bone = self.arm, "BONE", bone
        bpy.context.view_layer.update()
        obj.matrix_world = world  # bone children sit at the bone tail otherwise
        return obj


def make_armature(col) -> bpy.types.Object:
    data = bpy.data.armatures.new("VillagerRig")
    arm = bpy.data.objects.new("Rig", data)
    col.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    for name, (head, tail, parent) in BONES.items():
        eb = data.edit_bones.new(name)
        eb.head, eb.tail = head, tail
        eb.align_roll((0, 1, 0) if tail[2] < head[2] else (0, -1, 0))
        if parent:
            eb.parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
    return arm


def make_body(b: Builder) -> None:
    h0, h1 = HEAD_Z
    # Head: skin block, ink hair cap and fringe, ink dot eyes, ears.
    b.part("Head", "body", "bone", "head", [
        (frustum, dict(z0=h0 + 0.02, z1=h1 - 0.06, bottom=(0.46, 0.42), top=(0.50, 0.46))),
        (box, dict(center=(0.26, 0.0, 1.38), size=(0.06, 0.10, 0.12))),
        (box, dict(center=(-0.26, 0.0, 1.38), size=(0.06, 0.10, 0.12))),
    ])
    b.part("Hair", "body", "slate", "head", [
        (frustum, dict(z0=1.52, z1=h1, bottom=(0.54, 0.50), top=(0.48, 0.44), offset=(0, -0.01))),
        (box, dict(center=(0.0, -0.20, 1.40), size=(0.52, 0.10, 0.30))),
        (box, dict(center=(0.08, 0.22, 1.53), size=(0.22, 0.08, 0.08))),
    ])
    b.part("Eyes", "body", "ink", "head", [
        (box, dict(center=(0.10, 0.235, 1.40), size=(0.06, 0.02, 0.07))),
        (box, dict(center=(-0.10, 0.235, 1.40), size=(0.06, 0.02, 0.07))),
        (box, dict(center=(0.10, 0.235, 1.47), size=(0.11, 0.02, 0.025))),
        (box, dict(center=(-0.10, 0.235, 1.47), size=(0.11, 0.02, 0.025))),
    ], bevel=0)
    # Torso: slate trench coat with a flared skirt, fog vest and bone collar in front.
    b.part("Coat", "body", "slate", "spine", [
        (frustum, dict(z0=0.74, z1=1.14, bottom=(0.52, 0.34), top=(0.58, 0.36))),
        (frustum, dict(z0=0.40, z1=0.76, bottom=(0.62, 0.42), top=(0.52, 0.34))),
    ])
    b.part("Vest", "body", "fog", "spine", [
        (frustum, dict(z0=0.74, z1=1.08, bottom=(0.22, 0.04), top=(0.16, 0.04), offset=(0, 0.17))),
    ], bevel=0.01)
    b.part("Collar", "body", "bone", "spine", [
        (frustum, dict(z0=1.04, z1=1.15, bottom=(0.10, 0.06), top=(0.24, 0.10), offset=(0, 0.16))),
    ], bevel=0.01)
    for side, sx in (("L", 1), ("R", -1)):
        # Arms: slate sleeve, bone cuff, oversized bone hand.
        b.part(f"Sleeve.{side}", "body", "slate", f"arm.{side}", [
            (frustum, dict(z0=0.80, z1=1.10, bottom=(0.16, 0.17), top=(0.19, 0.20),
                           offset=(sx * 0.37, 0), top_offset=(sx * 0.32, 0))),
        ])
        b.part(f"Cuff.{side}", "body", "bone", f"arm.{side}", [
            (box, dict(center=(sx * 0.375, 0, 0.78), size=(0.18, 0.19, 0.06))),
        ], bevel=0.01)
        b.part(f"Hand.{side}", "body", "bone", f"arm.{side}", [
            (frustum, dict(z0=0.56, z1=0.76, bottom=(0.16, 0.20), top=(0.20, 0.22), offset=(sx * 0.39, 0.01))),
        ])
        # Legs: ink trousers, slate block boots with the toe forward.
        b.part(f"Leg.{side}", "body", "ink", f"leg.{side}", [
            (frustum, dict(z0=0.14, z1=0.46, bottom=(0.16, 0.18), top=(0.19, 0.20), offset=(sx * 0.10, 0))),
        ])
        b.part(f"Boot.{side}", "body", "slate", f"leg.{side}", [
            (frustum, dict(z0=0.0, z1=0.17, bottom=(0.19, 0.26), top=(0.18, 0.22), offset=(sx * 0.10, 0.03),
                           top_offset=(sx * 0.10, 0.02))),
        ])


def make_overlays(b: Builder) -> None:
    h1 = HEAD_Z[1]
    b.part("Scarf", "scarf", "bone", "spine", [
        (ring, dict(z=1.14, radius=0.23, tube=0.06)),
        (frustum, dict(z0=0.86, z1=1.12, bottom=(0.12, 0.05), top=(0.13, 0.06), offset=(0.14, 0.20))),
    ], bevel=0.01)
    b.part("Cap", "hat_cap", "slate", "head", [
        (frustum, dict(z0=h1 - 0.10, z1=h1 + 0.03, bottom=(0.56, 0.52), top=(0.56, 0.52), top_offset=(0, 0.03))),
        (frustum, dict(z0=h1 - 0.10, z1=h1 - 0.06, bottom=(0.50, 0.20), top=(0.48, 0.18), offset=(0, 0.33))),
    ])
    b.part("Bowler", "hat_bowler", "ink", "head", [
        (frustum, dict(z0=h1 - 0.06, z1=h1 + 0.16, bottom=(0.44, 0.42), top=(0.34, 0.32))),
        (frustum, dict(z0=h1 - 0.08, z1=h1 - 0.04, bottom=(0.66, 0.62), top=(0.64, 0.60))),
    ])
    b.part("BowlerBand", "hat_bowler", "fog", "head", [
        (frustum, dict(z0=h1 - 0.03, z1=h1 + 0.03, bottom=(0.46, 0.44), top=(0.45, 0.43))),
    ], bevel=0)
    # Blood: a slightly inflated shell over the coat front and both hands (shown while Bloody).
    shapes = [(frustum, dict(z0=0.62, z1=1.02, bottom=(0.56, 0.06), top=(0.60, 0.06), offset=(0, 0.17)))]
    for sx in (1, -1):
        shapes.append((frustum, dict(z0=0.55, z1=0.77, bottom=(0.18, 0.22), top=(0.22, 0.24),
                                     offset=(sx * 0.39, 0.01))))
    blood = b.part("BloodShell", "blood", "blood", "spine", shapes[:1], bevel=0)
    for sx, side in ((1, "L"), (-1, "R")):
        b.part(f"BloodHand.{side}", "blood", "blood", f"arm.{side}", [shapes[1 if sx == 1 else 2]], bevel=0)
    del blood


# ---------------------------------------------------------------- clips


def _key(arm, frame, pose: dict) -> None:
    for bone, (rx, ry, rz, *loc) in pose.items():
        pb = arm.pose.bones[bone]
        pb.rotation_euler = (math.radians(rx), math.radians(ry), math.radians(rz))
        pb.keyframe_insert("rotation_euler", frame=frame)
        if loc:
            pb.location = loc
            pb.keyframe_insert("location", frame=frame)


def _action(arm, name: str, keys: list[tuple[int, dict]]) -> None:
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data_create().action = act
    rest = {b: (0, 0, 0, 0, 0, 0) for b in BONES}
    for frame, pose in keys:
        _key(arm, frame, {**rest, **pose})
    act.frame_range = (keys[0][0], keys[-1][0])


def make_actions(arm) -> None:
    # Loops span 16 scene frames (8 at 12 fps; the last key repeats the first and is not rendered).
    # One-shots span 2n - 1 frames so they render n frames including the last.
    # Local Z of a limb is world +Y, so a positive Z rotation swings a left limb inwards (-X): left
    # limbs spread with negative Z, right limbs with positive Z.
    a = 6  # A-pose arm spread, degrees
    arms = lambda fl, fr=None: {"arm.L": (fl, 0, -a), "arm.R": (fr if fr is not None else fl, 0, a)}  # noqa: E731

    _action(arm, "idle", [
        (1, {**arms(0)}),
        (5, {**arms(3), "spine": (-2, 0, 0), "head": (2, 0, 0), "root": (0, 0, 0, 0, 0.012, 0)}),
        (9, {**arms(0)}),
        (13, {**arms(-2), "spine": (1, 0, 0), "head": (-1, 0, 2), "root": (0, 0, 0, 0, -0.006, 0)}),
        (17, {**arms(0)}),
    ])
    # The cell holds only 16 px of ground in front of the feet (FEET_ROW_PX), so the chibi takes short
    # steps and stands narrow: a longer stride or a wider stance puts a boot over the cell edge, worst
    # in the diagonal views where the heel and the outer corner of the boot add up.
    stride, swing = 12, 22
    _action(arm, "walk", [
        (1, {"leg.L": (stride, 0, 0), "leg.R": (-stride, 0, 0), **arms(-swing, swing),
             "spine": (-5, 4, 0), "root": (0, 0, 0, 0, -0.015, 0)}),
        (5, {**arms(0), "spine": (-5, 0, 0), "root": (0, 0, 0, 0, 0.02, 0)}),
        (9, {"leg.L": (-stride, 0, 0), "leg.R": (stride, 0, 0), **arms(swing, -swing),
             "spine": (-5, -4, 0), "root": (0, 0, 0, 0, -0.015, 0)}),
        (13, {**arms(0), "spine": (-5, 0, 0), "root": (0, 0, 0, 0, 0.02, 0)}),
        (17, {"leg.L": (stride, 0, 0), "leg.R": (-stride, 0, 0), **arms(-swing, swing),
              "spine": (-5, 4, 0), "root": (0, 0, 0, 0, -0.015, 0)}),
    ])
    # Swing (shared by Kill, Crowbar and Check): right arm up over the head, down hard, recover.
    _action(arm, "swing", [
        (1, {**arms(0)}),
        (3, {"arm.R": (120, 0, a), "arm.L": (-15, 0, -a), "spine": (6, -15, 0)}),
        (5, {"arm.R": (165, 0, a), "arm.L": (-20, 0, -a), "spine": (8, -20, 0)}),
        (7, {"arm.R": (35, 0, a), "arm.L": (10, 0, -a), "spine": (-14, 12, 0), "head": (-6, 0, 0)}),
        (9, {"arm.R": (15, 0, a), "arm.L": (5, 0, -a), "spine": (-8, 6, 0)}),
        (11, {**arms(0)}),
    ])
    # Die: recoil, buckle, fall on the back towards -Y; the last frame is the body on the floor with
    # arms and legs spread, an X that reads as fallen from every direction (a body lying along the
    # view axis is otherwise foreshortened into something like a standing figure).
    # The root pivots at the feet; lifting it as it tips keeps the coat above the ground.
    _action(arm, "die", [
        (1, {**arms(0)}),
        (3, {**arms(-25), "spine": (12, 0, 0), "head": (15, 0, 0)}),
        (5, {**arms(-45), "spine": (16, 0, 0), "head": (20, 0, 0), "root": (12, 0, 0, 0, 0, 0)}),
        (7, {**arms(-70), "spine": (10, 0, 0), "head": (15, 0, 0), "leg.L": (20, 0, 0), "leg.R": (10, 0, 0),
             "root": (35, 0, 0, 0, 0.04, 0)}),
        (9, {**arms(-95), "spine": (4, 0, 0), "head": (10, 0, 0), "leg.L": (25, 0, 0), "leg.R": (15, 0, 0),
             "root": (60, 0, 0, 0, 0.10, 0)}),
        (11, {"arm.L": (-60, 0, -45), "arm.R": (-60, 0, 45), "head": (5, 0, 0), "leg.L": (20, 0, -6),
              "leg.R": (10, 0, 6), "root": (82, 0, 0, 0, 0.17, 0)}),
        (13, {"arm.L": (-15, 0, -75), "arm.R": (-20, 0, 72), "leg.L": (10, 0, -16), "leg.R": (6, 0, 14),
              "head": (0, 10, 0), "root": (90, 0, 0, 0, 0.20, 0)}),
        (15, {"arm.L": (-10, 0, -82), "arm.R": (-15, 0, 78), "leg.L": (8, 0, -20), "leg.R": (4, 0, 18),
              "head": (0, 18, 0), "root": (90, 0, 0, 0, 0.20, 0)}),
    ])
    arm.animation_data.action = None


def build(out: str, glb: str | None = None) -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = FPS
    col = bpy.data.collections.new("Export")
    scene.collection.children.link(col)
    arm = make_armature(col)
    b = Builder(col, arm)
    make_body(b)
    make_overlays(b)
    feet = bpy.data.objects.new("Feet", None)
    col.objects.link(feet)
    feet.parent = arm
    make_actions(arm)

    tris = 0
    deps = bpy.context.evaluated_depsgraph_get()
    for obj in col.all_objects:
        if obj.type == "MESH":
            mesh = obj.evaluated_get(deps).to_mesh()
            tris += sum(len(p.vertices) - 2 for p in mesh.polygons)
    print(f"build_villager: {tris} triangles, {len([o for o in col.all_objects if o.type == 'MESH'])} parts")
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(out))
    if glb:
        bpy.ops.export_scene.gltf(filepath=os.path.abspath(glb), export_format="GLB", export_animations=True,
                                  export_animation_mode="ACTIONS", export_apply=True)


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="build_villager.py")
    p.add_argument("--out", required=True)
    p.add_argument("--glb", help="also export the source GLB (V2 loads it; keep it outside the repo)")
    a = p.parse_args(argv)
    build(a.out, a.glb)
