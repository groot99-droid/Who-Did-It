# Round 10, wave 2: the spawn briefs

6Z spawned 10N, 10K, 10T and 10M on 2026-10-30 with these briefs (A276). Each session's brief is its part below
followed by the common part at the end. They are kept here for part 2 (`part2.md`): a fresh session spawned in place
of an archived one starts from its brief, its handoff in `part2.md` and the Round 10 log. `docs/SESSIONS.md`, "Round
10 briefs", holds the summary, and a later ruling in the Round 10 log wins over a brief.

## 10N

You are session 10N of docs/SESSIONS.md Round 10 (Opus, 800k): the new roles. 6Z spawned you on 2026-10-30 for wave 2 of docs/round10/scope.md. This message is your brief.

Your first action: write .claude/settings.local.json as {"autoCompactWindow": 800000}. If the file exists, add that key and keep any keys already there. The file is git-ignored and keeps your 800k window across worker restarts (docs/round10/README.md, "Compaction"). You were spawned from claude/r10-tier-800k, which is the base plus one commit setting that window. After a container restart, check the file and write it again if it is gone.

Your steps, one draft pull request each, worked in this order as their gates open (scope.md 4.3 to 4.6):
- K6, snares and Rope (I27; seams.md 3 row 31; scope.md 2.5). No "After": start now, on claude/r10-k6-snares. Rope ships here, not with 10V.
- N2, the Child: crawlspaces, Witness, the pick-up rule (I12; scope.md 2.4). After 10V's V3 (the hiding spots).
- T1, the Trades as cards: the Postmaster, the Undertaker and the Bartender, with their default routes (I30; scope.md 2.6; Q-S2 and Q-S3). After W1b (10S's world-mode deal).
- N1, the Butler: Lock / Unlock, the Ledger, the Killer's Lock door (I11, I17). After W1b and B7 (10B's Inquest).
- N3, the Ranger: Shoot, the Arrest (I13; Q-S1). After B4 (merged) and K6.
- N4, the Thief: the Lockpick tier, Pickpocket, Smoke (row 31), the sea door, Heirlooms (I14, I31). After S1 (10F's containers) and T5 (10B's theft).
- N5, the Medium: the seance (I15; row 32). After B7.
- N6, the lobby toggles and the faction-only reveal (I16), and Forged Alibi (I18). After W1b, B6a and 10V's Inspect (V1a).
- M2, the Wisp (I50; row 34; scope.md 2.8). After B7.

Each new card brings:
- its roles.json row;
- its abilities.json rows, with `status: live` once 10R's build adds that field (10R's test checks it);
- a looks.json placeholder (scope.md 2.10: a tinted body from tools/sprites/placeholder.ts, never the villager body, and never a fallback that depends on the viewer's card);
- its GDD 3.2 row;
- its lines in docs/round10/rolecards.md (10R's file; 6Z grants you appending your card's lines).

Each card's tests cover every ability's refusals, plus a secrecy test that a client of another card sees nothing of it beyond the drawn figure. A card joins a world-mode roster only after W1b has merged. An NPC seat dealt your card uses its powers by the scripted brain's rules (GDD 3.12): the step says how an NPC Ranger lays snares and shoots, how an NPC Child hides and witnesses, how an NPC Medium holds a seance, how an NPC ghost wisps (row 34), so no power marks a human.

The owner's open questions (scope.md 5). Their defaults stand until the owner answers, and 6Z tells you if an answer changes one:
- Q-S1, the Ranger's Arrest: a cuff at bolt range, once per match, only on a manhunt's accused. The town still decides who is hunted.
- Q-S2, the Company Clerk: the Clerk stays a guard figure, the Watchman stays the Activist's partner, and the Heir route has no holder.
- Q-S3, the roads: round 10 builds the Trades with their default routes and leaves the roads (evolutions) for a later pass.

Your rows: DECISIONS A240, then A260, A280 and so on (first number plus 20 per row, seams.md 5), in number order in the table. Your copy goes under UI.md 14.57, with further topics in `####` subsections of it.

Seams with live sessions:
- 10V builds the evidence verbs, the cover-up verbs and the hiding spots (rows 23 and 24; sim/verbs/**). N2's crawlspaces build on V3's hiding spots, and N6's Forged Alibi on V1a's Inspect and its Forged reading.
- 10B builds the Tribunal and the Inquest (B6, B7; sim/law/).
- 10S builds world mode: W1a (the hidden seats, row 25) and W1b (the deal, in sim/Deck.ts after 10C's last step there).
- 10A's K1 (weapons) and 10K's K2 to K8 are the other kit steps.

## 10K

You are session 10K of docs/SESSIONS.md Round 10 (Sonnet, 500k): kit and the wild. 6Z spawned you on 2026-10-30 for wave 2 of docs/round10/scope.md. This message is your brief.

You were spawned from claude/zen-turing-m1jnw0, so your context compacts at the 500k default and you need no .claude/settings.local.json.

Your steps, one draft pull request each (scope.md 4.4; the design is scope.md 2.5 and 2.8):
- K3, candles for all and Handcuffs (I28, I29). After B4 (merged): start now, on claude/r10-k3-candles.
- K7, crows, the bog-wisp and deep mud (I51, I52, I56). No "After": open it while K3 is in review.
- K2, armour's resistances (I25). After S3 (10H's forge chain).
- K4, recipe teaching and the chains (I26; seams.md 3 row 29). After S3.
- K5, skill checks (I36). After K4.
- K8, the bog lurker and poison food (I53, I55). After C4c (10C's hardships, the spoiled stock).

6Z's secrecy notes for these steps (seams.md 6, "nothing a seat does marks it human"):
- K3. Every card's start kit gains a Candle, NPC seats' too, and NPC seats light theirs by the rule a human would follow (at dusk, indoors by night). Handcuffs change only the length of row 14's cuff hold, and the hold shows nothing new.
- K7. Crows caw and fly at any seat or figure that runs within their senses, by one rule. Deep mud slows everyone. The bog-wisp drifts toward any carried light, an NPC seat's or a figure's too.
- K2. The Miner's cap's light and tin mail's longer footsteps are seen and heard. So NPC seats must wear armour too, drawn at the deal or bought by their routine on their own streams; otherwise a figure showing them is marked human. Say how in the pull request.
- K4. `Private.recipes` and `Private.branch` live only in the seat's own view (row 29).
- K5. A skill check is a mini-game on the player's own screen. The seat's public hold at the shop, the altar or the forge must be one NPC seats also make, and its length must not tell a human.
- K8. The lurker bites whoever stands still on a shore tile, seat or figure. Tainting food is a hold, so NPC seats taint too (a Cabal NPC by its choices stream), or the hold shows only what any hold shows. A poisoned seat's signs are the existing Poisoned ones (A6: it stops at 1 health).

Your rows: DECISIONS A241, then A261, A281 and so on (first number plus 20 per row, seams.md 5), in number order in the table. Your copy goes under UI.md 14.58, with further topics in `####` subsections of it.

Seams with live sessions:
- 10H owns mobs.json, effects.json, sim/body/effects.ts and damage.ts, the tool data of items.json and recipes.json, sim/Resources.ts, sim/Craft.ts and the inventory screens (seams.md 4). New rows are granted below; a change to an existing row or file needs 6Z's grant.
- 10D's D6 shipped armour and the skinning knife (GDD 3.30), and K2 builds on it. 10D's D9a shipped the quest chains (quest `after`); K4 adds the teaching.
- 10A builds K1 (weapons) and 10N builds K6 (snares and Rope): the other kit steps.

## 10T

You are session 10T of docs/SESSIONS.md Round 10 (Sonnet, 500k): the town. 6Z spawned you on 2026-10-30 for wave 2 of docs/round10/scope.md. This message is your brief.

You were spawned from claude/zen-turing-m1jnw0, so your context compacts at the 500k default and you need no .claude/settings.local.json.

Your steps, one draft pull request each (scope.md 4.5; the design is scope.md 2.6):
- T6, new places (I42: `cottage_fisher`, `sea_exit`, the south-east light) and the mood hooks (I40). No "After": start now, on claude/r10-t6-places.
- T2, chores and errands (I33). scope.md says T2 comes after D9b, but 6Z rules that it doesn't wait. D9b, widening the task deal's pool, is parked for the balance lab. T2's chores never move the bar and never join the task deal: keep them in their own data (`chores.json`) and leave the task deal alone. T2 may start once T6 is open.
- T3, standing, examine lines, leads and Faith's sources (I33 to I35; seams.md 3 row 29). After T2.

6Z's secrecy notes for these steps (seams.md 6, "nothing a seat does marks it human"):
- T2. A chore is a station hold anyone may start. NPC seats already hold work stations by their routine (D1, routines.json `holds`). A human's chore must look exactly like an NPC seat's: the same stations, hold length and signs. Its wage and its alibi entry appear only in the seat's own view. Errands come from a figure in a mood through D9c's talk (row 16), which shows nothing public.
- T3. Standing, examine lines and leads live only in the seat's own view (row 29). The Faith vigil is presence in the chapel at dusk, and NPC seats attend by their routine too, so attending marks no one. The ward and the blessing must show nothing of who bought them beyond what any figure shows.
- T6. A new scene is a greybox with new ids under a new prefix, appended to SCENE_IDS (GDD 3.13; nothing renamed or reused). Re-export the tilemaps with `pnpm -C tools/grid export`, never by hand. A mood hook changes what a figure says or does, never what it shows about a seat.
- Q-S4, NPC seats at night (I41), is not yours: 6Z gives it to another session.

Your rows: DECISIONS A242, then A262, A282 and so on (first number plus 20 per row, seams.md 5), in number order in the table. Your copy goes under UI.md 14.59, with further topics in `####` subsections of it.

Seams with live sessions:
- 10D owns sim/townsfolk/*, quests.json, lore.json tips, economy.json and the rent (seams.md 4).
- 10F owns routines.json and sim/npc/*. A chore station NPC seats must also use goes through a grant or a message to 6Z.
- 10A takes T4 (town work, windows, stations, row 30), 10B takes T5 (theft, Notices, curfew locks, forced labour, the heresy trial), and 10N takes T1 (the Trades as cards).

## 10M

You are session 10M of docs/SESSIONS.md Round 10 (Sonnet, 500k): ghosts, talk and modes. 6Z spawned you on 2026-10-30 for wave 2 of docs/round10/scope.md. This message is your brief.

You were spawned from claude/zen-turing-m1jnw0, so your context compacts at the 500k default and you need no .claude/settings.local.json.

Your steps, one draft pull request each (scope.md 4.6; the design is scope.md 2.8 and 2.9):
- M1, barks and the world lines (I61). No "After": start now, on claude/r10-m1-barks.
- M4, the minimap and fog (I43). No "After": open it while M1 is in review. Client only.
- M3, shove, fists on townsfolk and two-player carrying (I57 to I59). After C6 (10C's robbery and the town chest).
M2 (the Wisp) and M5 (spectators) are Opus steps: 10N and 10S build them.

6Z's secrecy notes for these steps (seams.md 6, "nothing a seat does marks it human"):
- M1. A bark is a line from the quick-chat pool, and there is no free text outside meetings (Q-S6's default, scope.md 5). Figures and NPC seats bark a pool line at shared moments (a bell, a wolf near, a lantern lit), drawn on their own streams, and humans send the same lines from the wheel. Neither a line nor its timing may tell a human: if humans can bark at any moment and NPC seats only at shared ones, a bark between moments marks a human. So NPC seats also bark at idle moments on their own streams, and the pull request says how the timing matches. A new line or message needs its seams.md 3 row first: send 6Z your row before you build it.
- M4. The minimap draws the map's scenes and the seat's own position, never another figure's. Fog is the seat's own memory of the tiles it has seen.
- M3. A shove, a blow on a townsperson and a carry are seen. NPC seats must do them too (a Cabal NPC may shove by its choices stream; an NPC seat answers a carry as a human would), or the step names the step that adds them. Two-player carrying needs two seats, and if only humans carried, both carriers would be marked human. A figure knocked out drops its takings by A160's strike hook. A shove down the well is an assault charge (10B's laws) and lays only the one-way drop's usual noise and landing trail.

Your rows: DECISIONS A243, then A263, A283 and so on (first number plus 20 per row, seams.md 5), in number order in the table. Your copy goes under UI.md 14.60, with further topics in `####` subsections of it.

Seams with live sessions:
- 10C builds C6 (robbery, fists, sim/body/fists.ts), and M3 builds on it.
- 10D owns sim/townsfolk/*, where A160's strike hook lives.
- 10Y owns the HUD (view/Hud.ts) and the screens. Where M4's minimap mounts in the HUD needs 6Z's grant.
- The quick-chat wheel is the client's: M1's new lines go in its copy module, with their UI.md 14.60 rows in the same pull request (seams.md 1).

## Common to the four

Why you exist. On 2026-10-30 the owner wrote: "Real quick how many rounds are you trying to stretch everything, for me round 11 is blender only really, every gameplay feature (except bosses) should be added". Asked which lists that covers, the owner chose "Also V1.5 and V2 gameplay" (DECISIONS A256). So round 10 builds every gameplay feature that isn't built yet. Session 10S wrote the census and the plan in docs/round10/scope.md (merged as #420). 6Z reviewed it for role secrecy and split its build among new and finishing sessions (DECISIONS A276; docs/SESSIONS.md, Round 10, "Wave 2 of scope.md"). scope.md 2 is your design, scope.md 3 your wire rows (now seams.md 3 rows 25 to 34), and scope.md 4 your steps. Where scope.md 4 names another session, the briefs in docs/SESSIONS.md win.

Role secrecy (CLAUDE.md) is the hard line in every step:
- A player's role card, inventory, Notebook and cooldowns live only in that player's private view.
- Nothing a client receives may reveal that a seat wears a cover, a cover-wearer's true role, or who walks under an impersonation beyond what the drawn figure shows.
- Nothing secret shares a random stream with anything public. A new secret draw gets a new stream in apps/server/src/sim/seeds.ts (`StreamName` is append-only).
- Debug handlers register only with WDI_DEBUG=1.
- A kill is never revealed before a meeting or a Tribunal (GDD 3.7). No field, count, stock, refusal or line may change at the kill. `Player.alive` flips only at a meeting, a Tribunal or an ejection (A30).
- Hidden seats (GDD 3.12, A39, seams.md 6). Nothing a client receives marks a seat as an NPC, and nothing a seat does marks it human. A verb a seat can be seen doing (a hold, a walk to a prop, a chase, a blow, a visible effect, a light, a noise) must be one NPC seats also do, by their routine or their choices stream, in the same pull request or in a step it names. A choice a human makes in sight is one an NPC seat also draws. In world mode the Killer is always human, so every human marker narrows the Killer. Check each of your verbs against this before you build it, and say in the description how NPC seats do it.
- Before anything new goes on the wire, the row must be in seams.md 3. Rows 25 to 34 cover the steps scope.md 3 drafted. For anything else new on the wire (a message, a field, a public prop state, a line), send 6Z a proposed row first and build it only after 6Z adds it. The leak test of round 8 (A170) runs on every new message.

Paths (seams.md 1 and 4):
- You own the new files your steps create and their tests.
- Shared files follow seams.md 1. balance.json: a new key under its own top-level block. scenes and SCENE_IDS: new ids only, append-only. events.json: append only. Your DECISIONS and UI.md rows are yours.
- 6Z grants you, for every step, appending a new row (a new creature, item, ability, recipe, prop, look or quest) to a content JSON file another session owns (mobs.json, items.json, abilities.json, recipes.json, effects.json, looks.json, quests.json, lore.json, interactions.json and the like). The new row's schema must already exist or come with the row. Changing an existing row, or editing a source file that seams.md 4 gives a live session, needs 6Z's grant in a message first, unless that session's last step in that file has merged. A new prop kind or stem joins the census in interactions.json in the same pull request.
- Never edit an existing server test file (apps/server/test/*.test.ts) without 6Z's grant (seams.md 1). Ask in a message, naming the file, the lines and why. A new test file needs no grant.
- A step that adds a client screen or control touches the client in its own paths (the new files). An existing client file needs 6Z's grant. 10R's build owns the role card and the Satchel, and 10Y the other screens; 6Z coordinates.

How you work (docs/round10/README.md, "How a session works"):
- Cut every pull request branch from origin/claude/zen-turing-m1jnw0: run `git fetch origin claude/zen-turing-m1jnw0`, then `git checkout -b <branch> origin/claude/zen-turing-m1jnw0`. Never open a pull request from your spawn branch. 6Z, which spawned you, gives you permission to create and push one branch per step, named claude/r10-<step>-<slug> (for example claude/r10-k7-crows). Push nowhere else.
- One draft pull request per step against claude/zen-turing-m1jnw0, under 400 lines; split a step into a and b if it passes that. Run `pnpm lint && pnpm typecheck && pnpm test` clean before every push. GDD.md changes in the same pull request, in the section its feature lives in. A new number goes in balance.json or the content data and its GDD line, never in another document.
- CI runs `check` and `server` on every push, plus `e2e` (the Playwright suite) on a pull request that touches the client, the shared or content packages, or the lockfile. All of them must be green.
- Server tests: run single files with `npx vitest run --no-file-parallelism <files>` from apps/server, because parallel runs clash on port 2568.
- Subscribe to each pull request and drive it to green. Before you mark it complete:
  - merge origin/claude/zen-turing-m1jnw0 in;
  - run the full check, plus `pnpm auto -- --matches 50` for a rules step, clean;
  - write "Complete" at the top of its description;
  - send 6Z one line with send_message to session_01M5mAcWJXBeyh4yPTi8ZPYa, like "<you>: #NNN (<step>) complete".
  6Z merges; you never merge.
- If merging the base conflicts only in docs/DECISIONS.md, keep every row in number order and let CI be the check. A conflict in another session's logic goes to 6Z.
- Start a step only when the steps its "After" names have merged. Meanwhile read and plan, and wait for 6Z's message that the gate is open. A step with no "After" starts now. You may open the next ready step while one waits for review.
- A question for the owner goes to 6Z in the pull request description or a message. In doubt, take the design document's proposed default (scope.md 2, 5), say so in the description and carry on.
- Read first: CLAUDE.md, docs/README.md, docs/round10/README.md, docs/round10/seams.md (all of it), docs/round10/scope.md (sections 0, 2, 3 and 4, and your items in section 1), then the GDD sections your steps change. The Round 10 log in docs/SESSIONS.md says what has merged.
- Copy this brief into your first pull request's description, so it survives a compaction. After a compaction or a container restart, re-read the brief and docs/round10/seams.md before the next edit.
- When your last step has merged, send 6Z one line that you are done, and stop.
