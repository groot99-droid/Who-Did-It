"""Build render_rig.blend from nothing (docs/ASSETS.md 6.2) so the rig is reproducible.

    blender -b --factory-startup -P tools/blender/build_rig.py -- --out tools/blender/build/render_rig.blend

`batch_render.py` imports `build()` and builds the rig in memory when no `--rig` file is given, so
the committed scripts, not a binary, are the source of truth.
"""

from __future__ import annotations

import argparse
import math
import os
import sys

import bpy
from mathutils import Euler, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rig_common as rc  # noqa: E402

TOON_GROUP = "WDI_Toon"
OUTLINE_MATERIAL = "OutlineInk"


# ---------------------------------------------------------------- scene and render settings


def reset_scene() -> bpy.types.Scene:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = "Rig"
    return scene


def apply_render_settings(scene: bpy.types.Scene) -> None:
    r = scene.render
    r.engine = "BLENDER_EEVEE"
    r.resolution_x = r.resolution_y = rc.CELL_PX
    r.resolution_percentage = 100
    r.film_transparent = True
    r.filter_size = 1.0
    r.dither_intensity = 0.0
    r.fps, r.fps_base = 24, 1.0
    r.image_settings.file_format = "PNG"
    r.image_settings.color_mode = "RGBA"
    r.image_settings.color_depth = "8"
    r.image_settings.compression = 100
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    scene.display_settings.display_device = "sRGB"
    e = scene.eevee
    e.use_raytracing = False
    e.use_shadows = False
    e.use_overscan = True
    e.overscan_size = 3.0
    e.taa_render_samples = 16


def make_world(scene: bpy.types.Scene) -> None:
    world = bpy.data.worlds.new("Slate")
    scene.world = world
    nodes = world.node_tree.nodes
    bg = next(n for n in nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = rc.hex_to_linear(rc.PALETTE["slate"])
    bg.inputs["Strength"].default_value = rc.WORLD_STRENGTH


# ---------------------------------------------------------------- materials


def _socket(sockets, identifier: str):
    return next(s for s in sockets if s.identifier == identifier)


def _mix_rgb(nodes, links, fac, a, b):
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MIX"
    links.new(fac, _socket(mix.inputs, "Factor_Float"))
    links.new(a, _socket(mix.inputs, "A_Color"))
    links.new(b, _socket(mix.inputs, "B_Color"))
    return _socket(mix.outputs, "Result_Color")


def _greater(nodes, links, value, threshold: float):
    m = nodes.new("ShaderNodeMath")
    m.operation = "GREATER_THAN"
    links.new(value, m.inputs[0])
    m.inputs[1].default_value = threshold
    return m.outputs[0]


def make_toon_group() -> bpy.types.ShaderNodeTree:
    """Diffuse -> Shader to RGB -> ColorRamp (Constant, rc.TOON_RAMP_STOPS) -> three palette bands -> Emission.

    Rim: Layer Weight (blend 0.35) facing, thresholded, mixed towards the Rim colour by Rim Amount.
    """
    ng = bpy.data.node_groups.new(TOON_GROUP, "ShaderNodeTree")
    iface = ng.interface
    for name, token in (("Light", "bone"), ("Mid", "fog"), ("Shadow", "slate"), ("Rim", "moon")):
        s = iface.new_socket(name=name, in_out="INPUT", socket_type="NodeSocketColor")
        s.default_value = rc.hex_to_linear(rc.PALETTE[token])
    amount = iface.new_socket(name="Rim Amount", in_out="INPUT", socket_type="NodeSocketFloat")
    amount.default_value, amount.min_value, amount.max_value = 0.0, 0.0, 1.0
    iface.new_socket(name="Shader", in_out="OUTPUT", socket_type="NodeSocketShader")

    nodes, links = ng.nodes, ng.links
    gin, gout = nodes.new("NodeGroupInput"), nodes.new("NodeGroupOutput")

    diffuse = nodes.new("ShaderNodeBsdfDiffuse")
    diffuse.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    to_rgb = nodes.new("ShaderNodeShaderToRGB")
    links.new(diffuse.outputs["BSDF"], to_rgb.inputs["Shader"])

    ramp = nodes.new("ShaderNodeValToRGB")
    cr = ramp.color_ramp
    cr.interpolation = "CONSTANT"
    cr.elements[0].position, cr.elements[0].color = 0.0, (0.0, 0.0, 0.0, 1.0)
    cr.elements[1].position, cr.elements[1].color = rc.TOON_RAMP_STOPS[0], (0.5, 0.5, 0.5, 1.0)
    top = cr.elements.new(rc.TOON_RAMP_STOPS[1])
    top.color = (1.0, 1.0, 1.0, 1.0)
    links.new(to_rgb.outputs["Color"], ramp.inputs["Fac"])

    band = ramp.outputs["Color"]
    lower = _mix_rgb(nodes, links, _greater(nodes, links, band, 0.25), gin.outputs["Shadow"], gin.outputs["Mid"])
    toon = _mix_rgb(nodes, links, _greater(nodes, links, band, 0.75), lower, gin.outputs["Light"])

    lw = nodes.new("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = rc.TOON_RIM_BLEND
    rim_mask = _greater(nodes, links, lw.outputs["Facing"], 0.5)
    rim_fac = nodes.new("ShaderNodeMath")
    rim_fac.operation = "MULTIPLY"
    links.new(rim_mask, rim_fac.inputs[0])
    links.new(gin.outputs["Rim Amount"], rim_fac.inputs[1])
    colour = _mix_rgb(nodes, links, rim_fac.outputs[0], toon, gin.outputs["Rim"])

    emit = nodes.new("ShaderNodeEmission")
    emit.inputs["Strength"].default_value = 1.0
    links.new(colour, emit.inputs["Color"])
    links.new(emit.outputs["Emission"], gout.inputs["Shader"])
    return ng


def _new_material(name: str) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.surface_render_method = "DITHERED"
    mat.node_tree.nodes.clear()
    return mat


def colour(value: str) -> tuple[float, float, float, float]:
    """Linear RGBA of a UI token (`fog`) or a world-palette hex (`#6F7A8C`)."""
    return rc.hex_to_linear(value if value.startswith("#") else rc.PALETTE[value])


def toon_material(name: str, light: str, mid: str, shadow: str, rim_amount: float = 0.0) -> bpy.types.Material:
    """A material using the toon group with three palette tokens or world-palette hex colours."""
    mat = _new_material(name)
    nodes = mat.node_tree.nodes
    group = nodes.new("ShaderNodeGroup")
    group.node_tree = bpy.data.node_groups[TOON_GROUP]
    for sock, value in (("Light", light), ("Mid", mid), ("Shadow", shadow)):
        group.inputs[sock].default_value = colour(value)
    group.inputs["Rim Amount"].default_value = rim_amount
    out = nodes.new("ShaderNodeOutputMaterial")
    mat.node_tree.links.new(group.outputs["Shader"], out.inputs["Surface"])
    return mat


def ramp_material(name: str, mid: str, ramp: str | None = None, rim_amount: float = 0.0) -> bpy.types.Material:
    """Toon material on a world colour, its light and shadow bands the ramp neighbours (S5.3)."""
    light, shadow = rc.ramp_shades(mid, ramp)
    return toon_material(name, light, mid, shadow, rim_amount)


def flat_material(name: str, token: str) -> bpy.types.Material:
    mat = _new_material(name)
    nodes = mat.node_tree.nodes
    emit = nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = colour(token)
    out = nodes.new("ShaderNodeOutputMaterial")
    mat.node_tree.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return mat


def make_outline_material() -> bpy.types.Material:
    mat = flat_material(OUTLINE_MATERIAL, "ink")
    mat.use_backface_culling = True
    return mat


def checker_material() -> bpy.types.Material:
    mat = _new_material("CalibChecker")
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    coords = nodes.new("ShaderNodeTexCoord")
    checker = nodes.new("ShaderNodeTexChecker")
    checker.inputs["Scale"].default_value = 2.0  # 0.5 m squares on object coords
    # The faces sit exactly on square boundaries; a 1 mm offset stops TAA flipping between colours.
    nudge = nodes.new("ShaderNodeVectorMath")
    nudge.operation = "ADD"
    nudge.inputs[1].default_value = (0.001, 0.001, 0.001)
    links.new(coords.outputs["Object"], nudge.inputs[0])
    links.new(nudge.outputs["Vector"], checker.inputs["Vector"])
    a, b = nodes.new("ShaderNodeGroup"), nodes.new("ShaderNodeGroup")
    for g, (light, mid) in ((a, ("bone", "fog")), (b, ("mustard", "lantern"))):
        g.node_tree = bpy.data.node_groups[TOON_GROUP]
        g.inputs["Light"].default_value = rc.hex_to_linear(rc.PALETTE[light])
        g.inputs["Mid"].default_value = rc.hex_to_linear(rc.PALETTE[mid])
    mix = nodes.new("ShaderNodeMixShader")
    links.new(checker.outputs["Fac"], mix.inputs[0])
    links.new(a.outputs["Shader"], mix.inputs[1])
    links.new(b.outputs["Shader"], mix.inputs[2])
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(mix.outputs["Shader"], out.inputs["Surface"])
    return mat


def grid_material(name: str = "CalibGrid", space: str = "Object") -> bpy.types.Material:
    """Fog floor with ink lines on every metre, for seam and scale checks.

    `space` "Generated" draws the lines on the object's own edges instead (the 1 m tile diamond).
    """
    mat = _new_material(name)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    coords = nodes.new("ShaderNodeTexCoord")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coords.outputs[space], sep.inputs["Vector"])
    interior = []
    for axis in ("X", "Y"):
        fract = nodes.new("ShaderNodeMath")
        fract.operation = "FRACT"
        links.new(sep.outputs[axis], fract.inputs[0])
        inside = nodes.new("ShaderNodeMath")
        inside.operation = "COMPARE"  # 1 when |fract - 0.5| <= 0.47, i.e. away from a line
        links.new(fract.outputs[0], inside.inputs[0])
        inside.inputs[1].default_value = 0.5
        inside.inputs[2].default_value = 0.47
        interior.append(inside.outputs[0])
    both = nodes.new("ShaderNodeMath")
    both.operation = "MULTIPLY"
    links.new(interior[0], both.inputs[0])
    links.new(interior[1], both.inputs[1])
    line = nodes.new("ShaderNodeEmission")
    line.inputs["Color"].default_value = rc.hex_to_linear(rc.PALETTE["ink"])
    fill = nodes.new("ShaderNodeGroup")
    fill.node_tree = bpy.data.node_groups[TOON_GROUP]
    fill.inputs["Light"].default_value = rc.hex_to_linear(rc.PALETTE["fog"])
    fill.inputs["Mid"].default_value = rc.hex_to_linear(rc.PALETTE["slate"])
    mix = nodes.new("ShaderNodeMixShader")
    links.new(both.outputs[0], mix.inputs[0])
    links.new(line.outputs["Emission"], mix.inputs[1])
    links.new(fill.outputs["Shader"], mix.inputs[2])
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(mix.outputs["Shader"], out.inputs["Surface"])
    return mat


def add_outline(obj: bpy.types.Object, preset: str = "character") -> bpy.types.Modifier:
    """Inverted hull: Solidify with negative thickness, flipped normals, OutlineInk material slot."""
    outline = bpy.data.materials[OUTLINE_MATERIAL]
    if outline.name not in obj.data.materials:
        obj.data.materials.append(outline)
    mod = obj.modifiers.get("Outline") or obj.modifiers.new("Outline", "SOLIDIFY")
    mod.thickness = rc.OUTLINE_PRESETS[preset]
    mod.offset = -1.0
    mod.use_flip_normals = True
    mod.use_rim = False
    mod.material_offset = list(obj.data.materials).index(outline)
    return mod


# ---------------------------------------------------------------- objects


def _collection(scene, name: str) -> bpy.types.Collection:
    col = bpy.data.collections.new(name)
    scene.collection.children.link(col)
    return col


def _link(col, obj):
    col.objects.link(obj)
    return obj


def make_cameras(col) -> tuple[bpy.types.Object, bpy.types.Object]:
    """IsoCam (X 60, Y 0, Z 45, display scale, SPRITES 10.3) and the straight-down TileCam for decals."""
    rot = Euler((math.radians(rc.CAMERA_TILT_DEG), 0.0, math.radians(rc.CAMERA_YAW_DEG)))
    up = Vector((0.0, 1.0, 0.0))
    up.rotate(rot)
    forward = Vector((0.0, 0.0, -1.0))
    forward.rotate(rot)
    # Put the world origin FEET_ROW_PX from the top of a CELL_PX cell (48 display px below the centre).
    drop_m = (rc.FEET_ROW_PX - rc.CELL_PX / 2) / rc.DISPLAY_PX_PER_M
    centre = up * drop_m

    cam_data = bpy.data.cameras.new("IsoCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = rc.ortho_scale(rc.CELL_PX)
    cam_data.clip_start, cam_data.clip_end = 0.1, 100.0
    cam = _link(col, bpy.data.objects.new("IsoCam", cam_data))
    cam.rotation_euler = rot
    cam.location = centre - forward * 30.0

    tile_data = bpy.data.cameras.new("TileCam")
    tile_data.type = "ORTHO"
    tile_data.ortho_scale = 1.0  # one 64 px tile per metre
    tile_data.clip_start, tile_data.clip_end = 0.1, 100.0
    tile = _link(col, bpy.data.objects.new("TileCam", tile_data))
    tile.rotation_euler = (0.0, 0.0, 0.0)
    tile.location = (0.5, 0.5, 30.0)  # metre lines fall on the tile edges
    return cam, tile


def _aim(obj, direction: tuple[float, float, float], distance: float) -> None:
    d = Vector(direction).normalized()
    obj.location = d * distance
    obj.rotation_euler = d.to_track_quat("Z", "Y").to_euler()  # light -Z points back at the origin


def make_lights(col, camera) -> None:
    key = bpy.data.lights.new("Key", "SUN")
    key.energy = rc.KEY_LIGHT["strength"]
    key.color = rc.hex_to_linear(rc.KEY_LIGHT["color"])[:3]
    key.use_shadow = False
    key.angle = 0.0  # a hard sun; a soft one dithers faces that sit on a ramp stop
    key_obj = _link(col, bpy.data.objects.new("Key", key))
    # Azimuths are in the camera's frame; parenting below keeps them there (rig_common.world_azimuth).
    _aim(key_obj, rc.light_direction(rc.world_azimuth(rc.KEY_LIGHT["azimuth"]), rc.KEY_LIGHT["elevation"]), 10.0)

    fill = bpy.data.lights.new("Fill", "AREA")
    fill.shape, fill.size = "SQUARE", rc.FILL_LIGHT["size"]
    distance = rc.FILL_LIGHT["distance"]  # far and large, so it is even across a sprite
    # "Strength 0.6" is read as the irradiance of a 0.6 sun; the watts are calibrated, see rig_common.
    fill.energy = rc.FILL_LIGHT["strength"] * rc.AREA_WATTS_PER_SUN_M2 * distance**2
    fill.use_custom_distance, fill.cutoff_distance = True, 1000.0  # never culled by light threshold
    fill.color = rc.hex_to_linear(rc.PALETTE[rc.FILL_LIGHT["color_token"]])[:3]
    fill.use_shadow = False
    fill_obj = _link(col, bpy.data.objects.new("Fill", fill))
    _aim(fill_obj, rc.light_direction(rc.world_azimuth(rc.FILL_LIGHT["azimuth"]), rc.FILL_LIGHT["elevation"]),
         distance)

    bpy.context.view_layer.update()
    for obj in (key_obj, fill_obj):
        obj.parent = camera
        obj.matrix_parent_inverse = camera.matrix_world.inverted()


def _adopt(col, name: str) -> bpy.types.Object:
    obj = bpy.context.active_object
    for c in obj.users_collection:
        c.objects.unlink(obj)
    col.objects.link(obj)
    obj.name = name
    return obj


def make_calibration(col, turntable, env_root) -> None:
    """The checker cube and its facing marker on the turntable (character root, 0.75 on every axis), a
    1 m tile under the environment root, a 4 m grid for TileCam, and a fallen 1.7 m proxy for `die`."""
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    cube = _adopt(col, "CheckerCube")
    cube.location = (0.0, 0.0, 0.5)
    cube.data.materials.append(checker_material())
    add_outline(cube, "character")
    cube.parent = turntable

    # Teal wedge on the top face pointing along the facing (+Y, world north at TT.z = 0: screen `ne`).
    bpy.ops.mesh.primitive_cone_add(radius1=0.15, depth=0.45, location=(0.0, 0.2, 1.08),
                                    rotation=(math.radians(-90.0), 0.0, 0.0))
    marker = _adopt(col, "FacingMarker")
    marker.data.materials.append(toon_material("CalibFacing", "teal", "teal", "slate"))
    add_outline(marker, "character")
    marker.parent = turntable
    # The marker's tail and tip, for the screen-up check of the `n` frame (calibration.json).
    for nm, y in (("MarkerTail", -0.025), ("MarkerTip", 0.425)):
        e = _link(col, bpy.data.objects.new(nm, None))
        e.location = (0.0, y, 1.08)
        e.parent = turntable

    bpy.ops.mesh.primitive_plane_add(size=4.0)
    plane = _adopt(col, "GridPlane")
    plane.data.materials.append(grid_material())

    bpy.ops.mesh.primitive_plane_add(size=1.0)
    tile = _adopt(col, "TilePlane")
    tile.data.materials.append(grid_material("CalibTile", "Generated"))
    tile.parent = env_root
    tile.hide_render = True

    # A 1.7 m body fallen flat along the facing, the worst case for the 256 px die cell. Smoke only.
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    fallen = _adopt(col, "FallenProxy")
    fallen.scale = (0.4, 1.7, 0.25)
    fallen.location = (0.0, 0.85, 0.125)
    fallen.data.materials.append(toon_material("CalibFallen", "bone", "fog", "slate"))
    add_outline(fallen, "character")
    fallen.parent = turntable
    fallen.hide_render = True

    feet = _link(col, bpy.data.objects.new("Feet", None))
    feet.empty_display_type = "PLAIN_AXES"
    feet.empty_display_size = 0.2
    feet.parent = turntable


def make_roots(col) -> tuple[bpy.types.Object, bpy.types.Object]:
    """The two root empties of SPRITES 10.3: environment (1, 1, 0.75) and character (0.75 on every axis)."""
    env = _link(col, bpy.data.objects.new("EnvRoot", None))
    env.scale = rc.ENV_ROOT_SCALE
    char = _link(col, bpy.data.objects.new("CharRoot", None))
    char.scale = rc.CHAR_ROOT_SCALE
    return env, char


def build(out_path: str | None = None) -> bpy.types.Scene:
    scene = reset_scene()
    apply_render_settings(scene)
    make_world(scene)
    make_toon_group()
    make_outline_material()

    rig = _collection(scene, "Rig")
    cam, _tile = make_cameras(rig)
    scene.camera = cam
    make_lights(rig, cam)
    env_root, char_root = make_roots(rig)
    turntable = _link(rig, bpy.data.objects.new("TT", None))
    turntable.empty_display_type = "CIRCLE"
    turntable.parent = char_root
    _collection(scene, "Character")
    make_calibration(_collection(scene, "Calibration"), turntable, env_root)

    bpy.context.view_layer.update()
    if out_path:
        os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(out_path), compress=True)
        print(f"build_rig: wrote {out_path}")
    return scene


def _args(argv: list[str]) -> argparse.Namespace:
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    p = argparse.ArgumentParser(prog="build_rig.py")
    p.add_argument("--out", default="tools/blender/build/render_rig.blend")
    return p.parse_args(argv)


if __name__ == "__main__":
    build(_args(sys.argv).out)
