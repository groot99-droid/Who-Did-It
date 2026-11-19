"""Builds fixtures/tiny.glb.b64, the hand-built fixture the bpy tests import: a 1 m cube with a flat red material and
a half-metre wedge on top, about 4 KB as base64 text (a .glb would be an LFS pointer under .gitattributes), no textures, nothing taken from anywhere (so no licence row).
Run only to rebuild it:  tools/blender/.venv/bin/python tools/blender/tests/bpy/make_fixture.py"""

import base64
import os
import tempfile

import bpy

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "tiny.glb.b64")


def build() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.5))
    body = bpy.context.object
    body.name = "FixtureBody"
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.35, depth=0.5, location=(0, 0, 1.25))
    roof = bpy.context.object
    roof.name = "FixtureRoof"
    mat = bpy.data.materials.new("FixtureRed")
    mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.8, 0.1, 0.1, 1.0)
    for ob in (body, roof):
        ob.data.materials.append(mat)
    bpy.ops.object.select_all(action="SELECT")
    with tempfile.TemporaryDirectory() as tmp:
        glb = os.path.join(tmp, "tiny.glb")
        bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", use_selection=True, export_apply=True)
        with open(glb, "rb") as f:
            data = f.read()
    with open(OUT, "w", newline="\n") as f:
        f.write(base64.b64encode(data).decode("ascii") + "\n")
    print(f"wrote {OUT} ({len(data)} bytes of glb)")


if __name__ == "__main__":
    build()
