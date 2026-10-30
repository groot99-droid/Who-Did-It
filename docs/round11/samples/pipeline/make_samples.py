"""Round 11, 11A: the pipeline sample sheets (docs/round11/pipeline.md, "Sample sheets").

Not a build tool: a design sample. It drives the repo's own rig and builders (tools/blender) to render
HollowMere's tavern with the Baker standing at its door, under four light set-ups and through the candidate
passes, and writes the PNG sheets next to this file. Run from the repository root:

    EGL_PLATFORM=surfaceless python docs/round11/samples/pipeline/make_samples.py -- --look build/looks/baker.blend \
        --work build/r11-samples --out docs/round11/samples/pipeline

(`python tools/blender/build_looks.py -- --look baker --out build/looks` makes the look first.) Needs the bpy
5.2 wheel and Pillow. Every render is at the display scale (8-bit and low poly's), raw: no pixel finish.
"""

from __future__ import annotations

import argparse
import math
import os
import sys
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "blender"))
argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
sys.argv = sys.argv[:1]  # static_common reads --style / --textured from argv at import

import bpy  # noqa: E402

import batch_render  # noqa: E402
import build_buildings as bb  # noqa: E402
import build_rig  # noqa: E402
import palettize  # noqa: E402
import rig_common as rc  # noqa: E402
import static_common as sc  # noqa: E402
from env.kitbash import T  # noqa: E402

TIMES: dict[str, float] = {}


def args():
    p = argparse.ArgumentParser(prog="make_samples.py")
    p.add_argument("--look", required=True)
    p.add_argument("--work", required=True)
    p.add_argument("--out", required=True)
    return p.parse_args(argv)


def build_scene(look: str):
    scene = sc.setup()
    rec = bb.RECIPES["hollowmere"]["tavern"]
    x0, y0, w, h = bb.footprint_of(rec)
    doors = [(dx - x0, dy - y0, f) for dx, dy, f in rec["doors"]]
    objs, rise = bb.shell(rec, w, h, doors)
    objs += bb.details(rec["details"], w, h, rise)
    root = sc.env_root("Root_tavern")
    for o in objs:
        if o.parent is None:
            o.parent = root
    # A ground for the shadows to land on: one moss toon plane, 4 m round the footprint.
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=(w / 2, -h / 2, 0.0))
    ground = bpy.context.active_object
    ground.name = "SampleGround"
    ground.scale = (w + 8, h + 8, 1)
    ground.data.materials.append(T("moss", 1))
    # The Baker at the south door, facing the camera (atlas `s`), idle frame 0.
    turntable = bpy.data.objects["TT"]
    col = batch_render.import_character(look, turntable)
    palettize.palettize_objects(col.all_objects)
    for o in col.all_objects:
        if o.type == "MESH" and o.get("wdi_part") == "body":
            build_rig.add_outline(o, "character")
        elif o.type == "MESH":
            o.hide_render = True  # the overlay parts are their own passes
    door_x = doors[0][0] + 0.5 if doors else w / 2
    bpy.data.objects["CharRoot"].location = (door_x + 1.2, -h - 1.4, 0.0)
    turntable.rotation_euler.z = rc.turntable_z(rc.DIRECTIONS.index("s"))
    arm = next(o for o in col.all_objects if o.type == "ARMATURE")
    arm.animation_data_create().action = bpy.data.actions["idle"]
    scene.frame_set(int(bpy.data.actions["idle"].frame_range[0]))
    cw, ch = (w + h) * 64 + 192, (w + h) * 32 + bb.TOP + 96
    pivot = (cw / 2, bb.TOP + (w + h) * 16 + 16)
    sc.iso_frame(scene, cw, ch, pivot, target=(w / 2, -h / 2, 0.0))
    return scene


def render(scene, path: str, label: str) -> str:
    t = time.time()
    batch_render.render_to(scene, path)
    TIMES[label] = time.time() - t
    print(f"sample: {label} {TIMES[label]:.1f} s -> {path}")
    return path


# ---------------------------------------------------------------- light set-ups (pipeline.md 3)


def lights_today(scene):
    e = scene.eevee
    e.use_shadows = False
    e.use_raytracing = False
    e.use_fast_gi = False
    bpy.data.lights["Key"].use_shadow = False


def lights_ao(scene):
    lights_today(scene)
    e = scene.eevee
    e.use_raytracing = True
    e.ray_tracing_method = "SCREEN"
    e.use_fast_gi = True
    e.fast_gi_method = "AMBIENT_OCCLUSION_ONLY"
    e.fast_gi_distance = rc.HD["aoDistance"]
    e.fast_gi_quality = 0.5


def lights_shadow(scene):
    lights_ao(scene)
    e = scene.eevee
    e.use_shadows = True
    e.shadow_ray_count = rc.HD["shadowRays"]
    e.shadow_step_count = rc.HD["shadowSteps"]
    key = bpy.data.lights["Key"]
    key.use_shadow = True
    key.use_shadow_jitter = True
    key.angle = math.radians(rc.HD["keyAngleDeg"])
    bpy.data.materials[build_rig.OUTLINE_MATERIAL].use_backface_culling_shadow = True


# ---------------------------------------------------------------- material-override passes (pipeline.md 4)


def _emission_material(name: str, build) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    emit = nodes.new("ShaderNodeEmission")
    links.new(build(nodes, links), emit.inputs["Color"])
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return mat


def normal_material():
    def build(nodes, links):
        geo = nodes.new("ShaderNodeNewGeometry")
        vt = nodes.new("ShaderNodeVectorTransform")
        vt.vector_type, vt.convert_from, vt.convert_to = "NORMAL", "WORLD", "CAMERA"
        links.new(geo.outputs["Normal"], vt.inputs["Vector"])
        # Camera space to the usual tangent-style colours: x right, y up, z towards the viewer (Blender's camera
        # looks down -z, so z is flipped).
        mul = nodes.new("ShaderNodeVectorMath")
        mul.operation = "MULTIPLY_ADD"
        mul.inputs[1].default_value = (0.5, 0.5, -0.5)
        mul.inputs[2].default_value = (0.5, 0.5, 0.5)
        links.new(vt.outputs["Vector"], mul.inputs[0])
        return mul.outputs["Vector"]

    return _emission_material("PassNormal", build)


def depth_material(near: float, far: float):
    def build(nodes, links):
        cam = nodes.new("ShaderNodeCameraData")
        mr = nodes.new("ShaderNodeMapRange")
        mr.clamp = True
        # Near is white, far is black.
        mr.inputs["From Min"].default_value, mr.inputs["From Max"].default_value = near, far
        mr.inputs["To Min"].default_value, mr.inputs["To Max"].default_value = 1.0, 0.0
        links.new(cam.outputs["View Z Depth"], mr.inputs["Value"])
        return mr.outputs["Result"]

    return _emission_material("PassDepth", build)


def ao_material():
    def build(nodes, links):
        ao = nodes.new("ShaderNodeAmbientOcclusion")
        ao.inputs["Distance"].default_value = rc.HD["aoDistance"]
        ao.inputs["Color"].default_value = (1, 1, 1, 1)
        return ao.outputs["Color"]

    return _emission_material("PassAO", build)


def shadow_material():
    def build(nodes, links):
        d = nodes.new("ShaderNodeBsdfDiffuse")
        d.inputs["Color"].default_value = (1, 1, 1, 1)
        rgb = nodes.new("ShaderNodeShaderToRGB")
        links.new(d.outputs["BSDF"], rgb.inputs["Shader"])
        return rgb.outputs["Color"]

    return _emission_material("PassShadow", build)


def emit_material():
    return _emission_material("PassEmit", lambda nodes, links: _const(nodes, (1, 1, 1, 1)))


def black_material():
    return _emission_material("PassBlack", lambda nodes, links: _const(nodes, (0, 0, 0, 1)))


def _const(nodes, rgba):
    rgb = nodes.new("ShaderNodeRGB")
    rgb.outputs[0].default_value = rgba
    return rgb.outputs[0]


def override_pass(scene, path: str, label: str, mat_for) -> str:
    """Every mesh takes mat_for(obj); outlines off; raw view, no filter, so values are data."""
    saved, mods = {}, []
    for o in scene.objects:
        if o.type != "MESH" or o.hide_render:
            continue
        saved[o.name] = [s.material for s in o.material_slots]
        m = mat_for(o)
        for s in o.material_slots:
            s.material = m
        for mod in o.modifiers:
            if mod.name == "Outline" and mod.show_render:
                mod.show_render = False
                mods.append(mod)
    vt = scene.view_settings.view_transform
    scene.view_settings.view_transform = "Raw"
    render(scene, path, label)
    scene.view_settings.view_transform = vt
    for o in scene.objects:
        if o.name in saved:
            for s, m in zip(o.material_slots, saved[o.name]):
                s.material = m
    for mod in mods:
        mod.show_render = True
    return path


# ---------------------------------------------------------------- sheets


def sheet(cells, out_path: str, title: str, cols: int, bg=(44, 50, 64)):
    """Label each image and lay them out on the slate background; PNG-8 so a sheet stays small."""
    from PIL import Image, ImageDraw

    ims = [(lab, Image.open(p).convert("RGBA")) for lab, p in cells]
    w = max(i.width for _, i in ims)
    h = max(i.height for _, i in ims)
    pad, head = 12, 26
    rows = (len(ims) + cols - 1) // cols
    out = Image.new("RGBA", (cols * (w + pad) + pad, rows * (h + head + pad) + pad + head), bg + (255,))
    d = ImageDraw.Draw(out)
    d.text((pad, 6), title, fill=(217, 210, 194, 255))
    for k, (lab, im) in enumerate(ims):
        x = pad + (k % cols) * (w + pad)
        y = head + pad + (k // cols) * (h + head + pad)
        d.text((x, y), lab, fill=(242, 179, 61, 255))
        out.alpha_composite(im, (x, y + head - 6))
    out.convert("RGB").quantize(colors=256, method=Image.Quantize.MEDIANCUT).save(out_path, optimize=True)
    print(f"sheet: {out_path} {os.path.getsize(out_path) // 1024} KB")


def night(day_path: str, emit_path: str, out_path: str) -> str:
    """The client's night by hand: ink at the night ambient's 0.9 over the day render, and the emit mask cut back
    out of it (what pipeline.md 4's `emit` pass lets the darkness layer do)."""
    from PIL import Image

    day = Image.open(day_path).convert("RGBA")
    mask = Image.open(emit_path).convert("RGBA")
    ink = Image.new("RGBA", day.size, (18, 20, 28, 230))
    dark = Image.alpha_composite(day, Image.composite(ink, Image.new("RGBA", day.size, (0, 0, 0, 0)), day.getchannel("A")))
    lit = Image.composite(day, dark, mask.convert("L").point(lambda v: 255 if v > 127 else 0))
    lit.save(out_path)
    return out_path


def shadow_layer(scene, W, shadow_baked: str, out_dir: str) -> None:
    """pipeline.md 3.3: the key's cast shadow as its own ground-layer sprite. Three renders, then the client's draw
    order by hand: the ground, the shadow layer on it, the unshadowed statics and figure over both."""
    from PIL import Image

    from materials import hd

    ground = bpy.data.objects["SampleGround"]
    meshes = [o for o in scene.objects if o.type == "MESH" and not o.hide_render and o is not ground]
    lights_today(scene)
    for o in meshes:
        o.hide_render = True
    g = render(scene, W("layer_ground.png"), "layer ground")
    for o in meshes:
        o.hide_render = False
    ground.hide_render = True
    b = render(scene, W("layer_statics.png"), "layer statics")
    lights_shadow(scene)
    catcher = hd.add_catcher(scene)
    for o in meshes:
        o.visible_camera = False
    s = render(scene, W("layer_shadow.png"), "layer shadow")
    for o in meshes:
        o.visible_camera = True
    catcher.hide_render = True
    ground.hide_render = False
    lights_today(scene)
    under = Image.alpha_composite(Image.open(g).convert("RGBA"), Image.open(s).convert("RGBA"))
    under.save(W("layer_under.png"))
    Image.alpha_composite(under, Image.open(b).convert("RGBA")).save(W("layer_comp.png"))
    sheet([("ground + shadow layer (ink, alpha)", W("layer_under.png")),
           ("+ the unshadowed statics and figure", W("layer_comp.png")),
           ("C, the shadow baked into the frame", shadow_baked)],
          os.path.join(out_dir, "shadow-layer.png"), "11A the key's cast shadow as a separate ground-layer sprite", 3)


def main() -> None:
    a = args()
    os.makedirs(a.work, exist_ok=True)
    os.makedirs(a.out, exist_ok=True)
    scene = build_scene(a.look)
    W = lambda n: os.path.join(a.work, n)  # noqa: E731

    lights_today(scene)
    today = render(scene, W("light_today.png"), "today")
    lights_ao(scene)
    ao = render(scene, W("light_ao.png"), "ao")
    lights_shadow(scene)
    shadow = render(scene, W("light_shadow.png"), "ao+shadow")
    lights_today(scene)

    emit = override_pass(
        scene, W("pass_emit.png"), "emit",
        lambda o: emit_material() if o.name.startswith(("WindowsLit", "SignLamp")) else black_material())
    nite = night(today, emit, W("light_night.png"))
    sheet([("A. today: key + fill, no shadows", today), ("B. + ambient occlusion", ao),
           ("C. + AO + key cast shadow", shadow), ("D. A at night, emit pass cut out", nite)],
          os.path.join(a.out, "lighting.png"), "11A lighting: HollowMere tavern and the Baker, display scale, raw",
          2)

    shadow_layer(scene, W, shadow, a.out)
    lights_shadow(scene)
    nm = normal_material()
    normal = override_pass(scene, W("pass_normal.png"), "normal", lambda o: nm)
    dm = depth_material(48.0, 72.0)
    depth = override_pass(scene, W("pass_depth.png"), "depth", lambda o: dm)
    am = ao_material()
    aop = override_pass(scene, W("pass_ao.png"), "ao pass", lambda o: am)
    sm = shadow_material()
    shad = override_pass(scene, W("pass_shadow.png"), "shadow pass", lambda o: sm)
    lights_today(scene)
    sheet([("beauty (A)", today), ("emit (lamps, windows)", emit), ("normal (camera space)", normal),
           ("depth (camera z)", depth), ("ambient occlusion", aop), ("key light and shadow", shad)],
          os.path.join(a.out, "passes.png"), "11A candidate passes, as material overrides through the same camera",
          3)
    with open(os.path.join(a.work, "times.txt"), "w") as fh:
        for k, v in TIMES.items():
            fh.write(f"{k}\t{v:.1f}\n")
    print(TIMES)


if __name__ == "__main__":
    main()
