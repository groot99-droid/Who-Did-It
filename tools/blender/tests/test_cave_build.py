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

    def test_face_materials_split_by_kit_and_surface(self):
        V = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [10, 10, 0], [11, 10, 0], [10, 11, 0]], float)
        F = np.array([[0, 1, 2], [0, 3, 1], [4, 5, 6]])
        geo = np.array([0, 0, 1])
        keys, idx = cb.face_materials(V, F, geo, ["limestone", "lakeclay"], self.look["kits"], 0.7, [])
        self.assertEqual([keys[i] for i in idx], ["limestone_floor", "limestone_wall", "lakeclay_wall"])
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


if __name__ == "__main__":
    unittest.main()
