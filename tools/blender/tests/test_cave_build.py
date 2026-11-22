"""Tests of the cave builder's plain-Python parts (meshy_cave_build.py), without Blender: the contract's nodes for the
Undermere's first two sections (names, extras, the seam rows only towards built neighbours, the arrivals' distances
and modes), the traversal zones' frames as the viewer reads them, the fill lights, the face split by kit and surface,
the chunks, the lilac and teal guards, the budgets and the look file. numpy only."""

import json
import math
import os
import sys
import unittest

BLENDER = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
UNDERMERE = os.path.join(BLENDER, "meshy_caves", "undermere")
sys.path.insert(0, BLENDER)

try:
    import numpy as np
    import meshy_cave_build as cb
    import meshy_cave_core as core
except ImportError:  # no numpy here
    np = cb = core = None


def gltf(v):
    """A Blender vector in glTF's axes (the exporter's Y up: x, z, -y)."""
    return np.array([v[0], v[2], -v[1]])


@unittest.skipIf(cb is None, "numpy is not installed")
class CaveBuildTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.look = cb.load_look()
        cls.secs = {}
        for key in ("swallow", "gallery"):
            sec, _w = core.load_section(os.path.join(UNDERMERE, f"{key}.json"))
            cls.secs[key] = (sec, [z.out() for z in core.make_zones(sec)])

    def nodes(self, key, built):
        sec, zones = self.secs[key]
        return cb.contract_nodes(sec.d, sec.net, zones, set(built), self.look)

    def test_look_is_the_networks(self):
        lk = self.look
        self.assertEqual(lk["wdi_exposure"], 2.378414230005442)
        self.assertIs(lk["wdi_baked"], True)
        self.assertIs(lk["wdi_indoor"], True)
        self.assertEqual(lk["fog_color_srgb"].upper(), "#12141C")
        self.assertGreater(lk["fog_density"], 0)
        with open(os.path.join(UNDERMERE, "design.json"), encoding="utf-8") as fh:
            design = json.load(fh)["look"]
        for k in ("wdi_exposure", "fog_color", "fog_density"):
            self.assertEqual(lk[k], design[k])
        text = json.dumps(lk).lower()
        for word in cb.BANNED:
            self.assertNotIn(word, text)
        # teal is never a light colour baked onto rock (the owner has not approved it)
        for part in ("lamp", "fill", "sky"):
            c = cb.hex_lin(lk[part]["colour"])
            self.assertFalse(c[1] > c[0] and c[1] > c[2], part)
        cache = os.path.join(BLENDER, ".cache", "materials")
        if os.path.isdir(cache):
            for kit, v in lk["kits"].items():
                for slug in (v.values() if isinstance(v, dict) else [v]):
                    self.assertTrue(os.path.isdir(os.path.join(cache, slug)), f"{kit}: {slug} is not a locked scan")

    def test_swallow_nodes(self):
        n = self.nodes("swallow", ["gallery"])
        self.assertEqual(n["area"], "under_swallow")
        ex = n["extras"]
        self.assertEqual((ex["wdi_kind"], ex["wdi_scene"]), ("cave", "undermere"))
        self.assertIs(ex["wdi_indoor"], True)
        self.assertIs(ex["wdi_baked"], True)
        self.assertEqual(ex["wdi_exposure"], self.look["wdi_exposure"])
        names = {p["name"]: p for p in n["portals"]}
        self.assertIn("Portal_um.swallow_out", names)
        self.assertEqual(names["Portal_um.swallow_out"]["extras"],
                         {"to": "overworld", "toSpawn": "mouth_swallow", "kind": "cave_mouth",
                          "wdi_portal_id": "um.swallow_out"})
        seam = names["Portal_seam_swallow_gallery_a_1"]["extras"]
        self.assertEqual((seam["to"], seam["toSpawn"], seam["kind"], seam["wdi_seam"], seam["wdi_seam_kind"]),
                         ("undermere", "seam_swallow_gallery_b_1", "gate", "swallow_gallery", "arch"))
        spawns = {s["name"]: s for s in n["spawns"]}
        self.assertIn("Spawn_undermere_mouth_swallow", spawns)
        arr = spawns["Spawn_undermere_seam_swallow_gallery_a_1"]["extras"]
        self.assertIs(arr["wdi_picker"], False)
        self.assertEqual(arr["wdi_mode"], "crawl")
        # the seams to sections not built stay closed walls, with no portal row
        self.assertEqual(sorted(c["id"] for c in n["closed_seams"]), ["swallow_killas", "swallow_river"])
        self.assertFalse(any("killas" in p["name"] or "river" in p["name"] for p in n["portals"]))
        self.assertEqual(n["problems"], [])
        x0, y0, x1, y1 = ex["wdi_walk_region"]
        for p in n["spawns"] + n["portals"]:
            self.assertTrue(x0 <= p["at"][0] <= x1 and y0 <= p["at"][1] <= y1, p["name"])
        zn = {z["name"]: z for z in n["zones"]}
        self.assertEqual(zn["Trav_sw_lakearch"]["extras"]["wdi_traverse"], "crawl")
        self.assertEqual(zn["Trav_sw_lip_face"]["extras"]["wdi_traverse"], "climb")

    def test_gallery_nodes_and_unbuilt_neighbour(self):
        n = self.nodes("gallery", [])
        self.assertEqual([p["name"] for p in n["portals"]], [])
        self.assertEqual(len(n["closed_seams"]), 2)
        n = self.nodes("gallery", ["swallow"])
        self.assertEqual([p["name"] for p in n["portals"]], ["Portal_seam_swallow_gallery_b_1"])
        self.assertEqual(n["portals"][0]["extras"]["toSpawn"], "seam_swallow_gallery_a_1")
        self.assertEqual(n["problems"], [])

    def test_seam_rows_face_each_other(self):
        a = {p["name"]: p for p in self.nodes("swallow", ["gallery"])["portals"]}["Portal_seam_swallow_gallery_a_1"]
        b = {p["name"]: p for p in self.nodes("gallery", ["swallow"])["portals"]}["Portal_seam_swallow_gallery_b_1"]
        self.assertAlmostEqual(math.dist(a["at"], b["at"]), 0.9, places=6)
        sa = {s["id"]: s for s in self.nodes("swallow", ["gallery"])["spawns"]}["undermere_seam_swallow_gallery_a_1"]
        # the arrival stands 1.65 m inside the wall, 2.1 m beyond the other file's portal
        self.assertAlmostEqual(math.dist(sa["at"], b["at"]), 2.1, places=6)
        self.assertAlmostEqual(abs(sa["at"][0] - (-52.5)), 1.65, places=6)

    def test_arrival_too_near_a_portal_is_a_problem(self):
        sec, zones = self.secs["swallow"]
        d = json.loads(json.dumps(sec.d))
        d["seams"][1]["arrival"]["at"][0] = -53.9    # 0.95 m from its own row
        n = cb.contract_nodes(d, sec.net, zones, {"gallery"}, self.look)
        self.assertTrue(any("Spawn_undermere_seam_swallow_gallery_a_1" in p for p in n["problems"]))

    def test_banned_and_repeated_names(self):
        self.assertTrue(cb.name_problems(["um_x_Torch_lamp"]))
        self.assertTrue(cb.name_problems(["Spawn_a", "Spawn_a"]))
        self.assertEqual(cb.name_problems(["Area_under_swallow", "Trav_sw_lakearch"]), [])

    def test_zone_frame_as_the_viewer_reads_it(self):
        for z in self.secs["swallow"][1] + self.secs["gallery"][1]:
            B = np.array(cb.zone_basis(z))
            self.assertTrue(np.allclose(B.T @ B, np.eye(3), atol=1e-9))
            self.assertAlmostEqual(float(np.linalg.det(B)), 1.0, places=9)
            # glTF local X along the passage, Y up, Z along axis_z (out of a climb face)
            self.assertTrue(np.allclose(gltf(B[:, 0]), gltf(z["axis_x"]), atol=2e-6))
            self.assertTrue(np.allclose(gltf(B[:, 2]), [0, 1, 0]))
            self.assertTrue(np.allclose(gltf(-B[:, 1]), gltf(z["axis_z"]), atol=2e-6))

    def test_fill_lights(self):
        f = self.look["fill"]
        pts = cb.fill_points(self.secs["swallow"][0].d, self.look)
        ids = [p["id"] for p in pts]
        self.assertIn("fill_sw_clayhall", ids)
        for p in pts:
            self.assertGreaterEqual(p["watts"], f["min_watts"])
            self.assertLessEqual(p["watts"], f["max_watts"])
        self.assertFalse(any(i.startswith("fill_sw_gullet") for i in ids))   # 2.2 m wide: under the passages' minimum
        gal = [p["id"] for p in cb.fill_points(self.secs["gallery"][0].d, self.look)]
        self.assertTrue(any(i.startswith("fill_ga_trunk_1") for i in gal))
        self.assertFalse(any(i.startswith("fill_bottomless_pit") for i in gal))

    def test_big_chamber_ring_and_climb_fill(self):
        f = self.look["fill"]
        well = core.load_json(os.path.join(UNDERMERE, "well.json"))
        ids = [p["id"] for p in cb.fill_points(well, self.look)]
        ring = [i for i in ids if i.startswith("fill_we_dome_ring_")]
        self.assertEqual(len(ring), f["big"]["ring"])                 # the 32 m dome: a ring of low lights
        self.assertIn("fill_we_dome", ids)
        self.assertIn("fill_we_dam_face_foot", ids)                    # the Flowstone Dam (3.2 m) is lit across
        pts = {p["id"]: p for p in cb.fill_points(well, self.look)}
        dome = next(c for c in well["chambers"] if c["id"] == "we_dome")
        for i in ring:
            self.assertLess(pts[i]["at"][2], dome["center"][2] + 0.5 * dome["size"][2])
            self.assertLessEqual(pts[i]["watts"], f["big"]["max_watts"])
        north = core.load_json(os.path.join(UNDERMERE, "north.json"))
        no = [p["id"] for p in cb.fill_points(north, self.look)]
        self.assertFalse(any("_ring_" in i for i in no))               # the Organ Chamber (90 m2) is under the size

    def test_adit_cutting_ground_rises_to_the_trail(self):
        fr = cb.mouth_frame([124.0, 2.5, 3.6, 127.0, 6.5, 7.6], [125.45, 4.5, 4.1], [[125.0, 3.5], [125.0, 5.5]])
        self.assertEqual((fr["axis"], fr["sign"]), (0, -1.0))          # the Adit faces west (-x)
        V, F = cb.cutting_ground(fr, (125.0, 4.5), 2.0, 4.1, {}, 40.0)
        self.assertEqual(len(F), 10)
        self.assertAlmostEqual(float(V[8:12, 2].min()), 4.1 + 1.79 - 1.0)  # the ground falls away beyond the trail
        land = V[:4]
        self.assertTrue(np.allclose(land[:, 2], 4.1))                  # the landing is level at the sill
        self.assertAlmostEqual(float(V[4:8, 0].min()), fr["plane"] - 2.5 - 6.7)

    def test_every_geology_has_its_own_locked_scans(self):
        """Each of the design's ten geologies has a kit of its own (none falls to the default), every scan a kit
        names is pinned in the material lock (not only present in someone's cache), the default kit is limestone's,
        and the cave scans of 2026-11-21 sit where the geology asks for them (CREDITS, the cave_* roles)."""
        sys.path.insert(0, os.path.join(BLENDER, "materials"))
        import roles  # noqa: E402

        kits = self.look["kits"]
        with open(os.path.join(UNDERMERE, "design.json"), encoding="utf-8") as fh:
            geology = json.load(fh)["geology"]
        self.assertEqual(len(geology), 10)
        for g in geology:
            self.assertIn(g, kits, g)
            self.assertEqual(set(kits[g]), {"wall", "floor"}, g)
        self.assertEqual(kits["default"], kits["limestone"])
        with open(roles.LOCK_FILE, encoding="utf-8") as fh:
            lock = json.load(fh)["assets"]
        for kit, v in kits.items():
            for slug in (v.values() if isinstance(v, dict) else [v]):
                self.assertIn(slug, lock, f"{kit}: {slug} is not in polyhaven.lock.json")
                self.assertEqual(lock[slug]["type"], "texture", slug)
                self.assertTrue(slug in roles.slugs(), f"{kit}: {slug} has no role")
        want = {
            "limestone": ("cave_limestone", "cave_limestone_floor"),
            "flowstone": ("cave_flowstone", "cave_flowstone_floor"),
            "breakdown": ("cave_breakdown", "cave_breakdown"),
            "gypsum": ("cave_gypsum", "cave_gypsum"),
            "lakeclay": ("mud_brown", "cave_clay"),
            "slate": ("cave_slate", "cave_slate"),
            "skarn": ("cave_skarn", "cave_granite"),
            "granite": ("cave_granite", "mine_floor"),
            "flooded": ("wet_rock", "cave_wet_gravel"),
            "ice": ("snow", "snow_trodden"),
            "moss": ("cave_lichen", "moss_rock"),
        }
        for kit, (wall, floor) in want.items():
            self.assertEqual(kits[kit]["wall"], roles.role(wall).slug, kit)
            self.assertEqual(kits[kit]["floor"], roles.role(floor).slug, kit)
        # every cave role is used by a kit
        used = {s for v in kits.values() for s in (v.values() if isinstance(v, dict) else [v])}
        for name, r in roles.ROLES.items():
            if name.startswith("cave_"):
                self.assertIn(r.slug, used, name)
        self.assertNotIn("moss", geology)   # the moss kit is a layer, never a geology's
        self.assertEqual(cb.scan_of("moss_wall", kits), "lichen_rock")
        self.assertEqual(cb.scan_of("basalt_floor", kits), kits["default"]["floor"])

    def test_face_materials_split_by_kit_and_surface(self):
        V = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [10, 10, 0], [11, 10, 0], [10, 11, 0]], float)
        F = np.array([[0, 1, 2], [0, 3, 1], [4, 5, 6]])
        geo = np.array([0, 0, 1])
        # lake clay has its own floor scan (wet clay under the varved wall); slate's wall and floor are one scan, so
        # one material, named for the wall
        keys, idx = cb.face_materials(V, F, geo, ["limestone", "lakeclay"], self.look["kits"], 0.7, [])
        self.assertEqual([keys[i] for i in idx], ["limestone_floor", "limestone_wall", "lakeclay_floor"])
        keys, idx = cb.face_materials(V, F, geo, ["limestone", "slate"], self.look["kits"], 0.7, [])
        self.assertEqual([keys[i] for i in idx], ["limestone_floor", "limestone_wall", "slate_wall"])
        # a geology the look has no kit for takes the default kit
        keys, idx = cb.face_materials(V, F, geo, ["limestone", "basalt"], self.look["kits"], 0.7, [])
        self.assertEqual(keys[idx[2]], "default_floor")
        keys, idx = cb.face_materials(V, F, geo, ["limestone", "lakeclay"], self.look["kits"], 0.7,
                                      [[9, 9, -1, 12, 12, 1]])
        self.assertEqual(keys[idx[2]], "mouth_wall")
        self.assertEqual(cb.scan_of("limestone_wall", self.look["kits"]), self.look["kits"]["limestone"]["wall"])

    def test_each_face_in_one_chunk(self):
        off = np.array([0, 3, 6])
        faces = np.array([0, 1, 2, 2, 3, 4])
        own = cb.first_chunk(off, faces, 5)
        self.assertEqual(own.tolist(), [0, 0, 0, 1, 1])

    def test_lilac_and_teal_guards(self):
        L = np.array([[1.0, 0.2, 0.8], [0.2, 1.0, 0.6], [1.0, 0.7, 0.4]])
        G = cb.guard_display(L)
        self.assertEqual(G[0, 1], 0.8)   # lilac: green up to the lesser of red and blue
        self.assertEqual(G[1, 1], 0.6)   # teal: green down to the greater of red and blue
        self.assertEqual(G[2, 1], 0.7)   # warm: as it was
        self.assertEqual(cb.lilac_share(G), 0.0)
        self.assertGreater(cb.lilac_share(np.array([[0.5, 0.3, 0.5]])), 0.0)
        # a pink texel (red 1.3 x its green, blue 1.05 x) under a warm and moon mix: lilac until the texel guard
        q = np.array([[1.3, 1.05], [1.3, 1.05]])
        L = np.array([[0.40, 0.45, 0.60], [0.21, 0.39, 1.0]])
        tex = np.array([1.3, 1.0, 1.05])
        self.assertGreater(cb.lilac_share(L[:1] * tex), 0.0)
        Lg = cb.guard_texels(L, q)
        self.assertEqual(cb.lilac_share(Lg * tex), 0.0)
        np.testing.assert_allclose(Lg[1], L[1])                      # pure moonlight is left as it is
        self.assertAlmostEqual(Lg[0, 1], L[0, 1])                     # the green is kept,
        self.assertLess(Lg[0, 2], L[0, 2])                            # the blue comes down
        self.assertLessEqual(Lg[0, 1], max(Lg[0, 0], Lg[0, 2]) + 1e-12)   # and the light never turns green

    def test_budgets(self):
        b = cb.budgets({"file_mb": 3.1, "triangles_loaded": 1600000, "draw_calls": 44, "texture_gpu_mb": None})
        self.assertTrue(b["file_mb"]["ok"])
        self.assertFalse(b["triangles_loaded"]["ok"])
        self.assertNotIn("texture_gpu_mb", b)

    def test_seam_width_measured_in_the_field(self):
        sec = self.secs["swallow"][0]
        sm = [s for s in sec.d["seams"] if s["id"] == "swallow_gallery"][0]
        w = cb.seam_width(sec, sm)
        self.assertGreater(w, 1.2)    # the Lake Arch: a crawl 1.5 m wide
        self.assertLess(w, 1.8)

    def test_gate_iron_reads_dark_and_warm(self):
        """The grille's light: never under the ink, never over the cap however hot the lamp beside it, warm where
        the lamp gives the light and grey (not the sky's blue) where it does not."""
        import meshy_room_build as rb
        lk = self.look
        ink_t = 21.35 / 255.0
        L = np.array([[0.0, 0.0, 0.0], [0.02, 0.02, 0.02], [5.0, 3.0, 1.0], [400.0, 250.0, 90.0], [0.2, 0.3, 0.9]])
        share = np.array([0.0, 0.0, 1.0, 1.0, 0.0])
        col = cb.iron_display(L, share, 33.6, lk, ink_t, rb.agx, rb.solve_display, rb.lum)
        d = rb.agx(col * lk["wdi_exposure"])
        luma = rb.lum(d)
        self.assertTrue(np.all(luma >= ink_t - 1e-3))
        self.assertTrue(np.all(luma <= lk["iron_display"]["cap"] + 1e-3))
        self.assertGreater(d[3, 0], d[3, 2] + 0.03)                 # lamp-lit: warm
        self.assertLessEqual(d[4, 2], d[4, 0] + 1e-6)               # sky-lit: the iron's grey, not blue
        self.assertEqual(cb.lilac_share(d), 0.0)
        glass = rb.agx(np.array([lk["lamp"]["glass_emit"]]) * lk["wdi_exposure"])[0]
        self.assertGreater(glass[0], glass[2] + 0.2)                 # the lamp's glass reads warm, not grey

    def test_mouth_frame_both_gates(self):
        sw = cb.mouth_frame([-59.5, -22.1, -0.6, -55.5, -18.1, 3.4], [-57.5, -19.65, -0.1],
                            [[-58.4, -20.1], [-56.6, -20.1]])
        self.assertEqual((sw["axis"], sw["sign"]), (1, -1.0))     # the Swallow faces south (-y)
        self.assertAlmostEqual(sw["plane"], -22.3)
        cu = cb.mouth_frame([30.0, 134.5, -0.05, 34.5, 138.5, 3.95], [31.55, 136.5, 0.45],
                            [[32.0, 135.8], [32.0, 137.2]])
        self.assertEqual((cu["axis"], cu["sign"]), (0, 1.0))      # the Cutting faces east (+x)
        self.assertAlmostEqual(cu["plane"], 34.7)
        self.assertEqual(cu["u"], (131.5, 141.5))

    def test_mouth_kit_and_its_boxes(self):
        kits = self.look["kits"]
        self.assertEqual(cb.mouth_kit_name(kits, {"type": "notch"}), "mouth")
        self.assertEqual(cb.mouth_kit_name(kits, {"type": "cliff_slot"}), "mouth_cliff_slot")
        self.assertEqual(cb.mouth_kit_name(kits, None), "mouth")
        self.assertEqual(cb.mouth_kit_name(kits, {"type": "adit"}), "mouth_adit")
        self.assertEqual(cb.mouth_kit_name(kits, {"type": "arch"}), "mouth_arch")
        b = [-59.5, -22.1, -0.6, -55.5, -18.1, 3.4]
        sw = cb.mouth_frame(b, [-57.5, -19.65, -0.1], [[-58.4, -20.1], [-56.6, -20.1]])
        # the Swallow's: as before, now that the mouth faces along its own axis
        self.assertEqual(cb.mouth_kit_boxes(b, sw),
                         [b[0] - 1.0, b[1] - 0.5, b[2] - 0.5, b[3] + 1.0, b[4] + 2.5, b[5] + 0.5])
        cbx = [30.0, 134.5, -0.05, 34.5, 138.5, 3.95]
        cu = cb.mouth_frame(cbx, [31.55, 136.5, 0.45], [[32.0, 135.8], [32.0, 137.2]])
        self.assertEqual(cb.mouth_kit_boxes(cbx, cu), [27.5, 133.5, -0.55, 35.0, 139.5, 4.45])  # into the cave: -x

    def test_outcrop_strips_cover_the_rock_only(self):
        us, zs = np.arange(0.0, 3.01, 0.125), np.arange(0.0, 2.01, 0.125)
        rock = np.ones((len(us) - 1, len(zs) - 1), bool)
        rock[8:12, 4:10] = False                                    # the hole
        q = cb.outcrop_strips(rock, us, zs)
        area = sum((u1 - u0) * (z1 - z0) for u0, u1, z0, z1 in q)
        self.assertAlmostEqual(area, rock.sum() * 0.125 ** 2)
        self.assertTrue(all(u1 - u0 <= 8 * 0.125 + 1e-9 for u0, u1, _, _ in q))
        self.assertLess(len(q), rock.sum() / 4)
        V = np.array([[0, 0, 0], [1, 0, 0], [1, 0, 1]], float)
        F = cb.facing(V, [(0, 1, 2)], (0, 1, 0))
        n = np.cross(V[F[0, 1]] - V[F[0, 0]], V[F[0, 2]] - V[F[0, 0]])
        self.assertGreater(n[1], 0)

    def test_colour_kept_when_a_channel_passes_one(self):
        c0 = np.array([[3.0, 2.0, 1.0], [0.2, 0.3, 0.4], [0.5, 0.8, 1.6]])
        out, f, n = cb.unit_colour(c0)
        self.assertEqual(n, 2)
        self.assertTrue(np.all(out <= 1.0 + 1e-12))
        np.testing.assert_allclose(out[1], c0[1])                      # under 1: untouched
        np.testing.assert_allclose(out[0] / out[0].max(), c0[0] / c0[0].max())   # the hue is kept, not clipped
        np.testing.assert_allclose(out, c0 * f[:, None])

    def test_timber_has_its_own_hot_cap(self):
        k_t, m_t = cb.hot_of("um_ice_timber", self.look)
        k_r, m_r = cb.hot_of("um_ice_chunk_10_14_3", self.look)
        self.assertEqual((k_r, m_r), (self.look["hot"]["knee"], self.look["hot"]["max"]))
        self.assertLess(m_t, m_r)
        self.assertLess(k_t, m_t)

    def test_every_basin_guard_is_drawn(self):
        """The core's automatic guard round a lake is collision; the walker must see a rail on that same ring."""
        sec, _w = core.load_section(os.path.join(UNDERMERE, "rising.json"))
        segs = [s for s in core.guard_segments(sec) if s[0].endswith("_basin_guard")]
        self.assertTrue(segs)
        parts = cb.lake_rails(sec)
        self.assertTrue(parts)
        V = np.concatenate([p[0] for p in parts])
        C = np.array([p[0].mean(axis=0) for p in parts])
        # a bar is centred on every guard segment's midpoint, and the rail spans the guard's height
        for _id, a, b, base, h, _th in segs:
            mid = np.array([0.5 * (a[0] + b[0]), 0.5 * (a[1] + b[1])])
            self.assertLess(np.min(np.hypot(C[:, 0] - mid[0], C[:, 1] - mid[1])), 1e-6)
            self.assertAlmostEqual(V[:, 2].max(), base + h, places=6)
            self.assertLessEqual(V[:, 2].min(), base - 0.05 + 1e-6)   # every post 0.05 m into what holds it
        # a section without a lake gets none
        self.assertEqual(cb.lake_rails(self.secs["swallow"][0]), [])

    def test_posts_stand_on_the_floor(self):
        """A rail's post reaches down to the floor under it (route 2: posts floated where the floor fell away), as far
        as POST_REACH, never rises off its base, and goes 0.05 m into what holds it."""
        sec, _w = core.load_section(os.path.join(UNDERMERE, "bottom.json"))
        for c in sec.own:
            if isinstance(c, core.Chamber) and c.kind == "lake":
                base = float(c.c[2])
                for x, y in c.basin_ring():
                    foot = cb.post_foot(sec, x, y, base)
                    self.assertLessEqual(foot, base)
                    self.assertGreaterEqual(foot, base - cb.POST_REACH - 1e-9)
                    P = np.array([[x, y, foot - 0.03], [x, y, foot + 0.03]])
                    f = sec.field_points(P)
                    if foot < base:
                        self.assertLessEqual(f[0], 0.0)    # rock just under the foot,
                        self.assertGreater(f[1], 0.0)      # air just over it
                    V, _F = cb.post_box(sec, x, y, base, 1.0, 1.0, 0.0)
                    self.assertAlmostEqual(V[:, 2].max(), base + 1.0, places=6)
                    self.assertAlmostEqual(V[:, 2].min(), foot - 0.05, places=6)

    def test_no_post_floats(self):
        """Route 3's check: on every thin guard of every section, each post's foot is held: some column of its 0.1 m
        foot has rock within 0.03 m under the foot, or the foot is on a bridge's deck. A post set into a lip or
        an overhang stands at its base (the Levels' engine collar: the old scan took the rock above the foot for a
        floor); the Domes' Cataract kerbs run on the lip itself (their posts stood 2.9 m over the dome's floor)."""
        offs = ((0.0, 0.0), (0.05, 0.0), (-0.05, 0.0), (0.0, 0.05), (0.0, -0.05))
        n = 0
        for key in ("gallery", "ice", "north", "levels", "adit", "domes"):
            sec, _w = core.load_section(os.path.join(UNDERMERE, key + ".json"))
            decks = [(b["box"], b["top_z"]) for b in sec.d.get("bridges", [])]
            for gd in sec.d.get("guards", []):
                if float(gd.get("thickness", 0.12)) >= 0.15:
                    continue
                base = float(gd["base_z"])
                for a, b in zip(gd["line"][:-1], gd["line"][1:]):
                    m = max(1, int(math.ceil(math.hypot(b[0] - a[0], b[1] - a[1]) / 1.2)))
                    for i in range(m + 1):
                        x, y = a[0] + i / m * (b[0] - a[0]), a[1] + i / m * (b[1] - a[1])
                        foot = cb.post_foot(sec, x, y, base)
                        held = any(x0 - 0.05 <= x <= x1 + 0.05 and y0 - 0.05 <= y <= y1 + 0.05
                                   and abs(t - foot) < 1e-6 for (x0, y0, x1, y1), t in decks)
                        P = np.array([[x + dx, y + dy, foot - 0.03] for dx, dy in offs])
                        held = held or bool((sec.field_points(P) <= 0.0).any())
                        self.assertTrue(held, (key, gd["id"], i, x, y, base, foot))
                        n += 1
        self.assertGreater(n, 50)
        # the Domes' Cataract kerbs: every post at the ledge's level, none reaching down to the dome's floor
        sec, _w = core.load_section(os.path.join(UNDERMERE, "domes.json"))
        for gd in sec.d["guards"]:
            if "cataract" in gd["id"]:
                for x, y in gd["line"]:
                    self.assertEqual(cb.post_foot(sec, x, y, float(gd["base_z"])), float(gd["base_z"]))

    def test_water_keeps_its_hue(self):
        """The shell's light is taken as a grey of its luminance, so a green-leaning light cannot turn WATER teal."""
        L = np.array([[0.02, 0.05, 0.03], [1.0, 0.5, 0.25], [0.0, 0.0, 0.0]])
        g = cb.water_grey(L)
        np.testing.assert_allclose(g[:, 0], g[:, 1])
        np.testing.assert_allclose(g[:, 1], g[:, 2])
        np.testing.assert_allclose(g[:, 0], 0.2126 * L[:, 0] + 0.7152 * L[:, 1] + 0.0722 * L[:, 2])
        w = cb.hex_lin(cb.WATER) * g[0]
        self.assertTrue(w[2] > w[1] > w[0])

    def test_timber_and_water_colours(self):
        """The timber is warm (red over green over blue, darker than route 2's), the water a dark blue-grey: neither
        teal nor lilac."""
        tb, old = cb.hex_lin(cb.TIMBER), cb.hex_lin("#6B5440")
        self.assertTrue(tb[0] > tb[1] > tb[2])
        self.assertGreater(tb[0] / tb[1], old[0] / old[1])
        self.assertLess(float(tb.sum()), float(old.sum()))
        w = cb.hex_lin(cb.WATER)
        self.assertTrue(w[2] > w[1] > w[0])
        self.assertEqual(cb.lilac_share(np.array([w, w * 3.0])), 0.0)
        self.assertFalse(w[1] > w[0] and w[1] > w[2])   # not teal
        self.assertLess(float(w.sum()), float(cb.hex_lin("#9A958A").sum()) / 4)   # far darker than the rock
        self.assertLess(cb.WATER_MAX, self.look["hot"]["knee"])

    def test_water_display_hue_clear_of_teal(self):
        """Through the viewer's AgX, WATER shows blue-grey at every level the water is graded to (the ink up to
        WATER_MAX): its hue stays over 203 degrees, clear of the teal band (160 to 200) the look checks find, and
        under 240, short of lilac (the rebuild's first Bottom stills read 199 degrees with the old #1E2A31)."""
        rb = cb._rb()
        w = cb.hex_lin(cb.WATER)
        for target in (0.09, 0.13, cb.WATER_MAX):
            s = rb.solve_display(w[None, :], target)[0]
            d = rb.agx(w * s)[0]
            mx, mn = float(d.max()), float(d.min())
            r, g, b = (float(v) for v in d)
            hue = 60.0 * ((r - g) / (mx - mn) + 4.0)   # blue is the largest channel
            self.assertEqual(mx, b)
            self.assertGreater(hue, 203.0, target)
            self.assertLess(hue, 240.0, target)

    def test_water_surfaces(self):
        """A stream lies along its passage at its depth over the floor line on the side given; a pool fills its basin
        at its level inside the rail's ring; every triangle faces up; water is never a contract node."""
        sec, _w = core.load_section(os.path.join(UNDERMERE, "river.json"))
        surf = {s["id"]: s for s in cb.water_surfaces(sec)}
        self.assertEqual(set(surf), {"ri_stream"})
        s = surf["ri_stream"]
        V, F = s["V"], s["F"]
        n = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
        self.assertTrue(np.all(n[:, 2] > 0))
        p = [q for q in sec.own if q.id == "ri_canyon"][0]
        self.assertAlmostEqual(V[:, 2].max(), p.P[:, 2].max() + 0.25, places=6)
        self.assertAlmostEqual(V[:, 2].min(), p.P[:, 2].min() + 0.25, places=6)
        # south of the centre line where the canyon runs east, and within its half width plus 0.3 m
        east = [(a, b) for a, b in zip(p.P[:-1], p.P[1:]) if b[0] - a[0] > 3 * abs(b[1] - a[1])]
        self.assertTrue(east)
        a, b = east[0]
        sel = (V[:, 0] > a[0] + 0.5) & (V[:, 0] < b[0] - 0.5)
        yc = a[1] + (b[1] - a[1]) * (V[sel, 0] - a[0]) / (b[0] - a[0])
        self.assertTrue(np.all(V[sel, 1] < yc + 1e-6))
        self.assertTrue(np.all(V[sel, 1] > yc - 2.0 - 0.3 - 0.05))
        area = 0.5 * float(np.abs(n[:, 2]).sum())
        self.assertGreater(area, 0.9 * 1.6 * 80.0)
        sec, _w = core.load_section(os.path.join(UNDERMERE, "rising.json"))
        pool = cb.water_surfaces(sec)
        self.assertEqual([q["id"] for q in pool], ["rs_sump_pool"])
        V = pool[0]["V"]
        self.assertTrue(np.allclose(V[:, 2], 9.3))
        c = [q for q in sec.own if q.id == "rs_basin_water"][0]
        rx, ry = 0.3 * c.sx + 0.6, 0.3 * c.sy + 0.6
        self.assertTrue(np.all(((V[:, 0] - c.c[0]) / rx) ** 2 + ((V[:, 1] - c.c[1]) / ry) ** 2 <= 2.0))
        self.assertGreater(len(pool[0]["F"]), 20)
        self.assertEqual(cb.water_surfaces(self.secs["swallow"][0]), [])
        bad = json.loads(json.dumps(sec.d))
        bad["water"][0]["chamber"] = "rs_basin"
        errs, _w = core.validate(bad, sec.net)
        self.assertTrue(any("not a lake chamber" in e for e in errs), errs)

    def test_water_light_from_the_shell_beside_it(self):
        P = np.array([[0.0, 0.0, 0.0], [10.0, 0.0, 0.0], [0.6, 0.0, 0.0]])
        L = np.array([[1.0, 0.5, 0.25], [0.0, 1.0, 0.0], [1.0, 0.5, 0.25]])
        Vw = np.array([[0.3, 0.0, 0.2], [10.0, 0.5, 0.0], [5.0, 0.0, 0.0], [12.5, 0.0, 0.0]])
        Lw = cb.water_light(Vw, P, L)
        np.testing.assert_allclose(Lw[0], [1.0, 0.5, 0.25])
        np.testing.assert_allclose(Lw[1], [0.0, 1.0, 0.0])
        np.testing.assert_allclose(Lw[2], [0.0, 0.0, 0.0])    # nothing within 3 m
        np.testing.assert_allclose(Lw[3], [0.0, 1.0, 0.0])    # the nearest, 2.5 m off

    # ---- the rock: moss, formations

    @staticmethod
    def hue(lin):
        s = np.clip(np.asarray(lin, float), 0, 1)
        s = np.where(s <= 0.0031308, 12.92 * s, 1.055 * s ** (1 / 2.4) - 0.055)
        r, g, b = s
        mx, mn = max(r, g, b), min(r, g, b)
        if mx - mn < 1e-9:
            return None
        if mx == r:
            h = (g - b) / (mx - mn) % 6
        elif mx == g:
            h = (b - r) / (mx - mn) + 2
        else:
            h = (r - g) / (mx - mn) + 4
        return 60.0 * h

    def test_moss_grows_towards_the_light_and_not_behind_rock(self):
        V = np.array([[1.0, 0.0, 0.0], [10.0, 0.0, 0.0], [30.0, 0.0, 0.0], [1.0, 0.0, 0.0], [5.0, 0.0, 0.0]])
        N = np.array([[-1.0, 0.0, 0.0], [-1.0, 0.0, 0.0], [-1.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 0.0, -1.0]])
        src = [("mouth", [0.0, 0.0, 0.0])]
        w = cb.moss_weight(V, N, src)
        self.assertGreater(w[0], w[1])          # nearer, more
        self.assertEqual(w[2], 0.0)             # out of reach
        self.assertGreater(w[0], w[3])          # turned towards the light, more
        self.assertLess(w[4], w[1])             # a roof (facing down) at 5 m, less than a wall at 10 m
        wall = cb.moss_weight(V, N, src, field=lambda P: np.where(P[:, 0] > 4.0, -1.0, 1.0))
        self.assertAlmostEqual(wall[1], w[1] / 6.0)   # rock between: a sixth
        self.assertAlmostEqual(wall[0], w[0])
        self.assertTrue(np.all(cb.moss_weight(V, N, []) == 0.0))

    def test_moss_green_to_olive_never_teal(self):
        for h in (cb.MOSS_GREEN, cb.MOSS_OLIVE):
            hu = self.hue(cb.hex_lin(h))
            self.assertTrue(35.0 <= hu <= 100.0, (h, hu))
        rock_ = np.tile(cb.hex_lin("#9A958A"), (50, 1))
        t = cb.moss_tint(rock_, np.linspace(0.0, 1.0, 50), np.zeros((50, 3)))
        for c in t[10:]:
            hu = self.hue(c)
            self.assertTrue(hu is None or 35.0 <= hu <= 100.0, hu)
        sec = self.secs["swallow"][0]
        kinds = [k for k, _p in cb.moss_sources(sec)]
        self.assertIn("mouth", kinds)                   # the Swallow's gate
        self.assertEqual(cb.moss_sources(self.secs["gallery"][0]), [])

    def test_moss_faces_take_the_moss_kit(self):
        V = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]], float)
        F = np.array([[0, 1, 2], [0, 3, 1]])
        keys, idx = cb.face_materials(V, F, np.zeros(2, np.int64), ["limestone"], self.look["kits"], 0.7, [],
                                      moss=np.array([True, False]))
        self.assertEqual([keys[i] for i in idx], ["moss_floor", "limestone_wall"])

    def test_formation_groups_scans_and_colours(self):
        kits = self.look["kits"]
        kind = np.array([0, 1, 2, 3, 5, 6, 7, 8, 9, 13, 14, 10, 12])
        geo = np.array([0, 0, 0, 0, 0, 0, 0, 1, 2, 1, -1, 0, 0])
        names = ["limestone", "skarn", "ice"]
        out = cb.form_split(kind, geo, names, kits, 0)
        self.assertEqual(sorted(out), [("crystal", "gypsum"), ("icicle", "ice"), ("pool", "flowstone"),
                                       ("rock", "limestone"), ("rock", "skarn"), ("speleothem", "flowstone")])
        self.assertEqual(list(out[("speleothem", "flowstone")]), [0, 1, 2, 4, 5, 6])
        self.assertEqual(list(out[("rock", "skarn")]), [9])
        self.assertEqual(sum(len(v) for v in out.values()), 11)   # the guards' and seam walls' proxies: none
        for group in cb.FORM_GROUPS:
            for g in core.load_json(os.path.join(UNDERMERE, "undermere.network.json"))["geology"]:
                c = cb.hex_lin(cb.form_albedo(group, g, "#9A958A"))
                hu = self.hue(c)
                self.assertTrue(hu is None or not (150.0 <= hu <= 190.0 or 250.0 <= hu <= 330.0), (group, g, hu))
        for name in ("um_gallery_form_speleothem_flowstone", "um_gallery_form_rock_limestone"):
            self.assertEqual(cb.name_problems([name]), [])


@unittest.skipIf(cb is None, "numpy is not installed")
class FloorShapeTest(unittest.TestCase):
    def test_route3_form_is_the_flat_term(self):
        il = {"form": 0.5, "form_ao": 1.0, "form_gamma": 1.0, "form_base": 1.0}
        ao = np.array([0.0, 0.5, 1.0])
        m = cb.floor_shape(np.array([0.0, 5.0, 0.01]), np.ones(3), ao, il)
        self.assertTrue(np.allclose(m, 1.0 + 0.5 * ao))
        del il["form_base"]
        self.assertTrue(np.allclose(cb.floor_shape(np.zeros(3), np.ones(3), ao, il), 1.0 + 0.5 * ao))

    def test_the_floor_carries_the_bake(self):
        look = cb.load_look()
        il = look["ink_lift"]
        have = np.array([0.0, 0.05, 0.2, 1.0, 10.0])
        m = cb.floor_shape(have, np.ones(5), np.ones(5), il)
        self.assertTrue(np.all(np.diff(m) > 0))                # more light baked, more lift
        self.assertLess(float(m[0]), 1.0 + float(il["form"]) * 0.1)   # far from every light: near the bare floor
        self.assertLessEqual(float(m[-1]), 1.0 + float(il["form"]) + 1e-9)
        crevice = cb.floor_shape(np.array([1.0]), np.ones(1), np.zeros(1), il)
        self.assertAlmostEqual(float(crevice[0]), 1.0 + float(il["form"]) * (1.0 - float(il["form_ao"])))

    def test_the_look_names_route3s_grade(self):
        look = cb.load_look()
        lt = look["lantern"]
        self.assertEqual((lt["route3_form"], lt["route3_texture_lift"], lt["route3_dark_percentile"]), (0.5, 0.45, 0.5))
        self.assertLess(look["weights"]["fill"], 0.5)
        self.assertEqual(look["weights"]["lamp"], 1.0)


@unittest.skipIf(cb is None, "numpy is not installed")
class HoldDarkTest(unittest.TestCase):
    """hold_dark with a stand-in for the WebP encoder (the real one needs Blender): a lossy encoder that pulls some
    texels darker. After the hold no encoded texel displays under the darkest kept texel under the floor's light, so
    the ink floor that holds that texel at ink holds them all; under the other lights the low texels are raised."""

    @staticmethod
    def scan(n=6000, seed=3, specks=True):
        rng = np.random.default_rng(seed)
        lin = 0.05 + 0.25 * rng.random((n, 3)) * np.array([1.0, 0.9, 0.8])
        if specks:
            red = rng.choice(n, 12, replace=False)
            lin[red] = np.array([0.08, 0.012, 0.01]) * (0.8 + 0.4 * rng.random((12, 1)))   # saturated red specks
        return lin

    @staticmethod
    def lossy(x):
        y = np.asarray(x, np.float64).copy()
        y[::37] *= 0.7             # the encoder pulls every 37th texel down 30 %
        return np.round(y * 4095.0) / 4095.0

    def display(self, cols, ref, probe, target):
        R = cb._rb()
        c = cb.hex_lin(probe)
        s = float(R.solve_display((ref * c)[None, :], target)[0])
        return R.lum(R.agx(cols * c[None, :] * s))

    def ink(self):
        R = cb._rb()
        return float(R.lum(np.array(cb.INK, float))) / 255.0

    def test_no_texel_displays_under_ink_at_the_floor(self):
        # the floor holds the darkest kept texel at ink plus the margin: every encoded texel then clears the ink
        lin, dec, dark, lows = cb.hold_dark(self.scan(), self.lossy, margin_luma=2.0)
        self.assertEqual(lin.shape, dec.shape)
        self.assertTrue(np.allclose(dec, self.lossy(lin)))         # dec is what the encoder makes of the saved texels
        d = self.display(dec, dark, cb.FLOOR_PROBE, self.ink() + 2.0 / 255.0)
        self.assertGreaterEqual(float(d.min()), self.ink() - 1e-4)

    def test_an_encoder_the_hold_cannot_beat_raises_the_floor_only_as_needed(self):
        def stubborn(x):
            y = np.asarray(x, np.float64).copy()
            y[7] = y[7] * 0.0 + 0.004                              # one texel the encoder always makes near black
            return y
        src = self.scan()
        _lin, dec, dark, lows = cb.hold_dark(src, stubborn, rounds=3)
        self.assertEqual(len(lows), 4)
        self.assertGreater(lows[-2], 0)
        self.assertGreater(lows[-1], 1.0)
        ink_t = self.ink() + 2.0 / 255.0
        d = self.display(dec, dark, cb.FLOOR_PROBE, ink_t)
        self.assertGreaterEqual(float(d.min()), self.ink() - 1e-4)  # still clears the ink, with a darker kept texel
        self.assertLess(float(d.min()), self.ink() + 1e-3)          # and no darker than that texel needs

    def test_the_hold_lifts_the_specks_under_every_light(self):
        src = self.scan(specks=False)
        ref = src[cb.kept_dark(src, cb.hex_lin(cb.FLOOR_PROBE))]
        lin, dec, _dark, lows = cb.hold_dark(src, self.lossy, margin_luma=2.0)
        self.assertGreater(lows[0], 0)                             # the encoder's low texels
        self.assertEqual(lows[-2], 0)
        self.assertEqual(lows[-1], 1.0)
        for p in cb.PROBES:
            d = self.display(dec, ref, p, self.ink() + 2.0 / 255.0)
            self.assertGreaterEqual(float(d.min()), self.ink() - 1e-4, p)
        moved = np.any(lin > src + 1e-12, axis=1)
        self.assertLess(moved.mean(), 0.05)                        # the scan keeps its look: a few texels raised
        self.assertTrue(np.all(lin >= src - 1e-12))                # never darkened

    def test_kept_dark_is_the_least_display(self):
        R = cb._rb()
        dec = self.lossy(self.scan())
        i0 = cb.kept_dark(dec, cb.hex_lin("#FFFFFF"))
        self.assertEqual(i0, int(np.argmin(R.lum(R.agx(dec * 10.0)))))

if __name__ == "__main__":
    unittest.main()
