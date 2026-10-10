# CLAUDE.md — Who Did It

## What this repo is

A browser multiplayer hidden-role game for 4 to 10 players: a static Phaser client on
GitHub Pages and an authoritative Colyseus server. V1 is top-down 2.5D with pre-rendered
Blender sprites; V2 is first-person 3D on the same server, rules and world data. It also
ships a short quick mode, One Night Ultimate Baguette (length in `GDD.md` 3.11).

Implementation started 2026-10-10 in four parallel sessions; `docs/SESSIONS.md` says which paths
each session owns. Until their PRs merge, `docs/` and the root scaffold are the whole project.

## Read first

- `docs/README.md` is the index. `docs/MASTER_PLAN.md` is the frozen v0.1 plan.
- `docs/GDD.md` and `packages/content/data/balance.json` are the only sources of rules
  and numbers. A behaviour change is not done until `GDD.md` changes in the same pull
  request. No other document restates a number; it references `GDD.md`.
- `docs/DECISIONS.md` logs every decision with the owner, the changes made during review,
  and the open questions. Resolve an open question there before building on it.
- `docs/SESSIONS.md` is the coordination contract between parallel sessions: read it before
  writing any file and stay inside your session's paths.
- `docs/ROADMAP.md` carries the milestones and the definition of done for each one. One
  branch and one session per milestone task, pull requests under 400 lines, tests for
  every rules change.

## Planned layout

```
apps/client/      Phaser + Vite client (base '/Who-Did-It/', hash routing), DOM overlay HUD
apps/server/      Colyseus server: PartyRoom, sim/{Step,Commands,Collision,Visibility,Portals}
packages/shared/  @wdi/shared: schema (builder style, no decorators), protocol, pure rules, constants
packages/content/ @wdi/content: roles, traits, items, abilities, clues, tasks, balance, scenes (JSON + zod)
tools/            grid exporter, sprite packer, Blender render rig and batch script, bot swarm
docs/             design, world, architecture, assets, roadmap, decisions, research
```

Versions are pinned in `docs/ARCHITECTURE.md` 5.1. Sessions never upgrade dependencies.

## Conventions that must not drift

- Role secrecy: a player's role, inventory, notebook and cooldowns live only in that
  player's private view. Nothing a client receives about another player may correlate
  with their role. Debug handlers register only with `WDI_DEBUG=1`.
- Every client action is queued and consumed inside the server `step()`; nothing mutates
  state in a message callback.
- Scene, portal, spawn and clue ids in `packages/content/data/scenes/*.json` are frozen;
  V2 reads the same graph.
- Atlas keys are `char/<body>/<anim>/<dir>` with non-role body ids; the direction table
  lives once in `@wdi/shared` (`dirFromVector`).
- Assets: CC0 by default, CC-BY only with a `CREDITS.md` row, never Synty, never raw
  Mixamo or Quaternius sources in the repo. See `docs/ASSETS.md` 6.5.

## Connection to the owner's ROSW repo (groot99-droid/Pipelines-Plugin)

- Art masters (`.ai`, `.aep`, `.psd`, character `.blend`, source `.glb`) live on the
  owner's laptop in the ROSW checkout under `studio/assets/who-did-it/<kind>/<slug>/`,
  which that repo git-ignores. Each made thing has a studio note in
  `studio/vault/who-did-it/<kind>/<slug>.md` written by the studio pipeline, never by hand.
  `assets/source/MANIFEST.md` in this repo mirrors every master's path, hash and date.
- Higgsfield generations are catalogued in ROSW `studio/library/catalog.json`; a
  `CREDITS.md` row for a generated asset cites that catalog id.
- `.claude/settings.json` registers the ROSW marketplace and enables its `ui-design`
  plugin (style catalog, contrast-checked design-system generator); see `docs/ASSETS.md`
  6.10. The `rosw` plugin itself (creative-writing and studio pipelines) only works from
  the ROSW checkout, so it is not enabled here.
- ROSW `writing-museum/` is a Three.js first-person viewer with doors, rooms, lights,
  touch and gamepad input; it is the candidate seed for the V2 renderer.

## Naming caution

"One Night Ultimate Baguette" is a parody of a published card game's title and stays an
in-joke for a free game among friends. If the game is ever sold, the mode ships under a
neutral label (see `docs/GDD.md` 3.11) and never reuses that game's text or art.
