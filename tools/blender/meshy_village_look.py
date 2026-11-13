"""Looks for the 3D HollowMere scene: sky, moon, fog, lamp strengths, snow, falling snow, colour and post effects.

    blender -b --factory-startup -P tools/blender/meshy_village_look.py -- --blend tools/blender/build/hollowmere_base.blend
        --look tools/blender/meshy_looks/blue_hour.json [--look another.json ...]
        [--views square,station,manor,mere,aerial] [--res 1280] [--samples 32] --out tools/blender/build/look

One Blender run opens the base file once and renders every requested look and view to `<out>_<look>_<view>.jpg`.
A look is a JSON object merged over `DEFAULT` below; every key is optional. Angles are in degrees; an azimuth is the
compass direction a thing sits in, measured the mathematical way in the world frame: 0 = east, 90 = north,
180 = west, 270 = south. Light energies are Blender watts for point lights and W/m2 for the moon; with these
defaults a lantern lights the snow below it to about 1.0 scene-linear and moonlit snow is about 0.1, before exposure.
"""

from __future__ import annotations

import argparse
import copy
import json
import math
import os
import sys
import time

import bpy
from mathutils import Vector

DEFAULT: dict = {
    "name": "default",
    "render": {"samples": 32, "raytracing": True, "fog_tile": "8", "fog_samples": 64, "fog_end": 260.0, "shadow_scale": 1.0, "shadow_pool": "1024",
               # motion_blur = shutter in frames (0.5 = a film camera, 0.2 = a light smoothing), 0 = off; it only shows
               # in the fly-through. motion_blur_max caps the smear in pixels so a model the camera brushes past stays legible.
               "motion_blur": 0.0, "motion_blur_steps": 1, "motion_blur_max": 24,
               "filter_size": 1.5},           # pixel filter width: wider = softer, and less shimmer on fine snow in motion
    "sky": {
        "zenith": [0.010, 0.020, 0.060],      # colour straight up (scene-linear)
        "horizon": [0.070, 0.085, 0.150],     # colour at the horizon away from the glow
        "glow": [0.42, 0.20, 0.12],           # last light on the horizon
        "glow_azimuth": 205.0,                # where the sun went down (west-south-west)
        "glow_width": 75.0,                   # half-width of the glow along the horizon
        "glow_height": 0.20,                  # how far up it reaches (0..1 of the dome)
        "horizon_height": 0.34,               # where the horizon colour has faded to the zenith colour
        "ground": [0.032, 0.044, 0.078],      # below the horizon: no camera sees it; it stands for snow bounce onto walls and eaves
        "strength": 1.0,                      # multiplies the sky the camera sees
        "light": 0.6,                         # how much of that the sky gives the scene as light (1 = all of it)
        "stars": 0.9,                         # 0 = none
        "moon_disc": 3.0,                     # brightness of the visible moon, 0 = none
        "moon_size": 2.8,                     # its angular diameter
        "moon_halo": 0.05,                    # soft glow round it, 0 = none
        # added (the wild scenes): on = false replaces the sky by a flat ink world (caves); the camera sees `ink`,
        # the scene is lit by ink x `ambient` (a floor that keeps unlit rock at ink rather than black)
        "on": True, "ink": [0.006, 0.007, 0.012], "ambient": 0.0,
    },
    "moon": {"energy": 0.30, "color": [0.70, 0.80, 1.0], "azimuth": 322.0, "elevation": 18.0, "soft_angle": 2.0, "volume": 1.5,  # low in the south-east: in frame for the last shot
             "on": True},                     # added: false hides the moon sun (caves)
    "fog": {
        "density": 0.010,                     # ground fog at z = 0 (extinction per metre)
        "height": 7.0,                        # e-folding height
        "color": [0.62, 0.70, 0.86],
        "anisotropy": 0.25,
        "mere_density": 0.16,                 # extra bank of fog lying on the mere
        "mere_top": 1.0,                      # its top above the village ground (the water is 1.9 m below it)
        "patchiness": 0.6,                    # 0 = even, 1 = broken into drifts
        "box": [330.0, -6.0, 46.0],           # added: the HM_Fog volume: half-size in x and y, bottom z, top z
        "bank_box": None,                     # added: [[x0, y0, x1, y1], ...] where the bank lies; null = the village's mere (south of the lane)
        "bank_soft": 3.5,                     # added: metres over which a bank_box fades out
    },
    # every kind: "shadow" (added) true / false, or "keep" to leave each light's own setting from the build
    "lights": {
        "lantern": {"energy": 200.0, "color": [1.0, 0.50, 0.16], "radius": 0.25, "volume": 0.8, "bulb": 45.0, "shadow": True},   # street lantern posts
        "lamp": {"energy": 55.0, "color": [1.0, 0.48, 0.15], "radius": 0.08, "volume": 0.8, "shadow": False},                  # small lanterns hung on props and porches
        "headlamp": {"energy": 800.0, "color": [1.0, 0.74, 0.42], "radius": 0.30, "volume": 0.4, "shadow": True},             # the locomotive (a spot); keep "volume" low: the camera flies into this beam
        "window": {"energy": 80.0, "color": [1.0, 0.54, 0.19], "radius": 0.15, "volume": 0.15, "shadow": False},               # light spilling from a facade; low "volume" so it has no glowing core
        "teal": {"energy": 45.0, "color": [0.10, 1.0, 0.55], "radius": 0.20, "volume": 0.6, "shadow": False},                  # the apothecary window
        "shrine": {"energy": 35.0, "color": [1.0, 0.42, 0.10], "radius": 0.10, "volume": 1.0, "shadow": False},
        "drowned": {"energy": 120.0, "color": [0.50, 1.0, 0.85], "radius": 0.15, "volume": 0.6, "bulb": 30.0, "shadow": True},
        "moonpool": {"energy": 0.0, "color": [0.55, 0.70, 1.0], "radius": 1.0, "volume": 0.5, "shadow": False},
        # added (the wild scenes; the village has none of these kinds)
        "moss": {"energy": 24.0, "color": [0.30, 0.90, 0.74], "radius": 0.5, "volume": 0.3, "shadow": "keep"},        # cave moss and mere-rot
        "shaft": {"energy": 30.0, "color": [0.55, 0.70, 1.0], "radius": 1.3, "volume": 0.6, "shadow": "keep"},         # cool light down a shaft or in at a mouth
        "fire": {"energy": 300.0, "color": [1.0, 0.47, 0.16], "radius": 0.45, "volume": 0.9, "shadow": True},          # an open fire (the charcoal clamp)
        "torch": {"energy": 80.0, "color": [1.0, 0.52, 0.18], "radius": 0.08, "volume": 0.8, "shadow": True},          # a pitch torch
        "moon_pool": {"energy": 4000.0, "color": [0.70, 0.82, 1.0], "radius": 1.0, "volume": 0.2, "shadow": "keep"},  # a moon pool through a canopy gap (a spot)
        "sinkhole": {"energy": 2400.0, "color": [0.80, 0.88, 1.0], "radius": 0.8, "volume": 1.8, "shadow": "keep"},   # the moonbeam down the Flooded Gallery's shaft (a spot)
        "rot": {"energy": 32.0, "color": [0.22, 0.92, 0.76], "radius": 0.7, "volume": 0.35, "shadow": "keep"},        # the Flooded Gallery's mere-rot and moss glow
    },
    # glow the painted-in lamp glass and lit panes of these models (threshold = how bright a warm texel must be)
    "emissive": {"strength": 3.0, "threshold": 0.60, "models": [
        "Frozen_Lantern_Post", "company_lamp_post", "station_platform", "drowned_lantern", "The_Witching_Lantern",
        "graveyard_set", "Frostbound_Gate", "Frostbound_Warden_Gate", "Frostbound_Notice_Board", "Frostbound_Wishing_Well",
        "Frostbound_Waymarker", "emergency_bell", "fisher_cottage", "The_Drowned_Lantern", "Frostbitten_Fisherman_s_Wharf",
        "marsh_dock_skiff", "rail_car", "steam_locomotive", "timber_crib"]},
    "snow": {"tint": [0.86, 0.90, 0.96], "shade": [0.60, 0.67, 0.80], "roughness": 0.55, "cobble_roughness": 0.34, "joint_snow": 0.5,
             "roof": 0.7,                     # snow lying on the up-facing faces of the models, 0 = none
             "roof_skip": ["HM_Forest"]},     # added: collections whose models get no roof snow
    "water": {"roughness": 0.18},             # the mere: lower = a sharper, brighter path of moonlight
    "snowfall": {"on": True, "count": 4500, "radius": 0.011, "speed": 1.1, "wind": [0.35, -0.15],
                 "glow": 0.03},               # the flakes' own light: high enough that a flake never reads darker than the sky behind it
    "color": {"view_transform": "AgX", "look": "AgX - Base Contrast", "exposure": 1.2, "gamma": 1.0},
    "post": {"bloom": 0.5, "bloom_threshold": 1.0, "bloom_size": 0.55, "saturation": 1.10,
             "lift": [1.0, 1.0, 1.0], "gamma": [1.0, 1.0, 1.0], "gain": [1.0, 1.0, 1.0],
             # added (the caves): a scene-linear [r, g, b] added after the grade, the black floor (black then shows
             # as that colour through the view transform: the caves' ink #12141C); null = none
             "ink": None},
}

# still cameras for look development: (eye tile x, y, height above ground), (target tile x, y, z), lens mm
VIEWS = {
    "square": ((37.6, 26.4, 1.7), (27.0, 18.5, 2.2), 24.0),
    "station": ((56.8, 32.0, 1.7), (61.5, 26.0, 2.4), 24.0),
    "manor": ((17.5, 15.5, 1.7), (9.5, 9.0, 4.0), 24.0),
    "mere": ((36.0, 47.5, -0.9), (33.0, 30.0, 2.5), 28.0),
    "lane": ((44.0, 26.2, 1.7), (52.0, 20.0, 2.6), 24.0),
    "aerial": ((70.0, 60.0, 30.0), (30.0, 22.0, 0.0), 30.0),
    "moonward": ((20.0, 13.0, 1.7), (34.9, 26.4, 9.2), 24.0),     # south-east over the square: the moon above the bell
    "paddock": ((44.4, 14.2, 1.7), (54.0, 11.5, 2.2), 24.0),      # the barn door, the pelt, the scarecrow
    "chapelyard": ((16.5, 36.2, 1.6), (14.5, 31.0, 1.2), 24.0),   # the graves from the south lane
    "quay": ((57.5, 38.0, 1.9), (47.0, 36.0, 2.0), 24.0),         # west along the quay
    "tavern": ((38.3, 44.6, -0.2), (32.7, 39.2, 1.6), 24.0),      # The Drowned Lantern and the lantern, from the water
    "pullback": ((-5.0, 9.0, 28.0), (28.0, 20.0, 2.0), 22.0),     # over the manor: the moon mirrored in the mere
    "final": ((-14.0, -8.0, 30.0), (70.0, 56.0, 12.0), 18.0),     # the last frame of the fly-through
}
W, H = 64, 48
TILE_M = 1.5  # metres per map tile in the 3D scene: the game's layout, enlarged so human-scale buildings fit


def map_size() -> tuple[int, int]:
    """added: the open scene's map size in tiles (scene['wdi_map_w'/'wdi_map_h'], written by the wild builds); the
    village's 64 x 48 when the scene has none."""
    sc = bpy.context.scene
    return int(sc.get("wdi_map_w", W)), int(sc.get("wdi_map_h", H))


def tile_xy(tx: float, ty: float) -> tuple[float, float]:
    w, h = map_size()  # added: the map size of the open scene (was the module's W, H)
    return (tx - w / 2) * TILE_M, (h / 2 - ty) * TILE_M


def merge(base: dict, over: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = merge(out[k], v)
        else:
            out[k] = v
    return out


def direction(azimuth: float, elevation: float) -> Vector:
    a, e = math.radians(azimuth), math.radians(elevation)
    return Vector((math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e)))


def _c4(c) -> tuple:
    return (c[0], c[1], c[2], 1.0)


def _new(nodes, kind: str, **props):
    n = nodes.new(kind)
    for k, v in props.items():
        setattr(n, k, v)
    return n


def _math(nodes, links, op, a, b=None, clamp=False):
    n = _new(nodes, "ShaderNodeMath", operation=op, use_clamp=clamp)
    for sock, v in ((n.inputs[0], a), (n.inputs[1], b)):
        if v is None:
            continue
        if hasattr(v, "is_output"):
            links.new(v, sock)
        else:
            sock.default_value = v
    return n.outputs[0]


def _smooth(nodes, links, v, lo, hi):
    n = _new(nodes, "ShaderNodeMapRange", interpolation_type="SMOOTHSTEP", clamp=True)
    links.new(v, n.inputs[0])
    n.inputs[1].default_value, n.inputs[2].default_value = lo, hi
    n.inputs[3].default_value, n.inputs[4].default_value = 0.0, 1.0
    return n.outputs[0]


def _mix(nodes, links, fac, a, b):
    n = _new(nodes, "ShaderNodeMix", data_type="RGBA", blend_type="MIX")
    for sock, v in ((n.inputs[0], fac), (n.inputs[6], a), (n.inputs[7], b)):
        if hasattr(v, "is_output"):
            links.new(v, sock)
        elif isinstance(v, (int, float)):
            sock.default_value = v
        else:
            sock.default_value = _c4(v)
    return n.outputs[2]


# ---------------------------------------------------------------- render, world, moon


def apply_render(scene, q: dict) -> None:
    r, e = scene.render, scene.eevee
    r.engine = "BLENDER_EEVEE"
    r.film_transparent = False
    e.taa_render_samples = int(q["samples"])
    e.use_raytracing = bool(q["raytracing"])
    e.use_shadows = True
    e.shadow_pool_size = str(q.get("shadow_pool", "1024"))  # megabytes of graphics memory; 2048 starves a laptop
    e.shadow_resolution_scale = float(q.get("shadow_scale", 1.0))
    e.use_volume_custom_range = True
    e.volumetric_start = 0.1
    e.volumetric_end = float(q["fog_end"])
    e.volumetric_tile_size = str(q["fog_tile"])
    e.volumetric_samples = int(q["fog_samples"])
    e.use_volumetric_shadows = True
    e.clamp_volume_direct = 2.0   # a camera inside a lamp beam otherwise shows the fog grid as a dot lattice
    e.volumetric_light_clamp = 6.0
    r.dither_intensity = 1.5      # the sky gradient has no noise of its own: dither it against banding
    r.compositor_device = "GPU"
    r.filter_size = float(q.get("filter_size", 1.5))
    shutter = float(q.get("motion_blur", 0.0))
    r.use_motion_blur = shutter > 0.0
    if shutter > 0.0:
        r.motion_blur_shutter = shutter
        r.motion_blur_position = "CENTER"
        e.motion_blur_steps = int(q.get("motion_blur_steps", 1))   # 1 = blur from motion vectors only (cheap); more = that many full renders per frame
        e.motion_blur_max = int(q.get("motion_blur_max", 24))


def apply_world(scene, s: dict, moon: dict) -> None:
    w = bpy.data.worlds.get("HM_Sky") or bpy.data.worlds.new("HM_Sky")
    w.use_nodes = True
    w.sun_threshold = 0.0  # never turn the moon disc into a second light
    nodes, links = w.node_tree.nodes, w.node_tree.links
    for n in list(nodes):
        nodes.remove(n)
    tc = _new(nodes, "ShaderNodeTexCoord")
    d = tc.outputs["Generated"]
    sep = _new(nodes, "ShaderNodeSeparateXYZ")
    links.new(d, sep.inputs[0])
    z = sep.outputs[2]
    col = _mix(nodes, links, _smooth(nodes, links, z, 0.0, float(s["horizon_height"])), s["horizon"], s["zenith"])
    # the glow: a band on the horizon around one azimuth
    ga = math.radians(s["glow_azimuth"])
    dot = _new(nodes, "ShaderNodeVectorMath", operation="DOT_PRODUCT")
    links.new(d, dot.inputs[0])
    dot.inputs[1].default_value = (math.cos(ga), math.sin(ga), 0.0)
    g_az = _smooth(nodes, links, dot.outputs["Value"], math.cos(math.radians(s["glow_width"])), 1.0)
    g_el = _math(nodes, links, "SUBTRACT", 1.0, _smooth(nodes, links, z, 0.0, float(s["glow_height"])))
    col = _mix(nodes, links, _math(nodes, links, "MULTIPLY", g_az, g_el), col, s["glow"])
    col = _mix(nodes, links, _smooth(nodes, links, _math(nodes, links, "MULTIPLY", z, -1.0), 0.0, 0.06), col, s["ground"])
    # stars
    add = col
    if s["stars"] > 0:
        vor = _new(nodes, "ShaderNodeTexVoronoi", feature="F1")
        links.new(d, vor.inputs["Vector"])
        vor.inputs["Scale"].default_value = 62.0
        point = _math(nodes, links, "SUBTRACT", 1.0, _smooth(nodes, links, vor.outputs["Distance"], 0.0, 0.040))
        rnd = _new(nodes, "ShaderNodeSeparateXYZ")
        links.new(vor.outputs["Color"], rnd.inputs[0])
        keep = _smooth(nodes, links, rnd.outputs[0], 0.80, 1.0)
        up = _smooth(nodes, links, z, 0.04, 0.30)
        star = _math(nodes, links, "MULTIPLY", _math(nodes, links, "MULTIPLY", point, keep), up)
        star = _math(nodes, links, "MULTIPLY", star, float(s["stars"]) * 6.0)
        mixn = _new(nodes, "ShaderNodeMix", data_type="RGBA", blend_type="ADD")
        links.new(star, mixn.inputs[0])
        links.new(add, mixn.inputs[6])
        mixn.inputs[7].default_value = (0.85, 0.90, 1.0, 1.0)
        add = mixn.outputs[2]
    if s["moon_disc"] > 0:
        md = direction(moon["azimuth"], moon["elevation"])
        mdot = _new(nodes, "ShaderNodeVectorMath", operation="DOT_PRODUCT")
        links.new(d, mdot.inputs[0])
        mdot.inputs[1].default_value = md
        half = math.radians(s["moon_size"]) / 2
        disc = _smooth(nodes, links, mdot.outputs["Value"], math.cos(half * 1.12), math.cos(half * 0.92))
        mare = _new(nodes, "ShaderNodeTexNoise")
        links.new(d, mare.inputs["Vector"])
        mare.inputs["Scale"].default_value = 34.0
        shade = _math(nodes, links, "ADD", _math(nodes, links, "MULTIPLY", mare.outputs[0], 0.5), 0.65)
        amount = _math(nodes, links, "MULTIPLY", _math(nodes, links, "MULTIPLY", disc, shade), float(s["moon_disc"]))
        mixn = _new(nodes, "ShaderNodeMix", data_type="RGBA", blend_type="ADD")
        links.new(amount, mixn.inputs[0])
        links.new(add, mixn.inputs[6])
        mixn.inputs[7].default_value = (1.0, 0.96, 0.88, 1.0)
        add = mixn.outputs[2]
    if s.get("moon_halo", 0) > 0 and s["moon_disc"] > 0:
        md = direction(moon["azimuth"], moon["elevation"])
        hdot = _new(nodes, "ShaderNodeVectorMath", operation="DOT_PRODUCT")
        links.new(d, hdot.inputs[0])
        hdot.inputs[1].default_value = md
        halo = _math(nodes, links, "POWER", _math(nodes, links, "MAXIMUM", hdot.outputs["Value"], 0.0), 64.0)
        mixn = _new(nodes, "ShaderNodeMix", data_type="RGBA", blend_type="ADD")
        links.new(_math(nodes, links, "MULTIPLY", halo, float(s["moon_halo"])), mixn.inputs[0])
        links.new(add, mixn.inputs[6])
        mixn.inputs[7].default_value = (0.75, 0.85, 1.0, 1.0)
        add = mixn.outputs[2]
    bg = _new(nodes, "ShaderNodeBackground")
    links.new(add, bg.inputs["Color"])
    # the camera sees the sky at full strength; the scene is lit by a share of it, so the moon stays the key
    lp = _new(nodes, "ShaderNodeLightPath")
    share = _new(nodes, "ShaderNodeMix", data_type="FLOAT")
    links.new(lp.outputs["Is Camera Ray"], share.inputs[0])
    share.inputs[2].default_value = float(s["strength"]) * float(s.get("light", 1.0))
    share.inputs[3].default_value = float(s["strength"])
    links.new(share.outputs[0], bg.inputs["Strength"])
    links.new(bg.outputs[0], _new(nodes, "ShaderNodeOutputWorld").inputs["Surface"])
    scene.world = w


def apply_world_flat(scene, s: dict) -> None:
    """added: sky.on false (caves): world HM_Sky becomes a flat ink colour; the camera sees ink, the scene is lit by
    ink x sky.ambient (0 = no world light at all)."""
    w = bpy.data.worlds.get("HM_Sky") or bpy.data.worlds.new("HM_Sky")
    w.use_nodes = True
    nodes, links = w.node_tree.nodes, w.node_tree.links
    for n in list(nodes):
        nodes.remove(n)
    bg = _new(nodes, "ShaderNodeBackground")
    bg.inputs["Color"].default_value = _c4(s.get("ink", [0.006, 0.007, 0.012]))
    lp = _new(nodes, "ShaderNodeLightPath")
    share = _new(nodes, "ShaderNodeMix", data_type="FLOAT")
    links.new(lp.outputs["Is Camera Ray"], share.inputs[0])
    share.inputs[2].default_value = float(s.get("ambient", 0.0))
    share.inputs[3].default_value = 1.0
    links.new(share.outputs[0], bg.inputs["Strength"])
    links.new(bg.outputs[0], _new(nodes, "ShaderNodeOutputWorld").inputs["Surface"])
    scene.world = w


def apply_moon(scene, m: dict) -> None:
    ob = bpy.data.objects.get("HM_Moon")
    if ob is None:
        ob = bpy.data.objects.new("HM_Moon", bpy.data.lights.new("HM_Moon", "SUN"))
        scene.collection.objects.link(ob)
    ob.hide_render = not m.get("on", True)  # added: moon.on false hides the moon sun (caves)
    ld = ob.data
    ld.energy = float(m["energy"])
    ld.color = m["color"][:3]
    ld.angle = math.radians(m["soft_angle"])
    ld.volume_factor = float(m["volume"])
    to_moon = direction(m["azimuth"], m["elevation"])
    ob.rotation_euler = (-to_moon).to_track_quat("-Z", "Y").to_euler()


# ---------------------------------------------------------------- fog


def apply_fog(scene, f: dict) -> None:
    ob = bpy.data.objects.get("HM_Fog")
    hx, z0, z1 = (float(v) for v in f.get("box", (330.0, -6.0, 46.0)))  # added: fog.box (was the literals below)
    x, y0, y1 = hx, -hx, hx
    v = [(-x, y0, z0), (x, y0, z0), (x, y1, z0), (-x, y1, z0), (-x, y0, z1), (x, y0, z1), (x, y1, z1), (-x, y1, z1)]
    if ob is None:
        me = bpy.data.meshes.new("HM_Fog")
        me.from_pydata(v, [], [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)])
        ob = bpy.data.objects.new("HM_Fog", me)
        scene.collection.objects.link(ob)
        ob.visible_shadow = False
        ob["wdi_box"] = [hx, z0, z1]
    elif list(ob.get("wdi_box", [330.0, -6.0, 46.0])) != [hx, z0, z1]:  # added: a later look in the same run asks another box
        for i, co in enumerate(v):
            ob.data.vertices[i].co = co
        ob.data.update()
        ob["wdi_box"] = [hx, z0, z1]
    mat = bpy.data.materials.get("HM_Fog") or bpy.data.materials.new("HM_Fog")
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    for n in list(nodes):
        nodes.remove(n)
    pos = _new(nodes, "ShaderNodeNewGeometry").outputs["Position"]
    sep = _new(nodes, "ShaderNodeSeparateXYZ")
    links.new(pos, sep.inputs[0])
    z = _math(nodes, links, "MAXIMUM", sep.outputs[2], 0.0)
    fall = _math(nodes, links, "EXPONENT", _math(nodes, links, "DIVIDE", _math(nodes, links, "MULTIPLY", z, -1.0), float(f["height"])))
    dens = _math(nodes, links, "MULTIPLY", fall, float(f["density"]))
    # drifts: break the ground fog up with slow noise
    nz = _new(nodes, "ShaderNodeTexNoise")
    links.new(pos, nz.inputs["Vector"])
    nz.inputs["Scale"].default_value = 0.045
    nz.inputs["Detail"].default_value = 3.0
    drift = _smooth(nodes, links, nz.outputs[0], 0.30, 0.72)
    p = float(f["patchiness"])
    dens = _math(nodes, links, "MULTIPLY", dens, _math(nodes, links, "ADD", _math(nodes, links, "MULTIPLY", drift, 2.0 * p), 1.0 - p))
    # the bank lying on the mere: south of the lane, below `mere_top`
    rects = f.get("bank_box")
    if rects:  # added: fog.bank_box, the rectangles [x0, y0, x1, y1] the bank lies in, softened by bank_soft metres
        soft = float(f.get("bank_soft", 3.5))
        south = None
        for bx0, by0, bx1, by1 in rects:
            inx = _math(nodes, links, "MULTIPLY", _smooth(nodes, links, sep.outputs[0], bx0 - soft, bx0),
                        _math(nodes, links, "SUBTRACT", 1.0, _smooth(nodes, links, sep.outputs[0], bx1, bx1 + soft)))
            iny = _math(nodes, links, "MULTIPLY", _smooth(nodes, links, sep.outputs[1], by0 - soft, by0),
                        _math(nodes, links, "SUBTRACT", 1.0, _smooth(nodes, links, sep.outputs[1], by1, by1 + soft)))
            m = _math(nodes, links, "MULTIPLY", inx, iny)
            south = m if south is None else _math(nodes, links, "MAXIMUM", south, m)
    else:
        south = _smooth(nodes, links, _math(nodes, links, "MULTIPLY", sep.outputs[1], -1.0), 12.5 * TILE_M, 20.0 * TILE_M)
    low = _math(nodes, links, "SUBTRACT", 1.0, _smooth(nodes, links, sep.outputs[2], float(f["mere_top"]) - 1.5, float(f["mere_top"]) + 1.0))
    bank = _math(nodes, links, "MULTIPLY", _math(nodes, links, "MULTIPLY", south, low), float(f["mere_density"]))
    bank = _math(nodes, links, "MULTIPLY", bank, _math(nodes, links, "ADD", drift, 0.10))  # black water shows between the drifts
    total = _math(nodes, links, "ADD", dens, bank)
    vol = _new(nodes, "ShaderNodeVolumeScatter")
    vol.inputs["Color"].default_value = _c4(f["color"])
    vol.inputs["Anisotropy"].default_value = float(f["anisotropy"])
    links.new(total, vol.inputs["Density"])
    links.new(vol.outputs[0], _new(nodes, "ShaderNodeOutputMaterial").inputs["Volume"])
    if not ob.data.materials:
        ob.data.materials.append(mat)
    ob.hide_render = (f["density"] <= 0 and f["mere_density"] <= 0)


# ---------------------------------------------------------------- lights, ground, models


SELF_LIT = ("Frozen_Lantern_Post", "company_lamp_post", "drowned_lantern")  # the lamp sits inside the lantern mesh


def apply_lights(scene, lights: dict) -> None:
    for ob in scene.objects:
        if ob.get("wdi_model") in SELF_LIT:
            ob.visible_shadow = False
    for ob in scene.objects:
        kind = ob.get("wdi_light")
        if kind and kind in lights and ob.type == "LIGHT":
            q = lights[kind]
            energy = float(q["energy"]) * float(ob.get("wdi_gain", 1.0))  # added: a light's own gain (default 1)
            ob.data.energy = energy
            ob.data.color = q["color"][:3]
            if hasattr(ob.data, "shadow_soft_size"):  # added: area lights have no radius (their size is the build's)
                ob.data.shadow_soft_size = float(q["radius"])
            # added: a light's own volume gain wdi_vgain (default 1): a cave light whose glow in the mist read as a ball
            ob.data.volume_factor = float(q.get("volume", 1.0)) * float(ob.get("wdi_vgain", 1.0))
            ob.hide_render = energy <= 0
            # added: a per-kind "shadow" key (true / false / "keep" the build's own); without it, as before
            shadow = q.get("shadow", kind in ("lantern", "drowned", "headlamp"))
            if shadow != "keep":
                ob.data.use_shadow = bool(shadow)
    for kind, q in lights.items():
        mat = bpy.data.materials.get(f"HM_Bulb_{kind}")
        if mat and "Bulb" in mat.node_tree.nodes:
            em = mat.node_tree.nodes["Bulb"]
            em.inputs["Color"].default_value = _c4(q["color"])
            em.inputs["Strength"].default_value = float(q.get("bulb", 0.0))


def _set(mat_name: str, node: str, value) -> None:
    mat = bpy.data.materials.get(mat_name)
    if mat and node in mat.node_tree.nodes:
        out = mat.node_tree.nodes[node].outputs[0]
        out.default_value = _c4(value) if isinstance(value, (list, tuple)) else float(value)


def apply_ground(scene, s: dict) -> None:
    _set("HM_Ground", "P_snow_tint", s["tint"])
    _set("HM_Ground", "P_snow_shade", s["shade"])
    _set("HM_Ground", "P_snow_rough", s["roughness"])
    _set("HM_Ground", "P_cobble_rough", s["cobble_roughness"])
    _set("HM_Ground", "P_joint_snow", s["joint_snow"])


def apply_water(scene, w: dict) -> None:
    _set("HM_Mere", "P_water_rough", w["roughness"])


def apply_emissive(scene, e: dict) -> None:
    """Let warm, bright texels of the Meshy textures (painted lamp glass, lit windows) give off light."""
    strength, thr = float(e["strength"]), float(e["threshold"])
    allowed = set(e.get("models") or [])
    done = set()
    for ob in scene.objects:
        if ob.type != "MESH" or "wdi_model" not in ob:
            continue
        glow = strength if (not allowed or ob["wdi_model"] in allowed) else 0.0
        for slot in ob.material_slots:
            mat = slot.material
            if mat is None or mat.name in done or not mat.use_nodes:
                continue
            done.add(mat.name)
            nodes, links = mat.node_tree.nodes, mat.node_tree.links
            bsdf = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
            if bsdf is None or not bsdf.inputs["Base Color"].is_linked:
                continue
            if "WDI_emit" not in nodes:
                src = bsdf.inputs["Base Color"].links[0].from_socket
                sep = _new(nodes, "ShaderNodeSeparateXYZ")
                links.new(src, sep.inputs[0])
                warm = _smooth(nodes, links, _math(nodes, links, "SUBTRACT", sep.outputs[0], sep.outputs[2]), 0.30, 0.55)  # lamp glass, not cream paint or red trim
                lum = _math(nodes, links, "ADD", _math(nodes, links, "MULTIPLY", sep.outputs[0], 0.5), _math(nodes, links, "MULTIPLY", sep.outputs[1], 0.5))
                bright = _new(nodes, "ShaderNodeMapRange", interpolation_type="SMOOTHSTEP", clamp=True)
                bright.name = "WDI_emit_thr"
                links.new(lum, bright.inputs[0])
                bright.inputs[3].default_value, bright.inputs[4].default_value = 0.0, 1.0
                val = _new(nodes, "ShaderNodeMath", operation="MULTIPLY")
                val.name = "WDI_emit"
                links.new(_math(nodes, links, "MULTIPLY", warm, bright.outputs[0]), val.inputs[0])
                links.new(src, bsdf.inputs["Emission Color"])
                links.new(val.outputs[0], bsdf.inputs["Emission Strength"])
            nodes["WDI_emit"].inputs[1].default_value = glow
            nodes["WDI_emit_thr"].inputs[1].default_value = thr
            nodes["WDI_emit_thr"].inputs[2].default_value = min(1.0, thr + 0.25)


def apply_roof_snow(scene, s: dict) -> None:
    """Lay snow on the up-facing faces of the placed models (roofs, sills, decks, barrel tops); textures stay as they are."""
    amount = float(s.get("roof", 0.0))
    skip = set()
    for name in s.get("roof_skip", ["HM_Forest"]):  # added: the collections to skip (was HM_Forest only)
        coll = bpy.data.collections.get(name)
        if coll:
            skip |= set(coll.objects)
    done = set()
    for ob in scene.objects:
        if ob.type != "MESH" or "wdi_model" not in ob or ob in skip:
            continue
        for slot in ob.material_slots:
            mat = slot.material
            if mat is None or mat.name in done or not mat.use_nodes:
                continue
            done.add(mat.name)
            nodes, links = mat.node_tree.nodes, mat.node_tree.links
            bsdf = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
            if bsdf is None or not bsdf.inputs["Base Color"].is_linked:
                continue
            if "WDI_roof" not in nodes:
                src = bsdf.inputs["Base Color"].links[0].from_socket
                geo = _new(nodes, "ShaderNodeNewGeometry")
                sep = _new(nodes, "ShaderNodeSeparateXYZ")
                links.new(geo.outputs["Normal"], sep.inputs[0])
                up = _smooth(nodes, links, sep.outputs[2], 0.50, 0.82)
                nz = _new(nodes, "ShaderNodeTexNoise")
                links.new(geo.outputs["Position"], nz.inputs["Vector"])
                nz.inputs["Scale"].default_value = 0.9
                nz.inputs["Detail"].default_value = 4.0
                patch = _smooth(nodes, links, nz.outputs[0], 0.34, 0.58)
                amt = _new(nodes, "ShaderNodeMath", operation="MULTIPLY")
                amt.name = "WDI_roof"
                links.new(_math(nodes, links, "MULTIPLY", up, patch), amt.inputs[0])
                tint = _new(nodes, "ShaderNodeRGB")
                tint.name = "WDI_roof_tint"
                mixc = _new(nodes, "ShaderNodeMix", data_type="RGBA", blend_type="MIX")
                links.new(amt.outputs[0], mixc.inputs[0])
                links.new(src, mixc.inputs[6])
                links.new(tint.outputs[0], mixc.inputs[7])
                links.new(mixc.outputs[2], bsdf.inputs["Base Color"])
                rough = bsdf.inputs["Roughness"]
                mixr = _new(nodes, "ShaderNodeMix", data_type="FLOAT")
                links.new(amt.outputs[0], mixr.inputs[0])
                if rough.is_linked:
                    links.new(rough.links[0].from_socket, mixr.inputs[2])
                else:
                    mixr.inputs[2].default_value = rough.default_value
                mixr.inputs[3].default_value = 0.6
                links.new(mixr.outputs[0], rough)
            nodes["WDI_roof"].inputs[1].default_value = amount
            nodes["WDI_roof_tint"].outputs[0].default_value = _c4(s["tint"])


# ---------------------------------------------------------------- falling snow (geometry nodes, follows the camera)


def apply_snowfall(scene, s: dict) -> None:
    ob = bpy.data.objects.get("HM_Snowfall")
    if not s["on"]:
        if ob:
            ob.hide_render = True
        return
    if ob is None:
        me = bpy.data.meshes.new("HM_Snowfall")
        me.from_pydata([(0, 0, 0)], [], [])
        ob = bpy.data.objects.new("HM_Snowfall", me)
        scene.collection.objects.link(ob)
        ob.visible_shadow = False
    ob.hide_render = False
    mat = bpy.data.materials.get("HM_Flake") or bpy.data.materials.new("HM_Flake")
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (0.95, 0.97, 1.0, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.8
    bsdf.inputs["Emission Color"].default_value = (0.8, 0.88, 1.0, 1.0)
    bsdf.inputs["Emission Strength"].default_value = float(s.get("glow", 0.03))
    old = bpy.data.node_groups.get("HM_Snowfall")
    if old:
        bpy.data.node_groups.remove(old)
    t = bpy.data.node_groups.new("HM_Snowfall", "GeometryNodeTree")
    t.interface.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    n, l = t.nodes, t.links
    box_lo, box_hi = (-16.0, -16.0, -9.0), (16.0, 16.0, 11.0)  # deep enough below the lens that the high shots see snow falling on the town
    rnd = _new(n, "FunctionNodeRandomValue", data_type="FLOAT_VECTOR")
    rnd.inputs[0].default_value, rnd.inputs[1].default_value = box_lo, box_hi
    time = _new(n, "GeometryNodeInputSceneTime")
    fall = _new(n, "ShaderNodeVectorMath", operation="SCALE")
    fall.inputs[0].default_value = (float(s["wind"][0]), float(s["wind"][1]), -float(s["speed"]))
    l.new(time.outputs["Seconds"], fall.inputs[3])
    cam = _new(n, "GeometryNodeObjectInfo", transform_space="ORIGINAL")
    cam.name = "Camera"
    moved = _new(n, "ShaderNodeVectorMath", operation="ADD")
    l.new(rnd.outputs[0], moved.inputs[0])
    l.new(fall.outputs[0], moved.inputs[1])
    rel = _new(n, "ShaderNodeVectorMath", operation="SUBTRACT")
    l.new(moved.outputs[0], rel.inputs[0])
    l.new(cam.outputs["Location"], rel.inputs[1])
    wrap = _new(n, "ShaderNodeVectorMath", operation="WRAP")
    l.new(rel.outputs[0], wrap.inputs[0])
    wrap.inputs[1].default_value, wrap.inputs[2].default_value = box_hi, box_lo
    world = _new(n, "ShaderNodeVectorMath", operation="ADD")
    l.new(wrap.outputs[0], world.inputs[0])
    l.new(cam.outputs["Location"], world.inputs[1])
    pts = _new(n, "GeometryNodePoints")
    pts.inputs["Count"].default_value = int(s["count"])
    l.new(world.outputs[0], pts.inputs["Position"])
    ico = _new(n, "GeometryNodeMeshIcoSphere")
    ico.inputs["Radius"].default_value = float(s["radius"])
    ico.inputs["Subdivisions"].default_value = 1
    setm = _new(n, "GeometryNodeSetMaterial")
    l.new(ico.outputs[0], setm.inputs["Geometry"])
    setm.inputs["Material"].default_value = mat
    inst = _new(n, "GeometryNodeInstanceOnPoints")
    l.new(pts.outputs[0], inst.inputs["Points"])
    l.new(setm.outputs[0], inst.inputs["Instance"])
    # no flake within arm's reach of the lens: shrink them to nothing inside about 1 m
    near = _new(n, "ShaderNodeVectorMath", operation="LENGTH")
    l.new(wrap.outputs[0], near.inputs[0])
    grow = _new(n, "ShaderNodeMapRange", interpolation_type="SMOOTHSTEP", clamp=True)
    l.new(near.outputs["Value"], grow.inputs[0])
    grow.inputs[1].default_value, grow.inputs[2].default_value = 1.0, 2.6
    grow.inputs[3].default_value, grow.inputs[4].default_value = 0.0, 1.0
    # and none that pops in or out where the box wraps: shrink them to nothing over the last 2.5 m before every face
    from_lo = _new(n, "ShaderNodeVectorMath", operation="SUBTRACT")
    l.new(wrap.outputs[0], from_lo.inputs[0])
    from_lo.inputs[1].default_value = box_lo
    to_hi = _new(n, "ShaderNodeVectorMath", operation="SUBTRACT")
    to_hi.inputs[0].default_value = box_hi
    l.new(wrap.outputs[0], to_hi.inputs[1])
    margin = _new(n, "ShaderNodeVectorMath", operation="MINIMUM")
    l.new(from_lo.outputs[0], margin.inputs[0])
    l.new(to_hi.outputs[0], margin.inputs[1])
    axes = _new(n, "ShaderNodeSeparateXYZ")
    l.new(margin.outputs[0], axes.inputs[0])
    m_xy = _new(n, "ShaderNodeMath", operation="MINIMUM")
    l.new(axes.outputs[0], m_xy.inputs[0])
    l.new(axes.outputs[1], m_xy.inputs[1])
    m_xyz = _new(n, "ShaderNodeMath", operation="MINIMUM")
    l.new(m_xy.outputs[0], m_xyz.inputs[0])
    l.new(axes.outputs[2], m_xyz.inputs[1])
    edge = _new(n, "ShaderNodeMapRange", interpolation_type="SMOOTHSTEP", clamp=True)
    l.new(m_xyz.outputs[0], edge.inputs[0])
    edge.inputs[1].default_value, edge.inputs[2].default_value = 0.0, 2.5
    edge.inputs[3].default_value, edge.inputs[4].default_value = 0.0, 1.0
    size = _new(n, "ShaderNodeMath", operation="MULTIPLY")
    l.new(grow.outputs[0], size.inputs[0])
    l.new(edge.outputs[0], size.inputs[1])
    l.new(size.outputs[0], inst.inputs["Scale"])
    out = _new(n, "NodeGroupOutput")
    l.new(inst.outputs[0], out.inputs[0])
    mod = ob.modifiers.get("Snow") or ob.modifiers.new("Snow", "NODES")
    mod.node_group = t
    bind_snow_camera(scene)


def bind_snow_camera(scene) -> None:
    """The flakes are generated in a box around the active camera; call again after changing scene.camera."""
    t = bpy.data.node_groups.get("HM_Snowfall")
    if t and "Camera" in t.nodes and scene.camera is not None:
        t.nodes["Camera"].inputs["Object"].default_value = scene.camera


# ---------------------------------------------------------------- colour and post


def apply_color(scene, c: dict) -> None:
    vs = scene.view_settings
    vs.view_transform = c["view_transform"]
    try:
        vs.look = c["look"]
    except TypeError:
        vs.look = "None"
    vs.exposure = float(c["exposure"])
    vs.gamma = float(c["gamma"])


def apply_post(scene, p: dict) -> None:
    old = bpy.data.node_groups.get("HM_Post")
    if old:
        bpy.data.node_groups.remove(old)
    t = bpy.data.node_groups.new("HM_Post", "CompositorNodeTree")
    t.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    n, l = t.nodes, t.links
    rl = _new(n, "CompositorNodeRLayers")
    rl.scene = scene
    img = rl.outputs["Image"]
    if p["bloom"] > 0:
        gl = _new(n, "CompositorNodeGlare")
        gl.inputs["Type"].default_value = "Bloom"
        gl.inputs["Quality"].default_value = "High"
        gl.inputs["Threshold"].default_value = float(p["bloom_threshold"])
        gl.inputs["Strength"].default_value = float(p["bloom"])
        gl.inputs["Size"].default_value = float(p["bloom_size"])
        l.new(img, gl.inputs["Image"])
        img = gl.outputs["Image"]
    cb = _new(n, "CompositorNodeColorBalance")
    l.new(img, cb.inputs["Image"])
    for key, name in (("lift", "Lift"), ("gamma", "Gamma"), ("gain", "Gain")):
        sock = next(s for s in cb.inputs if s.name == name and s.type == "RGBA")
        sock.default_value = _c4(p[key])
    img = cb.outputs["Image"]
    hs = _new(n, "CompositorNodeHueSat")
    l.new(img, hs.inputs["Image"])
    hs.inputs["Saturation"].default_value = float(p["saturation"])
    img = hs.outputs["Image"]
    if p.get("ink"):  # added: post.ink, a scene-linear floor added last (node WDI_ink; a view's exposure scales it)
        ink = _new(n, "ShaderNodeMix", data_type="RGBA", blend_type="ADD", clamp_result=False)
        ink.name = "WDI_ink"
        ink.inputs[0].default_value = 1.0
        l.new(img, ink.inputs[6])
        ink.inputs[7].default_value = _c4(p["ink"])
        img = ink.outputs[2]
    out = _new(n, "NodeGroupOutput")
    l.new(img, out.inputs[0])
    scene.compositing_node_group = t
    scene.render.use_compositing = True


def apply_look(scene, look: dict) -> dict:
    q = merge(DEFAULT, look)
    apply_render(scene, q["render"])
    if q["sky"].get("on", True):
        apply_world(scene, q["sky"], q["moon"])
    else:
        apply_world_flat(scene, q["sky"])  # added: sky.on false
    apply_moon(scene, q["moon"])
    apply_fog(scene, q["fog"])
    apply_lights(scene, q["lights"])
    apply_ground(scene, q["snow"])
    apply_water(scene, q["water"])
    apply_emissive(scene, q["emissive"])
    apply_roof_snow(scene, q["snow"])
    apply_snowfall(scene, q["snowfall"])
    apply_color(scene, q["color"])
    apply_post(scene, q["post"])
    return q


# ---------------------------------------------------------------- still cameras


def ground_z(scene, x: float, y: float) -> float:
    g = bpy.data.objects.get("HM_Ground")
    if g is None:
        return 0.0
    ok, loc, _n, _i = g.ray_cast(Vector((x, y, 200.0)), Vector((0.0, 0.0, -1.0)))
    return loc.z if ok else 0.0


def view_options(name: str) -> dict:
    """added: a view's optional fourth element (views files): cut_z, hide, ground, show, exposure."""
    v = VIEWS[name]
    return dict(v[3]) if len(v) > 3 and isinstance(v[3], dict) else {}


def apply_view_options(scene, name: str):
    """added: for one still, cut the cave rock above `cut_z` (value nodes P_cut_z) and hide the named objects from the
    camera (their shadows stay; a fog or haze volume, tagged wdi_volume, is left out of the render); returns a
    function that undoes both."""
    opts = view_options(name)
    undo = []
    if "cut_z" in opts:
        for mat in bpy.data.materials:
            if mat.node_tree is not None and "P_cut_z" in mat.node_tree.nodes:
                out = mat.node_tree.nodes["P_cut_z"].outputs[0]
                undo.append((out, "default_value", out.default_value))
                out.default_value = float(opts["cut_z"])
    for obname in opts.get("hide", []):
        ob = bpy.data.objects.get(obname)
        if ob is None:
            print("VIEW", name, "hides no object", obname, flush=True)
        elif ob.get("wdi_volume"):
            undo.append((ob, "hide_render", ob.hide_render))
            ob.hide_render = True
        else:
            undo.append((ob, "visible_camera", ob.visible_camera))
            ob.visible_camera = False
    for obname in opts.get("show", []):  # added: objects the build leaves out of the render, shown for this still only
        ob = bpy.data.objects.get(obname)
        coll = bpy.data.collections.get(obname) if ob is None else None
        if coll is not None:  # added: or a whole collection (the caves' cutaway land, its dressing and its light)
            undo.append((coll, "hide_render", coll.hide_render))
            coll.hide_render = False
        elif ob is None:
            print("VIEW", name, "shows no object", obname, flush=True)
        else:
            undo.append((ob, "hide_render", ob.hide_render))
            ob.hide_render = False
    if opts.get("exposure"):  # added: stops added for this still; the post.ink floor is scaled so black stays on it
        ev = float(opts["exposure"])
        vs = scene.view_settings
        undo.append((vs, "exposure", vs.exposure))
        vs.exposure = vs.exposure + ev
        t = scene.compositing_node_group
        if t is not None and "WDI_ink" in t.nodes:
            sock = t.nodes["WDI_ink"].inputs[7]
            old = tuple(sock.default_value)
            undo.append((sock, "default_value", old))
            sock.default_value = (old[0] * 2.0 ** -ev, old[1] * 2.0 ** -ev, old[2] * 2.0 ** -ev, old[3])

    def restore():
        for target, attr, value in reversed(undo):
            setattr(target, attr, value)
    return restore


def still_camera(scene, name: str) -> bpy.types.Object:
    (ex, ey, eh), (tx, ty, tz), lens = VIEWS[name][:3]  # added: [:3], a views file may give a fourth (options) element
    x, y = tile_xy(ex, ey)
    lx, ly = tile_xy(tx, ty)
    cam = bpy.data.objects.get("HM_StillCam")
    if cam is None:
        cam = bpy.data.objects.new("HM_StillCam", bpy.data.cameras.new("HM_StillCam"))
        scene.collection.objects.link(cam)
    cam.data.lens = lens
    cam.data.clip_start, cam.data.clip_end = 0.08, 900.0
    # added: the rows below which an eye stands on the ground come from the scene (the wild builds write
    # wdi_ground_rows); the village keeps its 37 (south of that its heights are absolute); a view may say "ground"
    rows = float(scene.get("wdi_ground_rows", 37))
    on_ground = view_options(name).get("ground", eh < 25 and ey < rows)
    base = ground_z(scene, x, y) if on_ground else 0.0
    cam.location = (x, y, base + eh)
    cam.rotation_euler = (Vector((lx, ly, tz)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    bind_snow_camera(scene)
    return cam


def render_still(scene, path: str, res: int) -> None:
    r = scene.render
    r.resolution_x, r.resolution_y, r.resolution_percentage = res, int(res * 9 / 16), 100
    r.image_settings.media_type = "IMAGE"
    r.image_settings.file_format = "JPEG"
    r.image_settings.quality = 93
    r.filepath = os.path.abspath(path)
    bpy.ops.render.render(write_still=True)


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="meshy_village_look.py")
    p.add_argument("--blend", required=True)
    p.add_argument("--look", action="append", default=[])
    p.add_argument("--views", default=None, help="comma list (default: square,station,manor, or every view of --views-file)")
    p.add_argument("--views-file", help="added: a JSON of views {name: [[eye x, y, h], [target x, y, z], lens, {options}]} "
                                        "that replaces VIEWS (meshy_views/<scene>.json)")
    p.add_argument("--res", type=int, default=1280)
    p.add_argument("--samples", type=int)
    p.add_argument("--frame", type=int, default=1)
    p.add_argument("--out", default="tools/blender/build/look")
    a = p.parse_args(argv)
    if a.views_file:  # added: the views of another scene replace the village's
        with open(a.views_file, encoding="utf-8") as fh:
            loaded = json.load(fh)
        VIEWS.clear()
        VIEWS.update({k: v for k, v in loaded.items() if not k.startswith("_")})
    view_names = a.views or (",".join(VIEWS) if a.views_file else "square,station,manor")
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(a.blend))
    scene = bpy.context.scene
    scene.frame_set(a.frame)
    looks = a.look or [None]
    for path in looks:
        look = json.load(open(path)) if path else {}
        if a.samples:
            look.setdefault("render", {})["samples"] = a.samples
        q = apply_look(scene, look)
        name = look.get("name") or (os.path.splitext(os.path.basename(path))[0] if path else "default")
        for view in view_names.split(","):
            still_camera(scene, view)
            restore = apply_view_options(scene, view)  # added: cut_z / hide for this still only
            out = f"{a.out}_{name}_{view}.jpg"
            t0 = time.time()
            render_still(scene, out, a.res)
            restore()
            print("RENDERED", out, f"{time.time() - t0:.1f}s", flush=True)
    print("LOOKS_DONE", len(looks), flush=True)


if __name__ == "__main__":
    main()
