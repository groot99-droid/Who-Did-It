"""The figure rig under `bpy` (round 11, F1). Run with the wheel's Python, from the repo root:

    bash tools/blender/setup.sh
    EGL_PLATFORM=surfaceless tools/blender/.venv/bin/python -m unittest tools/blender/tests/test_figures_bpy.py -v

Without `bpy` (the plain-Python suite) every test here skips. The model is built by the test: a 1.7 m figure of boxes
on a rig like the generators' (hips, a spine that branches into the neck and both shoulders, two legs), a looping
walk named like Meshy's, and the stray unskinned sphere both generators leave in their files. Nothing is checked in
and nothing is taken from anywhere. One test also renders the locked baker when `models/fetch_models.py` has fetched
it."""

import hashlib
import json
import math
import os
import sys
import tempfile
import unittest
from types import SimpleNamespace

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..", "..")
sys.path.insert(0, os.path.join(HERE, ".."))
os.environ.setdefault("EGL_PLATFORM", "surfaceless")

try:
    import bpy

    if not hasattr(bpy, "app"):  # the plain suite finds the folder tests/bpy/ as a namespace package named bpy
        bpy = None
except ImportError:  # pragma: no cover
    bpy = None

import figures as fg  # noqa: E402
import rig_common as rc  # noqa: E402

TODAY = os.path.join(ROOT, "apps", "client", "public", "assets", "chars", "char_baker.json")
BAKER = os.path.join(HERE, "..", "build", "models", "char-models", "glb", "characters", "higgsfield_24bone",
                     "baker.glb")

# (name, parent, head, tail) in metres; the figure faces -Y, as a glTF import leaves it.
BONES = [
    ("Hips", None, (0, 0, 0.90), (0, 0, 1.05)),
    ("Spine", "Hips", (0, 0, 1.05), (0, 0, 1.25)),
    ("Chest", "Spine", (0, 0, 1.25), (0, 0, 1.42)),
    ("Neck", "Chest", (0, 0, 1.42), (0, 0, 1.50)),
    ("Head", "Neck", (0, 0, 1.50), (0, 0, 1.70)),
    ("ShoulderL", "Chest", (0.05, 0, 1.40), (0.20, 0, 1.40)),
    ("ArmL", "ShoulderL", (0.20, 0, 1.40), (0.24, 0, 0.95)),
    ("ShoulderR", "Chest", (-0.05, 0, 1.40), (-0.20, 0, 1.40)),
    ("ArmR", "ShoulderR", (-0.20, 0, 1.40), (-0.24, 0, 0.95)),
    ("LegL", "Hips", (0.10, 0, 0.90), (0.10, 0, 0.08)),
    ("FootL", "LegL", (0.10, 0, 0.08), (0.10, -0.15, 0.0)),
    ("LegR", "Hips", (-0.10, 0, 0.90), (-0.10, 0, 0.08)),
    ("FootR", "LegR", (-0.10, 0, 0.08), (-0.10, -0.15, 0.0)),
]
# A box per bone: (bone, centre, size). Feet reach the ground.
BOXES = [
    ("Hips", (0, 0, 0.97), (0.34, 0.20, 0.16)), ("Spine", (0, 0, 1.15), (0.36, 0.22, 0.22)),
    ("Chest", (0, 0, 1.33), (0.44, 0.24, 0.20)), ("Head", (0, -0.02, 1.58), (0.22, 0.24, 0.24)),
    ("ArmL", (0.23, 0, 1.18), (0.09, 0.09, 0.46)), ("ArmR", (-0.23, 0, 1.18), (0.09, 0.09, 0.46)),
    ("LegL", (0.10, 0, 0.50), (0.13, 0.13, 0.80)), ("LegR", (-0.10, 0, 0.50), (0.13, 0.13, 0.80)),
    ("FootL", (0.10, -0.05, 0.04), (0.11, 0.24, 0.08)), ("FootR", (-0.10, -0.05, 0.04), (0.11, 0.24, 0.08)),
]
COLOURS = {"Head": (0.85, 0.6, 0.45, 1), "ArmL": (0.85, 0.6, 0.45, 1), "ArmR": (0.85, 0.6, 0.45, 1)}
CYCLE = 24  # scene frames; the clip holds one cycle, keyed at 0 and 24 alike, as Meshy's do


def make_figure_glb(path: str) -> None:
    """Write the test figure: skinned boxes on BONES with a looping `Walking` clip and a stray unskinned sphere."""
    import bmesh

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = 24
    arm_data = bpy.data.armatures.new("Rig")
    arm = bpy.data.objects.new("Rig", arm_data)
    scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    for name, parent, head, tail in BONES:
        b = arm_data.edit_bones.new(name)
        b.head, b.tail = head, tail
        if parent:
            b.parent = arm_data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")

    mesh = bpy.data.meshes.new("Body")
    body = bpy.data.objects.new("Body", mesh)
    scene.collection.objects.link(body)
    bm = bmesh.new()
    groups = {}
    for bone, centre, size in BOXES:
        start = len(bm.verts)
        bmesh.ops.create_cube(bm, size=1.0, matrix=_box_matrix(centre, size))
        groups[bone] = list(range(start, start + 8))
    bm.to_mesh(mesh)
    bm.free()
    for bone, _c, _s in BOXES:
        mat = bpy.data.materials.new(f"M_{bone}")
        bsdf = mat.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = COLOURS.get(bone, (0.3, 0.35, 0.5, 1))
        mesh.materials.append(mat)
    for poly in mesh.polygons:
        poly.material_index = next(i for i, (b, _c, _s) in enumerate(BOXES) if poly.vertices[0] in groups[b])
    for bone, verts in groups.items():
        vg = body.vertex_groups.new(name=bone)
        vg.add(verts, 1.0, "REPLACE")
    body.parent = arm
    mod = body.modifiers.new("Armature", "ARMATURE")
    mod.object = arm

    bpy.ops.mesh.primitive_ico_sphere_add(radius=1.0, location=(0, 0, 0))  # the generators' stray sphere

    action = bpy.data.actions.new("Walking")
    arm.animation_data_create().action = action
    for f in range(0, CYCLE + 1, 3):
        a = math.sin(2.0 * math.pi * f / CYCLE)
        for bone, sign in (("LegL", 1), ("LegR", -1), ("ArmL", -1), ("ArmR", 1)):
            pb = arm.pose.bones[bone]
            pb.rotation_mode = "XYZ"
            pb.rotation_euler = (math.radians(28.0) * a * sign, 0.0, 0.0)
            pb.keyframe_insert("rotation_euler", frame=f)
    scene.frame_start, scene.frame_end = 0, CYCLE
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_animations=True, export_skins=True)


def _box_matrix(centre, size):
    from mathutils import Matrix

    m = Matrix.Diagonal((*size, 1.0))
    m.translation = centre
    return m


def render(glb: str, out: str, anims: str = "idle,walk", dirs: str = ",".join(rc.DIRECTIONS)) -> dict:
    import render_figures

    args = SimpleNamespace(model="testfigure", look="villager", glb=glb, out=out, anims=anims, dirs=dirs,
                           forward="-Y")
    return render_figures.render_figure(args)


def digest(path: str) -> str:
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


@unittest.skipIf(bpy is None, "bpy is not installed (bash tools/blender/setup.sh)")
class FigureRig(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.glb = os.path.join(cls.tmp.name, "figure.glb")
        make_figure_glb(cls.glb)
        cls.manifest = render(cls.glb, os.path.join(cls.tmp.name, "a"))
        cls.dir = os.path.join(cls.tmp.name, "a", "villager")

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_every_clip_renders_in_eight_directions(self):
        names = set(self.manifest["frames"])
        want = {rc.frame_name("villager", anim, d, k) for anim, (n, _loop) in fg.FIGURE_CLIPS.items()
                for d in rc.DIRECTIONS for k in range(n)}
        self.assertEqual(names, want)
        on_disk = {f[:-4] for f in os.listdir(os.path.join(self.dir, "body"))}
        self.assertEqual(on_disk, want)

    def test_frames_are_display_cells_with_alpha(self):
        img = bpy.data.images.load(os.path.join(self.dir, "body", rc.frame_name("villager", "idle", "s", 0) + ".png"))
        try:
            self.assertEqual(tuple(img.size), (rc.CELL_PX, rc.CELL_PX))
            self.assertEqual(img.channels, 4)
        finally:
            bpy.data.images.remove(img)

    def test_the_manifest_is_the_packers_and_halves_to_todays_cell_and_pivot(self):
        m = self.manifest
        with open(os.path.join(self.dir, "manifest.json")) as fh:
            self.assertEqual(json.load(fh), json.loads(json.dumps(m)))
        self.assertEqual((m["body"], m["passes"], m["fps"]), ("villager", ["body"], rc.OUTPUT_FPS))
        # tools/sprites `pixel` halves cell and feet; pack.ts writes feet / cell as the pivot (gen-anims.ts)
        with open(TODAY) as fh:
            today = json.load(fh)["textures"][0]["frames"]
        cells = {(f["sourceSize"]["w"], f["sourceSize"]["h"]) for f in today if "/idle/" in f["filename"]}
        pivots = {(f["pivot"]["x"], f["pivot"]["y"]) for f in today if "/idle/" in f["filename"]}
        self.assertEqual(cells, {(m["cell"] // 2, m["cell"] // 2)})
        for name, entry in m["frames"].items():
            self.assertNotIn("cell", entry, name)
            pivot = (round(entry["feet"][0] / m["cell"], 4), round(entry["feet"][1] / m["cell"], 4))
            self.assertEqual({pivot}, pivots, name)
            self.assertNotIn("clipped", entry, name)

    def test_the_figure_stands_on_the_pivot_and_under_the_crown_cap(self):
        import numpy as np

        img = bpy.data.images.load(os.path.join(self.dir, "body", rc.frame_name("villager", "idle", "s", 0) + ".png"))
        try:
            w, h = img.size
            a = np.empty(w * h * 4, dtype=np.float32)
            img.pixels.foreach_get(a)
        finally:
            bpy.data.images.remove(img)
        alpha = a.reshape(h, w, 4)[::-1, :, 3] > 0.5  # rows from the top
        rows = np.nonzero(alpha.any(axis=1))[0]
        cols = np.nonzero(alpha.any(axis=0))[0]
        self.assertLessEqual(abs(int(rows.max()) - rc.FEET_ROW_PX), 6, "the soles sit on the feet row")
        self.assertLessEqual(int(rows.max() - rows.min()) + 1, 112, "maxStandingSilhouettePx")
        self.assertGreater(int(rows.max() - rows.min()), 80, "a 1.7 m figure is about 100 px")
        self.assertLessEqual(abs((cols.min() + cols.max()) / 2 - rc.CELL_PX / 2), 6, "centred on the pivot")

    def test_the_walk_is_one_cycle_and_the_idle_breathes(self):
        walk = self.manifest["figure"]["walk"]
        self.assertAlmostEqual(walk["period"], CYCLE, places=3)
        self.assertEqual(self.manifest["figure"]["chestBone"], "Chest")
        body = os.path.join(self.dir, "body")
        idle = [digest(os.path.join(body, rc.frame_name("villager", "idle", "s", k) + ".png"))
                for k in range(fg.IDLE_FRAMES)]
        self.assertNotEqual(idle[0], idle[fg.IDLE_FRAMES // 2], "the chest rises")
        walk_frames = {digest(os.path.join(body, rc.frame_name("villager", "walk", "e", k) + ".png")) for k in range(8)}
        self.assertGreater(len(walk_frames), 4, "the legs move")

    def test_directions_turn_the_figure(self):
        body = os.path.join(self.dir, "body")
        faces = {digest(os.path.join(body, rc.frame_name("villager", "idle", d, 0) + ".png")) for d in rc.DIRECTIONS}
        self.assertEqual(len(faces), 8)

    def test_the_stray_sphere_is_gone(self):
        self.assertNotIn("Icosphere", bpy.data.objects)

    def test_two_runs_write_identical_bytes(self):
        out = os.path.join(self.tmp.name, "b")
        render(self.glb, out, anims="walk", dirs="se,w")
        for d in ("se", "w"):
            for k in range(8):
                name = rc.frame_name("villager", "walk", d, k) + ".png"
                self.assertEqual(digest(os.path.join(out, "villager", "body", name)),
                                 digest(os.path.join(self.dir, "body", name)), name)

    def test_a_render_lock_is_written(self):
        import render_lock

        with open(os.path.join(self.dir, render_lock.LOCK_NAME)) as fh:
            lock = json.load(fh)
        self.assertEqual(lock["atlas"], "char_villager")
        self.assertEqual(set(lock["frames"]), set(self.manifest["frames"]))
        self.assertEqual(lock["blender"], bpy.app.version_string)


@unittest.skipIf(bpy is None, "bpy is not installed (bash tools/blender/setup.sh)")
@unittest.skipUnless(os.path.exists(BAKER), "the locked baker is not fetched (models/fetch_models.py)")
class LockedModel(unittest.TestCase):
    def test_the_baker_renders_to_todays_cell(self):
        with tempfile.TemporaryDirectory() as tmp:
            import render_figures

            args = SimpleNamespace(model="baker", look="baker", glb=BAKER, out=tmp, anims="walk", dirs="s")
            args.forward = "-Y"
            m = render_figures.render_figure(args)
            self.assertEqual(len(m["frames"]), 8)
            self.assertAlmostEqual(m["figure"]["walk"]["period"], 33.5, delta=1.0)
            self.assertTrue(all("clipped" not in e for e in m["frames"].values()))


if __name__ == "__main__":
    unittest.main()
