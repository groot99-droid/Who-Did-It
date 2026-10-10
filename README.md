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

Planning complete, implementation not started. Everything about the game lives in
[`docs/`](docs/README.md); start with [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md).

| Version | Rendering | Networking | Players | Art |
|---|---|---|---|---|
| **V1** (this repo first) | Top-down 2.5D in Phaser with pre-rendered 3D sprites from Blender | Static client on GitHub Pages, authoritative Colyseus server on a small host | 4-10 | Stylized toon-noir |
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

## Documents

- [Game design](docs/GDD.md), the only source of rules and numbers together with `balance.json`
- [World bible](docs/WORLD.md), Hollowmere and its 14 scenes
- [Architecture](docs/ARCHITECTURE.md), lobby codes, role secrecy, netcode, deployment
- [Asset pipeline](docs/ASSETS.md), Blender rig, Higgsfield, Adobe, licensing
- [Roadmap](docs/ROADMAP.md), milestones M0-M7 and the first 14 days
- [Decisions and open questions](docs/DECISIONS.md)
- [Research log](docs/RESEARCH.md)
