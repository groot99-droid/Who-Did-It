"""Shared helpers for the static sheets (props, clues, VFX) rendered through the rig.

Not a character pass: each item is built from code, rendered one frame at a time and deleted. The
output is `<out>/<atlas>/<file>.png` plus `<out>/<atlas>/manifest.json`, which `tools/sprites/
pack-static.ts` packs (docs/SPRITES.md 8):

    {"version": 1, "atlas": "props",
     "frames": {"prop_bell": {"file": "prop_bell.png", "cell": 192, "pivot": [96.0, 148.0]}}}

`pivot` is in cell pixels from the top-left corner of the untrimmed cell (absent = centred).
"""

from __future__ import annotations

import json
import math
import os
import sys

import bpy
import bmesh  # after bpy: the bpy wheel registers bmesh on import

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_rig  # noqa: E402
import rig_common as rc  # noqa: E402
import batch_render  # noqa: E402
from batch_render import feet_px, render_to, touches_border  # noqa: E402
from build_villager import box, frustum, ring  # noqa: E402,F401  (re-exported shape helpers)

# The art-style switch (docs/round8/art.md 3): `--style hd` renders every frame at STYLE_FACTOR times the
# display scale with the HD finish, `--textured` swaps flat materials for the library's roles. Both are taken
# out of sys.argv here, at import, so each script's own parser sees only its flags.
STYLE, TEXTURED = rc.style_from_argv(sys.argv)
FACTOR = rc.STYLE_FACTOR[STYLE]
if TEXTURED:
    from materials import retexture  # noqa: E402

    # Every world render (ground, kit, props, buildings) swaps its flat materials for the library's roles
    # just before each frame, once the script has built the objects of that frame.
    batch_render.BEFORE_RENDER.append(lambda scene: retexture.retexture(scene.objects, STYLE))


def args_out(argv: list[str], prog: str) -> str:
    import argparse

    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    p = argparse.ArgumentParser(prog=prog)
    p.add_argument("--out", required=True, help="render root, e.g. build/render")
    return p.parse_args(argv).out


def setup() -> bpy.types.Scene:
    """The rig with the calibration objects hidden."""
    scene = build_rig.build()
    for obj in bpy.data.collections["Calibration"].objects:
        obj.hide_render = True
    bpy.data.objects["TT"].rotation_euler.z = 0.0
    if STYLE == "hd":
        from materials import hd

        hd.apply(scene)
        if os.environ.get("WDI_HD_PBR"):  # the rough PBR + HDRI look of the owner's look sheet
            from materials import pbr

            pbr.apply(scene)
    return scene


def sprite_cam(scene, cell: int, feet_row: float) -> None:
    """Tilted camera at 64 px per metre, the world origin on `feet_row` in a `cell` px square."""
    cam = bpy.data.objects["SpriteCam"]
    scene.camera = cam
    cam.data.ortho_scale = cell / rc.TILE_PX
    cam.data.shift_x = 0.0
    cam.data.shift_y = rc.camera_shift_y(feet_row, cell)
    scene.render.resolution_x = scene.render.resolution_y = cell * FACTOR


def tile_cam(scene, cell: int, metres: float | None = None) -> None:
    """Straight-down camera centred on the origin; 64 px per metre unless `metres` spans the cell."""
    cam = bpy.data.objects["TileCam"]
    scene.camera = cam
    cam.location = (0.0, 0.0, 30.0)
    cam.data.ortho_scale = metres if metres is not None else cell / rc.TILE_PX
    scene.render.resolution_x = scene.render.resolution_y = cell * FACTOR


# ---------------------------------------------------------------- materials

_MATS: dict[str, bpy.types.Material] = {}


def toon(token: str) -> bpy.types.Material:
    """Toon material whose mid band is `token`, light and shadow from rig_common.SHADES."""
    name = f"Static_toon_{token}"
    if name not in _MATS:
        light, shadow = rc.SHADES[token]
        _MATS[name] = build_rig.toon_material(name, light, token, shadow)
    return _MATS[name]


def flat(token: str) -> bpy.types.Material:
    """Unlit palette colour (decals, glass, blood)."""
    name = f"Static_flat_{token}"
    if name not in _MATS:
        _MATS[name] = build_rig.flat_material(name, token)
    return _MATS[name]


# ---------------------------------------------------------------- shapes


def cylinder(bm, center, radius, depth, segments=8, radius_top=None, rotation=0.0):
    """Low-poly prism (or frustum) along Z, base at center z."""
    cx, cy, cz = center
    rt = radius if radius_top is None else radius_top
    lo, hi = [], []
    for i in range(segments):
        a = rotation + 2 * math.pi * (i + 0.5) / segments
        c, s = math.cos(a), math.sin(a)
        lo.append(bm.verts.new((cx + radius * c, cy + radius * s, cz)))
        hi.append(bm.verts.new((cx + rt * c, cy + rt * s, cz + depth)))
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    for i in range(segments):
        j = (i + 1) % segments
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))


def slab(bm, points, z0=0.0, z1=0.01):
    """Extrude a 2D polygon (counter-clockwise points) between z0 and z1."""
    lo = [bm.verts.new((x, y, z0)) for x, y in points]
    hi = [bm.verts.new((x, y, z1)) for x, y in points]
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    n = len(points)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))


def blob(cx, cy, rx, ry, lobes, n=20, rotation=0.0):
    """Points of an irregular closed outline: an ellipse modulated by (amplitude, frequency, phase)."""
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        r = 1.0 + sum(amp * math.sin(freq * a + ph) for amp, freq, ph in lobes)
        x, y = rx * r * math.cos(a), ry * r * math.sin(a)
        c, s = math.cos(rotation), math.sin(rotation)
        pts.append((cx + x * c - y * s, cy + x * s + y * c))
    return pts


def stroke(cx, cy, length, width, angle, taper=0.3):
    """A tapered blade shape (claw gouge, fibre), centred, pointing along `angle` radians."""
    hl, hw = length / 2, width / 2
    local = [(-hl, 0.0), (-hl * 0.6, -hw), (hl * 0.6, -hw * taper), (hl, 0.0),
             (hl * 0.6, hw * taper), (-hl * 0.6, hw)]
    c, s = math.cos(angle), math.sin(angle)
    return [(cx + x * c - y * s, cy + x * s + y * c) for x, y in local]


def mesh(name: str, mat: bpy.types.Material, shapes, outline: bool = True, bevel: float = 0.0):
    """One object from shape callbacks [(fn, kwargs)] with one material, in the scene collection."""
    bm = bmesh.new()
    for fn, kw in shapes:
        fn(bm, **kw)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    data = bpy.data.meshes.new(name)
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new("Chamfer", "BEVEL")
        mod.width, mod.segments, mod.limit_method = bevel, 1, "ANGLE"
    if outline:
        build_rig.add_outline(obj, "character")
    return obj


def clear(objs) -> None:
    for obj in objs:
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if data is not None and data.users == 0:
            bpy.data.meshes.remove(data)


# ---------------------------------------------------------------- output


class Sheet:
    """Collects rendered frames of one atlas and writes its manifest."""

    def __init__(self, out_root: str, atlas: str):
        self.dir = os.path.join(out_root, atlas)
        os.makedirs(self.dir, exist_ok=True)
        self.atlas = atlas
        self.frames: dict[str, dict] = {}

    def render(self, scene, name: str, pivot: bool = True) -> None:
        """Render the current scene as frame `name`; `pivot` records the projected origin."""
        file = name.replace("/", "_") + ".png"
        path = os.path.join(self.dir, file)
        bpy.context.view_layer.update()
        render_to(scene, path)
        cell = scene.render.resolution_x
        entry: dict = {"file": file, "cell": cell}
        if pivot:
            origin = bpy.data.objects["Feet"]  # the rig's Feet empty sits at the world origin
            entry["pivot"] = feet_px(scene, origin, cell)
        if touches_border(path):
            entry["clipped"] = True
            print(f"warning: {self.atlas}/{name} touches the cell edge")
        self.frames[name] = entry

    def write(self) -> None:
        with open(os.path.join(self.dir, "manifest.json"), "w") as fh:
            # `cell` and `pivot` of a frame are in render px unless the script overrode them in display px;
            # `factor` (render px per display px) lets the packer tell (tools/sprites/hd.ts).
            json.dump({"version": 1, "atlas": self.atlas, "style": STYLE, "factor": FACTOR, "frames": self.frames},
                      fh, indent=2, sort_keys=True)
            fh.write("\n")
        print(f"{self.atlas}: {len(self.frames)} frames -> {self.dir}")


# ---------------------------------------------------------------- isometric (docs/SPRITES.md 10.3)

ISO_PX_PER_M = 90.51  # display scale: a 1 m tile is a 128 x 64 diamond
ISO_TILT_DEG, ISO_YAW_DEG = 60.0, 45.0
ISO_Z_SCALE = 0.75  # environment heights render at 0.75 (metrics.json iso.zScale)


def iso_vectors():
    """IsoCam's right, up and forward unit vectors in Blender space (X 60, Y 0, Z 45)."""
    from mathutils import Euler, Vector

    rot = Euler((math.radians(ISO_TILT_DEG), 0.0, math.radians(ISO_YAW_DEG))).to_matrix()
    return rot @ Vector((1, 0, 0)), rot @ Vector((0, 1, 0)), rot @ Vector((0, 0, -1))


def iso_setup(scene) -> bpy.types.Object:
    """IsoCam, and the rig's camera-parented lights turned 45 degrees with it.

    5L's L1 adds `IsoCam` to build_rig.py; until then (and if the rig has none) this builds the same camera
    here, so the world renders need no rig change. The lights keep their camera-relative azimuths
    (key from screen-left at 225 degrees, the moon fill): turning them with the camera keeps that.
    """
    from mathutils import Matrix

    cam = bpy.data.objects.get("IsoCam")
    if cam is None:
        data = bpy.data.cameras.new("IsoCam")
        data.type = "ORTHO"
        data.clip_start, data.clip_end = 0.1, 200.0
        cam = bpy.data.objects.new("IsoCam", data)
        bpy.context.scene.collection.objects.link(cam)
        cam.rotation_euler = (math.radians(ISO_TILT_DEG), 0.0, math.radians(ISO_YAW_DEG))
        turn = Matrix.Rotation(math.radians(ISO_YAW_DEG), 4, "Z")
        for name in ("Key", "Fill"):
            light = bpy.data.objects[name]
            world = light.matrix_world.copy()
            light.parent = None
            light.matrix_world = turn @ world
    scene.camera = cam
    return cam


def iso_frame(scene, w: int, h: int, origin_px: tuple[float, float], target=(0.0, 0.0, 0.0)) -> None:
    """Frame IsoCam on a w x h display-px image (rendered at FACTOR times that) with Blender point `target` at `origin_px`."""
    from mathutils import Vector

    cam = iso_setup(scene)
    right, up, forward = iso_vectors()
    ox, oy = origin_px
    centre = Vector(target) + right * ((w / 2 - ox) / ISO_PX_PER_M) + up * ((oy - h / 2) / ISO_PX_PER_M)
    cam.location = centre - forward * 60.0
    cam.data.ortho_scale = max(w, h) / ISO_PX_PER_M
    cam.data.shift_x = cam.data.shift_y = 0.0
    scene.render.resolution_x, scene.render.resolution_y = w * FACTOR, h * FACTOR


def iso_px(point, w: int, h: int, origin_px: tuple[float, float], target=(0.0, 0.0, 0.0)) -> tuple[float, float]:
    """Pixel of a Blender point in an `iso_frame`d image (the inverse of the framing above)."""
    from mathutils import Vector

    right, up, _ = iso_vectors()
    d = Vector(point) - Vector(target)
    return origin_px[0] + d.dot(right) * ISO_PX_PER_M, origin_px[1] - d.dot(up) * ISO_PX_PER_M


def env_root(name: str = "EnvRoot") -> bpy.types.Object:
    """An empty scaled (1, 1, 0.75): environment meshes parented to it render at 0.75 height."""
    root = bpy.data.objects.get(name)
    if root is None:
        root = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(root)
        root.scale = (1.0, 1.0, ISO_Z_SCALE)
    return root


def hex_toon(name: str, light: str, mid: str, shadow: str) -> bpy.types.Material:
    """Toon material from three world-palette hex colours (palette.json `world`)."""
    if name not in _MATS:
        mat = build_rig._new_material(name)
        nodes = mat.node_tree.nodes
        group = nodes.new("ShaderNodeGroup")
        group.node_tree = bpy.data.node_groups[build_rig.TOON_GROUP]
        for sock, hx in (("Light", light), ("Mid", mid), ("Shadow", shadow)):
            group.inputs[sock].default_value = rc.hex_to_linear(hx)
        out = nodes.new("ShaderNodeOutputMaterial")
        mat.node_tree.links.new(group.outputs["Shader"], out.inputs["Surface"])
        _MATS[name] = mat
    return _MATS[name]


def hex_flat(name: str, hx: str) -> bpy.types.Material:
    """Unlit world-palette colour."""
    if name not in _MATS:
        mat = build_rig._new_material(name)
        nodes = mat.node_tree.nodes
        emit = nodes.new("ShaderNodeEmission")
        emit.inputs["Color"].default_value = rc.hex_to_linear(hx)
        out = nodes.new("ShaderNodeOutputMaterial")
        mat.node_tree.links.new(emit.outputs["Emission"], out.inputs["Surface"])
        _MATS[name] = mat
    return _MATS[name]


def tex_toon(name: str, image_path: str, metres: float = 2.0, gains=(1.15, 0.85, 0.55), tint=None):
    """Textured toon: the image (box-projected, one repeat per `metres` of object space) through the toon bands.

    The three bands are the texture times `gains` (light, mid, shadow), so a lit face, a side face and a
    face turned away read as the toon's three tones of the same surface. `tint` (hex) multiplies it.
    Textures go in through the toon colour inputs (docs/round5/art-plan.md 3.1).
    """
    if name in _MATS:
        return _MATS[name]
    mat = build_rig._new_material(name)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    coords = nodes.new("ShaderNodeTexCoord")
    scale = nodes.new("ShaderNodeVectorMath")
    scale.operation = "SCALE"
    scale.inputs["Scale"].default_value = 1.0 / metres
    links.new(coords.outputs["Object"], scale.inputs[0])
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(os.path.abspath(image_path), check_existing=True)
    tex.interpolation = "Cubic"
    tex.projection, tex.projection_blend = "BOX", 0.1  # walls and tops alike, no stretched sides
    links.new(scale.outputs["Vector"], tex.inputs["Vector"])
    colour = tex.outputs["Color"]
    if tint:
        mul = nodes.new("ShaderNodeMix")
        mul.data_type, mul.blend_type = "RGBA", "MULTIPLY"
        build_rig._socket(mul.inputs, "Factor_Float").default_value = 1.0
        links.new(colour, build_rig._socket(mul.inputs, "A_Color"))
        build_rig._socket(mul.inputs, "B_Color").default_value = rc.hex_to_linear(tint)
        colour = build_rig._socket(mul.outputs, "Result_Color")
    group = nodes.new("ShaderNodeGroup")
    group.node_tree = bpy.data.node_groups[build_rig.TOON_GROUP]
    for sock, gain in zip(("Light", "Mid", "Shadow"), gains):
        g = nodes.new("ShaderNodeVectorMath")
        g.operation = "SCALE"
        g.inputs["Scale"].default_value = gain
        links.new(colour, g.inputs[0])
        links.new(g.outputs["Vector"], group.inputs[sock])
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(group.outputs["Shader"], out.inputs["Surface"])
    _MATS[name] = mat
    return mat
