# 11P P2: tiles and wall textures (brief, draft)

Status: **draft for the orchestrator**. Session 11P, branch `claude/r11-p-p2-brief`. This file is the P2 brief and the
proposed `seams.md` row. 11P does not edit `seams.md`; the orchestrator pastes section 6. The plan row is
`round11-plan-v2.md` 4.5: "P2. Tiles and wall textures: the ground tiles and the box-wall textures of HollowMere".
The build step is `docs/round12/sprite-world.md` S3. Merge order: `Q2 -- P1 -- P2 -- P3`; P2 is one of the five
merges (R1 to R4, F2, P2) that open the look gate G.

## 1. What P2 delivers

Flat 2D art for the two things R1 draws as geometry, and nothing else:

1. **Ground tiles.** One top-down tile texture per floor material of the scene `material` layer, for each ground
   theme. The legend is `FLOOR_MATERIALS` (g l m p d c f w r s ~ u =) plus `O` (deep water): **14 materials**. The
   themes are `harbour` and `timber` (`GROUND_ROLES` in `tools/blender/materials/roles.py`), so 28 tiles.
2. **Box-wall textures.** One texture per solid that R1 builds as a box: `W` wall and `X` cliff (the tile solids), and
   the building facades named by `buildings[].art` in the scenes (the `BldTex_*` roles). Roofs are a second texture
   per building where R1 draws a roof plane.

`P` (covered) is drawn by the building or prop on it, so it has no tile. `T` tree, `R` boulder, `F` fence and `K` stack
are upright objects: they are prop sprites (P3 and `props.md`), not P2 art. See Q-P5.

Out of scope: scene JSON, ids, server, wire, R1's code, prop sprites (P3), figures, the look gate itself.

## 2. Format (proposed, R1 must confirm)

- **Tile:** 64 x 64 px, PNG, four variants side by side in a 256 x 64 strip, the same strip layout as the six
  Phaser-path files in `apps/client/public/assets/tiles/`. R1 picks a variant by a hash of the tile coordinate, so a
  field of one material does not repeat in a visible pattern. Tiles are seamless on all four sides.
- **Edges:** P2 draws no edge art. R1 blends neighbours by `BLEND_RANK` (`packages/content/src/tilemap.ts`).
- **Water:** `O` and `~` are static in P2. An animated water is a gap named for R3 or later, not a P2 deliverable.
- **Wall:** a seamless 64 x 64 PNG per surface, tiled on the box faces by R1 (one repeat per world tile). One file,
  not four variants. The cut-away sill (R4) uses the same texture, so a wall needs no second art.
- **Finish:** pixel-art, the 8-bit finish of the sheets, a limited palette per theme so tiles and billboards share
  one look. Colour depth and palette are for G to sign off; P2 follows the sheets until G says otherwise.
- **Lighting:** tiles carry no baked light or shadow. R4's sun and lamps do it.

## 3. Sources, in order

1. The owner's pixel-art sheets, where a sheet already has the material (the sort of S3).
2. The Poly Haven materials the roles already name (`GROUND_ROLES`, `LEGACY_SURFACES`; locked in
   `tools/blender/materials/polyhaven.lock.json`, CC0), reduced to 64 px and quantised to the theme palette.
   Reuses the cached textures; no new fetch of a material the lock does not name.
3. A drawn tile, as a named gap, for anything neither gives.

A tile that is made from a source records the source in its manifest row. Licence rules are `docs/ASSETS.md` 6.5:
CC0 by default; a CC-BY row needs a `CREDITS.md` row; the owner's sheets are CC0, the owner's answer to Q-P6 (A619, `ASSETS.md` 6.5).

## 4. Where it lives

```
apps/client/public/assets/world3/tiles/<theme>/<material>.png      4-variant strips, 28 files
apps/client/public/assets/world3/walls/<surface>.png               seamless wall textures
apps/client/public/assets/world3/tiles/index.json                  the manifest R1 reads (below)
tools/world3/build_tiles.py                                        the generator, reproducible from the lock
apps/client/test/world3Tiles.test.ts                               the done test
```

`index.json` maps `{ theme, char }` to `{ file, variants, source, licence }` and lists each wall surface the same way,
so R1 never guesses a path. Names come from `FLOOR_MATERIALS` (`grass`, `litter`, `moss`, ...), never new ids.
Every file is added to `assets/source/MANIFEST.md` and, if it is not CC0, to `CREDITS.md`.

## 5. Done, and the tests

Done when every floor character of `FLOOR_MATERIALS`, `O`, and every wall surface the scenes use has a texture in
`index.json` **or a named gap**, for both themes. The test (mine, new) reads the 31 scenes' `material` layers and
`buildings[].art`, and fails if a character or surface used has neither a file nor a gap row; it checks each strip is
256 x 64, each wall is 64 x 64, and every listed file exists. Prettier clean; one concern per PR, under 400 lines
(PNGs are not counted). Split if needed: P2a ground tiles, P2b wall textures.

Not P2's: a sprite-world flag or loader (R1), light (R4), the look decision (G, owner).

## 6. Proposed `seams.md` row (for the orchestrator)

Section 1, replace the 11P row's Owns and Pull requests cells:

```
| **11P. Props and tiles** | `claude/r11-p-` | `docs/round11/props.md`, `docs/round11/tiles-brief.md`, `apps/client/public/assets/world3/tiles/**`, `apps/client/public/assets/world3/walls/**`, `tools/world3/build_tiles.py`, `apps/client/test/world3Tiles.test.ts` | P1 (merged), P2 (P2a, P2b) |
```

Section 2, shared files: `assets/source/MANIFEST.md` and `CREDITS.md` get appended rows from P2 (already the rule).
**Contract request to R1 (11R):** read `apps/client/public/assets/world3/tiles/index.json` for ground and wall
textures, and tell 11P whether 64 px tiles in 256 px strips and one wall texture per surface suit the renderer. Until R1
answers, 11P builds to section 2 and marks it _proposed_. 11P touches nothing under `apps/client/src/`.

## 7. Open questions (proposed defaults, owner or orchestrator)

- **Q-P5.** Are `T`, `R`, `F`, `K` prop sprites, not box textures? Proposed: yes, one billboard each, drawn in P3.
- **Q-P6.** What licence do the owner's pixel-art sheets carry, and may a tile derived from one ship? Proposed: the
  owner states it once; until then P2 uses Poly Haven (CC0) and drawn tiles only. **Answered (A619):** the sheets
  are the owner's own and CC0; a sheet-derived tile may ship.
- **Q-P7.** Tile size 64 px and one wall texture per surface (section 2). Proposed: yes; R1 may ask for 128 px walls.
- **Q-P8.** Is P2 one PR or P2a and P2b? Proposed: two, ground first, because the wall list depends on R1's boxes.
