"""Role materials for each art style (docs/round8/art.md 5); needs bpy.

    from materials import nodes as mn
    mat = mn.role_material("Kit_wall", "plaster", style="8bit")

8-bit and low poly: the role's 1k diffuse, box-projected at the role's texel density, pulled `STYLE_TONE` of the
way toward its world ramp's middle colour (low poly also posterised to `POSTERISE_LEVELS`), through the `WDI_Toon`
bands as `static_common.tex_toon` does, so the pixel finish turns the grain into dither and low poly never reads as a
photograph. HD: the 2k diffuse, normal and roughness maps untoned on a Principled BSDF; the HD rig finish (rim,
AO, shadows) is the renderer's, not the material's. The images come from the fetched cache; a missing file names
the fetch command.
"""

from __future__ import annotations

import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import build_rig  # noqa: E402
import rig_common as rc  # noqa: E402
from materials import roles  # noqa: E402

# The posterise rounds in display space (a plain 2.2 gamma stands in for the sRGB curve).
DISPLAY_GAMMA = 2.2

_MATS: dict[str, bpy.types.Material] = {}


def image(role_name: str, map_name: str, style: str, cache: str = roles.CACHE_DIR) -> bpy.types.Image:
    path = roles.texture_path(role_name, map_name, style=style, cache=cache)
    if not os.path.exists(path):
        raise FileNotFoundError(f"{path}: run `python3 tools/blender/materials/fetch.py --roles {role_name} --style {style}`")
    img = bpy.data.images.load(path, check_existing=True)
    if map_name != "diff":
        img.colorspace_settings.name = "Non-Color"
    return img


def _box_sample(nodes, links, img, metres: float, interpolation: str = "Cubic"):
    """An image box-projected in object space, one repeat per `metres`."""
    coords = nodes.new("ShaderNodeTexCoord")
    scale = nodes.new("ShaderNodeVectorMath")
    scale.operation = "SCALE"
    scale.inputs["Scale"].default_value = 1.0 / metres
    links.new(coords.outputs["Object"], scale.inputs[0])
    tex = nodes.new("ShaderNodeTexImage")
    tex.image, tex.interpolation = img, interpolation
    tex.projection, tex.projection_blend = "BOX", 0.1
    links.new(scale.outputs["Vector"], tex.inputs["Vector"])
    return tex


def _mix(nodes, links, a, b_value, factor: float):
    mix = nodes.new("ShaderNodeMix")
    mix.data_type, mix.blend_type = "RGBA", "MIX"
    build_rig._socket(mix.inputs, "Factor_Float").default_value = factor
    links.new(a, build_rig._socket(mix.inputs, "A_Color"))
    build_rig._socket(mix.inputs, "B_Color").default_value = b_value
    return build_rig._socket(mix.outputs, "Result_Color")


def _multiply(nodes, links, a, hex_colour: str):
    mul = nodes.new("ShaderNodeMix")
    mul.data_type, mul.blend_type = "RGBA", "MULTIPLY"
    build_rig._socket(mul.inputs, "Factor_Float").default_value = 1.0
    links.new(a, build_rig._socket(mul.inputs, "A_Color"))
    build_rig._socket(mul.inputs, "B_Color").default_value = rc.hex_to_linear(hex_colour)
    return build_rig._socket(mul.outputs, "Result_Color")


def _posterise(nodes, links, colour, levels: int):
    """Round each channel to `levels` steps (low poly's stylised flatness), in display space: snapped on the
    linear value, every tone below mid grey fell to the lowest step, and a dark wood door rendered black."""
    to_display = nodes.new("ShaderNodeGamma")
    to_display.inputs["Gamma"].default_value = 1.0 / DISPLAY_GAMMA
    links.new(colour, to_display.inputs["Color"])
    sep = nodes.new("ShaderNodeSeparateColor")
    links.new(to_display.outputs["Color"], sep.inputs["Color"])
    comb = nodes.new("ShaderNodeCombineColor")
    for ch in ("Red", "Green", "Blue"):
        half = nodes.new("ShaderNodeMath")
        half.operation = "ADD"
        half.inputs[1].default_value = 0.5 / levels
        links.new(sep.outputs[ch], half.inputs[0])
        snap = nodes.new("ShaderNodeMath")
        snap.operation = "SNAP"
        snap.inputs[1].default_value = 1.0 / levels
        links.new(half.outputs[0], snap.inputs[0])
        links.new(snap.outputs[0], comb.inputs[ch])
    to_linear = nodes.new("ShaderNodeGamma")
    to_linear.inputs["Gamma"].default_value = DISPLAY_GAMMA
    links.new(comb.outputs["Color"], to_linear.inputs["Color"])
    return to_linear.outputs["Color"]


def toned_colour(nodes, links, colour, role_name: str, style: str):
    """The role's tint, the style's pull toward the ramp's middle colour, and low poly's posterise."""
    r = roles.role(role_name)
    if r.tint:
        colour = _multiply(nodes, links, colour, r.tint)
    tone = roles.STYLE_TONE[style]
    if tone > 0:
        steps = rc.WORLD_RAMPS[r.ramp]
        colour = _mix(nodes, links, colour, rc.hex_to_linear(steps[len(steps) // 2]), tone)
    levels = roles.POSTERISE_LEVELS.get(style)
    if levels:
        colour = _posterise(nodes, links, colour, levels)
    return colour


def role_material(name: str, role_name: str, style: str = "8bit", gains=(1.15, 0.85, 0.55),
                  cache: str = roles.CACHE_DIR) -> bpy.types.Material:
    """The role's material for one style; cached by `name`."""
    if name in _MATS:
        return _MATS[name]
    if style not in roles.STYLE_RESOLUTION:
        raise ValueError(f"unknown style {style!r}")
    r = roles.role(role_name)
    mat = build_rig._new_material(name)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    out = nodes.new("ShaderNodeOutputMaterial")
    diff = _box_sample(nodes, links, image(role_name, "diff", style, cache), r.metres)
    if style == "hd":
        bsdf = nodes.new("ShaderNodeBsdfPrincipled")
        colour = diff.outputs["Color"]
        if r.tint:
            colour = _multiply(nodes, links, colour, r.tint)
        links.new(colour, bsdf.inputs["Base Color"])
        rough = _box_sample(nodes, links, image(role_name, "rough", style, cache), r.metres, "Linear")
        links.new(rough.outputs["Color"], bsdf.inputs["Roughness"])
        nor = _box_sample(nodes, links, image(role_name, "nor_gl", style, cache), r.metres, "Linear")
        nmap = nodes.new("ShaderNodeNormalMap")
        nmap.space = "OBJECT"  # box projection has no tangent frame; object space keeps the three faces consistent
        links.new(nor.outputs["Color"], nmap.inputs["Color"])
        links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
        links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    else:
        colour = toned_colour(nodes, links, diff.outputs["Color"], role_name, style)
        group = nodes.new("ShaderNodeGroup")
        group.node_tree = bpy.data.node_groups[build_rig.TOON_GROUP]
        for sock, gain in zip(("Light", "Mid", "Shadow"), gains):
            g = nodes.new("ShaderNodeVectorMath")
            g.operation = "SCALE"
            g.inputs["Scale"].default_value = gain
            links.new(colour, g.inputs[0])
            links.new(g.outputs["Vector"], group.inputs[sock])
        links.new(group.outputs["Shader"], out.inputs["Surface"])
    _MATS[name] = mat
    return mat
