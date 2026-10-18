"""The world looks of looks.json, plus the villager, as build data (art plan 4.3; deck-data.md 6).

Pure Python, no bpy, so the tests read it. Every world look shares the base body of build_looks.py;
a spec names the base body's colours, the `interact` base, and the costume pieces of look_parts.py
that dress it. Colours are (ramp, step) pairs of palette.json `world.ramps` (dark to light): the
costume is drawn from the ink, slate, fog and bone ramps, skin from the skin ramp, hair from ink,
wood, fog or bone, and a carried prop may add wood, brass, stone or lantern (ASSETS 6.1, S3.3).
Nothing on a look is blood, teal, moon or magenta, so the runtime scarf tint stays the one saturated
colour on a walking figure.

`skin` is the art plan's skin number 1-4 (dark to light): the mid step of three neighbouring skin
steps, so tone n is skin step n with steps n - 1 and n + 1 as its shadow and light.
"""

from __future__ import annotations

INTERACT_BASES = ("kneel", "waist", "raise")

# Colours a look may never use (the scarf tint and the hazard mark stay alone).
FORBIDDEN_RAMPS = ("blood", "teal", "moon")

LOOKS: dict[str, dict] = {
    # fog / ink / lantern; skin 3, a short ink bob. Kneels with the lens to the ground.
    "detective": {
        "skin": 3,
        "hair": ("ink", 1),
        "jacket": ("fog", 0),
        "shirt": ("bone", 1),
        "trousers": ("ink", 1),
        "boots": ("ink", 0),
        "coat": ("fog", 0),
        "belt": ("slate", 0),
        "hat": ("ink", 1),
        "gloves": ("ink", 1),
        "interact": "kneel",
        "parts": ["hair_short", "long_coat", "belt", "collar_up", "gloves", "fedora", "magnifier"],
    },
    # ink / bone / mustard; skin 4, fog whiskers. Kneels and opens the bag.
    "doctor": {
        "skin": 4,
        "hair": ("fog", 1),
        "jacket": ("ink", 1),
        "shirt": ("bone", 2),
        "trousers": ("slate", 1),
        "boots": ("ink", 0),
        "coat": ("ink", 1),
        "coat_hem": 0.50,
        "hat": ("ink", 1),
        "interact": "kneel",
        "parts": ["hair_short", "whiskers", "spectacles", "waistcoat", "long_coat", "top_hat", "doctor_bag"],
    },
    # ink / bone / mustard; skin 2, a fog fringe. Reads from the book, head bowed.
    "vicar": {
        "skin": 2,
        "hair": ("fog", 1),
        "jacket": ("ink", 1),
        "shirt": ("ink", 1),
        "trousers": ("ink", 1),
        "boots": ("ink", 0),
        "coat": ("ink", 1),
        "hat": ("ink", 1),
        "interact": "waist",
        "parts": ["fringe", "cassock", "collar_band", "shovel_hat", "prayer_book"],
    },
    # slate / fog / lantern; skin 4, a wood moustache. Lifts the lantern and peers.
    "watchman": {
        "skin": 4,
        "hair": ("wood", 2),
        "jacket": ("slate", 1),
        "shirt": ("fog", 1),
        "trousers": ("slate", 0),
        "boots": ("ink", 0),
        "coat": ("slate", 1),
        "cape": ("fog", 0),
        "hat": ("slate", 2),
        "interact": "raise",
        "raise_deg": 12,  # the pole lantern rides the left hand
        "parts": ["hair_short", "moustache", "long_coat", "belt", "collar_up", "shoulder_cape", "helmet", "rattle",
                  "pole_lantern"],
    },
    # fog / bone / mustard; skin 3, bone wisps under the hood. Works at her waist.
    "herbalist": {
        "skin": 3,
        "hair": ("bone", 2),
        "jacket": ("fog", 0),
        "shirt": ("fog", 1),
        "trousers": ("slate", 1),
        "boots": ("wood", 1),
        "coat": ("slate", 2),
        "apron": ("bone", 1),
        "hood": ("fog", 0),
        "interact": "waist",
        "parts": ["hair_wisps", "hood_shawl", "skirt_long", "apron_pockets", "herbs", "satchel", "vials"],
    },
    # slate / fog / mustard; skin 3, a wood beard. Kneels.
    "gamekeeper": {
        "skin": 3,
        "hair": ("wood", 2),
        "jacket": ("slate", 2),
        "shirt": ("fog", 1),
        "trousers": ("fog", 0),
        "boots": ("wood", 2),
        "coat": ("slate", 2),
        "coat_hem": 0.62,
        "hat": ("fog", 0),
        "interact": "kneel",
        "parts": ["hair_short", "beard", "long_coat", "gaiters", "deerstalker", "game_bag", "fowling_piece"],
    },
    # slate / bone / lantern; skin 1, cropped wood hair. Reaches the pole up.
    "lamplighter": {
        "skin": 1,
        "hair": ("wood", 2),
        "jacket": ("bone", 2),
        "shirt": ("bone", 2),
        "sleeve": ("bone", 2),
        "forearm": ("skin", 1),
        "trousers": ("slate", 1),
        "boots": ("wood", 1),
        "cape": ("slate", 1),
        "interact": "raise",
        "parts": ["hair_short", "oilskin_cape", "lighting_pole"],
    },
    # bone / fog / mustard; skin 2, wood hair under the toque. Works at her waist.
    "baker": {
        "skin": 2,
        "hair": ("wood", 3),
        "jacket": ("fog", 1),
        "shirt": ("fog", 1),
        "forearm": ("skin", 2),
        "trousers": ("fog", 0),
        "boots": ("wood", 1),
        "apron": ("bone", 2),
        "interact": "waist",
        "parts": ["hair_bun", "toque", "apron_long", "flour", "basket"],
    },
    # fog / ink / mustard; skin 4, a bone beard. Mends the net at his waist.
    "fisher": {
        "skin": 4,
        "hair": ("bone", 2),
        "jacket": ("fog", 0),
        "shirt": ("fog", 1),
        "trousers": ("slate", 1),
        "boots": ("ink", 0),
        "coat": ("fog", 0),
        "coat_hem": 0.46,
        "hat": ("brass", 1),
        "interact": "waist",
        "parts": ["hair_short", "beard", "long_coat", "sea_boots", "souwester", "net_coil"],
    },
    # slate / fog / lantern; skin 1, an ink plait. Kneels at the rock.
    "tinner": {
        "skin": 1,
        "hair": ("ink", 1),
        "jacket": ("slate", 2),
        "shirt": ("fog", 1),
        "sleeve": ("fog", 1),
        "trousers": ("slate", 1),
        "boots": ("wood", 1),
        "hat": ("wood", 1),
        "interact": "kneel",
        "parts": ["hair_short", "plait", "ore_dust", "felt_hat", "candle", "pick"],
    },
    # The plain base: review renders in round 5, placeholder only in the manifests (art plan 4.2).
    "villager": {
        "skin": 3,
        "hair": ("wood", 3),
        "jacket": ("fog", 0),
        "shirt": ("bone", 2),
        "trousers": ("slate", 1),
        "boots": ("ink", 1),
        "interact": "waist",
        "parts": ["hair_short"],
    },
}

WORLD_LOOKS: tuple[str, ...] = tuple(k for k in LOOKS if k != "villager")


def skin_colour(tone: int) -> tuple[str, int]:
    if not 1 <= tone <= 4:
        raise ValueError(f"skin tone {tone} is not 1-4")
    return ("skin", tone)
