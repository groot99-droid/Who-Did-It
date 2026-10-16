# (1) Villager turnaround sheet

**Slug** `villager-turnaround` · **Source** `docs/ASSETS.md` 6.4 prompt (1) · **Use** Characters (`ASSETS.md` 6.3): the hero concept every later prompt attaches, and the source views for the body mesh.

## Prompt

Subject, then the style suffix of `ASSETS.md` 6.4 byte for byte (the STYLE FORMULA; `style.json` freezes it):

```text
character model sheet of one Hollowmere villager, 1931 fog-bound harbour hamlet, wool trench coat over a plain grey vest, rolled sleeves, oversized hands, block boots, no scarf and no hat (those are separate overlays), A-pose, four views in one row: front, three-quarter, side, back, same figure and same pose in every view, even spacing, full body, feet on one ground line, stylized toon-noir, chunky low-poly 3-heads-tall proportions, flat two-tone cel shading, thick dark ink outlines, moody night lighting with warm lantern orange and cool moonlight blue, palette #12141C #2C3240 #6F7A8C #D9D2C2 #F2B33D #2EC4B6 #E04E9A, clean solid background, no text.
```

## Attach

- The hero concept (`assets/source/concepts/villager-hero-front.*` once it exists).
- The calibration cube render (`apps/client/public/assets/calibration/calibration_sheet.png`).
- On drift, restate "3-heads-tall" and "flat cel" in the subject.

## Tool and settings (`ASSETS.md` 6.9)

`character-sheet` workflow (`get_workflow_instructions` with `workflow: character-sheet`), then `generate_image`. Preset `3d-stylized` (or `game-concept`), composition **turnaround / model sheet**. Character-consistency mode with the hero concept attached once it exists. Aspect 16:9.

## Image to 3D

`generate_3d`, model `meshy_v7_image_to_3d` (fallback `image_to_3d`), on ONE cropped front view:

| Setting            | Value                                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `pose_mode`        | `a-pose`                                                                                                                     |
| `should_texture`   | `true`                                                                                                                       |
| `enable_pbr`       | `false`                                                                                                                      |
| `enable_rigging`   | `true` (humanoid)                                                                                                            |
| `enable_animation` | `true`, `animation_action_id` 0 (idle); walk 30 and run 16 as separate `3d_rigging` jobs on the result GLB, one clip per job |
| Budget             | ONE of `model_type: lowpoly` or `target_polycount` 5000-8000 (prefer the budgeted polycount for the body)                    |
| `texture_prompt`   | the STYLE TOKEN from `packages/content/data/style.json` (120 characters max)                                                 |

Merge single-clip GLBs with Higgsfield's `glb_merge_anims.py` or in Blender through NLA tracks. Then
decimate to 6k tris or fewer, flat-shade, run `tools/blender/palettize.py`, tag parts with `wdi_part`
and add the `Feet` empty (`tools/blender/README.md`). `multi_image_to_3d` only if 2-4 views share the
exact same pose.

## Notes

Crop the sheet to one figure per file before any 3D step: Meshy fuses every figure in a frame into one object. Keep the front view as `hero-front`.

## After generating

1. Save the master in the ROSW checkout under `studio/assets/who-did-it/<kind>/villager-turnaround/`, and add a
   row to `assets/source/MANIFEST.md` (path, SHA-256, date).
2. Sync the Higgsfield library (`higgsfield-library-sync`) so the generation lands in ROSW
   `studio/library/catalog.json`; cite that catalog id and the generation id in `CREDITS.md`.
3. Commit only exports; never a source GLB or a `.blend` with Mixamo actions.
4. Paid, watermark-free plan only (`DECISIONS.md` open question 5).
