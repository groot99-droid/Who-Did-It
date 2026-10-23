# Round 7: the contract documents

What the round-7 sessions (7A to 7K, 7P, and 6N and 6P finishing round 6) build against, written by 6Z on
2026-10-23 from the owner's requests of that morning and the staging in `docs/round6/bible-seams.md` 2.1. The
rules and every number stay in `docs/GDD.md` and `packages/content/data`: these documents point at them and
never restate a rule differently.

| File | What it holds | Sessions |
|---|---|---|
| [ui-reskin.md](ui-reskin.md) | The owner's two Claude Design mockups (menu, party lobby), the owner's three answers, the theme pieces every screen shares, the screen inventory with its owner, and what every re-skin keeps (ids, labels, copy, the theme gate) | 7B, 7C, 7E, 7F, 7G |
| [parties.md](parties.md) | Open and private parties, the party list, invites, the device profile, the friends list and Quit: wire, server, client, what the listing may never carry | 7C, 7D |
| [map-intros.md](map-intros.md) | The three intro tracks played whole, the longer cinematic openings that visit the rooms and the caves, the music class `opening` | 7A |
| [vendettas.md](vendettas.md) | The four killer vendettas, the Daily Train, the Vicar's memorial and the Ascended Vicar: data, bus events, server modules, invariants, the client's part | 7H, 7I |
| [quick-mode-removal.md](quick-mode-removal.md) | The owner's decisions of 13:05Z: the quick mode leaves the game (what stays, the inventory, 7J's three deletion PRs), and the four station pictures become rooms of Crumb's Ovens (7K); the ten kitchen pictures seed Port-au-Levain in round 8 | 7J, 7K |
| [seams.md](seams.md) | What a round-7 session learnt about a hook or a call site another may touch next: today the module evaluation order around `handlers/lobby.ts` and `sim/Npc.ts` | 7M |

**Elsewhere.** The rules are in `docs/GDD.md`: 3.20 "Vendettas" (7H writes it from the stub), 3.21 "Parties,
profiles and friends" (7D and 7C), the 3.3 and 3.18 lines the openings change (7A), the 3.3 Train line (7I).
The screens are `docs/UI.md`: 2 and 3 gain the night palette and the two new fonts, 6 the glass components,
14.25 to 14.29 the new copy (one subsection per session). The decisions are DECISIONS A103 (the re-skin, the
owner's answers), A104 (parties, profiles, friends, Quit) and A105 (this contract), with A101 (7A), A102 (6N)
and A106 to A114 reserved for the sessions and the integration; A115 (the quick mode's removal) and A116 (the bakery rooms) record the owner's decisions of 13:05Z, with A117 (7J) and A118 (7K) reserved.

**Models and context.** The owner's rule holds: Sonnet 5.5 for almost everything, Opus 5.5 for planning,
complex game logic, content and art (7A, 7B, 7H, 7I), Fable 5.1 for the orchestrator only. Every session
compacts at 400k tokens through `.claude/settings.json` and follows `CLAUDE.md` "Compact instructions".

**Round 6 while round 7 runs.** 6P finishes the round-6 integration (#73) and 6N trims the opening cinematic
and ships the landing loop (A102); both land on the same base. A round-7 session never edits a file 6P's PR
touches (`apps/server/test/**`, `docs/SESSIONS.md` round-6 log, DECISIONS A97).

The mockup exports (`.dc.html`, a React runtime inside) stay with the orchestrator as design references; their
screenshots are `docs/ui/menu-mockup-1280x720.png` and `docs/ui/lobby-mockup-1280x720.png`.
