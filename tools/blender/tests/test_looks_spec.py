"""Plain-Python tests for looks_spec (art plan 4.3; no bpy)."""

import ast
import json
import os
import sys
import unittest

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, ".."))
import looks_spec  # noqa: E402
import rig_common as rc  # noqa: E402

LOOKS_JSON = os.path.join(HERE, "..", "..", "..", "packages", "content", "data", "looks.json")
COLOUR_KEYS = ("hair", "jacket", "shirt", "trousers", "boots", "coat", "cape", "hat", "gloves", "apron", "hood",
               "belt", "sleeve", "forearm", "hem", "waistcoat")


def pieces() -> set[str]:
    with open(os.path.join(HERE, "..", "look_parts.py"), encoding="utf-8") as fh:
        tree = ast.parse(fh.read())
    return {n.name for n in tree.body if isinstance(n, ast.FunctionDef)
            and any(getattr(d, "id", "") == "piece" for d in n.decorator_list)}


class LooksSpec(unittest.TestCase):
    def test_world_looks_match_looks_json(self):
        with open(LOOKS_JSON, encoding="utf-8") as fh:
            data = json.load(fh)
        world = [k for k, v in data["looks"].items() if v["bodyAtlas"] is not None]
        self.assertEqual(sorted(looks_spec.WORLD_LOOKS), sorted(world))
        self.assertEqual(sorted(looks_spec.VILLAGERS), sorted(data["villagers"]))
        self.assertIn("villager", looks_spec.VILLAGERS)
        for k in looks_spec.VILLAGERS:
            self.assertTrue(k.startswith("villager"), k)  # seams.md 5: every townsfolk look id begins `villager`

    def test_colours_are_world_ramp_steps_and_never_the_scarf_tints(self):
        for look, spec in looks_spec.LOOKS.items():
            for key in COLOUR_KEYS:
                if key in spec:
                    ramp, step = spec[key]
                    self.assertIn(ramp, rc.WORLD_RAMPS, f"{look}.{key}")
                    self.assertLess(step, len(rc.WORLD_RAMPS[ramp]), f"{look}.{key}")
                    self.assertNotIn(ramp, looks_spec.FORBIDDEN_RAMPS, f"{look}.{key}")
            looks_spec.skin_colour(spec["skin"])

    def test_interact_bases_and_pieces_exist(self):
        known = pieces()
        for look, spec in looks_spec.LOOKS.items():
            self.assertIn(spec["interact"], looks_spec.INTERACT_BASES, look)
            for p in spec["parts"]:
                self.assertIn(p, known, f"{look}: piece {p}")

    def test_headgear_is_distinct_and_never_a_hat_trait(self):
        hats = [next((p for p in s["parts"] if p in ("toque", "fedora", "top_hat", "shovel_hat", "helmet",
                                                       "hood_shawl", "deerstalker", "souwester", "felt_hat",
                                                       "bonnet", "kerchief")), None)
                for k, s in looks_spec.LOOKS.items() if k != "villager"]
        named = [h for h in hats if h]
        self.assertEqual(len(named), len(set(named)))  # no two looks share headgear
        self.assertNotIn("flat_cap", named)  # the hat-trait names are never a look's
        self.assertNotIn("bowler", named)

    def test_villagers_carry_no_trade_prop(self):
        """A townsfolk figure is never a seat's look: no signature prop of a card, no hat-trait shape."""
        trade = {"peel", "notebook", "magnifier", "doctor_bag", "prayer_book", "truncheon", "rattle", "pole_lantern",
                 "back_basket", "snare", "fowling_piece", "lighting_pole", "creel", "pick", "candle"}
        for k in looks_spec.VILLAGERS:
            self.assertFalse(trade & set(looks_spec.LOOKS[k]["parts"]), k)


if __name__ == "__main__":
    unittest.main()
