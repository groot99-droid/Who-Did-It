"""Material roles (docs/round8/art.md 5): every surface asks for a role, never a slug, so one swap changes every use.

Pure Python (no bpy). A role is a Poly Haven texture slug, the metres one repeat of it spans in object space
(box projection at a fixed texel density, since the kit's meshes have no authored UVs), the world ramp of
`palette.json` it is toned toward in 8-bit and low poly, and an optional tint for a stand-in texture.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass

USER_AGENT = "who-did-it-build"
LOCK_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "polyhaven.lock.json")
CACHE_DIR = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".cache", "materials"))

# The maps a style may read and the Poly Haven file-name part of each.
MAPS = {"diff": "diff", "nor_gl": "nor_gl", "rough": "rough"}
RESOLUTIONS = ("1k", "2k")
# art.md 5: 8-bit and low poly read 1k, HD 2k (4k where a surface fills the frame joins the lock when a render needs it).
STYLE_RESOLUTION = {"8bit": "1k", "lowpoly": "1k", "hd": "2k"}
# How far a style pulls the photo toward its role's ramp colour (0 = the photo), and low poly's posterise levels.
STYLE_TONE = {"8bit": 0.45, "lowpoly": 0.45, "hd": 0.0}
POSTERISE_LEVELS = {"lowpoly": 6}
# The sky the PBR finish fills the world with (`pbr.py`, A164): a Poly Haven HDRI, locked and fetched like the textures.
HDRIS = {"sky": "kloofendal_48d_partly_cloudy_puresky"}
HDRI_RESOLUTION = "1k"


@dataclass(frozen=True)
class Role:
    slug: str
    metres: float
    ramp: str
    tint: str | None = None
    note: str = ""


ROLES: dict[str, Role] = {
    # walls, roofs and floors
    "plaster": Role("worn_mossy_plasterwall", 2.0, "plaster"),
    "brick": Role("red_brick_03", 1.5, "brick"),
    "stone_wall": Role("rock_wall_08", 2.0, "stone"),
    "rock_face": Role("rock_face", 3.0, "stone"),
    "cobble": Role("mossy_cobblestone", 1.0, "stone"),
    "flagstone": Role("stone_floor", 1.5, "stone"),
    "slate_roof": Role("roof_slates_02", 1.5, "slate"),
    "slate_floor": Role("slate_floor_02", 1.5, "slate"),
    "thatch": Role("thatch_roof_angled", 1.5, "litter"),
    # wood
    "wood_plank": Role("brown_planks_05", 2.0, "wood"),
    "wood_boards": Role("weathered_plank_siding", 2.0, "wood"),
    "wood_rough": Role("weathered_planks", 2.0, "wood"),
    "wood_floor": Role("old_wood_floor", 2.0, "wood"),
    "logs": Role("wood_trunk_wall", 2.0, "wood"),
    "bark": Role("bark_brown_02", 1.0, "wood"),
    "pine_bark": Role("pine_bark", 1.0, "wood"),
    # metal
    "iron": Role("metal_plate", 1.0, "slate"),
    "rust": Role("rust_coarse_01", 1.0, "brick"),
    "copper": Role("green_metal_rust", 1.0, "teal", note="weathered copper; Poly Haven has no bare copper sheet"),
    # cloth, hide and food
    "wool": Role("poly_wool_herringbone", 0.5, "bone"),
    "linen": Role("rough_linen", 0.5, "bone"),
    "leather": Role("brown_leather", 0.5, "wood"),
    "fur": Role("curly_teddy_natural", 0.5, "litter"),
    "flour_sack": Role("hessian_380", 0.5, "bone"),
    "bread_crust": Role("mud_cracked_dry_03", 0.25, "lantern", tint="#D9A066",
                        note="stand-in: a cracked dry crust pattern tinted to the loaf"),
    # ground (the roles of today's `env/kits.py` GROUND_TEXTURES, by theme char below)
    "moss": Role("moss_wood", 1.0, "moss"),
    "moss_rock": Role("mossy_rock", 1.5, "moss"),
    "mud": Role("mud_forest", 2.0, "litter"),
    "mud_track": Role("muddy_tracks", 2.0, "litter"),
    "mud_brown": Role("brown_mud_02", 2.0, "litter"),
    "mud_rocks": Role("brown_mud_rocks_01", 2.0, "stone"),
    "soil": Role("dirt_floor", 2.0, "litter"),
    "grass": Role("leafy_grass", 2.0, "moss"),
    "grass_dry": Role("withered_grass", 2.0, "litter"),
    "leaf_litter": Role("forest_leaves_02", 1.5, "litter"),
    "forest_floor": Role("forest_floor", 2.0, "litter"),
    "needles": Role("forrest_ground_01", 2.0, "litter"),
    "forest_ground": Role("forest_ground_04", 2.0, "litter"),
    "forest_ground_dark": Role("forest_ground_05", 2.0, "litter"),
    "rock_ground": Role("rock_ground", 2.0, "stone"),
    "rocky_trail": Role("rocky_trail", 2.0, "stone"),
    "rocky_gravel": Role("rocky_gravel", 1.5, "stone"),
    "pebbles": Role("clean_pebbles", 1.0, "stone"),
    "river_rocks": Role("river_small_rocks", 1.0, "stone"),
    "gravel": Role("gravel", 1.0, "stone"),
    "gravel_stones": Role("gravel_stones", 1.0, "stone"),
    "gravel_floor": Role("gravel_floor", 1.0, "stone"),
}

# Today's `env/kits.py` names as roles, so a caller swaps `SURFACE_TEXTURES[name]` for `LEGACY_SURFACES[name]`
# and `GROUND_TEXTURES[theme][char]` for `GROUND_ROLES[theme][char]` and renders the same slug.
LEGACY_SURFACES = {
    "plaster": "plaster", "brick": "brick", "granite": "stone_wall", "slate_roof": "slate_roof", "logs": "logs",
    "boards": "wood_boards", "planks": "wood_plank", "hill_rock": "rock_face", "bark": "bark", "pine_bark": "pine_bark",
}
GROUND_ROLES: dict[str, dict[str, str | None]] = {
    "harbour": {"g": "grass", "l": "leaf_litter", "m": "moss_rock", "p": "mud_track", "d": "mud", "c": "cobble",
                "f": "flagstone", "w": "wood_floor", "r": "rock_ground", "s": "pebbles", "~": "river_rocks",
                "u": "forest_floor", "=": "gravel", "O": None},
    "timber": {"g": "grass_dry", "l": "needles", "m": "moss", "p": "mud_brown", "d": "forest_ground",
               "c": "rocky_trail", "f": "slate_floor", "w": "wood_rough", "r": "rocky_gravel", "s": "gravel_floor",
               "~": "mud_rocks", "u": "forest_ground_dark", "=": "gravel_stones", "O": None},
}


def role(name: str) -> Role:
    if name not in ROLES:
        raise KeyError(f"unknown material role {name!r}; the roles are {', '.join(sorted(ROLES))}")
    return ROLES[name]


def slugs() -> list[str]:
    """Every slug a role names, once, sorted."""
    return sorted({r.slug for r in ROLES.values()})


def roles_of(slug: str) -> list[str]:
    return sorted(name for name, r in ROLES.items() if r.slug == slug)


def texture_file(slug: str, map_name: str, res: str) -> str:
    """The cache file name of one map at one resolution (the lock's `url` keeps the API's own name)."""
    if map_name not in MAPS or res not in RESOLUTIONS:
        raise ValueError(f"no {map_name} at {res}; maps are {list(MAPS)}, resolutions {RESOLUTIONS}")
    return f"{slug}_{MAPS[map_name]}_{res}.jpg"


def hdri_file(slug: str, res: str = HDRI_RESOLUTION) -> str:
    """The cache file name of an HDRI (the lock's `url` keeps the API's own)."""
    return f"{slug}_{res}.hdr"


def hdri_path(name: str = "sky", cache: str = CACHE_DIR) -> str:
    """Cache path of one of `HDRIS`, beside the textures under its slug."""
    slug = HDRIS[name]
    return os.path.join(cache, slug, hdri_file(slug))


def texture_path(role_name: str, map_name: str = "diff", res: str | None = None, style: str | None = None,
                 cache: str = CACHE_DIR) -> str:
    """Cache path of a role's map, at `res` or at the resolution of `style` (default 1k)."""
    r = role(role_name)
    res = res or STYLE_RESOLUTION.get(style or "8bit", "1k")
    return os.path.join(cache, r.slug, texture_file(r.slug, map_name, res))


# ---------------------------------------------------------------- the retexture tables (retexture.py, pure)

# World ramp -> role for props, kit and buildings; a ramp not listed (ink, moon, lantern, blood, skin) stays flat.
WORLD_ROLES = {
    "wood": "wood_plank", "stone": "stone_wall", "plaster": "plaster", "brick": "brick", "bone": "linen",
    "litter": "thatch", "moss": "moss", "slate": "iron", "fog": "stone_wall", "brass": "iron", "teal": "wool",
}
# The same for a figure's garments: a wood-ramp garment is leather, a litter-ramp one fur.
FIGURE_ROLES = {
    "bone": "linen", "fog": "wool", "wood": "leather", "slate": "wool", "stone": "iron", "brick": "wool",
    "moss": "wool", "litter": "fur", "plaster": "linen", "teal": "wool", "brass": "iron",
}
# Today's textured wall materials, `KitTex_<surface>` and `BldTex_<surface>[_#hex]` (env/kits.py, build_buildings.py).
LEGACY_RE = re.compile(r"^(?:KitTex|BldTex)_([a-z_]+?)(?:_(#[0-9A-Fa-f]{6}))?$")
LEGACY_EXTRA = {"shakes": "wood_plank"}  # build_buildings renders shakes from the planks texture


def legacy_role(material_name: str) -> tuple[str, str | None] | None:
    """(role, tint hex or None) for a legacy textured material's name; None for any other name."""
    m = LEGACY_RE.match(material_name)
    if not m:
        return None
    role_name = LEGACY_SURFACES.get(m.group(1)) or LEGACY_EXTRA.get(m.group(1))
    return None if role_name is None else (role_name, m.group(2))
