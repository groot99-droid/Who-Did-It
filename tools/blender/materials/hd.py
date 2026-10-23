"""The HD finish on the rig (docs/round8/art.md 3, rig_common.HD): applied once after build_rig.build().

Resolution is the caller's (static_common, batch_render render at rig_common.STYLE_FACTOR times the display
scale). This module changes what a frame looks like, never its framing: EEVEE's soft shadows and fast-GI ambient
occlusion through the toon ramp (`Shader to RGB` sees them), the `WDI_Toon` ramp interpolating between its three
tones instead of stepping, a rim in the lamp colour on every toon material, and a shadow catcher under the subject
for soft contact shadows. Needs bpy.
"""

from __future__ import annotations

import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import build_rig  # noqa: E402
import rig_common as rc  # noqa: E402

CATCHER = rc.CATCHER_NAME


def apply(scene: bpy.types.Scene, rim_hex: str | None = None) -> None:
    """The whole HD finish; `rim_hex` keys the rim to another lamp colour than `lantern`."""
    r, e = scene.render, scene.eevee
    r.filter_size = rc.HD["filterSize"]
    e.taa_render_samples = rc.HD["taaSamples"]
    e.use_shadows = True
    e.shadow_ray_count = rc.HD["shadowRays"]
    e.shadow_step_count = rc.HD["shadowSteps"]
    e.use_raytracing = True
    e.ray_tracing_method = "SCREEN"
    e.use_fast_gi = True
    e.fast_gi_method = "AMBIENT_OCCLUSION_ONLY"
    e.fast_gi_distance = rc.HD["aoDistance"]
    e.fast_gi_quality = 0.5
    key = bpy.data.lights["Key"]
    key.use_shadow = True
    key.use_shadow_jitter = True
    key.angle = math.radians(rc.HD["keyAngleDeg"])
    # The inverted-hull outline wraps every model: both its faces are backfaces to a shadow ray, so culling
    # them keeps the hull from shadowing the model it outlines.
    bpy.data.materials[build_rig.OUTLINE_MATERIAL].use_backface_culling_shadow = True
    smooth_toon_group(rim_hex or rc.PALETTE[rc.HD["rimToken"]], rc.HD["rimAmount"])
    add_catcher(scene)


def smooth_toon_group(rim_hex: str, rim_amount: float) -> None:
    """`WDI_Toon` with soft band edges, a `Normal` input, and the rim fixed to the lamp colour.

    Every material of the rig shares the group, so this reaches the ones built later too. The three band colours
    stay the material's own: the ramp keeps its plateaus and only the `bandSoft` wide transitions between them
    blend, so a shadow or the ambient occlusion shows as a soft edge where it crosses a stop and not as a gradient
    across a face. The `Normal` input (hidden value, so an unlinked one is the shading normal) lets a textured
    material feed a bump into the band test; `nodes.role_material` links it for HD.
    """
    ng = bpy.data.node_groups[build_rig.TOON_GROUP]
    nodes, links = ng.nodes, ng.links
    ramp = next(n for n in nodes if n.type == "VALTORGB")
    cr, w = ramp.color_ramp, rc.HD["bandSoft"]
    cr.interpolation = "LINEAR"
    lo, hi = rc.TOON_RAMP_STOPS
    cr.elements[1].position, cr.elements[2].position = lo + w, hi + w
    cr.elements.new(lo - w).color = (0.0, 0.0, 0.0, 1.0)
    cr.elements.new(hi - w).color = (0.5, 0.5, 0.5, 1.0)
    for m in [n for n in nodes if n.type == "MATH" and n.operation == "GREATER_THAN"]:
        t = m.inputs[1].default_value
        mr = nodes.new("ShaderNodeMapRange")
        mr.clamp = True
        mr.inputs["From Min"].default_value, mr.inputs["From Max"].default_value = t - 0.25, t + 0.25
        links.new(m.inputs[0].links[0].from_socket, mr.inputs["Value"])
        for link in list(m.outputs[0].links):
            links.new(mr.outputs["Result"], link.to_socket)
        nodes.remove(m)
    gin = next(n for n in nodes if n.type == "GROUP_INPUT")
    for socket_name, value in (("Rim Amount", rim_amount), ("Rim", rc.hex_to_linear(rim_hex))):
        for link in list(gin.outputs[socket_name].links):
            to = link.to_socket
            links.remove(link)
            to.default_value = value
    if "Normal" not in ng.interface.items_tree:
        normal = ng.interface.new_socket(name="Normal", in_out="INPUT", socket_type="NodeSocketVector")
        normal.hide_value = True
        for n in nodes:
            if n.type in ("BSDF_DIFFUSE", "LAYER_WEIGHT"):
                links.new(gin.outputs["Normal"], n.inputs["Normal"])


def catcher_material() -> bpy.types.Material:
    """Transparent where the ground is lit, ink where the key is shadowed, in proportion (rig_common.HD)."""
    mat = bpy.data.materials.get(CATCHER)
    if mat is not None:
        return mat
    mat = build_rig._new_material(CATCHER)
    mat.surface_render_method = "BLENDED"
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    diffuse = nodes.new("ShaderNodeBsdfDiffuse")
    diffuse.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    to_rgb = nodes.new("ShaderNodeShaderToRGB")
    links.new(diffuse.outputs["BSDF"], to_rgb.inputs["Shader"])
    bw = nodes.new("ShaderNodeRGBToBW")
    links.new(to_rgb.outputs["Color"], bw.inputs["Color"])
    shade = nodes.new("ShaderNodeMapRange")  # lit luma (less the haze margin) -> 0, fully shadowed -> catcherStrength
    shade.clamp = True
    shade.inputs["From Min"].default_value = rc.HD["catcherLit"] - rc.HD["catcherHaze"]
    shade.inputs["From Max"].default_value = 0.0
    shade.inputs["To Min"].default_value = 0.0
    shade.inputs["To Max"].default_value = rc.HD["catcherStrength"]
    links.new(bw.outputs["Val"], shade.inputs["Value"])
    clear = nodes.new("ShaderNodeBsdfTransparent")
    ink = nodes.new("ShaderNodeEmission")
    ink.inputs["Color"].default_value = rc.hex_to_linear(rc.PALETTE["ink"])
    mix = nodes.new("ShaderNodeMixShader")
    links.new(shade.outputs["Result"], mix.inputs["Fac"])
    links.new(clear.outputs["BSDF"], mix.inputs[1])
    links.new(ink.outputs["Emission"], mix.inputs[2])
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(mix.outputs["Shader"], out.inputs["Surface"])
    return mat


def add_catcher(scene: bpy.types.Scene, size: float = 60.0) -> bpy.types.Object:
    """A plane just under the ground plane, catching the key's shadow and nothing else."""
    obj = bpy.data.objects.get(CATCHER)
    if obj is not None:
        return obj
    mesh = bpy.data.meshes.new(CATCHER)
    h = size / 2
    mesh.from_pydata([(-h, -h, 0), (h, -h, 0), (h, h, 0), (-h, h, 0)], [], [(0, 1, 2, 3)])
    mesh.materials.append(catcher_material())
    obj = bpy.data.objects.new(CATCHER, mesh)
    obj.location = (0.0, 0.0, -0.002)
    obj.visible_shadow = False
    bpy.data.collections["Rig"].objects.link(obj)
    return obj
