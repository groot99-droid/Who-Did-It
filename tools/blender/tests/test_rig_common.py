"""Plain-Python tests for rig_common (no bpy): python3 -m unittest discover -s tests -t ."""

import math
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import rig_common as rc  # noqa: E402


class FrameNames(unittest.TestCase):
    def test_name_matches_regex(self):
        name = rc.frame_name("villager", "walk", "se", 3)
        self.assertEqual(name, "char_villager_walk_se_003")
        self.assertEqual(rc.FRAME_RE.match(name).groups(), ("villager", "walk", "se", "003"))

    def test_rejects_bad_parts(self):
        for args in (("old_man", "walk", "n", 0), ("villager", "dance", "n", 0),
                     ("villager", "walk", "north", 0), ("villager", "walk", "n", 1000)):
            with self.assertRaises(ValueError):
                rc.frame_name(*args)

    def test_every_v1_frame_is_valid(self):
        names = {rc.frame_name("villager", a, d, i)
                 for a, n in rc.V1_CLIPS.items() for d in rc.DIRECTIONS for i in range(n)}
        self.assertEqual(len(names), 240)  # docs/ASSETS.md 6.3: 240 frames per pass


class Directions(unittest.TestCase):
    def test_order_and_turntable(self):
        self.assertEqual(rc.DIRECTIONS, ("n", "ne", "e", "se", "s", "sw", "w", "nw"))
        self.assertEqual(rc.turntable_z(0), 0.0)
        self.assertAlmostEqual(rc.turntable_z(2), -math.pi / 2)
        self.assertAlmostEqual(rc.turntable_z(7), math.radians(-315))


class Sampling(unittest.TestCase):
    def test_frame_step(self):
        self.assertEqual(rc.frame_step(24), 2)
        self.assertEqual(rc.frame_step(60), 5)
        self.assertEqual(rc.frame_step(12), 1)
        with self.assertRaises(ValueError):
            rc.frame_step(30)

    def test_sample_frames(self):
        self.assertEqual(rc.sample_frames(1, 17, 2), [1, 3, 5, 7, 9, 11, 13, 15])


class Palette(unittest.TestCase):
    def test_exact_tokens_map_to_themselves(self):
        for token, hex_colour in rc.PALETTE.items():
            self.assertEqual(rc.nearest_palette(rc.hex_to_rgb(hex_colour)), token)

    def test_nearest(self):
        self.assertEqual(rc.nearest_palette((0.0, 0.0, 0.0)), "ink")
        self.assertEqual(rc.nearest_palette((1.0, 1.0, 1.0)), "bone")
        self.assertEqual(rc.nearest_palette((0.8, 0.05, 0.1)), "blood")

    def test_shades_cover_palette(self):
        self.assertEqual(set(rc.SHADES), set(rc.PALETTE))
        for light, shadow in rc.SHADES.values():
            self.assertIn(light, rc.PALETTE)
            self.assertIn(shadow, rc.PALETTE)

    def test_linear_round_trip(self):
        for c in (0.0, 0.02, 0.5, 1.0):
            self.assertAlmostEqual(rc.linear_to_srgb(rc.srgb_to_linear(c)), c, places=6)


class Geometry(unittest.TestCase):
    def test_camera_shift(self):
        self.assertEqual(rc.camera_shift_y(rc.FEET_ROW_PX), 0.0)
        self.assertAlmostEqual(rc.camera_shift_y(88), -24 / 128)
        cell, row = rc.clip_cell("die")
        # 256 px cell: the unshifted origin sits 48 px below the centre, at row 176.
        self.assertAlmostEqual(rc.camera_shift_y(row, cell), -(176 - row) / 256)
        self.assertEqual(rc.clip_cell("walk"), (rc.CELL_PX, rc.FEET_ROW_PX))

    def test_feet_pixels(self):
        self.assertEqual(rc.feet_pixels(0.5, 0.125), (64.0, 112.0))

    def test_light_direction_is_unit(self):
        d = rc.light_direction(rc.KEY_LIGHT["azimuth"], rc.KEY_LIGHT["elevation"])
        self.assertAlmostEqual(sum(c * c for c in d), 1.0)
        self.assertLess(d[1], 0)  # the key sits on the camera side (world -Y)


if __name__ == "__main__":
    unittest.main()
