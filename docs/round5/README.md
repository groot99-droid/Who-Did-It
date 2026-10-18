# Round 5: the contract documents

What the thirteen round-5 sessions (5A to 5M) build against, written before they started and edited to match the
pre-seed that landed on top of 265bda9 (DECISIONS A50). The rules and every number stay in `docs/GDD.md` and
`packages/content/data`: these documents point at them and never restate a rule differently.

| File | What it holds | Sessions |
|---|---|---|
| [owner-brief.md](owner-brief.md) | The owner's request and ONUB spec, verbatim, and the itemised brief | all |
| [art-index.md](art-index.md) | The owner's 13 ONUB room images and which role or station each serves | 5M |
| [onub-contract.md](onub-contract.md) | ONUB v2: paths and locks, the shared schema, protocol and pure rules, the server and client seams, what is private and public per phase, the frozen test ids, copy ownership, the compile cut, the review amendment; appendix A, the content schemas | 5A to 5E |
| [deck-wire.md](deck-wire.md) | Public looks, avatars and handles, the cover pick, Impersonate, the night powers' wire, the privacy invariants and tests, the hooks, and each session's contract-phase removals | 5F, 5G |
| [deck-data.md](deck-data.md) | The content rows: roles, decks, abilities, items, balance, clues and the look catalogue `looks.json` | 5F, 5G, 5L |
| [world.md](world.md) | The scene and map schemas, `metrics.json`, the validator rules, the map files, the new scenes, `MapSites.ts`; appendix, the scene skeletons | 5J; 5H, 5I, 5K, 5L |
| [npc.md](npc.md) | NPC routines: `routines.json`, the `npc` balance rows, `AnimId.interact`, the random streams, the code shape (part 1); the tests (part 2) | 5H |
| [art-plan.md](art-plan.md) | Every asset, key, size and production route of the art sessions, the Higgsfield templates, the owner gates; appendix, the round-5 style (S1 to S5) | 5K, 5L, 5M |
| [seams.md](seams.md) | Every pre-seeded hook with its file, owner, locked call site and stub body, and one producer -> consumer table for the round | all |

**Elsewhere.** The game rules are in `docs/GDD.md`: 3.1 to 3.3 and 3.8, 3.9 (the deck, the night roles, the clock),
3.11 (ONUB v2), 3.12 (NPC fill and routines), 3.13 (maps and presentation) and 3.14 to 3.17 (resources, mobs,
quests, characters and disguise). The world bible is `docs/WORLD.md` 4.2 to 4.10. The projection contract (the
`@wdi/shared/iso` module, the tilemap the exporter writes, the manifest keys, the budgets) is `docs/SPRITES.md`
section 10. The decisions are DECISIONS A49 (the owner's answers), A50 (this contract) and A51 (bug #21), with A52 to A64
reserved for the sessions 5A to 5M and A65 for the integration.

**Names in code comments.** The pre-seed's code cites the design drafts by their working names; each maps to a file
here:

| Cited as | Read |
|---|---|
| `deck/wire.md` | `deck-wire.md` |
| `deck/data.md` | `deck-data.md` |
| `npc/data.md`, `npc/tests.md` | `npc.md`, parts 1 and 2 |
| "contract N", "round-5 contract N" (ONUB files) | `onub-contract.md` section N |
| `world/schemas.md`, `world/sketches.md` | `world.md` and its appendix |
| `world/iso.md` | `docs/SPRITES.md` section 10 |
| `art/plan.md`, `art/style.md` | `art-plan.md` and its appendix |
| `bugs.md` (bug numbers such as #21, #126) | the round-4 review's bug list; it stays with the orchestrator (DECISIONS A48, SESSIONS "Integration log, round 4") |

The patch files, scratch checks, study scripts and trial images behind these documents stay with the orchestrator.
