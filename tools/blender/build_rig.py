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
from mathutils import Vector

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
    r.filter_size = 1.5
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


def toon_material(name: str, light: str, mid: str, shadow: str, rim_amount: float = 0.0) -> bpy.types.Material:
    """A material using the toon group with three palette tokens."""
    mat = _new_material(name)
    nodes = mat.node_tree.nodes
    group = nodes.new("ShaderNodeGroup")
    group.node_tree = bpy.data.node_groups[TOON_GROUP]
    for sock, token in (("Light", light), ("Mid", mid), ("Shadow", shadow)):
        group.inputs[sock].default_value = rc.hex_to_linear(rc.PALETTE[token])
    group.inputs["Rim Amount"].default_value = rim_amount
    out = nodes.new("ShaderNodeOutputMaterial")
    mat.node_tree.links.new(group.outputs["Shader"], out.inputs["Surface"])
    return mat


def flat_material(name: str, token: str) -> bpy.types.Material:
    mat = _new_material(name)
    nodes = mat.node_tree.nodes
    emit = nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = rc.hex_to_linear(rc.PALETTE[token])
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


def grid_material() -> bpy.types.Material:
    """Fog floor with ink lines on every metre, for seam and scale checks."""
    mat = _new_material("CalibGrid")
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    coords = nodes.new("ShaderNodeTexCoord")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coords.outputs["Object"], sep.inputs["Vector"])
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
    tilt = math.radians(rc.CAMERA_TILT_DEG)
    up = Vector((0.0, math.cos(tilt), math.sin(tilt)))
    forward = Vector((0.0, math.sin(tilt), -math.cos(tilt)))
    # Put the world origin FEET_ROW_PX from the top of the cell.
    drop_m = (rc.FEET_ROW_PX - rc.CELL_PX / 2) / rc.TILE_PX
    centre = up * drop_m

    cam_data = bpy.data.cameras.new("SpriteCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = rc.CAMERA_ORTHO_SCALE
    cam_data.clip_start, cam_data.clip_end = 0.1, 100.0
    cam = _link(col, bpy.data.objects.new("SpriteCam", cam_data))
    cam.rotation_euler = (tilt, 0.0, 0.0)
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
    _aim(key_obj, rc.light_direction(rc.KEY_LIGHT["azimuth"], rc.KEY_LIGHT["elevation"]), 10.0)

    fill = bpy.data.lights.new("Fill", "AREA")
    fill.shape, fill.size = "SQUARE", rc.FILL_LIGHT["size"]
    distance = rc.FILL_LIGHT["distance"]  # far and large, so it is even across a sprite
    # "Strength 0.6" is read as the irradiance of a 0.6 sun; the watts are calibrated, see rig_common.
    fill.energy = rc.FILL_LIGHT["strength"] * rc.AREA_WATTS_PER_SUN_M2 * distance**2
    fill.use_custom_distance, fill.cutoff_distance = True, 1000.0  # never culled by light threshold
    fill.color = rc.hex_to_linear(rc.PALETTE[rc.FILL_LIGHT["color_token"]])[:3]
    fill.use_shadow = False
    fill_obj = _link(col, bpy.data.objects.new("Fill", fill))
    _aim(fill_obj, rc.light_direction(rc.FILL_LIGHT["azimuth"], rc.FILL_LIGHT["elevation"]), distance)

    bpy.context.view_layer.update()
    for obj in (key_obj, fill_obj):
        obj.parent = camera
        obj.matrix_parent_inverse = camera.matrix_world.inverted()


def make_calibration(col, turntable) -> None:
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    cube = bpy.context.active_object
    for c in cube.users_collection:
        c.objects.unlink(cube)
    col.objects.link(cube)
    cube.name = "CheckerCube"
    cube.location = (0.0, 0.0, 0.5)
    cube.data.materials.append(checker_material())
    add_outline(cube, "character")
    cube.parent = turntable

    # Teal wedge on the top face pointing along the facing (+Y at direction n).
    bpy.ops.mesh.primitive_cone_add(radius1=0.15, depth=0.45, location=(0.0, 0.2, 1.08),
                                    rotation=(math.radians(-90.0), 0.0, 0.0))
    marker = bpy.context.active_object
    for c in marker.users_collection:
        c.objects.unlink(marker)
    col.objects.link(marker)
    marker.name = "FacingMarker"
    marker.data.materials.append(toon_material("CalibFacing", "teal", "teal", "slate"))
    add_outline(marker, "character")
    marker.parent = turntable

    bpy.ops.mesh.primitive_plane_add(size=4.0)
    plane = bpy.context.active_object
    for c in plane.users_collection:
        c.objects.unlink(plane)
    col.objects.link(plane)
    plane.name = "GridPlane"
    plane.location = (0.0, 0.0, 0.0)
    plane.data.materials.append(grid_material())

    # A 1.7 m body fallen flat towards the camera, the worst case for the 256 px die cell. Smoke only.
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    fallen = bpy.context.active_object
    for c in fallen.users_collection:
        c.objects.unlink(fallen)
    col.objects.link(fallen)
    fallen.name = "FallenProxy"
    fallen.scale = (0.4, 1.7, 0.25)
    fallen.location = (0.0, -0.85, 0.125)
    fallen.data.materials.append(toon_material("CalibFallen", "bone", "fog", "slate"))
    add_outline(fallen, "character")
    fallen.parent = turntable
    fallen.hide_render = True

    feet = _link(col, bpy.data.objects.new("Feet", None))
    feet.empty_display_type = "PLAIN_AXES"
    feet.empty_display_size = 0.2
    feet.parent = turntable


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
    turntable = _link(rig, bpy.data.objects.new("TT", None))
    turntable.empty_display_type = "CIRCLE"
    _collection(scene, "Character")
    make_calibration(_collection(scene, "Calibration"), turntable)

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
