"""A rough PBR + HDRI look for the HD style (docs/round8/art.md 5 as written; the owner's look sheet, A164).

Set `WDI_HD_PBR=1` with `--style hd --textured` and every render swaps the HD toon materials for a Principled
BSDF: a role material reads its 2k diffuse, roughness and normal maps untoned, a flat toon material becomes its
mid colour, and a Poly Haven sky HDRI fills the world (the A9 key light stays, as art.md 5 asks). The outline,
the shadow catcher and the unlit materials stay. Nothing here is a shipped path: it exists so the owner can see
the art.md 5 line beside the toon HD of A164 and choose. Needs bpy and the HDRI in the cache (`HDRI_URL`).
"""

from __future__ import annotations

import os
import re
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import batch_render  # noqa: E402
import build_rig  # noqa: E402
import rig_common as rc  # noqa: E402
from materials import nodes as mn  # noqa: E402
from materials import roles  # noqa: E402

HDRI = "kloofendal_48d_partly_cloudy_puresky_1k.hdr"
HDRI_URL = f"https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/{HDRI}"
HDRI_DIR = os.path.join(os.path.dirname(roles.CACHE_DIR), "hdri")
HDRI_STRENGTH = 0.6
BUMP_STRENGTH = 0.6
FLAT_ROUGHNESS = 0.65
_RT = re.compile(r"^RT_[a-z0-9]+_(?P<role>[a-z_]+)_(?P<tint>#[0-9A-Fa-f]{6}|plain)$")
_MATS: dict[str, bpy.types.Material] = {}


def apply(scene: bpy.types.Scene) -> None:
    """The HDRI world now, the material swap before every render."""
    path = os.path.join(HDRI_DIR, HDRI)
    if not os.path.exists(path):
        raise FileNotFoundError(f"{path}: fetch {HDRI_URL} into {HDRI_DIR}")
    world = scene.world
    nodes, links = world.node_tree.nodes, world.node_tree.links
    bg = next(n for n in nodes if n.type == "BACKGROUND")
    env = nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(path, check_existing=True)
    links.new(env.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = HDRI_STRENGTH
    batch_render.BEFORE_RENDER.append(lambda s: convert(s.objects))


def convert(objects) -> int:
    """Swap every toon material slot of `objects` for its PBR stand-in; returns the slots changed."""
    changed = 0
    for obj in objects:
        if obj.type != "MESH":
            continue
        for slot in obj.material_slots:
            mat = slot.material
            if mat is None or mat.name.startswith("PBR_"):
                continue
            new = replacement(mat)
            if new is not None:
                slot.material = new
                changed += 1
    return changed


def replacement(mat: bpy.types.Material) -> bpy.types.Material | None:
    if mat.name == build_rig.OUTLINE_MATERIAL or mat.node_tree is None:
        return None
    m = _RT.match(mat.name)
    if m:
        tint = None if m.group("tint") == "plain" else m.group("tint").upper()
        return role_material(m.group("role"), tint)
    group = next((n for n in mat.node_tree.nodes if n.type == "GROUP" and n.node_tree is not None
                  and n.node_tree.name == build_rig.TOON_GROUP), None)
    if group is None or group.inputs["Mid"].is_linked:
        return None
    r, g, b, _ = group.inputs["Mid"].default_value
    return flat_material((r, g, b))


def _principled(name: str):
    mat = build_rig._new_material(name)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat, nodes, links, bsdf


def flat_material(linear_rgb: tuple[float, float, float]) -> bpy.types.Material:
    key = "PBR_flat_" + "_".join(f"{c:.3f}" for c in linear_rgb)
    if key in _MATS:
        return _MATS[key]
    mat, _, _, bsdf = _principled(key)
    bsdf.inputs["Base Color"].default_value = (*linear_rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = FLAT_ROUGHNESS
    _MATS[key] = mat
    return mat


def role_material(role_name: str, tint: str | None) -> bpy.types.Material:
    """Principled BSDF on the role's 2k maps: diffuse (tinted toward the flat colour it replaced, as retexture
    does), roughness, and a bump from the normal map's luma (box projection has no tangent frame)."""
    key = f"PBR_{role_name}_{tint or 'plain'}"
    if key in _MATS:
        return _MATS[key]
    r = roles.role(role_name)
    mat, nodes, links, bsdf = _principled(key)
    diff_img = mn.image(role_name, "diff", "hd")
    diff = mn._box_sample(nodes, links, diff_img, r.metres)
    colour = diff.outputs["Color"]
    if tint:
        colour = mn._tint(nodes, links, colour, tint, diff_img, True)
    links.new(colour, bsdf.inputs["Base Color"])
    rough = mn._box_sample(nodes, links, mn.image(role_name, "rough", "hd"), r.metres, "Linear")
    links.new(rough.outputs["Color"], bsdf.inputs["Roughness"])
    nor = mn._box_sample(nodes, links, mn.image(role_name, "nor_gl", "hd"), r.metres, "Linear")
    bw = nodes.new("ShaderNodeRGBToBW")
    links.new(nor.outputs["Color"], bw.inputs["Color"])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = BUMP_STRENGTH
    bump.inputs["Distance"].default_value = rc.HD["bumpDistance"]
    links.new(bw.outputs["Val"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    _MATS[key] = mat
    return mat
