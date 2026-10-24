"""Build every world look from one base body (art plan 4.2-4.4; ASSETS 6.3; SPRITES 1-4; round 8 art.md 2).

    python tools/blender/build_looks.py -- --look baker --out assets/external/looks
    python tools/blender/build_looks.py -- --look all --out assets/external/looks

Each look is written as `<out>/<lookId>.blend`, a character file under the contract of
tools/blender/README.md: an `Export` collection, mesh parts tagged `wdi_part` (body, scarf, blood), a
`Feet` empty at the origin, and one action per clip of rig_common.R8_CLIPS (the V1 five, then the round-8
clips of docs/round8/motion.md 1) at 24 fps, which batch_render.py samples to 12 fps. The .blend files are git-ignored masters; the scripts are the
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
import rig_common as rc  # noqa: E402
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


def _drop(deg: float) -> float:
    """The root's offset that keeps the soles on the ground under crouch(deg)."""
    return -(lp.CROTCH - lp.ANKLE) * (1 - math.cos(math.radians(deg)))


def crouch(deg: float) -> dict:
    """Knees bent by `deg`: thighs forward, shins back, feet level, and the root dropped so the soles stay on the
    ground (the hip drop of two equal segments bent the same way). A crouch keeps a lean's head height inside
    the cell: a lean away from the camera lifts the crown on screen."""
    return {"thigh.R": (deg, 0, 0), "thigh.L": (deg, 0, 0), "shin.R": (-2 * deg, 0, 0), "shin.L": (-2 * deg, 0, 0),
            "foot.R": (deg, 0, 0), "foot.L": (deg, 0, 0), "root": (0, 0, 0, 0, _drop(deg), 0)}


def interact_keys(base: str, raise_deg: float = 95) -> list[tuple[float, dict]]:
    """A looping hold keyed in normalised time (`_clip`): hands working, the body still, one of three bases (art
    plan 4.2).

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
    for t, s in ((0, 0.0), (0.25, 1.0), (0.5, 0.0), (0.75, -1.0), (1, 0.0)):
        keys.append((t, {**body, **work(s)}))
    return keys


def swing_keys() -> list[tuple[int, dict]]:
    """The Knife's swing (and the Crowbar's, the Check's; never role-specific), on round-5 frames: see make_actions."""
    return [
        (1, {**arms()}),
        (3, {**arms(-10, 5), "upper_arm.R": (22, 0, -14), "forearm.R": (92, 0, 0), "chest": (3, -18, 0),
             "head": (0, 18, 0), **crouch(5)}),
        (5, {**arms(-15, 10), "upper_arm.R": (24, 0, -12), "forearm.R": (100, 0, 0), "chest": (5, -25, 0),
             "head": (0, 25, 0), **crouch(10)}),
        (7, {**arms(15, -10), "upper_arm.R": (55, 0, -5), "forearm.R": (10, 0, 0), "chest": (-8, 15, 0),
             "spine": (-3, 0, 0), "head": (-3, 0, 0), **crouch(22)}),
        (9, {**arms(5, 0), "upper_arm.R": (25, 0, -6), "forearm.R": (15, 0, 0), "chest": (-4, 6, 0), **crouch(8)}),
        (11, {**arms()}),
    ]


def make_actions(arm, spec: dict, clips: dict[str, rc.Clip] = rc.R8_CLIPS) -> None:
    """Every action of `clips` (rig_common.look_clips: the family builds none of FAMILY_DROPS). `idle` and
    `interact` are keyed in normalised time through `_clip`, so their frame counts are the table's (A161); `walk`,
    `swing` and `die` keep their round-5 frames, which the table never changed."""
    # Loops span 2n scene frames (n at 12 fps; the last key repeats the first and is not rendered).
    # One-shots span 2n - 1 frames so they render n frames including the last.
    _clip(arm, "idle", [
        (0, {**arms()}),
        (0.25, {**arms(2, 2), "chest": (2, 0, 0), "root": (0, 0, 0, 0.004, 0.006, 0)}),
        (0.5, {**arms()}),
        (0.75, {**arms(-1, -1), "chest": (-1, 0, 0), "head": (-2, 0, 2), "root": (0, 0, 0, -0.004, -0.003, 0)}),
        (1, {**arms()}),
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
    if "swing" in clips:
        _action(arm, "swing", swing_keys())
    _clip(arm, "interact", interact_keys(spec["interact"], spec.get("raise_deg", 95)))
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
    make_r8_actions(arm, held_hands(arm), clips)
    arm.animation_data.action = None


# The hand each round-8 clip acts with: a look that carries a prop in that hand plays the clip mirrored.
ACTING = {"strike": "R", "threaten": "R", "inspect": "R", "eat": "R", "hurt": "L"}
_OTHER = {"R": "L", "L": "R"}


def mirror(pose: dict) -> dict:
    """The pose reflected through the figure's mid plane (x = 0): sides swap, Y and Z rotations and the X offset
    change sign. Every bone's local X is world X (the module docstring), so this holds for every bone."""
    out = {}
    for bone, (rx, ry, rz, *loc) in pose.items():
        if bone[-2:] in (".R", ".L"):
            bone = bone[:-1] + _OTHER[bone[-1]]
        out[bone] = (rx, -ry, -rz, *([-loc[0], loc[1], loc[2]] if loc else []))
    return out


def carry(pose: dict, side: str) -> dict:
    """The pose with the `side` arm held low, as it carries a prop: a raised or swung hand would lift a bag, a pail
    or a lantern pole out of the cell (SPRITES 1)."""
    sign = -1 if side == "R" else 1
    rx = pose.get(f"upper_arm.{side}", (0,))[0]
    ex = pose.get(f"forearm.{side}", (8,))[0]
    return {**pose, f"upper_arm.{side}": (max(-12, min(12, rx)), 0, sign * SPREAD),
            f"forearm.{side}": (max(0, min(15, ex)), 0, 0)}


def held_hands(arm) -> set[str]:
    """The sides whose hand carries a prop part (look_parts.py binds those to `prop.R` or `prop.L`)."""
    return {o.parent_bone[-1] for o in arm.children if o.parent_bone in ("prop.R", "prop.L")}


def _clip(arm, name: str, keys: list[tuple[float, dict]], held: set[str] = frozenset()) -> None:
    """An action keyed in normalised time: t in [0, 1] lands on scene frame 1 + t * span, where the span comes
    from the clip's rendered frame count in rig_common.R8_CLIPS. A loop's t = 1 key repeats its t = 0 key, a
    one-shot's t = 1 key is its last rendered frame. A clip that the budget trims changes one table row.

    `held` names the hands that carry a prop: the clip is mirrored when it acts with one of them, then every
    carrying hand is held low."""
    span = rc.R8_CLIPS[name].span()
    if ACTING.get(name) in held:
        keys = [(t, mirror(pose)) for t, pose in keys]
    for side in held:
        keys = [(t, carry(pose, side)) for t, pose in keys]
    _action(arm, name, [(1 + round(t * span), pose) for t, pose in keys])


# The downed pose of knockdown, down and getup: on the back, turned to the left like die, one knee up and the
# arms at the sides, so it reads as alive beside die's spread-eagle.
DOWN = {"upper_arm.R": (-20, 0, -35), "upper_arm.L": (-15, 0, 35), "forearm.R": (25, 0, 0), "forearm.L": (20, 0, 0),
        "thigh.R": (8, 0, -8), "thigh.L": (35, 0, 6), "shin.L": (-60, 0, 0), "foot.L": (20, 0, 0),
        "head": (-8, 12, 0), "root": (90, -45, 0, 0, 0.13, 0)}
# Fists at the chest: the guard of strike and stomp.
GUARD = {"upper_arm.R": (35, 0, -8), "upper_arm.L": (35, 0, 8), "forearm.R": (105, 0, 0), "forearm.L": (105, 0, 0)}


def make_r8_actions(arm, held: set[str], clips: dict[str, rc.Clip] = rc.R8_CLIPS) -> None:
    """The round-8 clips (motion.md 1) that `clips` names. Run, strike and hurt render in eight directions; limp,
    stagger, the one-shots and the mood idles in the four diagonals (A161); the leans stay small and the knees take
    the weight, as in swing, so a raised hand or a hat keeps inside the cell (SPRITES 1)."""
    def clip(name: str, keys: list[tuple[float, dict]]) -> None:
        if name in clips:
            _clip(arm, name, keys, held)

    # Run: a 0.7 m stride, the trunk leaning in, elbows bent near 70 degrees, the hips dropping at each contact.
    # The bounce goes down, not up, and the lean stays at 6 degrees: either lifts a hat crown on screen when the
    # runner faces away (the headroom of SPRITES 1).
    run = lambda s: {"thigh.R": (s * 30, 0, 0), "thigh.L": (-s * 30, 0, 0),  # noqa: E731
                     "shin.R": (-10, 0, 0) if s > 0 else (-55, 0, 0), "shin.L": (-55, 0, 0) if s > 0 else (-10, 0, 0),
                     **arms(-s * 32, s * 32, 70, 70), "spine": (-6, 5 * s, 0), "chest": (-2, 0, 0),
                     "root": (0, 0, 0, 0, -0.04, 0)}
    flight = lambda s: {"thigh.R": (-6, 0, 0) if s > 0 else (32, 0, 0),  # noqa: E731
                        "thigh.L": (32, 0, 0) if s > 0 else (-6, 0, 0),
                        "shin.R": (-25, 0, 0) if s > 0 else (-90, 0, 0), "shin.L": (-90, 0, 0) if s > 0 else (-25, 0, 0),
                        **arms(0, 0, 75, 75), "spine": (-6, 0, 0), "chest": (-2, 0, 0), "root": (0, 0, 0, 0, -0.01, 0)}
    clip("run", [(0, run(1)), (0.25, flight(1)), (0.5, run(-1)), (0.75, flight(-1)), (1, run(1))])
    # Limp: the right knee stays straight; the hips dip onto it at its stance and hike to swing it through.
    limp = [
        (0, {"thigh.R": (14, 0, 0), "thigh.L": (-14, 0, 0), "shin.L": (-10, 0, 0), **arms(-10, 12, 10, 10),
             "spine": (-4, 0, 0), "root": (0, 0, 0, 0, -0.012, 0)}),
        (0.25, {"thigh.R": (-2, 0, 0), "thigh.L": (10, 0, 0), "shin.L": (-50, 0, 0), **arms(0, 0, 14, 10),
                "spine": (-7, 0, -7), "head": (-6, 0, -4), "root": (0, 0, 0, 0.02, -0.035, 0)}),
        (0.5, {"thigh.R": (-12, 0, 0), "thigh.L": (16, 0, 0), **arms(12, -10, 10, 10), "spine": (-5, 0, -3),
               "root": (0, 0, 0, 0.01, -0.02, 0)}),
        (0.75, {"thigh.R": (6, 0, -8), "thigh.L": (0, 0, 0), "shin.L": (-8, 0, 0), **arms(4, 0, 10, 10),
                "spine": (-3, 0, 5), "root": (0, 0, 0, -0.01, -0.008, 0)}),
    ]
    clip("limp", limp + [(1, limp[0][1])])
    # Stagger: the body sways side to side, the spine rolling against the hips, a foot thrown out to catch it,
    # the arms loose and lagging.
    sway = lambda s: {**crouch(18), "root": (0, 0, 0, 0.05 * s, _drop(18), 0), "spine": (-4, 0, -8 * s),  # noqa: E731
                      "head": (-8, 0, 10 * s),
                      "upper_arm.R": (-4, 0, -SPREAD - 10 - 8 * s), "upper_arm.L": (-4, 0, SPREAD + 10 - 8 * s),
                      "forearm.R": (15, 0, 0), "forearm.L": (15, 0, 0),
                      "thigh.R" if s > 0 else "thigh.L": (10, 0, -10 * s), "shin.R" if s < 0 else "shin.L": (-25, 0, 0)}
    mid = lambda s: {"spine": (-8, 0, 3 * s), "head": (-12, 0, -4 * s),  # noqa: E731
                     **arms(8, 8, 25, 25), **crouch(14)}
    clip("stagger", [(0, sway(1)), (0.25, mid(1)), (0.5, sway(-1)), (0.75, mid(-1)), (1, sway(1))])
    # Strike: guard up, the right fist drawn back with a chest twist, a straight cross at shoulder height with the
    # left foot forward, back to guard, then rest. The fist stays below the head.
    clip("strike", [
        (0, {**arms()}),
        (0.2, {**GUARD, "chest": (0, -8, 0), **crouch(6)}),
        (0.4, {**GUARD, "upper_arm.R": (25, 0, -16), "forearm.R": (120, 0, 0), "chest": (2, -22, 0),
               "head": (0, 18, 0), **crouch(10)}),
        (0.6, {**GUARD, "upper_arm.R": (82, 0, 4), "forearm.R": (8, 0, 0), "chest": (-6, 20, 0), "head": (0, -14, 0),
               "thigh.L": (18, 0, 0), "thigh.R": (-8, 0, 0), "shin.R": (-12, 0, 0)}),
        (0.8, {**GUARD, "chest": (0, 4, 0), **crouch(6)}),
        (1, {**arms()}),
    ])
    # Hurt: a flinch back from a blow, the left forearm up across the chest, then most of the way back.
    clip("hurt", [
        (0, {**arms()}),
        (1 / 3, {**arms(-6, 30, 25, 95), "spine": (4, 0, 4), "head": (6, 0, 8), **crouch(14),
                 "root": (0, 0, 0, 0, _drop(14), 0.03)}),
        (2 / 3, {**arms(-2, 12, 15, 40), "spine": (3, 0, 2), "head": (4, 0, 3), **crouch(5)}),
        (1, {**arms()}),
    ])
    # Knockdown: the knees buckle and the body falls back and to the left, as die does, landing in DOWN.
    clip("knockdown", [
        (0, {**arms()}),
        (0.2, {**arms(-20, -20, 30, 30), "chest": (10, 0, 0), "head": (12, 0, 0),
               "thigh.R": (22, 0, 0), "thigh.L": (22, 0, 0), "shin.R": (-38, 0, 0), "shin.L": (-38, 0, 0),
               "root": (0, 0, 0, 0, -0.07, 0)}),
        (0.4, {**arms(-45, -45, 20, 20), "chest": (12, 0, 0), "head": (16, 0, 0),
               "thigh.R": (35, 0, 0), "thigh.L": (32, 0, 0), "shin.R": (-50, 0, 0), "shin.L": (-55, 0, 0),
               "root": (30, -20, 0, 0, -0.10, 0)}),
        (0.6, {**arms(-80, -80, 10, 10), "chest": (5, 0, 0), "head": (10, 0, 0),
               "thigh.R": (25, 0, 0), "thigh.L": (30, 0, 0), "shin.R": (-25, 0, 0), "shin.L": (-45, 0, 0),
               "root": (65, -38, 0, 0, 0.03, 0)}),
        (0.8, {**DOWN, "upper_arm.R": (-50, 0, -30), "upper_arm.L": (-45, 0, 30), "head": (4, 6, 0),
               "root": (86, -44, 0, 0, 0.12, 0)}),
        (1, DOWN),
    ])
    # Down: lying in DOWN, breathing; the raised knee rocks and the head turns a little.
    clip("down", [
        (0, DOWN),
        (0.25, {**DOWN, "chest": (-4, 0, 0), "thigh.L": (32, 0, 9), "head": (-8, 16, 0)}),
        (0.5, {**DOWN, "chest": (-1, 0, 0), "forearm.R": (35, 0, 0)}),
        (0.75, {**DOWN, "chest": (-4, 0, 0), "thigh.L": (37, 0, 3), "head": (-8, 8, 0)}),
        (1, DOWN),
    ])
    # Getup: from DOWN the trunk rises on the arms to a sit, rolls forward onto the right knee, pushes up on the
    # left knee to a crouch and stands.
    clip("getup", [
        (0, DOWN),
        (0.2, {"upper_arm.R": (-45, 0, -25), "upper_arm.L": (-45, 0, 25), "forearm.R": (20, 0, 0),
               "forearm.L": (20, 0, 0), "thigh.R": (20, 0, -6), "thigh.L": (45, 0, 6), "shin.R": (-30, 0, 0),
               "shin.L": (-80, 0, 0), "head": (-15, 6, 0), "root": (55, -32, 0, 0, 0.10, 0)}),
        (0.4, {"upper_arm.R": (-35, 0, -20), "upper_arm.L": (-35, 0, 20), "forearm.R": (10, 0, 0),
               "forearm.L": (10, 0, 0), "thigh.R": (75, 0, -4), "thigh.L": (85, 0, 4), "shin.R": (-95, 0, 0),
               "shin.L": (-120, 0, 0), "spine": (-18, 0, 0), "head": (-8, 0, 0),
               "root": (0, -18, 0, 0, -(lp.CROTCH - 0.14), 0)}),
        (0.6, {"root": (0, -6, 0, 0, -0.14, 0.08), "spine": (-22, 0, 0), "chest": (-6, 0, 0), "head": (-6, 0, 0),
               "thigh.L": (45, 0, 0), "shin.L": (-68, 0, 0), "thigh.R": (20, 0, 0), "shin.R": (-65, 0, 0),
               "foot.R": (30, 0, 0), "upper_arm.L": (40, 0, 5), "forearm.L": (45, 0, 0),
               "upper_arm.R": (20, 0, -SPREAD), "forearm.R": (20, 0, 0)}),
        (0.8, {**arms(10, 25, 15, 40), "spine": (-12, 0, 0), "head": (-4, 0, 0), **crouch(25)}),
        (1, {**arms()}),
    ])
    # Stunned: a slow, flattened circle of the hips with the head lolling against it, the knees soft, the arms
    # hanging. The circle is mostly sideways: a drift away from the camera lifts the figure on screen.
    def daze(a: float) -> dict:
        c, s = math.cos(a), math.sin(a)
        return {"spine": (-4 + 3 * s, 0, -5 * c), "head": (-12 + 5 * s, 0, 11 * c), "neck": (-4, 0, 4 * c),
                **arms(-3, -3, 6, 6), **crouch(12), "root": (0, 0, 0, 0.03 * c, _drop(12), 0.012 * s)}
    clip("stunned", [(i / 3, daze(2 * math.pi * i / 3)) for i in range(4)])
    # Inspect: a lean in on bent knees, the right hand shading the brow, a look left and right, back.
    brow = {**crouch(8), "upper_arm.R": (68, 0, 6), "forearm.R": (118, 0, 0), "spine": (-7, 0, 0),
            "chest": (-4, 0, 0), "upper_arm.L": (0, 0, SPREAD), "forearm.L": (10, 0, 0)}
    clip("inspect", [
        (0, {**arms()}),
        (0.2, {**brow, "upper_arm.R": (40, 0, 0), "forearm.R": (80, 0, 0), "head": (-8, 0, 0)}),
        (0.4, {**brow, "head": (-10, 0, 0)}),
        (0.6, {**brow, "head": (-10, 16, 0), "neck": (0, 6, 0)}),
        (0.8, {**brow, "head": (-10, -16, 0), "neck": (0, -6, 0)}),
        (1, {**arms()}),
    ])
    # Cower: a deep crouch, the head down, both forearms crossed before the face, shivering.
    def shiver(s: float) -> dict:
        return {**crouch(30), "spine": (-20, 0, 2 * s), "chest": (-8, 0, 0), "head": (-22, 0, -3 * s),
                "upper_arm.R": (62, 0, 22), "upper_arm.L": (66, 0, -22), "forearm.R": (112, 0, 0),
                "forearm.L": (108, 0, 0), "root": (0, 0, 0, 0.006 * s, _drop(30), 0)}
    clip("cower", [(0, shiver(1)), (1 / 3, shiver(-1)), (2 / 3, shiver(0.4)), (1, shiver(1))])
    # Fidget: the weight shifts from foot to foot while the hands rub together at the waist.
    def fidget(s: float, r: float) -> dict:
        return {"root": (0, 0, 0, 0.02 * s, -0.004, 0), "hips": (0, 0, 3 * s), "spine": (-2, 0, -4 * s),
                "head": (-6, 4 * s, 2 * s), "upper_arm.R": (24, 0, 12), "upper_arm.L": (24, 0, -12),
                "forearm.R": (78 + 6 * r, 0, 0), "forearm.L": (78 - 6 * r, 0, 0),
                "thigh.R" if s < 0 else "thigh.L": (6, 0, 0), "shin.R" if s < 0 else "shin.L": (-12, 0, 0)}
    clip("fidget", [(0, fidget(1, 1)), (1 / 3, fidget(0, -1)), (2 / 3, fidget(-1, 1)), (1, fidget(1, 1))])
    # Stomp: fists clenched low, the right knee lifts and stamps, then the left.
    fists = {"upper_arm.R": (8, 0, -14), "upper_arm.L": (8, 0, 14), "forearm.R": (40, 0, 0), "forearm.L": (40, 0, 0)}
    lift = lambda side: {**fists, f"thigh.{side}": (55, 0, 0), f"shin.{side}": (-75, 0, 0),  # noqa: E731
                         "spine": (2, 0, 0), "head": (-4, 0, 0), "root": (0, 0, 0, 0, 0.0, 0)}
    stamp = {**fists, **crouch(8), "chest": (-7, 0, 0), "head": (-10, 0, 0)}
    clip("stomp", [(0, stamp), (1 / 6, lift("R")), (2 / 6, stamp), (3 / 6, {**fists, **crouch(3)}),
                         (4 / 6, lift("L")), (5 / 6, stamp), (1, stamp)])
    # Eat: the right hand to the mouth, the head chewing, the hand down again.
    mouth = {"upper_arm.R": (32, 0, 12), "forearm.R": (132, 0, 0), "upper_arm.L": (0, 0, SPREAD),
             "forearm.L": (12, 0, 0)}
    clip("eat", [
        (0, {**arms()}),
        (0.2, {**mouth, "head": (-6, 0, 0)}),
        (0.4, {**mouth, "head": (-12, 0, 2), "forearm.R": (120, 0, 0)}),
        (0.6, {**mouth, "head": (-4, 0, -2), "forearm.R": (110, 0, 0)}),
        (0.8, {**mouth, "head": (-10, 0, 0), "forearm.R": (60, 0, 0), "upper_arm.R": (15, 0, 4)}),
        (1, {**arms()}),
    ])
    # Threaten: a step in on the left foot, the right fist at the chest, the left hand pointing and jabbing.
    point = lambda jab: {"upper_arm.R": (22, 0, -6), "forearm.R": (118, 0, 0),  # noqa: E731
                         "upper_arm.L": (70 + 8 * jab, 0, 4), "forearm.L": (8 - 6 * jab, 0, 0),
                         "chest": (-5 - 3 * jab, -10, 0), "head": (-6, 10, 0), "thigh.L": (16, 0, 0),
                         "thigh.R": (-8, 0, 0), "shin.R": (-8, 0, 0)}
    clip("threaten", [(0, {**arms()}), (0.2, {**point(0), "upper_arm.L": (40, 0, 4), "forearm.L": (60, 0, 0)}),
                            (0.4, point(1)), (0.6, point(0)), (0.8, point(1)), (1, {**arms()})])
    # Rob: a deep stoop over the body on the ground, the hands rummaging low, one stashing at the chest, back up.
    # A stoop rather than interact's kneel: a long robe kneeling reaches the cell's bottom edge.
    stoop = lambda t: {**crouch(34), "spine": (-24, 0, 0), "chest": (-8, 0, 0), "head": (-14, 0, 0),  # noqa: E731
                       "upper_arm.R": (42 + 8 * t, 0, -6), "upper_arm.L": (40 - 8 * t, 0, 6),
                       "forearm.R": (30 - 10 * t, 0, 0), "forearm.L": (30 + 10 * t, 0, 0)}
    clip("rob", [
        (0, {**arms()}),
        (0.2, {**arms(20, 20, 30, 30), "spine": (-12, 0, 0), **crouch(20)}),
        (0.4, stoop(1)),
        (0.6, stoop(-1)),
        (0.8, {**stoop(0), "upper_arm.R": (28, 0, -2), "forearm.R": (118, 0, 0), "head": (-6, 14, 0)}),
        (1, {**arms()}),
    ])


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
    make_actions(arm, spec, rc.look_clips(look))

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
