"""The cave shell's lightmap, the plain-Python part (meshy_cave_lightmap.py): charts, the resolution rule, the packing,
the rasterizer, the padding, the seam weight and the GLB patch. Run: python -m unittest tests.test_cave_lightmap"""

import json
import math
import os
import struct
import sys
import tempfile
import unittest

try:
    import numpy as np
except ImportError:  # no numpy here (plain CI image): skip the whole module
    raise unittest.SkipTest("numpy is not installed")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import meshy_cave_lightmap as lm  # noqa: E402


def grid(nx: int, ny: int, step: float = 0.125, z: float = 0.0, up: bool = True):
    """A flat grid of triangles in the plane z, facing up (or down)."""
    xs, ys = np.meshgrid(np.arange(nx + 1) * step, np.arange(ny + 1) * step)
    V = np.stack([xs.ravel(), ys.ravel(), np.full(xs.size, z)], axis=1)
    F = []
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            b, c, d = a + 1, a + nx + 1, a + nx + 2
            F += [(a, b, d), (a, d, c)] if up else [(a, d, b), (a, c, d)]
    return V, np.array(F, np.int64)


def box(lo, hi):
    """A closed box's 8 vertices and 12 outward triangles."""
    x0, y0, z0 = lo
    x1, y1, z1 = hi
    V = np.array([[x, y, z] for z in (z0, z1) for y in (y0, y1) for x in (x0, x1)], float)
    F = np.array([(0, 2, 3), (0, 3, 1), (4, 5, 7), (4, 7, 6), (0, 1, 5), (0, 5, 4), (2, 6, 7), (2, 7, 3),
                  (0, 4, 6), (0, 6, 2), (1, 3, 7), (1, 7, 5)], np.int64)
    return V, F


class Charts(unittest.TestCase):
    def test_box_has_six_charts_one_per_side(self):
        V, F = box((0, 0, 0), (2, 3, 4))
        chart, d = lm.charts(V, F, np.zeros(len(F), np.int64))
        self.assertEqual(len(set(chart.tolist())), 6)
        for c in set(chart.tolist()):
            self.assertEqual(len(set(d[chart == c].tolist())), 1)
        self.assertEqual(sorted(set(d.tolist())), [0, 1, 2, 3, 4, 5])

    def test_a_flat_grid_is_one_chart_split_by_group_tile_and_seam(self):
        V, F = grid(16, 8)            # 2 m x 1 m
        chart, _d = lm.charts(V, F, np.zeros(len(F), np.int64))
        self.assertEqual(len(set(chart.tolist())), 1)
        g = (V[F].mean(axis=1)[:, 0] > 1.0).astype(np.int64)
        chart, _d = lm.charts(V, F, g)
        self.assertEqual(len(set(chart.tolist())), 2)
        chart, _d = lm.charts(V, F, np.zeros(len(F), np.int64), tile_m=0.5)
        self.assertEqual(len(set(chart.tolist())), 8)
        chart, _d = lm.charts(V, F, np.zeros(len(F), np.int64), planes=[("s", 0, 0.75, 1.0)])
        self.assertEqual(len(set(chart.tolist())), 2)
        C = V[F].mean(axis=1)
        for c in set(chart.tolist()):     # no chart straddles the seam plane
            side = C[chart == c, 0] > 0.75
            self.assertTrue(side.all() or (~side).all())

    def test_facing_up_and_down_never_share_a_chart(self):
        V1, F1 = grid(4, 4, up=True)
        V2, F2 = grid(4, 4, up=False)
        V = np.concatenate([V1, V2])
        F = np.concatenate([F1, F2 + len(V1)])
        chart, d = lm.charts(V, F, np.zeros(len(F), np.int64))
        self.assertEqual(set(d[: len(F1)].tolist()), {4})
        self.assertEqual(set(d[len(F1):].tolist()), {5})
        self.assertFalse(set(chart[: len(F1)].tolist()) & set(chart[len(F1):].tolist()))

    def test_components(self):
        lab = lm.components(6, np.array([0, 1, 4]), np.array([1, 2, 5]))
        self.assertEqual(lab.tolist(), [0, 0, 0, 3, 4, 4])


class Rule(unittest.TestCase):
    def test_tpm_rule(self):
        self.assertEqual(lm.tpm_for(10.0), lm.TPM_MAX)
        self.assertEqual(lm.tpm_for(1e9), lm.TPM_MIN)
        t = lm.tpm_for(2710.0, 2048, 0.46)
        self.assertTrue(lm.TPM_MIN <= t <= lm.TPM_MAX)
        self.assertAlmostEqual(t, np.floor(2 * np.sqrt(0.46 * 2048 ** 2 / 2710.0)) / 2)
        self.assertEqual(lm.tpm_for(0.0), lm.TPM_MAX)

    def test_page_and_file_limits(self):
        # the page is never over MAX_SIDE and a 2048 x 2048 RGBA8 page without mips is 16.8 MB of GPU memory
        self.assertLessEqual(lm.MAX_SIDE, 2048)
        self.assertEqual(lm.SAMPLER_LM["minFilter"], 9729)   # LINEAR: no mip chain, no bleeding between charts


class Packing(unittest.TestCase):
    def test_pack_keeps_rectangles_apart_and_inside(self):
        rng = np.random.default_rng(3)
        size = rng.integers(1, 40, size=(300, 2))
        org, W, H = lm.pack(size, pad=2)
        self.assertLessEqual(W, lm.MAX_SIDE)
        rect = np.concatenate([org - 2, org + size + 2], axis=1)
        self.assertTrue((rect[:, :2] >= 0).all())
        self.assertTrue((rect[:, 2] <= W).all() and (rect[:, 3] <= H).all())
        own = np.zeros((H, W), np.int64)
        for x0, y0, x1, y1 in rect.tolist():
            own[y0:y1, x0:x1] += 1
        self.assertLessEqual(int(own.max()), 1)

    def test_pack_refuses_what_does_not_fit(self):
        self.assertIsNone(lm.pack(np.array([[3000, 10]]), pad=2))


class Raster(unittest.TestCase):
    def test_every_texel_inside_a_face_and_padding_from_its_own_chart(self):
        V1, F1 = grid(8, 8)
        V2, F2 = box((3, 3, 0), (4, 5, 1))
        V = np.concatenate([V1, V2])
        F = np.concatenate([F1, F2 + len(V1)])
        lay = lm.layout(V, F, np.zeros(len(F), np.int64), tpm=16.0)
        W, H = lay["W"], lay["H"]
        face, bary = lm.rasterize(lay["tex"], W, H)
        filled = face >= 0
        self.assertGreater(int(filled.sum()), 0)
        # a filled texel's barycentric point reproduces its centre
        ys, xs = np.nonzero(filled)
        f = face[ys, xs]
        p = (lay["tex"][f] * bary[ys, xs][:, :, None]).sum(axis=1)
        self.assertLess(float(np.abs(p - np.stack([xs + 0.5, ys + 0.5], axis=1)).max()), 1e-4)
        # every face has a texel of its own or a chart-mate's
        own = lm.owner_map(lay["rect"], W, H)
        chart_of = np.where(filled, lay["chart"][np.maximum(face, 0)], -1)
        self.assertEqual(set(chart_of[filled].tolist()), set(range(lay["charts"])))
        self.assertTrue((own[filled] == chart_of[filled]).all())
        # the padding takes its chart's value, never another's
        vals = np.zeros((H, W, 1))
        vals[filled, 0] = chart_of[filled] + 1.0
        out, f2 = lm.dilate(vals, filled, own)
        ring = f2 & ~filled
        self.assertGreater(int(ring.sum()), 0)
        self.assertTrue(np.allclose(out[ring, 0], own[ring] + 1.0))

    def test_tiny_faces_still_have_light(self):
        V = np.array([[0, 0, 0], [0.01, 0, 0], [0, 0.01, 0]], float)
        F = np.array([[0, 1, 2]], np.int64)
        lay = lm.layout(V, F, np.zeros(1, np.int64), tpm=8.0)
        face, _b = lm.rasterize(lay["tex"], lay["W"], lay["H"])
        self.assertEqual(int((face >= 0).sum()), 1)

    def test_texels_per_metre(self):
        V, F = grid(16, 16)               # 2 m x 2 m
        lay = lm.layout(V, F, np.zeros(len(F), np.int64), tpm=20.0)
        face, _b = lm.rasterize(lay["tex"], lay["W"], lay["H"])
        self.assertAlmostEqual(int((face >= 0).sum()), 40 * 40, delta=2 * 40 + 1)

    def test_bilinear_and_interp(self):
        img = np.arange(12, dtype=float).reshape(3, 4, 1)
        self.assertAlmostEqual(float(lm.bilinear(img, np.array([[1.5, 1.5]]))[0, 0]), 5.0)
        self.assertAlmostEqual(float(lm.bilinear(img, np.array([[2.0, 1.5]]))[0, 0]), 5.5)
        vals = np.array([[0.0], [1.0], [2.0]])
        out = lm.interp(vals, np.array([[0, 1, 2]]), np.array([0]), np.array([[0.2, 0.3, 0.5]]))
        self.assertAlmostEqual(float(out[0, 0]), 1.3)

    def test_smooth_stays_in_its_chart(self):
        vals = np.zeros((4, 4, 3))
        vals[:, :2] = 1.0
        filled = np.ones((4, 4), bool)
        chart = np.zeros((4, 4), np.int64)
        chart[:, 2:] = 1
        out = lm.smooth(vals, filled, chart, passes=3)
        self.assertTrue(np.allclose(out[:, :2], 1.0) and np.allclose(out[:, 2:], 0.0))
        chart[:] = 0
        out = lm.smooth(vals, filled, chart, passes=1)
        self.assertLess(float(out[0, 1, 0]), 1.0)


class Seams(unittest.TestCase):
    def test_seam_weight(self):
        P = np.array([[10.0, 0, 0], [9.5, 0, 0], [8.0, 0, 0], [10.5, 0, 0]])
        w = lm.seam_weight(P, [("s", 0, 10.0, 1.0)], hold=0.0)
        self.assertEqual(w.tolist(), [0.0, 0.5, 1.0, 0.0])
        w = lm.seam_weight(P, [("s", 0, 10.0, -1.0)], hold=0.0)
        self.assertEqual(w.tolist(), [0.0, 0.0, 0.0, 0.5])
        # with the hold, 0.6 m inside the plane both files still show the shared light alone
        w = lm.seam_weight(np.array([[9.5, 0, 0], [9.0, 0, 0], [8.0, 0, 0]]), [("s", 0, 10.0, 1.0)], hold=0.6)
        self.assertTrue(np.allclose(w, [0.0, 0.4, 1.0]))
        self.assertEqual(lm.seam_weight(P, []).tolist(), [1.0] * 4)

    def test_a_seam_is_local_to_its_window(self):
        # window across the plane (y from -2 to 2, z from 0 to 3), stub 5 m: far along y, or past the stub, the plane
        # does not touch the light, and the charts are not split there
        sm = ("s", 0, 10.0, 1.0, (-2.0, 0.0, 2.0, 3.0), 5.0)
        P = np.array([[10.0, 0, 1], [9.5, 0, 1], [10.0, 40, 1], [12.0, 0, 1], [30.0, 0, 1], [9.5, 0, 20]])
        self.assertEqual(lm.seam_weight(P, [sm], hold=0.0).tolist(), [0.0, 0.5, 1.0, 0.0, 1.0, 1.0])
        self.assertEqual(lm.seam_side(P, [sm]).tolist(), [0, 0, 0, 1, 0, 0])

    def test_two_files_show_the_same_light_on_the_plane(self):
        # the same overlap faces in two files with their own texel light and the same (stitched) vertex light:
        # on the plane both take the vertex light alone
        V, F = grid(8, 8)
        P = V[F].mean(axis=1)
        VL = np.linspace(0.1, 0.5, len(V))[:, None] * np.ones((1, 3))
        own_a, own_b = np.full((len(F), 3), 0.2), np.full((len(F), 3), 0.7)
        plane = [("s", 0, 0.5, 1.0)]
        w = lm.seam_weight(P, plane, hold=0.0)
        bary = np.full((len(F), 3), 1.0 / 3.0)
        shared = lm.interp(VL, F, np.arange(len(F)), bary)
        a = w[:, None] * own_a + (1 - w[:, None]) * shared
        w_b = lm.seam_weight(P, [("s", 0, 0.5, -1.0)], hold=0.0)
        b = w_b[:, None] * own_b + (1 - w_b[:, None]) * shared
        on = np.abs(P[:, 0] - 0.5) < 0.07
        self.assertTrue(on.any())
        on_plane = (w == 0) & (w_b == 0)
        self.assertTrue(np.allclose(a[on_plane], b[on_plane]))
        # with the hold every face within it shows the same light in both files
        w = lm.seam_weight(P, plane)
        w_b = lm.seam_weight(P, [("s", 0, 0.5, -1.0)])
        near = np.abs(P[:, 0] - 0.5) < lm.SEAM_HOLD_M
        self.assertTrue(np.all(w[near] == 0) and np.all(w_b[near] == 0))


class Glb(unittest.TestCase):
    def make(self, path: str, with_uv1: bool = True, with_c0: bool = False):
        attrs = {"POSITION": 0, "TEXCOORD_0": 1}
        if with_uv1:
            attrs["TEXCOORD_1"] = 2
        if with_c0:
            attrs["COLOR_0"] = 3
        js = {"asset": {"version": "2.0"}, "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0}],
              "meshes": [{"name": "chunk", "primitives": [{"attributes": attrs, "material": 0}]},
                         {"name": "form", "primitives": [{"attributes": {"POSITION": 0, "COLOR_0": 3},
                                                          "material": 1}]}],
              "materials": [{"name": "cave_limestone_wall", "extensions": {"KHR_materials_unlit": {}}},
                            {"name": "cave_piece_rock_01", "extensions": {"KHR_materials_unlit": {}}}],
              "buffers": [{"byteLength": 8}], "bufferViews": [{"buffer": 0, "byteOffset": 0, "byteLength": 8}],
              "extensionsUsed": ["KHR_materials_unlit"]}
        lm.write_glb(path, js, b"\x01" * 8)

    def test_patch(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "a.glb")
            self.make(p)
            webp = b"RIFF0000WEBPVP8L" + b"\x00" * 7
            rep = lm.patch_glb(p, [{"bytes": webp, "name": "page", "scale": 0.4}], {"cave_limestone_wall": 0},
                               scene_extras={"wdi_lantern": True})
            js, bin_ = lm.read_glb(p)
            self.assertEqual(rep["bytes"], os.path.getsize(p))
            m = js["materials"][0]
            t = js["textures"][m["emissiveTexture"]["index"]]
            self.assertEqual(m["emissiveTexture"]["texCoord"], 1)
            self.assertEqual(m["emissiveFactor"], [0.4, 0.4, 0.4])
            self.assertEqual(m["extras"]["wdi_lightmap"], {"page": 0, "texCoord": 1, "scale": 0.4, "encoding": "srgb"})
            self.assertNotIn("emissiveTexture", js["materials"][1])
            img = js["images"][t["extensions"]["EXT_texture_webp"]["source"]]
            self.assertEqual(img["mimeType"], "image/webp")
            bv = js["bufferViews"][img["bufferView"]]
            self.assertEqual(bytes(bin_[bv["byteOffset"]:bv["byteOffset"] + bv["byteLength"]]), webp)
            self.assertEqual(bv["byteOffset"] % 4, 0)
            self.assertEqual(js["samplers"][t["sampler"]], lm.SAMPLER_LM)
            self.assertIn("EXT_texture_webp", js["extensionsRequired"])
            self.assertEqual(js["scenes"][0]["extras"], {"wdi_lantern": True})
            self.assertEqual(js["buffers"][0]["byteLength"], len(bin_))
            with open(p, "rb") as fh:
                b = fh.read()
            self.assertEqual(struct.unpack("<I", b[8:12])[0], len(b))
            facts = lm.glb_lightmap_facts(p)
            self.assertEqual((facts["primitives_with_uv1"], facts["primitives_without_uv1"]), (1, 0))
            self.assertEqual(facts["primitives_with_color0"], 0)
            json.dumps(facts)

    def test_patch_marks_the_vertex_fallback(self):
        # the shell keeps its vertex light in COLOR_0 beside the page: the material says so, for the viewer
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "a.glb")
            self.make(p, with_c0=True)
            lm.patch_glb(p, [{"bytes": b"x" * 4, "name": "page", "scale": 0.5}], {"cave_limestone_wall": 0})
            js, _b = lm.read_glb(p)
            self.assertEqual(js["materials"][0]["extras"]["wdi_lightmap"],
                             {"page": 0, "texCoord": 1, "scale": 0.5, "encoding": "srgb", "vertex_fallback": True})
            self.assertNotIn("extras", js["materials"][1])
            self.assertEqual(lm.glb_lightmap_facts(p)["primitives_with_color0"], 1)

    def test_patch_without_color0_has_no_vertex_fallback_and_may_note_where_the_occlusion_is(self):
        # since the realism pass's second round the shell's primitives carry no COLOR_0: the page is the only light, the
        # material says no vertex_fallback, and the occlusion note is only written when the caller gives one
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "a.glb")
            self.make(p, with_c0=False)
            lm.patch_glb(p, [{"bytes": b"x" * 4, "name": "page", "scale": 0.5}], {"cave_limestone_wall": 0})
            js, _b = lm.read_glb(p)
            self.assertNotIn("vertex_fallback", js["materials"][0]["extras"]["wdi_lightmap"])
            self.assertNotIn("ao", js["materials"][0]["extras"]["wdi_lightmap"])
            self.assertEqual(lm.glb_lightmap_facts(p)["primitives_with_color0"], 0)
            self.make(p, with_c0=False)
            lm.patch_glb(p, [{"bytes": b"x" * 4, "name": "page", "scale": 0.5}], {"cave_limestone_wall": 0}, ao="_OCCL")
            js, _b = lm.read_glb(p)
            self.assertEqual(js["materials"][0]["extras"]["wdi_lightmap"]["ao"], "_OCCL")

    def test_the_seam_hold_covers_the_reach_of_a_shell_face(self):
        # the seam check compares the light 0.6 m from the plane; a face whose centre is that near has all its vertices
        # within the hold, or the two files draw it differently (page in one, vertex light in the other)
        self.assertGreaterEqual(lm.SEAM_HOLD_M, 0.6 + 0.3)
        P = np.array([[10.0 - 0.6 - 0.28, 0, 0], [10.0 - 0.9, 0, 0], [10.0 - 1.2, 0, 0]])
        w = lm.seam_weight(P, [("s", 0, 10.0, 1.0)])
        self.assertEqual(float(w[0]), 0.0)    # a vertex 0.28 m past the 0.6 m window: still the shared light alone
        self.assertAlmostEqual(float(w[1]), 0.0)
        self.assertGreater(float(w[2]), 0.0)  # and the page fades in beyond the hold

    def test_patch_refuses_a_lit_material_without_uv1(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "a.glb")
            self.make(p, with_uv1=False)
            with self.assertRaises(ValueError):
                lm.patch_glb(p, [{"bytes": b"x" * 4, "name": "page", "scale": 1.0}], {"cave_limestone_wall": 0})
            with self.assertRaises(ValueError):
                lm.patch_glb(p, [], {"no_such": 0})

    def test_scene_extras_alone(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "a.glb")
            self.make(p)
            lm.patch_glb(p, [], {}, scene_extras={"wdi_lantern": True})
            js, _b = lm.read_glb(p)
            self.assertNotIn("samplers", js)
            self.assertEqual(js["scenes"][0]["extras"]["wdi_lantern"], True)

    def test_srgb_decode(self):
        x = np.array([0.0, 0.04045, 0.5, 1.0])
        lin = lm.srgb_decode(x)
        back = np.where(lin <= 0.0031308, 12.92 * lin, 1.055 * lin ** (1 / 2.4) - 0.055)
        self.assertTrue(np.allclose(back, x, atol=1e-6))


class SoftSeams(unittest.TestCase):
    def test_the_seam_weight_has_no_hard_edge(self):
        # walking along the plane's band out of the window's region, the weight rises to 1 over SEAM_RAMP_M, in
        # steps no bigger than the walk's own over the ramp
        sm = ("s", 0, 10.0, 1.0, (-2.0, 0.0, 2.0, 3.0), 5.0)
        y = np.linspace(-10.0, 10.0, 2001)
        P = np.stack([np.full_like(y, 9.7), y, np.full_like(y, 1.0)], axis=1)
        w = lm.seam_weight(P, [sm], hold=0.0)
        step = (y[1] - y[0]) / lm.SEAM_RAMP_M
        self.assertLessEqual(float(np.abs(np.diff(w)).max()), step * (1 - 0.3) + 1e-9)
        self.assertAlmostEqual(float(w[1000]), 0.3, places=6)     # at y 0, 0.3 m inside: its own share 0.3
        self.assertEqual(float(w[0]), 1.0)

    def test_region_flags_stay_for_the_charts(self):
        sm = ("s", 0, 10.0, 1.0, (-2.0, 0.0, 2.0, 3.0), 5.0)
        P = np.array([[12.0, 4.9, 1.0], [12.0, 5.1, 1.0]])
        _s, inr = lm.seam_region(P, sm)
        self.assertEqual(inr.tolist(), [True, False])
        _s, soft = lm.seam_soft(P, sm)
        self.assertLess(float(soft[0]), 0.2)
        self.assertEqual(float(soft[1]), 0.0)


class Floor(unittest.TestCase):
    def test_relaxed_ratio_is_continuous_and_never_over_its_own(self):
        V, F = grid(32, 4)                       # 4 m along x
        C = V[F].mean(axis=1)
        r_face = np.where(C[:, 0] < 2.0, 0.4, 0.5)
        r = lm.relax_floor(V, F, r_face, per_m=0.25)
        own = np.full(len(V), np.inf)
        for k in range(3):
            np.minimum.at(own, F[:, k], r_face)
        self.assertTrue(np.all(r <= own + 1e-12))
        # Lipschitz in log along x: at most exp(0.25) a metre
        o = np.argsort(V[:, 0])
        lr, x = np.log(r[o]), V[o, 0]
        d = np.abs(np.diff(lr))
        dx = np.diff(x)
        ok = dx > 1e-9
        self.assertTrue(np.all(d[ok] <= 0.25 * dx[ok] + 1e-9))
        # from the edge at x 2 the ratio rises by exp(0.25) a metre along x until it meets the face's own 0.5
        self.assertAlmostEqual(float(r[np.argmin(np.abs(V[:, 0] - 2.5))]), 0.4 * math.exp(0.125), places=6)
        self.assertAlmostEqual(float(r[np.argmin(np.abs(V[:, 0] - 4.0))]), 0.5, places=9)
        self.assertAlmostEqual(float(r[0]), 0.4)

    def test_vertices_at_the_same_place_are_one(self):
        # two strips with their own vertices along x = 1 (as chunks and materials split them)
        Va, Fa = grid(8, 2)
        Vb, Fb = grid(8, 2)
        Vb = Vb + np.array([1.0, 0.0, 0.0])
        V = np.concatenate([Va, Vb])
        F = np.concatenate([Fa, Fb + len(Va)])
        r_face = np.concatenate([np.full(len(Fa), 0.4), np.full(len(Fb), 0.6)])
        r = lm.relax_floor(V, F, r_face, per_m=0.5)
        on = np.abs(V[:, 0] - 1.0) < 1e-9
        self.assertTrue(np.allclose(r[on], 0.4))


class Borders(unittest.TestCase):
    def two_charts(self, va: float, vb: float):
        # a 2 m x 1 m grid cut in two charts at x = 1, each chart's light constant
        V, F = grid(16, 8)
        g = (V[F].mean(axis=1)[:, 0] > 1.0).astype(np.int64)
        lay = lm.layout(V, F, g, tpm=16.0)
        face, _b = lm.rasterize(lay["tex"], lay["W"], lay["H"])
        own = lm.owner_map(lay["rect"], lay["W"], lay["H"])
        vals = np.zeros((lay["H"], lay["W"], 1))
        ch = np.where(face >= 0, lay["chart"][np.maximum(face, 0)], -1)
        first = lay["chart"][np.argmax(g == 0)]
        vals[ch == first] = va
        vals[(ch >= 0) & (ch != first)] = vb
        img, _f = lm.dilate(vals, face >= 0, own)
        be = lm.border_edges(V, F, lay["tex"], lay["chart"])
        return img, be, lay

    def test_border_edges_pair_the_same_points(self):
        _img, be, lay = self.two_charts(1.0, 1.0)
        self.assertEqual(be["edges"], 8)           # eight cell edges along x = 1
        self.assertGreaterEqual(len(be["a"]), 16)
        # both sides of a sample are the same distance along the edge (y in metres x tpm)
        self.assertTrue(np.allclose(np.sort(be["a"][:, 1] % 1.0), np.sort(be["b"][:, 1] % 1.0)))

    def test_stitch_makes_both_sides_read_the_same(self):
        img, be, _lay = self.two_charts(0.2, 0.3)
        gap0 = lm.border_gaps(img, be)
        self.assertGreater(float(gap0.max()), 0.3)
        out = lm.stitch_edges(img, be, iters=24)
        gap = lm.border_gaps(out, be)
        self.assertLess(float(gap.max()), 0.01)
        # only the texels the border samples read change: well inside each chart the light is its own
        ia, _wa = lm.bilinear_taps(be["a"], img.shape[1], img.shape[0])
        ib, _wb = lm.bilinear_taps(be["b"], img.shape[1], img.shape[0])
        moved = np.abs(out - img).reshape(-1) > 1e-12
        allowed = np.zeros(moved.shape, bool)
        allowed[np.concatenate([ia, ib]).ravel()] = True
        self.assertFalse(np.any(moved & ~allowed))

    def test_gaps_under_each_sides_scale(self):
        img, be, _lay = self.two_charts(0.2, 0.4)
        img3 = np.repeat(img, 3, axis=2)
        n = len(be["a"])
        gap = lm.border_gaps(img3, be, np.full(n, 0.2), np.full(n, 0.4))
        self.assertLess(float(np.percentile(gap, 50)), 1e-9)

    def test_a_flat_light_is_left_alone(self):
        img, be, _lay = self.two_charts(0.25, 0.25)
        out = lm.stitch_edges(img, be)
        self.assertTrue(np.allclose(out, img))


if __name__ == "__main__":
    unittest.main()
