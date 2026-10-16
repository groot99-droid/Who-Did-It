# Who Did It — documentation

| File | What it owns |
|---|---|
| [MASTER_PLAN.md](MASTER_PLAN.md) | The full v0.1 master plan (frozen snapshot). Start here. |
| [GDD.md](GDD.md) | Game design: pillars, first ten minutes, roles, match loop, clues, items, PvE, stealth, meetings, balance, cut list, and the One Night Ultimate Baguette quick mode (3.11). The only source of numbers together with `balance.json`. |
| [WORLD.md](WORLD.md) | World bible: Hollowmere, scene graph with ids and exits, overworld sketch, portal rules, bestiary, lighting. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Stack, monorepo layout, lobby and join codes, state schema and role secrecy, protocol, netcode, deployment, security, testing, V2 path. |
| [ASSETS.md](ASSETS.md) | Palette, Blender 8-direction rig, per-asset pipelines, Higgsfield tool map, Adobe usage, licensing policy, backlog, budgets. |
| [ROADMAP.md](ROADMAP.md) | Milestones M0-M7, parallel tracks, placeholder strategy, risk register, playtest plan, day 1-14 schedule, V2 outline. |
| [DECISIONS.md](DECISIONS.md) | Decisions locked with the owner, changes from review, open questions. |
| [PROTOCOL.md](PROTOCOL.md) | Generated wire protocol: message tables, payload types, error codes (`pnpm docs:protocol`). |
| [UI.md](UI.md) | DOM design system: palette roles, type and spacing scale, components, card frames, measured contrast, screen mockups, the M3 copy deck. |
| [PLAYTESTS/](PLAYTESTS/README.md) | How a playtest session runs, the feedback form, the fun-or-stop scorecard, the notes template and one entry per session. |
| [RESEARCH.md](RESEARCH.md) | Sourced facts behind the version pins, hosting choice and licensing rules. |
| [SESSIONS.md](SESSIONS.md) | The parallel build sessions, round by round: path ownership, branches, PR base, seams, briefs and the integration logs. |

Rule: a mechanic change updates `GDD.md` in the same pull request. Numbers never live in two documents.
