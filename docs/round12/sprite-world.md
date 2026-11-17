# The sprite world: the merged 2.5D look (A615)

Status: owner-approved look (2026-11-17), plan not yet scheduled. Nothing in the game changes until the pull
request that ships it also changes `GDD.md` 3.13 and `UI.md` (the rule for behaviour changes). It is the
"one look" A613 promised; the prototype that fixed it is described in section 6.

## 1. The look

A 3D scene drawn with flat art, seen from the old isometric pitch, with real depth.

| Part | Made of | Note |
|---|---|---|
| Camera | orthographic, fixed pitch (the isometric angle), heading snaps in 90 degree steps | the owner's answer: "90 degree snaps" |
| Characters | HD sprites, one set per figure, 8 directions, idle and walk | rendered from the character models; the figure's atlas direction is picked from the world facing minus the camera heading |
| Small objects | 8-bit sprites (the owner's pixel-art sheets, once their licences are recorded) | upright billboards that turn with the camera |
| Complex objects | 64 to 128 px sprites | 4 directions where the art is not rotation-safe (a table, a cart) |
| Ground, floors, water | tile planes textured with 2D art | rotate exactly |
| Walls, buildings | simple box geometry textured with 2D art | the walls nearest the camera drop to a sill |
| Light | one sun, point lights for lamps, real shadows, blob shadows for billboards | shadows and occlusion come from the scene |
| The map | rebuilt after the 3D models | the shapes, proportions and palette of the Blender-built map; the reading of "after the 3D models" is open (section 5) |

## 2. What it replaces

The three art styles (8-bit, low poly, HD) and the lobby's art-style pick, once the look ships (A613 (2)). The
two modes stay: 2.5D (this look) and 3D (first person, `apps/walk`). The server, wire, ids, facing and the world
frame do not change: the scene is built from the same scene graph (`packages/content/data/scenes/*.json`), and
an atlas `<dir>` stays a screen-frame word, now computed from the camera heading.

## 3. Constraints that bind the build

- **Engine.** Phaser is a 2D renderer. Real depth needs a 3D one; the plan is Three.js with an orthographic
  camera, the DOM overlay HUD unchanged. `ARCHITECTURE.md` 5.1 pins versions; adding Three.js to the client is
  a contract change and needs its own decision before the first PR.
- **Budgets.** `ASSETS.md` caps the site and the HD set (an 80 MB HD cap, A164). Every figure sprite set is a
  budget line (SPRITES 10.14); the figure cell is the open size question (128 or 256 px).
- **Visibility.** A rotating camera changes what a player sees behind a wall. The visibility and fog rules of
  `GDD.md` are server-side and unchanged, but the client must never draw what the server did not send; the
  wall cut-away is a draw rule, not a rule change.
- **Role secrecy.** A figure's look is its card's character (A49); nothing here adds a field.
- **Licences.** A sprite sheet ships only with a `CREDITS.md` row (`ASSETS.md` 6.5): licence, author, source.
  The five pixel-art sheets the owner supplied have none recorded yet.

## 4. Build steps

One branch and one session per step, pull requests under 400 lines, tests for every rules change.

| Step | What | Done when |
|---|---|---|
| S0 | Decision on adding Three.js to the client, version pin, size budget | the entry is in `DECISIONS.md` |
| S1 | Renderer spike behind a flag: the scene graph to a ground plane, boxes and billboards, orthographic camera, 90 degree snap | one village scene draws and snaps; the old renderer still ships |
| S2 | Figure sprites: render the HD set from the character models in 8 directions, idle and walk; the facing picker | the 38 figures with models draw and turn with the camera |
| S3 | Prop and tile art: sort the 609 pixel-art sprites against the prop lists; draw the missing; box-wall textures | every prop id of the scenes has a sprite or a named gap |
| S4 | Lighting and shadows, wall cut-away, depth of field | the look matches the prototype stills |
| S5 | The map revamp pass after the 3D models | per section 5 |
| S6 | Cut over: remove the three styles and the lobby pick, change `GDD.md` 3.13 and `UI.md`, delete the old atlases | the flag is gone and CI is green |

## 5. Owner answers and what is still open

Answered by the owner on 2026-11-17:

1. "Modeled after the 3D models": the map revamp is drawn after the Blender map of #539 (its shapes, proportions and
   palette); the character and item models are the scale and palette reference. Answer: yes.
2. Characters without a model (mallory, villagerlass): the owner said "make them". Their A-pose fronts exist; the two
   models are generated like the other eleven Higgsfield characters, once the credit cap allows (the quote is 38
   credits each).
3. The five pixel-art sheets (village props, tavern interior, the tier icons, the mixed icons, the icon grid) are the
   owner's own work ("they are mine"). Their `CREDITS.md` rows name the owner as the author; the licence follows the
   repo's rule for owner-made art (CC BY 4.0, `LICENSE-ASSETS`, A19) unless the owner states another.

Still open:

1. Figure cell size: 128 or 256 px (a budget line; the pipeline's HD figure cell is 256).
2. Whether the camera snap is animated or instant, and whether the HUD shows the heading.
3. The licence of the sheets if it is not CC BY 4.0 (for example CC0, or AI-generated, which A17 makes CC0).

## 6. The prototype

A scratchpad prototype fixed the look: one tavern room, a Three.js orthographic camera at the isometric pitch
with 90 degree heading snaps, upright billboards for props, textured boxes for walls, and eight-direction
character sprites that switch with the camera. It is not in the repo and is not a contract.
