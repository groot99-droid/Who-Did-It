# Round 11: the full Blender makeover (planning, design only)

## Context

On 2026-10-29, while round 10 builds, the owner asked:

> how much longer till we are clear to start planning for round 11, and its full blender make over?

6Z answered that the pipeline half of the plan could start before round 10's content is final. The owner replied:

> The pipeline half of the plan doesn't depend on round 10's content: camera, lighting, materials, render passes and
> budgets. start planning sessions on it right after the playtest gate opens, which should be within the hour. The
> asset list would then be filled in at the content freeze.

Round 11 is planned the way round 9 was: design first, then a build plan the owner approves. It has three parts:

1. **This half, the pipeline.** Two sessions start when the playtest gate opens, after round 10's A13 merges
   (`docs/round10/README.md`, "The playtest gate").
2. **The asset list.** It is filled in at round 10's content freeze, when 10B, 10C and 10D have each opened their last
   pull request; 6Z announces it.
3. **`round11-plan.md`.** Written after the owner answers the questionnaire, as `docs/round9/round10-plan.md` was. The
   round builds after round 10's final sweep (10Z) has merged.

Until that plan is approved, nothing outside `docs/round11/` changes.

## What the makeover covers

Today every world asset class goes through one rig: ground, kit pieces, trees, buildings, props, characters and vertical
effects (`docs/ASSETS.md` 6.2, "What it renders"). The art still comes from several sources:

- the procedural builders in `tools/blender/` (`build_villager.py`, `build_props.py`, `build_buildings.py`,
  `build_tiles.py`, the kit importer and the materials in `tools/blender/materials/`);
- Higgsfield generations (ASSETS 6.4);
- round 10's greybox frames (the beds, the tools).

There are also three styles, 8-bit, low poly and HD (A164), chosen in the menu only (round 9).

"The full Blender makeover" is read as: every world asset made in Blender and rendered through one pipeline. The
planners confirm or narrow that, and say which classes stay where they are (the UI icons' SVG masters of SPRITES 9, the
card portraits, the screens), in the questionnaire below.

## The sessions

| Session | Model | Compaction | Spawned from | Writes | Starts |
|---|---|---|---|---|---|
| **11A. The render pipeline** | Opus | 800k | `claude/r10-tier-800k` | `docs/round11/pipeline.md`, `docs/round11/samples/pipeline/` | when the playtest gate opens |
| **11B. Materials, styles and budgets** | Opus | 800k | `claude/r10-tier-800k` | `docs/round11/look.md`, `docs/round11/samples/look/` | when the playtest gate opens |
| **The asset list** | 11B, or a session 6Z spawns | 800k | — | `docs/round11/assets.md` | at the content freeze |
| **The plan** | 11A, with 11B | 800k | — | `docs/round11/round11-plan.md` | when the owner has answered |
| **6Z** | — | — | — | this file, `docs/round11/questions.md` when it is sent to the owner, `docs/round11/owner-answers.md` | throughout |

Both are Opus, because each sets a contract the build will follow (the round-10 model rule). Both compact at 800k,
because each reads most of the art record: ASSETS 6, SPRITES 1 to 12, `docs/round5/art-plan.md`, `docs/round8/art.md`,
`docs/round8/motion.md`, `docs/round8/hd-look/`, `tools/blender/README.md` and the tools themselves.

### 11A. The render pipeline

- **Camera and scale.** The orthographic `IsoCam` and its 2:1 dimetric view (A49), the display scale, `iso.zScale`, the
  cells, the 112 px cap and `figureScale`, the pivots and the pixel finish (ASSETS 6.2 and 6.11, SPRITES 1 and 10.2 to
  10.7). The projection contract does not move: data, wire and facing stay in the world frame, and only the client
  presents isometrically (`CLAUDE.md`). Say what the makeover keeps, and what a change would cost the client and the
  atlases.
- **Lighting.** Today the key sun and moon fill are parented to the camera, with no cast shadows. Weigh what the renders
  bake (shadows, ambient occlusion, rim) against what the client lights at run time: the lighting layer of SPRITES 10.11,
  `apps/client/src/view/Lighting.ts`, the day parts and the lamps.
- **Render passes.** The body, scarf and blood passes (SPRITES 6), and any new pass the look needs (normals, depth,
  emissive for lamps, a shadow catcher). Give each pass's memory cost to 11B's budgets.
- **The tooling.** Cover `tools/blender/` and `tools/sprites/` (the finish, the packer, the manifests):
  - determinism, so unchanged pages stay byte-identical;
  - the tests each tool carries, and what CI checks;
  - how a re-render lands, in batched art-drop pull requests (ASSETS 6.6).
- **Where Blender runs.** Blender can run in a cloud session, or on the owner's laptop through Remote Control:
  - **In a cloud session.** From this environment, `pip` reaches `bpy` 5.2.x and download.blender.org answers. The rig
    names Blender 5.2 LTS. The environment's setup script can install it for every new session.
  - **On the owner's laptop.** This is the ROSW checkout and its studio pipeline. It keeps the masters, the studio notes
    and `assets/source/MANIFEST.md` (ASSETS 6.10).
  - **The owner's ROSW 3D asset pipeline.** The owner is building a 3D asset production pipeline in ROSW
    (`groot99-droid/Pipelines-Plugin`). Read it, and fit the plan to it where they meet.

### 11B. Materials, styles and budgets

- **Materials and the look.** The palette and `palettize.py` (ASSETS 6.1), `WDI_Toon` and its ramp, the PBR and HD
  materials of `tools/blender/materials/` (Poly Haven CC0, `polyhaven.lock.json`), textures and texel density. Start
  from round 8's HD look sheet (`docs/round8/hd-look/`). Say whether the three styles stay, merge or give way to one.
- **Characters.** The four-heads base of A161, the clips and frame counts (A161, `docs/round8/motion.md`), the overlay
  passes' look, the villager family and round 10's `constable`.
- **Budgets.** Each budget, what the makeover's look costs against it, and what gives when it does not fit:
  - the first load (12 MB, target 8);
  - the resident page cap (9);
  - the HD style's 80 MB and the site's 150 MB;
  - the frame rate on the test Android.

  The current figures and checks are in ASSETS 6.8, SPRITES 10.14, `tools/sprites/test/media.test.ts` and
  `budget.test.ts`.
- **V2.** The first-person renderer is to load the same sources as the sprite renders (ROADMAP, "After the V1 beta").
  Say what a model must carry so V2 reuses it: rig, LODs, material slots, scale.

## Rules for both sessions

- **Design only.** A session writes under `docs/round11/` and nowhere else. Nothing changes under `apps/`,
  `packages/`, `tools/` or `assets/`, or in any other document. GDD and DECISIONS are not edited: the plan's approval
  takes its DECISIONS row then. Round 10's sessions own everything else (`docs/round10/seams.md` 4).
- **A number lives once.** 11A owns the camera, the scale, the light directions and the list of passes. 11B owns the
  materials, the palette, the styles and the budgets. Each references the other's by section. The two talk directly
  through `send_message` (6Z gives each the other's session id), and a disagreement goes to 6Z.
- **Questions for the owner.** Each session ends its own document with a "Questions for the owner" section, each
  question with a proposed default (the form of round 9's questionnaire). When both drafts are in, 6Z assembles them
  into `docs/round11/questions.md` and sends it to the owner. A session in doubt takes its proposed default, marks it
  _proposed_ and carries on.
- **Sample renders.** These are allowed and encouraged: the owner chooses a look better from a sheet (round 8's HD look
  sheet).
  - A session may install Blender in its own container (`pip install bpy` at the rig's 5.2 version) and render with the
    repo's own rig, builders and looks.
  - Sheets go into `docs/round11/samples/<doc>/` as PNG, at most 5 MB per session.
  - Sources are CC0 or made in the repo only; never Synty, and never raw Mixamo or Quaternius files (ASSETS 6.5).
- **ROSW.** Read `groot99-droid/Pipelines-Plugin` (add it to the session read-only); never write to it.
- **Pull requests.**
  - One draft pull request per document, against `claude/zen-turing-m1jnw0`, from a branch `claude/r11-<id>-<slug>` cut
    from `origin/claude/zen-turing-m1jnw0`.
  - Docs only, and prettier clean.
  - When it is ready, write "Complete" at the top of its description and send 6Z one line with `send_message`.
  - 6Z merges.
- **Compaction.** Both sessions spawn from `claude/r10-tier-800k`, and the first action is the
  `.claude/settings.local.json` step of `docs/round10/README.md`, "Compaction" (800000).
- **The playtest.** The owner's playtest notes on how the game looks go to 11A and 11B as well as to 10X and 10Y.

## Status (2026-10-30)

- This contract (#339).
- The playtest gate opened when round 10's A13b merged (4a8e70f), and 11A and 11B started.
- 11A's `pipeline.md` (#346) and 11B's `look.md` (#347) are in. Their questions are merged in `questions.md`, sent to
  the owner on 2026-10-30.
- The owner answered on 2026-10-30 (`owner-answers.md`). Every default holds except CL3, which brings the buildings'
  long shadows into round 11. 11A writes `round11-plan.md` from the answers, with 11B.
- 11B's budget for the shadow layer (`look.md` 5.3.1, #371) and 11A's `round11-plan.md` (#374) merged on 2026-10-30.
  The plan waits on the owner's approval and on CL3a, which way the shadows fall (default: a sun at 25°, turned 45°).
- The owner approved the plan on 2026-10-30, with CL3a's default (A236, `owner-answers.md`). It builds after round
  10's final sweep (10Z) has merged. SC2, BU4 and RN3 keep their fallbacks until the owner answers them.
- On 2026-10-30 the owner made round 11 Blender only: "for me round 11 is blender only really, every gameplay feature
  (except bosses) should be added" (A256). Some gameplay items were left for round 11: recipe teaching, the
  one-per-match branch, tin mail, and the town work of the cards with no work. Round 10 builds them now, from
  `docs/round10/scope.md`. This plan is unchanged.
