"""Build every world look from one base body (art plan 4.2-4.4; ASSETS 6.3; SPRITES 1-4).

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
# clavicle, upper arm, forearm, hand, thigh, shin and foot, plus a prop bone under each hand.
BONES: dict[str, tuple[tuple[float, float, float], tuple[float, float, float], str | None]] = {
    "root": ((0, 0, 0), (0, 0, 0.2), None),
    "hips": ((0, 0, lp.CROTCH), (0, 0, 0.98), "root"),
    "spine": ((0, 0, 0.98), (0, 0, 1.12), "hips"),
    "chest": ((0, 0, 1.12), (0, 0, lp.NECK[0]), "spine"),
    "neck": ((0, 0, lp.NECK[0]), (0, 0, lp.HEAD[0]), "chest"),
    "head": ((0, 0, lp.HEAD[0]), (0, 0, lp.HEAD[1]), "neck"),
}
for _s, _x in (("R", 1), ("L", -1)):
    BONES.update({
        f"clavicle.{_s}": ((_x * 0.03, 0, 1.27), (_x * lp.SHOULDER_X, 0, 1.27), "chest"),
        f"upper_arm.{_s}": ((_x * lp.SHOULDER_X, 0, 1.27), (_x * 0.205, 0, lp.ELBOW_Z), f"clavicle.{_s}"),
        f"forearm.{_s}": ((_x * 0.205, 0, lp.ELBOW_Z), (_x * 0.215, 0, lp.WRIST_Z), f"upper_arm.{_s}"),
        f"hand.{_s}": ((_x * 0.215, 0, lp.WRIST_Z), (_x * 0.215, 0, lp.WRIST_Z - lp.HAND_LEN), f"forearm.{_s}"),
        f"prop.{_s}": ((_x * 0.215, 0.0, 0.68), (_x * 0.215, 0.10, 0.68), f"hand.{_s}"),
        f"thigh.{_s}": ((_x * lp.LEG_X, 0, lp.CROTCH), (_x * lp.LEG_X, 0, lp.KNEE), "hips"),
        f"shin.{_s}": ((_x * lp.LEG_X, 0, lp.KNEE), (_x * lp.LEG_X, 0, lp.ANKLE), f"thigh.{_s}"),
        f"foot.{_s}": ((_x * lp.LEG_X, 0, lp.ANKLE), (_x * lp.LEG_X, 0.14, 0.03), f"shin.{_s}"),
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
    skin = looks_spec.skin_colour(spec["skin"])
    brow = ("skin", spec["skin"] - 1)
    h0, h1 = lp.HEAD
    b.part("Head", "body", skin, "head", [
        (frustum, dict(z0=h0, z1=h0 + 0.12, bottom=(0.15, 0.17), top=(0.22, 0.24), offset=(0, 0.01))),
        (frustum, dict(z0=h0 + 0.12, z1=h1 - 0.02, bottom=(0.22, 0.24), top=(0.21, 0.22), offset=(0, 0.01))),
        (box, dict(center=(0.0, 0.135, h0 + 0.12), size=(0.04, 0.04, 0.06))),  # nose
        (box, dict(center=(0.115, 0.0, h0 + 0.14), size=(0.03, 0.05, 0.07))),  # ears
        (box, dict(center=(-0.115, 0.0, h0 + 0.14), size=(0.03, 0.05, 0.07))),
    ])
    # A simple face: no drawn eyes at sprite size, one brow shadow (ASSETS 6.1, S3.3).
    b.part("Brow", "body", brow, "head", [
        (box, dict(center=(0.0, 0.125, h0 + 0.175), size=(0.17, 0.02, 0.025))),
    ], bevel=0)
    b.part("Neck", "body", skin, "neck", [(box, dict(center=(0, 0, 1.33), size=(0.11, 0.11, 0.10)))])
    jacket, shirt, trousers, boots = spec["jacket"], spec["shirt"], spec["trousers"], spec["boots"]
    c0, c1 = lp.CHEST
    b.part("Torso", "body", jacket, "chest", [
        (frustum, dict(z0=c0, z1=c1 - 0.06, bottom=(0.32, 0.20), top=(lp.SHOULDER_W - 0.02, 0.23))),
        (frustum, dict(z0=c1 - 0.06, z1=c1, bottom=(lp.SHOULDER_W - 0.02, 0.23), top=(0.30, 0.19))),
    ])
    b.part("Shirt", "body", shirt, "chest", [
        (frustum, dict(z0=c1 - 0.18, z1=c1 - 0.01, bottom=(0.02, 0.03), top=(0.13, 0.03), offset=(0, 0.11))),
    ], bevel=0.006)
    sleeve = spec.get("sleeve", jacket)
    forearm = spec.get("forearm", sleeve)
    b.part("Hem", "body", spec.get("hem", jacket), "hips", [
        (frustum, dict(z0=0.80, z1=lp.HIPS[1], bottom=(lp.HIP_W + 0.04, 0.23), top=(0.32, 0.21))),
    ])
    for s, x in (("R", 1), ("L", -1)):
        b.part(f"UpperArm.{s}", "body", sleeve, f"upper_arm.{s}", [
            (frustum, dict(z0=lp.ELBOW_Z - 0.01, z1=1.30, bottom=(0.10, 0.11), top=(0.12, 0.13),
                           offset=(x * 0.205, 0), top_offset=(x * 0.19, 0))),
        ])
        b.part(f"Forearm.{s}", "body", forearm, f"forearm.{s}", [
            (frustum, dict(z0=lp.WRIST_Z, z1=lp.ELBOW_Z + 0.01, bottom=(0.09, 0.09), top=(0.10, 0.11),
                           offset=(x * 0.215, 0), top_offset=(x * 0.205, 0))),
        ])
        b.part(f"Hand.{s}", "body", skin, f"hand.{s}", [
            (frustum, dict(z0=lp.WRIST_Z - lp.HAND_LEN, z1=lp.WRIST_Z, bottom=(0.06, 0.08), top=(0.08, 0.09),
                           offset=(x * 0.215, 0.01))),
        ])
        b.part(f"Thigh.{s}", "body", trousers, f"thigh.{s}", [
            (frustum, dict(z0=lp.KNEE - 0.01, z1=lp.CROTCH + 0.04, bottom=(0.12, 0.13), top=(0.15, 0.17),
                           offset=(x * lp.LEG_X, 0))),
        ])
        b.part(f"Shin.{s}", "body", trousers, f"shin.{s}", [
            (frustum, dict(z0=0.16, z1=lp.KNEE + 0.01, bottom=(0.10, 0.11), top=(0.12, 0.13),
                           offset=(x * lp.LEG_X, 0))),
        ])
        b.part(f"Boot.{s}", "body", boots, f"foot.{s}", [
            (frustum, dict(z0=0.0, z1=0.09, bottom=(0.11, lp.BOOT_LEN), top=(0.10, 0.22),
                           offset=(x * lp.LEG_X, 0.045), top_offset=(x * lp.LEG_X, 0.03))),
            (frustum, dict(z0=0.09, z1=0.20, bottom=(0.11, 0.12), top=(0.11, 0.12), offset=(x * lp.LEG_X, -0.01))),
        ])


def make_overlays(b: lp.Builder, spec: dict) -> None:
    # Every character wears the storm scarf (GDD 3.1): a neck wrap with a short tail, on the bone ramp,
    # tinted at runtime.
    scarf = ("bone", 2)
    b.part("Scarf", "scarf", scarf, "chest", [
        (ring, dict(z=1.30, radius=0.095, tube=0.035, segments=10, squash=1.05)),
        (frustum, dict(z0=1.13, z1=1.29, bottom=(0.07, 0.03), top=(0.08, 0.04), offset=(0.07, 0.13),
                       top_offset=(0.06, 0.12))),
    ], bevel=0.006)
    # Blood: a 3 mm inflated shell over the torso front and both hands (shown while Bloody).
    blood = ("blood", 2)
    b.part("BloodTorso", "blood", blood, "chest", [
        (frustum, dict(z0=lp.CHEST[0] + 0.02, z1=lp.CHEST[1] - 0.10, bottom=(0.30, 0.03),
                       top=(0.36, 0.03), offset=(0, 0.105), top_offset=(0, 0.118))),
    ], bevel=0, glow=True)
    for s, x in (("R", 1), ("L", -1)):
        b.part(f"BloodHand.{s}", "blood", blood, f"hand.{s}", [
            (frustum, dict(z0=lp.WRIST_Z - lp.HAND_LEN - 0.003, z1=lp.WRIST_Z + 0.003, bottom=(0.066, 0.086),
                           top=(0.086, 0.096), offset=(x * 0.215, 0.01))),
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


def interact_keys(base: str, raise_deg: float = 115) -> list[tuple[int, dict]]:
    """Eight looping frames of a hold: hands working, the body still, one of three bases (art plan 4.2).

    `raise_deg` is how far `raise` lifts the left arm: a look whose left hand holds a pole lifts it less,
    so the prop stays inside the cell."""
    if base == "kneel":
        # A low crouch on the right knee, the left shin upright with the foot on the ground, both hands working
        # low. The pose stays compact: the left foot ends 0.27 m forward (12 px down the screen when facing the
        # camera) and the right shin slopes back, so the figure keeps inside the 128 px cell in every direction.
        body = {"root": (0, 0, 0, 0, -0.14, 0), "spine": (-15, 0, 0), "chest": (-8, 0, 0), "head": (-12, 0, 0),
                "thigh.L": (20, 0, 0), "shin.L": (-20, 0, 0), "thigh.R": (20, 0, 0), "shin.R": (-65, 0, 0),
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
    # Two steps of a 0.5 m stride: each thigh swings 17 deg either way (0.85 m legs), the passing leg
    # lifts its foot by bending the knee; the arms swing against the legs.
    th, sw = 17, 18
    step = lambda s: {"thigh.R": (s * th, 0, 0), "thigh.L": (-s * th, 0, 0),  # noqa: E731
                      "shin.R": (0, 0, 0) if s > 0 else (-20, 0, 0), "shin.L": (-20, 0, 0) if s > 0 else (0, 0, 0),
                      **arms(-s * sw, s * sw, 12, 12), "spine": (-4, 3 * s, 0), "root": (0, 0, 0, 0, -0.012, 0)}
    passing = lambda s: {"thigh.R": (0, 0, 0) if s > 0 else (8, 0, 0),  # noqa: E731
                         "thigh.L": (8, 0, 0) if s > 0 else (0, 0, 0),
                         "shin.R": (0, 0, 0) if s > 0 else (-45, 0, 0), "shin.L": (-45, 0, 0) if s > 0 else (0, 0, 0),
                         **arms(0, 0, 10, 10), "spine": (-4, 0, 0), "root": (0, 0, 0, 0, 0.0, 0)}
    _action(arm, "walk", [(1, step(1)), (5, passing(1)), (9, step(-1)), (13, passing(-1)), (17, step(1))])
    # Swing (Kill, Crowbar, Check; never role-specific): wind-up, a forward-down strike of the right
    # hand, recovery.
    _action(arm, "swing", [
        (1, {**arms()}),
        (3, {**arms(-10, 5), "upper_arm.R": (75, 0, -12), "forearm.R": (70, 0, 0), "chest": (4, -18, 0)}),
        (5, {**arms(-15, 10), "upper_arm.R": (80, 0, -10), "forearm.R": (75, 0, 0), "chest": (8, -25, 0)}),
        (7, {**arms(15, -10), "upper_arm.R": (45, 0, -5), "forearm.R": (10, 0, 0), "chest": (-14, 15, 0),
             "spine": (-6, 0, 0), "head": (-6, 0, 0)}),
        (9, {**arms(5, 0), "upper_arm.R": (25, 0, -6), "forearm.R": (15, 0, 0), "chest": (-6, 6, 0)}),
        (11, {**arms()}),
    ])
    _action(arm, "interact", interact_keys(spec["interact"], spec.get("raise_deg", 115)))
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
