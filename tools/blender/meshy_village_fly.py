"""The fly-through of the 3D HollowMere scene: camera path, clearance check, storyboard, frames and the video.

    B="blender -b --factory-startup -P tools/blender/meshy_village_fly.py --"
    $B --blend build/hollowmere_base.blend --look meshy_looks/x.json --check                    # path length, time, clearance
    $B --blend build/hollowmere_base.blend --look meshy_looks/x.json --storyboard 16 --out build/fly   # every Nth of the path, small
    $B --blend build/hollowmere_base.blend --look meshy_looks/x.json --frames --res 1920 --samples 16 --out build/fly
    $B --encode build/hollowmere_flythrough.mp4 --out build/fly                                 # joins build/fly/f_####.jpg

The path is a list of waypoints in the map's tile frame (x east, y south, like `overworld.json`), heights in metres
above the village ground. The camera's position and its look-at point each follow a Catmull-Rom spline through
the waypoints; `speed` (m/s) at each waypoint sets the pace, so time comes out of distance. `--frames` keeps frames
that already exist, so a stopped render resumes where it left off.
"""

from __future__ import annotations

import argparse
import bisect
import json
import math
import os
import sys
import time

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import meshy_village_look as lk  # noqa: E402

FPS = 30   # 30 divides a 60 Hz screen evenly (24 does not), so a moving camera plays back smoothly

# eye (tile x, tile y, height m), look-at (tile x, tile y, height m), speed m/s, lens mm
PATH = [
    dict(eye=(74.0, 70.0, 42.0), look=(44.0, 28.0, 0.0), speed=20.0, lens=26.0),   # high over the mere, south-east
    dict(eye=(69.0, 55.0, 20.0), look=(56.0, 32.0, 1.0), speed=18.0, lens=26.0),
    dict(eye=(64.6, 46.0, 6.5), look=(62.5, 33.0, 2.6), speed=12.0, lens=26.0),    # down to the water by the rail end
    dict(eye=(62.5, 41.6, 2.7), look=(61.8, 31.0, 1.9), speed=5.0, lens=24.0),     # the Daily Train, head on, with its stop
    dict(eye=(60.0, 38.6, 2.1), look=(57.0, 33.0, 2.2), speed=5.5, lens=24.0),     # turn west along the quay
    dict(eye=(53.4, 39.2, 1.9), look=(45.5, 36.6, 2.1), speed=6.0, lens=24.0),     # the fisher's cottage, three-quarter
    dict(eye=(46.2, 38.8, 1.9), look=(37.0, 37.6, 2.0), speed=5.8, lens=24.0),
    dict(eye=(42.0, 40.2, 1.3), look=(34.0, 39.2, 1.6), speed=5.5, lens=24.0),     # down the bank to the water
    dict(eye=(40.2, 44.0, 0.0), look=(33.4, 38.5, 1.7), speed=5.0, lens=24.0),     # out over the mere: the drowned lantern
    dict(eye=(38.3, 44.6, -0.2), look=(32.7, 39.2, 1.6), speed=4.6, lens=24.0),    # and The Drowned Lantern's front
    dict(eye=(36.9, 41.5, 0.3), look=(33.6, 33.8, 3.6), speed=5.0, lens=24.0),     # its sign
    dict(eye=(37.3, 38.4, 1.2), look=(36.4, 30.0, 2.8), speed=5.2, lens=24.0),     # up the grass ramp
    dict(eye=(37.7, 35.4, 1.9), look=(37.4, 27.0, 2.4), speed=5.2, lens=24.0),     # the alley mouth
    dict(eye=(37.6, 32.0, 1.9), look=(38.0, 23.5, 2.5), speed=5.2, lens=24.0),     # between the tavern and the net loft
    dict(eye=(37.3, 29.3, 1.9), look=(33.5, 21.0, 2.3), speed=5.0, lens=24.0),
    dict(eye=(36.4, 26.5, 1.9), look=(29.0, 20.5, 2.2), speed=4.8, lens=24.0),     # into the square
    dict(eye=(33.4, 24.9, 1.85), look=(28.5, 20.5, 2.2), speed=4.9, lens=24.0),    # the bell
    dict(eye=(29.6, 25.4, 1.85), look=(21.0, 23.0, 2.4), speed=4.6, lens=24.0),    # past it: manor and widow's cottage ahead
    dict(eye=(25.2, 24.8, 1.9), look=(16.0, 26.0, 2.6), speed=4.5, lens=24.0),
    dict(eye=(21.2, 25.8, 3.0), look=(13.2, 31.6, 4.0), speed=3.8, lens=24.0),     # the chapel yard: graves, shrine, chapel
    dict(eye=(18.2, 23.6, 4.4), look=(8.8, 21.8, 3.2), speed=3.8, lens=24.0),      # the widow's cottage, dark
    dict(eye=(15.5, 22.0, 11.0), look=(9.5, 10.0, 6.5), speed=5.0, lens=24.0),     # Vane Manor in mourning, whole
    dict(eye=(5.0, 20.0, 17.0), look=(13.5, 11.0, 5.5), speed=7.5, lens=24.0),     # up and round its west side
    dict(eye=(-5.0, 9.0, 28.0), look=(28.0, 20.0, 2.0), speed=9.0, lens=22.0),
    dict(eye=(-12.0, -4.0, 31.0), look=(38.0, 27.0, 0.0), speed=6.5, lens=20.0),   # the town below, the mere beyond
    dict(eye=(-14.0, -8.0, 30.0), look=(70.0, 56.0, 12.0), speed=1.0, lens=18.0),  # ease up to the moon, the town held in frame
]


def _world(p) -> Vector:
    x, y = lk.tile_xy(p[0], p[1])
    return Vector((x, y, p[2]))


def _cr(p0, p1, p2, p3, u):
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3)


def sample_path(path=PATH, sub: int = 48):
    """Dense samples along the path: lists of time, eye, look-at, lens."""
    eyes, looks = [_world(w["eye"]) for w in path], [_world(w["look"]) for w in path]
    n = len(path)
    ts, es, ls, zs = [0.0], [eyes[0]], [looks[0]], [path[0]["lens"]]
    for i in range(n - 1):
        a, b, c, d = max(i - 1, 0), i, i + 1, min(i + 2, n - 1)
        for k in range(1, sub + 1):
            u = k / sub
            e = _cr(eyes[a], eyes[b], eyes[c], eyes[d], u)
            lo = _cr(looks[a], looks[b], looks[c], looks[d], u)
            s = u * u * (3 - 2 * u)
            v = path[b]["speed"] + (path[c]["speed"] - path[b]["speed"]) * s
            ts.append(ts[-1] + (e - es[-1]).length / max(v, 0.2))
            es.append(e)
            ls.append(lo)
            zs.append(path[b]["lens"] + (path[c]["lens"] - path[b]["lens"]) * s)
    return ts, es, ls, zs


def at_time(samples, t: float):
    ts, es, ls, zs = samples
    t = min(max(t, 0.0), ts[-1])
    i = min(max(bisect.bisect_right(ts, t) - 1, 0), len(ts) - 2)
    f = (t - ts[i]) / max(ts[i + 1] - ts[i], 1e-9)
    return es[i].lerp(es[i + 1], f), ls[i].lerp(ls[i + 1], f), zs[i] + (zs[i + 1] - zs[i]) * f


def build_camera(scene, hold: float = 1.5, path=None) -> int:
    """Key the fly camera on every frame; returns the frame count. `path` (added) replaces PATH."""
    samples = sample_path(path or PATH)  # added: the path is passed through (sample_path's default is bound to PATH)
    total = samples[0][-1]
    frames = int(math.ceil((total + hold) * FPS))
    cam = bpy.data.objects.get("HM_FlyCam")
    if cam is None:
        cam = bpy.data.objects.new("HM_FlyCam", bpy.data.cameras.new("HM_FlyCam"))
        scene.collection.objects.link(cam)
    cam.animation_data_clear()
    cam.data.animation_data_clear()
    cam.data.clip_start, cam.data.clip_end = 0.08, 900.0
    cam.rotation_mode = "QUATERNION"
    prev = None
    for f in range(1, frames + 1):
        e, lo, lens = at_time(samples, (f - 1) / FPS)
        q = (lo - e).to_track_quat("-Z", "Y")
        if prev is not None and prev.dot(q) < 0:
            q.negate()
        prev = q
        cam.location, cam.rotation_quaternion, cam.data.lens = e, q, lens
        cam.keyframe_insert("location", frame=f)
        cam.keyframe_insert("rotation_quaternion", frame=f)
        cam.data.keyframe_insert("lens", frame=f)
    scene.camera = cam
    scene.frame_start, scene.frame_end = 1, frames
    scene.render.fps = FPS
    lk.bind_snow_camera(scene)
    return frames


def check(scene, frames: int, clearance: float = 1.0) -> list[dict]:
    """Frames where the camera comes closer than `clearance` to anything solid, or passes through it."""
    hidden = []
    src = bpy.data.collections.get("HM_Sources")  # the hidden masters stand at the origin: not obstacles
    if src:
        src.hide_viewport = True
    for name in ("HM_Fog", "HM_Snowfall"):
        ob = bpy.data.objects.get(name)
        if ob and not ob.hide_viewport:
            ob.hide_viewport = True
            hidden.append(ob)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    cam = scene.camera
    dirs = [Vector((math.cos(a), math.sin(a), z)).normalized() for a in (i * math.tau / 12 for i in range(12)) for z in (0.0, 0.45)]
    dirs.append(Vector((0, 0, 1)))
    out, last = [], None
    for f in range(1, frames + 1):
        scene.frame_set(f)
        p = cam.matrix_world.translation.copy()
        worst, what = 1e9, ""
        for d in dirs:
            hit, loc, _n, _i, ob, _m = scene.ray_cast(dg, p, d, distance=clearance)
            if hit and (loc - p).length < worst:
                worst, what = (loc - p).length, ob.name
        hit, loc, _n, _i, ob, _m = scene.ray_cast(dg, p, Vector((0, 0, -1)), distance=0.9)
        if hit and (loc - p).length < worst:
            worst, what = (loc - p).length, ob.name
        through = ""
        if last is not None and (p - last).length > 1e-6:
            hit, loc, _n, _i, ob, _m = scene.ray_cast(dg, last, (p - last).normalized(), distance=(p - last).length)
            if hit:
                through = ob.name
        if worst < clearance or through:
            mw, mh = lk.map_size()  # added: the open scene's map size (was the village's 64 x 48)
            out.append(dict(frame=f, time=round((f - 1) / FPS, 2), near=round(worst, 2) if worst < 1e8 else None, object=what, through=through,
                            tile=(round(p.x / lk.TILE_M + mw / 2, 1), round(mh / 2 - p.y / lk.TILE_M, 1), round(p.z, 1))))
        last = p
    for ob in hidden:
        ob.hide_viewport = False
    return out


def set_output(scene, res: int) -> None:
    r = scene.render
    r.resolution_x, r.resolution_y, r.resolution_percentage = res, int(res * 9 / 16), 100
    r.image_settings.media_type = "IMAGE"
    r.image_settings.file_format = "JPEG"
    r.image_settings.quality = 95


def encode(frames_dir: str, out: str, fps: int = FPS) -> None:
    """Join f_####.jpg into an H.264 MP4 with Blender's sequencer (no external ffmpeg needed)."""
    files = sorted(f for f in os.listdir(frames_dir) if f.startswith("f_") and f.endswith(".jpg"))
    if not files:
        raise SystemExit(f"no frames in {frames_dir}")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    img = bpy.data.images.load(os.path.join(frames_dir, files[0]))
    w, h = img.size
    se = scene.sequence_editor_create()
    strips = se.strips if hasattr(se, "strips") else se.sequences  # renamed in Blender 4.4
    strip = strips.new_image("frames", os.path.join(frames_dir, files[0]), 1, 1)
    for f in files[1:]:
        strip.elements.append(f)
    r = scene.render
    r.resolution_x, r.resolution_y, r.resolution_percentage = w, h, 100
    r.fps = fps
    scene.frame_start, scene.frame_end = 1, len(files)
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    r.use_sequencer = True
    r.image_settings.media_type = "VIDEO"
    r.image_settings.file_format = "FFMPEG"
    r.ffmpeg.format = "MPEG4"
    r.ffmpeg.codec = "H264"
    r.ffmpeg.constant_rate_factor = "HIGH"
    r.ffmpeg.ffmpeg_preset = "GOOD"
    r.ffmpeg.gopsize = fps
    r.ffmpeg.audio_codec = "NONE"
    r.filepath = os.path.abspath(out)
    bpy.ops.render.render(animation=True)
    print("ENCODED", out, len(files), "frames", f"{w}x{h}", flush=True)


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="meshy_village_fly.py")
    p.add_argument("--blend")
    p.add_argument("--look")
    p.add_argument("--path", help="added: a JSON list of waypoints like PATH ({eye, look, speed, lens}, tile units of the "
                                  "open scene) that replaces PATH")
    p.add_argument("--out", default="tools/blender/build/fly")
    p.add_argument("--check", action="store_true")
    p.add_argument("--storyboard", type=int, default=0)
    p.add_argument("--frames", action="store_true")
    p.add_argument("--start", type=int)
    p.add_argument("--end", type=int)
    p.add_argument("--res", type=int, default=1920)
    p.add_argument("--samples", type=int)
    p.add_argument("--encode")
    p.add_argument("--step", type=int, default=1, help="render every Nth frame (a quick animatic)")
    p.add_argument("--fps", type=int, help="frame rate of the encoded file (default FPS; use FPS / step for an animatic)")
    a = p.parse_args(argv)
    out = os.path.abspath(a.out)
    if a.encode:
        encode(out, a.encode, a.fps or FPS)
        return
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(a.blend))
    scene = bpy.context.scene
    look = json.load(open(a.look)) if a.look else {}
    if a.samples:
        look.setdefault("render", {})["samples"] = a.samples
    lk.apply_look(scene, look)
    path = None
    if a.path:  # added: another scene's camera path
        with open(a.path, encoding="utf-8") as fh:
            path = json.load(fh)
    frames = build_camera(scene, path=path)
    print(f"PATH frames {frames} seconds {frames / FPS:.1f}", flush=True)
    os.makedirs(out, exist_ok=True)
    if a.check or a.storyboard:
        issues = check(scene, frames)
        with open(os.path.join(out, "clearance.json"), "w") as fh:
            json.dump(issues, fh, indent=1)
        print(f"CLEARANCE {len(issues)} frames flagged", flush=True)
        for i in issues[:60]:
            print("  FLAG", i, flush=True)
    if a.storyboard:
        set_output(scene, min(a.res, 640))
        step = max(1, frames // a.storyboard)
        for f in range(1, frames + 1, step):
            scene.frame_set(f)
            scene.render.filepath = os.path.join(out, f"story_{f:04d}.jpg")
            t0 = time.time()
            bpy.ops.render.render(write_still=True)
            print(f"STORY {f} {time.time() - t0:.1f}s", flush=True)
    if a.frames:
        set_output(scene, a.res)
        first, last = a.start or 1, min(a.end or frames, frames)
        r = scene.render
        r.filepath = os.path.join(out, "f_")       # -> f_0001.jpg ...
        r.use_file_extension = True
        r.use_overwrite = False                     # keep frames that exist: a stopped render resumes
        r.use_placeholder = False
        scene.frame_start, scene.frame_end = first, last
        scene.frame_step = a.step
        t0, done = time.time(), [0]

        def _post(*_args):
            done[0] += 1
            if done[0] % 10 == 0:
                print(f"FRAME {scene.frame_current}/{last} avg {(time.time() - t0) / done[0]:.2f}s", flush=True)

        bpy.app.handlers.render_post.append(_post)
        bpy.ops.render.render(animation=True)       # one render session: the scene stays on the GPU between frames
        bpy.app.handlers.render_post.remove(_post)
        scene.frame_start, scene.frame_end, scene.frame_step = 1, frames, 1
        print(f"FRAMES_DONE {first} {last} rendered {done[0]} in {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
