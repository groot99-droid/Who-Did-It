"""The figure rig's pure helpers (round 11, F1): the period search, the standing pick, the breath, the sun, looks."""

import math
import os
import struct
import sys
import unittest
import zlib

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import figures as fg  # noqa: E402
import rig_common as rc  # noqa: E402


def stride(period: float, frames: int, phase: float = 0.0) -> list[list[float]]:
    """A two-foot walk sampled once a frame: each foot swings along y, the second half a cycle behind."""
    out = []
    for t in range(frames):
        a = 2.0 * math.pi * (t / period + phase)
        out.append([0.3 * math.sin(a), 0.1 * max(0.0, math.cos(a)), -0.3 * math.sin(a), 0.1 * max(0.0, -math.cos(a))])
    return out


class Period(unittest.TestCase):
    def test_a_clip_of_several_cycles_finds_one_cycle(self):
        self.assertAlmostEqual(fg.find_period(stride(32.0, 101)), 32.0, delta=0.05)

    def test_a_cycle_between_whole_frames_is_refined(self):
        p = fg.find_period(stride(33.5, 101))
        self.assertLess(abs(p - 33.5), 0.25, p)

    def test_half_a_cycle_on_is_not_a_cycle(self):
        # the feet swap at half a cycle: the stride is mirrored, so the lag of 16 must not be taken
        self.assertGreater(fg.find_period(stride(32.0, 101)), 20)

    def test_a_single_cycle_clip_has_no_period_inside_it(self):
        self.assertIsNone(fg.find_period(stride(24.8, 25)))

    def test_a_still_clip_has_no_period(self):
        self.assertIsNone(fg.find_period([[1.0, 2.0]] * 30))

    def test_a_noisy_capture_still_finds_its_cycle(self):
        samples = stride(30.0, 95)
        for i, s in enumerate(samples):
            s[0] += 0.02 * math.sin(i * 1.7)  # an unlooped capture: each cycle a little different
        self.assertAlmostEqual(fg.find_period(samples), 30.0, delta=0.5)

    def test_one_sample_is_refused(self):
        with self.assertRaises(ValueError):
            fg.find_period([[0.0]])


class Clips(unittest.TestCase):
    def test_the_clips_are_idle_and_walk(self):
        self.assertEqual(set(fg.FIGURE_CLIPS), {"idle", "walk"})
        self.assertEqual(fg.FIGURE_CLIPS["walk"], (rc.R8_CLIPS["walk"].frames, True))
        self.assertTrue(fg.FIGURE_CLIPS["idle"][1])
        for anim in fg.FIGURE_CLIPS:
            self.assertIn(anim, rc.ANIMS)

    def test_walk_times_cover_one_cycle_without_its_last_key(self):
        times = fg.walk_times(0.8, 33.5, 8)
        self.assertEqual(len(times), 8)
        self.assertAlmostEqual(times[0], 0.8)
        self.assertAlmostEqual(times[1] - times[0], 33.5 / 8, places=3)
        self.assertLess(times[-1], 0.8 + 33.5)

    def test_the_standing_frame_has_the_feet_closest(self):
        self.assertEqual(fg.pick_standing([0.6, 0.4, 0.21, 0.35, 0.21]), 2)
        with self.assertRaises(ValueError):
            fg.pick_standing([])

    def test_the_breath_is_slow_and_symmetric(self):
        n = fg.IDLE_FRAMES
        self.assertGreaterEqual(n / rc.OUTPUT_FPS, 2.0, "a breath of at least two seconds")
        self.assertEqual(fg.breath(0, n), 0.0)
        self.assertEqual(fg.breath(n // 2, n), 1.0)
        for k in range(1, n):
            self.assertEqual(fg.breath(k, n), fg.breath(n - k, n), k)
            self.assertTrue(0.0 <= fg.breath(k, n) <= 1.0)

    def test_the_breath_stays_under_a_packed_pixel(self):
        packed_px = fg.BREATH_LIFT_M * rc.display_px_per_vertical_m() / 2.0
        self.assertGreater(packed_px, 0.2)
        self.assertLess(packed_px, 1.0)


class Height(unittest.TestCase):
    def test_a_tall_figure_is_shrunk_to_the_cap_and_a_short_one_kept(self):
        self.assertEqual(fg.fit_scale(1.70), 1.0)
        self.assertEqual(fg.fit_scale(fg.MAX_HEIGHT_M), 1.0)
        self.assertAlmostEqual(1.87 * fg.fit_scale(1.87), fg.MAX_HEIGHT_M, places=5)
        with self.assertRaises(ValueError):
            fg.fit_scale(0.0)

    def test_a_figure_nearing_the_cell_top_on_screen_is_shrunk_to_keep_its_headroom(self):
        room = (rc.FEET_ROW_PX - fg.HEADROOM_ROWS) / rc.DISPLAY_PX_PER_M
        self.assertEqual(fg.screen_fit_scale(room - 0.01), 1.0)
        tall = room + 0.1
        self.assertAlmostEqual(tall * fg.screen_fit_scale(tall) * rc.DISPLAY_PX_PER_M,
                               rc.FEET_ROW_PX - fg.HEADROOM_ROWS, places=3)

    def test_the_cap_leaves_rows_above_the_crown(self):
        rows = fg.MAX_HEIGHT_M * rc.display_px_per_vertical_m()
        self.assertLess(rows, rc.FEET_ROW_PX - 4, "a few display rows for the bob and a lean")
        self.assertGreater(rows, 0.9 * rc.FEET_ROW_PX)


class Sun(unittest.TestCase):
    def test_cl3a_turns_the_key_45_degrees_clockwise(self):
        # today's key: camera azimuth 225 is world azimuth 180 (rig_common.world_azimuth); CL3a turns it to 225
        self.assertEqual(rc.world_azimuth(rc.KEY_LIGHT["azimuth"]), 180.0)
        self.assertEqual(fg.sun_world_azimuth(rc.KEY_LIGHT["azimuth"], rc.CAMERA_YAW_DEG), 225.0)
        self.assertEqual(fg.SUN_ELEVATION_DEG, 25.0)

    def test_the_sun_vector_is_a_unit_vector_above_the_ground(self):
        x, y, z = fg.toward(225.0, 25.0)
        self.assertAlmostEqual(x * x + y * y + z * z, 1.0)
        self.assertAlmostEqual(z, math.sin(math.radians(25.0)))
        self.assertLess(x, 0.0)
        self.assertLess(y, 0.0)  # south-west: from screen left under IsoCam, so shadows fall to the right

    def test_a_minus_y_model_turns_half_a_turn(self):
        self.assertAlmostEqual(fg.FORWARD_TURN["-Y"], math.pi)
        self.assertEqual(fg.FORWARD_TURN["+Y"], 0.0)


def chunk(kind: bytes, body: bytes) -> bytes:
    return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body))


class Png(unittest.TestCase):
    def test_text_chunks_go_and_the_rest_stays_byte_for_byte(self):
        ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0))
        idat = chunk(b"IDAT", zlib.compress(b"\x00\x10\x20\x30\xff"))
        timed = [chunk(b"tEXt", b"cycles.ViewLayer.render_time\x0000:00.1" + bytes([48 + i])) for i in range(2)]
        a = fg.PNG_SIGNATURE + ihdr + timed[0] + idat + chunk(b"IEND", b"")
        b = fg.PNG_SIGNATURE + ihdr + timed[1] + idat + chunk(b"IEND", b"")
        self.assertNotEqual(a, b)
        self.assertEqual(fg.strip_text_chunks(a), fg.strip_text_chunks(b))
        self.assertEqual(fg.strip_text_chunks(a), fg.PNG_SIGNATURE + ihdr + idat + chunk(b"IEND", b""))

    def test_a_file_that_is_not_a_png_is_refused(self):
        with self.assertRaises(ValueError):
            fg.strip_text_chunks(b"GIF89a")
        with self.assertRaises(ValueError):
            fg.strip_text_chunks(fg.PNG_SIGNATURE + struct.pack(">I", 99) + b"IDAT")


class Looks(unittest.TestCase):
    def test_every_seat_and_villager_look_is_a_figure_look(self):
        looks = fg.load_looks()
        for look in ("baker", "detective", "villager", "villagerlass", "constable"):
            self.assertIn(look, looks)
            self.assertEqual(fg.check_look(look, looks), look)
            self.assertRegex(look, rc.BODY_RE)

    def test_a_cover_card_is_never_a_figure(self):
        covers = fg.cover_looks()
        self.assertEqual(covers, {"killer", "accomplice", "drifter"})
        self.assertFalse(covers & fg.load_looks())
        for look in covers:
            with self.assertRaisesRegex(ValueError, "cover card"):
                fg.check_look(look)

    def test_a_model_without_a_look_is_a_gap(self):
        with self.assertRaises(ValueError):
            fg.check_look("mallory")
        with self.assertRaises(ValueError):
            fg.check_look("ada_kerrow")


if __name__ == "__main__":
    unittest.main()
