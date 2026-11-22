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


class OldRising(unittest.TestCase):
    """The Old Rising's bowl: the trestle's base pressed into a hollow before the steps and made the walk's ground."""

    def setUp(self):
        self.g = {g["id"]: g for g in read(GATES)["gates"]}["rising"]
        self.k = self.g["kit"]

    def test_the_hollow_holds_the_steps_and_its_banks_are_walkable(self):
        p = self.k["press"]
        x0, y0, x1, y1 = p["box_m"]
        st = mg.to_world(self.g, 0.0, self.k["landing"][0] - (self.k["steps"] - 1) * self.k["tread"], 0.0)
        self.assertLess(x0, st[0] - 0.3)                   # a walker's body stands clear before the lowest riser
        self.assertLessEqual(y0, -self.k["landing_half_w"] + 0.5)
        self.assertGreaterEqual(y1, self.k["landing_half_w"] + 0.5)
        self.assertLessEqual(math.degrees(math.atan(p["slope"])), 30.0)
        self.assertEqual(mg.press_cap(p, 9.41, 192.0, 0.5), 9.41 - p["under_ground_m"])
        self.assertAlmostEqual(mg.press_cap(p, 9.41, x0 - 2.0, 0.5), 9.41 - p["under_ground_m"] + 2.0 * p["slope"])
        self.assertAlmostEqual(mg.press_cap(p, 9.41, x0 - 3.0, y1 + 4.0), 9.41 - p["under_ground_m"] + 5.0 * p["slope"])
        self.assertNotIn("fade_m", p)

    def test_the_walk_patch_covers_the_bowl_on_the_collision_grid(self):
        w = self.k["walk_solid"]
        self.assertEqual(w["object"], self.k["press"]["object"])
        x0, y0, x1, y1 = w["patch_m"]
        self.assertTrue(all(float(v).is_integer() for v in w["patch_m"]))
        self.assertTrue(x0 < self.g["arrival"]["xy"][0] < x1 and y0 < self.g["arrival"]["xy"][1] < y1)
        # its east edge under the landing's own box (between its front and the grille): no gap before the steps
        self.assertGreaterEqual(x1, mg.to_world(self.g, 0.0, self.k["landing"][0], 0.0)[0])
        self.assertLessEqual(x1, mg.to_world(self.g, 0.0, 0.0, 0.0)[0])
        self.assertAlmostEqual(((x1 - x0) / w["step_m"]) % 1.0, 0.0)
        self.assertAlmostEqual(((y1 - y0) / w["step_m"]) % 1.0, 0.0)
        self.assertGreaterEqual(w["head_m"], 1.75)        # the walking body's height

    def test_the_arrival_stands_in_the_patch_facing_the_ravine(self):
        a = self.g["arrival"]
        self.assertEqual(a["facing_deg"], 180.0)          # due west, down the ravine
        self.assertLess(a["xy"][0], self.k["press"]["box_m"][0])


class Ease(unittest.TestCase):
    def grid(self, f, n=6):
        return {(i, j): f(i, j) for i in range(n + 1) for j in range(n + 1)}

    def test_a_bump_is_eased_by_at_most_ease(self):
        H = self.grid(lambda i, j: 10.0 + (0.4 if (i, j) == (3, 3) else 0.0))
        E = mg.ease_heights(H, 6, 6, 2, 0.3, 0.6)
        self.assertGreaterEqual(E[(3, 3)], 10.4 - 0.3 - 1e-9)
        self.assertLess(E[(3, 3)], 10.4)
        self.assertTrue(all(abs(E[k] - H[k]) <= 0.3 + 1e-9 for k in H))

    def test_a_wall_stays_and_its_neighbours_ignore_it(self):
        H = self.grid(lambda i, j: 10.0 + (3.0 if (i, j) == (3, 3) else 0.0))
        E = mg.ease_heights(H, 6, 6, 2, 0.3, 0.6)
        self.assertEqual(E[(3, 3)], 13.0)
        self.assertAlmostEqual(E[(2, 3)], 10.0)

    def test_the_edge_stays(self):
        H = self.grid(lambda i, j: 10.0 + 0.2 * ((i * 7 + j * 3) % 3))
        E = mg.ease_heights(H, 6, 6, 3, 0.3, 0.6)
        for k in H:
            if k[0] in (0, 6) or k[1] in (0, 6):
                self.assertEqual(E[k], H[k])

    def test_no_passes_change_nothing(self):
        H = self.grid(lambda i, j: 10.0 + 0.1 * i)
        self.assertEqual(mg.ease_heights(H, 6, 6, 0, 0.3, 0.6), H)


class Field(unittest.TestCase):
    """The walk heightfield's pieces over the Old Rising's bowl (walk_solid_patch), without Blender."""

    def test_a_timber_at_the_chest_blocks_the_column(self):
        # the snow sheet 9.72 to 9.86 over the floor at 9.41, a timber 11.09 to 11.26 over it (measured at 183, -2)
        ev = [(9.72, -1), (9.86, 1), (11.09, -1), (11.26, 1)]
        self.assertEqual(mg.column_level(ev, 9.41, 0.4, 1.8), (9.86, True))

    def test_a_stone_at_the_shin_is_stepped_onto_and_a_high_beam_is_walked_under(self):
        ev = [(9.72, -1), (9.86, 1), (10.1, -1), (10.4, 1), (12.4, -1), (12.6, 1)]
        self.assertEqual(mg.column_level(ev, 9.41, 0.4, 1.8), (10.4, False))
        self.assertEqual(mg.column_level([], 9.41, 0.4, 1.8), (9.41, False))

    def test_what_lies_under_the_ground_only_counts_for_the_inside(self):
        # a block whose underside is under the ground: the walker stands on its top
        self.assertEqual(mg.column_level([(9.0, -1), (10.0, 1)], 9.41, 0.4, 1.8), (10.0, False))

    def test_the_field_is_its_triangles(self):
        H = {(i, j): 10.0 + 0.5 * i + 0.25 * j for i in range(3) for j in range(3)}
        z, tri = mg.hf_tri(H, 2, 2, 0.0, 0.0, 0.5, 0.3, 0.6)
        self.assertAlmostEqual(z, 10.0 + 0.5 * 0.6 + 0.25 * 1.2)   # a plane stays the plane
        self.assertEqual(len(tri), 3)
        H[(1, 1)] = 14.0
        z, tri = mg.hf_tri(H, 2, 2, 0.0, 0.0, 0.5, 0.45, 0.45)
        self.assertIn((1, 1), tri)                                    # the nearest corner is in its triangle
        self.assertAlmostEqual(mg.hf_tri(H, 2, 2, 0.0, 0.0, 0.5, 0.5, 0.5)[0], 14.0)

    def test_the_feet_step_up_within_the_step_height(self):
        self.assertAlmostEqual(mg.hf_feet(lambda x, y: 10.0 + (0.3 if x > 0.1 else 0.0), 0.0, 0.0, 0.35, 0.3), 10.3)
        self.assertAlmostEqual(mg.hf_feet(lambda x, y: 10.0 + (0.5 if x > 0.1 else 0.0), 0.0, 0.0, 0.35, 0.3), 10.0)

    def test_walls_are_vertical_and_only_on_the_outside(self):
        H = {(i, j): 10.0 for i in range(5) for j in range(5)}
        one = mg.wall_faces({(2, 2)}, H, 4, 4, 0.0, 0.0, 0.5, 3.0)
        self.assertEqual(len(one), 4)
        for q in one:
            self.assertEqual({(p[0], p[1]) for p in q[:2]}, {(p[0], p[1]) for p in q[2:]})   # vertical
            self.assertEqual(sorted({p[2] for p in q}), [9.7, 13.0])
        self.assertEqual(len(mg.wall_faces({(2, 2), (2, 3)}, H, 4, 4, 0.0, 0.0, 0.5, 3.0)), 6)

    def test_a_point_over_its_neighbourhood_rises(self):
        H = {(i, j): 10.0 + (0.7 if (i, j) == (2, 2) else 0.0) for i in range(5) for j in range(5)}
        self.assertEqual(mg.rises(H, 4, 4, 0.6), {(2, 2)})
        self.assertEqual(mg.rises(H, 4, 4, 0.8), set())

    def test_the_guard_matches_the_viewers_walker(self):
        w = [x for x in mg.load_gates(GATES)["gates"] if x["id"] == "rising"][0]["kit"]["walk_solid"]
        gd = w["guard"]
        self.assertEqual((gd["step_height_m"], gd["body_radius_m"]), (0.35, 0.3))   # apps/walk/src/config.ts WALK
        self.assertGreaterEqual(gd["to_m"], 1.75)                                    # the capsule's top
        self.assertLessEqual(gd["from_m"], 0.45)                                      # the body check's lowest ray
        self.assertGreaterEqual(gd["radius_m"], 0.2)
        self.assertLessEqual(gd["grid_m"], 0.125)
        self.assertGreater(w["over_m"], w["low_m"] + 1.75)


if __name__ == "__main__":
    unittest.main()
