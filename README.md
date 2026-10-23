# Who Did It

A browser multiplayer hidden-role game for 4 to 10 players, played from a link.
Open the page, **Create Party** or **Join Party** with a 5-character code, press Start, and
each player receives a secret role card. Then the village of Hollowmere opens up: enter houses,
climb to lofts, slip into the forest and the cave, find bodies, collect clues, and vote on who
did it before the Cabal reaches parity.

It crosses Among Us (tasks, bodies, emergency meetings), Mafia / Werewolf (hidden factions and
a vote as the climax), a whodunit (physical clues with hidden traits and a Detective who verifies
them) and Hello Neighbor (enterable houses, locked doors, hiding spots, wolves in the woods).

## Status

**Playable now:** [https://groot99-droid.github.io/Who-Did-It/](https://groot99-droid.github.io/Who-Did-It/),
served from GitHub Pages against the Railway server. The player manuals are in
[`docs/guides/`](docs/guides/README.md) and beside the game at
[`/Who-Did-It/help/`](https://groot99-droid.github.io/Who-Did-It/help/). Rounds 1 to 5 of the roadmap are merged
and round 6 (gathering and crafting, creatures, quests, cutscenes, music, the admin auto-mode) is landing;
`docs/ROADMAP.md` carries the milestones. Everything about the design lives in [`docs/`](docs/README.md).

| Version | Rendering | Networking | Players | Art |
|---|---|---|---|---|
| **V1** (this repo first) | Top-down 2.5D in Phaser 4 with pre-rendered 3D sprites from Blender | Static client on GitHub Pages, authoritative Colyseus server (Render Free, then Railway) | 4-10 | Stylized toon-noir |
| **V2** (later) | First-person 3D in the browser, same server, rules and world data | same | 4-10 | same |

## Planned layout

```
apps/client/      Phaser + Vite client, deployed to GitHub Pages
apps/server/      Colyseus authoritative game server
packages/shared/  schema, protocol, pure rules engine, constants
packages/content/ roles, traits, items, clues, tasks, balance and scene data (JSON)
tools/            Blender render rig and batch script, sprite packer, grid exporter, bot swarm
docs/             game design, world bible, architecture, asset pipeline, roadmap, decisions
```

## Related repo

Art masters, studio notes and the Higgsfield generations library live in the owner's ROSW repo,
[Pipelines-Plugin](https://github.com/groot99-droid/Pipelines-Plugin); see `docs/ASSETS.md` 6.10.
This repo's `.claude/settings.json` registers that marketplace and enables its `ui-design` plugin.

## Owner-only admin page (Railway variables)

The server can serve an admin room, where the owner watches an all-NPC match at up to 10x, signed in with GitHub. It is
off unless every variable below is set on the server host (Railway: the service's Variables tab); the values are never
written into this repo. There is no password: GitHub identifies the owner and the login allowlist decides.

| Variable | Value |
|---|---|
| `WDI_ADMIN` | `1` |
| `WDI_ADMIN_GITHUB_CLIENT_ID`, `WDI_ADMIN_GITHUB_CLIENT_SECRET` | from a GitHub OAuth app whose callback URL is `https://<railway host>/auth/github/callback` |
| `WDI_ADMIN_GITHUB_LOGINS` | the allowed GitHub login, `groot99-droid` (comma-separated for more) |
| `WDI_ADMIN_SECRET` | `openssl rand -base64 32`, run on your own machine |
| `WDI_ADMIN_CLIENT_URL` | `https://groot99-droid.github.io/Who-Did-It/` |

Unset any one of them and the room and both routes disappear. Details: [Architecture 5.11](docs/ARCHITECTURE.md).

## Documents

- [Game design](docs/GDD.md), the only source of rules and numbers together with `balance.json`
- [World bible](docs/WORLD.md), Hollowmere and its 14 scenes
- [Architecture](docs/ARCHITECTURE.md), lobby codes, role secrecy, netcode, deployment
- [Asset pipeline](docs/ASSETS.md), Blender rig, Higgsfield, Adobe, licensing
- [Roadmap](docs/ROADMAP.md), milestones M0-M7 and the first 14 days
- [Decisions and open questions](docs/DECISIONS.md)
- [Research log](docs/RESEARCH.md)
