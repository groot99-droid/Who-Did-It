# CLAUDE.md — Who Did It

## What this repo is

A browser multiplayer hidden-role game for 4 to 10 players: a static Phaser client on
GitHub Pages and an authoritative Colyseus server. V1 is isometric 2.5D (since round 5,
DECISIONS A49) with pre-rendered and generated sprites; V2 is first-person 3D on the same
server, rules and world data. It also ships a short quick mode, One Night Ultimate Baguette
(length in `GDD.md` 3.11).

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

- Role secrecy: a player's role card, inventory, notebook and cooldowns live only in that
  player's private view. In the main mode a seat's public look is its card's character
  (owner decision, 2026-10-17, DECISIONS A49), except for the cover roles, which wear another
  card's look: nothing a client receives may reveal that a seat wears a cover, a
  cover-wearer's true role, or who walks under an impersonation beyond what the drawn figure
  shows. In the quick mode nothing a client receives about another seat may correlate with
  its role. Nothing secret shares a random stream with anything public (`sim/seeds.ts`).
  Debug handlers register only with `WDI_DEBUG=1`.
- Every client action is queued and consumed inside the server `step()`; nothing mutates
  state in a message callback.
- Scene, portal, spawn and clue ids in `packages/content/data/scenes/*.json` are frozen;
  V2 reads the same graph. `SCENE_IDS` is append-only; a new map adds new ids with new
  prefixes and never renames or reuses one (GDD 3.13, WORLD 4.3).
- Atlas keys are `char/<lookId>/<anim>/<dir>` with the look ids of `looks.json` (plus
  `villager` for figures that are not seats); cover cards have no world character. Both modes
  present isometrically on the client only: data, wire and facing are world frame, an atlas
  `<dir>` is screen frame, and the direction table lives once in `@wdi/shared` (`dirFromVector`).
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
- Sounds come from ROSW `sound-library/` (the owner's own recordings and tracks: `catalog.json`
  versioned, the originals on that repo's GitHub Releases, fetched by id with the `sound-library`
  skill, never committed anywhere). A shipped sound's `CREDITS.md` and `MANIFEST.md` rows cite its
  catalog id; a library sound has no studio note (`docs/round6/media.md` 7).
- `.claude/settings.json` registers the ROSW marketplace and enables its `ui-design`
  plugin (style catalog, contrast-checked design-system generator); see `docs/ASSETS.md`
  6.10. The `rosw` plugin itself (creative-writing and studio pipelines) only works from
  the ROSW checkout, so it is not enabled here.
- ROSW `writing-museum/` is a Three.js first-person viewer with doors, rooms, lights,
  touch and gamepad input; it is the candidate seed for the V2 renderer.

## Compact instructions

Every session compacts its context at 400k tokens (`.claude/settings.json`, `autoCompactWindow`). When a
compaction summary is written for a session of `docs/SESSIONS.md`, it keeps, in this order: the session id
(for example 6F) and its branch; the PR split step it is on and which PRs are open, merged or unpushed; the
files it has edited since its last push; every contract request it has made in a PR description and whether
the orchestrator answered; the test command and its last result; and the sections of the contract documents
it still has to read. It drops tool output, file contents it can re-read, and anything a document already
says. A session that resumes after a compaction re-reads its brief and `docs/round<N>/seams.md` before the
next edit.

## Naming caution

"One Night Ultimate Baguette" is a parody of a published card game's title and stays an
in-joke for a free game among friends. If the game is ever sold, the mode ships under a
neutral label (see `docs/GDD.md` 3.11) and never reuses that game's text or art.
