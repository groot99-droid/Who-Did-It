# Round 6: the contract documents

What the fifteen round-6 sessions (6Z, then 6A to 6P) build against, written by 6Z before the others started and
edited to match the pre-seed it landed on top of a60d855 (DECISIONS A81). The rules and every number stay in
`docs/GDD.md` and `packages/content/data`: these documents point at them and never restate a rule differently.

| File | What it holds | Sessions |
|---|---|---|
| [owner-brief.md](owner-brief.md) | The owner's request and the Integrated Master World, System & Design Bible, verbatim; what the Bible names that the code does not have | all |
| [auto-admin.md](auto-admin.md) | The admin auto-mode: the sim clock and 10x, the all-NPC match, the headless harness and `pnpm auto`, the invariants, the multi-screen observer, the GitHub login, the admin wire | 6A, 6B, 6C, 6D |
| [cutscene-music.md](cutscene-music.md) | Opening and death cutscenes (data, wire, server, client), loading screens and transitions, the landing trailer, music playlists and the settings panel, the media budgets | 6J, 6K, 6L, 6N |
| [m5b-data.md](m5b-data.md) | M5b: resources and gathering, inventory and crafting, mobs and dark visibility, quests, main-mode mini-games; the content files, the schemas, the server modules, the client views | 6E, 6F, 6G, 6H, 6I, 6M |
| [bible-seams.md](bible-seams.md) | How the Bible's systems (vendettas, evolutions, law, economy, propagation, the three maps) are staged across rounds 6 to 9, and the empty seams round 6 leaves for them | 6B, 6E, 6H, 6J; rounds 7 to 9 |
| [media.md](media.md) | The owner's eleven uploaded audio files and their library ids, the ROSW sound-library route for every sound (stingers, beds, ambiences by catalog id), the mastering targets, the two `video-shot` videos and the provenance rows | 6L, 6N, 6K |
| [seams.md](seams.md) | Every pre-seeded hook with its file, owner, locked call site and stub body, and one producer -> consumer table for the round | all |

**Elsewhere.** The game rules are in `docs/GDD.md`: 3.14 to 3.16 (resources, mobs, quests and mini-games; 6E
writes them), 3.18 (cinematics and music) and 3.19 (admin auto-mode); the existing 3.3 (the match loop, which
gains the opening's seconds), 3.7 (vision) and 3.13 (maps and presentation, which gains the transition seconds).
The admin gate's operating text is `docs/ARCHITECTURE.md` 5.11 (6C). The media budgets are `docs/ASSETS.md` 6.8
(6K). The decisions are DECISIONS A81 (the owner's answers and this contract), with A82 to A96 reserved for the
sessions 6Z and 6A to 6P and A97 for the integration.

**Models and context.** Code and tooling run on Sonnet 5.5; the game-logic sessions 6A, 6B and 6G and the content
and art sessions 6E, 6M and 6N run on Opus 5.5; only 6Z, the contract and pre-seed, ran on Fable 5.1 (the owner's
rule: Sonnet for almost everything, Opus for planning and complex game logic, Fable for system redesign). Every
session compacts its context at 400k tokens through the repo's `.claude/settings.json` (`autoCompactWindow`) and
follows the "Compact instructions" section of `CLAUDE.md` when it does.

The patch files, scratch checks and the ffprobe output behind these documents stay with the orchestrator.
