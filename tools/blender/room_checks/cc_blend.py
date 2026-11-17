"""Room check (the contract), the .blend side of "built for a plain append". Opened read-only (never saved).

Usage: bash tools/blender/bl.sh -b <room.blend> --factory-startup -P tools/blender/room_checks/cc_blend.py --
           <roomId> [--out DIR]                                                                    (roomcfg.py)
The .blend is the one Blender opened on its command line. Checks: one collection Room_<id>; one root empty
Area_room_<id> whose descendants are every room mesh, light, spawn and portal; HM_Collision_room_<id> a mesh at the
root; every datablock name unique and prefixed with the room. Writes <out>/cc_blend.json.
"""
import json
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import roomcfg  # noqa: E402

ARGS = roomcfg.parse()
SID = ARGS.room
os.makedirs(ARGS.out, exist_ok=True)
OUT = os.path.join(ARGS.out, "cc_blend.json")
if not bpy.data.filepath:
    raise SystemExit("cc_blend.py: no .blend is open; give the room's .blend to Blender before -P")
pre = SID + "_"
contract = {f"Area_room_{SID}", f"HM_Collision_room_{SID}", f"Room_{SID}"}
R = {"file": roomcfg.shown(bpy.data.filepath), "checks": {}}
fails = []


def check(name, ok, **info):
    R["checks"][name] = dict(ok=bool(ok), **info)
    if not ok:
        fails.append(name)
    print(("PASS " if ok else "FAIL ") + name, json.dumps(info, default=str)[:600])


cols = [c.name for c in bpy.data.collections]
check("one_collection", cols == [f"Room_{SID}"], collections=cols,
      scene_children=[c.name for c in bpy.context.scene.collection.children],
      scene_root_objects=[o.name for o in bpy.context.scene.collection.objects])
area = bpy.data.objects.get(f"Area_room_{SID}")
colo = bpy.data.objects.get(f"HM_Collision_room_{SID}")
objs = list(bpy.data.objects)
roots = [o.name for o in objs if o.parent is None]


def under(o, a):
    p = o.parent
    while p is not None:
        if p == a:
            return True
        p = p.parent
    return False


not_under = [o.name for o in objs if o not in (area, colo) and not under(o, area)]
check("one_root_area_empty", area is not None and area.type == "EMPTY" and sorted(roots) == sorted([area.name, colo.name])
      and not not_under, roots=roots, area_type=area.type if area else None, not_under_area=not_under,
      area_location=list(area.location) if area else None, area_props={k: area[k] for k in area.keys()} if area else None)
check("collision_mesh_at_root", colo is not None and colo.type == "MESH" and colo.parent is None
      and colo.get("wdi_collision") is True and len(colo.data.materials) == 0
      and tuple(round(v, 6) for v in colo.matrix_world.translation) == (0, 0, 0),
      type=colo.type if colo else None, polys=len(colo.data.polygons) if colo else None,
      users_collection=[c.name for c in colo.users_collection] if colo else None)
by_type = {}
for o in objs:
    by_type.setdefault(o.type, []).append(o.name)
R["objects_by_type"] = {k: len(v) for k, v in by_type.items()}
kinds = {}
bad = {}
for attr in ("objects", "meshes", "materials", "images", "lights", "collections", "node_groups", "textures", "curves",
             "actions", "worlds", "cameras", "scenes", "texts", "fonts", "particles", "grease_pencils"):
    coll = getattr(bpy.data, attr, None)
    if coll is None:
        continue
    names = [x.name for x in coll if not getattr(x, "library", None)]
    kinds[attr] = len(names)
    b = [n for n in names if not (n.startswith(pre) or n in contract or n.startswith(("Spawn_", "Portal_")))]
    if b:
        bad[attr] = b
R["datablocks"] = kinds
appended = ("objects", "meshes", "materials", "images", "lights", "collections", "node_groups", "textures", "curves", "actions")
check("datablocks_prefixed_for_append", not any(k in bad for k in appended), unprefixed=bad, counts=kinds,
      note="names are unique per type by construction in Blender; worlds/scenes are not appended with the collection")
imgs = [(i.name, bool(i.packed_file), i.size[:]) for i in bpy.data.images]
check("images_packed", all(p for _, p, _ in imgs if _ is not None), images=len(imgs),
      unpacked=[n for n, p, _ in imgs if not p])
lights = [(o.name, o.data.type, round(o.data.energy, 4), [round(v, 3) for v in o.matrix_world.translation]) for o in objs
          if o.type == "LIGHT"]
R["lights"] = lights
R["fails"] = fails
R["pass"] = not fails
json.dump(R, open(OUT, "w"), indent=1, default=str)
print("FAILS", fails)
