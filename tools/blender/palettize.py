"""Snap every material on imported meshes to the palette (docs/ASSETS.md 6.1, 6.2).

    blender -b char.blend --factory-startup -P tools/blender/palettize.py -- --save

Rules, per material slot:
- toon material (uses the WDI_Toon group): each colour input snaps to its nearest palette token;
- Principled BSDF with a flat Base Color: replaced by a toon material whose Mid is the nearest token
  and whose Light and Shadow come from rig_common.SHADES;
- Principled BSDF with an image on Base Color: the image's pixels snap to the nearest token (alpha
  kept, image packed) and the material becomes a two-tone toon (lit = texture, shadow = slate);
- anything else fails, including "untextured PBR": a Principled BSDF whose look depends on metallic,
  roughness or normal maps with no base-colour source, which no single token can stand for.

Run inside the rig (batch_render imports `palettize_objects`) or on a character file before render.
"""

from __future__ import annotations

import argparse
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rig_common as rc  # noqa: E402

TOON_GROUP = "WDI_Toon"
SKIP = {"OutlineInk"}


class PaletteError(RuntimeError):
    pass


def _linear_to_token(colour) -> str:
    srgb = tuple(rc.linear_to_srgb(c) for c in colour[:3])
    return rc.nearest_palette(srgb)  # type: ignore[arg-type]


def _toon_group():
    group = bpy.data.node_groups.get(TOON_GROUP)
    if group is None:
        import build_rig

        group = build_rig.make_toon_group()
    return group


def _find(nodes, kind: str):
    return next((n for n in nodes if n.bl_idname == kind), None)


def _source_image(socket):
    """Image node feeding a socket directly or through one reroute / colour node, else None."""
    if not socket.is_linked:
        return None
    node = socket.links[0].from_node
    if node.bl_idname == "ShaderNodeTexImage":
        return node
    for inp in node.inputs:
        if inp.is_linked and inp.links[0].from_node.bl_idname == "ShaderNodeTexImage":
            return inp.links[0].from_node
    return None


def _is_untextured_pbr(bsdf) -> bool:
    metallic = bsdf.inputs["Metallic"]
    maps = any(bsdf.inputs[n].is_linked for n in ("Metallic", "Roughness", "Normal"))
    return maps or metallic.is_linked or metallic.default_value > 0.5


def snap_image(image: bpy.types.Image) -> int:
    """Snap every pixel to its nearest palette colour in place; returns the pixel count."""
    import numpy as np

    w, h = image.size
    px = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(px)
    px = px.reshape(-1, 4)
    pal = np.array([rc.hex_to_rgb(v) for v in rc.PALETTE.values()], dtype=np.float32)
    if image.is_float:  # float buffers hold linear values; byte buffers hold sRGB
        pal = np.vectorize(rc.srgb_to_linear)(pal).astype(np.float32)
    d = ((px[:, None, :3] - pal[None, :, :]) ** 2).sum(axis=2)
    px[:, :3] = pal[d.argmin(axis=1)]
    image.pixels.foreach_set(px.ravel())
    image.update()
    image.pack()
    return w * h


def _toon_from_tokens(name: str, mid: str) -> bpy.types.Material:
    light, shadow = rc.SHADES[mid]
    mat = bpy.data.materials.new(name)
    mat.surface_render_method = "DITHERED"
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    group = nodes.new("ShaderNodeGroup")
    group.node_tree = _toon_group()
    for sock, token in (("Light", light), ("Mid", mid), ("Shadow", shadow)):
        group.inputs[sock].default_value = rc.hex_to_linear(rc.PALETTE[token])
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(group.outputs["Shader"], out.inputs["Surface"])
    return mat


def _toon_from_image(name: str, image_node) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.surface_render_method = "DITHERED"
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    tex = nodes.new("ShaderNodeTexImage")
    tex.image, tex.interpolation = image_node.image, "Closest"
    group = nodes.new("ShaderNodeGroup")
    group.node_tree = _toon_group()
    links.new(tex.outputs["Color"], group.inputs["Light"])
    links.new(tex.outputs["Color"], group.inputs["Mid"])
    group.inputs["Shadow"].default_value = rc.hex_to_linear(rc.PALETTE["slate"])
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(group.outputs["Shader"], out.inputs["Surface"])
    return mat


def palettize_material(mat: bpy.types.Material, report: dict) -> bpy.types.Material:
    """Return the palettized material to use in place of `mat` (may be `mat` itself)."""
    nodes = mat.node_tree.nodes if mat.node_tree else []
    group = next((n for n in nodes if n.bl_idname == "ShaderNodeGroup" and n.node_tree
                  and n.node_tree.name.startswith(TOON_GROUP)), None)
    if group is not None:
        for sock in ("Light", "Mid", "Shadow", "Rim"):
            inp = group.inputs[sock]
            if not inp.is_linked:
                token = _linear_to_token(inp.default_value)
                inp.default_value = rc.hex_to_linear(rc.PALETTE[token])
        report[mat.name] = "toon"
        return mat

    bsdf = _find(nodes, "ShaderNodeBsdfPrincipled")
    if bsdf is None:
        raise PaletteError(f"{mat.name}: no toon group and no Principled BSDF")
    base = bsdf.inputs["Base Color"]
    image_node = _source_image(base)
    if image_node is not None and image_node.image is not None:
        n = snap_image(image_node.image)
        report[mat.name] = f"image {image_node.image.name} ({n} px)"
        return _toon_from_image(f"{mat.name}.toon", image_node)
    if base.is_linked or _is_untextured_pbr(bsdf):
        raise PaletteError(f"{mat.name}: untextured PBR (no base-colour image, PBR inputs drive the look)")
    token = _linear_to_token(base.default_value)
    report[mat.name] = f"flat -> {token}"
    return _toon_from_tokens(f"{mat.name}.toon", token)


def palettize_objects(objects) -> dict:
    report: dict[str, str] = {}
    done: dict[str, bpy.types.Material] = {}
    errors = []
    for obj in objects:
        if obj.type != "MESH":
            continue
        for slot in obj.material_slots:
            mat = slot.material
            if mat is None or mat.name in SKIP:
                continue
            try:
                if mat.name not in done:
                    done[mat.name] = palettize_material(mat, report)
                slot.material = done[mat.name]
            except PaletteError as e:
                errors.append(str(e))
    if errors:
        raise PaletteError("palettize failed:\n  " + "\n  ".join(sorted(set(errors))))
    return report


def _args(argv: list[str]) -> argparse.Namespace:
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    p = argparse.ArgumentParser(prog="palettize.py")
    p.add_argument("--save", action="store_true", help="save the open .blend after palettizing")
    return p.parse_args(argv)


if __name__ == "__main__":
    args = _args(sys.argv)
    try:
        result = palettize_objects(bpy.data.objects)
    except PaletteError as e:
        print(e)
        sys.exit(1)
    for name, how in sorted(result.items()):
        print(f"palettize: {name}: {how}")
    if args.save:
        bpy.ops.wm.save_mainfile()
