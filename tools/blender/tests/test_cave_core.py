"""Tests of the cave geometry core (meshy_cave_core.py) on its example section (meshy_caves/example_section.json):
validation, a closed shell, repeatable geometry, exact floors, clearance per profile, the traversal zones, the walk
flood (everything reached, no traps, crawl, sidle and climb mandatory where designed), a seam meshed identically by
two neighbouring sections, and the budgets. numpy only; no Blender."""

import copy
import json
import math
import os
import shutil
import sys
import tempfile
import unittest
import warnings

BLENDER = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
EXAMPLE = os.path.join(BLENDER, "meshy_caves", "example_section.json")
sys.path.insert(0, BLENDER)

try:
    import numpy as np
    import meshy_cave_core as core
except ImportError:  # no numpy here
    np = core = None


def quiet(*_a):
    pass


def neighbour_b():
    """A small section north of the example's seam: the tube on to a room."""
    return {
        "format": "cave-section/1", "key": "example_b", "network": "network.json", "geology": "limestone",
        "region": {"boxes": [[20, 30, -20, 30, 40, -4]]},
        "nodes": {"s": [24.5, 30.0, -14.0], "e": [24.5, 36.0, -14.0]},
        "passages": [{"id": "north_tube", "from": "s", "to": "e", "profile": "tube", "width": 2.0, "clear": 2.4,
                      "floor": {"kind": "flat"}}],
        "chambers": [{"id": "north_room", "kind": "hall", "center": [24.5, 37.0, -14.0], "size": [4.0, 3.0, 2.6]}],
        "spawns": [{"id": "north_room", "at": [24.5, 37.0, -14.0]}],
        "seams": [{"id": "north", "neighbour": "example", "side": "b", "plane": {"axis": "y", "at": 30.0, "toward": "-"},
                   "window": [22.5, -14.5, 26.5, -11.0], "portal": [24.5, 30.45, -14.0],
                   "arrival": {"at": [24.5, 32.1, -14.0], "mode": "walk"}}],
    }


def seam_pair(profile):
    """Two small sections joined by a seam at x = 20 that sits inside a crawl or a fissure: each holds a room, a
    tube on to the crawl or fissure, and its half of it. Returns (network, section a, section b)."""
    net = {"format": "cave-network/1", "scene": "undermere", "name": "seam pair", "area_prefix": "under_",
           "lattice": {"origin": [-128, -64, -96], "cell": 0.125, "block": 32}, "seed": 77,
           "geology": {"limestone": {"tint": "#9A958A", "repeat_m": 1.5, "noise": 0.12, "bedding": [0.6, 0.04]}},
           "sections": ["sa", "sb"]}
    w, h, mode = (1.2, 1.1, "crawl") if profile == "crawl" else (0.48, 2.3, "sidle")

    def section(key, x0, x1, xin, room_x, toward):
        sgn = 1 if toward == "+" else -1
        return {
            "format": "cave-section/1", "key": key, "network": "network.json", "geology": "limestone",
            "region": {"boxes": [[x0, 0, -16, x1, 20, -2]]},
            "nodes": {"r": [room_x, 10.0, -10.0], "a": [xin, 10.0, -10.0], "s": [20.0, 10.0, -10.0]},
            "passages": [{"id": f"{key}_p", "from": "a", "to": "s", "profile": profile, "width": w, "clear": h,
                          "floor": {"kind": "flat"}},
                         {"id": f"{key}_link", "from": "r", "to": "a", "profile": "tube", "width": 2.2, "clear": 2.6,
                          "floor": {"kind": "flat"}}],
            "chambers": [{"id": f"{key}_room", "kind": "hall", "center": [room_x, 10.0, -10.0],
                          "size": [5.0, 5.0, 3.0]}],
            "spawns": [{"id": f"{key}_sp", "at": [room_x, 10.0, -10.0]}],
            "seams": [{"id": "ab", "neighbour": "sb" if key == "sa" else "sa", "side": "a" if key == "sa" else "b",
                       "plane": {"axis": "x", "at": 20.0, "toward": toward}, "window": [8.0, -10.5, 12.0, -7.2],
                       "portal": [20.0 - sgn * 0.45, 10.0, -10.0],
                       "arrival": {"at": [20.0 - sgn * 1.6, 10.0, -10.0], "mode": mode}}]}

    return net, section("sa", 0, 20, 14.0, 8.0, "+"), section("sb", 20, 40, 26.0, 32.0, "-")


class Crack(core.Prim if core else object):
    """A straight slot `width` wide and 1.5 m deep across the example hall's floor (a test-only primitive)."""
    cls, blend, walk, core = 1, 0.0, False, None

    def __init__(self, sec_key, width, cx=25.5, cy=10.0):
        self.id, self.sec, self.width, self.cx, self.cy = "zz_crack", sec_key, width, cx, cy
        self.key = (1, sec_key, self.id)
        self.box = (cx - 3, cy - 3, -17, cx + 3, cy + 3, -13)

    def eval(self, c):
        dx, dy = c.X - self.cx, c.Y - self.cy
        f = np.minimum(np.minimum(0.5 * self.width - np.abs(dx), 1.5 - np.abs(dy)),
                       np.minimum(c.Z + 15.5, -13.8 - c.Z))
        return f, c.Z + 15.5

    def designed(self, x, y, z):
        return np.zeros(len(x), bool)


@unittest.skipIf(core is None, "numpy is not installed")
class CaveCoreTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        warnings.simplefilter("ignore", RuntimeWarning)
        cls.tmp = tempfile.mkdtemp(prefix="cave_core_")
        cls.ex = core.load_json(EXAMPLE)
        cls.r = core.build(EXAMPLE, cls.tmp, log=quiet)
        cls.rep = cls.r["report"]

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def write(self, name, obj):
        path = os.path.join(self.tmp, name)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(obj, fh)
        return path

    # ---- input

    def test_example_validates(self):
        errs, _ = core.validate(self.ex, self.ex["network"])
        self.assertEqual(errs, [])

    def test_rules_refuse_bad_profiles(self):
        def errors(mutate):
            d = copy.deepcopy(self.ex)
            mutate(d)
            return core.validate(d, d["network"])[0]

        def passage(d, pid):
            return next(p for p in d["passages"] if p["id"] == pid)

        self.assertTrue(errors(lambda d: passage(d, "crawl_north").update(clear=1.5)))  # crawl 1.0 to 1.3 m
        self.assertTrue(errors(lambda d: passage(d, "fissure_east").update(width=0.7)))  # fissure 0.42 to 0.55 m
        self.assertTrue(errors(lambda d: passage(d, "fissure_east").update(clear=1.6)))  # fissure at least 1.9 m
        self.assertTrue(errors(lambda d: passage(d, "tube_ramp").update(width=0.7)))  # walking core 0.8 x 2.1
        self.assertTrue(errors(lambda d: passage(d, "tube_ramp").update(clear=2.0)))
        self.assertTrue(errors(lambda d: d["nodes"].update(climb_top=[30.0, 17.3, -13.5])))  # a 0.5 m climb
        self.assertTrue(errors(lambda d: passage(d, "ledge_climb").update(ledge_depth=0.6)))
        self.assertTrue(errors(lambda d: passage(d, "ledge_climb").update(batter=0.3)))  # under 82 degrees
        self.assertTrue(errors(lambda d: passage(d, "tube_stairs").update(floor={"kind": "stairs", "riser": 0.4,
                                                                                  "tread": 0.3})))
        self.assertTrue(errors(lambda d: d["region"]["boxes"][0].__setitem__(0, 0.06)))  # off the lattice
        self.assertTrue(errors(lambda d: d["passages"][0].update(profile="slide")))  # schema enum
        # a fissure turns at most 60 degrees at a bend (the viewer slides a sidler round a gentler one only)
        sharp = [[35.5, 8.0, -14.0], [35.5, 10.0, -14.0], [37.5, 10.0, -14.0], [37.5, 8.0, -14.0]]
        self.assertTrue(errors(lambda d: passage(d, "fissure_east").update(via=sharp)))
        gentle = [[35.0, 8.0, -14.0], [35.5, 8.866, -14.0], [37.0, 8.866, -14.0], [37.5, 8.0, -14.0]]  # 60 degrees
        self.assertEqual(errors(lambda d: passage(d, "fissure_east").update(via=gentle)), [])

        # two bends of 45 degrees close together are a right angle to the viewer's sidler: refused 0.2 m apart,
        # accepted 0.6 m apart
        def zigzag(leg):
            a = leg / math.sqrt(2)
            return [[35.5, 8.0, -14.0], [35.5 + a, 8.0 + a, -14.0], [35.5 + a, 9.5, -14.0], [35.5 + 2 * a, 9.5 + a, -14.0],
                    [37.5, 9.5 + a, -14.0], [37.5 + a, 9.5, -14.0], [37.5 + a, 8.0 + a, -14.0], [37.5 + 2 * a, 8.0, -14.0]]

        errs = errors(lambda d: passage(d, "fissure_east").update(via=zigzag(0.2)))
        self.assertTrue(any("segments 0 and 2" in e for e in errs), errs)
        self.assertEqual(errors(lambda d: passage(d, "fissure_east").update(via=zigzag(0.6))), [])
        # a second fissure crossing the first: the sidler keeps its own fissure's zone and cannot turn
        cross = {"id": "fiss_ns", "from": [37.0, 5.3, -14.0], "to": [37.0, 10.7, -14.0], "profile": "fissure",
                 "width": 0.46, "clear": 2.4, "floor": {"kind": "flat"}}
        errs = errors(lambda d: d["passages"].append(cross))
        self.assertTrue(any("two fissures overlap" in e for e in errs), errs)
        # a seam window lower than the passage that crosses it (the shell would open outside the opening)
        errs = errors(lambda d: d["seams"][0].update(window=[22.5, -14.5, 26.5, -11.8]))
        self.assertTrue(any("does not fit the window" in e for e in errs), errs)

    def test_bad_input_is_a_clean_error(self):
        broken = os.path.join(self.tmp, "broken.json")
        with open(broken, "w", encoding="utf-8") as fh:
            fh.write('{"format": ')
        for path in (broken, os.path.join(self.tmp, "missing.json"), self.write("array.json", [1, 2])):
            with self.assertRaises(core.CaveError):
                core.load_section(path)
        d = copy.deepcopy(self.ex)
        d["nodes"]["west_end"][0] = float("nan")
        self.assertTrue(core.validate(d, d["network"])[0])
        d = copy.deepcopy(self.ex)
        d["chambers"][0]["axis"] = [0, 0]
        self.assertTrue(core.validate(d, d["network"])[0])
        deep = os.path.join(self.tmp, "deep.json")
        with open(deep, "w", encoding="utf-8") as fh:
            fh.write("[" * 100000 + "]" * 100000)
        with self.assertRaises(core.CaveError):
            core.load_section(deep)

        def refused(mutate):
            d = copy.deepcopy(self.ex)
            mutate(d)
            return core.validate(d, d["network"])[0]

        self.assertTrue(refused(lambda d: d["network"]["geology"]["limestone"].update(bedding=[0, 0.04])))
        self.assertTrue(refused(lambda d: d["nodes"]["west_end"].__setitem__(0, 1e300)))
        self.assertTrue(refused(lambda d: d.update(geology="granite")))  # not in the network
        self.assertTrue(refused(lambda d: d["passages"][0].update(geology="granite")))
        self.assertTrue(refused(lambda d: d["seams"][0].update(neighbour=d["key"])))  # a seam to itself

    def test_rock_between_passages_not_joined(self):
        def errors(rock, joins=None):
            d = copy.deepcopy(self.ex)
            y = 5.0 + 1.3 + rock + 1.3  # beside tube_ramp (2.6 m wide on y = 5), the same width
            d["nodes"].update(side_w=[3.0, y, -16.0], side_e=[12.0, y, -16.0])
            d["passages"].append({"id": "side", "from": "side_w", "to": "side_e", "profile": "tube", "width": 2.6,
                                  "clear": 2.8, "floor": {"kind": "flat"}})
            if joins:
                d["joins"] = joins
            self.assertEqual(core.validate(d, d["network"])[0], [])
            return core.separation(core.Section(d, d["network"], BLENDER), log=quiet)[0]

        self.assertTrue(errors(0.46))  # under 0.6 m of rock
        self.assertEqual(errors(1.0), [])
        self.assertEqual(errors(0.46, [["side", "tube_ramp"]]), [])  # declared as joined
        self.assertEqual(core.separation(self.r["sec"], log=quiet)[0], [])

    def test_rock_beside_a_mouth_and_in_a_shared_chamber(self):
        def errors(extra):
            d = copy.deepcopy(self.ex)
            d["passages"].append(extra)
            self.assertEqual(core.validate(d, d["network"])[0], [])
            return core.separation(core.Section(d, d["network"], BLENDER), log=quiet)[0]

        # joined to the hall at one end, then running beside its south wall behind a thin wall: refused there
        hugger = {"id": "hugger", "from": [24.0, 7.0, -14.0], "via": [[24.0, 2.7, -14.0]], "to": [33.0, 2.7, -14.0],
                  "profile": "tube", "width": 2.0, "clear": 2.4, "floor": {"kind": "flat"}}
        errs = errors(hugger)
        self.assertTrue(any("hall and hugger are joined" in e for e in errs), errs)
        # a tube from the hall into the crawl's pocket, beside the seam tube that also opens there: their air meets
        # only in the pocket, which both open into
        bypass = {"id": "bypass", "from": [22.5, 11.0, -14.0], "via": [[20.0, 12.0, -14.0], [20.0, 21.0, -14.0]],
                  "to": [22.6, 21.25, -14.0], "profile": "tube", "width": 2.0, "clear": 2.4, "floor": {"kind": "flat"}}
        self.assertEqual(errors(bypass), [])

    def test_arrival_mode_must_match_zones(self):
        d = copy.deepcopy(self.ex)
        d["seams"][0]["arrival"]["mode"] = "crawl"  # the arrival stands in the tube, not in the crawl
        with self.assertRaises(core.CaveError):
            core.build(self.write("bad_arrival.json", d), None, write=False, flood=False, log=quiet)

    def test_arrivals_in_a_mode_where_its_zone_is(self):
        sec, zones = self.r["sec"], self.r["zones"]

        def errs(at, mode):
            d = copy.deepcopy(sec.d)
            d["seams"][0]["arrival"] = {"at": at, "mode": mode}
            sec.d, keep = d, sec.d
            try:
                return core.arrival_errors(sec, zones)
            finally:
                sec.d = keep

        self.assertEqual(errs([24.5, 16.0, -14.0], "crawl"), [])  # inside the crawl
        self.assertEqual(errs([36.0, 8.0, -14.0], "sidle"), [])  # inside the fissure
        self.assertEqual(errs([30.0, 14.0, -12.5], "climb"), [])  # hanging on the face
        self.assertTrue(errs([24.5, 16.0, -14.0], "walk"))
        self.assertTrue(errs([24.5, 27.9, -14.0], "climb"))

    # ---- the shell

    def test_marching_cubes_closed_and_wound_to_the_air(self):
        n = 24
        g = np.arange(n + 1) * 0.125
        Z, Y, X = np.meshgrid(g, g, g, indexing="ij")
        F = 1.1 - np.sqrt((X - 1.5) ** 2 + (Y - 1.4) ** 2 + (Z - 1.6) ** 2)  # air inside a ball
        Vq, Fs, _ = core.weld([core.mc_block(F, np.ones((n, n, n), bool), np.zeros(3, np.int64), n, 0.125,
                                             np.zeros(3))])
        be, nonman = core.boundary_edges(Fs)
        self.assertEqual((len(be), nonman), (0, 0))
        V = Vq / core.Q
        a, b, c = V[Fs[:, 0]], V[Fs[:, 1]], V[Fs[:, 2]]
        inward = (np.cross(b - a, c - a) * (np.array([1.5, 1.4, 1.6]) - (a + b + c) / 3)).sum(1) > 0
        self.assertGreater(inward.mean(), 0.99)

    def test_closed_except_at_openings(self):
        sh = self.rep["shell"]
        self.assertEqual(sh["boundary_edges_outside_openings"], 0)
        self.assertEqual(sh["nonmanifold_edges"], 0)
        self.assertGreater(sh["boundary_edges"], 0)  # the seam stub is open
        be, nonman = core.boundary_edges(self.r["F"])
        V = self.r["Vq"] / core.Q
        mid = 0.5 * (V[be[:, 0]] + V[be[:, 1]])
        self.assertTrue(np.allclose(mid[:, 1], 30.125))  # only at the far face of the seam's overlap cell
        self.assertEqual(self.rep["column_openings"], {"top": 0, "bottom": 0})

    def test_same_geometry_on_every_run(self):
        r2 = core.build(EXAMPLE, None, write=False, zone_checks=False, log=quiet)["report"]
        self.assertEqual(r2["geometry_md5"], self.rep["geometry_md5"])
        self.assertEqual(r2["shell_md5"], self.rep["shell_md5"])

    def test_exact_floor_planes(self):
        V = self.r["Vq"]
        x, y, z = V[:, 0] / core.Q, V[:, 1] / core.Q, V[:, 2]
        # the hall's flat floor, away from blocks, formations and the pit
        m = (x > 23.5) & (x < 26.5) & (y > 8.5) & (y < 10.5) & (z < -13.8 * core.Q)
        self.assertGreater(m.sum(), 50)
        self.assertTrue((z[m] == -14 * core.Q).all())
        # the ramp: z = -16 + (x - 2) / 11 across the tube's middle (inside its floor fillets), to the rounding
        m = (x > 4) & (x < 11) & (np.abs(y - 5.0) < 0.3) & (z < -14.6 * core.Q)
        self.assertGreater(m.sum(), 50)
        want = -16.0 + (x[m] - 2.0) / 11.0
        self.assertLess(np.abs(z[m] / core.Q - want).max(), 2e-5)
        # the stairs: 5 risers of 0.2 m, treads of 0.3 m, nosings at x 15.4, 15.7, 16.0, 16.3, 16.6; the tread
        # from 15.7 to 16.0 is the plane z = -14.6
        m = (x > 15.74) & (x < 15.96) & (np.abs(y - 5.0) < 0.3) & (z < -14.4 * core.Q)
        self.assertGreater(m.sum(), 4)
        self.assertTrue((z[m] == -14.6 * core.Q).all())

    def test_clearance_per_profile(self):
        rows = {c["id"]: c for c in self.rep["clearance"]}
        for c in rows.values():
            if c["samples"]:
                self.assertTrue(c["ok"], c)
        cr, fi = rows["crawl_north"], rows["fissure_east"]
        self.assertGreaterEqual(cr["min_height"], 1.0)
        self.assertLessEqual(cr["max_height"], 1.4)  # too low to walk (the walking body is 1.75 m)
        self.assertGreaterEqual(cr["min_width"], 0.8)
        self.assertGreaterEqual(fi["min_width"], 0.42)
        self.assertLessEqual(fi["max_width"], 0.6)  # too narrow for the walking body (0.6 m)
        self.assertGreaterEqual(fi["min_height"], 1.9)
        for pid in ("tube_ramp", "tube_stairs", "seam_tube"):
            self.assertGreaterEqual(rows[pid]["min_width"], 0.8)
            self.assertGreaterEqual(rows[pid]["min_height"], 2.1)
        self.assertLess(self.rep["shell"]["core_clip_fraction"], 0.01)

    # ---- zones and the flood

    def test_zones_emitted(self):
        z = {d["id"]: d for d in self.rep["zones"]}
        self.assertEqual({d["wdi_traverse"] for d in z.values()}, {"crawl", "sidle", "climb"})
        cr, sd, cl = z["crawl_north"], z["fissure_east"], z["ledge_climb"]
        self.assertEqual(cr["node"], "Trav_crawl_north")
        self.assertEqual(cr["wdi_traverse"], "crawl")
        self.assertEqual(cr["axis_x"], [0.0, 1.0, 0.0])  # along the passage
        self.assertAlmostEqual(cr["size"][0], 6.5)
        self.assertEqual(sd["wdi_traverse"], "sidle")
        self.assertEqual(sd["axis_x"], [1.0, 0.0, 0.0])
        self.assertEqual(cl["wdi_traverse"], "climb")
        self.assertEqual(cl["axis_z"], [0.0, -1.0, 0.0])  # out of the face, towards the walker in the hall
        self.assertAlmostEqual(cl["size"][1], 3.0)  # foot to top
        self.assertAlmostEqual(cl["centre"][2], -12.5)
        for d in z.values():  # right-handed: Z = X x Up
            x, zz = np.array(d["axis_x"]), np.array(d["axis_z"])
            self.assertTrue(np.allclose(np.cross(x, [0, 0, 1]), zz))

    def test_flood_reaches_everything_without_traps(self):
        f = self.rep["flood"]
        self.assertTrue(f["ok"], f)
        self.assertTrue(all(s["found"] for s in f["seeds"]))
        self.assertTrue(all(f["seeds_from_primary_spawn"]))
        self.assertTrue(all(t["from_primary_spawn"] for t in f["targets"]))
        self.assertEqual(f["traps"], 0)
        self.assertFalse(f["wedged"])
        self.assertEqual(f["undesigned"], 0)
        self.assertEqual(f["unguarded_drops"], [])
        self.assertEqual(f["voids"], 0)
        self.assertGreater(f["reached_by_mode"]["crawl"], 0)
        self.assertGreater(f["reached_by_mode"]["sidle"], 0)

    def test_modes_mandatory_where_designed(self):
        zs = {z["id"]: z for z in self.rep["flood"]["zones"]}
        self.assertEqual(set(zs), {"crawl_north", "fissure_east", "ledge_climb"})
        for z in zs.values():
            self.assertTrue(z["traversable"], z)
            self.assertFalse(z["bypassable"], z)
            self.assertTrue(z["mandatory"], z)

    def test_removing_a_zone_cuts_off_its_far_side(self):
        parts = self.r["flood"]
        fl, zones = parts["flood"], self.r["zones"]
        spawn = parts["primary"]
        for chain in core.zone_chains(zones):
            near_end, far_end = core.zone_ends(fl, chain)
            self.assertTrue(far_end)
            full = fl.graphs(zones)[0]
            self.assertTrue(core.Flood.bfs(full, [spawn], fl.N)[np.asarray(far_end)].any(), chain[0].id)
            cut = fl.graphs([z for z in zones if all(z is not c for c in chain)])[0]
            self.assertFalse(core.Flood.bfs(cut, [spawn], fl.N)[np.asarray(far_end)].any(), chain[0].id)

    def test_bent_crawl_and_fissure_checked_end_to_end(self):
        d = copy.deepcopy(self.ex)  # the east part only (from the hall on), to keep the test quick
        d["region"]["boxes"] = [[20, 0, -20, 43, 30, -4]]
        d["passages"] = [p for p in d["passages"] if p["id"] not in ("tube_ramp", "tube_stairs", "hall_link")]
        d["spawns"] = [{"id": "hall", "at": [25.0, 8.0, -14.0]}]
        for p in d["passages"]:
            if p["id"] == "crawl_north":  # two right angles: a crawl turns freely
                p["via"] = [[24.5, 16.0, -14.0], [22.0, 16.0, -14.0], [22.0, 19.5, -14.0]]
            if p["id"] == "fissure_east":  # four bends of 45 degrees
                p["via"] = [[35.5, 8.0, -14.0], [36.5, 9.0, -14.0], [37.5, 9.0, -14.0], [38.5, 8.0, -14.0]]
        rep = core.build(self.write("bends.json", d), None, write=False, log=quiet)["report"]
        f = rep["flood"]
        self.assertTrue(rep["ok"], f)
        zs = {z["id"]: z for z in f["zones"]}
        self.assertEqual({k for k in zs if k.startswith("crawl_north")}, {f"crawl_north_{i}" for i in range(4)})
        self.assertEqual({k for k in zs if k.startswith("fissure_east")}, {f"fissure_east_{i}" for i in range(5)})
        for z in zs.values():
            self.assertTrue(z["mandatory"], z)
            self.assertEqual(z["segments_walked_round"], [], z)
        self.assertEqual(zs["crawl_north_2"]["segments"], 4)
        self.assertEqual(rep["problems"], [])
        clr = {c["id"]: c for c in rep["clearance"]}
        self.assertTrue(clr["fissure_east"]["ok"], clr["fissure_east"])  # the widest width is not read at a bend

    def test_a_crawl_segment_walked_round_is_reported(self):
        d = copy.deepcopy(self.ex)  # the east part, with a tube from the hall that joins the crawl at its bend
        d["region"]["boxes"] = [[16, 0, -20, 43, 30, -4]]
        d["passages"] = [p for p in d["passages"] if p["id"] not in ("tube_ramp", "tube_stairs", "hall_link")]
        d["spawns"] = [{"id": "hall", "at": [25.0, 8.0, -14.0]}]
        next(p for p in d["passages"] if p["id"] == "crawl_north")["via"] = [[24.5, 16.0, -14.0]]
        d["passages"].append({"id": "side_tube", "from": [22.0, 12.0, -14.0], "via": [[19.5, 12.0, -14.0],
                              [19.5, 16.0, -14.0]], "to": [24.5, 16.0, -14.0], "profile": "tube", "width": 2.0,
                              "clear": 2.4, "floor": {"kind": "flat"}})
        rep = core.build(self.write("sidejoin.json", d), None, write=False, log=quiet)["report"]
        zs = {z["id"]: z for z in rep["flood"]["zones"]}
        self.assertFalse(rep["ok"])
        self.assertEqual(zs["crawl_north_0"]["segments_walked_round"], ["crawl_north_0"])
        self.assertTrue(zs["crawl_north_0"]["bypassable"])
        self.assertTrue(zs["crawl_north_1"]["mandatory"], zs["crawl_north_1"])  # the side tube does not skip this one
        self.assertTrue(any("crawl_north_0" in p for p in rep["problems"]), rep["problems"])

    def test_straight_crawl_joined_part_way_and_a_fissure_into_a_crawl(self):
        d = copy.deepcopy(self.ex)  # the east part: a tube joins the straight crawl part way along; the fissure opens
        d["region"]["boxes"] = [[16, 0, -20, 43, 30, -4]]  # straight into a crawl that ends in the east pocket
        d["passages"] = [p for p in d["passages"] if p["id"] not in ("tube_ramp", "tube_stairs", "hall_link")]
        d["spawns"] = [{"id": "hall", "at": [25.0, 8.0, -14.0]}]
        d["passages"].append({"id": "side_tube", "from": [22.0, 12.0, -14.0], "via": [[19.5, 12.0, -14.0],
                              [19.5, 16.0, -14.0]], "to": [24.5, 16.0, -14.0], "profile": "tube", "width": 2.0,
                              "clear": 2.4, "floor": {"kind": "flat"}})
        next(p for p in d["passages"] if p["id"] == "fissure_east")["to"] = [36.6, 8.0, -14.0]
        d["passages"].append({"id": "crawl_east", "from": [36.6, 8.0, -14.0], "to": [39.2, 8.0, -14.0],
                              "profile": "crawl", "width": 0.9, "clear": 1.1, "floor": {"kind": "flat"}})
        rep = core.build(self.write("straightjoin.json", d), None, write=False, log=quiet)["report"]
        f = rep["flood"]
        zs = {z["id"]: z for z in f["zones"]}
        self.assertEqual(zs["crawl_north"]["segments_walked_round"], ["crawl_north"])  # no via needed to see it
        self.assertGreater(zs["crawl_north"]["walked_in"][0], core.WALK_ROUND)
        self.assertTrue(zs["crawl_north"]["bypassable"])
        self.assertTrue(any("crawl_north" in p for p in rep["problems"]), rep["problems"])
        # the crawl the fissure opens into is crawled thin (the sidling radius), both ways
        self.assertGreater(f["reached_by_mode"]["thin"], 0)
        for zid in ("fissure_east", "crawl_east"):
            self.assertTrue(zs[zid]["mandatory"], zs[zid])
            self.assertEqual(zs[zid]["segments_walked_round"], [], zs[zid])
        self.assertEqual(f["traps"], 0, f["trap_samples"])
        self.assertEqual(len(rep["problems"]), 1, rep["problems"])

    def test_a_fissure_at_its_widest_still_needs_the_sidle(self):
        d = copy.deepcopy(self.ex)  # the east part, the fissure at the widest the rules allow (0.55 m)
        d["region"]["boxes"] = [[20, 0, -20, 43, 30, -4]]
        d["passages"] = [p for p in d["passages"] if p["id"] not in ("tube_ramp", "tube_stairs", "hall_link")]
        d["spawns"] = [{"id": "hall", "at": [25.0, 8.0, -14.0]}]
        next(p for p in d["passages"] if p["id"] == "fissure_east")["width"] = core.FISSURE_WIDTH[1]
        r = core.build(self.write("fissure055.json", d), None, write=False, log=quiet)
        rep = r["report"]
        zs = {z["id"]: z for z in rep["flood"]["zones"]}
        self.assertTrue(zs["fissure_east"]["mandatory"], zs["fissure_east"])
        self.assertEqual(rep["problems"], [])
        # the walker's 0.6 m body has no standing place along the fissure: its rim reads the walls between columns
        fl = r["flood"]["flood"]
        cols = fl.g.col_at(np.arange(35.0, 38.6, 0.125), np.full(29, 8.0))
        self.assertFalse(fl.valid["walk"][:, cols].any())
        self.assertTrue(fl.valid["sidle"][:, cols].any(0).all())

    def test_the_rail_is_what_keeps_the_walker_out_of_the_pit(self):
        d = copy.deepcopy(self.ex)
        d["guards"] = []
        rep = core.build(self.write("no_rail.json", d), None, write=False, zone_checks=False, log=quiet)["report"]
        f = rep["flood"]
        self.assertFalse(f["ok"])
        self.assertTrue(f["traps"] > 0 or f["unguarded_drops"] or f["undesigned"] > 0)

    def test_cracks_wider_than_the_rays_are_caught(self):
        room = {"format": "cave-section/1", "key": "crack_room", "network": self.ex["network"], "geology": "limestone",
                "region": {"boxes": [[19, 4, -17, 32, 16, -9]]}, "nodes": {}, "passages": [],
                "chambers": [{"id": "room", "kind": "hall", "center": [25.5, 10.0, -14.0], "size": [10.0, 9.0, 3.0]}],
                "spawns": [{"id": "west", "at": [22.0, 10.0, -14.0]}]}

        def flood(width, cx):
            sec = core.Section(room, room["network"], BLENDER)
            sec.prims.append(Crack(sec.key, width, cx))
            sec.prims.sort(key=lambda p: p.key)
            sec.own = [p for p in sec.prims if getattr(p, "sec", None) == sec.key]
            return core.build(None, None, write=False, log=quiet, sec_obj=sec)["report"]["flood"]

        # 0.45 m, off the lattice: the viewer's rays (0.21 m out) all fall in and the 0.6 m body wedges, although
        # rays rounded to the lattice (0.25 m) would still stand on both rims
        f = flood(0.45, 25.53)
        self.assertFalse(f["ok"])
        self.assertTrue(f["wedged"])
        self.assertGreater(f["crack_falls"], 0)
        f = flood(0.40, 25.5)  # narrower than the rays' span: walked over
        self.assertTrue(f["ok"], f)
        self.assertEqual(f["crack_falls"], 0)

    # ---- seams

    def test_seam_inside_a_crawl_and_a_fissure(self):
        for profile, mode in (("crawl", "crawl"), ("fissure", "sidle")):
            d = os.path.join(self.tmp, f"pair_{profile}")
            os.makedirs(d, exist_ok=True)
            net, a, b = seam_pair(profile)
            paths = []
            for name, obj in (("network.json", net), ("sa.json", a), ("sb.json", b)):
                paths.append(os.path.join(d, name))
                with open(paths[-1], "w", encoding="utf-8") as fh:
                    json.dump(obj, fh)
            gx = int(round((20.0 - net["lattice"]["origin"][0]) / net["lattice"]["cell"]))
            faces = []
            for path in paths[1:]:
                r = core.build(path, None, write=False, log=quiet)
                rep = r["report"]
                f = rep["flood"]
                self.assertTrue(rep["ok"], (profile, path, f))
                self.assertEqual(f["traps"], 0)
                (z,) = f["zones"]
                self.assertTrue(z["mandatory"], z)
                self.assertIn("ab", z["seam_ends"])  # the zone's far end is the seam
                self.assertEqual(rep["seams"][0]["arrival_mode"], mode)
                sel = r["cells"][:, 0] == gx
                faces.append(sorted(tuple(sorted(tuple(int(v) for v in p) for p in t)) for t in r["Vq"][r["F"][sel]]))
            self.assertGreater(len(faces[0]), 20)
            self.assertEqual(faces[0], faces[1])

    def test_seam_overlap_identical_in_both_sections(self):
        net = dict(self.ex["network"])
        net["sections"] = ["example", "example_b"]
        self.write("network.json", net)
        a = dict(self.ex)
        a["network"] = "network.json"
        pa = self.write("example.json", a)
        pb = self.write("example_b.json", neighbour_b())
        ra = core.build(pa, None, write=False, flood=False, log=quiet)
        rb = core.build(pb, None, write=False, zone_checks=False, log=quiet)
        gy = int(round((30.0 - net["lattice"]["origin"][1]) / net["lattice"]["cell"]))

        def overlap(r):
            sel = r["cells"][:, 1] == gy
            tri = r["Vq"][r["F"][sel]]
            return sorted(tuple(sorted(tuple(int(v) for v in p) for p in t)) for t in tri)

        oa, ob = overlap(ra), overlap(rb)
        self.assertGreater(len(oa), 50)
        self.assertEqual(oa, ob)
        self.assertEqual(rb["report"]["shell"]["boundary_edges_outside_openings"], 0)
        self.assertTrue(rb["report"]["flood"]["ok"])
        seam = rb["report"]["seams"][0]
        self.assertEqual((seam["arrival_mode"], seam["overlap_faces"]), ("walk", len(ob)))

    # ---- budgets and files

    def test_budgets_reported(self):
        rep = self.rep
        self.assertGreater(rep["shell"]["triangles"], 50000)
        self.assertLessEqual(rep["shell"]["max_chunk_triangles"], rep["shell"]["triangles"])
        self.assertGreater(rep["shell"]["chunks"], 1)
        c = rep["collision"]
        self.assertLess(c["decimated"], c["near_routes"])
        self.assertLessEqual(c["near_routes"], c["raw"])
        self.assertGreater(c["proxies"], 0)
        self.assertEqual(c["total"], c["decimated"] + c["proxies"])
        self.assertLessEqual(c["total"], core.COLLISION_CEILING)
        self.assertGreater(rep["formations"]["triangles"], 0)
        b = rep["budget"]
        self.assertEqual(b["triangles_loaded"], rep["shell"]["triangles"] + rep["formations"]["triangles"])
        self.assertLessEqual(b["triangles_loaded"], b["target"])

    def test_outputs_written(self):
        key = self.ex["key"]
        with np.load(os.path.join(self.tmp, f"{key}.core.npz")) as z:
            for name in ("shell_verts_q", "shell_faces", "shell_uv", "shell_tint", "chunk_offsets", "coll_faces",
                         "proxy_faces", "form_faces", "zones_json"):
                self.assertIn(name, z.files)
            self.assertEqual(z["shell_uv"].shape, (len(z["shell_faces"]), 3, 2))
            self.assertEqual(z["shell_tint"].shape, (len(z["shell_verts_q"]), 3))
            self.assertEqual(int(z["chunk_offsets"][-1]), len(z["chunk_faces"]))
            self.assertEqual(json.loads(str(z["zones_json"])), self.rep["zones"])
        with open(os.path.join(self.tmp, f"{key}_plan.png"), "rb") as fh:
            self.assertEqual(fh.read(8), b"\x89PNG\r\n\x1a\n")
        with open(os.path.join(self.tmp, f"{key}_report.json"), encoding="utf-8") as fh:
            self.assertEqual(json.load(fh)["geometry_md5"], self.rep["geometry_md5"])
        self.assertTrue(self.rep["ok"])
        self.assertTrue(math.isfinite(self.rep["seconds"]))


if __name__ == "__main__":
    unittest.main()
