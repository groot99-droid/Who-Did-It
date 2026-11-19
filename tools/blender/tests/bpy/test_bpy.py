"""Tests that need the `bpy` module (round 11, T1). Run them with the wheel's Python, from the repo root:

    bash tools/blender/setup.sh
    EGL_PLATFORM=surfaceless tools/blender/.venv/bin/python -m unittest discover -s tools/blender/tests/bpy -v

The plain-Python suite (`pnpm --filter @wdi/blender test`) does not reach this folder, and without `bpy` these
tests skip with that reason. They check the plumbing every render session stands on: the rig opens, a GLB
imports, an orthographic frame at the isometric pitch comes out at the size asked with an alpha channel, and
two runs write the same bytes."""

import base64
import hashlib
import math
import os
import struct
import sys
import tempfile
import unittest
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", ".."))
os.environ.setdefault("EGL_PLATFORM", "surfaceless")

try:
    import bpy
except ImportError:  # pragma: no cover
    bpy = None

FIXTURE = os.path.join(HERE, "fixtures", "tiny.glb.b64")
SIZE = 128


def png_info(path: str) -> tuple[int, int, int, bytes]:
    """Width, height, colour type and the raw (unfiltered-by-us) IDAT payload of an 8-bit PNG."""
    with open(path, "rb") as f:
        data = f.read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    pos, idat, w = 8, b"", None
    while pos < len(data):
        n, kind = struct.unpack(">I4s", data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + n]
        if kind == b"IHDR":
            w, h, depth, ctype = struct.unpack(">IIBB", body[:10])
            assert depth == 8
        elif kind == b"IDAT":
            idat += body
        pos += 12 + n
    return w, h, ctype, zlib.decompress(idat)


def alpha_extremes(path: str) -> tuple[int, int]:
    """(count of fully clear pixels, count of opaque-ish pixels) of an 8-bit RGBA PNG, unfiltering the rows."""
    w, h, ctype, raw = png_info(path)
    assert ctype == 6
    bpp, stride = 4, w * 4
    prev, rows, pos = bytearray(stride), [], 0
    for _ in range(h):
        ft, line = raw[pos], bytearray(raw[pos + 1:pos + 1 + stride])
        pos += 1 + stride
        for i in range(stride):
            a = line[i - bpp] if i >= bpp else 0
            b = prev[i]
            c = prev[i - bpp] if i >= bpp else 0
            if ft == 1:
                line[i] = (line[i] + a) & 255
            elif ft == 2:
                line[i] = (line[i] + b) & 255
            elif ft == 3:
                line[i] = (line[i] + ((a + b) >> 1)) & 255
            elif ft == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 255
        rows.append(line)
        prev = line
    alphas = [row[i] for row in rows for i in range(3, stride, 4)]
    return sum(1 for a in alphas if a == 0), sum(1 for a in alphas if a > 127)


def import_fixture() -> list:
    before = set(bpy.data.objects)
    with open(FIXTURE) as f, tempfile.TemporaryDirectory() as tmp:
        glb = os.path.join(tmp, "tiny.glb")
        with open(glb, "wb") as out:
            out.write(base64.b64decode(f.read()))
        bpy.ops.import_scene.gltf(filepath=glb)
    return [o for o in bpy.data.objects if o not in before]


def strip_metadata(scene) -> None:
    """Blender writes the date and the render time into the PNG's tEXt chunks; the pixels are the same, the bytes
    are not. Every stamp field off leaves the pixel data as the only thing that can differ."""
    for name in dir(scene.render):
        if name.startswith("use_stamp_") and name != "use_stamp":
            setattr(scene.render, name, False)


def render_fixture(out: str) -> None:
    """A fresh rig, the fixture under IsoCam on the turntable, one frame at SIZE x SIZE written to `out`."""
    import build_rig

    scene = build_rig.build()
    bpy.data.collections["Calibration"].hide_render = True
    for ob in import_fixture():
        if ob.parent is None:
            ob.parent = bpy.data.objects["TT"]
    scene.camera = bpy.data.objects["IsoCam"]
    scene.render.resolution_x = scene.render.resolution_y = SIZE
    strip_metadata(scene)
    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)


@unittest.skipIf(bpy is None, "bpy is not installed (bash tools/blender/setup.sh)")
class BpyTests(unittest.TestCase):
    def test_the_wheel_is_the_pinned_version(self):
        self.assertEqual(bpy.app.version[:2], (5, 2))

    def test_the_rig_opens(self):
        import build_rig

        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "rig.blend")
            build_rig.build(path)
            bpy.ops.wm.read_factory_settings(use_empty=True)
            bpy.ops.wm.open_mainfile(filepath=path)
        names = set(bpy.data.objects.keys())
        self.assertTrue({"IsoCam", "TileCam", "TT", "Feet"} <= names, names)
        self.assertIn("WDI_Toon", bpy.data.node_groups)
        self.assertIn("OutlineInk", bpy.data.materials)
        cam = bpy.data.objects["IsoCam"]
        self.assertEqual(cam.data.type, "ORTHO")
        self.assertAlmostEqual(math.degrees(cam.rotation_euler.x), 60.0, places=3)
        self.assertAlmostEqual(math.degrees(cam.rotation_euler.z), 45.0, places=3)

    def test_a_glb_imports(self):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        meshes = [o for o in import_fixture() if o.type == "MESH"]
        self.assertEqual(len(meshes), 2)
        self.assertTrue(all(len(o.data.vertices) > 0 for o in meshes))
        self.assertEqual({m.name for o in meshes for m in o.data.materials}, {"FixtureRed"})

    def test_an_isometric_frame_has_the_size_and_an_alpha_channel(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = os.path.join(tmp, "frame.png")
            render_fixture(out)
            w, h, ctype, _ = png_info(out)
            self.assertEqual((w, h), (SIZE, SIZE))
            self.assertEqual(ctype, 6, "colour type 6 is RGBA")
            clear, solid = alpha_extremes(out)
            self.assertGreater(clear, SIZE * SIZE // 4, "the corners are transparent")
            self.assertGreater(solid, 200, "the model is drawn")

    def test_two_runs_write_identical_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            digests = []
            for i in range(2):
                out = os.path.join(tmp, f"frame{i}.png")
                render_fixture(out)
                with open(out, "rb") as f:
                    digests.append(hashlib.sha256(f.read()).hexdigest())
        self.assertEqual(digests[0], digests[1])


if __name__ == "__main__":
    unittest.main()
