# Who Did It — documentation

| File | What it owns |
|---|---|
| [MASTER_PLAN.md](MASTER_PLAN.md) | The full v0.1 master plan (frozen snapshot). Start here. |
| [GDD.md](GDD.md) | Game design: pillars, first ten minutes, roles, match loop, clues, items, PvE, stealth, meetings, balance, cut list, and the record of the removed quick mode (3.11). The only source of numbers together with `balance.json`. |
| [WORLD.md](WORLD.md) | World bible: Hollowmere, scene graph with ids and exits, overworld sketch, portal rules, bestiary, lighting. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Stack, monorepo layout, lobby and join codes, state schema and role secrecy, protocol, netcode, deployment, security, testing, V2 path. |
| [ASSETS.md](ASSETS.md) | Palette, Blender 8-direction rig, per-asset pipelines, Higgsfield tool map, Adobe usage, licensing policy, backlog, budgets. |
| [ROADMAP.md](ROADMAP.md) | Milestones M0-M7, parallel tracks, placeholder strategy, risk register, playtest plan, day 1-14 schedule, V2 outline. |
| [DECISIONS.md](DECISIONS.md) | Decisions locked with the owner, changes from review, open questions. |
| [PROTOCOL.md](PROTOCOL.md) | Generated wire protocol: message tables, payload types, error codes (`pnpm docs:protocol`). |
| [UI.md](UI.md) | DOM design system: palette roles, type and spacing scale, components, card frames, measured contrast, screen mockups, the M3 copy deck. |
| [guides/](guides/README.md) | Player manuals: how to play, the host guide and the admin guide. Served beside the game at `/help/`. |
| [PLAYTESTS/](PLAYTESTS/README.md) | How a playtest session runs, the feedback form, the fun-or-stop scorecard, the notes template and one entry per session. |
| [RESEARCH.md](RESEARCH.md) | Sourced facts behind the version pins, hosting choice and licensing rules. |
| [round5/](round5/README.md) | The round-5 contract documents: the owner's brief, the ONUB v2 contract, the deck wire and data, the world and maps, the NPC routines, the art plan, and the seams of the pre-seed (every hook and its locked call site). |
| [round6/](round6/README.md) | The round-6 contract documents: the owner's brief and the Bible, the admin auto-mode, cutscenes and music, M5b, the Bible's seams across rounds 7 to 9, the media brief, and the seams of the pre-seed. |
| [round7/](round7/README.md) | The round-7 contract documents: the whole-game re-skin to the owner's two mockups, open and private parties with profiles and friends, the map intro tracks and cinematic openings, and the vendettas, the Daily Train and the Vicar's memorial. |
| [round8/](round8/README.md) | The round-8 contract documents: bodies, coin, motion and art, the teardown answers, the living world, the canon, and the seams of the round. |
| [round9/](round9/README.md) | The round-9 design of world mode: the core loop, the full-screen phases, the logic table, the refusal reasons, the living world, emergent play, the owner's answers and follow-ups, the GDD map, the round-10 build plan and the admin Studio. |
| [round10/](round10/README.md) | The round-10 contract: the sessions that build world mode, their models and compaction sizes, and the seams they share. |
| [SESSIONS.md](SESSIONS.md) | The parallel build sessions, round by round: path ownership, branches, PR base, seams, briefs and the integration logs. |

Rule: a mechanic change updates `GDD.md` in the same pull request. Numbers never live in two documents.
