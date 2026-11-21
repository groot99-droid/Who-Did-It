"""Tests of the Undermere gates' data file (meshy_gates/undermere_gates.json) and the plain-Python part of
meshy_gates.py (no Blender): the contract's names for the mouths (docs/walk-areas.md, section 5), agreement with the
network design (meshy_caves/undermere/design.json), the kit frames, and the Adit Gate's cutting floor."""

import json
import math
import os
import sys
import unittest

BLENDER = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
sys.path.insert(0, BLENDER)
import meshy_gates as mg  # noqa: E402  (its Blender part is not imported without bpy)

GATES = os.path.join(BLENDER, "meshy_gates", "undermere_gates.json")
DESIGN = os.path.join(BLENDER, "meshy_caves", "undermere", "design.json")
SCENES = os.path.join(BLENDER, "walk_areas", "walk_scenes.json")


def read(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


class DataFile(unittest.TestCase):
    def setUp(self):
        self.d = read(GATES)

    def test_valid(self):
        self.assertEqual(mg.validate(self.d), [])
        self.assertEqual(mg.load_gates(GATES)["format"], mg.FORMAT)

    def test_walk_scene_and_namespace(self):
        ws = read(SCENES)
        self.assertIn(self.d["scene"], ws)
        self.assertEqual(ws[self.d["scene"]]["portal_ns"], self.d["portal_ns"])

    def test_four_gates_named_as_the_contract_says(self):
        ids = [g["id"] for g in self.d["gates"]]
        self.assertEqual(ids, ["swallow", "cutting", "adit", "rising"])
        for g in self.d["gates"]:
            gid = g["id"]
            self.assertEqual(g["portal"]["node"], f"Portal_um.{gid}_in")
            self.assertEqual(g["arrival"]["node"], f"Spawn_overworld_mouth_{gid}")
            self.assertEqual(g["cave_side"]["portal"], f"Portal_um.{gid}_out")
            self.assertEqual(g["cave_side"]["arrival"], f"Spawn_undermere_mouth_{gid}")
            self.assertTrue(g["cave_area"].startswith("under_"))

    def test_agrees_with_the_network_design(self):
        design = {g["id"]: g for g in read(DESIGN)["gates"]}
        for g in self.d["gates"]:
            dg = design[g["id"]]
            self.assertEqual(g["cave_area"], dg["cave_area"])
            self.assertEqual(g["mouth"], dg["mouth"])
            # a point may depart from the design's only with the design's own point and a reason beside it
            for k in ("portal", "arrival"):
                at = dg["village_side"][k]["at"][:2]
                if "design_xy" in g[k]:
                    self.assertEqual(g[k]["design_xy"], at, (g["id"], k))
                    self.assertTrue(g[k].get("departure"), (g["id"], k))
                else:
                    self.assertEqual(g[k]["xy"], at, (g["id"], k))
            self.assertEqual(g["arrival"]["facing_deg"], dg["village_side"]["arrival"]["facing_deg"])
            self.assertEqual(g["cave_side"]["portal_at"], dg["cave_side"]["portal"]["at"])
            self.assertEqual(g["cave_side"]["arrival_at"], dg["cave_side"]["arrival"]["at"])
            self.assertLessEqual(g["budget_tris"], dg["surface_cost"]["tris"])

    def test_the_cutting_row_is_the_designs(self):
        row = read(DESIGN)["adit_cut"]["terrain_rows"][0]
        mine = {t["key"]: t for t in self.d["terrain"]}["adit_cutting"]
        for k in ("kind", "width_m", "points_m", "clip_m"):
            self.assertEqual(mine[k], row[k])

    def test_arrivals_face_away_from_their_portals(self):
        for g in self.d["gates"]:
            (px, py), (ax, ay) = g["portal"]["xy"], g["arrival"]["xy"]
            th = math.radians(g["arrival"]["facing_deg"])
            away = (ax - px) * math.cos(th) + (ay - py) * math.sin(th)
            self.assertGreater(away, 0.0, g["id"])
            self.assertGreater(math.hypot(ax - px, ay - py), mg.PORTAL_SPAWN_M)

    def test_portal_in_front_of_the_grille(self):
        for g in self.d["gates"]:
            lx, ly = mg.to_local(g, *g["portal"]["xy"])
            self.assertLess(ly, 0.0, g["id"])          # on the village's side of the grille's plane
            self.assertGreater(ly, -1.0, g["id"])      # and within the viewer's 1 m of it
            self.assertLess(abs(lx), g["opening"][0] / 2, g["id"])

    def test_no_banned_words(self):
        bad = dict(self.d)
        bad["note"] = "a gallows here"
        self.assertTrue(any("gallows" in b for b in mg.validate(bad)))

    def test_validate_catches_a_wrong_name(self):
        bad = json.loads(json.dumps(self.d))
        bad["gates"][0]["portal"]["node"] = "Portal_um.swallow_out"
        self.assertTrue(any("Portal_um.swallow_in" in b for b in mg.validate(bad)))


class Frames(unittest.TestCase):
    def test_right_and_in_make_a_right_handed_frame(self):
        for a in (0.0, 90.0, 180.0, -90.0, 37.0):
            _, ex, ey = mg.frame({"mouth": [0, 0, 0], "in_deg": a})
            self.assertAlmostEqual(ex[0] * ey[1] - ex[1] * ey[0], 1.0)

    def test_round_trip(self):
        g = {"mouth": [10.0, -3.0, 2.0], "in_deg": 180.0}
        x, y, z = mg.to_world(g, 0.4, -0.7, 1.0)
        self.assertEqual(z, 3.0)
        lx, ly = mg.to_local(g, x, y)
        self.assertAlmostEqual(lx, 0.4)
        self.assertAlmostEqual(ly, -0.7)

    def test_kit_origin_wins(self):
        o, _, _ = mg.frame({"mouth": [1, 2, 3], "kit_origin": [4, 5, 6], "in_deg": 0})
        self.assertEqual(o, (4.0, 5.0, 6.0))

    def test_spawn_rotation_is_the_exporters(self):
        self.assertAlmostEqual(mg.facing_euler_z(90.0), 0.0)
        self.assertAlmostEqual(mg.facing_euler_z(-90.0), -math.pi)


class Cutting(unittest.TestCase):
    def setUp(self):
        self.row = {t["key"]: t for t in read(GATES)["terrain"]}["adit_cutting"]

    def test_floor_along_the_ramp_and_landing(self):
        f = mg.channel_floor
        self.assertAlmostEqual(f(self.row, 114.8, 4.5), 5.89)
        self.assertAlmostEqual(f(self.row, 121.5, 4.5), 4.1)
        self.assertAlmostEqual(f(self.row, 124.0, 4.5), 4.1)
        self.assertAlmostEqual(f(self.row, 118.15, 4.5), (5.89 + 4.1) / 2, places=6)

    def test_strip_and_clip(self):
        f = mg.channel_floor
        self.assertIsNotNone(f(self.row, 123.0, 3.2))      # the strip's edge (width 2.6)
        self.assertIsNone(f(self.row, 123.0, 3.0))
        self.assertIsNone(f(self.row, 125.5, 4.5))         # past the clip at the grille
        self.assertIsNone(f(self.row, 114.0, 4.5))         # before the cutting's mouth

    def test_the_ramp_is_walkable(self):
        self.assertLessEqual(mg.channel_slope_deg(self.row), 15.0 + 0.1)

    def test_walls_hold_the_grids_steep_cells(self):
        # the render ground's 0.5 m rows at y 3.5 and 5.5 go down, 3.0 and 6.0 stay: the steep cells between lie in
        # the walls (faces 1.0 m from the middle, 0.55 m thick)
        k = {g["id"]: g for g in read(GATES)["gates"]}["adit"]["kit"]
        for y, down in ((3.0, False), (3.5, True), (5.5, True), (6.0, False)):
            self.assertEqual(mg.channel_floor(self.row, 120.0, y) is not None, down, y)
        self.assertLessEqual(4.5 - (k["wall_face"] + k["wall_thick"]), 3.0)
        self.assertGreaterEqual(4.5 + (k["wall_face"] + k["wall_thick"]), 6.0)


if __name__ == "__main__":
    unittest.main()
