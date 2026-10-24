"""The material library (docs/round8/art.md 5, DECISIONS A144, A155): CC0 Poly Haven textures by role.

`roles.py` maps a material role (`wood_plank`, `plaster`, ...) to a locked slug, its texel density and the world
ramp it is toned toward; `polyhaven.lock.json` pins every file by md5; `fetch.py` fills the git-ignored cache
`tools/blender/.cache/materials/`; `nodes.py` builds the role's material for each art style (needs bpy).
"""
