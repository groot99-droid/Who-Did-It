"""Plain-Python tests for rig_common (no bpy): python3 -m unittest discover -s tests -t ."""

import json
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
        self.assertEqual(len(names), 272)  # SPRITES 3: 304 until the owner's option B trimmed idle and interact (A161)

    def test_v1_clips_and_passes(self):
        self.assertEqual(rc.V1_CLIPS, {"idle": 6, "walk": 8, "swing": 6, "interact": 6, "die": 8})
        self.assertEqual(rc.PASSES, ("body", "scarf", "blood"))


class Round8Clips(unittest.TestCase):
    """The clip table of docs/round8/motion.md 1 at the owner's option B (A161; SPRITES 3)."""

    def test_names_follow_the_anim_ids(self):
        # The client's AnimId order (apps/client/src/view/animIds.ts) without `carry` and `hide`, which no look renders.
        order = ("idle", "walk", "swing", "die", "interact", "strike", "hurt", "knockdown", "down", "getup", "run",
                 "limp", "stagger", "stunned", "inspect", "threaten", "cower", "fidget", "stomp", "eat", "rob")
        self.assertEqual(set(rc.R8_CLIPS), set(order))
        self.assertTrue(set(rc.R8_CLIPS) <= set(rc.ANIMS))
        self.assertEqual(rc.ANIMS[:8], ("idle", "walk", "run", "interact", "swing", "carry", "die", "hide"))

    def test_v1_clips_follow_the_table(self):
        for name, n in rc.V1_CLIPS.items():
            self.assertEqual((rc.R8_CLIPS[name].frames, rc.R8_CLIPS[name].dirs), (n, rc.DIRECTIONS), name)

    def test_option_b_frame_counts(self):
        # The owner's option B (A161): plan B's frame counts, limp and stagger in the four diagonals.
        table = {name: (c.frames, len(c.dirs)) for name, c in rc.R8_CLIPS.items()}
        self.assertEqual(table, {
            "idle": (6, 8), "walk": (8, 8), "swing": (6, 8), "interact": (6, 8), "die": (8, 8), "run": (6, 8),
            "strike": (4, 8), "hurt": (3, 8),
            "limp": (6, 4), "stagger": (6, 4), "inspect": (4, 4), "cower": (4, 4), "fidget": (4, 4),
            "stomp": (4, 4), "stunned": (4, 4),
            "knockdown": (4, 4), "down": (2, 4), "getup": (4, 4), "rob": (4, 4), "eat": (4, 4), "threaten": (4, 4),
        })
        # SPRITES 3: a deck look renders 504 resident frames a pass (47 x 8 and 32 x 4) and 88 lazy (22 x 4).
        self.assertEqual(rc.frame_counts("baker"), (504, 88))
        self.assertEqual(rc.look_clips("baker"), rc.R8_CLIPS)

    def test_the_family_drops_five_clips(self):
        self.assertEqual(rc.FAMILY_DROPS, ("swing", "strike", "rob", "threaten", "inspect"))
        for body in ("villager", "villagerelder", "villagerclerk"):
            self.assertTrue(rc.is_villager(body))
            clips = rc.look_clips(body)
            self.assertEqual(set(clips), set(rc.R8_CLIPS) - set(rc.FAMILY_DROPS), body)
            self.assertEqual(list(clips), [n for n in rc.R8_CLIPS if n not in rc.FAMILY_DROPS], body)
            # SPRITES 3: 408 resident frames a pass (37 x 8 and 28 x 4) and 56 lazy (14 x 4).
            self.assertEqual(rc.frame_counts(body), (408, 56), body)
        self.assertFalse(rc.is_villager("vicar"))

    def test_directions_and_lazy_page(self):
        eight = {"idle", "walk", "swing", "interact", "die", "run", "strike", "hurt"}
        lazy = {"knockdown", "down", "getup", "rob", "eat", "threaten"}
        for name, clip in rc.R8_CLIPS.items():
            self.assertEqual(clip.dirs, rc.DIRECTIONS if name in eight else rc.FOUR_DIRS, name)
            self.assertEqual(clip.lazy, name in lazy, name)
        self.assertEqual(rc.FOUR_DIRS, ("ne", "se", "sw", "nw"))
        self.assertTrue(set(rc.FOUR_DIRS) <= set(rc.DIRECTIONS))

    def test_loops_and_spans(self):
        loops = {"idle", "walk", "interact", "run", "limp", "stagger", "down", "stunned", "cower", "fidget", "stomp"}
        for name, clip in rc.R8_CLIPS.items():
            self.assertEqual(clip.loop, name in loops, name)
            # 24 fps keys sampled every 2 frames: a loop spans 2n (its last key repeats the first), a one-shot 2(n-1).
            span = clip.span()
            self.assertEqual(span, 2 * clip.frames if clip.loop else 2 * (clip.frames - 1), name)
            self.assertEqual(len(rc.sample_frames(1, 1 + span if clip.loop else 2 + span, 2)), clip.frames, name)

    def test_every_round8_frame_is_valid(self):
        names = {rc.frame_name("villager", a, d, i)
                 for a, c in rc.R8_CLIPS.items() for d in c.dirs for i in range(c.frames)}
        self.assertEqual(len(names), sum(c.frames * len(c.dirs) for c in rc.R8_CLIPS.values()))


class Directions(unittest.TestCase):
    def test_order_and_turntable(self):
        # SPRITES 10.3: TT.rotation_euler.z = 45 deg - i * 45 deg; +Y (world north) renders as ne.
        self.assertEqual(rc.DIRECTIONS, ("n", "ne", "e", "se", "s", "sw", "w", "nw"))
        self.assertAlmostEqual(rc.turntable_z(0), math.pi / 4)
        self.assertEqual(rc.turntable_z(1), 0.0)
        self.assertAlmostEqual(rc.turntable_z(2), -math.pi / 4)
        self.assertAlmostEqual(rc.turntable_z(4), math.radians(-135))
        self.assertAlmostEqual(rc.turntable_z(7), math.radians(-270))


class IsoCam(unittest.TestCase):
    def test_constants(self):
        self.assertEqual((rc.CAMERA_TILT_DEG, rc.CAMERA_YAW_DEG), (60.0, 45.0))
        self.assertEqual((rc.CELL_PX, rc.FEET_ROW_PX), (128, 112))
        self.assertEqual(rc.CLIP_CELL, {a: (256, 128) for a in ("die", "knockdown", "down", "getup")})
        self.assertEqual(rc.Z_SCALE, 0.75)
        self.assertEqual(rc.ENV_ROOT_SCALE, (1.0, 1.0, 0.75))
        self.assertEqual(rc.CHAR_ROOT_SCALE, (0.75, 0.75, 0.75))
        self.assertEqual(rc.OUTLINE_PRESETS["character"], -0.022)

    def test_display_scale(self):
        # A 1 m tile is a 128 x 64 diamond: its diagonal, sqrt(2) m, spans 128 px.
        self.assertAlmostEqual(math.sqrt(2) * rc.DISPLAY_PX_PER_M, 128.0, delta=0.01)
        self.assertAlmostEqual(rc.ortho_scale(128), 128 / 90.51)
        # 59 display px per vertical metre; a 1.7 m figure about 100 px, under the 112 px cap.
        self.assertAlmostEqual(rc.display_px_per_vertical_m(), 58.79, places=2)
        self.assertLess(1.7 * rc.display_px_per_vertical_m(), 112)

    def test_lights_turn_with_the_camera(self):
        self.assertEqual(rc.world_azimuth(rc.KEY_LIGHT["azimuth"]), 180.0)  # screen left = world south
        self.assertEqual(rc.world_azimuth(rc.FILL_LIGHT["azimuth"]), 0.0)
        lo, hi = rc.TOON_RAMP_STOPS
        for lit_wall in (0.35, 0.49):  # README: the measured lumas
            self.assertTrue(lo + 0.1 <= lit_wall <= hi - 0.1)
        self.assertGreaterEqual(0.77, hi + 0.1)


class Calibration(unittest.TestCase):
    """The committed calibration sheet (apps/client/public/assets/calibration, art plan 4.1)."""

    @classmethod
    def setUpClass(cls):
        path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "apps", "client", "public", "assets",
                            "calibration", "calibration.json")
        with open(path, encoding="utf-8") as fh:
            cls.report = json.load(fh)

    def test_isocam(self):
        self.assertEqual(self.report["camera"], "IsoCam")
        self.assertEqual(self.report["tileDiamond"][1], 64)
        self.assertAlmostEqual(self.report["tileDiamond"][0], 128, delta=2)

    def test_n_marker_points_screen_up(self):
        dx, dy = self.report["frames"]["char_calib_idle_n_000"]["marker"]
        self.assertAlmostEqual(dx, 0.0, places=1)
        self.assertLess(dy, -5)

    def test_markers_turn_clockwise(self):
        for i, d in enumerate(rc.DIRECTIONS):
            dx, dy = self.report["frames"][f"char_calib_idle_{d}_000"]["marker"]
            # The marker's screen bearing, clockwise from up, falls in its direction's 45 deg sector.
            bearing = math.degrees(math.atan2(dx, -dy)) % 360
            self.assertLess(min(abs(bearing - 45 * i), 360 - abs(bearing - 45 * i)), 22.5, d)

    def test_feet_and_cells(self):
        for name, frame in self.report["frames"].items():
            self.assertNotIn("clipped", frame, name)
            expected = self.report["expected"]["dieFeet" if "_die_" in name else "feet"]
            self.assertEqual(frame["feet"], expected, name)


class Sampling(unittest.TestCase):
    def test_frame_step(self):
        self.assertEqual(rc.frame_step(24), 2)
        self.assertEqual(rc.frame_step(60), 5)
        self.assertEqual(rc.frame_step(12), 1)
        with self.assertRaises(ValueError):
            rc.frame_step(30)

    def test_sample_frames(self):
        self.assertEqual(rc.sample_frames(1, 17, 2), [1, 3, 5, 7, 9, 11, 13, 15])


class WorldPalette(unittest.TestCase):
    def test_sixty_four_colours_without_magenta(self):
        self.assertEqual(len(rc.WORLD), 64)
        self.assertNotIn(rc.PALETTE["magenta"].upper(), rc.WORLD)
        self.assertIn(rc.PALETTE["ink"].upper(), rc.WORLD)

    def test_nearest_world(self):
        for c in rc.WORLD:
            self.assertEqual(rc.nearest_world(rc.hex_to_rgb(c)), c)
        self.assertEqual(rc.nearest_world((0.0, 0.0, 0.0)), "#12141C")

    def test_ramp_shades(self):
        self.assertEqual(rc.ramp_shades("#6F7A8C"), ("#8892A2", "#2C3240"))  # fog's lowest: into slate
        self.assertEqual(rc.ramp_shades("#2C3240"), ("#3A4356", "#12141C"))  # slate's lowest: into ink
        self.assertEqual(rc.ramp_shades("#12141C"), ("#1A1D29", "#12141C"))
        self.assertEqual(rc.ramp_shades("#B2AA99"), ("#D9D2C2", "#8E8676"))
        self.assertEqual(rc.ramp_shades("#F2B33D"), ("#F2B33D", "#A07C36"))  # top step lights to itself
        self.assertEqual(rc.ramp_shades("#9A9083", "stone"), ("#B2AA99", "#7A7067"))
        with self.assertRaises(ValueError):
            rc.ramp_shades("#E04E9A")


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
        self.assertAlmostEqual(rc.camera_shift_y(32, 64), -48 / 64)  # the tile diamond's frame
        cell, row = rc.clip_cell("die")
        # 256 px cell: the unshifted origin sits 48 px below the centre, at row 176.
        self.assertAlmostEqual(rc.camera_shift_y(row, cell), -(176 - row) / 256)
        self.assertEqual(rc.clip_cell("walk"), (rc.CELL_PX, rc.FEET_ROW_PX))

    def test_feet_pixels(self):
        self.assertEqual(rc.feet_pixels(0.5, 0.125), (64.0, 112.0))

    def test_light_direction_is_unit(self):
        d = rc.light_direction(rc.world_azimuth(rc.KEY_LIGHT["azimuth"]), rc.KEY_LIGHT["elevation"])
        self.assertAlmostEqual(sum(c * c for c in d), 1.0)
        self.assertLess(d[1], 0)  # the key sits on the camera side (IsoCam looks north-west from the south-east)


if __name__ == "__main__":
    unittest.main()


class ArtStyles(unittest.TestCase):
    def test_style_switch_is_taken_out_of_argv(self):
        argv = ["x.py", "--", "--style", "hd", "--textured", "--out", "o"]
        self.assertEqual(rc.style_from_argv(argv), ("hd", True))
        self.assertEqual(argv, ["x.py", "--", "--out", "o"])
        argv = ["x.py", "--", "--style=lowpoly", "--out", "o"]
        self.assertEqual(rc.style_from_argv(argv), ("lowpoly", False))
        self.assertEqual(argv, ["x.py", "--", "--out", "o"])
        self.assertEqual(rc.style_from_argv(["x.py", "--", "--out", "o"]), ("8bit", False))
        with self.assertRaises(ValueError):
            rc.style_from_argv(["x.py", "--", "--style", "4k"])

    def test_hd_renders_at_twice_the_display_scale(self):
        self.assertEqual(rc.ART_STYLES, ("8bit", "lowpoly", "hd"))
        self.assertEqual(rc.STYLE_FACTOR, {"8bit": 1, "lowpoly": 1, "hd": 2})
        for key in ("taaSamples", "filterSize", "keyAngleDeg", "shadowRays", "shadowSteps", "aoDistance",
                    "rimToken", "rimAmount", "rimAmountWorld", "catcherStrength", "catcherLit", "catcherHaze", "bandSoft",
                    "bumpStrength", "bumpDistance"):
            self.assertIn(key, rc.HD)
        self.assertIn(rc.HD["rimToken"], rc.PALETTE)
        lo, hi = rc.TOON_RAMP_STOPS
        self.assertLess(rc.HD["bandSoft"], (hi - lo) / 2)  # the mid band keeps a plateau
        self.assertGreater(rc.HD["catcherLit"], hi)  # unshadowed ground stays in the light band
        # The clear threshold sits under the lit measurement and above the light band's stop.
        self.assertGreater(rc.HD["catcherHaze"], 0)
        self.assertGreater(rc.HD["catcherLit"] - rc.HD["catcherHaze"], hi)
