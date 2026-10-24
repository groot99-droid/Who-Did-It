"""Swap the rig's flat world-palette materials for library roles, by ramp (docs/round8/art.md 5; `--textured`).

A toon material's mid colour names a world ramp (`wood`, `stone`, `plaster`, ...); the ramp names a role, and the
role's texture is multiplied by that very colour (normalised by the texture's own mean), so a prop keeps its
palette identity and gains the grain. Today's `KitTex_*` and `BldTex_*` textured walls become the same slug's
role material (with their tint). Flat, unlit, outline and overlay materials stay. Figures use FIGURE_ROLES, where
a wood-ramp garment is leather and a litter-ramp one fur. Idempotent: swapped materials are named `RT_*`.
"""

from __future__ import annotations

import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import build_rig  # noqa: E402
import rig_common as rc  # noqa: E402
from materials import nodes as mn  # noqa: E402
from materials import roles  # noqa: E402

WORLD_ROLES, FIGURE_ROLES = roles.WORLD_ROLES, roles.FIGURE_ROLES

_SWAPS: dict[str, bpy.types.Material] = {}


def _group_node(mat: bpy.types.Material):
    if mat.node_tree is None:
        return None
    return next((n for n in mat.node_tree.nodes if n.type == "GROUP" and n.node_tree is not None
                 and n.node_tree.name == build_rig.TOON_GROUP), None)


def mid_hex(mat: bpy.types.Material) -> str | None:
    """The world colour of a flat toon material's mid band, or None for a textured or non-toon one."""
    node = _group_node(mat)
    if node is None or node.inputs["Mid"].is_linked:
        return None
    r, g, b, _ = node.inputs["Mid"].default_value
    return rc.nearest_world(tuple(rc.linear_to_srgb(c) for c in (r, g, b)))


def replacement(mat: bpy.types.Material, style: str, table: dict[str, str]) -> bpy.types.Material | None:
    """The role material standing in for `mat`, or None to keep it."""
    if mat.name.startswith("RT_") or mat.name == build_rig.OUTLINE_MATERIAL:
        return None
    legacy = roles.legacy_role(mat.name)
    if legacy:
        role, tint = legacy
        return mn.role_material(f"RT_{style}_{role}_{tint or 'plain'}", role, style, tint=tint)
    mid = mid_hex(mat)
    if mid is None:
        return None
    ramp, _ = rc.ramp_of(mid)
    role = table.get(ramp)
    if role is None:
        return None
    return mn.role_material(f"RT_{style}_{role}_{mid}", role, style, tint=mid, normalise=True)


def retexture(objects, style: str, table: dict[str, str] = WORLD_ROLES) -> int:
    """Swap every eligible material slot of `objects`; returns the number of slots changed."""
    changed = 0
    for obj in objects:
        if obj.type != "MESH":
            continue
        for slot in obj.material_slots:
            mat = slot.material
            if mat is None:
                continue
            key = f"{style}:{table is FIGURE_ROLES}:{mat.name}"
            if key not in _SWAPS:
                _SWAPS[key] = replacement(mat, style, table)
            new = _SWAPS[key]
            if new is not None and new is not mat:
                slot.material = new
                changed += 1
    return changed
