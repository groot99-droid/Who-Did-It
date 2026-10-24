"""Build every world look from one base body (art plan 4.2-4.4; ASSETS 6.3; SPRITES 1-4; round 8 art.md 2).

    python tools/blender/build_looks.py -- --look baker --out assets/external/looks
    python tools/blender/build_looks.py -- --look all --out assets/external/looks

Each look is written as `<out>/<lookId>.blend`, a character file under the contract of
tools/blender/README.md: an `Export` collection, mesh parts tagged `wdi_part` (body, scarf, blood), a
`Feet` empty at the origin, and one action per clip (`idle`, `walk`, `swing`, `interact`, `die`) at 24 fps,
which batch_render.py samples to 12 fps. The .blend files are git-ignored masters; the scripts are the
true source. All looks share the base's proportions, the 22-bone armature, the clips and the Feet pivot;
looks_spec.py names each look's colours, its `interact` base and its costume pieces (look_parts.py).

The figure faces world +Y, its right hand +X. Bones are rolled so that every bone's local X is world X:
on a limb pointing down a positive X rotation swings it forward, on a bone pointing up (spine, chest,
neck, head, root) a positive X rotation leans it back.
"""

from __future__ import annotations

import argparse
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import look_parts as lp  # noqa: E402
import looks_spec  # noqa: E402
from look_parts import box, cylinder, frustum, ring  # noqa: E402

FPS = 24

# name -> (head, tail, parent). 22 bones: root, hips, spine, chest, neck, head, and per side the
# clavicle, upper arm, forearm, hand, thigh, shin and foot, plus a prop bone under each hand. Every
# number is a landmark of look_parts.py, so the round-8 proportions live in one place.
BONES: dict[str, tuple[tuple[float, float, float], tuple[float, float, float], str | None]] = {
    "root": ((0, 0, 0), (0, 0, 0.2), None),
    "hips": ((0, 0, lp.CROTCH), (0, 0, lp.SPINE[0]), "root"),
    "spine": ((0, 0, lp.SPINE[0]), (0, 0, lp.SPINE[1]), "hips"),
    "chest": ((0, 0, lp.SPINE[1]), (0, 0, lp.NECK[0]), "spine"),
    "neck": ((0, 0, lp.NECK[0]), (0, 0, lp.HEAD[0]), "chest"),
    "head": ((0, 0, lp.HEAD[0]), (0, 0, lp.HEAD[1]), "neck"),
}
for _s, _x in (("R", 1), ("L", -1)):
    BONES.update({
        f"clavicle.{_s}": ((_x * 0.03, 0, lp.CLAVICLE_Z), (_x * lp.SHOULDER_X, 0, lp.CLAVICLE_Z), "chest"),
        f"upper_arm.{_s}": ((_x * lp.SHOULDER_X, 0, lp.CLAVICLE_Z), (_x * lp.ELBOW_X, 0, lp.ELBOW_Z), f"clavicle.{_s}"),
        f"forearm.{_s}": ((_x * lp.ELBOW_X, 0, lp.ELBOW_Z), (_x * lp.HAND_X, 0, lp.WRIST_Z), f"upper_arm.{_s}"),
        f"hand.{_s}": ((_x * lp.HAND_X, 0, lp.WRIST_Z), (_x * lp.HAND_X, 0, lp.WRIST_Z - lp.HAND_LEN), f"forearm.{_s}"),
        f"prop.{_s}": ((_x * lp.HAND_X, 0.0, lp.PROP_Z), (_x * lp.HAND_X, 0.10, lp.PROP_Z), f"hand.{_s}"),
        f"thigh.{_s}": ((_x * lp.LEG_X, 0, lp.CROTCH), (_x * lp.LEG_X, 0, lp.KNEE), "hips"),
        f"shin.{_s}": ((_x * lp.LEG_X, 0, lp.KNEE), (_x * lp.LEG_X, 0, lp.ANKLE), f"thigh.{_s}"),
        f"foot.{_s}": ((_x * lp.LEG_X, 0, lp.ANKLE), (_x * lp.LEG_X, 0.16, 0.03), f"shin.{_s}"),
    })


def make_armature(col) -> bpy.types.Object:
    data = bpy.data.armatures.new("LookRig")
    arm = bpy.data.objects.new("Rig", data)
    col.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    for name, (head, tail, parent) in BONES.items():
        eb = data.edit_bones.new(name)
        eb.head, eb.tail = head, tail
        d = [t - h for h, t in zip(head, tail)]
        if abs(d[2]) >= max(abs(d[0]), abs(d[1])):  # vertical: local X = world X
            eb.align_roll((0, 1, 0) if d[2] < 0 else (0, -1, 0))
        else:  # horizontal (clavicles, feet, prop bones): local Z = world up
            eb.align_roll((0, 0, 1))
        if parent:
            eb.parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
    return arm


# ---------------------------------------------------------------- the base body


def make_body(b: lp.Builder, spec: dict) -> None:
    """The four-heads base of round 8 (art.md 2): a big jawed head with nose, brow and ears (no drawn eyes),
    a thick neck, a barrel chest on wide shoulders, big hands and boots."""
    skin = looks_spec.skin_colour(spec["skin"])
    brow = ("skin", spec["skin"] - 1)
    h0, h1 = lp.HEAD
    b.part("Head", "body", skin, "head", [
        (frustum, dict(z0=h0, z1=h0 + 0.15, bottom=(0.19, 0.20), top=(lp.HEAD_W, lp.HEAD_D), offset=(0, 0.01))),
        (frustum, dict(z0=h0 + 0.15, z1=h1 - 0.02, bottom=(lp.HEAD_W, lp.HEAD_D), top=(0.25, 0.24), offset=(0, 0.01))),
        (box, dict(center=(0.0, 0.165, h0 + 0.15), size=(0.055, 0.06, 0.085))),  # nose
        (box, dict(center=(0.15, 0.0, h0 + 0.18), size=(0.035, 0.06, 0.08))),  # ears
        (box, dict(center=(-0.15, 0.0, h0 + 0.18), size=(0.035, 0.06, 0.08))),
    ])
    # A simple face: no drawn eyes at sprite size, one brow ridge whose shadow is the eye line (ASSETS 6.1, S3.3).
    b.part("Brow", "body", brow, "head", [
        (box, dict(center=(0.0, 0.15, h0 + 0.215), size=(0.22, 0.025, 0.03))),
    ], bevel=0)
    b.part("Neck", "body", skin, "neck", [
        (box, dict(center=(0, 0, (lp.NECK[0] + lp.NECK[1]) / 2 + 0.01), size=(0.14, 0.14, 0.11))),
    ])
    jacket, shirt, trousers, boots = spec["jacket"], spec["shirt"], spec["trousers"], spec["boots"]
    c0, c1 = lp.CHEST
    b.part("Torso", "body", jacket, "chest", [
        (frustum, dict(z0=c0, z1=c1 - 0.07, bottom=(0.36, 0.24), top=(lp.SHOULDER_W - 0.02, 0.28))),
        (frustum, dict(z0=c1 - 0.07, z1=c1, bottom=(lp.SHOULDER_W - 0.02, 0.28), top=(0.34, 0.22))),
    ])
    b.part("Shirt", "body", shirt, "chest", [
        (frustum, dict(z0=c1 - 0.20, z1=c1 - 0.01, bottom=(0.02, 0.03), top=(0.15, 0.03), offset=(0, 0.13))),
    ], bevel=0.006)
    sleeve = spec.get("sleeve", jacket)
    forearm = spec.get("forearm", sleeve)
    b.part("Hem", "body", spec.get("hem", jacket), "hips", [
        (frustum, dict(z0=0.74, z1=lp.HIPS[1], bottom=(lp.HIP_W + 0.06, 0.27), top=(0.36, 0.24))),
    ])
    hw = lp.HAND_W
    for s, x in (("R", 1), ("L", -1)):
        b.part(f"UpperArm.{s}", "body", sleeve, f"upper_arm.{s}", [
            (frustum, dict(z0=lp.ELBOW_Z - 0.01, z1=lp.CLAVICLE_Z + 0.04, bottom=(0.13, 0.14), top=(0.15, 0.16),
                           offset=(x * lp.ELBOW_X, 0), top_offset=(x * lp.SHOULDER_X, 0))),
        ])
        b.part(f"Forearm.{s}", "body", forearm, f"forearm.{s}", [
            (frustum, dict(z0=lp.WRIST_Z, z1=lp.ELBOW_Z + 0.01, bottom=(0.11, 0.11), top=(0.13, 0.14),
                           offset=(x * lp.HAND_X, 0), top_offset=(x * lp.ELBOW_X, 0))),
        ])
        b.part(f"Hand.{s}", "body", skin, f"hand.{s}", [
            (frustum, dict(z0=lp.WRIST_Z - lp.HAND_LEN, z1=lp.WRIST_Z, bottom=(hw - 0.02, hw - 0.01), top=(hw, hw + 0.01),
                           offset=(x * lp.HAND_X, 0.01))),
            (box, dict(center=(x * (lp.HAND_X + hw / 2 - 0.01), 0.02, lp.WRIST_Z - 0.06), size=(0.03, 0.04, 0.07))),  # thumb
        ])
        b.part(f"Thigh.{s}", "body", trousers, f"thigh.{s}", [
            (frustum, dict(z0=lp.KNEE - 0.01, z1=lp.CROTCH + 0.04, bottom=(0.15, 0.16), top=(0.19, 0.21),
                           offset=(x * lp.LEG_X, 0))),
        ])
        b.part(f"Shin.{s}", "body", trousers, f"shin.{s}", [
            (frustum, dict(z0=0.18, z1=lp.KNEE + 0.01, bottom=(0.13, 0.14), top=(0.15, 0.16),
                           offset=(x * lp.LEG_X, 0))),
        ])
        b.part(f"Boot.{s}", "body", boots, f"foot.{s}", [
            (frustum, dict(z0=0.0, z1=0.08, bottom=(lp.BOOT_W, lp.BOOT_LEN), top=(0.13, 0.25),
                           offset=(x * lp.LEG_X, 0.06), top_offset=(x * lp.LEG_X, 0.04))),
            (frustum, dict(z0=0.08, z1=0.22, bottom=(0.14, 0.15), top=(0.145, 0.155), offset=(x * lp.LEG_X, -0.01))),
        ])


def make_overlays(b: lp.Builder, spec: dict) -> None:
    # Every character wears the storm scarf (GDD 3.1): a neck wrap with a short tail, on the bone ramp,
    # tinted at runtime.
    scarf = ("bone", 2)
    z = (lp.NECK[0] + lp.NECK[1]) / 2
    b.part("Scarf", "scarf", scarf, "chest", [
        (ring, dict(z=z, radius=0.12, tube=0.045, segments=10, squash=1.05)),
        (frustum, dict(z0=z - 0.20, z1=z - 0.02, bottom=(0.08, 0.03), top=(0.10, 0.05), offset=(0.08, 0.16),
                       top_offset=(0.07, 0.145))),
    ], bevel=0.006)
    # Blood: a 3 mm inflated shell over the torso front and both hands (shown while Bloody).
    blood = ("blood", 2)
    hw = lp.HAND_W
    b.part("BloodTorso", "blood", blood, "chest", [
        (frustum, dict(z0=lp.CHEST[0] + 0.02, z1=lp.CHEST[1] - 0.11, bottom=(0.34, 0.03),
                       top=(0.42, 0.03), offset=(0, 0.125), top_offset=(0, 0.143))),
    ], bevel=0, glow=True)
    for s, x in (("R", 1), ("L", -1)):
        b.part(f"BloodHand.{s}", "blood", blood, f"hand.{s}", [
            (frustum, dict(z0=lp.WRIST_Z - lp.HAND_LEN - 0.003, z1=lp.WRIST_Z + 0.003, bottom=(hw - 0.014, hw - 0.004),
                           top=(hw + 0.006, hw + 0.016), offset=(x * lp.HAND_X, 0.01))),
            (box, dict(center=(x * (lp.HAND_X + hw / 2 - 0.01), 0.02, lp.WRIST_Z - 0.06), size=(0.036, 0.046, 0.076))),
        ], bevel=0, glow=True)


# ---------------------------------------------------------------- clips


def _key(arm, frame: int, pose: dict) -> None:
    for bone, value in pose.items():
        rx, ry, rz, *loc = value
        pb = arm.pose.bones[bone]
        pb.rotation_euler = (math.radians(rx), math.radians(ry), math.radians(rz))
        pb.keyframe_insert("rotation_euler", frame=frame)
        pb.location = loc if loc else (0.0, 0.0, 0.0)
        pb.keyframe_insert("location", frame=frame)


def _action(arm, name: str, keys: list[tuple[int, dict]], base: dict | None = None) -> None:
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data_create().action = act
    rest = {b: (0, 0, 0) for b in BONES}
    for frame, pose in keys:
        _key(arm, frame, {**rest, **(base or {}), **pose})
    act.frame_range = (keys[0][0], keys[-1][0])


# Arms hang with a small spread. A right limb spreads outwards (+X) with a negative Z rotation.
SPREAD = 7


def arms(fr: float = 0, fl: float | None = None, er: float = 8, el: float | None = None) -> dict:
    """Upper arms swung forward by fr / fl degrees, elbows bent forward by er / el."""
    fl = fr if fl is None else fl
    el = er if el is None else el
    return {"upper_arm.R": (fr, 0, -SPREAD), "upper_arm.L": (fl, 0, SPREAD),
            "forearm.R": (er, 0, 0), "forearm.L": (el, 0, 0)}


def crouch(deg: float) -> dict:
    """Knees bent by `deg`: thighs forward, shins back, feet level, and the root dropped so the soles stay on the
    ground (the hip drop of two equal segments bent the same way). A crouch keeps a lean's head height inside
    the cell: a lean away from the camera lifts the crown on screen."""
    drop = (lp.CROTCH - lp.ANKLE) * (1 - math.cos(math.radians(deg)))
    return {"thigh.R": (deg, 0, 0), "thigh.L": (deg, 0, 0), "shin.R": (-2 * deg, 0, 0), "shin.L": (-2 * deg, 0, 0),
            "foot.R": (deg, 0, 0), "foot.L": (deg, 0, 0), "root": (0, 0, 0, 0, -drop, 0)}


def interact_keys(base: str, raise_deg: float = 95) -> list[tuple[int, dict]]:
    """Eight looping frames of a hold: hands working, the body still, one of three bases (art plan 4.2).

    `raise_deg` is how far `raise` lifts the left arm: a look whose left hand holds a pole lifts it less,
    so the prop stays inside the cell."""
    if base == "kneel":
        # A low crouch on the right knee, the left knee bent so the boot stays on the ground, both hands working
        # low, the hips shifted 0.08 m back. The pose stays compact: the left foot ends 0.19 m forward (9 px
        # down the screen facing the camera) and the right shin slopes back, so the figure keeps inside the
        # 128 px cell in every direction.
        body = {"root": (0, 0, 0, 0, -0.14, 0.08), "spine": (-15, 0, 0), "chest": (-8, 0, 0), "head": (-12, 0, 0),
                "thigh.L": (45, 0, 0), "shin.L": (-68, 0, 0), "thigh.R": (20, 0, 0), "shin.R": (-65, 0, 0),
                "foot.R": (30, 0, 0)}
        work = lambda t: {"upper_arm.R": (30 + 8 * t, 0, -5), "upper_arm.L": (28 - 8 * t, 0, 5),  # noqa: E731
                          "forearm.R": (35 - 10 * t, 0, 0), "forearm.L": (35 + 10 * t, 0, 0)}
    elif base == "waist":
        # Standing, head bowed, hands working at waist height.
        body = {"head": (-18, 0, 0), "neck": (-6, 0, 0), "spine": (-4, 0, 0)}
        work = lambda t: {"upper_arm.R": (22 + 6 * t, 0, 10), "upper_arm.L": (22 - 6 * t, 0, -10),  # noqa: E731
                          "forearm.R": (75 - 10 * t, 0, 0), "forearm.L": (75 + 10 * t, 0, 0)}
    elif base == "raise":
        # The left arm raised high, the head lifted, peering.
        body = {"head": (12, 0, 8), "chest": (4, 0, 0)}
        work = lambda t: {"upper_arm.L": (raise_deg, 0, 8 - 4 * t), "forearm.L": (25, 0, 0),  # noqa: E731
                          "upper_arm.R": (8, 0, -SPREAD), "forearm.R": (20, 0, 0),
                          "head": (12, 0, 8 - 12 * t)}
    else:
        raise ValueError(f"unknown interact base {base!r}")
    keys = []
    for frame, t in ((1, 0.0), (5, 1.0), (9, 0.0), (13, -1.0), (17, 0.0)):
        keys.append((frame, {**body, **work(t)}))
    return keys


def make_actions(arm, spec: dict) -> None:
    # Loops span 16 scene frames (8 at 12 fps; the last key repeats the first and is not rendered).
    # One-shots span 2n - 1 frames so they render n frames including the last.
    _action(arm, "idle", [
        (1, {**arms()}),
        (5, {**arms(2, 2), "chest": (2, 0, 0), "root": (0, 0, 0, 0.004, 0.006, 0)}),
        (9, {**arms()}),
        (13, {**arms(-1, -1), "chest": (-1, 0, 0), "head": (-2, 0, 2), "root": (0, 0, 0, -0.004, -0.003, 0)}),
        (17, {**arms()}),
    ])
    # Two steps of a 0.5 m stride: each thigh swings 18 deg either way (0.78 m legs), the passing leg
    # lifts its foot by bending the knee; the arms swing against the legs.
    th, sw = 18, 18
    step = lambda s: {"thigh.R": (s * th, 0, 0), "thigh.L": (-s * th, 0, 0),  # noqa: E731
                      "shin.R": (0, 0, 0) if s > 0 else (-20, 0, 0), "shin.L": (-20, 0, 0) if s > 0 else (0, 0, 0),
                      **arms(-s * sw, s * sw, 12, 12), "spine": (-4, 3 * s, 0), "root": (0, 0, 0, 0, -0.012, 0)}
    passing = lambda s: {"thigh.R": (0, 0, 0) if s > 0 else (8, 0, 0),  # noqa: E731
                         "thigh.L": (8, 0, 0) if s > 0 else (0, 0, 0),
                         "shin.R": (0, 0, 0) if s > 0 else (-45, 0, 0), "shin.L": (-45, 0, 0) if s > 0 else (0, 0, 0),
                         **arms(0, 0, 10, 10), "spine": (-4, 0, 0), "root": (0, 0, 0, 0, 0.0, 0)}
    _action(arm, "walk", [(1, step(1)), (5, passing(1)), (9, step(-1)), (13, passing(-1)), (17, step(1))])
    # Swing (Kill, Crowbar, Check; never role-specific): wind-up with the elbow pulled back and the fist cocked at
    # chest height, the head turned against the chest twist so the eyes stay on the target; a forward-down strike
    # of the right hand from bent knees; recovery. The leans are small and the knees take the strike because a
    # hat or a fist raised beside the head reaches the cell top on the four-heads figure, and a lean away from
    # the camera lifts the crown on screen (the 112 px cap of SPRITES 1).
    _action(arm, "swing", [
        (1, {**arms()}),
        (3, {**arms(-10, 5), "upper_arm.R": (22, 0, -14), "forearm.R": (92, 0, 0), "chest": (3, -18, 0),
             "head": (0, 18, 0), **crouch(5)}),
        (5, {**arms(-15, 10), "upper_arm.R": (24, 0, -12), "forearm.R": (100, 0, 0), "chest": (5, -25, 0),
             "head": (0, 25, 0), **crouch(10)}),
        (7, {**arms(15, -10), "upper_arm.R": (55, 0, -5), "forearm.R": (10, 0, 0), "chest": (-8, 15, 0),
             "spine": (-3, 0, 0), "head": (-3, 0, 0), **crouch(22)}),
        (9, {**arms(5, 0), "upper_arm.R": (25, 0, -6), "forearm.R": (15, 0, 0), "chest": (-4, 6, 0), **crouch(8)}),
        (11, {**arms()}),
    ])
    _action(arm, "interact", interact_keys(spec["interact"], spec.get("raise_deg", 95)))
    # Die: knees buckle, a fall to the back-left, spread-eagled on the last frame so it reads from all
    # 8 directions. The root tips back about X (towards -Y) and turns about the world up (local Y) to the
    # left; it is lifted as it tips so the body lies on the ground.
    _action(arm, "die", [
        (1, {**arms()}),
        (3, {**arms(-20, -20, 30, 30), "chest": (10, 0, 0), "head": (12, 0, 0),
             "thigh.R": (20, 0, 0), "thigh.L": (20, 0, 0), "shin.R": (-35, 0, 0), "shin.L": (-35, 0, 0),
             "root": (0, 0, 0, 0, -0.06, 0)}),
        (5, {**arms(-40, -40, 20, 20), "chest": (14, 0, 0), "head": (18, 0, 0),
             "thigh.R": (35, 0, 0), "thigh.L": (30, 0, 0), "shin.R": (-55, 0, 0), "shin.L": (-50, 0, 0),
             "root": (15, -10, 0, 0, -0.12, 0)}),
        (7, {**arms(-70, -70, 10, 10), "chest": (10, 0, 0), "head": (14, 0, 0),
             "thigh.R": (35, 0, 0), "thigh.L": (25, 0, 0), "shin.R": (-45, 0, 0), "shin.L": (-35, 0, 0),
             "root": (40, -25, 0, 0, -0.08, 0)}),
        (9, {**arms(-100, -100, 5, 5), "chest": (4, 0, 0), "head": (10, 0, 0),
             "thigh.R": (25, 0, 0), "thigh.L": (20, 0, 0), "shin.R": (-25, 0, 0), "shin.L": (-20, 0, 0),
             "root": (65, -40, 0, 0, 0.02, 0)}),
        (11, {"upper_arm.R": (-100, 0, -50), "upper_arm.L": (-100, 0, 50), "head": (5, 0, 0),
              "thigh.R": (12, 0, -10), "thigh.L": (10, 0, 10), "root": (85, -45, 0, 0, 0.12, 0)}),
        (13, {"upper_arm.R": (-30, 0, -80), "upper_arm.L": (-25, 0, 80), "forearm.R": (10, 0, 0),
              "forearm.L": (10, 0, 0), "thigh.R": (5, 0, -18), "thigh.L": (5, 0, 18), "head": (0, 15, 0),
              "root": (90, -45, 0, 0, 0.13, 0)}),
        (15, {"upper_arm.R": (-20, 0, -85), "upper_arm.L": (-15, 0, 85), "forearm.R": (5, 0, 0),
              "forearm.L": (5, 0, 0), "thigh.R": (3, 0, -22), "thigh.L": (3, 0, 22), "head": (0, 20, 0),
              "root": (90, -45, 0, 0, 0.13, 0)}),
    ])
    arm.animation_data.action = None


# ---------------------------------------------------------------- build


def build(look: str, out_dir: str) -> str:
    spec = looks_spec.LOOKS[look]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = FPS
    col = bpy.data.collections.new("Export")
    scene.collection.children.link(col)
    arm = make_armature(col)
    b = lp.Builder(col, arm)
    make_body(b, spec)
    for name in spec["parts"]:
        lp.PIECES[name](b, spec)
    make_overlays(b, spec)
    feet = bpy.data.objects.new("Feet", None)
    col.objects.link(feet)
    feet.parent = arm
    make_actions(arm, spec)

    tris = 0
    deps = bpy.context.evaluated_depsgraph_get()
    for obj in col.all_objects:
        if obj.type == "MESH":
            mesh = obj.evaluated_get(deps).to_mesh()
            tris += sum(len(p.vertices) - 2 for p in mesh.polygons)
    parts = len([o for o in col.all_objects if o.type == "MESH"])
    out = os.path.abspath(os.path.join(out_dir, f"{look}.blend"))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=out)
    print(f"build_looks: {look}: {tris} triangles, {parts} parts, {len(BONES)} bones -> {out}")
    return out


def _args(argv: list[str]) -> argparse.Namespace:
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    p = argparse.ArgumentParser(prog="build_looks.py")
    p.add_argument("--look", required=True, help="a look id of looks_spec.py, or all")
    p.add_argument("--out", default="assets/external/looks")
    return p.parse_args(argv)


if __name__ == "__main__":
    a = _args(sys.argv)
    for look_id in (list(looks_spec.LOOKS) if a.look == "all" else a.look.split(",")):
        build(look_id, a.out)
