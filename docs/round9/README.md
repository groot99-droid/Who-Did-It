# Round 9: the world-mode design round (design only, no code)

## Context

The owner played the round-8 build and set a new direction: world mode. The brief is recorded verbatim in `docs/round9/owner-brief.md` (DECISIONS A222, draft PR #264).

The game stops being a quick round built around killing and voting. It becomes a world where:
- every lore role is dealt;
- killers win through their vendettas, and townsfolk win on their own conditions;
- voting is gone, replaced by full-screen phases;
- every object has a purpose, governed by a logic table;
- NPCs live, talk and give tasks, and players can find their own way to play.

The owner chose **design only**: the full round-9 design is written and approved before anything is built.

## Decisions so far

From the brief, plus today's answers:

- **Dealing:**
  - Every lore role is dealt every match.
  - With 1 player it is story mode: fixed actions that the player plays through and triggers.
  - In multiplayer a human always holds the Killer.
  - A role's required partner must also be human (a Zealot needs a human Vicar). So the Zealot, Activist and Bandit need at least 3 players, and the Hitman needs more.
  - NPCs fill every other role.
- **Stopping the Killer:** all three routes are valid:
  - evidence and arrest;
  - finishing role goals;
  - an end-of-match trial decided by evidence.

  Whoever stops the Killer earns that route's kind of victory. Nobody votes anyone out.
- **Disguises:**
  - The Killer chooses which NPC role to fill, wears that character's look, and has to live as a villager.
  - The Bandit is the exception and wears its own skin, being fundamentally different.
  - A Killer sees their own true look on their own screen, while everyone else sees the disguise.
- **Survival and pacing:**
  - A day lasts 8 minutes (480 s, up from 120 s) and a night 5 minutes (300 s, up from 100 s).
  - Gameplay stays as it was, just stretched. Every other timer scales to match: cooldowns, task counts, wages, mob spawns, the Final Night and so on.
  - Hostile mobs do less damage.
  - Bleeding and other effects shouldn't kill people, or should only very rarely. In the design: effects stop at 1 health (down and Wounded rather than dead), and only a Killer's strike or a creature's bite kills. The doc confirms the exact rule with the owner.
- **The train brings back the dead:** anyone who died during the day returns the next morning on the train. This replaces permanent death for daytime deaths. It changes how ghosts, bodies, the Vicar's martyr rule and every win count work, so the doc spells out what a returning player keeps and loses.
- **The art style (8-bit, low-poly or HD) is chosen only in the menu:** the in-game switch is removed, because switching mid-match breaks things. The style is fixed for the whole match.
- **Failure messages:**
  - The generic "can't do that" goes away.
  - Features that aren't built yet say "NFY".
  - A locked action explains, in the world's voice, what's missing ("Failed to pick the lock. Looks like you might need a lock pick").
- **Still open:** what "function with the killer" means: should a match run with no Killer at all, or does it mean the engine allows an NPC Killer? This goes into the questionnaire.

## What the code does today (from the read-only survey)

- **The deal:**
  - The deck holds the player count plus 2 cards, and the 2 extra are left undealt so cover roles can wear one (`packages/shared/src/rules/deck.ts:19,50`).
  - The deal is fully random, and an NPC can be the Killer (`apps/server/src/sim/Deck.ts:40`).
  - Every seat count is clamped to 4–10 in about 8 places (`Flow.ts:103`, `vendettas/state.ts:27`, `Tasks.ts:48` and others).
  - No role has a `partner` field. The only pairing is `vendettas.json` `zealot.needsCard: "vicar"`.
- **Vendettas** (`sim/vendettas/*`):
  - Each fires one consequence and is never a win path.
  - The Zealot's consequence works through voting (`Meeting.ts:117,135,149`).
- **Voting** decides the Final Night trial (`FinalNight.ts:50`), the Drifter's win and the Gamekeeper's shot, and the AI votes in `sim/npc/meeting.ts`. The meeting screen is a centred grid that doesn't fill the screen (`ui/styles.css:47-55`).
- **Props:**
  - Of 605 props, 516 (85%) are `dressing` or `decor`.
  - Chests are fixed in JSON, and the one working chest kind is never read (`MapSites.ts:95`).
  - The 65 resource nodes are separate from the props.
  - The only tool check is Tin Ore needing a Spade (`Resources.ts:158`).
  - There is no axe, pickaxe or armour, and no locked door can be opened (`Portals.ts:180`).
- **Refusals:**
  - There are 7 numeric codes and about 90 free-text messages.
  - The client throws the server's text away and shows "That did not work" (`apps/client/src/scenes/World.ts:761-770`).
  - Unbuilt verbs fall back to "cannot do that" (`Actions.ts:78`, `Hold.ts:84`).
- **What's missing:**
  - Mobs do 25, 18, 6 and 5 damage against 100 health, and there are no bosses.
  - There are no achievements or progression of any kind.
  - Only 5 fixed NPCs give quests, and walking townsfolk give nothing.
  - Story mode can build on the auto-mode harness (`sim/auto/Auto.ts`), which runs seeded matches with one seat taken by a human.

## Deliverables

All under `docs/round9/`, each a draft PR. These are docs only; `GDD.md` changes come last.

1. **`world-mode.md`: the core loop.**
   - The deal table: every lore role, where its required partners must be human, and the minimum players for each vendetta.
   - Story mode for 1 player.
   - Each role's win conditions.
   - The three ways to stop the Killer and the victory each one earns.
   - Disguises: the Killer picks an NPC role to live as; the Bandit wears its own skin; how the Killer's own screen shows their real look.
   - What replaces each thing voting does today: the trial, the Zealot's effect, the Drifter's win and the Gamekeeper's shot.
   - The train respawn: who comes back, what they keep, and how it interacts with bodies, ghosts, clues and wins.
   - A pacing table: every `balance.json` timer and count, old value against new, scaled to the 480 s day and 300 s night.
   - Effects that don't kill: bleeding, poison and other effects stop at 1 health, which reworks GDD 3.22.
   - The art-style lock: style is chosen in the menu only, and the in-game switch is removed (`apps/client` style switching, round-8 A164).
2. **`phases.md`: the full-screen phases.**
   - Which pauses exist (meetings, the trial, dawn, the Final Night).
   - What each screen shows, with its timings.
   - A mock-up list for 8H to build later.
3. **`logic-table.md`, plus a proposed `packages/content/data/interactions.json` schema.**
   - Tool × object gives a verb, a result and a failure line.
   - An audit of all 605 props: keep each as decoration, turn it into something usable (lumber needs an axe, boulders a pickaxe), or make it a container.
   - Rules for where chests go and what loot they hold.
   - New items: an axe, a pickaxe, armour, and weapons with their own damage.
   - This builds on `routines.json` `holds`, `resources.json` `tool`, `items.json` `use` and `recipes.json`.
4. **`failures.md`: the refusal reasons.**
   - A list of reasons that replaces the 90 free-text messages.
   - When a refusal says NFY and when it gets an in-world line.
   - The client fix in `World.ts:761`, so the server's text reaches the player.
5. **`living-world.md`: the rest of the world.**
   - NPCs that walk, chat and give tasks.
   - How Scrip, Faith, mini-games, lore, discovery, mob bosses and chores feed each other.
   - Branching step-by-step achievements, and where they're stored (on the device, since the server keeps nothing).
   - Gear tiers.
   - Pacing numbers: day length and mob damage.
6. **`emergent-play.md`: playing your own way.** It traces the owner's rogue example through the logic table. He gathers food instead of buying bread, crafts lock picks and dodges tax. It shows every way the table lets him do it.
7. **`gdd-map.md` and the round-10 build plan.**
   - Which GDD sections change: 3.1–3.3, 3.8, 3.9, 3.12, 3.14, 3.15, 3.20, 3.22–3.25 and others.
   - The order the build PRs merge in, with a test plan for each.
   - Then one final PR that updates `GDD.md` and DECISIONS once the owner approves.

## Who does it

- **9A, world mode and phases (Opus).** This needs the most judgement, and the Opus limit resets Thursday at 16:00 UTC.
- **9B, the logic table and failure messages (Sonnet).** A census of every prop and refusal, and the schema.
- **9C, the living world and emergent play (Sonnet).**
- **6Z (me):** keeps the questionnaire, checks each doc against the 11 parts of the brief, and handles merging.

Each session uses the `udgt-consult` skill on ROSW teardowns to explain why things are the way they are, and reads the lore through `docs/round8/canon.md`.

## Review loop with the owner

- One questionnaire artifact (the same pattern as round 8, with answers saved in its database) collects every open question across the 7 docs, starting with the "function with the killer" question.
- The owner answers there, and their answers are folded into the docs.
- The final `GDD.md` PR merges only after the owner approves.
- During design, the live game keeps the round-8 build. No code changes, so nothing risks next weekend's playtest.

## Checks

- Every doc passes `npx prettier --check docs/round9`, and the content tests still pass, since docs-only changes shouldn't touch them.
- A coverage table in `docs/round9/README.md` maps each of the brief's 11 parts and each answer above to the doc section that handles it. I check that nothing is left uncovered.
- The prop audit in the logic table is produced by a script and repeatable: a count of props per kind from `packages/content/data/scenes/*.json` that adds up to 605.
- The owner approves the docs in the questionnaire before any `GDD.md` edit or any code is written.
