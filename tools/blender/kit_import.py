"""Import CC0 kit meshes into the world scenes (docs/round5/art-plan.md 3.1).

    from kit_import import kenney, import_part
    barrel = import_part(kenney("survival-kit", "barrel"), tag="kenney:survival-kit/barrel")

`import_part` reads a GLB, glTF, FBX or OBJ file, joins its meshes into one object at the world origin,
tags it (`obj["wdi_part"]`, so a render's provenance stays traceable to the CREDITS row of its pack) and
re-materials every slot through `WDI_Toon` in the world palette (palette.json `world`):

- a flat base colour becomes a toon whose mid band is its nearest world colour in OKLab and whose light and
  shadow bands are the neighbouring steps of that colour's ramp;
- an image base colour (Kenney's colour-map atlases, Poly Haven maps) goes in through the toon colour
  inputs, scaled for the three bands, with the image's own UVs.

The pixel finish snaps every rendered pixel to the same palette, so low-poly Kenney pieces and textured
Poly Haven pieces end in one look. Downloads stay in git-ignored `assets/external/kits/` (env/kits.py).
"""

from __future__ import annotations

import json
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_rig  # noqa: E402
import rig_common as rc  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
KITS = os.path.join(ROOT, "assets", "external", "kits")
PALETTE_JSON = os.path.join(ROOT, "packages", "content", "data", "palette.json")
TEX_GAINS = (1.15, 0.85, 0.55)  # light, mid, shadow on an image colour (as static_common.tex_toon)


# ---------------------------------------------------------------- the world palette (OKLab)


def _oklab(rgb):
    lin = [rc.srgb_to_linear(c / 255) for c in rgb]
    l_ = 0.4122214708 * lin[0] + 0.5363325363 * lin[1] + 0.0514459929 * lin[2]
    m_ = 0.2119034982 * lin[0] + 0.6806995451 * lin[1] + 0.1073969566 * lin[2]
    s_ = 0.0883024619 * lin[0] + 0.2817188376 * lin[1] + 0.6299787005 * lin[2]
    l_, m_, s_ = (math.copysign(abs(v) ** (1 / 3), v) for v in (l_, m_, s_))
    return (0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
            1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
            0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_)


def world_ramps() -> dict[str, list[str]]:
    with open(PALETTE_JSON) as fh:
        return {k: [h.upper() for h in v] for k, v in json.load(fh)["world"]["ramps"].items()}


_RAMPS = world_ramps()
_COLOURS = list(dict.fromkeys(h for ramp in _RAMPS.values() for h in ramp))
_LAB = {h: _oklab(rc.hex_to_rgb(h)) for h in _COLOURS}


def nearest_world(rgb) -> str:
    """The world colour nearest an sRGB 0-255 colour in OKLab (ties to the darker)."""
    p = _oklab(rgb)
    return min(_COLOURS, key=lambda h: (sum((a - b) ** 2 for a, b in zip(p, _LAB[h])), _LAB[h][0]))


def ramp_bands(hx: str) -> tuple[str, str, str]:
    """(light, mid, shadow): the colour and its neighbours in the first ramp holding it."""
    ramp = next(r for r in _RAMPS.values() if hx in r)
    i = ramp.index(hx)
    return ramp[min(i + 1, len(ramp) - 1)], hx, ramp[max(i - 1, 0)]


# ---------------------------------------------------------------- materials


def _base_colour_source(mat):
    """(image node, None) or (None, linear RGBA) for a material's base colour."""
    if not mat.use_nodes:
        return None, tuple(mat.diffuse_color)
    bsdf = next((n for n in mat.node_tree.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled"), None)
    if bsdf is None:
        return None, tuple(mat.diffuse_color)
    sock = bsdf.inputs["Base Color"]
    node = sock.links[0].from_node if sock.is_linked else None
    while node is not None and node.bl_idname != "ShaderNodeTexImage":
        ins = [i for i in node.inputs if i.is_linked]
        node = ins[0].links[0].from_node if ins else None
    if node is not None:
        return node, None
    return None, tuple(sock.default_value)


def base_name(name: str) -> str:
    """An imported material's name without Blender's `.001` suffix."""
    head, _, tail = name.rpartition(".")
    return head if head and tail.isdigit() else name


def retoon(mat: bpy.types.Material, override: str | None = None, ramp: list[str] | None = None) -> bpy.types.Material:
    """A world-palette toon copy of an imported material.

    `override` forces the mid colour (its ramp gives light and shadow). `ramp` (world hex, dark to light)
    recolours an image material by luminance: Kenney's colour-map atlases are bright and saturated, and
    a ramp keeps their shading while moving them into the world's colours.
    """
    image_node, colour = _base_colour_source(mat)
    name = f"WT_{mat.name}" + (f"_{override}" if override else "") + ("_" + "".join(ramp) if ramp else "")
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    out = build_rig._new_material(name)
    nodes, links = out.node_tree.nodes, out.node_tree.links
    group = nodes.new("ShaderNodeGroup")
    group.node_tree = bpy.data.node_groups[build_rig.TOON_GROUP]
    if image_node is not None and override is None:
        uv = nodes.new("ShaderNodeUVMap")
        tex = nodes.new("ShaderNodeTexImage")
        tex.image, tex.interpolation = image_node.image, "Closest"
        links.new(uv.outputs["UV"], tex.inputs["Vector"])
        colour_out = tex.outputs["Color"]
        if ramp:
            bw = nodes.new("ShaderNodeRGBToBW")
            links.new(colour_out, bw.inputs["Color"])
            cr = nodes.new("ShaderNodeValToRGB")
            elems = cr.color_ramp.elements
            for i, hx in enumerate(ramp):
                e = elems[i] if i < len(elems) else elems.new(0.0)
                e.position = i / max(1, len(ramp) - 1)
                e.color = rc.hex_to_linear(hx)
            links.new(bw.outputs["Val"], cr.inputs["Fac"])
            colour_out = cr.outputs["Color"]
        for sock, gain in zip(("Light", "Mid", "Shadow"), TEX_GAINS):
            g = nodes.new("ShaderNodeVectorMath")
            g.operation = "SCALE"
            g.inputs["Scale"].default_value = gain
            links.new(colour_out, g.inputs[0])
            links.new(g.outputs["Vector"], group.inputs[sock])
    else:
        hx = override or nearest_world(tuple(round(rc.linear_to_srgb(c) * 255) for c in colour[:3]))
        for sock, band in zip(("Light", "Mid", "Shadow"), ramp_bands(hx)):
            group.inputs[sock].default_value = rc.hex_to_linear(band)
    o = nodes.new("ShaderNodeOutputMaterial")
    links.new(group.outputs["Shader"], o.inputs["Surface"])
    return out


# ---------------------------------------------------------------- import


def kenney(pack: str, model: str) -> str:
    """Path of a Kenney model (GLB preferred) in the fetched pack."""
    base = os.path.join(KITS, f"kenney_{pack}", "Models")
    for sub, ext in (("GLB format", ".glb"), ("GLTF format", ".glb"), ("GLTF format", ".gltf"),
                     ("OBJ format", ".obj"), ("FBX format", ".fbx")):
        path = os.path.join(base, sub, model + ext)
        if os.path.exists(path):
            return path
    raise FileNotFoundError(f"kit_import: no {model} in {base} (run tools/blender/env/kits.py)")


def _import(path: str) -> list[bpy.types.Object]:
    before = set(bpy.data.objects)
    ext = os.path.splitext(path)[1].lower()
    if ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=path)
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path)
    elif ext == ".obj":
        bpy.ops.wm.obj_import(filepath=path)
    else:
        raise ValueError(f"kit_import: unsupported {path}")
    return [o for o in bpy.data.objects if o not in before]


def import_part(path: str, tag: str | None = None, colours: dict[str, str] | None = None,
                outline: bool = True, name: str | None = None, ramp: list[str] | None = None) -> bpy.types.Object:
    """One joined, re-materialed object from a kit file, its transforms applied, at the world origin.

    `colours` maps an imported material's base name (`leafsGreen`, no `.001`) to the world colour that
    replaces it; `ramp` recolours its image materials (`retoon`).
    """
    new = _import(path)
    meshes = [o for o in new if o.type == "MESH"]
    if not meshes:
        raise ValueError(f"kit_import: {path} has no mesh")
    for o in new:
        if o.type != "MESH":
            for child in o.children:
                child.matrix_parent_inverse = o.matrix_world.inverted() @ child.matrix_parent_inverse
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
        o.parent = None
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in new:
        if o is not obj and o.name in bpy.data.objects:
            bpy.data.objects.remove(o, do_unlink=True)
    for slot in obj.material_slots:
        if slot.material is not None:
            slot.material = retoon(slot.material, (colours or {}).get(base_name(slot.material.name)), ramp)
    obj.name = name or os.path.splitext(os.path.basename(path))[0]
    obj["wdi_part"] = tag or os.path.relpath(path, KITS)
    if obj.users_collection and bpy.context.scene.collection not in obj.users_collection:
        for c in list(obj.users_collection):
            c.objects.unlink(obj)
        bpy.context.scene.collection.objects.link(obj)
    if outline:
        build_rig.add_outline(obj, "character")
    return obj


def place(obj: bpy.types.Object, location=(0.0, 0.0, 0.0), rotation_z: float = 0.0, scale: float = 1.0,
          parent: bpy.types.Object | None = None) -> bpy.types.Object:
    obj.location = location
    obj.rotation_euler = (0.0, 0.0, rotation_z)
    obj.scale = (scale, scale, scale)
    if parent is not None:
        obj.parent = parent
    return obj
