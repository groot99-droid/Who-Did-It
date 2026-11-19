# Round 11, revised: building the sprite world (A615)

Status: **draft for the owner's approval** (Story mode orchestrator, 2026-11-19). When the owner approves it, it
replaces `round11-plan.md` (A236) as the round's build plan and takes its own `DECISIONS.md` row. Until then
nothing is built from it, and nothing outside `docs/` changes.

The approved plan of 2026-10-30 was written for three 2.5D styles (8-bit, low poly, HD) rendered through one Blender
rig. Three owner decisions have changed that since:

- **A613** (2026-11-16): two modes only, 2.5D and 3D; the three styles become one look.
- **A614** (2026-11-16): in 3D, each room is its own GLB, and the village is cut into sections joined by portals.
- **A615** (2026-11-17): the one look is a sprite world with depth (`docs/round12/sprite-world.md`): a Three.js scene
  of tile planes, textured boxes and upright billboards under an orthographic camera at the isometric pitch, heading
  snapping in 90 degree steps, with HD figure sprites at a 64 px cell in 8 directions.

This plan keeps what still serves that look, drops what served the three styles, and orders the work. The look, its
constraints and steps S0 to S6 are `sprite-world.md`'s; this document turns them into sessions and pull requests and
does not restate them.

## 1. What carries over from the approved plan

| Approved plan item | Now | Why |
|---|---|---|
| Rules for every PR (section 1) | **kept**, amended in section 2 | |
| T1. The `bpy` job and `tools/blender/setup.sh` | **kept** | the figure sprites are rendered in Blender (F1) |
| T2. The Kenney lock | **dropped** | walls and buildings become textured boxes; no kit meshes are rendered for the 2.5D mode |
| T3. The 25 MB art-drop warning | **kept** | art drops still land in batches (ASSETS 6.6) |
| T4, T5. Render locks, writer and check | **kept** | the figure drops are re-rendered as models change |
| L1, L2. The `emit` pass | **dropped** | lamps are point lights in the scene (sprite-world 1) |
| L3, L4. The long shadows (CL3, CL3a) | **dropped** | shadows are cast by the scene's sun (sprite-world 1); the sun's direction question returns as Q4 |
| M1, M2a to M2c. One material graph, roles | **dropped** | there is one look, and figures come from the character models, not the procedural builders |
| M3. The tone check | **kept**, retargeted | it checks the new figure and prop pages against the palette |
| M4. The finish constants per style | **dropped** | one style |
| M5. HD-1 and the HD caps | **replaced** by B1 | the budget is re-cut for one look |
| M6. The V2 export | **dropped** | the 3D mode's export is #547's (per-area GLBs, A614) |
| G. The look gate in every style | **replaced** by G | one scene in the new renderer, signed off before bulk drops |
| W, F, K. World, figure and code-drawn drops | **replaced** by F, P and M | |
| X1. The Meshy adapter | **kept as a question** (Q1) | |
| Z1. The final sweep | **kept** | |

The owner's 22 answers of `owner-answers.md` stay recorded. The ones about the three styles (ST1 to ST7, HD-1,
CL3, CL3a) are superseded by A613 and A615, and the final sweep says so in their rows.

## 2. Rules for every pull request

The approved plan's section 1 holds, with these changes:

- **The projection contract still holds.** Data, wire and facing stay in the world frame (CLAUDE.md). The camera
  heading is client state. An atlas `<dir>` stays a screen-frame word, now picked from the world facing minus the
  heading through `@wdi/shared` `dirFromVector`, and the table stays there.
- **The old renderer ships until C1.** Every renderer PR lands behind a client flag, and the Phaser path stays the
  default and green until the cut-over.
- **The client never draws what the server did not send.** The wall cut-away and the camera turn are draw rules
  (sprite-world 3).
- **Licences.** A model or sheet ships only with its `CREDITS.md` row. No Meshy-made asset ships until the owner
  answers Q1.
- **Models.** Opus for a PR that sets a contract (S0, R1, R2, F1, B1); Sonnet for one that follows a merged contract
  (the render drops, mechanical ports); Fable for the final sweep.

## 3. Sessions

| Session | Scope | Model | Compaction | Starts |
|---|---|---|---|---|
| **11D. Decisions** | S0 (Three.js in the client), H1 (where the models live) | Opus | 300k | first |
| **11T. Tooling** | T1, T3, T4, T5 | Sonnet | 300k | first |
| **11R. The renderer** | R1 to R6 | Opus for R1 and R2, Sonnet for the ports | 500k | after S0 |
| **11F. Figure sprites** | F1, then F2 to Fn | Opus for F1, Sonnet for the drops | 500k / 300k | after T1 and H1 |
| **11P. Props and tiles** | P1 to P3 | Sonnet | 300k | after Q2 is answered |
| **The look gate** | G | 11R | — | when R1 to R4, F2 and P2 have merged |
| **11M. The map** | M1, M2 | Opus | 800k | after G |
| **11C. Cut-over** | C1 | Opus | 500k | last before the sweep |
| **11Z. Final sweep** | Z1 | Fable | 800k | last |
| **3D lane** | per-area GLBs and the rooms (#547, A614) | the local Blender session | — | runs beside the round; shares only the prop models |
| **Orchestrator** | spawning, merges, the owner's questions | Opus | 300k | throughout |

Each session's paths go into `docs/SESSIONS.md` when the round opens, with a `docs/round11/seams.md` for the shared
files (`apps/client/src/view/assets.ts`, `docs/GDD.md` 3.13, `CREDITS.md`, `assets/source/MANIFEST.md`).

## 4. The pull requests

### 4.1 Decisions (11D)

| PR | What | Done when |
|---|---|---|
| **S0. Three.js in the client** | `docs/ARCHITECTURE.md` 5.1: `three` at `apps/walk`'s pin (0.186.1) for `apps/client` too; the client bundle's added size measured and budgeted; Phaser kept until C1 | the `DECISIONS.md` row is in |
| **H1. Where the models live** | the 40 character GLBs and the prop GLBs are too large for the repo (about 560 MB together). Proposed: a GitHub release of this repo per set (`char-models`, `prop-models`), as `walk-glb` holds the village, each file's hash pinned in a lock under `tools/blender/models/`; masters stay on the owner's laptop (CLAUDE.md) | the lock format and the release names are in ASSETS 6 |

### 4.2 Tooling (11T)

T1, T3, T4 and T5 as in the approved plan's section 4. T1 also installs the GLB importer the figure renders need,
and its smoke test renders one figure model in one direction.

### 4.3 The renderer (11R)

| PR | What | Tests |
|---|---|---|
| **R1. The scene** | `apps/client/src/world3/` (new): a scene of `SCENE_IDS` to ground tile planes, wall boxes and prop billboards from the same scene graph and statics the Phaser path reads; the flag `?render=sprite` | a scene builds with every portal, spawn and prop id placed; no id is read that the scene file does not have |
| **R2. The camera and input** | orthographic camera at the isometric pitch, heading snaps of 90 degrees, the keys to turn; movement keys turned from screen frame into world frame by the heading before they are queued (the server sees world-frame input, as today) | each heading maps each key to the right world vector; the wire is unchanged |
| **R3. Figures** | figure billboards from today's packed atlases (`char/<lookId>/<anim>/<dir>`); the direction from facing minus heading | for each heading and facing, the picked `<dir>`; covers and impersonation draw exactly as today |
| **R4. Light and cut-away** | one sun, point lights for lamps, shadow maps, blob shadows under billboards; the day parts of `dayPart.ts` drive them; walls nearest the camera drop to a sill | a lamp lights at night only; a near wall is cut at every heading |
| **R5. The rest of the views** | port of bodies, clues, mobs, nodes, givers, VFX, transitions and the cut-scenes to `world3/`, one PR a few views | each view's existing test runs against the new path |
| **R6. Performance** | frame time on the test phone (BU4), draw calls, the texture budget | the numbers recorded in ASSETS 6.8 |

### 4.4 Figure sprites (11F)

| PR | What | Tests |
|---|---|---|
| **F1. The figure rig** | `tools/blender/render_figures.py`: a character GLB to a 64 px cell, 8 directions, idle and walk, the existing pivots and keys, packed by `tools/sprites` | one model renders to the cell and pivot of today's atlas; determinism; a render lock written (T4) |
| **F2 to Fn. The drops** | groups of five figures a PR; the 13 Higgsfield figures first (mallory and villagerlass among them), then the 27 Meshy-rigged ones once Q1 is answered | the atlas has every key the client loads; the M3 tone check |

The models carry one clip each (a walk). An idle is taken from the walk's contact frame unless the owner asks for
a separate idle (Q3).

### 4.5 Props and tiles (11P)

| PR | What |
|---|---|
| **P1. The prop list** | every prop id of the scenes against the art that will draw it: the owner's pixel-art sheets, a render of a prop model, or a named gap. The 118 interior prop models and the gaps found on 2026-11-17 (bar counter, taps, barrel, bottle crate, keg rack, tavern table, tin crate; the rug to redo) go in it |
| **P2. Tiles and wall textures** | the ground tiles and the box-wall textures of HollowMere |
| **P3. The prop drops** | the props of each map, by the list of P1 |

### 4.6 The gate, the map, the cut-over and the sweep

- **G. The look gate.** One village scene and the tavern interior in the new renderer, at all four headings, day and
  night, with the new figures, sent to the owner as stills and a preview link. No bulk drop (F beyond F2, P3, M)
  starts until the owner signs it off.
- **M1, M2. The map revamp.** The 2.5D map redrawn after the Blender map of #539 (sprite-world 5.1), HollowMere first.
  New ids only where a new place is added (SCENE_IDS is append-only).
- **B1. The budget.** One look's caps: the first load, the resident pages, the site size, with the figure and prop
  pages counted; replaces the HD caps of the old M5.
- **C1. The cut-over** (sprite-world S6): the flag becomes the default, the three styles and the lobby pick go, the
  old atlases are deleted, `GDD.md` 3.13 and `UI.md` change in the same PR.
- **Z1. The sweep.** `DECISIONS.md` rows, the superseded answers marked, the cross-references, ROADMAP 7.0.

## 5. Merge order

```
S0 ── R1 ── R2 ── R3 ── R4 ── R5 ── R6
T1 ── T4 ── T5;  T3
T1, H1 ── F1 ── F2 (Higgsfield figures) ── F3..Fn (after Q1)
Q2 ── P1 ── P2 ── P3
R1-R4, F2, P2 ── G ── M1 ── M2
everything ── B1 ── C1 ── Z1
```

## 6. Questions for the owner

Each has a proposed default, used if the owner does not answer.

- **Q1. Meshy licence (SC2, open since 2026-10-30).** 27 of the 40 character models and the 118 interior props came
  from Meshy. The round-11 ruling of 2026-10-30 allowed Meshy for props, furniture and machinery only, never figures,
  and only once you confirm that Meshy's output on your plan is yours to ship. _Proposed:_ you confirm the licence,
  and Meshy figures are allowed too; until then only the 13 Higgsfield figures are rendered.
- **Q2. Where the props' art comes from.** Your pixel-art sheets (A615's "small objects 8-bit"), or renders of the
  prop models, which match the figures' light. _Proposed:_ small objects from your sheets, complex objects (64 to
  128 px) rendered from the models.
- **Q3. Idle.** The models have a walk only. _Proposed:_ the idle is the walk's standing frame with a slow breath;
  a separate idle clip only if the gate shows it is needed.
- **Q4. The sun.** Which way shadows fall now that the scene casts them. _Proposed:_ CL3a's direction (25 degrees, turned
  45 degrees from today's key) at the default heading, turning with the world.
- **Q5. The camera snap** (open in sprite-world 5). _Proposed:_ a quick animated turn (about a quarter second), and a
  small compass in the HUD.
- **Q6. The test phone (BU4) and the environment's setup script (RN3)**, both open since 2026-10-30. _Proposed:_ R6
  uses the phone you name; until then the render sessions install Blender with T1's script.

## 7. What it costs, roughly

- **Renderer:** the largest part. Every view of `apps/client/src/view/` that draws the world is ported (R1 to R5).
- **Figure renders:** 40 models, 8 directions, idle and walk, at 64 px, in one style. F1 measures the time a figure
  takes; the old plan's 9 hours covered two styles and the procedural figures.
- **Credits:** none planned. New models (the 7 missing props, the rug) are a separate ask.
