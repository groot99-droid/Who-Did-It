"""The bake rig's fingerprint: what the Cycles bake of a room sees besides its meshes, as sha1s that two builds can
compare bit for bit. The regression gate (regress.sh) rebuilds a room from its saved bake and cannot see a change to
the rig; this is the proof for a step that changes it (implementation plan, section 4), beside the one-sample group bake
of regress_bake.sh.

In Blender, through the lock wrapper (the builder runs to the end of its bake_rig and stops there, about a minute):

    bash tools/blender/bl.sh -b --factory-startup --python-exit-code 1 -P tools/blender/room_checks/rig_print.py -- \
        --scene widow_bedroom --json F [--layout NAME] [--room-file F] [--look F] [--out DIR]

`meshy_room_build.py --rig-print F` writes the same file during any build (regress_bake.sh uses it beside its group
bake). The fingerprint holds, in the rig's own order: every rig light (its type, location, rotation, energy, colour and
size: the soft size, a sun's angle, an area's shape and sides), the order of the objects in the rig's collection, the
world's node values and links, and the light-tight box's vertices and faces. Every rig light must stay present, at
energy 0, in the other groups' bakes: deleting or hiding one changes Cycles' light sampling.
"""
from __future__ import annotations

import hashlib
import json
import os
import sys


def _sha1(x) -> str:
    return hashlib.sha1(json.dumps(x, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def _f(v):
    """A Blender float (a float32 widened to a double) or a vector of them, exactly as stored."""
    try:
        return [float(c) for c in v]
    except TypeError:
        return float(v)


def _socket(s):
    v = getattr(s, "default_value", None)
    if v is None:
        return None
    try:
        return _f(v)
    except (TypeError, ValueError):
        return str(v)


def light_row(o) -> dict:
    d = o.data
    row = dict(name=o.name, type=d.type, location=_f(o.location), rotation=_f(o.rotation_euler),
               rotationMode=o.rotation_mode, scale=_f(o.scale), energy=_f(d.energy), color=_f(d.color),
               softSize=_f(d.shadow_soft_size), hideRender=bool(o.hide_render))
    if d.type == "SUN":
        row["angle"] = _f(d.angle)
    if d.type == "AREA":
        row.update(shape=d.shape, size=_f(d.size), sizeY=_f(d.size_y))
    if d.type == "SPOT":
        row.update(spotSize=_f(d.spot_size), spotBlend=_f(d.spot_blend))
    row.update({k: o[k] for k in o.keys() if k.startswith("wdi_")})
    return row


def world_row(w) -> dict | None:
    if w is None:
        return None
    nodes = []
    if w.use_nodes and w.node_tree is not None:
        for n in sorted(w.node_tree.nodes, key=lambda n: n.name):
            nodes.append(dict(name=n.name, type=n.bl_idname,
                              props={p: str(getattr(n, p)) for p in ("interpolation_type", "data_type", "blend_type")
                                     if hasattr(n, p)},
                              inputs=[[s.name, _socket(s)] for s in n.inputs]))
        links = sorted([l.from_node.name, l.from_socket.identifier, l.to_node.name, l.to_socket.identifier]
                       for l in w.node_tree.links)
    else:
        links = []
    return dict(name=w.name, useNodes=bool(w.use_nodes), nodes=nodes, links=links)


def mesh_row(o) -> dict:
    import numpy as np
    me = o.data
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", co)
    loops = np.empty(len(me.loops), np.int32)
    me.loops.foreach_get("vertex_index", loops)
    M = np.array(o.matrix_world, np.float64)
    return dict(name=o.name, vertices=len(me.vertices), faces=len(me.polygons),
                coSha1=hashlib.sha1(co.tobytes()).hexdigest(), loopsSha1=hashlib.sha1(loops.tobytes()).hexdigest(),
                matrix=[[float(v) for v in r] for r in M], materials=[m.name if m else "" for m in me.materials])


def fingerprint(rig: list, scene) -> dict:
    """The fingerprint of a rig (bake_rig's list) in its scene."""
    lights = [light_row(o) for o in rig if o.type == "LIGHT"]
    meshes = [mesh_row(o) for o in rig if o.type == "MESH"]
    cols = {c.name: [o.name for o in c.objects] for o in rig for c in o.users_collection}
    order = [o.name for o in rig]
    world = world_row(scene.world)
    parts = dict(lights=_sha1(lights), order=_sha1([order, cols]), world=_sha1(world), tight=_sha1(meshes))
    return dict(sha1=_sha1(parts), parts=parts, lights=lights, order=order, collections=cols, world=world,
                meshes=meshes)


def write(path: str, rig: list, scene) -> dict:
    fp = fingerprint(rig, scene)
    os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(fp, fh, indent=1)
        fh.write("\n")
    print(f"RIG fingerprint {fp['sha1']} ({len(fp['lights'])} lights, {len(fp['meshes'])} meshes) -> {path}",
          flush=True)
    return fp


def main(argv: list) -> None:
    if "--json" not in argv or argv.index("--json") + 1 >= len(argv):
        raise SystemExit("rig_print.py: give --json F (and the builder's --scene and its other arguments)")
    i = argv.index("--json")
    path, rest = argv[i + 1], argv[:i] + argv[i + 2:]
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    import meshy_room_build as mrb
    mrb.blender_main(mrb.parse(rest + ["--rig-print", os.path.abspath(path), "--rig-stop"]))


if __name__ == "__main__":
    main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
