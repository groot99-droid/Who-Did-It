"""Tests of what the room checks know of a room (room_checks/roomcfg.py, G2b): the openings, the walls and the scans'
spans read from the builder's manifest and the scene, the check file only for a manifest written before G2b, and the
banned words. Plain Python on small synthetic manifests: no Blender, no build."""

import json
import re
import os
import sys
import tempfile
import types
import unittest

BLENDER = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
sys.path.insert(0, os.path.join(BLENDER, "room_checks"))
import roomcfg  # noqa: E402  (standard library only)

SCENES = os.path.normpath(os.path.join(BLENDER, "..", "..", "packages", "content", "data", "scenes"))
CHECK_FILES = os.path.join(BLENDER, "room_checks", "rooms")


def parlour_manifest():
    """The parlour's openings as the builder's manifest writes them (14 x 9 m, 3 m high)."""
    return dict(
        bounds=dict(room=[-7.0, -4.5, 0.0, 7.0, 4.5, 3.0], wallThickness=0.3),
        openings=[
            dict(id="wp.door", kind="door", side="E", a=-0.45, b=0.45, z0=0.0, z1=2.15, portal="wp.door"),
            dict(id="wp.bedroom", kind="door", side="N", a=-4.95, b=-4.05, z0=0.0, z1=2.15, portal="wp.bedroom"),
            dict(id="wp.draped_window_0", kind="window", side="N", a=-2.95, b=-2.05, z0=0.75, z1=2.3),
            dict(id="wp.draped_window_1", kind="window", side="N", a=3.05, b=3.95, z0=0.75, z1=2.3),
        ],
        noColor0=["lit_window", "moon_disc", "sky", "wp.draped_window_0:glass"],
        lights=[dict(name="widow_parlour_Light_wp_lt_lamp", kind="lamp")])


class FactsTest(unittest.TestCase):
    def facts(self, man, scene_id="widow_parlour", cfg=None):
        d = tempfile.mkdtemp()
        mp = os.path.join(d, "m.json")
        with open(mp, "w", encoding="utf-8") as fh:
            json.dump(man, fh)
        cp = os.path.join(d, "c.json")
        if cfg is not None:
            with open(cp, "w", encoding="utf-8") as fh:
                json.dump(cfg, fh)
        A = types.SimpleNamespace(scene=os.path.join(SCENES, scene_id + ".json"), manifest=mp, config=cp)
        return roomcfg.Facts(A)

    def test_parlour_openings_from_the_manifest(self):
        F = self.facts(parlour_manifest())
        self.assertFalse(F.legacy)
        self.assertEqual((F.fx0, F.fy0, F.fx1, F.fy1, F.ceil), (-7.0, -4.5, 7.0, 4.5, 3.0))
        self.assertEqual([o["id"] for o in F.doors], ["wp.door", "wp.bedroom"])
        self.assertEqual([o["id"] for o in F.windows], ["wp.draped_window_0", "wp.draped_window_1"])
        door = F.doors[0]
        # a door: 0.35 m either side, 0.45 m over its head
        self.assertEqual([round(v, 4) for v in door["search"]], [-0.8, 0.8, 0.0025, 2.6])
        # the bedroom door's search keeps its 0.35 m; window 0's stops half way to it (its neighbour on the north wall)
        bed = F.doors[1]
        self.assertAlmostEqual(bed["search"][1], -4.05 + 0.35)
        w0 = F.windows[0]
        self.assertAlmostEqual(w0["search"][0], (-4.05 + -2.95) / 2)
        self.assertAlmostEqual(w0["search"][1], -2.05 + 0.65)
        self.assertEqual([round(v, 4) for v in w0["search"][2:]], [0.3, 2.8])
        self.assertEqual([round(v, 4) for v in w0["cracks"]], [-3.15, -1.85, 0.55, 2.5])
        self.assertEqual(F.no_color0[-1], "wp.draped_window_0:glass")

    def test_names_keep_the_bedrooms_for_one_door_and_one_window(self):
        F = self.facts(parlour_manifest())
        self.assertEqual(F.named("door_wall_cut_matches_joinery", F.doors[0], F.doors),
                         "door_wall_cut_matches_joinery:wp.door")
        man = parlour_manifest()
        man["openings"] = [man["openings"][0], man["openings"][2]]
        F1 = self.facts(man)
        self.assertEqual(F1.named("door_wall_cut_matches_joinery", F1.doors[0], F1.doors),
                         "door_wall_cut_matches_joinery")
        self.assertEqual(F1.named("window_wall_cut_matches_joinery", F1.windows[0], F1.windows),
                         "window_wall_cut_matches_joinery")

    def test_wall_geometry(self):
        F = self.facts(parlour_manifest())
        for side in "NESW":
            p = F.point(side, 0.3, 0.5, 1.2)            # half a metre in front of the face
            self.assertAlmostEqual(F.depth(side, p), -0.5)
            self.assertAlmostEqual(F.along(side, p), 0.3)
            self.assertAlmostEqual(p[2], 1.2)
            q = F.point(side, 0.3, -0.12, 1.2)          # behind the face
            self.assertAlmostEqual(F.depth(side, q), 0.12)
            o = F.outward(side)
            self.assertAlmostEqual(q[0] - p[0], 0.62 * o[0])
            self.assertAlmostEqual(q[1] - p[1], 0.62 * o[1])
        self.assertEqual(F.point("E", 0.0, 0.0, 0.0), (7.0, 0.0, 0.0))
        self.assertEqual(F.point("S", 1.0, 0.0, 0.0), (1.0, -4.5, 0.0))

    def test_a_manifest_before_g2b_reads_the_check_file(self):
        with open(os.path.join(CHECK_FILES, "widow_bedroom.json"), encoding="utf-8") as fh:
            cfg = json.load(fh)
        F = self.facts(dict(bounds=dict(room=[-5.0, -3.5, 0.0, 5.0, 3.5, 3.0])), "widow_bedroom", cfg)
        self.assertTrue(F.legacy)
        door, win = F.openings
        self.assertEqual((door["id"], door["side"], round(door["a"], 4), round(door["b"], 4)), ("wb.door", "S", -2.95, -2.05))
        self.assertEqual([round(v, 4) for v in door["search"]], [-3.3, -1.7, 0.0025, 2.6])
        self.assertEqual(win["side"], "N")
        self.assertEqual(win["search"], [-1.6, 0.6, 0.3, 2.8])
        self.assertEqual(len(win["eyes"]), 3)
        self.assertEqual(sorted(F.no_color0), sorted(cfg["no_color0"]))

    def test_a_missing_field_stops_with_its_name(self):
        with self.assertRaises(SystemExit) as cm:
            self.facts(dict(bounds=dict(room=[-5.0, -3.5, 0.0, 5.0, 3.5, 3.0])), "widow_bedroom", {})
        self.assertIn("`door`", str(cm.exception))

    def test_the_check_file_is_optional(self):
        F = self.facts(parlour_manifest())          # no check file at all
        self.assertEqual(F.cfg, {})
        self.assertEqual(F.known_fails, [])

    def test_banned_words(self):
        F = self.facts(parlour_manifest(), cfg={"banned_words": ["Crepe", "veil"]})
        for w in ("crepe", "crape", "georgette", "gallows", "noose", "rope", "torch", "sconce", "veil"):
            self.assertIn(w, F.banned)
        self.assertEqual(len(F.banned), len(set(F.banned)))

    def test_allowed_ids_are_stripped_from_extra_values_only(self):
        # decision D7: the cellar's torches keep their scene ids in the lights' extras; the names carry `brand`
        F = self.facts(parlour_manifest(), cfg={"allowed_ids": ["cl.lt_torch_well"]})
        self.assertEqual(F.allowed_ids, ("cl.lt_torch_well",))
        ban = re.compile("|".join(re.escape(w) for w in F.banned), re.I)
        self.assertIsNone(ban.search(roomcfg.strip_allowed("cl.brand_well:glow:cl.lt_torch_well", F.allowed_ids)))
        self.assertIsNotNone(ban.search(roomcfg.strip_allowed("cl.lt_torch_trap", F.allowed_ids)))
        self.assertIsNotNone(ban.search(roomcfg.strip_allowed("a torch", F.allowed_ids)))
        self.assertEqual(self.facts(parlour_manifest()).allowed_ids, ())

    def test_the_parlour_room_file_names_pass_the_scan(self):
        # decision D7: names in the room file (ids, labels) carry no banned word
        with open(os.path.join(BLENDER, "meshy_rooms", "widow_parlour.json"), encoding="utf-8") as fh:
            d = json.load(fh)
        words = [p["id"] for p in d["pieces"]] + [p["spec"].get("label", "") for p in d["pieces"]] + \
            [o["id"] for o in d["openings"]] + [L["id"] for L in d["lights"]]
        for w in words:
            for b in roomcfg.BANNED:
                self.assertNotIn(b, w.lower(), w)


if __name__ == "__main__":
    unittest.main()
