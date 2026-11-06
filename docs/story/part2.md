# Story mode, part 2: the full story

Written 2026-11-06 from the owner's answers (`docs/story/questions.md`, DECISIONS A431). Part 1 (`README.md`) shipped four
single-role chapters (#463). Part 2 makes story mode the whole lore: every role has a part, each chapter is built around
what happens in the town, and the player moves between roles inside a chapter.

## What the owner asked for

1. **A full story mode, every role, the lore fully played out.** HollowMere first, then Port-au-Levain, then BlackPine.
2. **A chapter is a piece of the lore, not one role.** It is made of **sections**. Each section has a card, and a Killer
   section has a vendetta. The holy war is the model: a chapter plays the Vicar's side and then the Zealot's.
3. The stranger (the Thief) comes back into chapters 1 and 2.
4. Beats carry scripted NPC lines.
5. A failed chapter replays once. The story saves at each chapter break and resumes from the menu. A dedicated end screen
   shows the chapter summaries.
6. The Killer sections use the Killer card's own look.
7. Achievements are built now. Playtesting waits.

## Design changes this makes

| Area | Part 1 | Part 2 |
| --- | --- | --- |
| Chapter | One role, one vendetta | A list of `sections`; each names a card, a vendetta (Killer sections), a start trigger and an end trigger |
| Handover | At a chapter break only | At every section break; the card moves, the seat does not (A415) |
| Failure | The chapter ends failed, the story moves on | The chapter replays once from its start, then moves on |
| Save | None | A save at each chapter break: story id, next chapter, what the chapters handed on. Stored on the device (GDD 3.28) |
| Beats | A card of narration | Narration or NPC lines (speaker, text, portrait), from the scripted NPCs |
| Ending | Village win | An end screen: the chapter summaries and the achievements earned |
| Looks | A chapter `look` override | None in Killer sections: the Killer card's own look (A4) |

The data format changes once, in S1's schema, and the engine, client and tests follow it.

## Workstreams

Same rules as `README.md`: paths owned, draft PRs, 400-line PRs, tests for rules changes, an integration branch, no push
to the base. The integration branch for part 2 is `claude/story-part2`, cut from the base.

| ID | Owns | Model | Depends on |
| --- | --- | --- | --- |
| **P0. The arc** | `docs/story/arc.md`: the HollowMere story, act by act, from Bible Book I (`docs/round6/owner-brief.md`), `lore.json`, `quests.json`, `cutscenes.json`. Which card plays each section; where the Vicar and the Zealot sections fall; where each of the 19 cards appears; where the stranger comes back. Ends with its questions for the owner, each with a default | Opus | none |
| **P1. Schema v2 and content tooling** | `packages/content/src/schemas/story.ts`, `validateStory.ts`, `story.json` migrated to sections, the NPC-line action, the validator's checks that every card in `roles.json` has a section | Sonnet | P0's section shapes (can start on the shape in this file) |
| **P2. Engine** | `apps/server/src/sim/story/*`: sections and mid-chapter handover, replay-once, the save state, the Thief and Vicar deals so the stranger and both holy-war sides exist in a story room, NPC lines | Sonnet | P1 |
| **P3. Client** | `apps/client/src/ui/story/*`: resume from the menu, the save on the device, the NPC-line cards, the end screen with summaries and achievements | Sonnet | P1, P2's messages |
| **P4. Achievements (E1)** | `achievements.json`, step evaluation in `step()`, the device record, the private `achv` message, GDD 3.28 (`docs/round9/round10-plan.md`, E1). Round 10 made it depend on B6 (the Tribunal); B6a is merged and B6b to B6d are not, so P4 builds the steps that need no trial first and adds the trial steps when B6 lands | Sonnet | none for the first batch |
| **P5. Content, HollowMere** | `story.json` acts from P0's arc: sections, beats, lines. Split by act, one session per act once P0 is in | Sonnet | P0, P1 |
| **P6. Port-au-Levain and BlackPine plans** | `docs/story/towns.md`: for each town, the arc, the cards, the map and scenes it needs. BlackPine has scenes (`bp_*`); Port-au-Levain has no map, so its part is a map request first | Opus | P0's format |
| **P7. Tests and the bot** | `apps/server/test/story/*`, e2e, the story bot: sections, replay-once, save and resume, the end screen, the leak test for the new messages | Sonnet | P1 to P3 |

## Order

P0 and P4 start first. P1 starts on the shape in this file and merges first, because P2, P3, P5 and P7 read it. P2 and P3
start when P1's schema merges. P5 starts when P0 and P1 are both in. P6 runs beside everything and builds nothing.

## What it costs

P0 and P6 are design: a few hours each. P1 to P3 and P7 are the part-1 work again with larger scope: a day of session
time in parallel. P5 is the long one: the whole HollowMere lore as beats and lines, with a session per act. Port-au-Levain
and BlackPine do not build in this part; they are planned.

## Open questions

- **Q-P1. How many acts?** Default: let P0 decide from Book I, within three to five.
- **Q-P2. Does every card get a section, or only the playable ones?** Default: every one of the 19 cards appears as a
  section or as a named scripted NPC in a section.
- **Q-P3. Save slot.** Default: one slot per device.
- **Q-P4. Replay once.** Default: the replay restarts the chapter from its start with the chapter's saved state; a second
  failure moves on and the end screen counts it.
- **Q-P5. Port-au-Levain's map.** Default: P6 writes the map request; nothing builds until the owner approves it.
