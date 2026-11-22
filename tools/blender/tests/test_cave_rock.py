"""Tests of the cave's rock (meshy_cave_rock.py): the wall detail in the shell's field only (bedding ledges along each
geology's dip, scallops, joints, the rubble edge), the formations' meshes (closed, wound outward), and the decor on
the Great Gallery: every kind made, hanging things clear of the walker's head, collision for anything taller than
a step, nothing on a route, in a zone or by a seam, the same pieces on every run. numpy only; no Blender."""

import os
import sys
import unittest
import warnings

BLENDER = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
UNDERMERE = os.path.join(BLENDER, "meshy_caves", "undermere")
EXAMPLE = os.path.join(BLENDER, "meshy_caves", "example_section.json")
sys.path.insert(0, BLENDER)

try:
    import numpy as np
    import meshy_cave_core as core
    import meshy_cave_rock as rock
except ImportError:  # no numpy here
    np = core = rock = None


def quiet(*_a):
    pass


def closed_outward(V, F):
    """(every edge shared by exactly two faces in opposite directions, signed volume)"""
    E = {}
    for a, b, c in F:
        for u, v in ((a, b), (b, c), (c, a)):
            E[(int(u), int(v))] = E.get((int(u), int(v)), 0) + 1
    ok = all(n == 1 and E.get((v, u), 0) == 1 for (u, v), n in E.items())
    a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    vol = float(np.einsum("ij,ij->i", a, np.cross(b, c)).sum() / 6.0)
    return ok, vol


class Pts:
    """A stand-in for the core's Ctx."""

    def __init__(self, X, Y, Z, collision=False, walls=None, seed=1):
        self.X, self.Y, self.Z = X, Y, Z
        self.n = np.zeros(np.broadcast(X, Y, Z).shape)
        self.nb = np.zeros_like(self.n)
        self.collision = collision
        self.walls = collision if walls is None else walls
        self.seed = seed
        self._scal = None


@unittest.skipIf(rock is None, "numpy is not installed")
class RockDetailTest(unittest.TestCase):
    def setUp(self):
        warnings.simplefilter("ignore", RuntimeWarning)
        rng = np.random.default_rng(5)
        self.X, self.Y, self.Z = (rng.uniform(-20, 20, 4000) for _ in range(3))

    def test_detail_only_in_the_shells_field(self):
        rk = rock.profile("limestone")
        v = np.linspace(0.0, 4.0, len(self.X))
        for coll, walls in ((True, True), (True, False)):
            c = Pts(self.X, self.Y, self.Z, coll, walls)
            self.assertEqual(rock.detail(c, v, rk, [0.6, 0.04]), 0.0)
            self.assertEqual(rock.rubble(c, np.zeros(len(v)), rk), 0.0)
        c = Pts(self.X, self.Y, self.Z)
        D = rock.detail(c, v, rk, [0.6, 0.04])
        self.assertGreater(float(np.abs(D).max()), 0.05)

    def test_lower_wall_detail_only_takes_rock_away(self):
        rk = rock.profile("slate")
        v = np.linspace(-0.5, 4.0, len(self.X))
        D = rock.detail(Pts(self.X, self.Y, self.Z), v, rk, [0.25, 0.03])
        self.assertTrue(np.all(D[v < rock.LOW[0]] >= 0.0))  # the walker, held by the smooth wall, meets no rock
        self.assertTrue((D[v > sum(rock.LOW)] < 0.0).any())  # higher up the beds stand out

    def test_ledges_follow_the_dip(self):
        dip = [0.35, 0.12]
        a = rock.ledges(self.X, self.Y, self.Z, 0.5, dip, 0.0)
        b = rock.ledges(self.X + 1.0, self.Y, self.Z + dip[0], 0.5, dip, 0.0)
        c = rock.ledges(self.X, self.Y + 2.0, self.Z + 2.0 * dip[1], 0.5, dip, 0.0)
        self.assertTrue(np.allclose(a, b, atol=1e-6) and np.allclose(a, c, atol=1e-6))
        self.assertTrue(a.min() >= -1.0 - 1e-9 and a.max() <= 1.0 + 1e-9)
        z = np.linspace(0.0, 0.5, 2001)
        p = rock.ledges(np.zeros_like(z), np.zeros_like(z), z, 0.5, [0.0, 0.0], 0.0)
        steep = np.abs(np.diff(p)) / np.diff(z)
        self.assertGreater(float(steep.max()), 5.0 * float(np.median(steep)))  # a sharp step under each bed

    def test_scallops_dimpled_with_ridges_and_the_same_on_blocks_and_points(self):
        X = (np.arange(33) * 0.125 - 40.0)[None, None, :]
        Y = (np.arange(33) * 0.125 + 3.0)[None, :, None]
        Z = (np.arange(33) * 0.125 - 17.0)[:, None, None]
        s = rock.scallops(X, Y, Z, 7)
        P = np.stack(np.broadcast_arrays(X, Y, Z), -1).reshape(-1, 3)
        self.assertTrue(np.array_equal(s.ravel(), rock.scallops(P[:, 0], P[:, 1], P[:, 2], 7)))
        self.assertGreater(float(s.max()), 0.9)
        self.assertEqual(float(s.min()), 0.0)
        self.assertGreater(float((s == 0).mean()), 0.05)

    def test_joints_groove_on_their_planes(self):
        x = np.linspace(-10, 10, 4001)
        j = rock.joints(x, np.full_like(x, 2.55), [1.0, 0.0], 3.0, 0.0)  # midway between the second set's planes
        self.assertAlmostEqual(float(j[np.argmin(np.abs(x - 3.0))]), 1.0, places=6)
        self.assertAlmostEqual(float(j[np.argmin(np.abs(x - 1.5))]), 0.0, places=6)
        self.assertTrue(j.min() >= 0.0 and j.max() <= 1.0)

    def test_rubble_low_and_only_at_the_walls_foot(self):
        rk = rock.profile("breakdown")
        wall = np.linspace(-0.5, 2.0, 500)
        c = Pts(np.zeros(500), np.zeros(500), np.zeros(500))
        c.n = np.ones(500)
        h = rock.rubble(c, wall, rk)
        self.assertLessEqual(float(h.max()), rock.RUBBLE_MAX + 1e-12)
        self.assertTrue(np.all(h[wall >= rock.RUBBLE_REACH] == 0.0))
        self.assertGreater(float(h[wall < 0.1].min()), 0.15)
        self.assertLess(rock.RUBBLE_MAX, core.STEP)

    def test_every_geology_has_its_rock(self):
        net = core.load_json(os.path.join(UNDERMERE, "undermere.network.json"))
        for name in net["geology"]:
            self.assertIn(name, rock.ROCK, name)
            for k in rock.ROCK[name]["decor"]:
                self.assertIn(k, rock.DECOR_KINDS)
        self.assertGreater(rock.ROCK["limestone"]["scallop"], 0)
        self.assertEqual(rock.ROCK["granite"]["scallop"], 0)
        self.assertGreater(rock.ROCK["ice"]["decor"]["icicle"], 0)
        self.assertNotIn("stalactite", rock.ROCK["ice"]["decor"])
        self.assertGreater(rock.ROCK["skarn"]["decor"]["crystal"], 0)
        self.assertGreater(rock.ROCK["slate"]["dip"][0], rock.ROCK["lakeclay"]["dip"][0])  # slate's beds dip steeply
        over = rock.profile("limestone", {"rock": {"ledge": 0.0, "decor": {"curtain": 3.0}}})
        self.assertEqual(over["ledge"], 0.0)
        self.assertEqual(over["decor"]["curtain"], 3.0)
        self.assertEqual(over["decor"]["stalactite"], 1.0)
        self.assertEqual(rock.ROCK["limestone"]["decor"]["curtain"], 1.0)  # the table itself is untouched

    def test_a_narrow_place_in_a_poor_rock_has_small_formations(self):
        # the Spar Maze's and the Killas Rift's slate and skarn weigh a tenth of limestone's in stalagmites: a spot
        # within NARROW_WALL of a wall in such a rock is given the least weight NARROW_MIN, and only for the kinds the
        # rock is poor in (under NARROW_POOR); limestone, rich in all of them, is untouched
        for name in ("slate", "skarn", "granite", "breakdown", "gypsum"):
            w = rock.ROCK[name]["decor"]
            poor = {k: v for k, v in rock.NARROW_MIN.items() if w.get(k, 0.0) < rock.NARROW_POOR}
            self.assertIn("stalagmite", poor, name)
        rich = rock.ROCK["limestone"]["decor"]
        self.assertEqual({k for k in rock.NARROW_MIN if rich.get(k, 0.0) < rock.NARROW_POOR}, set())
        # the small ones keep to the step-free height and a clear core: a snug item leaves 0.1 m
        self.assertLess(rock.SNUG_KEEP, 0.25)
        self.assertLessEqual(rock.NARROW_WALL, 1.5)

    def test_decor_switch_and_rock_overrides_validate(self):
        ex = core.load_json(EXAMPLE)
        ex["decor"] = False
        ex["network"]["geology"]["limestone"]["rock"] = {"ledge": 0.0, "decor": {"curtain": 2.0}}
        errs, _w = core.validate(ex, ex["network"])
        self.assertEqual(errs, [])
        ex["network"]["geology"]["limestone"]["rock"] = {"ledges": 0.1}
        errs, _w = core.validate(ex, ex["network"])
        self.assertTrue(errs)

    def test_formation_meshes_closed_and_wound_outward(self):
        R = core.Rng(1, "t")
        turn = R.turn()
        meshes = {
            "stalactite": rock.stalactite(0, 0, 5.0, 1.4, 0.2, turn, R),
            "straw": rock.stalactite(0, 0, 5.0, 0.2, 0.008, turn, R),
            "icicle": rock.stalactite(0, 0, 5.0, 0.6, 0.05, turn, R, icicle=True),
            "stalagmite": rock.stalagmite(0, 0, 0.0, 1.2, 0.3, turn, R),
            "small stalagmite": rock.stalagmite(0, 0, 0.0, 0.2, 0.06, turn, R),
            "column": rock.column(0, 0, 0.0, 3.0, 0.4, turn, R),
            "block": rock.block(0, 0, 0.0, 1.2, 0.9, 0.7, turn, R, core.TC_V, core.TC_F)[:2],
            "crystal": rock.crystal((0, 0, 0), (0.3, -0.2, 1.0), 0.25, 0.03),
            "rim": rock.rim(0, 0, rock.circle(14), [0.8] * 14, [0.0] * 14, 0.1, 0.06),
        }
        s = np.linspace(-1.0, 1.0, 9)
        P = np.stack([s, 0.05 * (4.0 * ((s / 0.3) % 1.0) * (1.0 - (s / 0.3) % 1.0) - 0.67)], 1)
        meshes["curtain"] = rock.curtain(P, np.tile([0.0, 1.0], (9, 1)), np.full(9, 5.3), np.full(9, 4.2))
        for name, (V, F) in meshes.items():
            ok, vol = closed_outward(V, np.asarray(F))
            self.assertTrue(ok, name)
            self.assertGreater(vol, 0.0, name)

    def test_hanging_things_end_where_drawn(self):
        R = core.Rng(2, "t")
        V, _ = rock.stalactite(1.0, 2.0, 5.0, 1.1, 0.15, R.turn(), R)
        self.assertAlmostEqual(float(V[:, 2].min()), 5.0 - 1.1, places=9)
        self.assertAlmostEqual(float(V[:, 2].max()), 5.3, places=9)  # 0.3 m into the roof
        V, _ = rock.stalagmite(1.0, 2.0, 0.0, 0.8, 0.2, R.turn(), R)
        self.assertAlmostEqual(float(V[:, 2].max()), 0.8, places=9)
        self.assertAlmostEqual(float(V[:, 2].min()), -0.25, places=9)


@unittest.skipIf(rock is None, "numpy is not installed")
class DecorTest(unittest.TestCase):
    """The decor on the Great Gallery (a big limestone trunk, a pit, a drop, a crawl, two seams)."""

    @classmethod
    def setUpClass(cls):
        warnings.simplefilter("ignore", RuntimeWarning)
        cls.sec, _w = core.load_section(os.path.join(UNDERMERE, "gallery.json"))
        cls.m = core.mesh_section(cls.sec, log=quiet)
        cls.zones = core.make_zones(cls.sec)
        cls.guards = core.guard_segments(cls.sec)
        cls.grid = core.build_grid(cls.sec, cls.m["T"], cls.m["NV"])
        cls.out = rock.decor(cls.sec, cls.grid, cls.zones, cls.guards, core)
        cls.cols = rock.Cols(cls.grid)

    def test_every_kind_of_the_limestone_made(self):
        made = self.out[3]["made"]
        for k in ("stalactite", "straw", "stalagmite", "column", "curtain", "rimstone", "block", "rock"):
            self.assertGreater(made[k], 0, k)
        self.assertEqual(made["icicle"], 0)
        self.assertEqual(made["crystal"], 0)

    def test_sizes_from_straws_to_large(self):
        lengths = [float(V[:, 2].max() - V[:, 2].min()) - 0.3 for V, F, tag, g in self.out[0]
                   if tag in (rock.TAG["stalactite"], rock.TAG["straw"])]
        self.assertLess(min(lengths), 0.15)
        self.assertGreater(max(lengths), 1.0)

    def test_hanging_things_clear_of_the_head(self):
        hang = (rock.TAG["stalactite"], rock.TAG["straw"], rock.TAG["curtain"], rock.TAG["icicle"])
        n = 0
        for V, F, tag, g in self.out[0]:
            if tag not in hang:
                continue
            low = V[np.argmin(V[:, 2])]
            f, _ = self.cols.interval(low[0], low[1], low[2] - 0.05)
            if np.isfinite(f[0]):
                self.assertGreaterEqual(low[2] - f[0], rock.DECOR_HEAD - 0.05)
                n += 1
        self.assertGreater(n, 50)

    def test_collision_for_anything_you_could_bump(self):
        pieces, prox, solids, rep = self.out
        floor_tags = (rock.TAG["stalagmite"], rock.TAG["column"], rock.TAG["block"], rock.TAG["rock"],
                      rock.TAG["rimstone"], rock.TAG["crystal"])
        tall = 0
        for V, F, tag, g in pieces:
            if tag not in floor_tags:
                continue
            c = V.mean(0)
            f, _ = self.cols.interval(c[0], c[1], V[:, 2].min() + 0.45)
            base = f[0] if np.isfinite(f[0]) else V[:, 2].min() + 0.25
            h = float(V[:, 2].max() - base)
            if h <= rock.STEP_FREE + 0.02:
                continue
            tall += 1
            self.assertIn(tag, (rock.TAG["stalagmite"], rock.TAG["column"], rock.TAG["block"]))
            self.assertGreaterEqual(h, rock.COLLIDE_MIN - 0.25)
            hit = [s for s in solids if (s[1] - c[0]) ** 2 + (s[2] - c[1]) ** 2 < 0.04]
            self.assertTrue(hit, f"no solid under the {tag} at {c}")
            self.assertTrue(all(s[-1] - s[-2] >= rock.SOLID_TOP for s in hit if s[0] != "disk" or h < 2.0))
        self.assertGreater(tall, 5)
        self.assertEqual(rep["collide"], len(prox))
        self.assertLess(sum(len(F) for V, F, t in prox), 8000)

    def test_nothing_by_a_seam_in_a_zone_or_on_a_route(self):
        walk = [p for p in self.sec.prims if isinstance(p, core.Passage) and p.walk and p.profile in core.WALK_PROFILES]
        floor_tags = (rock.TAG["stalagmite"], rock.TAG["column"], rock.TAG["block"], rock.TAG["rock"],
                      rock.TAG["rimstone"], rock.TAG["crystal"])
        for V, F, tag, g in self.out[0]:
            for sm, ax, at, plus in self.sec.seam_boxes:
                self.assertTrue(np.all(np.abs(V[:, ax] - at) >= 0.5), sm["id"])
            for zn in self.zones:
                self.assertFalse(zn.contains(V[:, 0], V[:, 1], V[:, 2]).any(), zn.id)
            if tag not in floor_tags:
                continue
            up = V[V[:, 2] > V[:, 2].min() + 0.3]
            for p in walk:
                if len(up):
                    c = core.Ctx(up[:, 0], up[:, 1], up[:, 2], np.zeros(len(up)), np.zeros(len(up)))
                    self.assertFalse((p.core_eval(c) > 0.02).any(), f"{tag} in the clear core of {p.id}")

    def test_the_same_pieces_on_every_run(self):
        again = rock.decor(self.sec, self.grid, self.zones, self.guards, core)
        self.assertEqual(len(again[0]), len(self.out[0]))
        for (V1, F1, t1, g1), (V2, F2, t2, g2) in zip(self.out[0], again[0]):
            self.assertTrue(np.array_equal(V1, V2) and np.array_equal(F1, F2) and t1 == t2 and g1 == g2)
        self.assertEqual(again[2], self.out[2])

    def test_all_the_pieces_closed(self):
        for V, F, tag, g in self.out[0][:600]:
            if tag == rock.TAG["pool"]:  # a pool's water is a sheet, seen from above
                continue
            ok, vol = closed_outward(V, F)
            self.assertTrue(ok, tag)
            self.assertGreater(vol, 0.0, tag)


if __name__ == "__main__":
    unittest.main()
