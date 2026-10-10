"""Build a stand-in character .blend that follows the batch_render contract, for pipeline tests.

    blender -b --factory-startup -P tools/blender/tests/make_dummy_char.py -- --out build/dummy.blend

A 1.7 m capsule body with a scarf ring, cap, bowler and blood shell, one bone, an `Export`
collection, a `Feet` empty and the four V1 actions at 24 fps (idle and walk loop over 16 frames,
swing spans 11, die 15), so each samples to the V1 frame counts at 12 fps.
"""

import argparse
import math
import sys

import bpy


def _mesh(op, name, part, col, arm, **kw):
    op(**kw)
    obj = bpy.context.active_object
    for c in obj.users_collection:
        c.objects.unlink(obj)
    col.objects.link(obj)
    obj.name = name
    obj["wdi_part"] = part
    mat = bpy.data.materials.new(name + "Mat")
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = {
        "body": (0.16, 0.18, 0.22, 1), "scarf": (0.7, 0.7, 0.7, 1), "hat_cap": (0.03, 0.03, 0.05, 1),
        "hat_bowler": (0.01, 0.01, 0.02, 1), "blood": (0.45, 0.01, 0.02, 1)}[part]
    obj.data.materials.append(mat)
    world = obj.matrix_world.copy()
    obj.parent = arm
    obj.parent_type = "BONE"
    obj.parent_bone = "root"
    bpy.context.view_layer.update()
    obj.matrix_world = world  # keep the transform (bone children sit at the tail otherwise)
    return obj


def build(out: str) -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = 24
    col = bpy.data.collections.new("Export")
    scene.collection.children.link(col)

    arm_data = bpy.data.armatures.new("Rig")
    arm = bpy.data.objects.new("Rig", arm_data)
    col.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    bone = arm_data.edit_bones.new("root")
    bone.head, bone.tail = (0, 0, 0), (0, 0, 1)
    bpy.ops.object.mode_set(mode="OBJECT")

    m = bpy.ops.mesh
    _mesh(m.primitive_cylinder_add, "Body", "body", col, arm, radius=0.25, depth=1.2, location=(0, 0, 0.6))
    _mesh(m.primitive_uv_sphere_add, "Head", "body", col, arm, radius=0.28, location=(0, 0, 1.42))
    _mesh(m.primitive_cube_add, "Nose", "body", col, arm, size=0.12, location=(0, 0.28, 1.42))
    _mesh(m.primitive_torus_add, "Scarf", "scarf", col, arm, major_radius=0.27, minor_radius=0.06,
          location=(0, 0, 1.17))
    _mesh(m.primitive_cylinder_add, "Cap", "hat_cap", col, arm, radius=0.3, depth=0.12, location=(0, 0.04, 1.68))
    _mesh(m.primitive_cylinder_add, "Bowler", "hat_bowler", col, arm, radius=0.22, depth=0.25,
          location=(0, 0, 1.75))
    _mesh(m.primitive_cylinder_add, "BloodShell", "blood", col, arm, radius=0.26, depth=0.5, location=(0, 0, 0.85))

    feet = bpy.data.objects.new("Feet", None)
    col.objects.link(feet)

    def action(name, frames, keys):
        act = bpy.data.actions.new(name)
        arm.animation_data_create().action = act
        pb = arm.pose.bones["root"]
        pb.rotation_mode = "XYZ"
        for f, (tilt, spin, lift) in zip(frames, keys):  # tilt about X falls; spin is about the bone
            pb.rotation_euler = (tilt, spin, 0.0)
            pb.location = (0.0, lift, 0.0)
            pb.keyframe_insert("rotation_euler", frame=f)
            pb.keyframe_insert("location", frame=f)
        act.use_fake_user = True

    action("idle", (1, 9, 17), ((0, 0, 0), (0, 0, 0.03), (0, 0, 0)))
    action("walk", (1, 5, 9, 13, 17), ((0, 0, 0), (0.1, 0, 0.05), (0, 0, 0), (-0.1, 0, 0.05), (0, 0, 0)))
    action("swing", (1, 6, 11), ((0, 0, 0), (0, math.radians(60), 0), (0, 0, 0)))
    action("die", (1, 15), ((0, 0, 0), (math.radians(-85), 0, 0)))
    arm.animation_data.action = None
    bpy.ops.wm.save_as_mainfile(filepath=out)


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", required=True)
    build(p.parse_args(argv).out)
