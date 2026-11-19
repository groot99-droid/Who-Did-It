# Round 11 seams: who owns what (the sprite world, A616)

The build plan is `round11-plan-v2.md`. This file lists each session's paths and the files more than one session
touches. A session writes only inside its own paths. A change to a shared file is the smallest edit that its pull
request needs, merged before the next session's edit to the same file, and the session that owns the shared file
reviews it.

## 1. The first sessions (started 2026-11-19)

| Session | Branch prefix | Owns | Pull requests |
|---|---|---|---|
| **11D. Decisions** | `claude/r11-d-` | `docs/ARCHITECTURE.md` 5.1 (the Three.js row), `docs/ASSETS.md` 6 (the model locks and releases), `tools/blender/models/` (new: the lock format and its README) | S0, H1 |
| **11T. Tooling** | `claude/r11-t-` | `tools/blender/setup.sh` (new), `tools/blender/tests/bpy/` (new), `tools/blender/render_lock.py` (new), `assets/source/renders/` (new), `tools/sprites/test/renders.test.ts` (new), the `blender` job and the 25 MB step of `.github/workflows/ci.yml` | T1, T3, T4, T5 |
| **11P. Props and tiles** | `claude/r11-p-` | `docs/round11/props.md` (new: the prop list) | P1 |
| **11R. The renderer** (started 2026-11-19) | `claude/r11-r-` | `apps/client/src/world3/` (new), the `three` and `@types/three` entries of `apps/client/package.json` and their lockfile lines, the `?render=sprite` hook in `apps/client/src/flags/` and the World scene or boot that loads `world3/`, the R6 row of `docs/ASSETS.md` 6.8 | R1 to R6 |

Later sessions (11F, the gate, 11M, 11C, 11Z) get their rows here when the orchestrator starts them.

## 2. Shared files

| File | Owner | Who else may edit, and how |
|---|---|---|
| `docs/DECISIONS.md` | the orchestrator | a session appends its own row only when its brief says so (S0 does) |
| `docs/GDD.md` 3.13 | 11C | no one before C1; the renderer ships behind a flag |
| `.github/workflows/ci.yml` | 11T | others ask 11T through the orchestrator |
| `CREDITS.md`, `assets/source/MANIFEST.md` | the session whose drop adds the rows | rows are appended, never re-padded by hand; run prettier |
| `tools/blender/README.md` | 11T | 11D adds the models section |
| Other files under `apps/client/src/` (`view/assets.ts`, `input/`, ...) | the code's last owner | 11R makes the smallest edit its PR needs and names it in the PR description |
| `docs/SESSIONS.md`, `docs/README.md`, this file | the orchestrator | none |

## 3. What no session touches in round 11

- The server, the wire, the scene ids and the rules (`apps/server/**`, `packages/shared/src/protocol/**`,
  `packages/content/data/scenes/*.json`): the sprite world is client-side (`sprite-world.md` 2).
- `apps/walk/**` and the `tools/blender/meshy_*` files: the 3D lane (#547) owns them.
- Existing tests: no session edits a test it did not write without a grant recorded in its pull request.
