#!/usr/bin/env python3
"""mutants.py: breaks the fixture one rule at a time and shows that both checkers fail it on the intended rule.

    python mutants.py --src <path to apps/walk/src> [--three <path to the three package>] [--keep <folder>] [--only name,name]
    python mutants.py --python-only            walk_index.py alone (check_areas.mjs needs the viewer's source)

For each name below, fixture/make-areas-fixture.mjs writes a variant of the fixture (MUTATE=<name>) into its own
folder; then  walk_index.py <folder> --check  and  check_areas.mjs <folder>  run on it. When the variant's folder holds
its own walk_scenes.json (the list of walk-only scenes), both checkers are given it with --walk-scenes. There are four
kinds:

  MUTANTS  a broken world. It is caught when the checker exits 1 and the intended rule is among its FAIL lines.
  NOTED    an allowed world that deserves a word. It is caught when the intended NOTE line is printed, walk_index.py
           fails nothing, and check_areas.mjs fails nothing but its scripted journey (the journey is written for the
           unchanged fixture, and these two variants change the way it walks).
  VALID    a world that obeys the contract and looks unusual. It must pass both checkers with no FAIL line.
  ODD      an input that is no proper area file or index at all (not JSON, a loop of nodes, a word where a list
           belongs, an empty folder ...). Each checker must end with FAIL lines and exit 1 (exit 2 for the empty
           folder), and never with a stack trace.

The unbroken fixture must pass both first.
Exit code: 0 every variant behaves as said in every checker that ran and the baseline passes; 1 otherwise; 2 could not
run. Needs Python 3 and Node 22.13 or newer. Standard library only.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))

# name, what is broken, the rule that must fail (a pattern on the rule's name; the same in both checkers)
MUTANTS = [
    # the first nineteen: seam geometry, files and names, the index
    ("arrival_close", "seam arrivals in village_east stand 0.55 m from the return row (1.45 m beyond the departure portal)", r"seam\.west_east\.arrival"),
    ("arrival_turned", "seam arrivals in village_east look north, not along the direction of travel", r"seam\.west_east\.arrival"),
    ("lateral_shift", "seam arrivals in village_east land 0.5 m along the gate", r"seam\.west_east\.arrival"),
    ("wide_spacing", "the seam rows are spread to 2.61 m between neighbours", r"seam\.west_east\.spacing"),
    ("single_portal", "one portal point in the 5 m opening", r"seam\.west_east\.coverage"),
    ("room_at_slot", "the room's Area node stands on the far-grid slot (3000, 3000) of the old single file: a room sits at its own origin", r"room_shop\.area_at_origin"),
    ("section_offset", "the Area node of village_east is moved 10 m east, out of the village frame", r"village_east\.area_at_origin"),
    ("dup_spawn", "Spawn_mill in village_east is renamed Spawn_square: the id square is in two files", r"world\.spawn_unique"),
    ("typo_target", "Portal_ov.shop leads to the scene shp, which does not exist and is not pending", r"village_west\.portal_target"),
    ("no_exposure", "the Area of village_west has no wdi_exposure", r"village_west\.area_extras"),
    ("look_pop", "village_east has exposure 2.0, village_west 2.3784, in the files and in the index", r"seam\.west_east\.look_equal"),
    ("no_barrier", "the collision wall across the seam opening is missing in village_west", r"seam\.west_east\.barrier\.a"),
    ("look_drift", "both section files say exposure 3.1 and fog density 0.02; the index still says 2.3784 and 0.006", r"village_(west|east)\.look_matches_index"),
    ("dup_target_spawn", "room_shop also holds a Spawn_overworld_shop_door: a portal's target id is in two files", r"world\.spawn_unique"),
    ("bare_target", "the shop's way out asks for overworld + square: Spawn_overworld_square does not exist, the bare id square does", r"room_shop\.portal_target"),
    ("seam_gap", "the middle point of the seam row is gone: 3.6 m between neighbours", r"seam\.west_east\.spacing"),
    ("no_collision", "village_east has no HM_Collision_village_east node", r"village_east\.one_collision"),
    ("two_areas", "village_east has a second Area node at its scene root", r"village_east\.one_area"),
    ("dup_in_file", "village_west has two nodes named Spawn_square; the loader would rename the second to square_1", r"village_west\.names_unique_in_file"),
    # from here on, each variant is a file set that an earlier version of the checkers passed (both of them, or one) and that goes wrong in the viewer
    ("arrival_near_door", "village_east: a door Portal_ov.hut (to mine) at (1.65, 0.6), 0.6 m from the seam arrival b_2: the viewer's trigger is not ready there and the door fires before the gate", r"seam\.west_east\.arrival"),
    ("spawn_near_portal", "village_east: Spawn_mill stands at (0.9, 1.0), 0.92 m from the seam point b_3, inside its walk-in radius", r"village_east\.spawn_clear_of_portals"),
    ("door_near_seam", "village_east: a door Portal_ov.shed (to mine) at (0.45, 3.0), 1.2 m from the seam point b_3: two walk-in discs overlap", r"seam\.west_east\.clear"),
    ("seam_step", "village_east holds its ground, wall, spawns and portals 0.5 m higher than village_west does", r"seam\.west_east\.height"),
    ("scene_fog", "village_east carries fog_color and fog_density on its glTF scene: the viewer shows a flat background there and hides the sky", r"village_east\.scene_extras"),
    ("sun_one_side", "village_east holds a directional light: the viewer adds its own moon and sky light only to village_west", r"village_east\.no_directional_light"),
    ("room_far_from_origin", "everything room_shop holds stands around (3000, 3000), the old far-grid slot, with no transform on any node", r"room_shop\.origin_in_walk_region"),
    ("raw_name_dot", "room_shop: the spawn node is written Spawn_shop_.door; three.js strips the dot and reads the same id", r"room_shop\.raw_names"),
    ("light_named_like_spawn", "room_shop: the light definition is named Spawn_shop_door; three.js gives it the name first and renames the spawn node to Spawn_shop_door_1", r"room_shop\.names_unique_in_file"),
    ("light_ghost_spawn", "village_east: the node that holds the ground mesh also holds a light definition named Spawn_ghost; three.js adds an object of that name and the viewer lists a spawn nobody wrote", r"village_east\.reserved_names"),
    ("index_target_area", "the files are right; the index says the shop door's target is in village_east", r"village_west\.portals_match_index"),
    ("extension_not_listed", "village_east requires an extension that is not on the contract's list (KHR_materials_clearcoat)", r"village_east\.extensions"),
    ("south_wall_gone", "village_east: the collision wall along its south edge is missing, 60 m of open edge, far from the seam opening", r"village_east\.edge_closed"),
    ("edge_gap", "village_east: a 0.6 m gap in the east wall at y 6.0 to 6.6, outside any seam opening: a walker's capsule fits through", r"village_east\.edge_closed"),
    ("baked_one_side", "village_east says wdi_baked: true, in its file and in the index, and village_west does not: the viewer switches off the lights of village_east only", r"seam\.west_east\.look_equal"),
    ("polygon_odd", "village_west: wdi_walk_polygon is a flat list of five numbers, which is no list of points", r"village_west\.area_extras"),
    ("chamfer_open", "village_west: the outline cuts off its north-west corner along a diagonal, and no wall stands on the diagonal: 14.1 m of open edge that is not parallel to an axis", r"village_west\.edge_closed"),
    # the caves (contract version 1.1)
    ("cave_not_indoor", "under_a has no wdi_indoor: the viewer would draw the moon, the sky light and the sky dome in a cave", r"under_a\.area_extras"),
    ("cave_not_baked", "under_a has no wdi_baked, in its file and in the index", r"under_a\.area_extras"),
    ("cave_seam_open_roof", "the seam wall of under_a stops 0.3 m under the roof: the rays 0.1 m under the roof find no wall", r"seam\.a_b\.barrier\.a"),
    ("cave_seam_to_overworld", "the cave seam's points in under_a say to: overworld, not to: undermere", r"seam\.a_b\.extras"),
    ("cave_look_differs", "under_b carries fog density 0.08 and under_a 0.05: the caves do not carry one look", r"world\.cave_look"),
    ("walk_scene_is_game_scene", "walk_scenes.json also lists shop, the game scene of the room room_shop, as a walk-only scene", r"world\.walk_scenes"),
    ("cave_id_prefix", "the west cave is called cave_a: a cave's id starts with under_, the area prefix of undermere (the game has the scenes cave_entry and cave_gallery)", r"cave_a\.area_id"),
    ("cave_door_between_caves", "the cave seam is replaced by two plain doors between under_a and under_b, two caves of one scene", r"world\.seams_only_between_sections"),
    ("cave_spawn_near_portal", "under_a: Spawn_undermere_mouth_east stands 0.8 m from Portal_um.east_out, inside its walk-in radius", r"under_a\.spawn_clear_of_portals"),
    ("cave_gate_to_missing_spawn", "Portal_um.east_in leads to undermere + mouth_east, and no cave holds Spawn_undermere_mouth_east", r"village_east\.portal_target"),
]

# name, what is unusual, the NOTE that must be printed (a pattern on the rule's name; the same in both checkers)
NOTED = [
    ("way_back_far", "the shop's way out arrives at Spawn_overworld_shop_door in village_east, 60 m from the door in village_west that leads in", r"room_shop\.way_back"),
    ("no_way_in", "the shop's door in village_west is gone: no portal leads into room_shop", r"room_shop\.no_way_in"),
    ("gate_pending", "no cave file yet: the cave mouth Portal_um.east_in in village_east leads into undermere, which the index lists under pending", r"world\.pending\.undermere"),
]

# name, what is unusual; both checkers must pass it
VALID = [
    ("slope_along_seam", "the ground of both sections rises 3 % toward the north, along the seam; the walls stand 3 m above it everywhere"),
    ("pending_bare_id", "Portal_ov.mine asks for the scene mine (not built) with the toSpawn mill, and Spawn_mill exists: with an index the viewer says 'Mine is not built yet' and never takes the bare id"),
    ("spawn_matrix", "Spawn_mill is written with a matrix and no translation or rotation (legal glTF; Blender writes translation, rotation and scale)"),
    ("polygon_flat", "village_west writes its outline as a flat list of numbers, the form a Blender custom property can hold; the index lists it as pairs"),
    ("polygon_string", "village_west writes its outline as a JSON string, as today's exporter writes nested data; the index lists it as pairs"),
    ("polygon_chamfer", "village_west cuts off its north-west corner along a diagonal, writes the outline and stands a wall on the diagonal: the closed-edge rule follows an outline that is not a rectangle"),
    ("cave_stacked_levels", "a third cave, under_c, lies directly under under_a, 6 m lower, reached by its own mouth from village_west; its mouth's portal and arrival stand at the same places in plan as those of under_a"),
    ("cave_seam_ramp", "the floor and roof of both caves rise 6 % toward the east, across the cave seam: the rows stand 0.05 m apart in height and the arrivals 0.20 m, and both files put the floor at the seam line at the same height"),
]


# Odd inputs. Each case starts from the unbroken fixture and changes it with a function of the folder.
def _load(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def _edit(name, change):
    """A function of the folder that reads <name> as JSON, lets `change` alter it in place and writes it back."""
    def make(folder):
        path = os.path.join(folder, name)
        value = _load(path)
        change(value)
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            json.dump(value, fh, indent=1)
    return make


def _text(name, text):
    """A function of the folder that writes <name> as plain text."""
    def make(folder):
        with open(os.path.join(folder, name), "w", encoding="utf-8", newline="\n") as fh:
            fh.write(text)
    return make


def _node(j, prefix):
    return next(n for n in j["nodes"] if str(n.get("name", "")).startswith(prefix))


def _named(j, name):
    return next(n for n in j["nodes"] if n.get("name") == name)


def _no_files(folder):
    for f in os.listdir(folder):
        os.remove(os.path.join(folder, f))


def _no_room_file(folder):
    os.remove(os.path.join(folder, "walk-room_shop.gltf"))


def _short_glb(folder):
    os.remove(os.path.join(folder, "walk-village_east.gltf"))
    with open(os.path.join(folder, "walk-village_east.glb"), "wb") as fh:
        fh.write(b"glTF")
    _edit("walk-index.json", lambda j: j["areas"]["village_east"].__setitem__("file", "walk-village_east.glb"))(folder)


def _loop(j):
    kids = _node(j, "Area_")["children"]
    j["nodes"][kids[0]]["children"] = [kids[1]]
    j["nodes"][kids[1]]["children"] = [kids[0]]


def _bad_accessor(j):
    j["meshes"][_node(j, "HM_Collision")["mesh"]]["primitives"][0]["attributes"]["POSITION"] = 999


def _extensions_word(j):
    _node(j, "Area_")["extensions"] = "oops"
    _node(j, "Spawn_")["extensions"] = {"KHR_lights_punctual": {"light": "one"}}


def _matrix_zeros(j):
    spawn = _node(j, "Spawn_")
    spawn.pop("translation", None)
    spawn.pop("rotation", None)
    spawn["matrix"] = [0] * 16


def _width_huge(folder):
    """Both files of the seam declare an opening 1e9 m wide: a checker that sampled it would never finish."""
    for name in (WEST, EAST):
        _edit(name, lambda j: [n["extras"].__setitem__("wdi_width_m", 1e9) for n in j["nodes"] if str(n.get("name", "")).startswith("Portal_seam_")])(folder)


WEST, EAST, SHOP, INDEX = "walk-village_west.gltf", "walk-village_east.gltf", "walk-room_shop.gltf", "walk-index.json"
CAVE, WALK_SCENES = "walk-under_a.gltf", "walk_scenes.json"
# name, what is odd, how it is made from the fixture, and whether it is also read with the real GLTFLoader when
# --three is given
ODD = [
    ("not_json", "walk-village_east.gltf holds the words 'this is not json'", _text(EAST, "this is not json"), False),
    ("spawn_extras_word", "the extras of a spawn are the word hello, not an object", _edit(EAST, lambda j: _node(j, "Spawn_").__setitem__("extras", "hello")), False),
    ("area_no_extras", "the Area node has no extras at all", _edit(EAST, lambda j: _node(j, "Area_").pop("extras")), False),
    ("collision_no_mesh", "the collision node has no mesh", _edit(EAST, lambda j: _node(j, "HM_Collision").pop("mesh")), False),
    ("file_missing", "walk-room_shop.gltf, which the index lists, is not in the folder", _no_room_file, False),
    ("index_not_json", "walk-index.json holds an opening brace and nothing else", _text(INDEX, "{"), False),
    ("index_no_areas", "the index has no areas", _edit(INDEX, lambda j: j.pop("areas")), False),
    ("translation_word", "the translation of a spawn is [1, \"two\", 3]", _edit(EAST, lambda j: _node(j, "Spawn_").__setitem__("translation", [1, "two", 3])), False),
    ("width_word", "wdi_width_m is the word five on one seam portal", _edit(EAST, lambda j: _named(j, "Portal_seam_west_east_b_1")["extras"].__setitem__("wdi_width_m", "five")), False),
    ("to_number", "the extra to of a portal is the number 5", _edit(EAST, lambda j: _named(j, "Portal_ov.mine")["extras"].__setitem__("to", 5)), False),
    ("empty_folder", "the folder holds no file at all", _no_files, False),
    ("node_loop", "two nodes under the Area are each other's children", _edit(EAST, _loop), False),
    ("index_numbers", "seams and pending in the index are numbers", _edit(INDEX, lambda j: j.update(seams=5, pending=7)), False),
    ("index_areas_list", "areas in the index is a list", _edit(INDEX, lambda j: j.update(areas=[1, 2])), False),
    ("index_list", "the whole index is a JSON list", _text(INDEX, "[1, 2, 3]"), False),
    ("index_start_object", "start in the index is an object", _edit(INDEX, lambda j: j.update(start={"a": 1})), False),
    ("index_spawn_no_position", "a spawn of the index has no position", _edit(INDEX, lambda j: j["areas"]["village_east"]["spawns"][0].pop("position")), False),
    ("no_scenes", "the glTF has no scenes", _edit(EAST, lambda j: j.pop("scenes")), False),
    ("child_out_of_range", "the Area's children hold the number 999, which is no node", _edit(EAST, lambda j: _node(j, "Area_")["children"].append(999)), False),
    ("node_is_word", "a node is the word hello, not an object", _edit(EAST, lambda j: j["nodes"].__setitem__(1, "hello")), False),
    ("bad_accessor", "the collision mesh points at an accessor that is not there", _edit(EAST, _bad_accessor), False),
    ("bad_buffer", "the buffer is not base64", _edit(EAST, lambda j: j["buffers"][0].__setitem__("uri", "data:application/octet-stream;base64,!!!not base64!!!")), False),
    ("short_glb", "a .glb that is four bytes long", _short_glb, False),
    ("extensions_word", "the extensions of the Area node are a word, and a light index is a word", _edit(EAST, _extensions_word), False),
    ("extras_words", "wdi_walk_region and wdi_exposure of the room are words", _edit(SHOP, lambda j: _node(j, "Area_")["extras"].update(wdi_walk_region="all of it", wdi_exposure="bright")), True),
    ("extensions_required_word", "extensionsRequired is a word, not a list", _edit(EAST, lambda j: j.__setitem__("extensionsRequired", "oops")), False),
    ("polygon_cut_off", "wdi_walk_polygon of village_west is the text [[1,2, a JSON string that stops in the middle", _edit(WEST, lambda j: _node(j, "Area_")["extras"].__setitem__("wdi_walk_polygon", "[[1,2")), False),
    ("matrix_zeros", "a spawn node holds a matrix of sixteen zeros, which has no rotation and no scale", _edit(EAST, _matrix_zeros), False),
    ("width_huge", "both files of the seam declare an opening 1e9 m wide", _width_huge, False),
    # the walk-only scenes and the caves (contract version 1.1); a walk_scenes.json in the folder is handed to both
    ("walk_scenes_not_json", "walk_scenes.json holds the words 'not json'", _text(WALK_SCENES, "not json"), False),
    ("walk_scenes_list", "walk_scenes.json is a JSON list", _text(WALK_SCENES, "[1, 2]"), False),
    ("walk_scenes_entry_word", "the entry of undermere in walk_scenes.json is the word caves", _text(WALK_SCENES, '{"undermere": "caves"}'), False),
    ("walk_scenes_kind_list", "in walk_scenes.json the kind of undermere is a list and its area prefix a number", _text(WALK_SCENES, '{"undermere": {"name": "x", "kind": ["cave"], "area_prefix": 5, "portal_ns": "um"}}'), False),
    ("index_walk_scenes_word", "walk_scenes in the index is the number 5", _edit(INDEX, lambda j: j.update(walk_scenes=5)), False),
    ("index_cave_scene_list", "the scene of under_a in the index is a list", _edit(INDEX, lambda j: j["areas"]["under_a"].__setitem__("scene", ["undermere"])), False),
    ("mouth_to_list", "the extra to of Portal_um.east_in is a list", _edit(EAST, lambda j: _named(j, "Portal_um.east_in")["extras"].__setitem__("to", ["undermere"])), False),
    ("cave_kind_word", "the wdi_kind of under_a is the number 7 and its wdi_scene a list", _edit(CAVE, lambda j: _node(j, "Area_")["extras"].update(wdi_kind=7, wdi_scene=["undermere"])), False),
]


TIMEOUT_S = 300     # a checker that is still running after this is counted as failed: it must never hang on a variant


def run(cmd, env=None):
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=TIMEOUT_S)
    except subprocess.TimeoutExpired:
        return -9, [], "no result: still running after %d s" % TIMEOUT_S, "", []
    fails = [m.group(1) for m in re.finditer(r"^FAIL  (\S+)", p.stdout, re.M)]
    notes = [m.group(1) for m in re.finditer(r"^NOTE  (\S+)", p.stdout, re.M)]
    tail = [ln for ln in p.stdout.splitlines() if ln.startswith("--- ") and " pass, " in ln]
    return p.returncode, fails, (tail[-1] if tail else (p.stderr.strip().splitlines() or ["no output"])[-1]), p.stdout, notes


def run_odd(cmd):
    """(ended as it should, exit code, FAIL rules, a trace was printed). On an odd input a checker must end with FAIL
    lines and exit 1, or exit 2 when there is nothing to check, and print no stack trace (Python's or Node's)."""
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=TIMEOUT_S)
    except subprocess.TimeoutExpired:
        return False, -9, [], False
    fails = [m.group(1) for m in re.finditer(r"^FAIL  (\S+)", p.stdout, re.M)]
    totals = any(ln.startswith("--- ") and " pass, " in ln for ln in p.stdout.splitlines())
    trace = "Traceback" in p.stderr or "    at " in p.stderr
    ok = not trace and p.returncode in (1, 2) and (p.returncode == 2 or (bool(fails) and totals))
    return ok, p.returncode, fails, trace


def main():
    ap = argparse.ArgumentParser(description="Break the fixture one rule at a time; both checkers must fail each on the intended rule.")
    ap.add_argument("--src", help="a checkout of the viewer's apps/walk/src (branch claude/v2-walk), for check_areas.mjs")
    ap.add_argument("--three", help="optional: the real three package, passed on to check_areas.mjs")
    ap.add_argument("--python-only", action="store_true", help="run walk_index.py alone")
    ap.add_argument("--keep", help="write the variants and each checker's output here, and keep them")
    ap.add_argument("--only", default="", help="run only these variants (names with commas)")
    args = ap.parse_args()

    default_src = os.path.normpath(os.path.join(HERE, "..", "..", "..", "apps", "walk", "src"))
    src = args.src or (default_src if os.path.exists(os.path.join(default_src, "spawn.ts")) else None)
    use_node = not args.python_only
    if use_node and not (src and os.path.exists(os.path.join(src, "portals.ts"))):
        print("check_areas.mjs needs the viewer's source: give --src <path to apps/walk/src> (branch claude/v2-walk),\n"
              "or run with --python-only to try walk_index.py alone.", file=sys.stderr)
        return 2
    node = shutil.which("node")
    if not node:
        print("node was not found: the fixture generator needs it.", file=sys.stderr)
        return 2
    work = args.keep or tempfile.mkdtemp(prefix="walk_mutants_")
    os.makedirs(work, exist_ok=True)
    only = [s for s in args.only.split(",") if s]
    gen = os.path.join(HERE, "fixture", "make-areas-fixture.mjs")
    py = [sys.executable, "-I", os.path.join(HERE, "walk_index.py")]
    js = [node, os.path.join(HERE, "check_areas.mjs")]
    js_tail = (["--src", src] if src else []) + (["--three", args.three] if args.three else [])
    who = "both checkers" if use_node else "walk_index.py (check_areas.mjs was NOT run)"

    def walk_scenes(folder):
        """--walk-scenes <its file> when a variant writes its own list of walk-only scenes beside its files."""
        path = os.path.join(folder, WALK_SCENES)
        return ["--walk-scenes", path] if os.path.exists(path) else []

    def both(folder):
        out = {"walk_index.py": run(py + [folder, "--check"] + walk_scenes(folder))}
        if use_node:
            out["check_areas.mjs"] = run(js + [folder] + js_tail + walk_scenes(folder))
        for name, result in out.items():
            with open(os.path.join(folder, name + ".txt"), "w", encoding="utf-8", newline="\n") as fh:
                fh.write(result[3])
        return out

    def variant(name):
        """The variant's folder with both checkers' results, or None when the generator failed."""
        folder = os.path.join(work, name)
        code, _, tail, _, _ = run([node, gen, folder], env=dict(os.environ, MUTATE=name))
        if code != 0:
            print("%-22s | the generator failed: %s" % (name, tail))
            return None
        return both(folder)

    bad = 0
    base = os.path.join(work, "baseline")
    code, _, tail, _, _ = run([node, gen, base], env={k: v for k, v in os.environ.items() if k != "MUTATE"})
    if code != 0:
        print("the fixture generator failed: " + tail, file=sys.stderr)
        return 2
    print("baseline: the unbroken fixture")
    baseline_ok = True
    for name, (code, fails, tail, _, _) in both(base).items():
        ok = code == 0 and not fails
        baseline_ok = baseline_ok and ok
        bad += 0 if ok else 1
        print("  %-16s %s  %s" % (name, "passes" if ok else "DOES NOT PASS (exit %d)" % code, tail))

    row = "%-22s | %-36s | %-22s | %-22s | %s"
    print()
    print(row % ("mutant", "the rule that must fail", "walk_index.py", "check_areas.mjs", "what is broken"))
    caught = total = 0
    for name, what, rule in MUTANTS:
        if only and name not in only:
            continue
        total += 1
        res = variant(name)
        if res is None:
            bad += 1
            continue
        cells, all_ok, others = [], True, []
        for checker in ("walk_index.py", "check_areas.mjs"):
            if checker not in res:
                cells.append("not run")
                continue
            code, fails, _, _, _ = res[checker]
            hit = [f for f in fails if re.fullmatch(rule, f)]
            ok = code == 1 and bool(hit)
            all_ok = all_ok and ok
            rest = [f for f in fails if f not in hit]
            cells.append(("caught" if ok else "MISSED (exit %d)" % code) + (", +%d more" % len(rest) if rest else ""))
            others.append("%s: %s" % (checker, ", ".join(rest) if rest else "nothing else"))
        caught += 1 if all_ok else 0
        bad += 0 if all_ok else 1
        print(row % (name, rule.replace("\\", ""), cells[0], cells[1], what))
        print("%-22s   also failed, as a consequence: %s" % ("", "; ".join(others)))

    print()
    print(row % ("allowed, with a note", "the note that must be printed", "walk_index.py", "check_areas.mjs", "what is unusual"))
    noted = noted_total = 0
    for name, what, rule in NOTED:
        if only and name not in only:
            continue
        noted_total += 1
        res = variant(name)
        if res is None:
            bad += 1
            continue
        cells, all_ok = [], True
        for checker in ("walk_index.py", "check_areas.mjs"):
            if checker not in res:
                cells.append("not run")
                continue
            code, fails, _, _, notes = res[checker]
            allowed = [] if checker == "walk_index.py" else ["journey"]
            ok = any(re.fullmatch(rule, n) for n in notes) and not [f for f in fails if f not in allowed]
            all_ok = all_ok and ok
            cells.append(("noted" if ok else "NOT AS SAID (exit %d)" % code) + (", fails " + ", ".join(fails) if fails else ""))
        noted += 1 if all_ok else 0
        bad += 0 if all_ok else 1
        print(row % (name, rule.replace("\\", ""), cells[0], cells[1], what))

    print()
    print(row % ("valid", "no rule may fail", "walk_index.py", "check_areas.mjs", "what is unusual"))
    passed = valid_total = 0
    for name, what in VALID:
        if only and name not in only:
            continue
        valid_total += 1
        res = variant(name)
        if res is None:
            bad += 1
            continue
        cells, all_ok = [], True
        for checker in ("walk_index.py", "check_areas.mjs"):
            if checker not in res:
                cells.append("not run")
                continue
            code, fails, _, _, _ = res[checker]
            ok = code == 0 and not fails
            all_ok = all_ok and ok
            cells.append("passes" if ok else "FAILS (exit %d): %s" % (code, ", ".join(fails)))
        passed += 1 if all_ok else 0
        bad += 0 if all_ok else 1
        print(row % (name, "-", cells[0], cells[1], what))

    print()
    orow = "%-24s | %-32s | %-24s | %-24s | %s"
    print(orow % ("odd input", "must end in FAIL lines, no trace", "walk_index.py", "check_areas.mjs", "what is odd"))
    odd_ok = odd_total = 0
    clean_env = {k: v for k, v in os.environ.items() if k != "MUTATE"}
    for name, what, make, three in ODD:
        if only and name not in only:
            continue
        odd_total += 1
        folder = os.path.join(work, "odd", name)
        code, _, tail, _, _ = run([node, gen, folder], env=clean_env)
        if code != 0:
            print("%-22s | the generator failed: %s" % (name, tail))
            bad += 1
            continue
        make(folder)
        runs = [("walk_index.py", py + [folder, "--check"] + walk_scenes(folder))]
        if use_node:
            runs.append(("check_areas.mjs", js + [folder, "--src", src] + (["--three", args.three] if three and args.three else []) + walk_scenes(folder)))
        cells, all_ok = [], True
        for checker, cmd in runs:
            ok, code, fails, trace = run_odd(cmd)
            all_ok = all_ok and ok
            cells.append(("exit 2, nothing to check" if code == 2 else "FAIL lines, exit %d" % code) if ok
                         else "NOT AS SAID (exit %d%s)" % (code, ", STACK TRACE" if trace else ""))
        if not use_node:
            cells.append("not run")
        odd_ok += 1 if all_ok else 0
        bad += 0 if all_ok else 1
        print(orow % (name, "-", cells[0], cells[1], what))

    print()
    print("--- %d of %d mutants caught on the intended rule by %s; %d of %d allowed variants noted; %d of %d valid variants pass; "
          "%d of %d odd inputs end in FAIL lines and no trace; the baseline %s"
          % (caught, total, who, noted, noted_total, passed, valid_total, odd_ok, odd_total, "passes" if baseline_ok else "DOES NOT PASS"))
    if args.keep:
        print("--- the variants and each checker's output are in the folder given with --keep")
    else:
        shutil.rmtree(work, ignore_errors=True)
    return 0 if bad == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
