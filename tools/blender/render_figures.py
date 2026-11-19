"""Render one character model to a figure's frames (round 11, F1; plan v2 4.4, docs/round12/sprite-world.md).

    EGL_PLATFORM=surfaceless tools/blender/.venv/bin/python tools/blender/render_figures.py -- \
        --model baker [--look baker] --out tools/blender/build/figures
    pnpm --filter @wdi/sprites pixel <out>/<look> <finished>/<look> --finish off
    pnpm --filter @wdi/sprites run pack <finished>/<look> <atlas dir> --style hd

The model is a character GLB of `models/models.lock.json` (fetched and hash-checked by `models/fetch_models.py`, or
`--glb` for a file at hand). It renders under the rig's `IsoCam` (SPRITES 10.3: orthographic, X 60, Z 45, 90.51 px a
ground metre, the 0.75 character root) into 128 px display cells with the world origin, the feet, at (64, 112), in
the eight screen directions of the turntable; `tools/sprites` halves them to today's 64 px packed cell (feet at 56,
pivot 0.5, 0.875) and packs them under `char/<lookId>/<anim>/<dir>/<nnn>`. The output folder has the layout of
`batch_render.py` (`<out>/<look>/body/char_<look>_<anim>_<dir>_<nnn>.png` and `manifest.json`), so the packer reads
it unchanged.

Two clips (A616 Q3): `walk`, one cycle of the model's walk in 8 frames, and `idle`, the walk's standing frame with
a slow breath (`figures.IDLE_FRAMES`). Cycles renders them: smooth shading, the model's own textures, no outline and
no palette snap, the sprite world's HD look. One sun, CL3a's direction at the default heading (A616 Q4), and a sky
fill; a figure shadows itself and casts nothing (the scene draws its blob shadow).
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_rig  # noqa: E402
import figures as fg  # noqa: E402
import rig_common as rc  # noqa: E402

CELL = rc.CELL_PX
FEET_ROW = rc.FEET_ROW_PX


def _args(argv: list[str]) -> argparse.Namespace:
    argv = argv[argv.index("--") + 1 :] if "--" in argv else argv[1:]
    p = argparse.ArgumentParser(prog="render_figures.py")
    p.add_argument("--model", required=True, help="a character id of models/models.lock.json")
    p.add_argument("--look", help="the look id of looks.json the figure renders as (default: the model id)")
    p.add_argument("--glb", help="the GLB to render instead of the locked one (tests, a model being changed)")
    p.add_argument("--out", required=True)
    p.add_argument("--anims", default=",".join(fg.FIGURE_CLIPS), help="comma list of idle, walk")
    p.add_argument("--dirs", default=",".join(rc.DIRECTIONS), help="comma list of screen directions")
    p.add_argument("--forward", default="-Y", choices=sorted(fg.FORWARD_TURN),
                   help="the axis the model faces after the glTF import")
    return p.parse_args(argv)


# ---------------------------------------------------------------- the scene


def build_scene() -> bpy.types.Scene:
    """An empty scene with the rig's IsoCam, the character root, the turntable, the sun and the sky."""
    scene = build_rig.reset_scene()
    build_rig.apply_render_settings(scene)
    r = scene.render
    # Cycles on the CPU: about 0.1 s a 128 px frame where EEVEE, on a container's software GL, takes 9 s with
    # shadows. A fixed seed, a fixed sample count and no denoiser keep two runs byte-identical.
    r.engine = "CYCLES"
    c = scene.cycles
    c.device = "CPU"
    c.samples = fg.SAMPLES
    c.use_adaptive_sampling = False
    c.use_denoising = False
    c.seed = 0
    c.use_animated_seed = False
    c.max_bounces = 4
    c.filter_width = 1.5  # the HD finish's wider film filter (rig_common.HD): no pixel finish keeps lines hard
    for name in dir(r):  # the PNG's tEXt stamps carry the date and the time; off, two runs write the same bytes
        if name.startswith("use_stamp_") and name != "use_stamp":
            setattr(r, name, False)
    r.use_stamp = False

    world = bpy.data.worlds.new("FigureSky")
    scene.world = world
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = rc.hex_to_linear(fg.AMBIENT_COLOR)
    bg.inputs["Strength"].default_value = fg.AMBIENT_STRENGTH

    col = bpy.data.collections.new("Rig")
    scene.collection.children.link(col)
    cam, _tile = build_rig.make_cameras(col)
    scene.camera = cam
    _env, char_root = build_rig.make_roots(col)
    tt = bpy.data.objects.new("TT", None)
    col.objects.link(tt)
    tt.parent = char_root
    holder = bpy.data.objects.new("Holder", None)
    col.objects.link(holder)
    holder.parent = tt

    sun = bpy.data.lights.new("Sun", "SUN")
    sun.energy = fg.SUN_STRENGTH
    sun.color = rc.hex_to_linear(fg.SUN_COLOR)[:3]
    sun.angle = math.radians(fg.SUN_ANGLE_DEG)
    sun.use_shadow = True
    sun_obj = bpy.data.objects.new("Sun", sun)
    col.objects.link(sun_obj)
    d = Vector(fg.toward(fg.sun_world_azimuth(rc.KEY_LIGHT["azimuth"], rc.CAMERA_YAW_DEG), fg.SUN_ELEVATION_DEG))
    sun_obj.location = d * 20.0
    sun_obj.rotation_euler = d.to_track_quat("Z", "Y").to_euler()  # a sun shines down its -Z

    r.resolution_x = r.resolution_y = CELL
    cam.data.ortho_scale = rc.ortho_scale(CELL)
    cam.data.shift_y = rc.camera_shift_y(FEET_ROW, CELL)
    return scene


# ---------------------------------------------------------------- the model


def import_model(path: str) -> tuple[bpy.types.Object, list[bpy.types.Object]]:
    """Import a GLB; returns its armature and the meshes it deforms. Anything else the file carries (the stray
    unskinned Icosphere both generators leave) is deleted, so it neither renders nor counts in a bound."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(path))
    new = [o for o in bpy.data.objects if o not in before]
    arms = [o for o in new if o.type == "ARMATURE"]
    if len(arms) != 1:
        raise SystemExit(f"{path}: {len(arms)} armatures, expected one")
    arm = arms[0]
    meshes = [o for o in new if o.type == "MESH"
              and any(m.type == "ARMATURE" and m.object == arm for m in o.modifiers)]
    if not meshes:
        raise SystemExit(f"{path}: no mesh is deformed by {arm.name}")
    for o in new:
        if o is not arm and o not in meshes:
            bpy.data.objects.remove(o, do_unlink=True)
    return arm, meshes


def walk_action(arm) -> bpy.types.Action:
    names = sorted(a.name for a in bpy.data.actions if fg.WALK_RE.search(a.name))
    if not names:
        raise SystemExit(f"no walk clip among {sorted(a.name for a in bpy.data.actions)}")
    action = bpy.data.actions[names[0]]
    arm.animation_data_create().action = action
    return action


def set_time(scene, t: float) -> None:
    frame = math.floor(t)
    scene.frame_set(frame, subframe=t - frame)


def pose_vector(arm) -> list[float]:
    """Every bone's head in armature space: the state a cycle returns to."""
    return [c for pb in arm.pose.bones for c in pb.head]


def low_points(meshes) -> list[Vector]:
    """World positions of the evaluated vertices in the lowest eighth of the figure: its feet."""
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in meshes:
        ev = o.evaluated_get(dg)
        pts += [ev.matrix_world @ v.co for v in ev.data.vertices]
    top = max(p.z for p in pts)
    floor = min(p.z for p in pts)
    return [p for p in pts if p.z < floor + (top - floor) / 8.0]


def analyse_walk(scene, arm, meshes, action) -> dict:
    """The cycle (start, period in scene frames) and the standing time of the walk, from the pose itself, so any
    rig and any clip length works: the Higgsfield clips hold about three cycles, the Meshy ones one."""
    start, end = (float(f) for f in action.frame_range)
    frames = list(range(math.ceil(start), math.floor(end) + 1))
    samples = []
    for f in frames:
        set_time(scene, f)
        samples.append(pose_vector(arm))
    lag = fg.find_period(samples)
    period = float(lag) if lag is not None else end - start
    # The stride runs along the model's forward axis, Y for both generators (FORWARD_TURN).
    spreads, times = [], [t for t in frames if t < start + period]
    for t in times:
        set_time(scene, t)
        ys = [p.y for p in low_points(meshes)]
        spreads.append(max(ys) - min(ys))
    standing = float(times[fg.pick_standing(spreads)])
    return {"start": start, "period": period, "standing": standing, "clipFrames": [start, end]}


def chest_bone(arm, height: float) -> bpy.types.PoseBone:
    """The bone the breath lifts: the highest bone near the body's axis that branches three ways (spine into neck
    and shoulders) below the head; the hips branch lower, the hands and the face away from the axis or higher."""
    best = None
    for b in arm.data.bones:
        head = arm.matrix_world @ b.head_local
        if len(b.children) >= 3 and math.hypot(head.x, head.y) < 0.12 and head.z < 0.85 * height:
            if best is None or head.z > best[0]:
                best = (head.z, b.name)
    if best is None:
        raise SystemExit(f"{arm.name}: no chest bone (a bone branching into the neck and the shoulders)")
    return arm.pose.bones[best[1]]


def lift_in_parent_frame(arm, pb, metres: float) -> Vector:
    """The pose location that moves `pb` straight up by `metres` in world space from its current pose."""
    world_up = Vector((0.0, 0.0, metres))
    arm_space = arm.matrix_world.to_3x3().inverted() @ world_up
    frame = pb.matrix @ pb.matrix_basis.inverted()  # the bone's rest frame under its posed parent
    return frame.to_3x3().inverted() @ arm_space


# ---------------------------------------------------------------- rendering


def touches_border(path: str) -> bool:
    import numpy as np

    img = bpy.data.images.load(os.path.abspath(path))
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    bpy.data.images.remove(img)
    alpha = a.reshape(h, w, 4)[:, :, 3] > 0.05
    return bool(alpha[0].any() or alpha[-1].any() or alpha[:, 0].any() or alpha[:, -1].any())


def render_lock(out_root: str, look: str, model: str, flags: dict):
    """The render lock of T4 (`render_lock.py`), once it has merged; until then None and no lock is written."""
    try:
        import render_lock
    except ImportError:
        return None
    return render_lock.Lock(out_root, f"char_{look}", __file__, flags=flags, model=model,
                            blender=bpy.app.version_string,
                            sources=("rig_common.py", "build_rig.py", os.path.join("figures", "__init__.py")))


def render_figure(args) -> dict:
    t0 = time.time()
    look = fg.check_look(args.look or args.model)
    glb = args.glb
    if not glb:
        sys.path.insert(0, os.path.join(HERE, "models"))
        import fetch_models as fm

        models = fm.load_lock()
        row = next((m for m in models["models"] if m["id"] == args.model and m["kind"] == "character"), None)
        if row is None:
            raise SystemExit(f"no character {args.model!r} in models.lock.json")
        glb = fm.fetch_release(row["release"], models)[args.model]
    anims = [a for a in args.anims.split(",") if a]
    dirs = [d for d in args.dirs.split(",") if d]
    for a in anims:
        if a not in fg.FIGURE_CLIPS:
            raise SystemExit(f"unknown figure clip {a!r}; the clips are {', '.join(fg.FIGURE_CLIPS)}")
    for d in dirs:
        if d not in rc.DIRECTIONS:
            raise SystemExit(f"unknown direction {d!r}")

    scene = build_scene()
    arm, meshes = import_model(glb)
    action = walk_action(arm)
    walk = analyse_walk(scene, arm, meshes, action)

    # Stand the figure on the origin: the feet's centre at the standing frame on x = y = 0, the sole on z = 0, one
    # offset for every frame so the walk keeps its bob.
    set_time(scene, walk["standing"])
    low = low_points(meshes)
    cx = (min(p.x for p in low) + max(p.x for p in low)) / 2.0
    cy = (min(p.y for p in low) + max(p.y for p in low)) / 2.0
    floor = min(p.z for p in low)
    holder = bpy.data.objects["Holder"]
    tt = bpy.data.objects["TT"]
    arm.parent = holder
    arm.matrix_parent_inverse = Matrix.Translation((-cx, -cy, -floor))
    holder.rotation_euler.z = fg.FORWARD_TURN[args.forward]
    bpy.context.view_layer.update()
    height = max((o.matrix_world @ Vector(c)).z for o in meshes for c in o.bound_box) / rc.Z_SCALE

    out_root = os.path.join(args.out, look)
    os.makedirs(os.path.join(out_root, "body"), exist_ok=True)
    flags = {"look": look, "anims": anims, "dirs": dirs, "forward": args.forward}
    lock = render_lock(out_root, look, args.model, flags)
    manifest = {"version": 1, "body": look, "cell": CELL, "fps": rc.OUTPUT_FPS, "style": "hd", "factor": 1,
                "passes": ["body"], "frames": {},
                "figure": {"model": args.model, "clip": action.name, "walk": walk, "heightM": round(height, 3),
                           "breathM": fg.BREATH_LIFT_M, "forward": args.forward}}
    clipped: list[str] = []

    def shoot(anim: str, index: int) -> None:
        for d in dirs:
            tt.rotation_euler.z = rc.turntable_z(rc.DIRECTIONS.index(d))
            bpy.context.view_layer.update()
            name = rc.frame_name(look, anim, d, index)
            path = os.path.join(out_root, "body", name + ".png")
            scene.render.filepath = os.path.abspath(path)
            bpy.ops.render.render(write_still=True)
            with open(path, "rb") as fh:
                data = fg.strip_text_chunks(fh.read())
            with open(path, "wb") as fh:
                fh.write(data)
            entry = {"feet": [CELL / 2, float(FEET_ROW)]}  # the world origin, where the figure stands
            if touches_border(path):
                entry["clipped"] = True
                clipped.append(name)
            manifest["frames"][name] = entry
            if lock is not None:
                lock.record(name)

    if "walk" in anims:
        frames, _loop = fg.FIGURE_CLIPS["walk"]
        for k, t in enumerate(fg.walk_times(walk["start"], walk["period"], frames)):
            set_time(scene, t)
            shoot("walk", k)
    if "idle" in anims:
        set_time(scene, walk["standing"])
        arm.animation_data.action = None  # the pose stays where the walk left it
        pb = chest_bone(arm, height * rc.Z_SCALE)
        base = pb.location.copy()
        lift = lift_in_parent_frame(arm, pb, fg.BREATH_LIFT_M * rc.Z_SCALE)
        frames, _loop = fg.FIGURE_CLIPS["idle"]
        for k in range(frames):
            pb.location = base + lift * fg.breath(k, frames)
            shoot("idle", k)
        pb.location = base
        manifest["figure"]["chestBone"] = pb.name

    with open(os.path.join(out_root, "manifest.json"), "w") as fh:
        json.dump(manifest, fh, indent=2, sort_keys=True)
        fh.write("\n")
    if lock is not None:
        lock.write()
    secs = time.time() - t0
    n = len(manifest["frames"])
    print(f"render_figures: {args.model} as {look}: {n} frames in {secs:.1f} s ({secs / max(n, 1):.2f} s a frame), "
          f"height {height:.2f} m, walk cycle {walk['period']:g} frames from {walk['start']:g}, "
          f"standing at {walk['standing']:g} -> {out_root}")
    if clipped:
        print(f"warning: {len(clipped)} frames touch the cell edge, e.g. {clipped[0]}")
    return manifest


def main() -> None:
    render_figure(_args(sys.argv))


if __name__ == "__main__":
    main()
