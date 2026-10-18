"""Render character passes or the calibration sheet through the rig (docs/ASSETS.md 6.2, docs/SPRITES.md).

Calibration sheet (M0, before any character work):

    blender -b --factory-startup -P tools/blender/batch_render.py -- --smoke \
        --out apps/client/public/assets/calibration

Character passes:

    blender -b --factory-startup -P tools/blender/batch_render.py -- \
        --char path/to/villager.blend --body villager --out build/render

The character .blend holds a collection `Export` with the armature, mesh parts tagged by the custom
property `wdi_part` (body, scarf, blood), an empty named `Feet` between the feet, and one action per
clip named after it (`idle`, `walk`, `swing`, `interact`, `die`). Every frame renders through IsoCam at
the display scale; `pnpm --filter @wdi/sprites pixel` finishes the folder to packed size (SPRITES 10.3).
Without `--rig` the rig is built in memory by build_rig.py.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_rig  # noqa: E402
import palettize  # noqa: E402
import rig_common as rc  # noqa: E402

LOOPING = {"idle", "walk", "run", "carry"}
SMOKE_LIFT_PX = 24


def _args(argv: list[str]) -> argparse.Namespace:
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    p = argparse.ArgumentParser(prog="batch_render.py")
    p.add_argument("--smoke", action="store_true", help="render the calibration sheet only")
    p.add_argument("--rig", help="render_rig.blend to open instead of building the rig in memory")
    p.add_argument("--char", help="character .blend with an Export collection")
    p.add_argument("--body", default="villager")
    p.add_argument("--anims", default=",".join(rc.V1_CLIPS), help="comma list of clips")
    p.add_argument("--passes", default=",".join(rc.PASSES))
    p.add_argument("--dirs", default=",".join(rc.DIRECTIONS))
    p.add_argument("--out", required=True)
    return p.parse_args(argv)


def load_rig(path: str | None) -> bpy.types.Scene:
    if path:
        bpy.ops.wm.open_mainfile(filepath=os.path.abspath(path))
        return bpy.context.scene
    return build_rig.build()


def render_to(scene: bpy.types.Scene, path: str) -> None:
    scene.render.filepath = os.path.abspath(path)
    bpy.ops.render.render(write_still=True)


def feet_px(scene: bpy.types.Scene, feet: bpy.types.Object, cell: int = rc.CELL_PX) -> list[float]:
    co = world_to_camera_view(scene, scene.camera, feet.matrix_world.translation)
    return list(rc.feet_pixels(co.x, co.y, cell))


# ---------------------------------------------------------------- calibration sheet


def _pixels(path: str):
    import numpy as np

    img = bpy.data.images.load(os.path.abspath(path))
    w, h = img.size
    arr = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(arr)
    bpy.data.images.remove(img)
    return arr.reshape(h, w, 4)  # rows bottom-up, as Blender stores them


def touches_border(path: str) -> bool:
    """True when any opaque pixel sits on the cell edge, i.e. the sprite is clipped."""
    a = _pixels(path)[:, :, 3] > 0.05
    return bool(a[0].any() or a[-1].any() or a[:, 0].any() or a[:, -1].any())


def _opaque_rows(cell) -> tuple[int, int]:
    import numpy as np

    rows = np.nonzero(cell[:, :, 3].max(axis=1) > 0.5)[0]
    h = cell.shape[0]
    return (int(h - 1 - rows.max()), int(h - 1 - rows.min()))  # top, bottom from the top edge


def _place(scene, cam, cell: int, feet_row: float, width: int | None = None) -> None:
    """IsoCam at the display scale with the world origin on `feet_row` of a `cell` px square (or a
    `width` x `cell` frame)."""
    w = width or cell
    scene.render.resolution_x, scene.render.resolution_y = w, cell
    cam.data.ortho_scale = rc.ortho_scale(max(w, cell))
    cam.data.shift_y = rc.camera_shift_y(feet_row, cell) * cell / max(w, cell)


def smoke(scene: bpy.types.Scene, out_dir: str) -> None:
    """The IsoCam calibration sheet at the display scale (finish it with tools/sprites `pixel`).

    Row 1: the checker cube in 8 directions with its facing marker. Row 2: one 1 m tile diamond
    (128 x 64), the TileCam grid tiled 2 x 2, and one `die` frame of a fallen 1.7 m proxy lying to
    screen right (the widest fall) in its 256 px cell with the feet at the centre."""
    import numpy as np

    tmp = os.path.join(out_dir, "_frames")
    os.makedirs(tmp, exist_ok=True)
    tt, feet = bpy.data.objects["TT"], bpy.data.objects["Feet"]
    tail, tip = bpy.data.objects["MarkerTail"], bpy.data.objects["MarkerTip"]
    plane, cube = bpy.data.objects["GridPlane"], bpy.data.objects["CheckerCube"]
    tile_plane = bpy.data.objects["TilePlane"]
    iso_cam, tile_cam = bpy.data.objects["IsoCam"], bpy.data.objects["TileCam"]
    marker, fallen = bpy.data.objects["FacingMarker"], bpy.data.objects["FallenProxy"]
    cell, tile = rc.CELL_PX, rc.TILE_PX
    die_cell, die_feet_row = rc.clip_cell("die")

    sheet = np.zeros((cell + die_cell, 8 * cell, 4), dtype=np.float32)  # top-down while composing
    frames: dict[str, dict] = {}
    plane.hide_render = True
    # The turned cube reaches about 24 px below its feet (its front corner), so the smoke sheet lifts
    # the frame by SMOKE_LIFT_PX; the feet check expects the origin that much higher.
    _place(scene, iso_cam, cell, rc.FEET_ROW_PX - SMOKE_LIFT_PX)
    for i, direction in enumerate(rc.DIRECTIONS):
        tt.rotation_euler.z = rc.turntable_z(i)
        bpy.context.view_layer.update()
        name = rc.frame_name("calib", "idle", direction, 0)
        path = os.path.join(tmp, name + ".png")
        render_to(scene, path)
        px = _pixels(path)
        sheet[0:cell, i * cell : (i + 1) * cell] = px[::-1]
        a, b = feet_px(scene, tail), feet_px(scene, tip)
        frames[name] = {"feet": feet_px(scene, feet), "marker": [round(b[0] - a[0], 2), round(b[1] - a[1], 2)]}
        if touches_border(path):
            frames[name]["clipped"] = True
        if direction == "n":
            top, bottom = _opaque_rows(px)
            frames[name]["opaqueRows"] = [top, bottom]

    # The 1 m tile diamond under the environment root, origin at the cell centre.
    cube.hide_render = marker.hide_render = True
    tile_plane.hide_render = False
    tt.rotation_euler.z = 0.0
    _place(scene, iso_cam, tile, tile / 2, width=cell)
    bpy.context.view_layer.update()
    diamond_path = os.path.join(tmp, "tile_diamond.png")
    render_to(scene, diamond_path)
    d = _pixels(diamond_path)
    sheet[cell + (cell - tile) // 2 : cell + (cell + tile) // 2, 0:cell] = d[::-1]
    cols = np.nonzero(d[:, :, 3].max(axis=0) > 0.5)[0]
    rows = np.nonzero(d[:, :, 3].max(axis=1) > 0.5)[0]
    diamond = [int(cols.max() - cols.min() + 1), int(rows.max() - rows.min() + 1)]
    tile_plane.hide_render = True

    # One die frame: the proxy lies along the facing; facing `e` puts it along screen right.
    fallen.hide_render = False
    tt.rotation_euler.z = rc.turntable_z(rc.DIRECTIONS.index("e"))
    _place(scene, iso_cam, die_cell, die_feet_row)
    bpy.context.view_layer.update()
    die_name = rc.frame_name("calib", "die", "e", 0)
    die_path = os.path.join(tmp, die_name + ".png")
    render_to(scene, die_path)
    sheet[cell : cell + die_cell, 7 * cell - die_cell : 7 * cell] = _pixels(die_path)[::-1]
    frames[die_name] = {"feet": feet_px(scene, feet, die_cell), "cell": die_cell}
    if touches_border(die_path):
        frames[die_name]["clipped"] = True
    fallen.hide_render = True

    # The straight-down TileCam grid (decals), 2 x 2.
    plane.hide_render = False
    scene.camera = tile_cam
    scene.render.resolution_x = scene.render.resolution_y = tile
    tile_path = os.path.join(tmp, "tile_grid.png")
    render_to(scene, tile_path)
    t = _pixels(tile_path)[::-1]
    for r in range(2):
        for c in range(2):
            y0, x0 = cell + r * tile, 2 * cell + c * tile
            sheet[y0 : y0 + tile, x0 : x0 + tile] = t
    plane.hide_render = True
    scene.camera = iso_cam
    _place(scene, iso_cam, cell, rc.FEET_ROW_PX)
    tt.rotation_euler.z = 0.0
    cube.hide_render = marker.hide_render = False

    out = bpy.data.images.new("calibration_sheet", 8 * cell, cell + die_cell, alpha=True)
    out.pixels.foreach_set(sheet[::-1].ravel())
    out.filepath_raw = os.path.abspath(os.path.join(out_dir, "calibration_sheet.png"))
    out.file_format = "PNG"
    out.save()

    n = frames[rc.frame_name("calib", "idle", "n", 0)]
    report = {
        "version": 2,
        "camera": "IsoCam",
        "scale": "display",
        "pxPerMetre": rc.DISPLAY_PX_PER_M,
        "cell": cell,
        "blender": bpy.app.version_string,
        "expected": {"feet": [cell / 2, float(rc.FEET_ROW_PX - SMOKE_LIFT_PX)], "tileDiamond": [128, 64],
                     "dieFeet": [die_cell / 2, float(die_feet_row)]},
        "frames": frames,
        "tileDiamond": diamond,
        "cubeHeightPx": n["opaqueRows"][1] - n["opaqueRows"][0] + 1,
    }
    with open(os.path.join(out_dir, "calibration.json"), "w") as fh:
        json.dump(report, fh, indent=2, sort_keys=True)
        fh.write("\n")
    for f in os.listdir(tmp):
        os.remove(os.path.join(tmp, f))
    os.rmdir(tmp)
    clipped = [k for k, v in frames.items() if v.get("clipped")]
    print(f"smoke: feet {n['feet']} (expected {report['expected']['feet']}), marker n {n['marker']}, "
          f"cube {report['cubeHeightPx']} px tall, tile diamond {diamond} (expected [128, 64]); "
          f"die feet {frames[die_name]['feet']} (expected {report['expected']['dieFeet']})"
          f"{', CLIPPED ' + ','.join(clipped) if clipped else ''}")


# ---------------------------------------------------------------- character passes


def import_character(path: str, turntable: bpy.types.Object) -> bpy.types.Collection:
    with bpy.data.libraries.load(os.path.abspath(path), link=False) as (src, dst):
        if "Export" not in src.collections:
            raise SystemExit(f"{path}: no collection named Export")
        dst.collections = ["Export"]
        dst.actions = list(src.actions)
    col = dst.collections[0]
    bpy.context.scene.collection.children.link(col)
    for obj in col.all_objects:
        if obj.parent is None:
            obj.parent = turntable
    return col


def _parts(col) -> dict[str, list[bpy.types.Object]]:
    parts: dict[str, list] = {p: [] for p in rc.PASSES}
    for obj in col.all_objects:
        part = obj.get("wdi_part")
        if obj.type == "MESH" and part:
            if part not in parts:
                raise SystemExit(f"{obj.name}: unknown wdi_part {part!r}")
            parts[part].append(obj)
    if not parts["body"]:
        raise SystemExit("no mesh tagged wdi_part = body")
    return parts


def _override_materials() -> dict[str, bpy.types.Material]:
    return {
        "scarf": build_rig.toon_material("PassScarf", "bone", "fog", "slate"),
        "blood": build_rig.flat_material("PassBlood", "blood"),
    }


def setup_pass(pass_name: str, parts, overrides, saved) -> None:
    """Show one pass; the body becomes a holdout for overlay passes so they are occluded."""
    for part, objs in parts.items():
        for obj in objs:
            obj.is_holdout = part == "body" and pass_name != "body"
            obj.hide_render = not (part == pass_name or part == "body")
            mat = overrides.get(part) if part == pass_name else None
            for i, slot in enumerate(obj.material_slots):
                original = saved[(obj.name, i)]
                keep = original is not None and original.name == build_rig.OUTLINE_MATERIAL
                slot.material = mat if (mat and not keep) else original


def write_manifest(path: str, manifest: dict) -> None:
    """Merge into an existing manifest under a lock, so runs split by --anims, --dirs or --passes
    (sequential or parallel into the same --out) add up to one manifest."""
    import fcntl

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "a+") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX)
        fh.seek(0)
        text = fh.read()
        if text.strip():
            old = json.loads(text)
            if old.get("body") != manifest["body"]:
                raise SystemExit(f"{path}: manifest is for body {old.get('body')!r}")
            body_rendered = "body" in manifest["passes"]
            for name, entry in manifest["frames"].items():
                # The clipped flag comes from the body pass; overlay-only runs keep the old one.
                if body_rendered:
                    old["frames"][name] = entry
                else:
                    old["frames"].setdefault(name, {}).update(entry)
            old["passes"] = [p for p in rc.PASSES if p in set(old.get("passes", [])) | set(manifest["passes"])]
            manifest = old
        fh.seek(0)
        fh.truncate()
        json.dump(manifest, fh, indent=2, sort_keys=True)
        fh.write("\n")


def render_character(scene, args) -> None:
    if not rc.BODY_RE.match(args.body):
        raise SystemExit(f"body id {args.body!r} must match {rc.BODY_RE.pattern}")
    turntable = bpy.data.objects["TT"]
    for obj in bpy.data.collections["Calibration"].objects:
        obj.hide_render = True
    col = import_character(args.char, turntable)
    feet = next((o for o in col.all_objects if o.name.split(".")[0] == "Feet" and o.type == "EMPTY"), None)
    if feet is None:
        raise SystemExit("no Feet empty in Export")
    arm = next((o for o in col.all_objects if o.type == "ARMATURE"), None)
    parts = _parts(col)
    for name, how in sorted(palettize.palettize_objects(col.all_objects).items()):
        print(f"palettize: {name}: {how}")
    for part, objs in parts.items():
        for obj in objs:
            if part != "blood":
                build_rig.add_outline(obj, "character")
    saved = {(o.name, i): s.material for objs in parts.values() for o in objs for i, s in enumerate(o.material_slots)}
    overrides = _override_materials()
    step = rc.frame_step(scene.render.fps / scene.render.fps_base)
    out_root = os.path.join(args.out, args.body)
    manifest = {"version": 1, "body": args.body, "cell": rc.CELL_PX, "fps": rc.OUTPUT_FPS,
                "passes": args.passes.split(","), "frames": {}}

    clipped: list[str] = []
    for anim in args.anims.split(","):
        action = bpy.data.actions.get(anim)
        if action is None or arm is None:
            raise SystemExit(f"missing action {anim!r} or armature")
        arm.animation_data_create().action = action
        cell, feet_row = rc.clip_cell(anim)
        _place(scene, scene.camera, cell, feet_row)
        start, end = (int(round(f)) for f in action.frame_range)
        frames = rc.sample_frames(start, end if anim in LOOPING else end + 1, step)
        expected = rc.V1_CLIPS.get(anim)
        if expected and len(frames) != expected:
            print(f"warning: {anim} samples {len(frames)} frames, V1 expects {expected}")
        for d_index in (rc.DIRECTIONS.index(d) for d in args.dirs.split(",")):
            turntable.rotation_euler.z = rc.turntable_z(d_index)
            for pass_name in manifest["passes"]:
                setup_pass(pass_name, parts, overrides, saved)
                for n, f in enumerate(frames):
                    scene.frame_set(f)
                    name = rc.frame_name(args.body, anim, rc.DIRECTIONS[d_index], n)
                    path = os.path.join(out_root, pass_name, name + ".png")
                    render_to(scene, path)
                    # Every pass records the pivot, so a run that renders only overlays still writes
                    # a complete manifest; all passes of a frame project the same Feet.
                    entry = manifest["frames"].setdefault(name, {})
                    entry["feet"] = feet_px(scene, feet, cell)
                    if cell != rc.CELL_PX:
                        entry["cell"] = cell
                    if pass_name == "body" and touches_border(path):
                        entry["clipped"] = True
                        clipped.append(name)

    write_manifest(os.path.join(out_root, "manifest.json"), manifest)
    _place(scene, scene.camera, rc.CELL_PX, rc.FEET_ROW_PX)
    if clipped:
        print(f"warning: {len(clipped)} body frames touch the cell edge, e.g. {clipped[0]}")
    print(f"batch_render: {len(manifest['frames'])} frames x {len(manifest['passes'])} passes -> {out_root}")


def main() -> None:
    args = _args(sys.argv)
    os.makedirs(args.out, exist_ok=True)
    scene = load_rig(args.rig)
    if args.smoke:
        smoke(scene, args.out)
    elif args.char:
        render_character(scene, args)
    else:
        raise SystemExit("pass --smoke or --char")


if __name__ == "__main__":
    main()
