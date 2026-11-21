"""HollowMere's interiors in 3D for the GAME CLIENT (interiors plan 4.8, Q4: "the 3d interiors replace the old
interior art"): one room built from its scene map at S metres per tile (`--tile-m`: 1.5, the village's frame, by
default; 1.0 is the game's own metersPerTile), rendered through the game's own isometric camera as one background
and per-tile slices, plus preview stills for the owner. Furniture, walls, doors and textures keep their size in
metres at any S; only the room's extent follows the tile.

Blender (one Blender at a time on the laptop; --factory-startup is required):

    blender -b --factory-startup -P tools/blender/meshy_interior_build.py -- --scene widow_bedroom
        [--tile-m 1.5] [--out tools/blender/build/interiors/widow_bedroom] [--passes] [--preview] [--res-factor 1]
        [--no-labels] [--samples 32] [--preview-res 1920] [--look tools/blender/meshy_looks/interior_warm.json]
        [--no-slice]

Plain Python with Pillow and numpy (no Blender), after `--passes` and `--preview`; the Blender run tries this step
itself last (the tile size comes from the folder's passes.json):

    python tools/blender/meshy_interior_build.py --scene widow_bedroom [--out DIR] [--step slices,labels]

The file reads `packages/content/data/scenes/<id>.json` and imports `meshy_village_build` and `meshy_wild_build`
(their shader kit, Meshy placer, Poly Haven importer, mesh builder, materials and tagged lights; neither is edited:
their tile size is set to S at run time). It needs the Poly Haven models its tables name in the model cache
(`python tools/blender/materials/fetch_models.py`) and, for the cloth, the `wool` and `carpet` textures
(`python tools/blender/materials/fetch.py --roles wool,carpet --res 1k`; a flat colour stands in without them).

Frame (the village's): x east, y north, z up, the room's centre on the origin, tile (tx, ty) centred at
((tx + 0.5 - W/2) * S, (H/2 - ty - 0.5) * S). Every mesh of the room hangs under `HM_RoomRoot`, which the game
passes scale by 0.75 S in z (metrics zScale 0.75 times S: 1.125 at 1.5 m, 0.75 at 1.0 m), so a vertical metre is
58.79 px at any S, as in the 2.5D art, and the client's characters keep their height. The saved file keeps the root
at 1.

Shell: the client's cut-away (packages/content/src/tilemap.ts `geometryOf`, `kitFrameOf`). Each `#` tile of a
kit material is one block: the front shell (no walkable tile at x' >= x and y' >= y) a stub, then the back shell
(no walkable tile at x' <= x and y' <= y) full height, every other solid tile half height; a tile more than 2 tiles
(Chebyshev) from the floor draws nothing; a `P` tile draws no wall of its own (a wall-mounted prop brings its wall).
Walls are plaster over a dark wood skirting. The floor lies under every tile, by material letter
(`roles.GROUND_ROLES["harbour"]`: w = wood_floor, ...). Portals keep their id in the object name.

Props and spots: `PROP_MODELS` / `SPOT_MODELS` (prop id, id stem, kind / spot variant -> model), named for their
id (`HM_Prop_<id>`, `HM_Spot_<id>`). Furniture is Poly Haven pieces at real size (model "ph": the locked, cached
models of tools/blender/materials/fetch_models.py through meshy_wild_build's importer, each piece joined with what
stands on it and its procedural extras into one object); a prop with no model yet is a grey box at its target size.
Preview stills label every standing prop and spot but the Meshy ones; the game passes never do. Standing objects
keep to their own solid tile(s) where their size in metres fits; where it does not (at small S), they keep their
north and west ends inside the tile and reach south or east, toward the camera, up to SPAN_OVER, and a piece that
cannot shrinks as a whole until it does; any piece another one reaches into, or a window's curtains, is pushed out
along its facing. The bed is the exception the data forces (its sleeper lies on a walkable tile beside the
under-bed spot). Every overhang is reported, with each piece's size and scale.

Game passes (`--passes`, transparent film, the IsoCam of camera-layering.md 2: ortho, (60, 0, 45) degrees,
K = 128 / (S sqrt 2) px per metre, canvas (64 (W + H) + 128) x (32 (W + H) + 384) at factor 1, lit by the 2.5D
rig's key and fill directions plus a weak warm bounce from the east for the faces turned from both, under a neutral
grey world, so cast shadows fall toward ink rather than navy; the client adds night, light pools and glows, and
the candle's flame is lit, not glowing):
  bg.png     the floor (with flat floor props) and the back shell; every other object hidden from the camera but
             still casting shadows, except the standing walls that touch the back shell (drawn under their own
             slices, so the seam where the two passes meet is not anti-aliased twice)
  stand.png  everything else, the floor and back shell as holdouts
  code.png   the tile-code pass of stand.png: emission ((tx + 1) / 255, (ty + 1) / 255, 0), raw, filter 0, one
             sample; each object coded to its own solid tile(s), clamped as build_buildings.code_material clamps
  passes.json the frame, every object (pass, tiles, code footprint, model) and the Blender projection probe
The slice step (plain Python, mirroring tools/sprites/slice.ts at block 1) floors every opaque pixel at ink, cuts
stand.png into one full-canvas PNG per tile (`slices/<id>#<tx>_<ty>.png`), composites `preview_iso.png` on ink,
measures the alignment against the camera formula and writes `room_<id>.json`.

Preview stills (`--preview`): perspective views inside the room (`VIEWS`) at 1920 x 1080 under a look
(`meshy_looks/interior_warm.json` through `meshy_village_look.apply_look`: the candle and the moon at the window, a
moon a quarter paler than the palette's, its glint at 0.15 and its strength scaled with the tile, (S / 1.5)^2, so
its light lands on the same tiles as at 1.5 m; the look's `sky.ambient_color`, read here, lights the room with a
neutral ambient while camera rays see the look's ink, which its exposure lifts to a dark navy round the room),
saved as `preview_<view>.png` (lossless: JPEG noise breaks the palette rules the render keeps). The pieces are
labelled in the plain-Python step: text about 20 px tall at 1920 px on an ink plate, nudged off every other standing
object, the window and the photographs, 6 px clear of each other and of the frame (Blender writes
`raw/preview_<view>.png` and `preview.json`; without that step the stills stay unlabelled).

Outputs: `tools/blender/build/interiors/<out folder>.blend` and the out folder (default
`tools/blender/build/interiors/<id>/`; git-ignored).
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys
import time

try:
    import bpy
except ImportError:  # plain Python: the slice step (Pillow) only
    bpy = None

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SCENES_DIR = os.path.join(ROOT, "packages", "content", "data", "scenes")
TILEMAPS_DIR = os.path.join(ROOT, "apps", "client", "public", "assets", "scenes")
BUILD_DIR = os.path.join(HERE, "build", "interiors")
DEFAULT_LOOK = os.path.join(HERE, "meshy_looks", "interior_warm.json")

# ---------------------------------------------------------------- the frame and the game camera (pure Python)

TILE_M_DEFAULT = 1.5       # metres per tile by default: the village's frame (meshy_village_look.TILE_M)
Z_SCALE = 0.75              # metrics.json iso.zScale: the 2.5D art's vertical squash
# The tile size and what follows from it; set_tile_m() sets all four (--tile-m, or the passes.json of a folder).
S = TILE_M_DEFAULT          # metres per tile
GAME_Z = Z_SCALE * S        # HM_RoomRoot's z scale in the game passes: 0.75 x S, so KV x GAME_Z = 58.79 px per metre
K = 128.0 / (S * math.sqrt(2.0))           # display px per ground metre: 60.34 at 1.5 m per tile, 90.51 at 1.0 m
KV = K * math.sin(math.radians(60.0))      # display px per world vertical metre (x GAME_Z = 58.79 per model metre)
TOP_PAD = 320               # metrics.json iso.topPadPx: the client's camera never shows screen y < -320
CAM_D = 60.0                # camera distance along its view axis (clip_end covers D + (W + H) * S)
INK = (0x12, 0x14, 0x1C)    # palette ink: the darkest value of any pixel


def set_tile_m(s: float) -> None:
    """The tile size in metres, and the camera scale and the passes' z scale that follow from it."""
    global S, GAME_Z, K, KV
    s = float(s)
    if not 0.5 <= s <= 3.0:
        raise SystemExit(f"meshy_interior_build: --tile-m {s} is outside 0.5 to 3.0 m")
    S, GAME_Z = s, Z_SCALE * s
    K = 128.0 / (S * math.sqrt(2.0))
    KV = K * math.sin(math.radians(60.0))

SOLID = set("#DHB")
FLOOR_LETTERS = set("glmpdcfwrs~u=")
KIT = {"W": "wall", "T": "tree", "R": "boulder", "X": "cliff", "F": "fence", "K": "stack"}
ONE_HEIGHT = set("RFK")
DEFAULT_FLOOR = {"village": "g", "house": "w", "forest": "l", "cave": "r"}
DEFAULT_SOLID = {"village": "W", "house": "W", "forest": "T", "cave": "X"}
DEEP_CULL = 2                                                   # metrics.json iso.deepCullTiles
AROUND = ((0, 1, "S"), (1, 0, "E"), (0, -1, "N"), (-1, 0, "W"))  # tilemap.ts AROUND: south, east, north, west
SIDE_DXY = {"N": (0, -1), "E": (1, 0), "W": (-1, 0), "S": (0, 1)}  # grid steps (y grows south)
OPPOSITE = {"N": "S", "S": "N", "E": "W", "W": "E"}
FACE_RZ = {"S": 0.0, "E": 90.0, "N": 180.0, "W": -90.0}   # turn that brings a piece built facing -y to face a side

# The cut-away heights (tilemap.ts kitFrameOf: full / half / stub), in the 3D frame's metres before the root's z scale.
WALL_H = {"full": 3.0, "half": 1.4, "stub": 0.35}
SKIRT_H = 0.16              # the dark wood skirting
SKIRT_IN = 0.02             # the plaster stands this far behind the skirting's face
GAP = 0.03                  # furniture stands this far off the wall or neighbour behind it
DOOR_W, DOOR_H = 1.0, 2.15  # a doorway's opening (narrowed to 0.8 tile where a tile is narrower than 1.25 m)
WALLTOP_K = 0.28            # the cut wall tops: the plaster this dark and greyer, a cap darker than every lit face
FLOOR_ZOOM = {"w": 2.4}     # floor letter -> the scan's repeat enlarged, in metres at any S: old_wood_floor's 0.103 m
                            # boards become 0.25 m planks (9.5 px wide at 1.5 m per tile, 14 px at 1.0 m)
FLOOR_TINT = {"w": (1.0, 1.08, 0.82)}   # floor letter -> the scan warmed toward amber (linear RGB factors): its red
                            # against its green is what turned the moon's blue lilac where the candle mixes in (N4)
SPAN_OVER = 0.25            # tiles a standing piece may reach past its tile to the south or east (none north or west)

# What each prop and spot is drawn with. Lookup order: the prop id, its id tail, the tail without a trailing _<n>
# (the client's own art key, apps/client/src/view/mapDefs.ts:102-105), then the kind; spots by id, then variant.
#   model "ph":     a Poly Haven piece (tools/blender/materials/fetch_models.py's lock and cache; every one is built
#                   facing -y): `slug` at `scale`, or `tall` metres high, never over `kmax`; `rot` turns it about z
#                   first, `mirror` flips it left to right, `doors` {node: degrees} sets a hinged piece's angle about
#                   its own hinge (0 shut; over 0 open, as far as the tile rules allow, down in 5 degree steps),
#                   `drop` leaves pieces out. `dress`: Poly Haven pieces standing on it (slug, scale, `at` = (x from
#                   its centre, y in from its back edge or None for its centre, z over its top) in metres, `rot`,
#                   `lod` a decimate ratio). `extras`: "marble" (a procedural top), "cloth" (a plain matte black
#                   cloth hung over the first dress piece), "flame" (on the first dress piece's top: emissive in the
#                   previews only), "sheets" (folded linen inside, on the shelf under `sheets` = (x0, x1, y0, y1,
#                   z above) in the model's own metres). `bed`: laid over the bed tiles as model "bed" (its head at
#                   +y); `centre`: stood on its tile's centre. A piece that cannot keep the overhang rules at its
#                   scale shrinks as a whole until it does (reported as ph.kFinal).
#   model "meshy":  a Meshy model by catalog name, `size` its longest side in metres (vb.place: its own textures)
#   model "box":    a grey box (width along its front, depth, height) in metres, named for its id, labelled in previews
#   model "bed":    a grey box bed (length, width, height) with a headboard `head` m tall; with an under-bed spot beside
#                   it, one bed spans both tiles, its head at the spot's far end, coded to the spot's solid tile
#   model "candle": a grey box tripod table (w, d, h) with a candle and its flame (the scene light's anchor)
#   model "rug":    a flat rug (length, width) in the `carpet` role's texture: drawn with the floor, so it may reach
#                   over the walkable tiles round its own
#   model "photos" / "window": wall-mounted (`wall`: the prop brings its own wall block on a `P` tile); the photos are
#                   PHOTO_FRAMES' Poly Haven frames with sepia prints
# Sizes are real sizes (the Poly Haven picks of ph_furniture/match_bedrooms-cottages.json; the human-scale targets of
# interiors/assets.md for the rest). Add a row (a new model, a new room) and rerun.
CABINET_DOORS = ("GothicCabinet_01_door1", "GothicCabinet_01_door2", "GothicCabinet_01_door3", "GothicCabinet_01_door4")
CABINET = dict(model="ph", slug="GothicCabinet_01", tall=2.0, kmax=0.87)   # the carved two-tier oak press
PH_BED = dict(model="ph", slug="GothicBed_01", scale=0.95, bed=True)       # the carved double bed, linen made up
PROP_MODELS: dict[str, dict] = {
    "wb.blanket_chest": dict(model="meshy", name="kit_chest", size=0.9),
    "blanket_chest": dict(model="meshy", name="kit_chest", size=0.9),
    "trunk": dict(model="meshy", name="kit_chest", size=0.9),
    "bed": PH_BED,
    # a carved console with a triple glass: the centre glass on its back edge, the wings hinged at its sides and
    # turned 30 degrees in; the centre glass hung with a plain matte black cloth (the scene's "mirror hung in black")
    "dressing_table": dict(model="ph", slug="ClassicConsole_01", scale=0.8, extras=("cloth",), dress=(
        dict(slug="ornate_mirror_01", scale=1.0, at=(0.0, 0.025, 0.0)),
        dict(slug="ornate_mirror_01", scale=0.8, at=(0.4116, 0.122, 0.0), rot=-30.0),
        dict(slug="ornate_mirror_01", scale=0.8, at=(-0.4116, 0.122, 0.0), rot=30.0))),
    # a chest of drawers from the same set dressed as a washstand: a marble top, the china ewer in the brass basin
    "washstand": dict(model="ph", slug="GothicCommode_01", scale=0.75, extras=("marble",), dress=(
        dict(slug="brass_pot_02", scale=1.0, at=(0.12, 0.20, 0.0)),
        dict(slug="jug_01", scale=1.4, at=(0.10, 0.20, 0.012), rot=25.0))),
    # the third press, its upper right door open on folded sheets ("one door ajar on stacked sheets")
    "linen_press": dict(CABINET, doors=dict({d: 0.0 for d in CABINET_DOORS}, GothicCabinet_01_door2=70.0),
                        extras=("sheets",), sheets=(0.10, 0.66, -0.38, 0.02, 2.05)),
    # a slim stand with a turned wooden candlestick (213k triangles as scanned: decimated to about 4k) and its flame
    "candle": dict(model="ph", slug="side_table_tall_01", scale=0.85, centre=True, extras=("flame",), dress=(
        dict(slug="wooden_candlestick", scale=1.0, at=(0.0, None, 0.0), lod=0.02),)),
    "photos": dict(model="photos", wall=True),
    "draped_window": dict(model="window", wall=True, drape=True),
    "rug": dict(model="rug", size=(2.6, 1.8)),
}
SPOT_MODELS: dict[str, dict] = {
    "wb.wardrobe_body": dict(CABINET, mirror=True),   # the second press, mirrored, its doors ajar as modelled
    "wardrobe": dict(CABINET, doors={d: 0.0 for d in CABINET_DOORS}),   # the hide: doors shut
    "underBed": PH_BED,
    "trunk": dict(model="meshy", name="kit_chest", size=0.9),
}
# The photographs: Poly Haven frames on the wall face (slug, scale, local x, centre height, print), squeezed as a
# group to 0.92 of the tile where the tile is narrower; the scanned prints are swapped for sepia portraits
# (PHOTO_PRINT: the print's material and its UV box) and the oval frames' glass is left out.
PHOTO_FRAMES = (("hanging_picture_frame_03", 1.0, 0.0, 1.88, "portrait"),
                ("hanging_picture_frame_03", 0.75, -0.40, 1.80, "profile"),
                ("hanging_picture_frame_03", 0.75, 0.40, 1.80, "figure"),
                ("fancy_picture_frame_02", 0.34, -0.19, 1.33, "couple"),
                ("fancy_picture_frame_02", 0.30, 0.19, 1.35, "portrait"))
PHOTO_PRINT = {"hanging_picture_frame_03": ("hanging_picture_frame_03_artwork", (0.1436, 0.8566), (0.0032, 0.9941)),
               "fancy_picture_frame_02": ("fancy_picture_frame_02_canvas", (0.1452, 0.8545), (0.0453, 0.9490))}
PHOTO_DROP = {"hanging_picture_frame_03": ("hanging_picture_frame_03_glass",)}
DEFAULT_BOX = dict(model="box", size=(1.0, 0.6, 1.0))
BED_HEAD_MARGIN = 0.25      # the bed's head stands this far inside the spot tile's far edge

# The scene's lights (preview stills only; the client draws its own pools): height, default watts and radius.
LIGHT_Z = {"lamp": 1.0, "lantern": 1.9, "torch": 1.7, "fire": 0.45, "window": 1.6, "moon": 1.6, "moss": 0.3, "shaft": 2.6}
LIGHT_DEFAULTS = {"lamp": (35.0, 0.02), "lantern": (120.0, 0.1), "torch": (80.0, 0.08), "fire": (200.0, 0.3),
                  "window": (60.0, 0.5), "moon": (60.0, 0.5), "moss": (20.0, 0.3), "shaft": (40.0, 1.0)}
LIGHT_TOKEN = {"lantern": "lantern", "torch": "lantern", "lamp": "lantern", "fire": "lantern", "window": "lantern",
               "moss": "teal", "moon": "moon", "shaft": "moon"}   # tilemap.ts LIGHT_COLOR
# The moon's glint (light specular factor) in the stills: its blue highlights over the red-brown scanned woods (the
# washstand's mahogany: green / red 0.29) and over the candlelit floor read magenta at full strength
MOON_SPECULAR = {"moon": 0.15, "shaft": 0.15}

# The game passes' light: the 2.5D rig's key and fill (rig_common.KEY_LIGHT / FILL_LIGHT: directions and colours),
# with strengths for these PBR materials under the Standard view, and a grey world for the faces turned from both.
# The key (from the south) and the fill (from the north) leave the faces that look east (the west wall's inner face,
# every piece's east side) to the world alone: dark. A weak warm bounce from the east, low and without shadows,
# lifts them to about 0.8 of the south faces' luminance with the plaster's own hue (its colour is the key's #FFF1DC
# pulled toward the palette's warm #FFB457 so that, added to the world, it lights like the key). The world is a
# neutral grey of the old slate world's luminance (#2C3240's): what lights a cast shadow is the world alone (and the
# moon-blue fill on the tops), and slate turned every shadow navy (N3).
GAME_KEY_STRENGTH = 2.2
GAME_FILL_STRENGTH = 0.5
GAME_WORLD_COLOR = "#323232"
GAME_WORLD_STRENGTH = 4.0
GAME_KEY_ANGLE = 3.0        # degrees: the HD finish's soft key
GAME_BOUNCE = {"azimuth": 90.0, "elevation": 10.0, "strength": 0.67, "color": "#FFE8B8"}   # world bearing: east
GAME_GLASS = ("#9FB0C8", 0.30)   # the window glass in the game passes: a faint pale grey-blue, so the drape reads
PREVIEW_GLASS_GLOW = 0.35   # the window glass's faint moonlit glow in the preview stills

# Preview stills: name -> [[eye x, eye y, eye height above the floor], [target x, target y, target z], lens mm,
# {options}], x and y in corner tile units (a tile's centre is +0.5), heights in metres: the meshy_views form, framed
# at VIEWS_TILE_M metres per tile. An "overview" view (high over the cut walls) keeps its angles at another tile size:
# its heights scale with the tile; eye-level views keep their heights in metres. VIEWS_AT replaces views per tile size.
VIEWS_TILE_M = 1.5
VIEWS: dict[str, dict] = {
    "widow_bedroom": {
        "room": [[12.9, 11.6, 7.4], [5.6, 3.6, 0.3], 22, {"exposure": 1.0, "overview": True}],   # over the cut walls
        "bed": [[11.0, 6.8, 1.7], [8.7, 3.5, 0.45], 26],      # from the south-east: the bed, the candle, the chest
        "window": [[9.7, 7.3, 1.6], [4.6, 0.7, 1.45], 24],    # from the south-east corner: the window, the washstand
        "press": [[8.4, 1.9, 1.65], [10.4, 3.7, 1.15], 30, {"exposure": 1.0}],   # from the north-west, past the
                                                               # open door into the press's sheets (it faces west)
    },
}
VIEWS_AT: dict[tuple, dict] = {
    ("widow_bedroom", 1.0): {
        "bed": [[9.8, 7.9, 1.8], [8.9, 3.7, 0.4], 26],       # the bed spans (8,3)-(9,3) and reaches 0.3 tile south
    },
}


class Room:
    """A scene file and the shell the client derives from it (packages/content/src/tilemap.ts)."""

    def __init__(self, scene_id: str):
        path = os.path.join(SCENES_DIR, f"{scene_id}.json")
        with open(path, encoding="utf-8") as fh:
            self.d = json.load(fh)
        d = self.d
        self.id = d["id"]
        self.w, self.h = int(d["size"]["w"]), int(d["size"]["h"])
        self.grid = d["grid"]
        self.kind = d.get("kind", "interior")
        self.biome = d.get("biome") or ("village" if self.kind == "exterior" else "house")
        self.dark = bool(d.get("dark"))
        self.mat = d.get("material") or self._material_of()
        self.props = d.get("props", [])
        self.spots = d.get("spots", [])
        self.portals = d.get("portals", [])
        self.lights = d.get("lights", [])
        self.spawns = d.get("spawns", [])
        self._shells()

    # -- tiles
    def inside(self, x: int, y: int) -> bool:
        return 0 <= x < self.w and 0 <= y < self.h

    def solid(self, x: int, y: int) -> bool:
        return not self.inside(x, y) or self.grid[y][x] in SOLID

    def walkable(self, x: int, y: int) -> bool:
        return self.inside(x, y) and self.grid[y][x] not in SOLID

    def _material_of(self) -> list[str]:
        """tilemap.ts materialOf for a scene with no material layer: biome floor, P under props, biome solid."""
        covered = set()
        rects = [b["footprint"] for b in (self.d.get("buildings") or [])]
        rects += [p["footprint"] for p in self.d.get("props", []) if p.get("footprint")]
        for r in rects:
            for yy in range(r["y"], r["y"] + r["h"]):
                for xx in range(r["x"], r["x"] + r["w"]):
                    covered.add((xx, yy))
        anchors = {(p["x"], p["y"]) for p in self.d.get("props", [])}
        rows = []
        for y, row in enumerate(self.grid):
            out = []
            for x, c in enumerate(row):
                if c not in SOLID:
                    out.append(DEFAULT_FLOOR[self.biome])
                elif c == "#" and ((x, y) in covered or (x, y) in anchors):
                    out.append("P")
                else:
                    out.append(DEFAULT_SOLID[self.biome])
            rows.append("".join(out))
        return rows

    def _shells(self) -> None:
        """tilemap.ts geometryOf: the Chebyshev distance to the floor and the walkable quadrant counts."""
        w, h = self.w, self.h
        far = w + h
        dist = [[0 if self.walkable(x, y) else far for x in range(w)] for y in range(h)]

        def relax(x, y, dxs, dys):
            for dx, dy in zip(dxs, dys):
                nx, ny = x + dx, y + dy
                if self.inside(nx, ny):
                    dist[y][x] = min(dist[y][x], dist[ny][nx] + 1)

        for y in range(h):
            for x in range(w):
                relax(x, y, (-1, -1, 0, 1), (0, -1, -1, -1))
        for y in range(h - 1, -1, -1):
            for x in range(w - 1, -1, -1):
                relax(x, y, (1, 1, 0, -1), (0, 1, 1, 1))
        self.dist = dist

        def quad(sx, sy):
            s = [[0] * (w + 2) for _ in range(h + 2)]
            xs = range(w - 1, -1, -1) if sx > 0 else range(w)
            ys = range(h - 1, -1, -1) if sy > 0 else range(h)
            for y in ys:
                for x in xs:
                    s[y + 1][x + 1] = ((1 if self.walkable(x, y) else 0) + s[y + 1][x + 1 + sx] + s[y + 1 + sy][x + 1]
                                       - s[y + 1 + sy][x + 1 + sx])
            return lambda x, y: s[y + 1][x + 1]

        self._se, self._nw = quad(1, 1), quad(-1, -1)

    def culled(self, x: int, y: int) -> bool:
        return self.dist[y][x] > DEEP_CULL

    def front(self, x: int, y: int) -> bool:
        return self.solid(x, y) and self._se(x, y) == 0

    def back(self, x: int, y: int) -> bool:
        return self.solid(x, y) and self._nw(x, y) == 0

    def shell_class(self, x: int, y: int) -> str:
        """The cut-away height of a wall on this tile: kitFrameOf without its material test (front checked first)."""
        if self.front(x, y):
            return "stub"
        if self.kind == "exterior" or self.back(x, y):
            return "full"
        return "half"

    def kit_class(self, x: int, y: int) -> str | None:
        """tilemap.ts kitFrameOf: the height class of a drawn kit tile; None where the tile draws no kit piece."""
        m = self.mat[y][x]
        if self.grid[y][x] != "#" or m not in KIT or self.culled(x, y):
            return None
        if m in ONE_HEIGHT:
            return "full"
        cls = self.shell_class(x, y)
        if m == "T" and cls == "half":
            cls = "full"
        return cls

    def portal_face(self, x: int, y: int) -> str:
        """tilemap.ts portalFace: s or e for a full frame, sill where the opening faces north or west."""
        for dx, dy, side in AROUND:
            if self.walkable(x + dx, y + dy):
                return side.lower() if side in ("S", "E") else "sill"
        return "sill"

    def open_side(self, x: int, y: int) -> str | None:
        """The side of the first walkable neighbour (south, east, north, west), or None."""
        for dx, dy, side in AROUND:
            if self.walkable(x + dx, y + dy):
                return side
        return None

    def back_side(self, x: int, y: int) -> str | None:
        """The side a standing piece puts its back to: the first solid neighbour, north, east, west, south."""
        for side in ("N", "E", "W", "S"):
            dx, dy = SIDE_DXY[side]
            if self.solid(x + dx, y + dy):
                return side
        return None

    def floor_letter(self, x: int, y: int) -> str:
        m = self.mat[y][x]
        if m in FLOOR_LETTERS:
            return m
        for dx, dy, _ in AROUND:  # a solid tile takes its first walkable neighbour's floor (south, east, north, west)
            nx, ny = x + dx, y + dy
            if self.walkable(nx, ny) and self.mat[ny][nx] in FLOOR_LETTERS:
                return self.mat[ny][nx]
        return DEFAULT_FLOOR[self.biome]

    # -- the frame
    def centre(self, tx: float, ty: float) -> tuple[float, float]:
        return (tx + 0.5 - self.w / 2) * S, (self.h / 2 - ty - 0.5) * S

    def corner(self, cx: float, cy: float) -> tuple[float, float]:
        return (cx - self.w / 2) * S, (self.h / 2 - cy) * S

    def tile_box(self, tx: int, ty: int) -> tuple[float, float, float, float]:
        """World (x0, y0, x1, y1) of a tile: west, south, east, north."""
        x0, y1 = self.corner(tx, ty)
        x1, y0 = self.corner(tx + 1, ty + 1)
        return x0, y0, x1, y1


def canvas(room: Room) -> tuple[int, int]:
    n = room.w + room.h
    return 64 * n + 128, 32 * n + 384


def pivot(room: Room) -> tuple[int, int]:
    """The canvas px of the room centre (the Blender origin)."""
    n = room.w + room.h
    return 32 * n + 64, 16 * n + 320


def top_left(room: Room) -> tuple[int, int]:
    """Client screen px of the canvas's top-left corner (the unpadded cameraBounds box)."""
    return -64 * room.h - 64, -TOP_PAD


def iso_px(room: Room, x: float, y: float, z: float, f: float = 1.0) -> tuple[float, float]:
    """Canvas px of a world point (z in world metres: a model height times GAME_Z in the passes)."""
    tx, ty = x / S + room.w / 2, room.h / 2 - y / S
    return f * (64 * (tx - ty) + 64 * room.h + 64), f * (32 * (tx + ty) + TOP_PAD - KV * z)


def camera_location() -> tuple[float, float, float]:
    """IsoCam's position: the ground point (-2 S, 2 S, 0) at the canvas centre, CAM_D back along the view axis."""
    fx = -math.sin(math.radians(45.0)) * math.sin(math.radians(60.0))   # forward = (-0.6124, 0.6124, -0.5)
    fz = -math.cos(math.radians(60.0))
    return -2 * S - fx * CAM_D, 2 * S + fx * CAM_D, -fz * CAM_D


def out_paths(scene_id: str, out: str | None) -> tuple[str, str]:
    """The out folder and the .blend beside it, named for the folder (widow_bedroom_1m/ -> widow_bedroom_1m.blend)."""
    out_dir = os.path.abspath(out or os.path.join(BUILD_DIR, scene_id))
    return out_dir, os.path.join(os.path.dirname(out_dir), f"{os.path.basename(out_dir) or scene_id}.blend")


def fit_span(a: float, b: float, size: float, lo_wall: bool, hi_wall: bool, nw_low: bool) -> tuple[float, float]:
    """Where a piece `size` long goes along one axis of the tile span [a, b] (world metres): centred when it fits
    between the walls either side (GAP off each); else its north or west end (`nw_low`: the low end, as for x) stays
    inside the tile and it reaches south or east, toward the camera, unless that side is a wall."""
    lo_lim = a + (GAP if lo_wall else 0.0)
    hi_lim = b - (GAP if hi_wall else 0.0)
    if size <= hi_lim - lo_lim + 1e-9:
        lo = min(max((a + b) / 2 - size / 2, lo_lim), hi_lim - size)
        return lo, lo + size
    if nw_low:
        return (lo_lim, lo_lim + size) if not hi_wall else (hi_lim - size, hi_lim)
    return (hi_lim - size, hi_lim) if not lo_wall else (lo_lim, lo_lim + size)


def overhang_of(box, span) -> dict:
    """Tiles a world box (x0, y0, x1, y1) reaches past a world span (x0, y0, x1, y1) on each side."""
    return {"W": round(max(span[0] - box[0], 0.0) / S, 3), "E": round(max(box[2] - span[2], 0.0) / S, 3),
            "N": round(max(box[3] - span[3], 0.0) / S, 3), "S": round(max(span[1] - box[1], 0.0) / S, 3)}


def over_rules(over: dict) -> list:
    """The sides that break the rule: nothing past the north or west edge, at most SPAN_OVER past south or east."""
    return [k for k, v in over.items() if (k in ("N", "W") and v > 0.005) or (k in ("S", "E") and v > SPAN_OVER + 1e-6)]


# ================================================================ Blender

vb = wb = mi = mr = rc = mvl = None   # meshy_village_build, meshy_wild_build, meshy_import, roles, rig_common, look
Vector = Matrix = None
COL: dict = {}
BUILT: list[dict] = []      # every room object: obj, name, what, id, tiles, pass_, code, model, label, ...
MATS: dict = {}
ROOT_NAME = "HM_RoomRoot"


def _load() -> None:
    global vb, wb, mi, mr, rc, mvl, Vector, Matrix, COL
    sys.path.insert(0, HERE)
    import meshy_import as _mi
    import meshy_village_build as _vb   # the village's shader kit, Meshy placer and collections: reused, not edited
    import meshy_village_look as _mvl
    import meshy_wild_build as _wb      # MB, materials, tagged lights: reused, not edited
    import rig_common as _rc
    from materials import roles as _mr
    from mathutils import Matrix as _Matrix, Vector as _Vector

    vb, wb, mi, mr, rc, mvl, Vector, Matrix = _vb, _wb, _mi, _mr, _rc, _mvl, _Vector, _Matrix
    COL = vb.COL
    # The shared kit reads its tile size from module globals at call time (vb.S, wb.S, mvl.TILE_M, all 1.5 as
    # imported): this run's tile size replaces them (the files are not edited), so the still cameras' tile units and
    # anything else of theirs this room calls agree with the room's frame.
    vb.S = wb.S = S
    mvl.TILE_M = S


def lin(token_or_hex: str) -> tuple[float, float, float]:
    h = rc.PALETTE.get(token_or_hex, token_or_hex)
    return tuple(rc.hex_to_linear(h)[:3])


def M4(x: float, y: float, z: float = 0.0, rz: float = 0.0):
    return Matrix.Translation(Vector((x, y, z))) @ Matrix.Rotation(math.radians(rz), 4, "Z")


def register(ob, what: str, id_: str, tiles, pass_: str, code=None, model: str = "", label: str | None = None,
             **extra) -> dict:
    ob["wdi_what"], ob["wdi_id"], ob["wdi_pass"] = what, id_, pass_
    if code is not None:
        ob["wdi_code"] = list(code)
    rec = dict(obj=ob, name=ob.name, what=what, id=id_, tiles=[list(t) for t in tiles], pass_=pass_,
               code=list(code) if code is not None else None, model=model, label=label, **extra)
    BUILT.append(rec)
    return rec


def pass_for(room: Room, tiles, flat: bool = False) -> str:
    """bg for the floor layer and the back shell (no character can stand behind it), stand for everything else."""
    return "bg" if flat or all(room.back(x, y) for x, y in tiles) else "stand"


# ---------------------------------------------------------------- materials


def tex_cached(role: str, maps=("diff", "nor_gl")) -> bool:
    return all(os.path.exists(mr.texture_path(role, m, res=vb.GROUND_RES)) for m in maps)


def _node_material(name: str):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except (AttributeError, TypeError):   # always on in newer Blenders
        pass
    return m


def _emission(name: str, color, strength: float):
    m = _node_material(name)
    nodes, links = m.node_tree.nodes, m.node_tree.links
    for n in list(nodes):
        nodes.remove(n)
    em = nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*color[:3], 1.0)
    em.inputs["Strength"].default_value = strength
    links.new(em.outputs[0], nodes.new("ShaderNodeOutputMaterial").inputs["Surface"])
    return m


def mat_plaster(name: str, k: float, grey: float = 0.0):
    """Plaster: the Poly Haven role when it is cached (toned warm, its moss taken out), else a warm flat plaster;
    `k` darkens it and `grey` takes that share of its colour out (the cut tops' cap)."""
    if tex_cached("plaster"):
        return wb.role_mat(name, "plaster", k=0.95 * k, desat=0.6 + 0.4 * grey, tint=(1.0, 0.92, 0.78), rough=0.9,
                           bump=0.25)
    if k == 1.0:
        print(f"PLASTER: role plaster ({mr.role('plaster').slug}) is locked but not cached; a warm flat plaster stands in "
              f"(python tools/blender/materials/fetch.py --roles plaster --res {vb.GROUND_RES})", flush=True)
    m = bpy.data.materials.new(name)
    b = vb._principled(m)
    g = vb.G(m.node_tree)
    pos = g.position()
    base = [c * k for c in (0.540, 0.456, 0.330)]   # #C2B49B: warm limewash
    if grey:
        y = 0.2126 * base[0] + 0.7152 * base[1] + 0.0722 * base[2]
        base = [y + (c - y) * (1.0 - grey) for c in base]
    mottle = g.smooth(g.noise(pos, 1.4, 4.0, 0.55), 0.30, 0.72)
    col = g.mix(mottle, [c * 0.90 for c in base], [c * 1.04 for c in base])
    g.link(col, b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.92
    bump = vb._new(g.n, "ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.18
    bump.inputs["Distance"].default_value = 0.01
    g.link(g.noise(pos, 11.0, 4.0, 0.6), bump.inputs["Height"])
    g.link(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def mat_floor(letter: str):
    name = f"HM_Floor_{letter}"
    if name in MATS:
        return MATS[name]
    role = mr.GROUND_ROLES["harbour"].get(letter)
    if role is None or not tex_cached(role, ("diff", "nor_gl", "rough")):
        print(f"WARN floor {letter}: role {role} not cached, a flat colour stands in "
              f"(python tools/blender/materials/fetch.py --roles {role} --res {vb.GROUND_RES})", flush=True)
        flat = {"w": (0.16, 0.10, 0.06), "f": (0.25, 0.25, 0.24), "c": (0.20, 0.20, 0.19), "d": (0.12, 0.09, 0.06),
                "l": (0.18, 0.15, 0.08)}.get(letter, (0.2, 0.18, 0.15))
        MATS[name] = wb.flat_mat(name, flat, rough=0.8)
        return MATS[name]
    m = bpy.data.materials.new(name)
    b = vb._principled(m)
    g = vb.G(m.node_tree)
    uv = vb._new(g.n, "ShaderNodeUVMap", uv_map="UVMap").outputs["UV"]   # world metres (vb.uv_world): any S
    zoom = FLOOR_ZOOM.get(letter, 1.0)
    col = g.tex(uv, role, "diff", vb.GROUND_RES, zoom=zoom)
    if letter in FLOOR_TINT:
        col = wb.mul_rgb(g, col, FLOOR_TINT[letter])
    var = g.math("ADD", 0.90, g.math("MULTIPLY", g.noise(g.position(), 0.35, 3.0), 0.18))   # breaks the repeat
    g.link(wb.scale_by(g, col, var), b.inputs["Base Color"])
    g.link(g.tex(uv, role, "rough", vb.GROUND_RES, zoom=zoom), b.inputs["Roughness"])
    nmap = vb._new(g.n, "ShaderNodeNormalMap", space="TANGENT", uv_map="UVMap")
    nmap.inputs["Strength"].default_value = 0.8
    g.link(g.tex(uv, role, "nor_gl", vb.GROUND_RES, zoom=zoom), nmap.inputs["Color"])
    g.link(nmap.outputs["Normal"], b.inputs["Normal"])
    MATS[name] = m
    return m


def mat_photo():
    """Faded sepia prints: a soft oval figure on a pale ground, grain on top (each print a different crop)."""
    m = bpy.data.materials.new("HM_Photo")
    b = vb._principled(m)
    g = vb.G(m.node_tree)
    pos = g.position()
    cell = g.voronoi(pos, 2.2)   # each print falls in its own cell: the oval sits at the cell's own point
    sub = vb._new(g.n, "ShaderNodeVectorMath", operation="SUBTRACT")
    g.link(pos, sub.inputs[0])
    g.link(cell.outputs["Position"], sub.inputs[1])
    x, _y, z = wb.sep3(g, sub.outputs["Vector"])
    r = g.math("SQRT", g.math("ADD", g.math("MULTIPLY", g.math("MULTIPLY", x, x), 90.0),
                              g.math("MULTIPLY", g.math("MULTIPLY", z, z), 55.0)))
    figure = g.math("SUBTRACT", 1.0, g.smooth(r, 0.55, 0.95))
    col = g.mix(figure, (0.46, 0.34, 0.20), (0.16, 0.10, 0.06))
    col = wb.scale_by(g, col, g.math("ADD", 0.85, g.math("MULTIPLY", g.noise(pos, 60.0, 2.0), 0.3)))
    g.link(col, b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.35
    return m


CARPET_LUM = 0.0325         # dirty_carpet's mean linear luminance: its scan divided by this is the pile's light and shade


def mat_rug(length: float, width: float):
    """A worn wool rug over its UVs: a bone border 12 cm wide with a dark line inside it, a faded madder field (a rust
    red, hue about 20 degrees: green enough that the moon's blue light never turns it magenta) with a darker diamond
    medallion and a second line round it; the pile is the `carpet` role's scan at its own size (its light and shade
    over the colours, its normal map) where it is cached."""
    name = f"HM_Rug_{length:g}x{width:g}"
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    b = vb._principled(m)
    g = vb.G(m.node_tree)
    uv = vb._new(g.n, "ShaderNodeUVMap", uv_map="UVMap").outputs["UV"]
    u, v, _ = wb.sep3(g, uv)
    du = g.math("ABSOLUTE", g.math("SUBTRACT", u, 0.5))
    dv = g.math("ABSOLUTE", g.math("SUBTRACT", v, 0.5))
    edge = g.math("MINIMUM", g.math("MULTIPLY", g.math("SUBTRACT", 0.5, du), length),
                  g.math("MULTIPLY", g.math("SUBTRACT", 0.5, dv), width))      # metres to the nearest edge
    border = g.math("SUBTRACT", 1.0, g.smooth(edge, 0.115, 0.125))
    line = g.math("MULTIPLY", g.smooth(edge, 0.150, 0.157), g.math("SUBTRACT", 1.0, g.smooth(edge, 0.178, 0.185)))
    diamond = g.math("ADD", g.math("MULTIPLY", du, length), g.math("MULTIPLY", dv, width * 1.25))
    med = g.math("SUBTRACT", 1.0, g.smooth(diamond, 0.42, 0.44))
    ring = g.math("MULTIPLY", g.smooth(diamond, 0.47, 0.48), g.math("SUBTRACT", 1.0, g.smooth(diamond, 0.50, 0.51)))
    field = g.mix(med, (0.21, 0.075, 0.028), (0.100, 0.036, 0.014))
    field = g.mix(ring, field, (0.40, 0.31, 0.19))
    col = g.mix(border, field, (0.40, 0.31, 0.19))
    col = g.mix(line, col, (0.06, 0.036, 0.024))
    wear = g.math("ADD", 0.82, g.math("MULTIPLY", g.noise(g.position(), 9.0, 3.0), 0.3))
    col = wb.scale_by(g, col, wear)
    if tex_cached("carpet"):
        metres = vb.ph_metres("carpet")
        mp = vb._new(g.n, "ShaderNodeMapping", vector_type="POINT")
        mp.inputs["Scale"].default_value = (length / metres, width / metres, 1.0)
        g.link(uv, mp.inputs["Vector"])
        maps = {}
        for key in ("diff", "nor_gl"):
            img = bpy.data.images.load(mr.texture_path("carpet", key, res=vb.GROUND_RES), check_existing=True)
            if key != "diff":
                img.colorspace_settings.name = "Non-Color"
            node = vb._new(g.n, "ShaderNodeTexImage")
            node.image = img
            g.link(mp.outputs["Vector"], node.inputs["Vector"])
            maps[key] = node.outputs["Color"]
        pile = g.math("ADD", 0.55, g.math("MULTIPLY", g.gray(maps["diff"]), 0.45 / CARPET_LUM))
        col = wb.scale_by(g, col, g.math("MINIMUM", pile, 1.6))
        nmap = vb._new(g.n, "ShaderNodeNormalMap", space="TANGENT", uv_map="UVMap")
        nmap.inputs["Strength"].default_value = 0.6
        g.link(maps["nor_gl"], nmap.inputs["Color"])
        g.link(nmap.outputs["Normal"], b.inputs["Normal"])
    else:
        print("WARN rug: role carpet (dirty_carpet) is not cached; the rug is flat colour "
              f"(python tools/blender/materials/fetch.py --roles carpet --res {vb.GROUND_RES} --maps diff,nor_gl)",
              flush=True)
    g.link(col, b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.95
    MATS[name] = m
    return m


def mat_print(variant: str, slug: str):
    """A faded sepia photograph over a frame's print UVs (PHOTO_PRINT's UV box made 0..1): a pale ground darkening to
    the oval's edge, the sitter in a dark coat with a lit face, film grain. Variants: portrait (head and shoulders),
    profile (the head turned, set left), figure (standing, full length), couple (two sitters)."""
    name = f"HM_Print_{variant}_{slug}"
    if name in MATS:
        return MATS[name]
    _mat, (u0, u1), (v0, v1) = PHOTO_PRINT[slug]
    m = bpy.data.materials.new(name)
    b = vb._principled(m)
    g = vb.G(m.node_tree)
    uv = vb._new(g.n, "ShaderNodeUVMap", uv_map="UVMap").outputs["UV"]
    u, v, _ = wb.sep3(g, uv)
    U = g.math("MULTIPLY", g.math("SUBTRACT", u, u0), 1.0 / (u1 - u0))
    V = g.math("MULTIPLY", g.math("SUBTRACT", v, v0), 1.0 / (v1 - v0))

    def ell(cx, cy, rx, ry):
        """1 inside the ellipse, 0 outside, a soft edge."""
        dx = g.math("DIVIDE", g.math("SUBTRACT", U, cx), rx)
        dy = g.math("DIVIDE", g.math("SUBTRACT", V, cy), ry)
        r = g.math("SQRT", g.math("ADD", g.math("MULTIPLY", dx, dx), g.math("MULTIPLY", dy, dy)))
        return g.math("SUBTRACT", 1.0, g.smooth(r, 0.86, 1.0))

    sitters = {"portrait": ((0.50, 0.64, 0.13, 0.17, 0.50, 0.14, 0.38, 0.30),),
               "profile": ((0.44, 0.63, 0.12, 0.16, 0.47, 0.13, 0.36, 0.29),),
               "figure": ((0.50, 0.80, 0.07, 0.085, 0.50, 0.38, 0.17, 0.42),),
               "couple": ((0.33, 0.62, 0.10, 0.13, 0.33, 0.18, 0.22, 0.28), (0.67, 0.66, 0.10, 0.13, 0.67, 0.20, 0.23, 0.30))
               }[variant]
    du = g.math("SUBTRACT", U, 0.5)
    dv = g.math("SUBTRACT", V, 0.5)
    rr = g.math("SQRT", g.math("ADD", g.math("MULTIPLY", du, du), g.math("MULTIPLY", dv, dv)))
    col = g.mix(g.smooth(rr, 0.28, 0.62), (0.50, 0.38, 0.23), (0.17, 0.11, 0.06))      # the ground, burnt at the edge
    for hx, hy, hrx, hry, bx, by, brx, bry in sitters:
        coat = g.math("MAXIMUM", ell(hx, hy, hrx, hry), ell(bx, by, brx, bry))
        col = g.mix(coat, col, (0.09, 0.06, 0.035))
        col = g.mix(ell(hx + 0.01, hy - 0.01, hrx * 0.62, hry * 0.72), col, (0.36, 0.26, 0.15))   # the lit face
    grain = g.math("ADD", 0.88, g.math("MULTIPLY", g.noise(g.position(), 260.0, 2.0), 0.24))
    g.link(wb.scale_by(g, col, grain), b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.4
    MATS[name] = m
    return m


def mat_marble():
    """A pale grey-veined marble top: a warm white with soft grey veins along a distorted noise, polished."""
    if "marble" in MATS:
        return MATS["marble"]
    m = bpy.data.materials.new("HM_Marble")
    b = vb._principled(m)
    g = vb.G(m.node_tree)
    pos = g.position()
    warp = g.noise(pos, 3.0, 4.0, 0.6)
    vein = g.math("ABSOLUTE", g.math("SINE", g.math("ADD", g.math("MULTIPLY", wb.sep3(g, pos)[0], 9.0),
                                                     g.math("MULTIPLY", warp, 7.0))))
    col = g.mix(g.smooth(vein, 0.0, 0.16), (0.30, 0.29, 0.28), (0.66, 0.63, 0.58))
    g.link(col, b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.22
    MATS["marble"] = m
    return m


def materials() -> dict:
    if MATS.get("_ready"):
        return MATS
    MATS["plaster"] = mat_plaster("HM_Plaster", 1.0)
    MATS["walltop"] = mat_plaster("HM_WallTop", WALLTOP_K, grey=0.5)
    # dark brown wood (skirting, frames, sills): mean albedo about (0.086, 0.049, 0.029), like the 2.5D kit's base
    # band; any darker and the east-facing skirting falls under ink, where the ink floor turns it to a purple-black
    # gap, and any redder and the moon's blue light turns it magenta in the stills
    MATS["wood"] = wb.role_mat("HM_DarkWood", "wood_rough", k=1.0, desat=0.0, tint=(1.05, 0.84, 0.66), rough=0.55,
                               bump=0.2) if tex_cached("wood_rough") else wb.flat_mat("HM_DarkWood", (0.086, 0.049, 0.029), 0.55)
    MATS["grey"] = wb.flat_mat("HM_GreyBox", (0.30, 0.30, 0.31), rough=0.85)
    glass = wb.flat_mat("HM_Glass", (0.018, 0.026, 0.042), rough=0.06)
    gb = vb._principled(glass)
    gb.inputs["Emission Color"].default_value = (*lin("moon"), 1.0)
    gg = vb.G(glass.node_tree)
    gg.link(gg.value(0.0, "P_glass_glow"), gb.inputs["Emission Strength"])   # 0 in the game passes; the preview lifts it
    MATS["glass"] = glass
    # heavy curtains: the `wool` role's herringbone (a light grey scan, mean (0.19, 0.18, 0.17)) toned to the old
    # faded slate wool #4A5264, where it is cached; else that flat slate
    if tex_cached("wool", ("diff",)):
        MATS["curtain"] = wb.role_mat("HM_Curtain", "wool", k=1.0, desat=0.5, tint=(0.37, 0.46, 0.72), rough=0.95,
                                      bump=0.3)
    else:
        print("WARN curtains: role wool (poly_wool_herringbone) is not cached; flat slate stands in "
              f"(python tools/blender/materials/fetch.py --roles wool --res {vb.GROUND_RES} --maps diff)", flush=True)
        MATS["curtain"] = wb.flat_mat("HM_Curtain", (0.069, 0.084, 0.127), rough=0.95)
    MATS["drape"] = wb.flat_mat("HM_Drape", (0.011, 0.012, 0.017), rough=0.9)   # plain matte black cloth, over ink
    MATS["mount"] = wb.flat_mat("HM_Mount", (0.60, 0.56, 0.46), rough=0.8)
    MATS["photo"] = mat_photo()
    MATS["wax"] = wb.flat_mat("HM_Wax", (0.74, 0.69, 0.56), rough=0.5)
    MATS["linen"] = wb.flat_mat("HM_Linen", (0.56, 0.53, 0.46), rough=0.9)   # folded sheets, bone
    # the candle's flame: lantern-orange, lit like any surface in the game passes (the client draws the glow) and
    # glowing (P_flame_glow) in the preview stills, not clipped to white under Standard
    flame = wb.flat_mat("HM_Flame", lin("lantern"), rough=0.6)
    fb = vb._principled(flame)
    fb.inputs["Emission Color"].default_value = (*lin("lantern"), 1.0)
    fg = vb.G(flame.node_tree)
    fg.link(fg.value(0.0, "P_flame_glow"), fb.inputs["Emission Strength"])
    MATS["flame"] = flame
    MATS["void"] = wb.flat_mat("HM_Void", (0.006, 0.007, 0.012), rough=1.0)
    MATS["_ready"] = True
    return MATS


def set_glass(colour, strength: float) -> None:
    """The window glass's emission: a faint pale grey-blue in the game passes (the drape reads against it), the
    moon's glow in the preview stills. `colour` is a palette token or hex."""
    glass = bpy.data.materials.get("HM_Glass")
    if glass is None:
        return
    b = next(n for n in glass.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Emission Color"].default_value = (*(lin(colour) if isinstance(colour, str) else colour[:3]), 1.0)
    if "P_glass_glow" in glass.node_tree.nodes:
        glass.node_tree.nodes["P_glass_glow"].outputs[0].default_value = strength


PREVIEW_FLAME_GLOW = 2.4    # the flame's emission in the preview stills (0 in the game passes: the client lights it)


def set_flame(strength: float) -> None:
    flame = bpy.data.materials.get("HM_Flame")
    if flame is not None and "P_flame_glow" in flame.node_tree.nodes:
        flame.node_tree.nodes["P_flame_glow"].outputs[0].default_value = strength


_CODE: dict = {}


def code_material(room: Room, x0: int, y0: int, w: int, h: int):
    """Emission ((tx + 1) / 255, (ty + 1) / 255, 0) of the room tile under each surface point, clamped to the
    footprint (x0, y0, w, h), as build_buildings.code_material clamps to a building's footprint."""
    key = (x0, y0, w, h)
    if key in _CODE:
        return _CODE[key]
    mat = _node_material(f"HM_Code_{x0}_{y0}_{w}x{h}")
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(nodes.new("ShaderNodeNewGeometry").outputs["Position"], sep.inputs["Vector"])

    def channel(socket, scale, offset, lo, n):
        m = nodes.new("ShaderNodeMath")
        m.operation = "MULTIPLY_ADD"
        m.inputs[1].default_value, m.inputs[2].default_value = scale, offset
        links.new(socket, m.inputs[0])
        fl = nodes.new("ShaderNodeMath")
        fl.operation = "FLOOR"
        links.new(m.outputs[0], fl.inputs[0])
        cl = nodes.new("ShaderNodeClamp")
        cl.inputs["Min"].default_value, cl.inputs["Max"].default_value = lo, lo + n - 1
        links.new(fl.outputs[0], cl.inputs["Value"])
        add = nodes.new("ShaderNodeMath")
        add.operation = "MULTIPLY_ADD"
        add.inputs[1].default_value, add.inputs[2].default_value = 1 / 255, 1 / 255
        links.new(cl.outputs[0], add.inputs[0])
        return add.outputs[0]

    comb = nodes.new("ShaderNodeCombineXYZ")
    links.new(channel(sep.outputs["X"], 1.0 / S, room.w / 2, x0, w), comb.inputs["X"])      # tx = x / S + W / 2
    links.new(channel(sep.outputs["Y"], -1.0 / S, room.h / 2, y0, h), comb.inputs["Y"])     # ty = H / 2 - y / S
    emit = nodes.new("ShaderNodeEmission")
    links.new(comb.outputs["Vector"], emit.inputs["Color"])
    links.new(emit.outputs["Emission"], nodes.new("ShaderNodeOutputMaterial").inputs["Surface"])
    _CODE[key] = mat
    return mat


# ---------------------------------------------------------------- mesh pieces

_FACES = (("bottom", (0, 3, 2, 1)), ("top", (4, 5, 6, 7)), ("S", (0, 1, 5, 4)), ("E", (1, 2, 6, 5)),
          ("N", (2, 3, 7, 6)), ("W", (3, 0, 4, 7)))


def add_box(mb, lo, hi, mat, top=None, bottom=None, M=None, skip=()) -> None:
    """An axis-aligned box (local frame lo..hi) with its own top material; no bottom face unless one is given."""
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    for key, f in _FACES:
        if key in skip or (key == "bottom" and bottom is None):
            continue
        m = top if (key == "top" and top is not None) else bottom if key == "bottom" else mat
        mb.add([v[i] for i in f], [(0, 1, 2, 3)], m, M)


def folded(mb, M, xa: float, xb: float, y: float, ztop: float, zbot: float, amp: float, folds: int, mat) -> None:
    """A hanging cloth in vertical folds, facing -y."""
    n = folds * 2
    verts, faces = [], []
    for i in range(n + 1):
        x = xa + (xb - xa) * i / n
        yy = y + (amp if i % 2 else -amp)
        verts += [(x, yy, zbot), (x, yy, ztop)]
    for i in range(n):
        faces.append((2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1))
    mb.add(verts, faces, mat, M)


def swag(mb, M, xa: float, xb: float, y: float, ztop: float, drop_end: float, drop_mid: float, mat, cols: int = 16,
         rows: int = 6) -> None:
    """A cloth hung across a window from both top corners, sagging lowest in the middle, bellied toward -y."""
    verts, faces = [], []
    for j in range(rows + 1):
        v = j / rows
        for i in range(cols + 1):
            u = i / cols
            drop = drop_end + (drop_mid - drop_end) * math.sin(math.pi * u)
            yy = y - 0.035 * math.sin(math.pi * u) * v - 0.012 * math.sin(7.0 * math.pi * u) * (0.3 + v)
            verts.append((xa + (xb - xa) * u, yy, ztop - v * drop))
    for j in range(rows):
        for i in range(cols):
            a = j * (cols + 1) + i
            faces.append((a, a + cols + 1, a + cols + 2, a + 1))
    mb.add(verts, faces, mat, M)


def wall_like(room: Room, x: int, y: int, wall_props: set) -> bool:
    """A tile that stands as wall: a kit material, or a P tile whose prop brings a wall block."""
    if not room.inside(x, y) or not room.solid(x, y):
        return False
    m = room.mat[y][x]
    return m in KIT or (m == "P" and (x, y) in wall_props)


_TURN = ("S", "E", "N", "W")   # anticlockwise from -y in 90 degree steps


def _to_local(side: str, rz: float) -> str:
    return _TURN[(_TURN.index(side) - int(round(rz / 90.0))) % 4]


def local_sides(room: Room, x: int, y: int, rz: float, wall_props: set) -> set:
    """The sides of tile (x, y) that face into the room, in the frame of a piece turned rz degrees."""
    return {_to_local(side, rz) for side, (dx, dy) in SIDE_DXY.items()
            if room.inside(x + dx, y + dy) and not wall_like(room, x + dx, y + dy, wall_props)}


def local_notches(room: Room, x: int, y: int, rz: float, wall_props: set) -> set:
    """The inside corners of tile (x, y): its diagonal neighbour faces into the room while both side neighbours stand
    as wall, so the two set-back faces that meet there must turn the corner; as {local side, local side} sets."""
    def opened(dx, dy):
        return room.inside(x + dx, y + dy) and not wall_like(room, x + dx, y + dy, wall_props)

    out = set()
    for ns in ("N", "S"):
        for ew in ("E", "W"):
            dy, dx = SIDE_DXY[ns][1], SIDE_DXY[ew][0]
            if opened(dx, dy) and not opened(0, dy) and not opened(dx, 0):
                out.add(frozenset((_to_local(ns, rz), _to_local(ew, rz))))
    return out


def wall_local(mb, M, h: float, open_local: set, recess=None, notches=frozenset()) -> None:
    """One tile of wall in a local frame (-a..a): plaster set back SKIRT_IN on the sides that face into the room (and
    at its inside corners, `notches`), a dark wood skirting strip flush with the tile's edge along those sides, the cut
    top. `recess` = (x0, x1, z0, z1, depth): a window opening in the front (-y) face."""
    mt = materials()
    a = S / 2
    i = SKIRT_IN
    p, t, wd = mt["plaster"], mt["walltop"], mt["wood"]
    x0 = -a + (i if "W" in open_local else 0.0)
    x1 = a - (i if "E" in open_local else 0.0)
    y0 = -a + (i if "S" in open_local else 0.0)
    y1 = a - (i if "N" in open_local else 0.0)
    sk = min(SKIRT_H, h)
    skirt_top = t if h <= sk + 1e-6 else wd
    for side in sorted(open_local):
        lo, hi = {"S": ((-a, -a, 0.0), (a, y0 + 0.004, sk)), "N": ((-a, y1 - 0.004, 0.0), (a, a, sk)),
                  "W": ((-a, -a, 0.0), (x0 + 0.004, a, sk)), "E": ((x1 - 0.004, -a, 0.0), (a, a, sk))}[side]
        add_box(mb, lo, hi, wd, top=skirt_top, M=M)
    if recess is None:
        if not notches:
            add_box(mb, (x0, y0, 0.0), (x1, y1, h), p, top=t, M=M)
            return
        cols = (("W", -a, -a + i), (None, -a + i, a - i), ("E", a - i, a))
        rows = (("S", -a, -a + i), (None, -a + i, a - i), ("N", a - i, a))
        for sx, xa, xb in cols:          # the plaster in a 3 x 3 grid of cells, the notched corners left out
            for sy, ya, yb in rows:
                if sx in open_local or sy in open_local or (sx and sy and frozenset((sx, sy)) in notches):
                    continue
                add_box(mb, (xa, ya, 0.0), (xb, yb, h), p, top=t, M=M)
        for c in notches:                # and the skirting turns the corner
            xa, xb = (a - i - 0.004, a) if "E" in c else (-a, -a + i + 0.004)
            ya, yb = (a - i - 0.004, a) if "N" in c else (-a, -a + i + 0.004)
            add_box(mb, (xa, ya, 0.0), (xb, yb, sk), wd, top=skirt_top, M=M)
        return
    rx0, rx1, rz0, rz1, depth = recess
    add_box(mb, (x0, y0, 0.0), (x1, y1, rz0), p, M=M)                         # under the sill
    add_box(mb, (x0, y0, rz1), (x1, y1, h), p, top=t, bottom=p, M=M)          # over the head
    add_box(mb, (x0, y0, rz0), (rx0, y1, rz1), p, M=M, skip=("top",))         # beside, left
    add_box(mb, (rx1, y0, rz0), (x1, y1, rz1), p, M=M, skip=("top",))         # beside, right
    add_box(mb, (rx0, y0 + depth, rz0), (rx1, y1, rz1), p, M=M, skip=("top",))  # behind the glass


def build_floor(room: Room):
    mb = wb.MB()
    for ty in range(room.h):
        for tx in range(room.w):
            x0, y0, x1, y1 = room.tile_box(tx, ty)
            mb.add([(x0, y0, 0.0), (x1, y0, 0.0), (x1, y1, 0.0), (x0, y1, 0.0)], [(0, 1, 2, 3)],
                   mat_floor(room.floor_letter(tx, ty)))
    ob = mb.build("HM_Ground", col="world")
    vb.uv_world(ob.data)
    register(ob, "floor", "floor", [], "bg", model="floor")
    return ob


def build_walls(room: Room, wall_props: set) -> None:
    mt = materials()
    for ty in range(room.h):
        for tx in range(room.w):
            cls = room.kit_class(tx, ty)
            if cls is None:
                continue
            m = room.mat[ty][tx]
            h = WALL_H[cls]
            cx, cy = room.centre(tx, ty)
            mb = wb.MB()
            if m == "W":
                wall_local(mb, M4(cx, cy), h, local_sides(room, tx, ty, 0.0, wall_props),
                           notches=local_notches(room, tx, ty, 0.0, wall_props))
                model, label = "plaster", None
            else:   # trees, rocks, cliffs, fences, stacks in a room: grey blocks until they get models
                add_box(mb, (-S / 2, -S / 2, 0.0), (S / 2, S / 2, h), mt["grey"], M=M4(cx, cy))
                model, label = "box", KIT[m]
            ob = mb.build(f"HM_Wall_{tx}_{ty}", col="world")
            register(ob, "wall", f"{KIT[m]}/{cls}", [(tx, ty)], pass_for(room, [(tx, ty)]), code=(tx, ty, 1, 1),
                     model=model, label=label, cls=cls, height=h)


# ---------------------------------------------------------------- props and spots


def lookup(table: dict, keys) -> tuple[dict | None, str | None]:
    for k in keys:
        if k and k in table:
            return dict(table[k]), k
    return None, None


def prop_keys(p: dict) -> list[str]:
    tail = p["id"].split(".", 1)[-1]
    return [p["id"], tail, re.sub(r"_\d+$", "", tail), p.get("kind")]


def _frame_for(room: Room, tx: int, ty: int, back: str | None, width: float, depth: float, wall_props: set):
    """A piece on tile (tx, ty) with its back to `back` (None: centred, facing S), pushed GAP off that side, along the
    other axis centred or fitted (fit_span); returns (world box (x0, y0, x1, y1), facing, overhang)."""
    facing = OPPOSITE[back] if back else "S"
    sx, sy = (width, depth) if facing in ("N", "S") else (depth, width)
    x0, y0, x1, y1 = room.tile_box(tx, ty)
    walls = {side: wall_like(room, tx + dx, ty + dy, wall_props) for side, (dx, dy) in SIDE_DXY.items()}
    if back == "N":
        by = (y1 - GAP - sy, y1 - GAP)
    elif back == "S":
        by = (y0 + GAP, y0 + GAP + sy)
    else:
        by = fit_span(y0, y1, sy, walls["S"], walls["N"], nw_low=False)
    if back == "E":
        bx = (x1 - GAP - sx, x1 - GAP)
    elif back == "W":
        bx = (x0 + GAP, x0 + GAP + sx)
    else:
        bx = fit_span(x0, x1, sx, walls["W"], walls["E"], nw_low=True)
    box = (bx[0], by[0], bx[1], by[1])
    return box, facing, overhang_of(box, (x0, y0, x1, y1))


def standing_frame(room: Room, tx: int, ty: int, width: float, depth: float, wall_props: set = frozenset()):
    """Where a piece standing on a tile goes: its back to a solid neighbour (north, east, west, south: the first along
    whose wall it fits inside the overhang rules, else the first), pushed GAP off it. Returns (centre x, centre y,
    facing, size x, size y)."""
    backs = [side for side in ("N", "E", "W", "S") if room.solid(tx + SIDE_DXY[side][0], ty + SIDE_DXY[side][1])]
    tried = [_frame_for(room, tx, ty, back, width, depth, wall_props) for back in (backs or [None])]
    box, facing, _over = next((t for t in tried if not over_rules(t[2])), tried[0])
    return (box[0] + box[2]) / 2, (box[1] + box[3]) / 2, facing, box[2] - box[0], box[3] - box[1]


def grey_box(name: str, cx: float, cy: float, sx: float, sy: float, h: float):
    mb = wb.MB()
    add_box(mb, (-sx / 2, -sy / 2, 0.0), (sx / 2, sy / 2, h), materials()["grey"])
    ob = mb.build(name, col="models")
    ob.location = (cx, cy, 0.0)
    return ob


def bed_plan(room: Room, tiles: list, spec: dict, wall_props: set = frozenset()) -> dict:
    """Where a bed lies, from tiles[0] (its head) toward tiles[-1] (pure Python). Along its length: its head
    BED_HEAD_MARGIN inside tiles[0]'s far edge, or less, down to flush, when the span of its tiles is short; past a
    span still too short it reaches south or east (its head end is flush with the span's north or west edge). Across:
    centred on its row, or (wider than a tile) flush with the row's north or west edge, reaching south or east. On one
    tile alone it lies centred along x. Returns its world box, the head / foot ends, its axis and its overhang past
    the span of its tiles."""
    L, wid, _h = spec["size"]
    ax, ay = tiles[0]
    dx, dy = (tiles[-1][0] - ax, tiles[-1][1] - ay) if len(tiles) > 1 else (1, 0)
    ux, uy = dx, -dy                    # world direction head -> foot (the grid's y grows south, the world's north)
    sgn = ux + uy
    along_x = ux != 0
    x0, y0, x1, y1 = room.tile_box(ax, ay)
    bx = [room.tile_box(*t) for t in tiles]
    span = (min(b[0] for b in bx), min(b[1] for b in bx), max(b[2] for b in bx), max(b[3] for b in bx))
    lo, hi = (span[0], span[2]) if along_x else (span[1], span[3])
    if len(tiles) > 1:
        far = {(1, 0): x0, (-1, 0): x1, (0, 1): y0, (0, -1): y1}[(ux, uy)]
        margin = min(BED_HEAD_MARGIN, max((hi - lo - L) / 2, 0.0))
        hs = far + sgn * margin
        a, b = sorted((hs, hs + sgn * L))
        if b - a > hi - lo + 1e-9:      # longer than its tiles: the north / west end flush, reaching south / east
            a, b = (lo, lo + L) if along_x else (hi - L, hi)
            hs = a if sgn > 0 else b
    else:
        hs = ((x0 + x1) / 2 if along_x else (y0 + y1) / 2) - sgn * L / 2
    fs = hs + sgn * L
    # across: the row (x for a bed along y) of the head tile, its sides' walls kept GAP off
    if along_x:
        ca, cb = fit_span(y0, y1, wid, wall_like(room, ax, ay + 1, wall_props), wall_like(room, ax, ay - 1, wall_props),
                          nw_low=False)
        box = (min(hs, fs), ca, max(hs, fs), cb)
    else:
        ca, cb = fit_span(x0, x1, wid, wall_like(room, ax - 1, ay, wall_props), wall_like(room, ax + 1, ay, wall_props),
                          nw_low=True)
        box = (ca, min(hs, fs), cb, max(hs, fs))
    return {"box": box, "head": hs, "foot": fs, "sgn": sgn, "along_x": along_x, "across": (ca, cb), "span": span,
            "spanOverhang": overhang_of(box, span)}


def build_bed(room: Room, name: str, tiles: list, spec: dict, wall_props: set = frozenset()):
    """A low grey-box bed (a base and a headboard) laid out by bed_plan."""
    _L, wid, h = spec["size"]
    head = spec.get("head", h)
    plan = bed_plan(room, tiles, spec, wall_props)
    hs, fs, sgn, along_x = plan["head"], plan["foot"], plan["sgn"], plan["along_x"]
    hb = 0.08                           # the headboard's thickness
    c = sum(plan["across"]) / 2
    mb = wb.MB()
    grey = materials()["grey"]
    for s_a, s_b, top in ((hs + sgn * hb, fs, h), (hs, hs + sgn * hb, head)):
        lo, hi = sorted((s_a, s_b))
        if along_x:
            add_box(mb, (lo, c - wid / 2, 0.0), (hi, c + wid / 2, top), grey)
        else:
            add_box(mb, (c - wid / 2, lo, 0.0), (c + wid / 2, hi, top), grey)
    return mb.build(name, col="models")


def build_candle(room: Room, name: str, tx: int, ty: int, spec: dict, wall_props: set = frozenset()):
    """A grey-box tripod table with a candle on it, centred on its tile (where the client centres the lamp's light
    pool); returns the object, the flame's world point and its facing."""
    w, d, h = spec["size"]
    _cx, _cy, facing, sx, sy = standing_frame(room, tx, ty, w, d, wall_props)
    cx, cy = room.centre(tx, ty)
    mt = materials()
    mb = wb.MB()
    add_box(mb, (cx - sx / 2, cy - sy / 2, 0.0), (cx + sx / 2, cy + sy / 2, h), mt["grey"])
    mb.cyl(0.03, 0.03, 0.02, n=10, M=M4(cx, cy, h), mat=mt["wood"])          # the chamberstick
    mb.cyl(0.021, 0.019, 0.12, n=10, M=M4(cx, cy, h + 0.02), mat=mt["wax"])
    mb.cyl(0.011, 0.0, 0.045, n=8, M=M4(cx, cy, h + 0.145), mat=mt["flame"])
    # the light just over the flame's tip: inside the cone the flame mesh would shadow it
    return mb.build(name, col="models", shadow=True), (cx, cy, h + 0.205), facing


def window_piece(mb, M, h: float, open_local: set, spec: dict) -> tuple:
    """A window in the wall's front face (-y): a recess with a dark wood frame and dark glass, a sill, curtains on a
    rod, and (spec drape) the black drape over the top; returns the recess's light point and size (local) and the
    boxes (local x0, y0, z0, x1, y1, z1) that furniture keeps out of (the curtains, the drape: settle) and labels
    keep off (those and the glass)."""
    mt = materials()
    a = S / 2
    fy = -a + SKIRT_IN
    ow, oh, sill = 0.9, 1.5, 0.85
    rx0, rx1, rz0, rz1, depth = -ow / 2, ow / 2, sill, sill + oh, 0.30
    wall_local(mb, M, h, open_local, recess=(rx0, rx1, rz0, rz1, depth))
    yb = fy + depth
    t = 0.05
    for lo, hi in (((rx0, yb - 0.06, rz0), (rx0 + t, yb - 0.01, rz1)), ((rx1 - t, yb - 0.06, rz0), (rx1, yb - 0.01, rz1)),
                   ((rx0, yb - 0.06, rz0), (rx1, yb - 0.01, rz0 + t)), ((rx0, yb - 0.06, rz1 - t), (rx1, yb - 0.01, rz1)),
                   ((-t / 2, yb - 0.06, rz0), (t / 2, yb - 0.01, rz1)),
                   ((rx0, yb - 0.06, rz0 + oh * 0.58 - t / 2), (rx1, yb - 0.01, rz0 + oh * 0.58 + t / 2))):
        add_box(mb, lo, hi, mt["wood"], M=M)
    mb.quad((rx0, yb - 0.03, rz0), (rx1, yb - 0.03, rz0), (rx1, yb - 0.03, rz1), (rx0, yb - 0.03, rz1), mat=mt["glass"], M=M)
    add_box(mb, (rx0 - 0.07, fy - 0.05, rz0 - 0.035), (rx1 + 0.07, yb, rz0 + 0.004), mt["wood"], bottom=mt["wood"], M=M)
    rod = min(rz1 + 0.17, h - 0.08)
    add_box(mb, (rx0 - 0.38, fy - 0.10, rod - 0.015), (rx1 + 0.38, fy - 0.07, rod + 0.015), mt["wood"], bottom=mt["wood"], M=M)
    folded(mb, M, rx0 - 0.36, rx0 + 0.05, fy - 0.085, rod - 0.02, 0.05, 0.022, 3, mt["curtain"])
    folded(mb, M, rx1 - 0.05, rx1 + 0.36, fy - 0.085, rod - 0.02, 0.05, 0.022, 3, mt["curtain"])
    if spec.get("drape"):
        # the swag across the top and one panel down the west (left) half: the game camera looks in from the south-east,
        # so the deep recess shows the glass right of the panel, and the black reads in silhouette against it
        swag(mb, M, rx0 - 0.14, rx1 + 0.14, fy - 0.115, rod + 0.01, 0.16, 0.55, mt["drape"])
        folded(mb, M, rx0 - 0.12, -ow * 0.05, fy - 0.12, rod - 0.01, rz0 + 0.22, 0.016, 3, mt["drape"])
    keep = [{"what": "curtains", "box": (rx0 - 0.38, fy - 0.11, 0.0, rx1 + 0.38, fy, rod + 0.03), "settle": True},
            {"what": "glass", "box": (rx0 - 0.07, fy - 0.05, rz0 - 0.04, rx1 + 0.07, yb, rz1 + 0.02), "settle": False}]
    if spec.get("drape"):   # the swag across the top (down to rod - 0.54 in the middle) and the panel down the west half
        keep.append({"what": "swag", "box": (rx0 - 0.14, fy - 0.17, rod - 0.56, rx1 + 0.14, fy, rod + 0.03),
                     "settle": True})
        keep.append({"what": "drape", "box": (rx0 - 0.12, fy - 0.14, rz0 + 0.22, -ow * 0.05, fy, rod), "settle": True})
    return (0.0, yb - 0.14, rz0 + oh / 2), (ow - 0.05, oh - 0.05), keep


def world_box(M, box) -> list:
    """The world axis-aligned box round a local box (x0, y0, z0, x1, y1, z1) placed by M."""
    x0, y0, z0, x1, y1, z1 = box
    pts = [M @ Vector((x, y, z)) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    return [round(min(p.x for p in pts), 4), round(min(p.y for p in pts), 4), round(min(p.z for p in pts), 4),
            round(max(p.x for p in pts), 4), round(max(p.y for p in pts), 4), round(max(p.z for p in pts), 4)]


def photo_parts(M) -> tuple[list, tuple]:
    """The photographs on a wall tile's front face (-y in the frame M): PHOTO_FRAMES' Poly Haven frames hung flat on
    the plaster, their prints swapped for sepia portraits, the group squeezed to 0.92 of the tile where the tile is
    narrower. Returns the parts for assemble() and the group's box (local) for the labels to keep off."""
    fy = -S / 2 + SKIRT_IN
    rows = []
    for slug, k, x, zc, variant in PHOTO_FRAMES:
        m = ph_master(slug, drop=PHOTO_DROP.get(slug, ()))
        w, d, hh = (v * k for v in m["wdi_dims"])
        rows.append((slug, m, k, x, zc, variant, w, d, hh))
    span = max(r[3] + r[6] / 2 for r in rows) - min(r[3] - r[6] / 2 for r in rows)
    f = min(1.0, 0.92 * S / span)
    parts, lo, hi = [], [1e9] * 3, [-1e9] * 3
    for slug, m, k, x, zc, variant, w, d, hh in rows:
        kk, z0, y = k * f, zc - hh * f / 2, fy - d * f / 2 - 0.003
        parts.append((m, M @ Matrix.Translation((x * f, y, z0)) @ Matrix.Diagonal((kk, kk, kk, 1.0)),
                      {PHOTO_PRINT[slug][0]: mat_print(variant, slug)}))
        for i, (a, b) in enumerate(((x * f - w * f / 2, x * f + w * f / 2), (y - d * f / 2, y + d * f / 2),
                                    (z0, z0 + hh * f))):
            lo[i], hi[i] = min(lo[i], a), max(hi[i], b)
    return parts, (*lo, *hi)


def photos_piece(mb, M, h: float, open_local: set, notches=frozenset()) -> None:
    """The photographs' wall block (the frames join it: photo_parts)."""
    wall_local(mb, M, h, open_local, notches=notches)


def build_rug(room: Room, name: str, tx: int, ty: int, spec: dict):
    L, wid = spec["size"]
    cx, cy = room.centre(tx, ty)
    me = bpy.data.meshes.new(name)
    me.from_pydata([(-L / 2, -wid / 2, 0.0), (L / 2, -wid / 2, 0.0), (L / 2, wid / 2, 0.0), (-L / 2, wid / 2, 0.0)], [],
                   [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name="UVMap")
    uv.data.foreach_set("uv", [0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0])
    me.materials.append(mat_rug(L, wid))
    ob = bpy.data.objects.new(name, me)
    COL["models"].objects.link(ob)
    ob.location = (cx, cy, 0.004)
    return ob


def place_meshy(room: Room, name: str, model: str, tx: int, ty: int, spec: dict):
    """A Meshy model through the village's place(): its own textures, faced away from its back, pushed GAP off it."""
    cx, cy = room.centre(tx, ty)
    back = room.back_side(tx, ty)
    facing = OPPOSITE[back] if back else "S"
    o = vb.place(RoomGround(), model, cx, cy, facing=facing, size=spec.get("size"), lamps=False)
    o.name = name
    bpy.context.view_layer.update()
    lo, hi = mi._bounds(o)
    x0, y0, x1, y1 = room.tile_box(tx, ty)
    if back == "N":
        o.location.y += (y1 - GAP) - hi.y
    elif back == "S":
        o.location.y += (y0 + GAP) - lo.y
    elif back == "E":
        o.location.x += (x1 - GAP) - hi.x
    elif back == "W":
        o.location.x += (x0 + GAP) - lo.x
    return o, facing


# ---------------------------------------------------------------- Poly Haven pieces (model "ph")

_PH: dict = {}              # (slug, doors, drop, lod) -> hidden master
PH_MADE: list = []          # the hidden masters this run imported: removed before the save (the placed pieces hold
                            # their own copies of the meshes)


def _plain(name: str) -> str:
    """A datablock's name without Blender's .001 suffix."""
    return re.sub(r"\.\d{3}$", "", name)


def _recentre(o) -> Vector:
    """Move a mesh so its footprint centre is on the origin and its base on z = 0 (as wb.ph_pieces does); record
    wdi_size, wdi_dims and the shift; returns the shift."""
    me = o.data
    co = [0.0] * (len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    lo = Vector((min(co[0::3]), min(co[1::3]), min(co[2::3])))
    hi = Vector((max(co[0::3]), max(co[1::3]), max(co[2::3])))
    shift = Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
    me.transform(Matrix.Translation(shift))
    o["wdi_size"] = float(max(hi - lo))
    o["wdi_dims"] = [float(v) for v in (hi - lo)]
    o["wdi_shift"] = [float(v) for v in shift]
    return shift


def ph_master(slug: str, doors: dict | None = None, drop=(), lod: float | None = None):
    """A Poly Haven model as one hidden master, in its own frame (footprint centred on the origin, base on z = 0,
    facing -y), its pieces where the model puts them. A one-piece model with nothing to change is meshy_wild_build's
    own master (wb.ph_source: decimated to `lod`). Otherwise the glTF is imported here (wb.ph_pieces would centre each
    piece on its own): `doors` {node: degrees} turns a hinged piece about its node's origin, its hinge, before the
    pieces are joined, and `drop` leaves pieces out."""
    doors = {k: float(v) for k, v in (doors or {}).items()}
    key = (slug, tuple(sorted(doors.items())), tuple(sorted(drop)), lod)
    if key in _PH:
        return _PH[key]
    pieces = list(wb.ph_lock(slug).get("pieces") or [slug])
    if len(pieces) == 1 and not doors and not drop:
        full = slug in wb.PH_BASE
        o = wb.ph_source(slug, lod=lod)
        if not full:
            PH_MADE.extend(wb.PH_BASE[slug])
        if o not in PH_MADE:
            PH_MADE.append(o)
        if "wdi_dims" not in o:
            _recentre(o)
        _PH[key] = o
        return o
    path = wb.fm.model_path(slug, must_exist=True)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.type == "MESH" and _plain(o.name) in doors:
            o.rotation_mode = "XYZ"
            o.rotation_euler = (0.0, 0.0, math.radians(doors[_plain(o.name)]))
    bpy.context.view_layer.update()
    meshes = []
    for o in new:
        if o.type != "MESH" or _plain(o.name) in drop:
            continue
        mw = o.matrix_world.copy()
        o.parent = None
        if o.data.users > 1:
            o.data = o.data.copy()
        o.modifiers.clear()
        o.data.transform(mw)
        o.matrix_world = Matrix.Identity(4)
        meshes.append(o)
    for o in new:
        if o not in meshes:
            bpy.data.objects.remove(o, do_unlink=True)
    if not meshes:
        raise ValueError(f"Poly Haven model {slug} brought no mesh from {path}")
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    if lod is not None and lod < 0.999:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        wb._decimate(o, lod)
    for c in list(o.users_collection):
        c.objects.unlink(o)
    COL["src"].objects.link(o)
    _recentre(o)
    o.name = f"PH_{slug}" + "".join(f"_{_plain(k)[-5:]}@{v:g}" for k, v in sorted(doors.items()) if v) + \
        ("_cut" if drop else "")
    for slot in o.material_slots:
        if slot.material is not None and hasattr(slot.material, "use_transparent_shadow"):
            slot.material.use_transparent_shadow = True
    print(f"PH {slug}{' doors ' + str(doors) if doors else ''}{' without ' + str(list(drop)) if drop else ''}: "
          f"{len(o.data.polygons)} faces, {', '.join(f'{v:.3f}' for v in o['wdi_dims'])} m", flush=True)
    PH_MADE.append(o)
    _PH[key] = o
    return o


def assemble(name: str, parts: list, into=None, col: str = "models"):
    """One mesh object from parts (source object, placement Matrix, {material name: material} or None, [consume]):
    each source's mesh is copied (its materials swapped where asked), placed and joined into `into` (an object at
    the origin) or into the first part, placed and named `name`; a consumed part (a procedural piece built for it) is
    joined as it is."""
    tmp, spent = [], []
    for part in parts:
        src, M, swap = part[:3]
        if len(part) > 3 and part[3]:
            o = src
        else:
            me = src.data.copy()
            spent.append(me)
            for i, mat in enumerate(me.materials):
                if swap and mat is not None and _plain(mat.name) in swap:
                    me.materials[i] = swap[_plain(mat.name)]
            o = bpy.data.objects.new(f"{name}_part", me)
            COL[col].objects.link(o)
        o.matrix_world = M
        tmp.append(o)
    base = into
    if base is None:   # the first part becomes the object: its mesh placed, at the origin
        base = tmp.pop(0)
        base.data.transform(base.matrix_world)
        base.matrix_world = Matrix.Identity(4)
        base.name = name
        base.data.name = name
    bpy.context.view_layer.update()
    if tmp:
        bpy.ops.object.select_all(action="DESELECT")
        for o in tmp:
            o.select_set(True)
        base.select_set(True)
        bpy.context.view_layer.objects.active = base
        bpy.ops.object.join()
    me = base.data
    # the joined UV map must be the render one: the scans' image nodes read the active render UV map implicitly, and
    # a mesh that had none (a procedural piece the frames join) would sample every face at one texel
    uvl = me.uv_layers.get("UVMap") or (me.uv_layers[0] if len(me.uv_layers) else None)
    if uvl is not None:
        uvl.active_render = True
        me.uv_layers.active = uvl
    for me2 in spent:
        if me2.users == 0:
            bpy.data.meshes.remove(me2)
    return base


def ph_scale(spec: dict, dims) -> float:
    """A Poly Haven piece's scale: `scale`, or `tall` metres over its height, or `size` over its longest side; never
    over `kmax`."""
    if spec.get("tall"):
        k = spec["tall"] / max(dims[2], 1e-3)
    elif spec.get("size"):
        k = spec["size"] / max(max(dims), 1e-3)
    else:
        k = float(spec.get("scale", 1.0))
    return min(k, spec["kmax"]) if spec.get("kmax") else k


def ph_kit(name: str, spec: dict, doors: dict | None = None):
    """A Poly Haven piece with what stands on it (`dress`) and its procedural extras, as one mesh object at the
    origin in the piece's own frame (front -y, footprint centred, base on z = 0) at the spec's scale. Returns (the
    object, info: the slug, the scale, the dress, and the local points the room needs: the flame)."""
    mt = materials()
    host = ph_master(spec["slug"], spec.get("doors") if doors is None else doors, spec.get("drop", ()), spec.get("lod"))
    dims = list(host["wdi_dims"])
    k = ph_scale(spec, dims)
    rot = Matrix.Rotation(math.radians(spec.get("rot", 0.0)), 4, "Z")
    parts = [(host, rot @ Matrix.Diagonal((k, k, k, 1.0)), None)]
    w, d, h = (v * k for v in dims)
    if spec.get("rot", 0.0) % 180.0:
        w, d = d, w
    back, top = d / 2, h
    info = {"slug": spec["slug"], "k": round(k, 4), "modelM": [round(w, 3), round(d, 3), round(h, 3)]}
    if spec.get("doors"):
        info["doors"] = {_plain(kk)[-5:]: v for kk, v in (spec.get("doors") if doors is None else doors).items()}
    extras = set(spec.get("extras", ()))
    if "marble" in extras:          # a marble slab over the top, proud of the front and the sides by 12 mm
        mb = wb.MB()
        add_box(mb, (-w / 2 - 0.012, -d / 2 - 0.012, top), (w / 2 + 0.012, d / 2 - 0.004, top + 0.025), mat_marble(),
                bottom=mat_marble())
        parts.append((mb.build(f"{name}_marble"), Matrix.Identity(4), None, True))
        top += 0.025
        info["marble"] = 0.025
    placed = []
    for it in spec.get("dress", ()):
        m = ph_master(it["slug"], lod=it.get("lod"))
        kk = float(it.get("scale", 1.0))
        md = [v * kk for v in m["wdi_dims"]]
        x, yb, z = it.get("at", (0.0, None, 0.0))
        y = 0.0 if yb is None else back - yb
        M = Matrix.Translation((x, y, top + z)) @ Matrix.Rotation(math.radians(it.get("rot", 0.0)), 4, "Z") @ \
            Matrix.Diagonal((kk, kk, kk, 1.0))
        parts.append((m, M, None))
        placed.append({"slug": it["slug"], "k": kk, "at": [round(x, 3), round(y, 3), round(top + z, 3)],
                       "dims": [round(v, 3) for v in md], "rot": it.get("rot", 0.0),
                       **({"lod": it["lod"], "faces": len(m.data.polygons)} if it.get("lod") else {})})
    if placed:
        info["dress"] = placed
    if "cloth" in extras and placed:   # a plain matte black cloth over the first dress piece (the centre glass)
        p = placed[0]
        (x, y, zb), (pw, pd, ph) = p["at"], p["dims"]
        mb = wb.MB()
        xa, xb, yf, zt = x - pw / 2 - 0.025, x + pw / 2 + 0.025, y - pd / 2 - 0.014, zb + ph + 0.014
        folded(mb, None, xa, xb, yf, zt, zb + 0.035, 0.009, 5, mt["drape"])
        add_box(mb, (xa, yf - 0.009, zt - 0.010), (xb, y + pd / 2 + 0.010, zt + 0.008), mt["drape"], bottom=mt["drape"])
        parts.append((mb.build(f"{name}_cloth"), Matrix.Identity(4), None, True))
        info["cloth"] = "plain matte black over the centre glass"
    if "flame" in extras and placed:   # a small flame on the candle's wick (the first dress piece's top)
        p = placed[0]
        (x, y, zb), ph = p["at"], p["dims"][2]
        mb = wb.MB()
        mb.cyl(0.0085, 0.0, 0.036, n=10, M=Matrix.Translation((x, y, zb + ph - 0.006)), mat=mt["flame"])
        parts.append((mb.build(f"{name}_flame", shadow=False), Matrix.Identity(4), None, True))
        info["flame"] = [x, y, zb + ph + 0.045]   # the light just over the tip: inside the flame it would be shadowed
    if "sheets" in extras:             # folded linen on the shelf, seen through the open door
        x0, x1, y0, y1, zfrom = spec["sheets"]
        sx, sy, sz = host["wdi_shift"]
        from mathutils.bvhtree import BVHTree
        bvh = BVHTree.FromPolygons([v.co.copy() for v in host.data.vertices], [tuple(p.vertices) for p in host.data.polygons])
        cx, cy = (x0 + x1) / 2 + sx, (y0 + y1) / 2 + sy
        hit = bvh.ray_cast(Vector((cx, cy, zfrom + sz)), Vector((0.0, 0.0, -1.0)))
        shelf = hit[0].z if hit[0] is not None else zfrom + sz - 0.8
        mb = wb.MB()
        z = shelf
        for i in range(6):
            t = 0.044 + 0.006 * (i % 2)
            j = 0.012 * ((i * 7) % 3 - 1)
            add_box(mb, (x0 + sx + j, y0 + sy + 0.01 - j, z), (x1 + sx + j - 0.02, y1 + sy - 0.01, z + t), mt["linen"],
                    bottom=mt["linen"])
            z += t
        parts.append((mb.build(f"{name}_sheets"), rot @ Matrix.Diagonal((k, k, k, 1.0)), None, True))
        info["sheets"] = {"shelfZ": round((shelf) * k, 3), "layers": 6}
    ob = assemble(name, parts)
    shift = _recentre(ob)
    if "flame" in info:
        info["flame"] = [round(v + s, 4) for v, s in zip(info["flame"], shift)]
    return ob, info


def purge_ph_masters() -> int:
    """Remove the hidden Poly Haven masters this run imported: every placed piece holds its own copy of the meshes,
    so the saved file keeps only those."""
    n = 0
    for o in PH_MADE:
        try:
            me = o.data
            bpy.data.objects.remove(o, do_unlink=True)
        except ReferenceError:   # already gone
            continue
        if me is not None and me.users == 0:
            bpy.data.meshes.remove(me)
        n += 1
    PH_MADE.clear()
    _PH.clear()
    wb.PH_BASE.clear()
    wb.PH_SRC.clear()
    return n


def fit_scale(room: Room, tx: int, ty: int, back: str | None, w: float, d: float, wall_props: set) -> float:
    """The largest share (at most 1) of a piece's size at which its frame on the tile keeps the overhang rules."""
    if not over_rules(_frame_for(room, tx, ty, back, w, d, wall_props)[2]):
        return 1.0
    lo, hi = 0.0, 1.0
    for _ in range(32):
        mid = (lo + hi) / 2
        if over_rules(_frame_for(room, tx, ty, back, w * mid, d * mid, wall_props)[2]):
            hi = mid
        else:
            lo = mid
    return lo * 0.997   # a few millimetres inside the limit (the overhangs are reported to the millimetre)


def place_ph(room: Room, name: str, tx: int, ty: int, spec: dict, wall_props: set):
    """A Poly Haven piece standing on its tile: its back to a solid neighbour (north, east, west, south: the first
    where it keeps the rules at full size, else the one where it shrinks least), pushed GAP off it; `centre` stands it
    on the tile's centre. A door the spec opens opens as far as the frame keeps the rules (the spec's angle, down in
    5 degree steps). Returns (object, facing, info)."""
    spec_doors = dict(spec.get("doors") or {})
    opened = {kk: v for kk, v in spec_doors.items() if v > 0.0}
    shut = dict(spec_doors, **{kk: 0.0 for kk in opened})
    ob, info = ph_kit(name, spec, doors=shut if opened else None)
    w, d = ob["wdi_dims"][0], ob["wdi_dims"][1]
    backs = [side for side in ("N", "E", "W", "S") if room.solid(tx + SIDE_DXY[side][0], ty + SIDE_DXY[side][1])]
    if spec.get("centre"):
        back = backs[0] if backs else None
        s = min(1.0, (S - 2 * GAP) / max(w, d))
        cx, cy = room.centre(tx, ty)
        facing = OPPOSITE[back] if back else "S"
        sx, sy = (w * s, d * s) if facing in ("N", "S") else (d * s, w * s)
        box = (cx - sx / 2, cy - sy / 2, cx + sx / 2, cy + sy / 2)
    else:
        best = None
        for back in (backs or [None]):
            s = fit_scale(room, tx, ty, back, w, d, wall_props)
            if s >= 1.0 - 1e-9:
                best = (back, 1.0)
                break
            if best is None or s > best[1] + 1e-6:
                best = (back, s)
        back, s = best
        box, facing, _over = _frame_for(room, tx, ty, back, w * s, d * s, wall_props)
    if opened:
        start = max(opened.values())
        for a in [start - 5.0 * i for i in range(int(start // 5.0) + 1)]:
            doors = dict(shut, **{kk: min(v, a) for kk, v in opened.items()})
            m = ph_master(spec["slug"], doors, spec.get("drop", ()), spec.get("lod"))
            dk = ph_scale(spec, m["wdi_dims"]) * s
            dd = m["wdi_dims"][1] * dk
            ww = m["wdi_dims"][0] * dk
            if spec.get("rot", 0.0) % 180.0:
                ww, dd = dd, ww
            b2, f2, over2 = _frame_for(room, tx, ty, back, ww, dd, wall_props)
            if not over_rules(over2) or a <= 0.0:
                break
        me = ob.data
        bpy.data.objects.remove(ob, do_unlink=True)
        bpy.data.meshes.remove(me)
        ob, info = ph_kit(name, spec, doors=doors)
        box, facing = b2, f2
        info["doorsOpened"] = {_plain(kk)[-5:]: round(min(v, a), 1) for kk, v in opened.items()}
    ob.location = ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2, 0.0)
    ob.rotation_mode = "XYZ"
    ob.rotation_euler = (0.0, 0.0, math.radians(FACE_RZ[facing]))
    ob.scale = (-s if spec.get("mirror") else s, s, s)
    info["kFinal"] = round(info["k"] * s, 4)
    if spec.get("mirror"):
        info["mirror"] = True
    if "flame" in info:
        info["flameWorld"] = [round(v, 4) for v in (ob.matrix_basis @ Vector(info["flame"]))]
    return ob, facing, info


def build_ph_bed(room: Room, name: str, tiles: list, spec: dict, wall_props: set = frozenset()):
    """A Poly Haven bed (its head at +y, its foot -y) laid out by bed_plan over its tiles, its head at the head
    tile's end. Returns (object, facing: the way its foot points, info)."""
    ob, info = ph_kit(name, spec)
    wid, length, h = ob["wdi_dims"]
    plan = bed_plan(room, tiles, dict(size=(length, wid, h)), wall_props)
    facing = ("E" if plan["sgn"] > 0 else "W") if plan["along_x"] else ("N" if plan["sgn"] > 0 else "S")
    box = plan["box"]
    ob.location = ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2, 0.0)
    ob.rotation_mode = "XYZ"
    ob.rotation_euler = (0.0, 0.0, math.radians(FACE_RZ[facing]))
    info["kFinal"] = info["k"]
    return ob, facing, info


FACE_DIR = {"S": (0.0, -1.0), "N": (0.0, 1.0), "E": (1.0, 0.0), "W": (-1.0, 0.0)}   # world xy of a facing


def settle() -> list:
    """Push every standing piece that another reaches into (a bed wider or longer than its tiles at small S), or
    that stands in a wall prop's keep-out (a window's curtains and drape, where they hang at its height), out along
    its own facing, GAP clear; beds and walls never move. Returns notes."""
    bpy.context.view_layer.update()
    pieces = [r for r in BUILT if r["what"] in ("prop", "spot") and not r.get("flat") and not r.get("wall")]
    keepouts = [{"id": f"{r['id']} {kp['what']}", "box": kp["box"]} for r in BUILT for kp in r.get("keep", ())
                if kp.get("settle")]
    notes = []
    for _round in range(4):
        moved = False
        for r in pieces:
            if not r.get("movable") or r.get("facing") not in FACE_DIR:
                continue
            bx0, by0, bz0, bx1, by1, bz1 = world_bbox(r["obj"])
            for q in pieces + keepouts:
                if q is r:
                    continue
                qx0, qy0, qz0, qx1, qy1, qz1 = world_bbox(q["obj"]) if "obj" in q else q["box"]
                if min(bx1, qx1) - max(bx0, qx0) <= 1e-3 or min(by1, qy1) - max(by0, qy0) <= 1e-3:
                    continue
                if "obj" not in q and min(bz1, qz1) - max(bz0, qz0) <= 1e-3:
                    continue
                fx, fy = FACE_DIR[r["facing"]]
                shift = {(0.0, -1.0): by1 - (qy0 - GAP), (0.0, 1.0): (qy1 + GAP) - by0,
                         (1.0, 0.0): (qx1 + GAP) - bx0, (-1.0, 0.0): bx1 - (qx0 - GAP)}[(fx, fy)]
                if shift <= 0:
                    continue
                r["obj"].location.x += fx * shift
                r["obj"].location.y += fy * shift
                r["settled"] = round(r.get("settled", 0.0) + shift, 3)
                bpy.context.view_layer.update()
                bx0, by0, _bz0, bx1, by1, _bz1 = world_bbox(r["obj"])
                notes.append(f"{r['id']} moved {shift:.2f} m {r['facing']} out of {q['id']}")
                print("SETTLE " + notes[-1], flush=True)
                moved = True
        if not moved:
            break
    return notes


class RoomGround:
    """The `mp` of vb.place: a room's floor is flat at z = 0."""

    @staticmethod
    def height(x: float, y: float) -> float:
        return 0.0


def build_props_and_spots(room: Room, wall_props: set) -> dict:
    """Every prop and spot; returns light anchors {(tx, ty): {"flame": point} or {"window": (point, dir, sx, sy)}}."""
    anchors: dict = {}
    spot_at = {(s["x"], s["y"]): s for s in room.spots}
    done_spots = set()
    for p in room.props:
        tx, ty = p["x"], p["y"]
        spec, key = lookup(PROP_MODELS, prop_keys(p))
        if spec is None:
            spec, key = dict(DEFAULT_BOX), None
            print(f"UNMAPPED prop {p['id']} ({p.get('kind')}): a {spec['size']} grey box", flush=True)
        model = spec["model"]
        name = f"HM_Prop_{p['id']}"
        rec_extra = dict(kind=p.get("kind"), key=key)
        if p.get("footprint"):
            fp = p["footprint"]
            tiles = [(x, y) for y in range(fp["y"], fp["y"] + fp["h"]) for x in range(fp["x"], fp["x"] + fp["w"])]
            x0, _y0, _x1, y1 = room.tile_box(fp["x"], fp["y"])
            _x0, y0, x1, _y1 = room.tile_box(fp["x"] + fp["w"] - 1, fp["y"] + fp["h"] - 1)
            ob = grey_box(name, (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) * 0.9, (y1 - y0) * 0.9, 1.0)
            register(ob, "prop", p["id"], tiles, pass_for(room, tiles), code=(fp["x"], fp["y"], fp["w"], fp["h"]),
                     model="box", label=p["id"], **rec_extra)
            continue
        if model == "rug":
            ob = build_rug(room, name, tx, ty, spec)
            register(ob, "prop", p["id"], [(tx, ty)], "bg", model="rug", flat=True, sizeM=list(spec["size"]),
                     **rec_extra)
        elif model == "bed" or (model == "ph" and spec.get("bed")):
            spot = None
            for side in ("W", "E", "N", "S"):
                dx, dy = SIDE_DXY[side]
                s = spot_at.get((tx + dx, ty + dy))
                if s is not None and s.get("variant") == "underBed" and room.solid(tx + dx, ty + dy):
                    spot = s
                    break
            bed_tiles = [(spot["x"], spot["y"]), (tx, ty)] if spot is not None else [(tx, ty)]
            if model == "ph":
                ob, facing, info = build_ph_bed(room, name, bed_tiles, spec, wall_props)
                bed_extra = dict(model=f"ph:{spec['slug']}", facing=facing, ph=info)
            else:
                ob = build_bed(room, name, bed_tiles, spec, wall_props)
                bed_extra = dict(model="box")
            if spot is not None:
                ob["wdi_spot"] = spot["id"]
                done_spots.add(spot["id"])
                tiles = [(spot["x"], spot["y"])]
                register(ob, "prop", p["id"], tiles, pass_for(room, tiles), code=(spot["x"], spot["y"], 1, 1),
                         label=p["id"], spot=spot["id"], over=[[tx, ty]], spans=[list(t) for t in bed_tiles],
                         **bed_extra, **rec_extra)
            else:
                solid = room.solid(tx, ty)
                print(f"WARN {p['id']}: no under-bed spot beside it; " +
                      ("coded to its own tile" if solid else "on a walkable tile, drawn with the floor"), flush=True)
                register(ob, "prop", p["id"], [(tx, ty)], pass_for(room, [(tx, ty)], flat=not solid),
                         code=(tx, ty, 1, 1) if solid else None, label=p["id"], **bed_extra, **rec_extra)
        elif spec.get("wall"):
            open_side = room.open_side(tx, ty) or "S"
            rz = FACE_RZ[open_side]
            cx, cy = room.centre(tx, ty)
            M = M4(cx, cy, 0.0, rz)
            h = WALL_H[room.shell_class(tx, ty)]
            open_local = local_sides(room, tx, ty, rz, wall_props)
            mb = wb.MB()
            if model == "window":
                (lx, ly, lz), (wsx, wsy), keep = window_piece(mb, M, h, open_local, spec)
                pt = M @ Vector((lx, ly, lz))
                d = M.to_3x3() @ Vector((0.0, -1.0, -0.12))
                anchors[(tx, ty)] = {"window": (tuple(pt), tuple(d), wsx, wsy)}
                ob = mb.build(name, col="models")
            else:
                photos_piece(mb, M, h, open_local, local_notches(room, tx, ty, rz, wall_props))
                ob = mb.build(name, col="models")
                parts, fbox = photo_parts(M)
                assemble(name, parts, into=ob)
                keep = [{"what": "photographs", "box": fbox, "settle": False}]
                rec_extra["frames"] = [f"{f[0]}@{f[1]:g}" for f in PHOTO_FRAMES]
            keep = [dict(kp, box=world_box(M, kp["box"])) for kp in keep]   # world boxes: settle and the labels
            register(ob, "prop", p["id"], [(tx, ty)], pass_for(room, [(tx, ty)]), code=(tx, ty, 1, 1),
                     model=model, wall=True, height=h, keep=keep, **rec_extra)
        elif not room.solid(tx, ty):
            sz = spec["size"] if isinstance(spec.get("size"), (list, tuple)) and len(spec["size"]) == 3 else DEFAULT_BOX["size"]
            ob = grey_box(name, *room.centre(tx, ty), *sz)
            print(f"WARN {p['id']}: stands on a walkable tile, drawn with the floor", flush=True)
            register(ob, "prop", p["id"], [(tx, ty)], "bg", model="box", label=p["id"], flat=True, **rec_extra)
        elif model == "meshy":
            ob, facing = place_meshy(room, name, spec["name"], tx, ty, spec)
            register(ob, "prop", p["id"], [(tx, ty)], pass_for(room, [(tx, ty)]), code=(tx, ty, 1, 1),
                     model=f"meshy:{spec['name']}", facing=facing, movable=True, **rec_extra)
        elif model == "candle":
            ob, flame, facing = build_candle(room, name, tx, ty, spec, wall_props)
            anchors[(tx, ty)] = {"flame": flame}
            register(ob, "prop", p["id"], [(tx, ty)], pass_for(room, [(tx, ty)]), code=(tx, ty, 1, 1),
                     model="box", label=p["id"], facing=facing, **rec_extra)
        elif model == "ph":
            ob, facing, info = place_ph(room, name, tx, ty, spec, wall_props)
            if "flame" in info:
                anchors[(tx, ty)] = {"flame_of": (ob, info["flame"])}
            register(ob, "prop", p["id"], [(tx, ty)], pass_for(room, [(tx, ty)]), code=(tx, ty, 1, 1),
                     model=f"ph:{spec['slug']}", label=p["id"], facing=facing, movable=not spec.get("centre"),
                     ph=info, **rec_extra)
        else:
            w, dd, hh = spec["size"]
            cx, cy, facing, sx, sy = standing_frame(room, tx, ty, w, dd, wall_props)
            ob = grey_box(name, cx, cy, sx, sy, hh)
            register(ob, "prop", p["id"], [(tx, ty)], pass_for(room, [(tx, ty)]), code=(tx, ty, 1, 1),
                     model="box", label=p["id"], facing=facing, movable=True, **rec_extra)
    for s in room.spots:
        if s["id"] in done_spots:
            continue
        tx, ty = s["x"], s["y"]
        spec, key = lookup(SPOT_MODELS, [s["id"], s.get("variant")])
        if spec is None:
            spec, key = dict(DEFAULT_BOX), None
            print(f"UNMAPPED spot {s['id']} ({s.get('variant')}): a {spec['size']} grey box", flush=True)
        name = f"HM_Spot_{s['id']}"
        extra = dict(kind=s.get("kind"), variant=s.get("variant"), key=key)
        facing = None
        if spec["model"] == "ph" and spec.get("bed"):
            ob, facing, extra["ph"] = build_ph_bed(room, name, [(tx, ty)], spec, wall_props)
            model = f"ph:{spec['slug']}"
        elif spec["model"] == "ph":
            ob, facing, extra["ph"] = place_ph(room, name, tx, ty, spec, wall_props)
            model = f"ph:{spec['slug']}"
            extra["movable"] = not spec.get("centre")
        elif spec["model"] == "bed":
            ob = build_bed(room, name, [(tx, ty)], spec, wall_props)
            model = "box"
        elif spec["model"] == "meshy":
            ob, facing = place_meshy(room, name, spec["name"], tx, ty, spec)
            model = f"meshy:{spec['name']}"
            extra["movable"] = True
        else:
            w, dd, hh = spec["size"]
            cx, cy, facing, sx, sy = standing_frame(room, tx, ty, w, dd, wall_props)
            ob = grey_box(name, cx, cy, sx, sy, hh)
            model = "box"
            extra["movable"] = True
        extra["facing"] = facing
        register(ob, "spot", s["id"], [(tx, ty)], pass_for(room, [(tx, ty)]), code=(tx, ty, 1, 1), model=model,
                 label=s["id"] if model == "box" or model.startswith("ph:") else None, **extra)
    return anchors


# ---------------------------------------------------------------- portals


def door_piece(mb, M, h: float, face: str, kind: str) -> None:
    """A doorway through one tile of wall, its room side at -y: the wall either side at the tile's cut-away height,
    a threshold board; in a standing wall (face s or e) also the head, a dark wood architrave and a dark opening.
    Stairs add steps rising away from the room."""
    mt = materials()
    a = S / 2
    ow = min(DOOR_W, 0.8 * S)           # never wider than the client's door leaf, 0.8 tile
    sk = min(SKIRT_H, h)
    for x0, x1 in ((-a, -ow / 2), (ow / 2, a)):
        add_box(mb, (x0, -a + SKIRT_IN, 0.0), (x1, a, h), mt["plaster"], top=mt["walltop"], M=M)
        add_box(mb, (x0, -a, 0.0), (x1, -a + SKIRT_IN + 0.004, sk), mt["wood"],
                top=mt["walltop"] if h <= sk + 1e-6 else mt["wood"], M=M)
    add_box(mb, (-ow / 2, -a, 0.0), (ow / 2, a, 0.025), mt["wood"], M=M)
    if face != "sill" and h > 1.0:
        dh = min(DOOR_H, h - 0.08)
        if h > dh + 0.02:
            add_box(mb, (-ow / 2, -a + SKIRT_IN, dh), (ow / 2, a, h), mt["plaster"], top=mt["walltop"], bottom=mt["plaster"], M=M)
        for lo, hi in (((-ow / 2 - 0.09, -a - 0.015, 0.0), (-ow / 2, -a + SKIRT_IN, dh + 0.09)),
                       ((ow / 2, -a - 0.015, 0.0), (ow / 2 + 0.09, -a + SKIRT_IN, dh + 0.09)),
                       ((-ow / 2 - 0.09, -a - 0.015, dh), (ow / 2 + 0.09, -a + SKIRT_IN, dh + 0.09))):
            add_box(mb, lo, hi, mt["wood"], M=M)
        mb.quad((-ow / 2, a - 0.02, 0.0), (ow / 2, a - 0.02, 0.0), (ow / 2, a - 0.02, dh), (-ow / 2, a - 0.02, dh),
                mat=mt["void"], M=M)
    if kind == "stairs":
        n = 5
        for i in range(n):
            y0 = -a + (i + 1) * (2 * a) / (n + 1)
            add_box(mb, (-ow / 2, y0, 0.0), (ow / 2, a, 0.17 * (i + 1)), mt["wood"], M=M)


def hatch_piece(mb, M, kind: str) -> None:
    """A hatch (a dark wood frame and lid) or a drop (a frame round a dark hole) on the floor of its tile."""
    mt = materials()
    q, t = min(0.55, 0.45 * S), 0.07    # 1.1 m square, or 0.9 tile where a tile is smaller
    for lo, hi in (((-q, -q, 0.0), (q, -q + t, 0.06)), ((-q, q - t, 0.0), (q, q, 0.06)),
                   ((-q, -q + t, 0.0), (-q + t, q - t, 0.06)), ((q - t, -q + t, 0.0), (q, q - t, 0.06))):
        add_box(mb, lo, hi, mt["wood"], M=M)
    inner = mt["wood"] if kind == "hatch" else mt["void"]
    mb.quad((-q + t, -q + t, 0.02), (q - t, -q + t, 0.02), (q - t, q - t, 0.02), (-q + t, q - t, 0.02), mat=inner, M=M)


def build_portals(room: Room, wall_props: set) -> None:
    for pt in room.portals:
        tx, ty = pt["x"], pt["y"]
        face = room.portal_face(tx, ty)
        kind = pt["kind"]
        cx, cy = room.centre(tx, ty)
        mb = wb.MB()
        if kind in ("hatch", "drop"):
            hatch_piece(mb, M4(cx, cy), kind)
            h = 0.06
        else:
            side = room.open_side(tx, ty) or "S"
            h = WALL_H[room.shell_class(tx, ty)]
            door_piece(mb, M4(cx, cy, 0.0, FACE_RZ[side]), h, face, kind)
        ob = mb.build(f"HM_Portal_{pt['id']}", col="world", wdi_portal=pt["id"], wdi_portal_kind=kind, wdi_face=face)
        register(ob, "portal", pt["id"], [(tx, ty)], pass_for(room, [(tx, ty)]), code=(tx, ty, 1, 1), model=kind,
                 kind=kind, face=face, height=h, to=pt.get("to"))


# ---------------------------------------------------------------- the scene's lights (preview stills)


def build_lights(room: Room, anchors: dict) -> list:
    out = []
    for lt in room.lights:
        kind, lid, tx, ty = lt["kind"], lt["id"], lt["x"], lt["y"]
        colour = lin(lt.get("color") or LIGHT_TOKEN.get(kind, "lantern"))
        energy, radius = LIGHT_DEFAULTS.get(kind, (40.0, 0.1))
        a = dict(anchors.get((tx, ty), {}))
        if "flame_of" in a:   # a Poly Haven candle's flame, wherever its piece stands now
            ob, p = a["flame_of"]
            bpy.context.view_layer.update()
            a["flame"] = tuple(ob.matrix_world @ Vector(p))
        if "window" in a and kind in ("window", "moon", "shaft"):
            pt, d, sx, sy = a["window"]
            ob = wb.area_light(kind, lid, pt, d, sx, sy, energy, colour, volume=0.0, shadow=True)
            # the window's light lands on the same tiles at the same strength at any tile size (the look is set at
            # 1.5 m: at 1.0 m every tile is 1.5 times nearer the window, and the moon over the candle read lilac)
            ob["wdi_gain"] = (S / VIEWS_TILE_M) ** 2
        else:
            if "flame" in a:
                x, y, z = a["flame"]
            else:
                x, y = room.centre(tx, ty)
                z = LIGHT_Z.get(kind, 1.5)
                side = room.open_side(tx, ty) if room.solid(tx, ty) else None
                if side:   # a light on a wall tile hangs on the wall's room face
                    dx, dy = SIDE_DXY[side]
                    x, y = x + dx * S * 0.55, y - dy * S * 0.55
            ob = wb.point_light(kind, lid, x, y, z, energy, colour, radius=radius, volume=0.0, shadow=True)
        ob["wdi_phases"] = ",".join(lt.get("phases") or ["day", "dusk", "night"])
        ob["wdi_radius_tiles"] = float(lt.get("radiusTiles", 2.0))
        if kind in MOON_SPECULAR and hasattr(ob.data, "specular_factor"):
            ob.data.specular_factor = MOON_SPECULAR[kind]
        out.append(ob)
    return out


# ---------------------------------------------------------------- checks


def shell_check(room: Room) -> dict:
    """Compare the derived shell with the client's exported tilemap (apps/client/public/assets/scenes/<id>)."""
    path = os.path.join(TILEMAPS_DIR, room.id, "tilemap.json")
    if not os.path.exists(path):
        print(f"SHELL CHECK skipped: no {path}", flush=True)
        return {"checked": False}
    with open(path, encoding="utf-8") as fh:
        tm = json.load(fh)
    theirs, faces = {}, {}
    for layer in tm.get("layers", []):
        if layer.get("name") == "solids":
            for o in layer["objects"]:
                theirs[(int(round(o["x"] / 64)), int(round(o["y"] / 64)))] = o["type"].split("/")[1]
        if layer.get("name") == "portals":
            for o in layer["objects"]:
                faces[o["name"]] = next((p["value"] for p in o.get("properties", []) if p["name"] == "face"), None)
    ours = {(x, y): room.kit_class(x, y) for y in range(room.h) for x in range(room.w) if room.kit_class(x, y)}
    bad = [f"{k}: ours {ours.get(k)} client {theirs.get(k)}" for k in sorted(set(ours) | set(theirs))
           if ours.get(k) != theirs.get(k)]
    bad += [f"portal {pid}: ours {room.portal_face(p['x'], p['y'])} client {faces.get(pid)}"
            for pid, p in ((q["id"], q) for q in room.portals) if faces.get(pid) not in (None, room.portal_face(p["x"], p["y"]))]
    print(f"SHELL CHECK {'ok' if not bad else 'MISMATCH'}: {len(ours)} kit tiles, {len(room.portals)} portals "
          f"against {os.path.relpath(path, ROOT)}" + ("".join(f"\n  {b}" for b in bad)), flush=True)
    return {"checked": True, "ok": not bad, "kitTiles": len(ours), "mismatches": bad}


def world_bbox(ob) -> tuple:
    pts = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    return (min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts),
            max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts))


def _span_box(room: Room, tiles) -> tuple:
    bx = [room.tile_box(*t) for t in tiles]
    return min(b[0] for b in bx), min(b[1] for b in bx), max(b[2] for b in bx), max(b[3] for b in bx)


def footprint_report(room: Room) -> list:
    """Every standing object (either pass) against its code footprint: overhang in tiles per side (none north or
    west, up to SPAN_OVER south or east); a bed also against the span of the tiles it lies on."""
    bpy.context.view_layer.update()
    notes = []
    for r in BUILT:
        if r["code"] is None or r["what"] not in ("prop", "spot") or r.get("flat") or r.get("wall"):
            continue
        x0c, y0c, wc, hc = r["code"]
        bb = world_bbox(r["obj"])
        box = (bb[0], bb[1], bb[3], bb[4])
        over = overhang_of(box, _span_box(room, [(x0c, y0c), (x0c + wc - 1, y0c + hc - 1)]))
        r["overhang"] = over
        r["overhangM"] = {k: round(v * S, 3) for k, v in over.items()}
        r["bbox"] = [round(v, 3) for v in bb]
        r["sizeM"] = [round(bb[3] - bb[0], 3), round(bb[4] - bb[1], 3), round(bb[5] - bb[2], 3)]
        ph = r.get("ph") or {}
        print(f"PIECE {r['id']:20s} {r['model']:26s} k {ph.get('k', '-')} final {ph.get('kFinal', '-')} "
              f"size {r['sizeM']} m facing {r.get('facing')} overhang {over} tiles", flush=True)
        bad = over_rules(over)
        if r.get("spans"):
            r["spanOverhang"] = overhang_of(box, _span_box(room, r["spans"]))
            r["spanOverhangM"] = {k: round(v * S, 3) for k, v in r["spanOverhang"].items()}
            past = ", ".join(f"{k} {v:.2f} tile ({v * S:.2f} m)" for k, v in r["spanOverhang"].items() if v > 0)
            print(f"FOOTPRINT {r['id']} past its tiles {r['spans']}: {past or 'none'}", flush=True)
        if bad:
            msg = (f"{r['id']} ({r['pass_']}) overhangs its tile {tuple(r['code'][:2])} " +
                   ", ".join(f"{k} {over[k]:.2f} tile ({over[k] * S:.2f} m)" for k in bad))
            notes.append(msg)
            print("FOOTPRINT " + msg, flush=True)
    return notes


# ---------------------------------------------------------------- the game camera and passes


def game_rig(scene, room: Room, f: float):
    """HM_IsoCam (camera-layering.md 2), the 2.5D rig's key and fill directions, the warm bounce from the east and
    a slate world."""
    w, h = canvas(room)
    cam = bpy.data.objects.get("HM_IsoCam")
    if cam is None:
        data = bpy.data.cameras.new("HM_IsoCam")
        data.type = "ORTHO"
        cam = bpy.data.objects.new("HM_IsoCam", data)
        COL["rig"].objects.link(cam)
    cam.rotation_mode = "XYZ"
    cam.rotation_euler = (math.radians(rc.CAMERA_TILT_DEG), 0.0, math.radians(rc.CAMERA_YAW_DEG))
    cam.location = camera_location()
    cam.data.ortho_scale = max(w, h) / K
    cam.data.shift_x = cam.data.shift_y = 0.0
    cam.data.clip_start, cam.data.clip_end = 0.1, CAM_D + (room.w + room.h) * S + 40.0
    cam.data.sensor_fit = "AUTO"
    suns = (("HM_IsoKey", rc.world_azimuth(rc.KEY_LIGHT["azimuth"]), rc.KEY_LIGHT["elevation"], GAME_KEY_STRENGTH,
             rc.KEY_LIGHT["color"], True),
            ("HM_IsoFill", rc.world_azimuth(rc.FILL_LIGHT["azimuth"]), rc.FILL_LIGHT["elevation"], GAME_FILL_STRENGTH,
             rc.PALETTE[rc.FILL_LIGHT["color_token"]], False),
            ("HM_IsoBounce", GAME_BOUNCE["azimuth"], GAME_BOUNCE["elevation"], GAME_BOUNCE["strength"],
             GAME_BOUNCE["color"], False))
    for name, azimuth, elevation, strength, colour, shadow in suns:
        ob = bpy.data.objects.get(name)
        if ob is None:
            ob = bpy.data.objects.new(name, bpy.data.lights.new(name, "SUN"))
            COL["rig"].objects.link(ob)
        ld = ob.data
        ld.energy = strength
        ld.color = lin(colour)
        ld.use_shadow = shadow
        ld.angle = math.radians(GAME_KEY_ANGLE)
        if hasattr(ld, "use_shadow_jitter"):
            ld.use_shadow_jitter = shadow
        d = Vector(rc.light_direction(azimuth, elevation))   # world bearing, clockwise from north
        ob.location = d * 20.0
        ob.rotation_euler = d.to_track_quat("Z", "Y").to_euler()   # the sun's -z points back at the room
    world = bpy.data.worlds.get("HM_IsoWorld") or bpy.data.worlds.new("HM_IsoWorld")
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (*lin(GAME_WORLD_COLOR), 1.0)
    bg.inputs["Strength"].default_value = GAME_WORLD_STRENGTH
    scene.world = world
    scene.camera = cam
    return cam


def _png(scene, path: str) -> None:
    r = scene.render
    if hasattr(r.image_settings, "media_type"):
        r.image_settings.media_type = "IMAGE"
    r.image_settings.file_format = "PNG"
    r.image_settings.color_mode = "RGBA"
    r.image_settings.color_depth = "8"
    r.image_settings.compression = 15
    r.filepath = path
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    print(f"RENDERED {path} {r.resolution_x}x{r.resolution_y} {time.time() - t0:.1f}s", flush=True)


def _override(objs, mat_for) -> list:
    """Point every material slot of `objs` at an object-level material (linked duplicates keep their own data)."""
    saved = []
    for o in objs:
        for i, s in enumerate(o.material_slots):
            saved.append((o, i, s.link))
            s.link = "OBJECT"
            s.material = mat_for(o)
    return saved


def _restore(saved: list) -> None:
    for o, i, link in reversed(saved):
        s = o.material_slots[i]
        s.material = None
        s.link = link


def projection_probe(scene, room: Room, cam, f: float) -> list:
    """Blender's own projection of a few points against the camera formula (iso_px)."""
    from bpy_extras.object_utils import world_to_camera_view

    rw, rh = scene.render.resolution_x, scene.render.resolution_y
    pts = [("tile (0,0) top vertex", room.corner(0, 0) + (0.0,)), ("room centre", (0.0, 0.0, 0.0)),
           ("tile (0,0) centre", room.centre(0, 0) + (0.0,)),
           (f"tile ({room.w - 1},{room.h - 1}) bottom vertex", room.corner(room.w, room.h) + (0.0,)),
           ("tile (0,0) top vertex, 3 m up (world)", room.corner(0, 0) + (3.0 * GAME_Z,))]
    for pt in room.portals:
        pts.append((f"portal {pt['id']} centre", room.centre(pt["x"], pt["y"]) + (0.0,)))
    out = []
    for label, p in pts:
        c = world_to_camera_view(scene, cam, Vector(p))
        got = (c.x * rw, (1.0 - c.y) * rh)
        want = iso_px(room, *p, f=f)
        out.append({"point": label, "world": [round(v, 4) for v in p], "blender": [round(v, 3) for v in got],
                    "formula": [round(v, 3) for v in want], "error": round(math.hypot(got[0] - want[0], got[1] - want[1]), 4)})
        print(f"PROBE {label:40s} blender ({got[0]:8.2f}, {got[1]:8.2f})  formula ({want[0]:8.2f}, {want[1]:8.2f})", flush=True)
    return out


def game_passes(scene, room: Room, out_dir: str, f: float, samples: int, shell: dict, notes: list) -> dict:
    """bg.png, stand.png and code.png through HM_IsoCam at f times the display size; returns the passes record."""
    w, h = canvas(room)
    cam = game_rig(scene, room, f)
    root = bpy.data.objects[ROOT_NAME]
    root.scale = (1.0, 1.0, GAME_Z)
    COL["lights"].hide_render = True
    COL["rig"].hide_render = False
    r, e = scene.render, scene.eevee
    r.engine = "BLENDER_EEVEE"
    r.resolution_x, r.resolution_y, r.resolution_percentage = int(round(w * f)), int(round(h * f)), 100
    r.pixel_aspect_x = r.pixel_aspect_y = 1.0
    r.film_transparent = True
    r.filter_size = 1.0
    r.dither_intensity = 0.0
    r.use_compositing = False
    vs = scene.view_settings
    vs.view_transform, vs.look, vs.exposure, vs.gamma = "Standard", "None", 0.0, 1.0
    scene.display_settings.display_device = "sRGB"
    e.taa_render_samples = samples
    e.use_shadows = True
    e.shadow_pool_size = "1024"
    e.shadow_resolution_scale = 1.0
    e.shadow_ray_count, e.shadow_step_count = 4, 16
    e.use_raytracing = True
    e.ray_tracing_method = "SCREEN"
    e.use_fast_gi = True
    e.fast_gi_method = "AMBIENT_OCCLUSION_ONLY"
    e.fast_gi_distance = 1.2
    # No overscan: EEVEE pads the frame by whole pixels but widens the projection by the exact percentage, which
    # scaled the smoke render by about 0.5 % about its centre (2 px at the edges of a 368 px frame).
    e.use_overscan = False
    bpy.context.view_layer.update()
    probe = projection_probe(scene, room, cam, f)
    set_glass(*GAME_GLASS)
    set_flame(0.0)
    os.makedirs(out_dir, exist_ok=True)
    bg = [x for x in BUILT if x["pass_"] == "bg"]
    stand = [x for x in BUILT if x["pass_"] == "stand" and x["code"] is not None]
    # (a) the background: floor and back shell; the standing objects hidden from the camera, still casting shadows.
    # The standing walls that touch a back-shell wall stay in: where the two passes meet, bg's edge then blends into
    # the neighbour instead of the void, so stand's anti-aliased edge over it leaves no dark seam (they lie under
    # their own slices, which never fade: stubs do not occlude).
    bg_walls = {tuple(t) for x in bg if x["what"] == "wall" for t in x["tiles"]}
    seam = [x for x in stand if x["what"] == "wall" and any((tx + dx, ty + dy) in bg_walls for tx, ty in x["tiles"]
                                                            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
    for x in stand:
        x["obj"].visible_camera = x in seam
    _png(scene, os.path.join(out_dir, "bg.png"))
    for x in stand:
        x["obj"].visible_camera = True
    # (b) the standing objects, the floor and the back shell as holdouts
    for x in bg:
        x["obj"].is_holdout = True
    _png(scene, os.path.join(out_dir, "stand.png"))
    # (c) the tile code of (b): raw emission, no filter, one sample
    by_obj = {x["obj"].name: x for x in stand}
    saved = _override([x["obj"] for x in stand], lambda o: code_material(room, *by_obj[o.name]["code"]))
    keep = (vs.view_transform, r.filter_size, e.taa_render_samples, e.use_raytracing, e.use_shadows)
    vs.view_transform, r.filter_size, e.taa_render_samples, e.use_raytracing, e.use_shadows = "Raw", 0.0, 1, False, False
    _png(scene, os.path.join(out_dir, "code.png"))
    vs.view_transform, r.filter_size, e.taa_render_samples, e.use_raytracing, e.use_shadows = keep
    _restore(saved)
    for x in bg:
        x["obj"].is_holdout = False
    root.scale = (1.0, 1.0, 1.0)
    COL["lights"].hide_render = False
    record = {
        "version": 1, "scene": room.id, "size": [room.w, room.h], "tileM": S, "zScale": GAME_Z,
        "canvas": [w, h], "factor": f, "render": [r.resolution_x, r.resolution_y], "pivot": list(pivot(room)),
        "topLeftScreen": list(top_left(room)), "pxPerMetre": round(K, 4), "pxPerVerticalMetre": round(KV * GAME_Z, 4),
        "camera": {"type": "ORTHO", "rotationDeg": [rc.CAMERA_TILT_DEG, 0.0, rc.CAMERA_YAW_DEG],
                   "location": [round(v, 4) for v in camera_location()], "orthoScale": round(max(w, h) / K, 5)},
        "light": {"key": dict(rc.KEY_LIGHT, strength=GAME_KEY_STRENGTH), "fill": dict(rc.FILL_LIGHT, strength=GAME_FILL_STRENGTH),
                  "bounce": dict(GAME_BOUNCE, azimuthIs="world bearing", shadow=False),
                  "world": {"color": GAME_WORLD_COLOR, "strength": GAME_WORLD_STRENGTH}, "view": "Standard",
                  "glass": {"color": GAME_GLASS[0], "emission": GAME_GLASS[1]},
                  "flame": {"emission": 0.0, "note": "lit, not glowing: the client draws the candle's glow"}},
        "bgAlsoDraws": [x["name"] for x in seam],
        "wallHeightM": WALL_H, "shellCheck": shell, "probe": probe, "notes": notes,
        "objects": [{("pass" if k == "pass_" else k): v for k, v in x.items() if k != "obj"} for x in BUILT],
        "lights": [{"id": lt["id"], "kind": lt["kind"], "tile": [lt["x"], lt["y"]], "radiusTiles": lt.get("radiusTiles"),
                    "phases": lt.get("phases"), "drawnBy": "client"} for lt in room.lights],
        "files": {"bg": "bg.png", "stand": "stand.png", "code": "code.png"},
    }
    with open(os.path.join(out_dir, "passes.json"), "w", encoding="utf-8") as fh:
        json.dump(record, fh, indent=1)
        fh.write("\n")
    return record


# ---------------------------------------------------------------- preview stills


def default_views(room: Room) -> dict:
    sx, sy = (room.spawns[0]["x"] + 0.5, room.spawns[0]["y"] + 0.5) if room.spawns else (room.w / 2, room.h - 1.5)
    return {"room": [[room.w * 1.12, room.h * 1.38, (room.w + room.h) * 0.45], [room.w * 0.47, room.h * 0.42, 0.2], 22,
                     {"overview": True}],
            "spawn": [[sx, sy, 1.6], [room.w / 2, 1.2, 1.2], 24]}


def views_for(room: Room) -> dict:
    """The room's views at this tile size: VIEWS (framed at VIEWS_TILE_M), an overview's heights scaled with the
    tile so its angles hold, then VIEWS_AT's own views for this tile size."""
    import copy

    views = copy.deepcopy(VIEWS.get(room.id) or default_views(room))
    k = S / VIEWS_TILE_M
    for v in views.values():
        if len(v) > 3 and isinstance(v[3], dict) and v[3].get("overview"):
            v[0][2] *= k
            v[1][2] *= k
    for (rid, s), over in VIEWS_AT.items():
        if rid == room.id and abs(s - S) < 1e-9:
            views.update(copy.deepcopy(over))
    return views


def _ambient_world(scene, sky: dict) -> None:
    """The look's sky.ambient_color (read here): with sky.on false the room is lit by that colour x sky.ambient while
    the camera still sees sky.ink (apply_world_flat gives both one colour)."""
    amb = sky.get("ambient_color")
    if not amb or sky.get("on", True) or scene.world is None:
        return
    nodes, links = scene.world.node_tree.nodes, scene.world.node_tree.links
    bg = next(n for n in nodes if n.type == "BACKGROUND")
    lp = next(n for n in nodes if n.type == "LIGHT_PATH")
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    links.new(lp.outputs["Is Camera Ray"], mix.inputs[0])
    mix.inputs[6].default_value = (*amb[:3], 1.0)                                   # every other ray: the ambient
    mix.inputs[7].default_value = (*sky.get("ink", [0.006, 0.007, 0.012])[:3], 1.0)  # camera rays: ink
    links.new(mix.outputs[2], bg.inputs["Color"])


def _project(scene, cam, p) -> tuple[float, float, float]:
    """Image px (u right, v down) and depth of a world point in the still camera."""
    from bpy_extras.object_utils import world_to_camera_view

    c = world_to_camera_view(scene, cam, Vector(p))
    return c.x * scene.render.resolution_x, (1.0 - c.y) * scene.render.resolution_y, c.z


def _hull(pts: list) -> list:
    """2D convex hull (monotone chain), anticlockwise."""
    pts = sorted(set(pts))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def label_data(scene, cam) -> dict:
    """For the plain-Python label step, in image px: each labelled grey box's anchor, a point of it the camera sees
    (rays from the eye to a grid of points on its bounding box's faces that meet the box first, inside the frame: the
    highest of them on screen, the one nearest the box's top centre among equals), how many such rays there are, and
    every standing object's silhouette (the convex hull of its bounding box's corners) for the labels to keep off."""
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    eye = cam.matrix_world.translation.copy()
    rw, rh = scene.render.resolution_x, scene.render.resolution_y
    grid = (0.1, 0.3, 0.5, 0.7, 0.9)
    labels, obstacles = [], []
    for r in BUILT:   # the wall props' keep boxes (a window's curtains, drape and glass; the photographs): no label
        for kp in r.get("keep", ()):   # may cover them (N2)
            x0, y0, z0, x1, y1, z1 = kp["box"]
            proj = [_project(scene, cam, (x, y, z)) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
            if all(p[2] > cam.data.clip_start for p in proj):
                obstacles.append({"id": f"{r['id']}:{kp['what']}",
                                  "hull": [[round(u, 1), round(v, 1)] for u, v in _hull([p[:2] for p in proj])]})
    for r in BUILT:
        if r["what"] not in ("prop", "spot") or r.get("flat") or r.get("wall"):
            continue
        ob = r["obj"]
        x0, y0, z0, x1, y1, z1 = world_bbox(ob)
        proj = [_project(scene, cam, (x, y, z)) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
        if all(p[2] > cam.data.clip_start for p in proj):
            obstacles.append({"id": r["id"], "hull": [[round(u, 1), round(v, 1)] for u, v in _hull([p[:2] for p in proj])]})
        if not r.get("label"):
            continue
        hits = []
        for a in grid:
            for b in grid:
                for p in ((x0 + (x1 - x0) * a, y0 + (y1 - y0) * b, z1 - 0.005), (x0 + 0.005, y0 + (y1 - y0) * a, z0 + (z1 - z0) * b),
                          (x1 - 0.005, y0 + (y1 - y0) * a, z0 + (z1 - z0) * b), (x0 + (x1 - x0) * a, y0 + 0.005, z0 + (z1 - z0) * b),
                          (x0 + (x1 - x0) * a, y1 - 0.005, z0 + (z1 - z0) * b)):
                    u, v, depth = _project(scene, cam, p)
                    if depth <= cam.data.clip_start or not (0 <= u < rw and 0 <= v < rh):
                        continue
                    d = Vector(p) - eye
                    hit, loc, _n, _i, hob, _m = scene.ray_cast(deps, eye, d.normalized(), distance=d.length + 0.02)
                    if hit and hob is not None and hob.name == ob.name:
                        hits.append(_project(scene, cam, tuple(loc))[:2])
        tu, _tv, _tz = _project(scene, cam, ((x0 + x1) / 2, (y0 + y1) / 2, z1))
        au, av = min(hits, key=lambda q: (round(q[1] / 6.0), abs(q[0] - tu))) if hits else (tu, _tv)
        labels.append({"id": r["id"], "text": r["label"], "anchor": [round(au, 1), round(av, 1)], "front": bool(hits),
                       "seenRays": len(hits)})
    return {"labels": labels, "obstacles": obstacles}


def _still(scene, paths: list) -> None:
    """One render (as mvl.render_still makes it, composited) saved as an RGB PNG to each path: the label step's raw
    copy and the plain still, which the label step replaces with the labelled one."""
    r = scene.render
    bpy.ops.render.render()
    img = bpy.data.images["Render Result"]
    if hasattr(r.image_settings, "media_type"):
        r.image_settings.media_type = "IMAGE"
    r.image_settings.file_format = "PNG"
    r.image_settings.color_mode = "RGB"
    r.image_settings.color_depth = "8"
    r.image_settings.compression = 15
    for path in paths:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        img.save_render(path, scene=scene)


def preview(scene, room: Room, out_dir: str, look_path: str, samples: int, res: int, labels: bool) -> list:
    with open(look_path, encoding="utf-8") as fh:
        look = json.load(fh)
    look.setdefault("render", {})["samples"] = samples
    COL["rig"].hide_render = True
    COL["lights"].hide_render = False
    bpy.data.objects[ROOT_NAME].scale = (1.0, 1.0, 1.0)
    mvl.apply_look(scene, look)
    _ambient_world(scene, look.get("sky", {}))
    # the glass glows in the look's own moonlight colour: the varnished red woods mirror it, and the palette's full
    # moon blue over their red read magenta
    set_glass(tuple(look.get("lights", {}).get("moon", {}).get("color") or lin("moon")), PREVIEW_GLASS_GLOW)
    set_flame(PREVIEW_FLAME_GLOW)
    views = views_for(room)
    mvl.VIEWS.clear()
    mvl.VIEWS.update(views)
    made = []
    os.makedirs(out_dir, exist_ok=True)
    meta = {"version": 1, "scene": room.id, "tileM": S, "res": [res, int(res * 9 / 16)], "labelPx": 20,
            "views": {}}
    for name in views:
        cam = mvl.still_camera(scene, name)
        restore = mvl.apply_view_options(scene, name)
        r = scene.render
        r.resolution_x, r.resolution_y, r.resolution_percentage = res, int(res * 9 / 16), 100
        path = os.path.join(out_dir, f"preview_{name}.png")
        stale = os.path.join(out_dir, f"preview_{name}.jpg")   # this script's JPEG stills before they became PNG
        if os.path.exists(stale):
            os.remove(stale)
            print(f"REMOVED the stale still {stale}", flush=True)
        t0 = time.time()
        if labels:
            meta["views"][name] = dict(file=os.path.basename(path), raw=f"raw/preview_{name}.png", view=views[name],
                                       **label_data(scene, cam))
            _still(scene, [os.path.join(out_dir, "raw", f"preview_{name}.png"), path])
        else:
            _still(scene, [path])
        restore()
        print(f"RENDERED {path} {time.time() - t0:.1f}s", flush=True)
        made.append(path)
    if labels:
        with open(os.path.join(out_dir, "preview.json"), "w", encoding="utf-8") as fh:
            json.dump(meta, fh, indent=1)
            fh.write("\n")
    COL["rig"].hide_render = False
    return made


# ---------------------------------------------------------------- the Blender entry point


def preflight(room: Room) -> None:
    """Stop before any work if a Meshy or Poly Haven model the room needs is not on disk (textures fall back, with
    a warning)."""
    specs = [lookup(PROP_MODELS, prop_keys(p))[0] for p in room.props]
    specs += [lookup(SPOT_MODELS, [s["id"], s.get("variant")])[0] for s in room.spots]
    missing = []
    for name in sorted({sp["name"] for sp in specs if sp and sp["model"] == "meshy"}):
        try:
            mi.meshy_path(name)
        except (FileNotFoundError, KeyError) as err:
            missing.append(f"Meshy model {name}: {err}")
    slugs = {sp["slug"] for sp in specs if sp and sp["model"] == "ph"}
    slugs |= {it["slug"] for sp in specs if sp and sp["model"] == "ph" for it in sp.get("dress", ())}
    if any(sp and sp["model"] == "photos" for sp in specs):
        slugs |= {f[0] for f in PHOTO_FRAMES}
    for slug in sorted(slugs):
        try:
            wb.fm.model_path(slug, must_exist=True)
        except (FileNotFoundError, KeyError) as err:
            missing.append(f"Poly Haven model {slug}: {err} (python tools/blender/materials/fetch_models.py --slugs {slug})")
    if missing:
        raise SystemExit("meshy_interior_build: missing inputs\n  " + "\n  ".join(missing))


def run_post_step(scene_id: str, out_dir: str, steps: list) -> None:
    """The Pillow steps (slices, labels) need a Python with Pillow and numpy outside Blender: try one on PATH, else
    print the command."""
    cmd_txt = f"python tools/blender/meshy_interior_build.py --scene {scene_id} --out {out_dir} --step {','.join(steps)}"
    py = os.environ.get("WDI_PYTHON") or shutil.which("python") or shutil.which("python3")
    if not py:
        print(f"POST STEP: no Python on PATH; run  {cmd_txt}", flush=True)
        return
    env = {k: v for k, v in os.environ.items() if k not in ("PYTHONHOME", "PYTHONPATH")}
    try:
        res = subprocess.run([py, os.path.abspath(__file__), "--scene", scene_id, "--out", out_dir, "--step", ",".join(steps)],
                             env=env, capture_output=True, text=True, timeout=900)
        sys.stdout.write(res.stdout)
        if res.returncode != 0:
            sys.stdout.write(res.stderr)
            print(f"POST STEP failed ({py}); run  {cmd_txt}", flush=True)
    except (OSError, subprocess.SubprocessError) as err:
        print(f"POST STEP could not run ({err}); run  {cmd_txt}", flush=True)


def blender_main(a) -> None:
    set_tile_m(a.tile_m)
    _load()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    room = Room(a.scene)
    out_dir, blend = out_paths(room.id, a.out)
    vb.W, vb.H = room.w, room.h            # before any vb.wx / wy / tc call
    scene.name = f"HollowMere_{room.id}"
    scene["wdi_tile_m"] = S
    scene["wdi_map_w"], scene["wdi_map_h"] = room.w, room.h
    scene["wdi_scene"], scene["wdi_biome"], scene["wdi_dark"] = room.id, room.biome, room.dark
    scene["wdi_ground_rows"] = 9999.0      # the look's stills: every eye under 25 m stands on the floor
    scene["wdi_game_zscale"] = GAME_Z      # HM_RoomRoot's z scale in the game passes (the saved file keeps 1)
    vb._collections(scene)
    for key, name in (("rig", "HM_GameRig"),):
        c = bpy.data.collections.new(name)
        scene.collection.children.link(c)
        COL[key] = c
    vb.CAT.update(mi.catalog())
    preflight(room)
    vb.HERO_2K.update({"kit_chest"})        # seen close up: keep its 2K base colour
    shell = shell_check(room)
    print(f"TILE {S} m per tile: K {K:.4f} px per metre, game z scale {GAME_Z:.4f} "
          f"({KV * GAME_Z:.3f} px per vertical metre), room {room.w * S:g} x {room.h * S:g} m", flush=True)
    root = bpy.data.objects.new(ROOT_NAME, None)
    COL["world"].objects.link(root)
    wall_props = set()
    for p in room.props:
        spec, _ = lookup(PROP_MODELS, prop_keys(p))
        if spec and spec.get("wall"):
            wall_props.add((p["x"], p["y"]))
    build_floor(room)
    build_walls(room, wall_props)
    build_portals(room, wall_props)
    anchors = build_props_and_spots(room, wall_props)
    settled = settle()
    build_lights(room, anchors)
    for r in BUILT:
        r["obj"].parent = root
    COL["src"].hide_viewport = True        # the masters stand at the origin: keep them out of ray casts
    game_rig(scene, room, a.res_factor)
    notes = footprint_report(room) + settled
    print(f"PH masters removed before the save: {purge_ph_masters()}", flush=True)
    counts: dict = {}
    for r in BUILT:
        counts[f"{r['what']}/{r['pass_']}"] = counts.get(f"{r['what']}/{r['pass_']}", 0) + 1
    print(f"BUILT {room.id}: {len(BUILT)} objects {counts}", flush=True)
    for r in BUILT:
        print(f"  {r['name']:34s} {r['what']:6s} {r['pass_']:5s} tiles {r['tiles']} code {r['code']} {r['model']}", flush=True)
    os.makedirs(os.path.dirname(blend), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=blend, compress=False)
    print("SAVED", blend, flush=True)
    if a.passes:
        game_passes(scene, room, out_dir, a.res_factor, a.samples, shell, notes)
    if a.preview:
        preview(scene, room, out_dir, a.look, a.samples, a.preview_res, not a.no_labels)
    steps = (["slices"] if a.passes else []) + (["labels"] if a.preview and not a.no_labels else [])
    if steps and not a.no_slice:
        run_post_step(room.id, out_dir, steps)


# ================================================================ the slice step (plain Python: Pillow and numpy)


def _nearest(idx, w: int, h: int, x: int, y: int, r: int = 3) -> int:
    """slice.ts nearest: the first coded pixel on rings 1..r (rows top to bottom, then columns left to right)."""
    for d in range(1, r + 1):
        for dy in range(-d, d + 1):
            for dx in range(-d, d + 1):
                if max(abs(dx), abs(dy)) != d:
                    continue
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and idx[ny, nx] >= 0:
                    return int(idx[ny, nx])
    return -1


def _bbox(mask) -> list | None:
    import numpy as np

    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return None
    return [int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)]


def slice_step(scene_id: str, out: str | None) -> dict:
    import numpy as np
    from PIL import Image

    room = Room(scene_id)
    out_dir, _blend = out_paths(scene_id, out)
    with open(os.path.join(out_dir, "passes.json"), encoding="utf-8") as fh:
        meta = json.load(fh)
    set_tile_m(meta.get("tileM", TILE_M_DEFAULT))   # the frame the passes were rendered in
    if abs(float(meta.get("zScale", GAME_Z)) - GAME_Z) > 1e-6:
        raise SystemExit(f"slice step: passes.json zScale {meta['zScale']} is not 0.75 x tileM {S}")
    f = float(meta["factor"])
    n, m = room.w, room.h
    load = lambda k: np.array(Image.open(os.path.join(out_dir, meta["files"][k])).convert("RGBA"))  # noqa: E731
    bg, stand, code = load("bg"), load("stand"), load("code")
    ink = np.array(INK, dtype=np.uint8)
    for arr, key in ((bg, "bg"), (stand, "stand")):   # ink is the darkest value of any opaque pixel
        on = arr[..., 3] > 0
        arr[..., :3][on] = np.maximum(arr[..., :3][on], ink)
        Image.fromarray(arr, "RGBA").save(os.path.join(out_dir, meta["files"][key]))
    hh, ww = code.shape[:2]
    valid = (code[..., 3] >= 128) & (code[..., 0] > 0) & (code[..., 1] > 0)
    idx = np.full((hh, ww), -1, dtype=np.int32)
    idx[valid] = (code[..., 1][valid].astype(np.int32) - 1) * 256 + (code[..., 0][valid].astype(np.int32) - 1)
    alpha = stand[..., 3]
    assign = np.where(alpha > 0, idx, -1)
    ys, xs = np.nonzero((alpha > 0) & (idx < 0))
    dropped = 0
    for y, x in zip(ys.tolist(), xs.tolist()):
        c = _nearest(idx, ww, hh, x, y)
        assign[y, x] = c
        dropped += c < 0
    tx = np.where(assign >= 0, np.minimum(assign % 256, n - 1), -1)
    ty = np.where(assign >= 0, np.minimum(assign // 256, m - 1), -1)
    sdir = os.path.join(out_dir, "slices")
    os.makedirs(sdir, exist_ok=True)
    for old in os.listdir(sdir):
        if old.startswith(f"{scene_id}#") and old.endswith(".png"):
            os.remove(os.path.join(sdir, old))
    slices, walk_coded = [], []
    for cx, cy in sorted({(int(a), int(b)) for a, b in zip(tx[assign >= 0].tolist(), ty[assign >= 0].tolist())},
                         key=lambda t: (t[1], t[0])):
        mask = (tx == cx) & (ty == cy)
        img = np.zeros_like(stand)
        img[mask] = stand[mask]
        frame = f"{scene_id}#{cx}_{cy}"
        Image.fromarray(img, "RGBA").save(os.path.join(sdir, f"{frame}.png"))
        if room.walkable(cx, cy):
            walk_coded.append([cx, cy])
        slices.append({"frame": frame, "file": f"slices/{frame}.png", "tile": [cx, cy], "trim": _bbox(mask),
                       "pixels": int(mask.sum())})
    # the iso still: the two passes over ink
    comp = Image.new("RGBA", (ww, hh), INK + (255,))
    comp.alpha_composite(Image.fromarray(bg, "RGBA"))
    comp.alpha_composite(Image.fromarray(stand, "RGBA"))
    comp.convert("RGB").save(os.path.join(out_dir, "preview_iso.png"))
    # Alignment: each standing wall block's tile code against the block projected by the camera formula. A block's
    # left extent is a vertical edge where its south face shows and its right extent one where its east face shows:
    # in the one-sample code pass such an edge lands on the formula's column exactly. Elsewhere the extent is the
    # point of a diamond, which the pixel grid meets within a pixel.
    standing = {tuple(o["tiles"][0]) for o in meta["objects"] if o["what"] in ("wall", "portal") and o["pass"] == "stand"}
    checks = []
    for o in meta["objects"]:
        if o["what"] != "wall" or o["pass"] != "stand":
            continue
        (cx, cy), hz = o["tiles"][0], o["height"] * GAME_Z
        x0, y0, x1, y1 = room.tile_box(cx, cy)
        uv = [iso_px(room, X, Y, Z, f) for X in (x0, x1) for Y in (y0, y1) for Z in (0.0, hz)]
        pred = [min(p[0] for p in uv), min(p[1] for p in uv), max(p[0] for p in uv), max(p[1] for p in uv)]
        bb = _bbox(idx == cy * 256 + cx)
        if bb is None:
            continue
        meas = [bb[0], bb[1], bb[0] + bb[2], bb[1] + bb[3]]
        kinds = ["edge" if (cx, cy + 1) not in standing else "vertex", "vertex",
                 "edge" if (cx + 1, cy) not in standing else "vertex", "vertex"]
        centre = iso_px(room, *room.centre(cx, cy), hz, f)
        at = code[int(centre[1]), int(centre[0])]
        checks.append({"tile": [cx, cy], "heightM": o["height"], "predicted": [round(v, 2) for v in pred],
                       "measured": meas, "delta": [round(meas[i] - pred[i], 2) for i in range(4)], "kinds": kinds,
                       "topCentrePx": [round(centre[0], 2), round(centre[1], 2)],
                       "codeAtTopCentre": [int(at[0]) - 1, int(at[1]) - 1] if at[3] >= 128 else None})
    worst_edge = max((abs(c["delta"][i]) for c in checks for i in range(4) if c["kinds"][i] == "edge"), default=None)
    worst_vertex = max((abs(c["delta"][i]) for c in checks for i in range(4) if c["kinds"][i] == "vertex"), default=None)
    worst = max(worst_edge or 0.0, worst_vertex or 0.0) if checks else None
    # the background's anti-aliased outer edges: the alpha of the two columns either side of the formula's edge,
    # on a row through the corner walls' faces (the south-west corner's south face, the north-east corner's east face)
    ext = _bbox(bg[..., 3] > 0)
    wall_h = {tuple(o["tiles"][0]): o["height"] for o in meta["objects"] if o["what"] == "wall" and o["pass"] == "bg"}
    profiles = []
    for label, tile, corner_pt in (("left", (0, m - 1), (0, m)), ("right", (n - 1, 0), (n, 0))):
        if tile not in wall_h:
            continue
        hz = wall_h[tile] * GAME_Z
        u, v0 = iso_px(room, *room.corner(*corner_pt), 0.0, f)
        _u, v1 = iso_px(room, *room.corner(*corner_pt), hz, f)
        row, col = int((v0 + v1) / 2), int(round(u))
        profiles.append({"edge": label, "formulaU": round(u, 3), "row": row, "columns": list(range(col - 2, col + 2)),
                         "alpha": [int(bg[row, c, 3]) for c in range(col - 2, col + 2)]})
    bg_check = {"extent": [ext[0], ext[1], ext[0] + ext[2], ext[1] + ext[3]] if ext else None,
                "formulaExtent": [round(iso_px(room, *room.corner(0, m), 0.0, f)[0], 2),
                                  round(iso_px(room, *room.corner(0, 0), max(wall_h.values(), default=0.0) * GAME_Z, f)[1], 2),
                                  round(iso_px(room, *room.corner(n, 0), 0.0, f)[0], 2),
                                  round(iso_px(room, *room.corner(n, m), 0.0, f)[1], 2)],
                "edgeProfiles": profiles,
                "note": "extent [left, top, right, bottom) of the opaque pixels; the formula's: corner (0, H) on the "
                        "floor, tile (0,0)'s top vertex at the tallest back wall, corner (W, 0), corner (W, H) on the floor"}
    pv = pivot(room)
    room_json = {
        "version": 1, "scene": scene_id, "size": [n, m], "tileM": S, "roomM": [round(n * S, 3), round(m * S, 3)],
        "zScale": GAME_Z, "factor": f, "canvas": meta["canvas"], "render": meta["render"],
        "pivot": [pv[0] * f, pv[1] * f], "pivotDisplay": list(pv),
        "canvasTopLeftScreen": meta["topLeftScreen"],
        "tile00TopVertexCanvas": list(iso_px(room, *room.corner(0, 0), 0.0, f)),
        "roomCentreCanvas": list(iso_px(room, 0.0, 0.0, 0.0, f)),
        "pxPerMetre": meta["pxPerMetre"], "pxPerVerticalMetre": meta["pxPerVerticalMetre"],
        "camera": meta["camera"], "light": meta["light"], "wallHeightM": meta["wallHeightM"],
        "background": {"frame": scene_id, "file": meta["files"]["bg"], "trim": ext},
        "slices": slices,
        "props": [{k: o.get(k) for k in ("id", "kind", "tiles", "pass", "code", "model", "name", "over", "spot",
                                          "facing", "ph", "frames", "sizeM", "bbox", "overhang", "overhangM", "spans",
                                          "spanOverhang", "spanOverhangM", "settled", "keep") if o.get(k) is not None}
                  for o in meta["objects"] if o["what"] == "prop"],
        "spots": [{k: o.get(k) for k in ("id", "kind", "variant", "tiles", "pass", "code", "model", "name", "facing",
                                         "ph", "sizeM", "bbox", "overhang", "overhangM", "settled")
                   if o.get(k) is not None} for o in meta["objects"] if o["what"] == "spot"] +
                 [{"id": o["spot"], "drawnBy": o["name"], "pass": o["pass"], "code": o["code"]}
                  for o in meta["objects"] if o.get("spot")],
        "portals": [{k: o.get(k) for k in ("id", "kind", "face", "tiles", "pass", "code", "name", "to") if o.get(k) is not None}
                    for o in meta["objects"] if o["what"] == "portal"],
        "walls": [{"tile": o["tiles"][0], "class": o["cls"], "heightM": o["height"], "pass": o["pass"]}
                  for o in meta["objects"] if o["what"] == "wall"],
        "lights": meta["lights"],
        "check": {"shell": meta["shellCheck"], "probe": meta["probe"], "standWalls": checks,
                  "worstEdgePx": worst_edge, "worstVertexPx": worst_vertex, "background": bg_check,
                  "droppedPixels": dropped, "slicesOnWalkableTiles": walk_coded},
        "notes": meta["notes"] + [f"{S:g} m per tile: the room is {n * S:g} x {m * S:g} m; furniture keeps its size in "
                                  "metres, so its overhang (tiles, and metres in overhangM) follows the tile size",
                                  "bg.png and stand.png are floored at ink #12141C (every opaque pixel)",
                                  "slices keep the full canvas; trim = [x, y, w, h] of their opaque pixels"],
    }
    path = os.path.join(out_dir, f"room_{scene_id}.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(room_json, fh, indent=1)
        fh.write("\n")
    print(f"SLICES {len(slices)} -> {sdir} (dropped {dropped} uncoded pixels; on walkable tiles {walk_coded})")
    print(f"ALIGN {len(checks)} standing wall blocks: vertical edges off by at most {worst_edge} px, diamond points by "
          f"at most {worst_vertex} px; background extent {bg_check['extent']} vs formula {bg_check['formulaExtent']}; "
          f"edge alpha {[(p['edge'], p['columns'], p['alpha']) for p in profiles]}")
    print(f"WROTE {path} and {os.path.join(out_dir, 'preview_iso.png')}")
    return room_json


# ---------------------------------------------------------------- the label step (plain Python: Pillow and numpy)

LABEL_FONTS = ("C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/arial.ttf",
               "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf")
LABEL_TEXT, LABEL_RIM = (0xD9, 0xD2, 0xC2), (0x2C, 0x32, 0x40)   # palette bone on an ink plate with a slate rim
LABEL_PLATE = (0x1E, 0x22, 0x2E)   # ink lifted a step toward slate: a JPEG copy's ringing round the text stays above ink


def _clip_area(poly: list, w: float, h: float) -> float:
    """Area of a convex polygon clipped to the frame [0, w] x [0, h] (Sutherland-Hodgman)."""
    for axis, lim, keep_below in ((0, 0.0, False), (0, w, True), (1, 0.0, False), (1, h, True)):
        out = []
        for i, p in enumerate(poly):
            q = poly[i - 1]
            pin = p[axis] <= lim if keep_below else p[axis] >= lim
            qin = q[axis] <= lim if keep_below else q[axis] >= lim
            if pin != qin:
                t = (lim - q[axis]) / (p[axis] - q[axis])
                out.append((q[0] + t * (p[0] - q[0]), q[1] + t * (p[1] - q[1])))
            if pin:
                out.append(tuple(p))
        poly = out
        if not poly:
            return 0.0
    return abs(sum(poly[i - 1][0] * p[1] - p[0] * poly[i - 1][1] for i, p in enumerate(poly))) / 2.0


def _hsv(a):
    """Hue (degrees), saturation and value of an RGB array in 0..255 (the palette check's own formulas)."""
    import numpy as np

    a = a / 255.0
    mx, mn = a.max(-1), a.min(-1)
    d = mx - mn
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    h = np.zeros_like(mx)
    m = d > 1e-6
    rm = m & (mx == r)
    gm = m & (mx == g) & ~rm
    bm = m & ~rm & ~gm
    h[rm] = ((g - b)[rm] / d[rm]) % 6
    h[gm] = ((b - r)[gm] / d[gm]) + 2
    h[bm] = ((r - g)[bm] / d[bm]) + 4
    return h * 60.0, np.where(mx > 0, d / np.maximum(mx, 1e-6), 0.0), mx


def _off_palette(a):
    """Pixels the palette check counts against the owner's rules: the magenta band (hue 280-335 degrees, saturation
    over 0.30, value over 0.20), and anything darker than ink by luminance."""
    import numpy as np

    h, s, v = _hsv(a)
    lum = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    ink_lum = 0.2126 * INK[0] + 0.7152 * INK[1] + 0.0722 * INK[2]
    return (h >= 280) & (h <= 335) & (s > 0.30) & (v > 0.20), (lum < ink_lum - 0.5) | np.all(a < np.array(INK), axis=-1)


def save_still(im, path: str) -> dict:
    """Save a still losslessly (PNG), any pixel darker than ink set to ink, and count what the palette check counts
    against it. The render keeps the palette rules (no magenta band), but a JPEG encoder's noise does not: even at
    quality 100 it pushed a few moonlit floor and window-edge pixels over the band's edge."""
    import numpy as np
    from PIL import Image

    # ink is the darkest value: the look's ink lift, through AgX, leaves the scans' darkest crevices a hair under it
    # ((19, 19, 26)); those pixels become ink (a per-channel floor would tint the darkest red wood purple)
    a = np.asarray(im.convert("RGB")).copy()
    _mag0, under = _off_palette(a.astype(np.float64))
    a[under] = np.array(INK, dtype=np.uint8)
    Image.fromarray(a, "RGB").save(path, optimize=True)
    mag, dark = _off_palette(a.astype(np.float64))
    return {"format": "PNG", "magentaPx": int(mag.sum()), "underInkPx": int(dark.sum()), "flooredAtInkPx": int(under.sum())}


def _label_font(px: float):
    """The font size whose text, ascenders to descenders, stands nearest `px` tall: (font, measured px)."""
    from PIL import ImageFont

    path = next((p for p in LABEL_FONTS if os.path.exists(p)), None)
    best = None
    for size in range(6, 96):
        font = ImageFont.truetype(path, size) if path else ImageFont.load_default(size=size)
        b = font.getbbox("Hbdgjpqy_")
        h = b[3] - b[1]
        if best is None or abs(h - px) < abs(best[1] - px):
            best = (font, h)
        if h > px + 3:
            break
    return best


def label_step(scene_id: str, out: str | None) -> dict:
    """Label the preview stills' grey boxes (preview.json, written by the Blender run): text about labelPx tall at
    1920 px wide, on an ink plate, placed above its box or, where that would cover another standing object or label,
    at the nearest place that does not (with a leader line back to its box); boxes the camera cannot see get none.
    Reads raw/preview_<view>.png, writes preview_<view>.png and labels.json (each label's place and overlaps)."""
    import numpy as np
    from PIL import Image, ImageDraw

    out_dir, _blend = out_paths(scene_id, out)
    with open(os.path.join(out_dir, "preview.json"), encoding="utf-8") as fh:
        meta = json.load(fh)
    report = {"labelPx": meta.get("labelPx", 20), "views": {}}
    for name, v in meta["views"].items():
        im = Image.open(os.path.join(out_dir, v["raw"])).convert("RGB")
        W, H = im.size
        k = W / 1920.0
        font, text_px = _label_font(meta.get("labelPx", 20) * k)
        sat = {}
        for o in v["obstacles"]:
            mask = Image.new("L", (W, H), 0)
            ImageDraw.Draw(mask).polygon([tuple(p) for p in o["hull"]], fill=1)
            a = np.asarray(mask, dtype=np.int64)
            sat[o["id"]] = np.pad(a.cumsum(0).cumsum(1), ((1, 0), (1, 0)))
        draw = ImageDraw.Draw(im)
        pad_x, pad_y, gap, rim = round(7 * k), round(4 * k), round(8 * k), max(1, round(k))
        sep = max(2, round(6 * k))   # px every plate keeps from another plate and from the frame's edge
        step, reach_x, reach_y = max(1, round(5 * k)), round(340 * k), round(280 * k)
        placed, rows = [], []
        hulls = {o["id"]: o["hull"] for o in v["obstacles"]}

        def shown(lab) -> bool:
            """Seen by the camera, and its top in the frame, or (a tall piece close by) a twentieth of the frame."""
            if lab["seenRays"] <= 0 or not lab["front"]:
                return False
            u, w_ = lab["anchor"]
            if 0 <= u < W and 0 <= w_ < H:
                return True
            return lab["id"] in hulls and _clip_area(hulls[lab["id"]], W, H) > 0.05 * W * H

        todo = [lab for lab in v["labels"] if shown(lab)]
        leaders, plates = [], []   # drawn after placing every label: the lines first, then the plates over them
        full = draw.textbbox((0, 0), "Hbdgjpqy_", font=font)   # every plate as tall as the font's full text
        for lab in sorted(todo, key=lambda q: q["anchor"][1]):
            tb = draw.textbbox((0, 0), lab["text"], font=font)
            tb = (tb[0], full[1], tb[2], full[3])
            pw, ph = (tb[2] - tb[0]) + 2 * pad_x, (tb[3] - tb[1]) + 2 * pad_y
            ax = min(max(lab["anchor"][0], 0.0), W - 1.0)
            ay = min(max(lab["anchor"][1], ph + gap + 2.0), H - 1.0)
            ox, oy = np.meshgrid(np.arange(-reach_x, reach_x + 1, step), np.arange(-reach_y, reach_y + 1, step))
            x0 = np.round(ax - pw / 2 + ox).astype(np.int64)
            y0 = np.round(ay - gap - ph + oy).astype(np.int64)
            inside = (x0 >= sep) & (y0 >= sep) & (x0 + pw <= W - sep) & (y0 + ph <= H - sep)
            cx0, cy0 = np.clip(x0, 0, W), np.clip(y0, 0, H)
            cx1, cy1 = np.clip(x0 + pw, 0, W), np.clip(y0 + ph, 0, H)

            def covered(s):
                return s[cy1, cx1] - s[cy0, cx1] - s[cy1, cx0] + s[cy0, cx0]

            others = sum((covered(s) for oid, s in sat.items() if oid != lab["id"]), np.zeros_like(x0))
            own = covered(sat[lab["id"]]) if lab["id"] in sat else np.zeros_like(x0)
            lab_ov = np.zeros_like(x0)
            for p in placed:   # each placed plate grown by `sep`: plates keep that far apart
                lab_ov += (np.clip(np.minimum(x0 + pw, p[2] + sep) - np.maximum(x0, p[0] - sep), 0, None) *
                           np.clip(np.minimum(y0 + ph, p[3] + sep) - np.maximum(y0, p[1] - sep), 0, None))
            # a leader (anchor to the plate's nearest point) must not run under a placed plate, the plate must not
            # cover a placed leader, and no plate may hide another box's anchor: points sampled along each line
            nx, ny = np.clip(ax, x0, x0 + pw), np.clip(ay, y0, y0 + ph)
            crossing = np.zeros_like(x0)
            for t in np.linspace(0.05, 0.95, 10):
                qx, qy = ax + (nx - ax) * t, ay + (ny - ay) * t
                for p in placed:
                    crossing += (qx >= p[0]) & (qx <= p[2]) & (qy >= p[1]) & (qy <= p[3])
            for (sx0, sy0, sx1, sy1) in leaders:
                for t in np.linspace(0.0, 1.0, 12):
                    qx, qy = sx0 + (sx1 - sx0) * t, sy0 + (sy1 - sy0) * t
                    crossing += (qx >= x0) & (qx <= x0 + pw) & (qy >= y0) & (qy <= y0 + ph)
            for q in todo:
                if q is not lab:
                    qx, qy = q["anchor"]
                    crossing += (qx >= x0 - 4) & (qx <= x0 + pw + 4) & (qy >= y0 - 4) & (qy <= y0 + ph + 4)
            area = float(pw * ph)
            cost = (1000.0 * others / area + 3000.0 * lab_ov / area + 30.0 * own / area + 200.0 * crossing +
                    np.hypot(ox, oy) / (100.0 * k) + np.where(inside, 0.0, 1e9))
            i = np.unravel_index(int(np.argmin(cost)), cost.shape)
            rx0, ry0 = int(x0[i]), int(y0[i])
            rect = (rx0, ry0, rx0 + pw, ry0 + ph)
            true_ov = sum(max(0, min(rect[2], p[2]) - max(rect[0], p[0])) * max(0, min(rect[3], p[3]) - max(rect[1], p[1]))
                          for p in placed)
            near = min([max(p[0] - rect[2], rect[0] - p[2], p[1] - rect[3], rect[1] - p[3]) for p in placed] +
                       [rect[0], rect[1], W - rect[2], H - rect[3]])   # px to the nearest plate or frame edge
            moved = float(np.hypot(ox[i], oy[i]))
            leader = moved > ph * 0.8 + gap
            if leader:   # a short bone line from the plate's nearest point back to the box
                leaders.append((min(max(ax, rect[0]), rect[2]), min(max(ay, rect[1]), rect[3]), ax, ay))
            plates.append((rect, tb, lab["text"]))
            placed.append(rect)
            ink_box = draw.textbbox((0, 0), lab["text"], font=font)
            rows.append({"id": lab["id"], "rect": list(rect), "anchor": [round(ax, 1), round(ay, 1)],
                         "textPx": int(ink_box[3] - ink_box[1]), "fontTextPx": int(text_px), "plateH": int(ph),
                         "movedPx": round(moved, 1),
                         "leader": leader, "overOtherObjectsPx": int(others[i]), "overLabelsPx": int(true_ov),
                         "clearPx": int(near), "leaderCrossings": int(crossing[i])})
        for lx, ly, ax, ay in leaders:
            draw.line([(lx, ly), (ax, ay)], fill=LABEL_TEXT, width=max(1, round(2 * k)))
            r = max(2, round(3 * k))
            draw.ellipse([ax - r, ay - r, ax + r, ay + r], fill=LABEL_TEXT)
        for rect, tb, text in plates:
            draw.rectangle([rect[0], rect[1], rect[2] - 1, rect[3] - 1], fill=LABEL_PLATE, outline=LABEL_RIM, width=rim)
            draw.text((rect[0] + pad_x - tb[0], rect[1] + pad_y - tb[1]), text, font=font, fill=LABEL_TEXT)
        guard = save_still(im, os.path.join(out_dir, v["file"]))
        report["views"][name] = {"file": v["file"], "labels": rows,
                                 "unlabelled": [lab["id"] for lab in v["labels"] if lab not in todo], "palette": guard}
        print(f"LABELS {name}: {len(rows)} on {v['file']} (text {text_px} px; over other objects "
              f"{sum(r['overOtherObjectsPx'] for r in rows)} px, over labels {sum(r['overLabelsPx'] for r in rows)} px; "
              f"leaders {sum(r['leader'] for r in rows)}, crossings {sum(r['leaderCrossings'] for r in rows)}; "
              f"nearest plate or edge {min((r['clearPx'] for r in rows), default=None)} px; "
              f"unseen {report['views'][name]['unlabelled']}); {guard}")
    with open(os.path.join(out_dir, "labels.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=1)
        fh.write("\n")
    return report


# ================================================================ entry


def parse(argv: list[str]):
    p = argparse.ArgumentParser(prog="meshy_interior_build.py")
    p.add_argument("--scene", required=True)
    p.add_argument("--tile-m", type=float, default=TILE_M_DEFAULT,
                   help="metres per tile (1.5: the village's frame; 1.0: the game's metersPerTile)")
    p.add_argument("--out", help="output folder (default tools/blender/build/interiors/<scene>; the .blend goes beside "
                                 "it, named for the folder)")
    p.add_argument("--passes", action="store_true", help="render bg.png, stand.png, code.png through the game camera")
    p.add_argument("--preview", action="store_true", help="render the preview stills under --look")
    p.add_argument("--res-factor", type=float, default=1.0, help="render px per display px (1; 2 for HD)")
    p.add_argument("--no-labels", action="store_true", help="no labels on the grey boxes in the previews")
    p.add_argument("--samples", type=int, default=32)
    p.add_argument("--preview-res", type=int, default=1920, help="preview width (height 9/16 of it)")
    p.add_argument("--look", default=DEFAULT_LOOK)
    p.add_argument("--no-slice", action="store_true", help="skip the Pillow step (slices, labels) after the renders")
    p.add_argument("--step", help="plain Python: slices,labels (default: each one whose input is in the folder)")
    return p.parse_args(argv)


if __name__ == "__main__":
    if bpy is not None:
        blender_main(parse(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []))
    else:
        _args = parse(sys.argv[1:])
        _dir = out_paths(_args.scene, _args.out)[0]
        _steps = _args.step.split(",") if _args.step else [
            s for s, f in (("slices", "passes.json"), ("labels", "preview.json")) if os.path.exists(os.path.join(_dir, f))]
        if "slices" in _steps:
            slice_step(_args.scene, _args.out)
        if "labels" in _steps:
            label_step(_args.scene, _args.out)
