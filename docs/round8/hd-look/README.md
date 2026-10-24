# The HD look sheet (8I, DECISIONS A164)

The same figure, the same room and the same building in every style, for the owner's eye. One PNG per style and
subject, each under 1 MB, plus one contact sheet per subject with the styles side by side. Nothing here ships:
the shipped art is packed under `apps/client/public/assets/` by the PRs that follow.

## The columns

| Label | What it is | Rendered with |
|---|---|---|
| `8bit` | The 8-bit style (pixel finish on) with the A144 material library | `--textured` |
| `lowpoly` | The low-poly style (no finish, six-level posterise) with the library | `--style lowpoly --textured` |
| `hd` | HD toon at twice the display scale, flat ramps (A164) | `--style hd` |
| `hdtex` | HD toon at twice the display scale with the library's 2k maps as bump | `--style hd --textured` |
| `pbr` | The `docs/round8/art.md` 5 line as written: untoned PBR with an HDRI as fill. A rough, unshipped path (`tools/blender/materials/pbr.py`), rendered only for this sheet | `WDI_HD_PBR=1`, `--style hd --textured` |

## The files

| File | Subject |
|---|---|
| `figure-<label>.png` | The baker idling south, south-east and south-west at zoom 2 |
| `room-<label>.png` | HollowMere: the tavern whole at zoom 1 above, its door and front wall at zoom 2 below |
| `building-<label>.png` | BlackPine: the lodge whole at zoom 1 above, its middle at zoom 2 below |
| `contact-figure.png` | Every `figure-*` side by side, full size |
| `contact-room.png` | Every `room-*` side by side at half size |
| `contact-building.png` | Every `building-*` side by side at half size |
| `texture-strip.png` | Four roles of the library (wood plank, plaster, brick, stone wall), an eighth of one repeat at one texel per pixel: the 1k diffuse toned 0.45 toward its ramp as 8-bit and low poly read it, the untoned 2k the HD toon reads, and the untoned 4k of the `art.md` 5 line |

## How each cell was made

1. **Render** the subset every column needs, once per column, with the flags of the table above:
   `build_ground.py --themes harbour`, `build_kit.py --themes harbour --only wall,tree,boulder,fence,stack`,
   `build_props.py --atlases props,props_hollowmere`, `build_buildings.py --maps hollowmere --only tavern`,
   `build_buildings.py --maps blackpine --only lodge`, and the baker's `idle` body pass through
   `batch_render.py`. The HD columns render at `STYLE_FACTOR` (2) times the display scale.
2. **Pack** each column into an assets folder of its own. The 8-bit and low-poly columns go through today's
   pipeline (`tileset.ts`, `pixel.ts`, `slice.ts`, `pack-static.ts --subset`, `pack.ts`); the HD columns through
   `hd.ts` (`ground`, `static --subset`, `slice`, `char`), unhalved.
3. **Compose** with `tools/sprites/review-world.ts look <out> <label>=<assets>[:texels][:smooth]...`, which
   draws each subject from the packed atlases by the `SPRITES.md` 10.2 projection, the HD columns at
   `:2:smooth` (two texels per display pixel, linear filtering) and low poly at `:smooth`.
4. **Shrink** to PNG-8 (median cut, Floyd–Steinberg, 256 colours down to the first count under 1 MB) and
   paste the contact sheets. The per-column PNGs are the ones to judge by; the contact sheets are for a first
   glance.

## What to look at

- The figure: the HD columns keep the three toon bands of the 8-bit figure (A164) and add soft edges, a contact
  shadow and a rim in the lantern colour; `pbr` drops the bands.
- The room and the building: the HD columns keep every texture's own colour (`STYLE_TONE` is 0 for HD), so the
  tavern's slate roof reads blue-grey where the 8-bit and low-poly columns pull it toward the ramp.
- `hd` against `hdtex`: the same frame, flat ramps against the library's grain as bump.
