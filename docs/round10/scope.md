# Round 10: the scope census (10S)

Design only. This document turns the owner's ruling of 2026-10-30 into buildable work: what is left to build, what
it needs, what goes on the wire, the pull requests and the questions for the owner. It changes no code, no data, no
`GDD.md` and no other document. Every number it names is either a key that already holds it or a new key marked
_proposed_, for the balance lab.

## 0. The brief

Copied from 6Z's spawn prompt of 2026-10-30, so it survives a compaction.

> You are session 10S (Opus, 800k): the scope census. The owner added you to round 10 on 2026-10-30. This message is
> your brief. 6Z adds your row to docs/SESSIONS.md and docs/round10/README.md in its next docs pull request. Copy this
> brief into the opening section of your document, so it survives a compaction.
>
> Your first action: write .claude/settings.local.json as {"autoCompactWindow": 800000}. If the file exists, add that
> key and keep any keys already there. The file is git-ignored and keeps your 800k window across worker restarts
> (docs/round10/README.md, "Compaction"). After a container restart, check the file and write it again if it is gone.
> You were spawned from claude/r10-tier-800k at d09b50d (the base at 6c9bb79 plus the 800k window). Never open a pull
> request from it.
>
> The owner's decision, verbatim (2026-10-30):
>
> > Real quick how many rounds are you trying to stretch everything, for me round 11 is blender only really, every
> > gameplay feature (except bosses) should be added
>
> 6Z asked which lists that covers. The owner chose "Also V1.5 and V2 gameplay": round 10 builds everything planned for
> V1 and world mode, everything that had been pushed to round 11 or tagged "not yet", the V1.5 list, and V2's gameplay
> (the Medium, bats, the bog lurker, crows, poison). The Beast boss (with the Cave Gate), the first-person renderer and
> voice chat stay out. Cosmetics are not gameplay, so they stay out too unless the owner says otherwise.
>
> Your job: one document, docs/round10/scope.md, that turns this into buildable work.
>
> 1. The inventory. List every gameplay feature that is not built and not already assigned. The sources are:
>    - GDD.md: every role, ability, kit item, creature, place, rule and mode in the V1, V1.5 and V2 lists (GDD 3.10's
>      version lists and every section they point to), and every line that says NFY, "round 11", "a later round" or
>      "waits";
>    - docs/round9/world-mode.md, living-world.md, round10-plan.md and followup-4.md;
>    - docs/round10/rolecards.md 4 (the world-mode win routes the owner's Q-A2 wants built: Healer, Watch, Trade,
>      Peaceful and the vendettas' new steps);
>    - the NFY rulings in the Round 10 log of docs/SESSIONS.md: the cold station, the dark window, the Hitman's true
>      look and props, the jail scrub's hour off the sentence. The Clerk's ledger is 10C's C4d.
>
>    Leave out what is already assigned:
>    - 10V's missing verbs (rolecards.md 11.3: the evidence verbs, the cover-up verbs, the hiding spots);
>    - 10B's B6 to B8, 10C's C4b to C4d, C5c, C6 and C7, 10D's remaining steps, 10E's E1 and E2;
>    - 10R's role-card build (R1 to R6);
>    - anything with an open pull request.
>
>    For each item, give:
>    - its source section;
>    - what exists in the code today, checked against the files (built, partly built or not built, naming the file);
>    - whether the design is complete enough to build;
>    - every conflict with world mode. For example: the Ranger's Arrest against the law (petitions, the manhunt, the
>      cuff, the Tribunal); the Medium against the ghosts' rules; Handcuffs against row 14's cuff; Candles against the
>      light system; spectator mode against role secrecy.
> 2. The missing design. Where an item is not designed enough to build, write the design in the document, marked
>    _proposed_, from GDD's intent and the systems that exist. Keep it as short as a builder needs. Never restate a
>    number GDD or balance.json holds; propose a new key where one is needed.
> 3. The wire. For each item that needs something new on the wire, draft its seams.md 3 row in the form of rows 13 to
>    22, with role secrecy checked against CLAUDE.md. 6Z adds the rows; a builder waits for them.
> 4. The build plan. Split the work into pull requests under 400 lines, each with its paths, tests, dependencies and
>    model:
>    - Opus for a step that sets a contract, touches role secrecy or needs judgement across systems;
>    - Sonnet for a step that follows a merged contract.
>
>    Group them into sessions (new ones, or 10B, 10C and 10D as their lists end), in an order that respects
>    docs/round10/seams.md 7 and the live sessions' paths (seams.md 4).
> 5. Questions for the owner, only where a choice is really theirs, each with a proposed default, in the form of
>    docs/round11/questions.md. Keep them few.
>
> Send early. As soon as you know a batch of items that is fully designed and touches no open question (wave 1), send
> 6Z the list with its proposed pull requests, before the document is done, so builders can start. Then finish the
> rest.
>
> How you work:
> - Read first: CLAUDE.md, docs/README.md, docs/round10/README.md, docs/round10/seams.md (all of it), docs/SESSIONS.md's
>   Round 10 section, docs/round10/rolecards.md (4 and 11), then GDD.md whole.
> - Before you change a mechanic's design, ask the udgt-consult skill "why is it like this". It answers from the ROSW
>   teardown, if ROSW (groot99-droid/Pipelines-Plugin) can be added read-only beside this repo. Never write to ROSW.
> - Design only. Write docs/round10/scope.md and nothing else. GDD, DECISIONS and UI.md are edited by the builds.
> - Cut your branch from origin/claude/zen-turing-m1jnw0 [...]. Push nowhere else.
> - Open one draft pull request against claude/zen-turing-m1jnw0, holding the document only.
>   - Run pnpm lint before every push.
>   - Subscribe to it and drive it to green.
>   - When it is ready, write "Complete" at the top of its description and send 6Z one line with send_message to
>     session_01M5mAcWJXBeyh4yPTi8ZPYa: "10S: #NNN (scope) complete".
>   - 6Z merges; you never merge.
> - Your DECISIONS row, if you need one, is A238.
> - After a compaction or a container restart, re-read the brief in your document and docs/round10/seams.md before the
>   next edit.
> - After the document merges, stay available: 6Z may ask you to answer the builders' questions about it, or to draft
>   further seams rows.

**What this census read.** The base `origin/claude/zen-turing-m1jnw0` at `6c9bb79`, and the open pull requests of
2026-10-30: #400 (6Z's docs: seams rows 20 to 22 and the log with the C4 and B6 rulings), #401 and #408 (C4a, C4b),
#416 (10R's answers: 10V exists, Q-A2 and Q-A4) and the 10X and 10Y fixes. The teardown was read from ROSW
`teardowns/who-did-it` (read-only clone): the owner's answers there that bear on this scope are "Space is
information" (the pillar he would defend), "a second layer" (the world competes with the deduction only as a second
layer), "full anti-cheat", "play differently" (each map) and "all equally" (evolutions, the law, the economy, the maps
and story mode are one design). The `udgt-consult` skill itself is not installed in this session, so its answers were
read from `answers.json` and the chapters directly.

**Wave 1** went to 6Z on 2026-10-30 before this document was done: S1 containers, S2 berries and stew, S3 the forge,
S4 the mugging's Flee and Fight, S5 the art style in the menu only (section 4). 6Z assigned them the same day: S1 to 10F, S2 and S3 to
10H, S4 to 10D (then D4b once S2 merges), S5 to 10Y; the grindstone left S3 for 10X's x9 (A313).

## 1. The inventory

Every gameplay feature found unbuilt and unassigned. "Code" is what the base holds, checked against the files.
"Ready" is whether the design is complete enough to build: **yes**, **proposed** (section 2 writes it), or **owner**
(section 5 asks). "Conflicts" are the meeting points with world mode; each is settled in section 2 or asked in
section 5. The ids (I1 and on) are this document's, used by sections 2 to 4.

### 1.1 World mode itself

| Id | Item | Source | Code | Ready | Conflicts |
|---|---|---|---|---|---|
| I1 | **The world-mode deal**: the roster as the deck, one human Killer, the vendetta partners human, the Accomplice only from 6 humans, the Killer's pick among NPC-held cards, the worn card withdrawn (no NPC seat for it), the 30 s card, NPC names | world-mode.md 1.2, 1.4, 4.1; phases.md 9 | **Not built.** `sim/Deck.ts` deals `deckFor(n)` (the main mode's row) and branches only to Paint The Town Red (`Deck.ts:43`); `rules/deck.ts` `coverHints` picks undealt cards; `vendettas.json` keeps `needsCard: vicar` only. No step of `round10-plan.md` builds it, and B6's split (#400) does not name it | proposed (2.1) | Role secrecy: the seat count must not change by vendetta (the Bandit is the one exception, public anyway); `players.max` against a roster of up to 22 seats (load); the Trades (I30) are partners the roster cannot deal yet (interim partners, WM8) |
| I2 | **Nameplates show characters** ("Tamsin Crumb, the Baker"), player names only on the end screen | world-mode.md 4.3 (WM4: default) | **Not built.** `view/PlayerView.ts` draws the seat's name; y12 (#409) keys a *figure's* nameplate by its look, not a seat's | yes | Friends find each other by name today (GDD 3.21); the lobby and the party list keep names |
| I3 | **The true look**: the Killer's own client draws the vendetta's character (`zealot`, `activist`, `hitman`); the Bandit's is public | world-mode.md 4.4; 6Z's C4 ruling (NFY) | **Not built.** No `Private.trueLook`; no such atlas | proposed (2.1) | Art is round 11's Blender pass: round 10 ships the field and a placeholder figure (2.10) |
| I4 | **The Bandit wears his own skin**: a public `bandit` look, no worn card, Outlaw Anonymity | world-mode.md 4.2 | **Not built** | yes, after I1 and I2 | One more seat in a Bandit match: public by design (4.2) |
| I5 | **The victories ledger**: one row per winning seat with its kind, the Killer's true and worn look, the Hitman's stage, the timeline | phases.md 7; rolecards.md 4.5 | **Partly built.** `S2C.gameOver` has `winner`, `alsoWon`, `paintTown` (C5) and, in #408, `hitman`. No per-seat victory list; `ui/GameOver.ts` shows factions | proposed (2.2) | B6c retires the faction winner: the ledger must merge after it and read what it leaves |
| I6 | **Personal routes** (the "when built" lines of rolecards.md 4.3): Healer (Doctor), Watch (Watchman), Trade (Lamplighter, Baker, Medium), Peaceful (Vicar), Role (Herbalist's Nightshade, Gamekeeper's Last Shot), Town (`W-town`: the bar fills before the vendetta completes), Solo (Thief), Law (Ranger) | world-mode.md 2, 3; rolecards.md 4.2, 4.3; Q-A2 "Round 10 will get this done" | **Not built.** `sim/Win.ts` knows factions, the Drifter and Paint The Town Red. The Law route, Gallows and Unseen are B6's (B6a, B6d) | proposed (2.2) | The match end rule of world-mode 3 ("every open personal goal settled") would hold a match open; the Peaceful route needs a conversion mechanic (I9); the Town route needs B6c to stop the bar ending the match |
| I7 | **The world-mode vendettas' new steps**: the Zealot's Following (sigils, followers, the Dark Mass), the Activist's Disarray, Unrest, the Baron and the Redemption trial, the Bandit's four robberies and the ride-out, with the six-shooter | world-mode.md 2; F4 2.10 ("sabotage is their means") | **Not built.** `sim/vendettas/conversion.ts`, `sabotage.ts`, `heist.ts` run the round-7 goals (share time, tamper, crack) | proposed (2.3) | A vendetta never kills (GDD 3.20) but may set a hazard (F4 2.10, C7's); the Baron is a figure the Knife may reach; the Redemption trial is a Tribunal (B6a) the Activist opens on herself; the Bandit's gun kills by day and must not be a second Knife |
| I8 | **Plot traces and the jail search**: candlewax, black powder, a .45 casing, flour dust, a wax seal as new clue kinds; a jailed seat's pack searched for a full vendetta tool set | world-mode.md 5 ("the verdict, by evidence"); F4 2.9 | **Not built.** `law/Jail.ts` has no search; `ClueKind` ends at `scratch` (11). B5's brief named the search; B5a to B5c did not build it | proposed (2.3) | A trace must never name a card: a tool anyone may hold proves nothing alone (F4 2.9) |
| I9 | **Conversion**: Faith toward a seat's conversion, the sermon (the Vicar's bell, B7), the Vicar's Peaceful win | world-mode.md 2, 3.1 (the bell's purposes) | **Not built.** Faith is a purse (`economy/faith.ts`); B7 builds the bell's gathering, not what a sermon does | proposed (2.2) | A converted count must be private, or it would show the Vicar's progress and name him |
| I10 | **The dawn card and the manifest**: "Day N", the cycle bar, the train banner and the manifest of returning and released seats | phases.md 2 | **Partly built.** C1b drew the arrival card for the returner; y13 (#412) works the On-the-line screen; no dawn card or public manifest panel (the manifest is a chat line, UI.md 14.47) | yes | None: the manifest is public by design |

### 1.2 Roles not dealt yet

| Id | Item | Source | Code | Ready | Conflicts |
|---|---|---|---|---|---|
| I11 | **Butler**: Lock / Unlock any house door (the Master Keyring), the Ledger (each living seat's last house), the Killer's Lock door returning with it | GDD 3.2, 3.10 (V1, M4), 3.5; 3.4 "Ledger" | **Not built.** `roles.json` `butler` has abilities and kit; no look in `looks.json`; `abilities.json` `lockUnlock` and `ledger` have no route (`Actions.ts` default, `NFY`); `killerLock` is `ships: V1.5` | proposed (2.4) | The Ledger is per meeting, and world mode has Inquests; a ledger by seat sees through an impersonation (as the night powers do, GDD 3.17: allowed for a power); locks must not trap (locks keep people out, never in) |
| I12 | **Child**: Silent hide in crawlspaces, Witness (passive), the Slingshot (built), vision −1, cannot pick up items | GDD 3.2 (V1, M4) | **Partly built.** `slingshot` is built (`body/fists.ts`); Silent hide and Witness have no route; no look | proposed (2.4), after 10V's hiding spots | "Cannot pick up items" against the world-mode economy (gathering, quests, the inventory); Witness posts "at the next meeting", which world mode replaces |
| I13 | **Ranger**: Shoot a wolf (Crossbow, Bolts), Arrest (one per match), Snare; footprints decay slower for him (180 s) | GDD 3.2, 3.4, 3.10 (V1.5) | **Not built.** `roles.json` `ranger` (`ships: V1.5`), `crossbow` and `bolt` items exist; no route | proposed (2.4); **owner** for Arrest (Q-S1) | Arrest against the law: B3's petitions, B4's cuff (row 14), B5's jail, B6's Tribunal; a bolt on a seat must not kill (only the Knife and a bite kill, A6) |
| I14 | **Thief**: Pickpocket, Lockpick, Smoke, three Heirlooms, escape by the sea door; cover decided when it ships | GDD 3.2, 3.5, 3.10 (V1.5); WORLD 4.4 (`ce.sea`, boarded, opened by low water on nights 2 and 4) | **Not built.** `roles.json` `thief` (`ships: V1.5`), items `sack`, `smokeBomb`, `heirloom`; `ce.sea` is a boarded portal; no route | proposed (2.4) | Pickpocket is a robbery (a crime, B6's charges); a cover role in world mode picks from NPC cards like the Accomplice; Heirlooms need the containers (I21) |
| I15 | **Medium**: a seance at a body (8 s), the ghost picks one of 8 phrases | GDD 3.2, 3.10 (V2) | **Not built.** `roles.json` `medium` (`ships: V2`), `seanceChalk` item | proposed (2.4) | The ghosts' rules: a day death has no ghost (on the line); a ghost sees every role, so free phrases would leak; a ghost's death is private until the meeting |
| I16 | **The lobby's role toggles** (Thief, Medium) and the **faction-only reveal** | GDD 3.1, 3.10 (V1.5); `Settings.revealMode` (full, locked) | **Not built.** `revealMode` is a schema field locked at 0 | proposed (2.4) | World mode deals every roster card ("all the roles have to be dealt"), so a toggle removes a card from the roster; the reveal now happens at a death sentence (B6a) |
| I17 | **Lock door** (the Killer's, `killerLock`) | GDD 3.2 ("returns with the Butler's doors in V1.5") | **Not built**: `ships: V1.5`, no route | yes, with I11 | A card shows at most 3 abilities (GDD 3.2): the Killer already has Kill, Impersonate and Drag body (10V) |
| I18 | **Forged Alibi** (the Accomplice's V1.5 kit item) | GDD 3.2, 3.5 | **Not built**: `forgedAlibi` item, no use | proposed (2.4) | A forged alibi entry must read like a task's alibi entry, and Inspect must still be able to expose it |

### 1.3 Kit, crafting and the world's goods

| Id | Item | Source | Code | Ready | Conflicts |
|---|---|---|---|---|---|
| I21 | **Containers and loot**: barrels, sacks and shelves (search), nailed and locked chests (pry, pick, key), activation per scene, loot tables by theme, the 6 new container slots | logic-table.md 6.1 to 6.4 | **Not built.** `interactions.json` `lootTables: {}`, no container class; the `loot` stream exists (A10, A11) | yes (wave 1, S1) | None: contents are private until opened, the prop state is row 3's. The town chest (the hub `kitChest`) is C6's |
| I22 | **Berries, Game and Stew** | logic-table.md 9.6; living-world.md 2.1 | **Partly built.** `game` and `hide` exist (D6b); no `berries` node or item, no `stew` | yes (wave 1, S2) | None |
| I23 | **The forge chain**: the kiln's Tin Ingot; the forge and anvil's Iron axe, Iron pickaxe, Fine pick, Tin mail, Tin helm; the Miner's cap; tier-2 walls (the grindstone is 10X's x9, A313) | logic-table.md 7.1, 8.1, 8.2; GDD 3.22 "Not built yet"; D9's "tin mail waits for round 11" | **Not built.** `forge` and `kiln` props exist in BlackPine scenes as stems; no recipe or class reads them | yes (wave 1, S3), except the cap's lamp and Warmth (2.5) | Tier-2 HollowMere access is by carrying ingots (LT9: default) |
| I24 | **Weapons**: Club, Hatchet/Axe, Pickaxe as weapons (`weapon` blocks, the weapon slot) | logic-table.md 8.3; living-world.md 5.2 | **Not built.** The weapon slot exists (A12) and takes nothing; fists are the only blow | yes | A tool as a weapon wears twice; nothing kills a seat but the Knife and a bite (A6); armour applies (D6a); the robbery (C6) is in the same file |
| I25 | **Armour's remaining resistances**: Warmth at night, the Miner's cap lamp, louder footsteps (Tin mail), Daze resistance (Tin helm) | GDD 3.22 "Not built yet"; logic-table.md 8.2 | **Not built** | proposed (2.5) | Warmth reads Fear, which only NPC seats and figures have; a lamp is a carried light, public as the lantern bit |
| I26 | **Recipe teaching and the chains' branch**: Moll's Food or Cure, Ada Kerrow's Temper teaching Tin mail, one branch per match; the other three givers' chains (Pell, Hask, the Collier) | living-world.md 1.3; GDD 3.16 "wait for round 11" | **Partly built.** D9a's two-step chains pay items and Scrip (`quests.json` `after`) | proposed (2.5) | A learned recipe is private; a branch is private |
| I27 | **Snares and Rope**: Set a snare, a snared seat held and logged, Rope frees, disarm in the wild; the Ranger's bear traps | GDD 3.5, 3.14 ("stay off until they ship"), 3.6 (V1.5 bear traps), 3.22 (Slowed from a snare) | **Partly built.** `snare` and `rope` items exist and are sold and crafted; `abilities.json` `snare`, `rope` have no route | proposed (2.5) | A set snare is a hidden object: who may see it; the log must name a drawn look, never a seat (impersonation); 10V's Rope (rolecards.md 11.2: "Rope comes with the V1.5 snares") |
| I28 | **Handcuffs** | GDD 3.5 (V1.5) | **Not built**: `handcuffs` item, no use | proposed (2.5) | Row 14's cuff is a bare-handed hold anyone may run during a manhunt |
| I29 | **Candles for all** | GDD 3.10 (V1.5) | **Mostly built.** Candles are sold (the general store) and lit with `act.light` (`mobs/light.ts`), radius in `items.json` | proposed (2.5) | A lit light shows as the lantern bit, never by card (GDD 3.15), so a candle in every kit tells nothing |
| I31 | **Heirlooms** (three, the Thief's goal; also in the `valuables` loot) | GDD 3.2, 3.5 | **Not built**: `heirloom` item | yes, with I14 and I21 | An Heirloom in a pack is evidence of theft only if owned (I47) |

### 1.4 The world's people and places

| Id | Item | Source | Code | Ready | Conflicts |
|---|---|---|---|---|---|
| I30 | **The Trades as cards**: the Postmaster, the Undertaker, the Bartender (and the Company Clerk) with their default routes | world-mode.md 1.2, 1.3, 2; WM8 (interim partners) | **Not built**: no cards, no looks | proposed (2.6); **owner** for the Clerk (Q-S2) | F4 a4 made the Company Clerk a guard figure, "out of the deck", while world-mode 1.3 names him a card and the Activist's partner; the Undertaker against the train's "Undertaker's cart" |
| I32 | **Evolutions (roads)**: the Fence, the Ration Tyrant, the Handler, the Extortionist, the Grave Robber, the Vigilante, the Chief Coroner, the Embezzler, the Baron's Heir, the High Priest | world-mode.md 2 ("a lore road needs evolutions"); GDD 3.20 (the Ascended Vicar candidacy); `evolutions.json` `{}` | **Not built** | **owner** (Q-S3) | A road changes a card mid-match: the conspiring charge demotes it (B6's sentences); an evolved seat's look stays its card's |
| I33 | **Chores, errands and standing**: chores at stations (a small wage, an alibi entry), errands from figures by need, standing (Stranger, Known, Trusted) | living-world.md 1.2, 1.5, 2.2; F4 2.8 ("we need more tasks and things") | **Partly built.** D1 runs NPC chores; no human chore wage, no errand kind, no standing | proposed (2.6) | D9b (10D) widens the task deal; chores must not move the task bar |
| I34 | **Examine lines and leads**: the 23 lore-hook props, a `lead` on a volume | living-world.md 1.7, 2.4 | **Not built**: no `examine` field | yes (the lines are drafted there) | A lead never points at a role, a killer or the Beast (canon.md 7) |
| I35 | **Faith's other sources and sinks**: the vigil, the shrine chore, devotional reading, the Scared villager's errand; the ward and the blessing | living-world.md 2.5 | **Not built**: Faith comes only from donations and the cot | proposed (2.6) | Faith is private; a vigil puts people in one room, which is public by sight |
| I36 | **Mini-games as skill checks**: haggling (tap), the altar offering (pour), tempering (stoke), butchering (crates), a dish's quality tier | living-world.md 2.6 | **Not built** | proposed (2.6) | A result changes quality, never possibility (the Done control) |
| I37 | **Town work for the cards still `none`**: the lantern posts, the surgery, the fish, the tin, the Watchman's door, the woods, the doors, the witness and errands, the patrols, the seances | GDD 3.23 "What breaks when I'm gone" ("for round 11"); `roles.json` `townWork.nfy` | **Not built**: rows carry `nfy` | proposed (2.6) | The work follows the public look (row 15); a work's stop must never move at a private kill |
| I38 | **The cold station and the dark window** (and lit-window silhouettes) | world-mode.md 1.5; F4 b1; 6Z's C4 rulings (NFY); GDD 3.10 (V1.5 lit-window silhouettes) | **Not built**: no window or station state | proposed (2.6) | The dormant role, a hardship and a seat owing the line must show the same sign (6Z's C4c ruling) |
| I39 | **The Hitman's public props**: the black-wax mailbag on the platform and the crow on the station roof | world-mode.md 1.5; 6Z's C4 ruling (NFY) | **Not built** | yes, with I3 | None beyond row 20's line: the props show only when he comes, as the line does |
| I40 | **Mood routine hooks**: home earlier when Scared, the bakery when Hungry, the quiet places, lingering near the one it is angry at | GDD 3.24 (A140, open) | **Not built** | yes (`townsfolk.md` 1) | The R6 tells (10X's audit): every hook must be something a human might do |
| I41 | **NPC seats' night activity, lock-picking and sleeping** (the open tells: gathering, trading, saws, crates, locks and beds by night) | 10X's R6 audit (Round 10 log); GDD 3.29 ("NPC seats do not pick yet") | **Partly built**: day-only classes; the bakery's night class is 10X's | **owner** (Q-S4) | R6: a watcher must not tell an NPC from a player by what it does |
| I42 | **New places**: the fisher cottage (`cottage_fisher`), the sea door (`sea_exit`), the south-east light | WORLD 4.4; GDD 3.10 (V1.5) | **Not built**; `ce.sea` portal boarded | proposed (2.6) | Scene art is round 11's Blender; round 10 ships greybox scenes with frozen ids |
| I43 | **Explored fog and the minimap** | GDD 3.13 ("M5b") | **Not built** | proposed (2.6) | "A little more (current)" (teardown stage 1): a map shows only places, never figures |

### 1.5 The law, crimes and their gaps

| Id | Item | Source | Code | Ready | Conflicts |
|---|---|---|---|---|---|
| I44 | **Forced labour for the Indebted** | GDD 3.23 ("waits for R9's law pipeline") | **Not built** | proposed (2.7) | The Clerk's errand (C2b) already clears a fare; labour for rent must not mark a card |
| I45 | **The heresy trial** for the Parish Seal | GDD 3.23 ("waits for R9's Tribunal") | **Not built**; the Seal is presented at a meeting, which B6c retires | proposed (2.7) | B6a's Tribunal and B6c's retirement of the vote, which the Seal's shield worked against |
| I46 | **Trespass**: a Notice when a witness sees a picked lock or a seat on its own boarded house; picking the curfew doors | GDD 3.23 D7 ("Not built"), 3.29; logic-table.md 9.5 | **Not built**: curfew doors refuse (`Portals.ts:186`); D5c fines by chance only | proposed (2.7) | A witness's Notice names a look, never a seat |
| I47 | **Theft from an owned shelf** (`ownership`, `crime: theft`) | logic-table.md 10, 11; world-mode.md 5 (theft fine) | **Not built**: B6b reads the theft fine from goods a public loss names; nothing makes such a loss | proposed (2.7) | B6b's design (10B brings it to 6Z first) |
| I48 | **The jail scrub's hour off the sentence** | world-mode.md 5.1; GDD 3.27 ("waits on the owner") | **Not built**: every sentence ends at the morning train | **owner** (Q-S5) | A Killer released after dusk can strike, which jail was meant to stop |

### 1.6 Ghosts, creatures and the wild

| Id | Item | Source | Code | Ready | Conflicts |
|---|---|---|---|---|---|
| I50 | **Wisp**: once per cycle a ghost flickers a lantern, rattles a door (noise 2) or nudges a clue a tile | GDD 3.7, 3.10 (V1.5); `ghosts.wispsPerCycle`, `noise.wispRattle` | **Not built**: the keys exist, no route | proposed (2.8) | A kill is private until the meeting (GDD 3.7): a Wisp before that tells the scene someone died |
| I51 | **Crows (and gulls, rats on the rooftops)**: noise amplifiers, "running is being seen" | WORLD 4.6 (V2); GDD 3.6, 3.10 (V2) | **Not built**: no `crow` mob | proposed (2.8) | None: a creature carries no seat |
| I52 | **Bog-wisp**: lures, blinds a light radius 5 s | WORLD 4.6 (V1.5) | **Not built** | proposed (2.8) | A blinded light changes what the server sends (3.15), so it must act on the light, never the seat |
| I53 | **The bog lurker** | GDD 3.6, 3.10 (V2) | **Not built**, and undesigned anywhere | proposed (2.8) | It may kill (a bite), so its day death returns on the train like any bite |
| I54 | **Bats (V2)** | GDD 3.6, 3.10 | **Built** as cave creatures (`mobs.json` `bat`, GDD 3.15) | done | None: this census counts the V2 line as met |
| I55 | **Poison (V2)**: bad food, spoiled stock | GDD 3.6 (V2 "poison"), 3.22 ("bad food, to come") | **Partly built**: Poisoned exists (rats, Nightshade is separate) | proposed (2.8) | Effects stop at 1 health (A6): poison food can never kill |
| I56 | **Deep mud** (Slowed) | GDD 3.22 ("to come") | **Not built** | proposed (2.8) | None |
| I57 | **Shove at the well** | GDD 3.6 (V1.5) | **Not built**: `ov.well` is a plain portal at Large | proposed (2.8) | A shove is an assault (B6's charges) |
| I58 | **Fists on ambient townsfolk** (the strike hook of A160 for non-guard figures) | GDD 3.24 | **Partly built**: guards take fists (B1); townsfolk do not | yes | A figure's knockout drops coins it holds (its `@figure` account) |
| I59 | **Two-player carrying** | GDD 3.5 (V1.5) | **Not built**, undesigned | proposed (2.8) | None |

### 1.7 Modes and talk

| Id | Item | Source | Code | Ready | Conflicts |
|---|---|---|---|---|---|
| I60 | **Proximity chat** (a lobby toggle) | GDD 3.5, 3.10 (V1.5) | **Not built** | **owner** (Q-S6) | NPC seats never type in words (living-world.md 1.1): free text by proximity would tell humans from NPCs |
| I61 | **Barks and the world lines**: more quick-chat lines, barks from figures and NPC seats at shared moments | living-world.md 1.4 | **Not built**: 8 lines, humans only | proposed (2.9) | A bark is drawn on the actor's own stream, the same kind of event for every actor |
| I62 | **Spectator mode** | GDD 3.10 (V1.5) | **Not built** | proposed (2.9) | Role secrecy: a spectator beside a player on a call is a channel; ghosts see every role |

### 1.8 Left out, and why

- **Assigned elsewhere.** 10V: Drag body, Plant Clue, the Crowbar on doors, Inspect with Lenses, Dust / Compare,
  Autopsy, the Rag, Wash, the Skeleton Key, Chalk, Act Shifty, Fake Blood, Hide, Check and Burst Out. 10B: B6a to B6d
  (the Tribunal, crimes, the vote's retirement, the end trial, the Law route, Gallows, Unseen, defrocking), B7 (the
  Inquest, the bell's purposes, NPCs presenting), B8b. 10C: C4b to C4d (the Derringer, the Dusk Train, the hardships,
  the Clerk's ledger), C5c, C6 (robbery, the town chest), C7 (the hazards). 10D: D2b, D4b, D9b. 10E: E1, E2. 10R: R1 to
  R6. The open fixes of 10X and 10Y.
- **Out by the owner's ruling.** The Beast and the Cave Gate, the Grounds 99 bosses, the first-person renderer, voice
  chat, cosmetics (achievement rewards are E1's), the Lottie reveal and the Light2D experiment (presentation).
- **Art.** Every new look (I3, I4, I11 to I15, I30) and scene (I42) ships an id and a placeholder in round 10; the
  pictures are round 11's Blender pass (2.10).

## 2. The missing design

Each subsection is _proposed_ unless it says otherwise. A key not yet in `balance.json` is marked _new_ with a proposed
value for the balance lab; every other number is a key that holds it.

### 2.1 The world-mode deal (I1, I3, I4)

6Z's ruling (2026-10-30): this goes first in wave 2, since no step of the plan builds it.

**What world mode deals today.** World mode replaced the main mode at B6 with no flag (6Z, 2026-10-30), but the deal
is still the main mode's:

| Today (the base at `6c9bb79`) | Where |
|---|---|
| A party of 1 to 3 humans is filled with NPC seats up to `players.min` (4) at Start, and the leader may add NPCs up to `players.max` (10) | GDD 3.12; `rooms/handlers/lobby.ts` |
| The deck is `roles.json` `decks[n]`, n the seat count clamped to 4 to 10, holding n + 2 cards | `sim/Deck.ts` `deckCardsFor` |
| Every Killer card is dealt, to any seat on `deal`: an NPC may hold the Knife | `Deck.ts` `dealMainDeck`, `rules/deck.ts` `dealDeck` |
| Two non-Killer cards stay undealt, and a cover role is offered those as hints (`coverHints`), private on the role card | `Deck.ts` (`flow.undealt`), `sim/Covers.ts`, `rules/deck.ts` `coverHints` |
| The Killer draws one vendetta among the four rows; the Zealot needs a dealt Vicar (`needsCard`), the Bandit and the Hitman need the Train | `vendettas/state.ts` `drawVendettas`, `vendettas.json` |
| The 10-seat deck deals two Killers | `roles.json` `decks["10"]` |
| Two humans and at least one NPC play Paint The Town Red | `Deck.ts` `dealPaintTown` (C5) |
| The card holds `phases.roleRevealS` (20 s) | `balance.json` |
| `startSpawns` and `meetingSpawns` hold `players.max` spawns; the cell holds ten | `maps/*.json`, `scenes/cj_cell.json`, the content check |

**What has to change** (`world-mode.md` 1.2 to 1.4 and 4.1, F4, 6Z's C4 and C5 rulings):

1. **When it runs.** H, the human seats, decides: H = 1 is story mode (E2), H = 2 Paint The Town Red (built), H from 3
   the world deal below. The main mode's decks stay only for the auto room and the debug deal; the lobby no longer
   fills to `players.min` for a world match, and Add NPC is refused in world mode (the roster fixes the NPC seats).
2. **The roster.** `maps/<id>.json` gains `roster`, the card ids the map deals (no count), validated to at most 27
   cards (the trait triples), every vendetta partner and the Killer once. HollowMere's today: the Killer, the
   Accomplice, the Drifter, the Detective, the Doctor, the Vicar, the Watchman, the Herbalist, the Gamekeeper and the
   four professions (13); each new card joins when its pull request lands (N1 to N5, T1). Every cover card wears a
   picked card, and **every worn card is withdrawn**, so no worn card has a seat (6Z's review of #420, fix 3). With W
   the roster's wearing covers (the Killer, the Accomplice, the Drifter and, once it ships, the Thief), the seat count
   is the roster less W, the same in every match of a map, plus one in a Bandit match (the Bandit wears his own skin).
   The content check refuses a roster whose seat count (roster less W) is under `players.max`. `startSpawns`,
   `meetingSpawns` and the cell's spawns are checked against the largest seat count instead of `players.max`;
   `players.max` stays the cap on humans.
3. **One Killer, human.** One human is dealt the Killer on `deal`. No roster holds a second Killer card (C5's Paint
   deck keeps its own). An NPC Killer stays in the engine for story mode and the auto room (WM1); this deal never makes
   one. An Accomplice inherits the Knife only when it is human (world-mode 6, "Inherit").
4. **The vendetta.** The Killer draws on `vendetta:<seat>` among the rows whose new `minHumans` (_new_ field: Zealot,
   Activist, Bandit 3) is at most H and whose map rule holds. The Hitman row is never drawn (C4a).
5. **The partners.** `needsCard` becomes `partners` (_new_, a list). The drawn vendetta's partners go to humans on
   `deal`. The interim partners stand (WM8): the Zealot's Vicar, the Activist's Watchman, the Bandit's Gamekeeper.
6. **The other humans** draw a roster card each on `deal`, never the Killer, never the Accomplice below
   `deal.accompliceMinHumans` (_new_, 6). **Enough looks stay free.** L is the roster's look-bearing (non-cover) cards;
   each wearing cover needs one of them unheld. While the humans still to deal would leave fewer than W look-bearing
   cards unheld, the next human takes a cover card instead (the Drifter, the Thief, the Accomplice from 6 humans). On
   HollowMere's 13 cards (L = 10, W = 3), H = 10 deals the Accomplice and the Drifter to humans; with the Thief in the
   roster, H = 10 deals all three. The content check above makes every H up to `players.max` dealable.
7. **The pick** (6Z's ruling, A276; a departure from world-mode 4.1, which had every cover pick "from what the Killer
   left"). At Start, on `deal`, the unheld look-bearing cards are split: the Drifter and the Thief are each dealt an
   offered list of their own, `deal.coverListSize` (_new_, 2) cards, disjoint from each other's and from the Killer's;
   the Killer and the Accomplice share the rest, which is always the longest list. The Killer picks first, and the
   Accomplice picks live from what the Killer left (Cabal may know each other's pick). No list shrinks or is bumped
   because of another seat's pick outside the Cabal, so nothing a non-Cabal cover sees tells which look the Killer
   wears. Each list reaches its seat as today's `coverHints`, the first hint marked. A Bandit has no pick. An NPC cover
   wears its first hint. `phases.roleRevealS` becomes 30 (world-mode 7.1). **Why:** a list that shrank live, or a
   colliding pick bumped at the close, would tell a Drifter or a Thief which look the Killer took, which is a
   cover-wearer's true role (CLAUDE.md).
8. **The seats** (6Z's review, fix 1; this census's choice: every seat is made at Start). At Start, in one tick, the
   server makes every seat of the match, human and NPC, each under a fresh id from `generateId()` that no client can
   link to the lobby: the map from session to seat lives in room memory, and each client learns only its own seat id,
   in its private view. Seats enter `GameState.players` in the order of their fresh ids, which tells nothing. NPC seats
   take their names from `npcNames` and every seat its traits on `traits`, in that order. An NPC seat holds no card
   until the card closes; then it takes one of the cards left after the picks, on `deal`, and every seat's
   `Player.look` is written in one tick as today. There is no undealt card: the roster's cards are all held or worn.
**Secrecy.** In world mode the Killer is always human, so anything that tells which seats are human narrows the Killer
to the other H − 1 (GDD 3.12, "Hidden seats"). So, from Start to game over in a world match:

- **Ids.** Seat ids are fresh, never the lobby's session ids; `leaderId` is '' (the leader matters only in the lobby).
- **Names and profiles.** `Player.name` and `Player.profile` are '' for every seat (fix 2, row 27). The game-over
  frame pairs each seat with its name and profile.
- **Connection.** `Player.connected` is not public per seat: it reads true for every seat. The party panel shows who is
  connected by name only, from a `GameState.party` list of `{name, connected}` sorted by name, with no seat id.
- **The order and the count.** Seats enter in fresh-id order, all in one tick; the count tells only "a Bandit rides",
  which world-mode 4.2 accepts.
- **The worn cards** never have a seat, so no two figures share a look and the "counter-claim" of GDD 3.17 cannot
  happen. `Player.look` carries a worn look exactly as a real one.
- **Streams.** The pick draws nothing; the human-first steps and the lists use `deal`, the NPC seats `npcNames` and
  `traits`, the vendetta its own stream. `debug.deal` learns the human-first rule (WDI_DEBUG only).

Other places that tell a human from an NPC seat, for their owners: named chat at an Inquest (NPC seats write only
notes, B7: in world mode a named line carries the speaker's character, and NPC seats write named lines from the
templates too, or named chat goes); the quick-chat wheel (M1's barks); the cuff, the petition's opener and signers
(already anonymous counts). Each of their pull requests checks it.

**The true look (I3).** `Private.trueLook`, the vendetta's look id (`zealot`, `activist`, `bandit`, and `hitman` from
the turning), on the seat's own view only. The own client draws its own figure in it and shows the worn look as a HUD
badge; impersonation shows the borrowed face on the badge. Every client loads every true-look atlas of the map's
vendettas with the deck, whatever its card. Seams row 26.

**The Bandit (I4).** A new card look `bandit`, public, with no worn card: the Killer's `Player.look` is `bandit`. The
nameplate reads "the Bandit" (I2), never a name, until game over or a death sentence.

**Nameplates (I2).** In world mode a seat's nameplate and every portrait label read its character: the lore name and
card name of `looks.json` (`loreName`, _new_ field), else the card name. The server sends no name or profile for a seat
during the match (fix 2), so the anonymity holds on the wire, not only on the screen; the end screen pairs characters
with player names from the game-over frame. The lobby, the party list and the friends list keep names, with no seat id.
Seams row 27.

### 2.2 Routes, the ledger and conversion (I5, I6, I9)

**The rule.** A route is checked by the server on bus events, never by a client, and is settled at the latest at game
over. Nothing holds a match open for a route: world-mode 3's "every open personal goal settled" becomes "the match ends
when the Killer is stopped or at the end trial's close, and every route is settled at that moment". A route met before
the end is final; one unmet at the end is missed.

| Route | Card | Met when (_proposed_) |
|---|---|---|
| Healer | Doctor | at game over: every after-dark body of the match was autopsied (10V's Autopsy) by anyone, and the Doctor stopped a Bleeding or cured a Poisoned on at least `healer.cures` (_new_, 3) other seats |
| Watch | Watchman | the first time "Your watch held" is written (built, `NightPowers.ts`) |
| Trade, Lamplighter | Lamplighter | every square lantern post was lit at every dusk by `lamp.litByS` (_new_, 60 s) into it, by anyone; lighting needs I37's lantern posts |
| Trade, Baker | Baker | a Wake Loaf was baked at Crumb's Ovens every day before `bake.byDayFrac` (_new_, 0.5) of the day, by anyone |
| Trade, Medium | Medium | every after-dark death's ghost was heard at a seance (I15) |
| Peaceful | Vicar | every living, placed seat other than the Vicar is converted (below) at any moment before the end trial |
| Role, Herbalist | Herbalist | Nightshade took the Killer or the Accomplice |
| Role, Gamekeeper | Gamekeeper | the Last Shot took the Killer |
| Town | every seat that finished a real task | the bar reached full before the Killer's vendetta completed |
| Law | Ranger | his arrest (I13) ended in a murder conviction of the Killer |
| Solo | Thief | he left by the sea door holding `thief.heirloomsNeeded` (_new_, 3) Heirlooms |

"By anyone" keeps a route from marking the card: the Lamplighter's win is the town's lanterns, so a cover wearing the
Lamplighter's look who lights them all helps the real one. The route belongs to the dealt card, which only its seat
and the end screen know.

**Conversion (I9).** A seat is converted when its private `faith` reaches `conversion.faithAt` (_new_, 60). Faith
already comes from donations and the cot; the sermon adds it: when the Vicar's card rings the bell (B7's gathering),
every seat that stands in the hub within `conversion.sermonTiles` (_new_, 6) for `conversion.sermonS` (_new_, 30)
afterwards gains `conversion.sermonFaith` (_new_, 10), once per day per seat. A cover in the Vicar's look rings and gets
the ding (world-mode 3.1: a look is not a power). Nobody learns another seat's Faith; the Vicar's own view gets a count
of converted seats, never names (`Private.converted`, row 28). An NPC seat attends a sermon it hears as a reaction (the
bell band of 3.12) and gains Faith like anyone.

**The ledger (I5).** At game over `S2C.gameOver.victories`: one row per seat that won, `{seatId, kind}`, kinds from
`Victory` (_new_, append-only: law, peaceful, heir, bounty, deadLetter, role, town, trade, verdict, gallows, getaway,
unseen, paintTown, following, redemption, contract, watch, healer, solo). Public at game over only, when every role is
public anyway (GDD 3.17). Live progress is private: `Private.route {kind, step, of}` on the seat's own view, so the
card can tick (rolecards.md 4.4). Seams row 28.

### 2.3 The vendettas' world-mode steps (I7, I8)

Each keeps GDD 3.20's rule: the steps are public only as what they do in the world, `vendetta.<kind>.<step>` bus
events name no seat, and the consequence fires once. Each replaces the round-7 goal in world mode; the round-7 goal
stays its first step.

- **Zealot, the Following.** Step 1, the doubt (built). Step 2, sigils: a `sigil` hold (`vendettas.following.sigilS`,
  _new_, 6) at a key building's door prop leaves a public chalk sigil (a prop state on the door, row 3) on
  `vendettas.following.buildings` (_new_, 5) of the listed buildings (`maps/<id>.json`, _new_ `keyBuildings`). Anyone
  can wash a sigil with the Bucket's hold (10V's Wash), which undoes that building. Step 3, followers: an NPC seat or
  figure whose mood is Scared and who stands in a sigilled scene for `followerS` (_new_, 60) becomes a follower (room
  memory, never on the wire), up to `vendettas.following.followers` (_new_, 6). Step 4, the Dark Mass: a 15 s
  (`massS`, _new_) hold at the chapel altar or the Deep Cave altar after dark with 6 followers within reach. Victory:
  Following. A follower shows nothing but its routine walking to the altar at night.
- **Activist, Redemption.** Step 1, Disarray: the round-7 tamper, 1 to 3 acts (built as two stations). Step 2, Public
  Unrest: the Activist rings the bell (B7) and `vendettas.redemption.crowd` (_new_, 4) NPCs gather; Anger rises in each
  by `unrestAnger` (_new_). Step 3, the Baron: on the day after Unrest the morning train brings a figure, the Railroad
  Baron (a guard figure of 3.24 with the `railroadBaron` look, the relation row already named), who walks a route of
  the hub until dusk and leaves on the Dusk Train. The Knife reaches him like a guard (C5c's rule). Step 4, Redemption:
  if the Baron dies, the Activist must be tried and walk free: she may open a petition against herself (charge
  sabotage), and a Dismissed or fined Tribunal is the Redemption victory. The Company Clerk keeping the Baron alive
  until he boards is the Heir route (world-mode 2), held by the guard Clerk's card if one exists (Q-S2); else none.
- **Bandit, the Getaway.** Four robberies, each a hold of `vendettas.getaway.robS` (_new_, 8) after dark with no other
  living seat in the scene: the bakery's till (leaves a coin, the "tip", as a public prop state), the chapel plate, the
  bank vault (the round-7 strongbox, built), and on the last day the express safe on the Dusk Train's platform car
  (a prop present from `train.dusk` for `train.dusk.leaveAtS`). Each pays from the town as the heist does
  (`economy.heistShare` rules) and leaves a footprint of his height. Then he boards the Dusk Train: Getaway. The
  six-shooter (`sixShooter`, bound like the Derringer of row 21) fires only at a figure drawn as a seat that holds a
  Constable's warrant against him or that struck him, by day too; its hit is a bite-class hit (damage, never the
  Knife's kill), so it can kill only as a bite does, and the death returns on the train.
- **Plot traces (I8).** Five clue kinds appended to `ClueKind` after 10V's `timeOfDeath` (12): `candlewax` (a sigil or the Mass), `powder` (a tamper),
  `casing` (the six-shooter), `flourDust` (the bakery robbery), `waxSeal` (the Hitman's opened letter). Each is laid where
  the step happened, Reader Anyone, value 0, and briefed like any clue (row 8). At a Tribunal a trace is a match only
  as part of a **set**: the warrant's or a presenter's entries holding every trace kind of one vendetta's list
  (`vendettas.json` _new_ `traces`). The **jail search** (F4 2.9): when a seat is placed in the cell, the server
  searches its pack and belt, and if it holds every item of one vendetta's tool list (_new_ `tools`: sigil chalk and
  candles; black powder and a wrench; the Bandit's sack and a crowbar), a Verified `toolSet` entry goes to the Tribunal
  as a Constables' entry. A partial set adds nothing, and bound kit is never read.

### 2.4 The new roles (I11 to I18)

Every new card joins the roster (2.1) and the decks rows of the main mode stay as they are (the main mode retires at
B6c). Each gets a `townWork` row (I37), a look id with a placeholder (2.10), and rolecards.md lines with its build.

- **Butler.** Lock / Unlock (`lockUnlock`): a hold of `abilities.json` `lockUnlock` time at a house door within reach;
  locking sets the portal's public state `locked` for `doors.butlerLockS` (_new_, 90) and refuses entry from outside
  (`LOCKED`); anyone inside may always leave and unlock from within (GDD 3.7). The Ledger (`ledger`): at each Inquest
  and Tribunal open, the Butler's Notebook gets, for each living seat, the last house it entered since the last such
  phase, as a reading (a `NoteKind` of its own, seams row 24, so it never attaches to a petition) naming the seat (a
  power sees through a face, as the night powers do). The Killer's Lock
  door (`killerLock`) is the same lock for `abilities.json` `killerLock` time, as a second use of the Skeleton Key in
  the Killer's kit, so the card keeps its three abilities (GDD 3.2).
- **Child.** Silent hide: 10V's hiding spots, plus the `crawlspace` spot kind only the Child may enter; entering is
  silent and a Check by any other card refuses (`NOTHING_THERE`, the same as an empty spot). Witness: within 6 tiles
  and line of sight of a Knife kill, the Child's Notebook gets the killer's height and scarf as a reading (row 24's `NoteKind` rule), at once (not
  "at the next meeting"). "Cannot pick up items" becomes: the Child cannot take from a body, a coin heap or a dropped
  item (`CHILD_CANNOT`, _new_ reason); it gathers, buys, crafts and turns in quests like anyone, so the economy holds.
  Vision −1 tile by `vision.childDelta` (_new_, −1).
- **Ranger.** Shoot: the Crossbow (bound) fires a Bolt (`act.ability {abilityId: 'shoot', targetId}`) at a creature in
  `abilities.json` range: it dies (one bolt). At a seat it is refused (`NOT_A_TARGET`). Snare: I27. Footprints he
  collects are read as 180 s fresh (GDD 3.4). **Arrest** (Q-S1 default): once per match, the Ranger cuffs at bolt range
  instead of in reach: during a manhunt, a figure drawn as the accused within `abilities.json` `arrest` range is cuffed
  by a 1 s aim (row 14's cuff, lands on the seat behind the face) and the Bolt is spent; outside a manhunt it is refused
  `NOT_HUNTED`. His Law route needs that cuff to end in a murder conviction of the Killer. Nothing bypasses the
  petition: the town still decides who is hunted.
- **Thief** (Neutral, a cover role like the Drifter, picking from its own offered list, 2.1 step 7). Lockpick: the
  universal pick (D5) at one tier higher (`thief.pickTierBonus`, _new_, 1). Pickpocket: a 2 s hold behind a seat in
  reach (`abilities.json` `pickpocket` cooldown) takes one random non-bound item of its pack; the victim learns of the
  loss only by its inventory, and it is a theft charge (I47) if a witness's Notice or the victim petitions. Smoke: a
  smoke cloud prop for `abilities.json` `smoke` time, public to the scene, that blocks sight through its tiles (the
  `u` ground rule of 3.15). The sea door (`ce.sea`) opens on the nights of `thief.seaDoorNights` (_new_, [2, 4]) at low
  water; leaving through it with the Heirlooms is the Solo route; he leaves play like the boarded Hitman (row 21:
  `Private.departed`). Heirlooms: three placed by the `valuables` loot tables (I21) and nowhere else.
- **Medium.** Seance: an 8 s hold with the Seance Chalk at a body of an after-dark death (a day body's seat is on the
  line and has no ghost: refused `NOTHING_THERE`, the same as at a body already heard). The ghost gets a private prompt
  of eight phrases (`seance.json`, _new_): the killer's height (3), scarf (3), "I saw nothing", "Look to the woods". It
  answers within `seance.answerS` (_new_, 20) or the line is "The dead are silent." The Medium's Notebook gets the
  phrase as a reading of its own (row 24's `NoteKind` rule), never Verified ("Cabal ghosts may lie"). **An NPC ghost
  answers like a person** (6Z's review, fix 5): after a delay drawn on its own `npcTiming:<seatId>` stream over the
  span of `seance.answerS`, and silent with chance `seance.npcSilentChance` (_new_, 0.15), as a person might be; it
  names the killer's trait unless Cabal, when it names a trait not the killer's, both on `npcPlay:<seatId>`. Every
  ghost, human or NPC, makes the same draws, so neither the delay nor a silence marks a seat (A39's ready delay is the
  precedent). Nothing else of the ghost's view reaches the Medium. A seance can run only once the
  death is public (after a meeting or a Tribunal revealed it), so it never tells of a private kill.
- **Lobby toggles and the faction-only reveal (I16).** `Settings.roster` (_new_, the cards dropped from the roster,
  default none, the Killer and the vendetta partners never droppable); `Settings.revealMode` unlocks: `faction` shows a
  death sentence's faction instead of its role; game over is always full.
- **Forged Alibi (I18).** An Accomplice kit item: used at a station, it writes a task alibi entry (scene and tick) of a
  chosen earlier tick in the last `forgedAlibi.backS` (_new_, 120). The entry is Claimed like any alibi; Inspect (10V)
  marks it Forged.

### 2.5 Kit (I25 to I29)

- **Armour's resistances.** Warmth (the Quilted coat): a human has no Fear, so warmth halves the Famished clock's rise
  at night (`armor.warmthFamishedMult`, _new_, 0.5) and an NPC wearer's Fear as written. The Miner's cap: a carried
  light of radius `items.json` +1 tile in a dark scene, lit and doused with `act.light` like a lantern; it shows as the
  lantern bit (GDD 3.15). Tin mail: footsteps +1 tile (`noise.walk` + `armor.footstepTiles`, _new_). Tin helm: Dazed
  lasts half (`resist.dazed`).
- **Recipe teaching (I26).** `Private.recipes` (_new_, ids learned), row 29. A taught recipe is a row with `taught:
  true`; the craft refuses `NOT_TAUGHT` until a quest reward, a lore lead or a chore teaches it. Moll's step 2 offers
  Stew or Remedy and the seat's pick is its one branch for the match (`branch`, private). Ada Kerrow's teaches Tin mail.
  Pell, Hask and the Collier get the second steps of living-world.md 1.3 (the Ferry run, the rack count, the kiln).
- **Snares (I27).** `act.ability {abilityId: 'snare'}` lays the held Snare on the seat's tile as a hidden prop: drawn
  only for its layer and for any seat within `snare.seeTiles` (_new_, 1). A seat or creature entering the tile is held
  for `abilities.json` `snare` time and Slowed after; the layer's Notebook gets "Snared: {look} at {scene}" (the drawn
  look, never a seat). Any seat may disarm a seen snare (a 2 s hold, takes the Snare). Rope frees a held seat in reach
  at once. A snare holds one victim, then is spent. The Ranger's bear traps are his kit's Snares.
- **Handcuffs (I28).** Held in the hotbar, they cut row 14's cuff hold to `law.cuffHoldS × handcuffs.holdMult` (_new_,
  0.5); the cuff spends them. Sold at the general store. They change nothing outside a manhunt.
- **Candles for all (I29).** Every card's start kit without a light gains one Candle (`roles.json`). No new rule.

### 2.6 The town (I30, I33 to I43)

- **The Trades (I30).** Postmaster: its route, Dead Letter, is to steam open the Hitman's letter at the post office desk
  (a 10 s hold after a delivery that turned someone) and burn it, which lapses the contract (C4b's lapse). Bartender:
  the Bounty route, a petition he opened ends in a conviction of the Bandit. Undertaker: Chief Coroner, two bodies
  carried (two-player carrying, I59) to the surgery before the morning train's cart takes them. Each is a card with a
  look and `townWork`. The Clerk: Q-S2.
- **Chores (I33).** A chore is a station hold anyone may start at a work station of `routines.json` (`chores.json`,
  _new_): it pays `chores.wage` (_new_, 1) up to `chores.perDay` (_new_, 3) a day, writes an alibi entry, never moves
  the bar. Errands: a quest of kind `errand` offered by a figure in a mood (living-world.md 1.2 table), one at a time,
  cooling `errands.cooldownFrac` (_new_, 0.1 of a day). Standing: `Private.standing` (row 29), three steps by chores and
  errands done (`standing.knownAt`, `trustedAt`, _new_), which add one errand slot and the stallholders' discount.
- **Examine lines and leads (I34).** `lore.json` gains `examine` lines on the 23 props (living-world.md 1.7's drafts)
  and `lead {kind, ref}` on volumes; a read lead is a private Notebook entry. Nothing on the wire beyond the reader's
  own view.
- **Faith (I35).** The vigil (two or more seats in the chapel at dusk: `faith.vigilPerMin`, _new_), the shrine chore
  (light a candle at the wayside altar), devotional reading (`lore.json` faith shelves), the Scared villager's escort
  errand. Sinks: the ward (creatures keep `faith.wardTiles`, _new_, further from the buyer until dawn) and the blessing
  (the chapel HQ tier).
- **Skill checks (I36).** Haggling (tap) at a shop moves its price by `haggle.pct` (_new_, 0.1) either way; the altar
  offering (pour) adds `faith.offerBonus` (_new_); tempering (stoke) sets a forged item's quality tier; butchering
  (crates) a skin's yield. The Done control after `assistS` gives the base result.
- **Town work (I37).** Each `none` row gains a rule that reads the look's state (row 15): the Lamplighter's look at
  work lights the square's posts at dusk by itself; the Doctor's keeps a surgery counter selling Bandages; the
  Fisher's adds fish to the market's stock each day; the Tinner's adds tin ore to the forge's; the Gamekeeper's keeps
  the wolf habitats' leash short; the Watchman's keeps the curfew doors locked at night; the Detective's halves a
  briefing's delay; the Medium's none. A look gone stops its rule at the next meeting's reveal, never at the kill.
- **Windows and stations (I38).** Each home interior and each look's work station is a prop with a public state
  (row 3): a home window `lit` or `dark` from dusk, a station `warm` or `cold`. Both follow one rule in
  `townWork.ts`: lit and warm while the look is at work, dark and cold while it is gone, thin (owing the line),
  dormant (the Hitman) or in hardship, so the four signs are one sign (6Z's C4c ruling). Lit-window silhouettes: from
  dusk, a lit window shows the outline of each figure standing within `windows.silhouetteTiles` (_new_, 3) of it
  inside, to seats outside in sight of the window; an outline carries no look, height or handle.
- **New places (I42).** `cottage_fisher` (the Fisher's home, Small), `sea_exit` (the Thief's exit, a one-way out of the
  map), and the south-east light as an overworld light. Greybox scenes, ids appended to `SCENE_IDS`.
- **Fog and the minimap (I43).** The client keeps the tiles of each scene its seat has seen; a minimap draws the map's
  scenes and the seat's own position, never another figure's. Client only.

### 2.7 The law's gaps (I44 to I47)

- **Forced labour.** An Indebted seat may work its debt off at the Clerk's ledger: the C2b errand hold, worth
  `rent.amount` of debt. It is open to every card, so it marks nothing.
- **The heresy trial.** With the vote gone, a presented Parish Seal at a Tribunal of the Vicar's look (or any seat) on
  a religious charge moves the case to a heresy trial: the charge becomes `heresy` (laws.json), and its sentence is
  defrocking at the murder threshold (B6's rule), else dismissed.
- **Trespass Notices.** A seat (human or NPC) in sight of a lock being picked, a door being broken or a seat lying on
  a boarded bed gets a Blackmail Notice naming the drawn look and the scene (the rumour ledger's form). The curfew
  doors carry a `lock {keyId, tier}` and `curfewBars` calls the resolver: a pick, a key or a crowbar opens one.
- **Theft.** A shelf of a shop is `owned`; taking from it (a 2 s hold) is theft, refused nothing, and leaves a
  `missing` prop state for the day: the "public loss" B6b reads. A witness writes a Notice.

### 2.8 Ghosts and creatures (I50 to I59)

- **Wisp.** A ghost whose death the town has seen (a meeting or a Tribunal revealed it) may Wisp once per cycle: flicker
  a lit light in its scene (the light goes out for 1 s), rattle a door (noise `noise.wispRattle`) or nudge an
  uncollected clue one tile. A ghost of a private death has no Wisp. **NPC ghosts wisp too** (fix 5): an NPC ghost whose
  death is public wisps once in a cycle with chance `ghosts.npcWispChance` (_new_, 0.5), at a tick and a kind drawn on
  its own streams, so a wisp never marks a human ghost, and a known dead human never narrows the living Killer.
- **Crows (I51).** A `crow` creature of the rooftops and the marsh dock: no attack, no health worth hunting, flies off
  (a public clip) and caws (noise `noise.crow`, _new_, 6) when a seat runs within `mobs.json` senses. Gulls are crows at
  the dock. Running near them is being heard.
- **Bog-wisp (I52).** A `bogWisp` creature of the marsh and the cave pools: drifts toward a seat that carries a lit
  light, and on touching it puts the light out (`act.light` off) and the light cannot be relit for 5 s
  (`mobs.json` row). It never attacks.
- **The bog lurker (I53).** A `bogLurker` creature at the deep-water edge of the Fenwood: waits submerged (not sent),
  surfaces at a seat standing still on a shore tile for `lurkS` (_new_, 4) and bites once (a bite row, Bleeding chance),
  then sinks for `chaseS`. Its kill is a bite, cause `creature`.
- **Poison (I55).** Bad food: a food stack has a `spoiled` flag set by a hardship (C4c's spoiled stock) or by tainting
  it with Nightshade's leftovers (`taint`, a new hold any seat may do with a Poison vial, _new_ item, sold at the black
  market). Eating it applies Poisoned. It stops at 1 health (A6).
- **Deep mud (I56).** Ground `m` in the marsh and cave scenes slows a seat on it (Slowed) while it stands there.
- **Shove (I57).** `act.ability {abilityId: 'shove', targetId}` at a seat within 1 tile of `ov.well`: it drops through
  the well portal (the one-way noise and landing trail). An assault charge.
- **Fists on townsfolk (I58).** A160's strike hook for non-guard figures: a figure knocked out drops its takings.
- **Two-player carrying (I59).** A body or a `heavy` item (the strongbox, the express safe) moves only while two seats
  hold the carry within 2 tiles of it, at walking speed; one letting go drops it.

### 2.9 Talk and spectators (I60 to I62)

- **Barks and world lines (I61).** The quick-chat pool grows by the world lines of living-world.md 1.4. Figures and NPC
  seats bark a pool line at shared moments (a bell, a wolf near, a lantern lit), drawn on their own streams; humans
  send the same lines from the wheel. No free text outside meetings.
- **Spectator mode (I62).** A spectator joins a running party as no seat, and never counts for anything. Colyseus syncs
  the public `GameState` to every client live, a spectator included (fix 6), so the two parts are:
  - **Live** (the public root, as every player has it): the phase and its clock, the roster rows (no names and no
    profiles during a world match, fix 2; `connected` true for all; looks, traits and `alive`, which flips only at a
    reveal), the public petition, manhunt and Tribunal rows, `hq`, and the party panel by name. None of it locates a
    seat or names a player: the roster carries no scene and no position, and the scene-scoped state (avatars, props,
    clues, bodies, creatures) is behind each client's view, which a spectator's is empty of.
  - **Delayed** by `spectator.delayS` (_new_, 120): one scene at a time of its choice, as a `spectator.frame` message
    built from a server-side buffer of that scene's public state, as a living seat in the scene would have seen it then
    (no roles, no ghost view, no private view). No chat.

  At game over it gets the end screen, names included.

### 2.10 Looks and art

Each new card or true look gets a `looks.json` row and an atlas key `char/<lookId>/<anim>/<dir>`. Until round 11's
renders, the client draws a placeholder from `tools/sprites/placeholder.ts` (a tinted body with the look's initial),
never the `villager` body (which marks a figure) and never a fallback that depends on the viewer's card.

## 3. The wire

Draft rows for `seams.md` 3, numbered after #400's rows 20 to 24 (rows 23 and 24 are 10V's evidence verbs). 6Z adds
them; a builder waits for its row.

| Order | Row | Class | Pull request |
|---|---|---|---|
| 25 | The world-mode deal and the hidden seats (I1, W1a, W1b; 6Z's review of #420, fixes 1, 3 and 4): with three or more humans the deck is the map's `roster`. At Start every seat of the match, human and NPC, is made in one tick under a fresh id (`generateId()`) that no client can link to the lobby's session ids; the session-to-seat map lives in room memory, and each client learns its own seat id only in `Private.seatId` (_new_). Seats enter `GameState.players` in fresh-id order. From Start to game over `Player.name` and `Player.profile` are '' for every seat, `Player.connected` is true for every seat, and `leaderId` is ''; the party panel reads `GameState.party` (_new_), `{name, connected}` rows sorted by name with no seat id. The seat count is the roster less its wearing covers, the same in every match of the map, plus one in a Bandit match (public by design, world-mode 4.2). Every worn card is withdrawn and never has a seat. Each cover's offered cards reach its own client only, as today's `RoleReveal.coverHints`: the Drifter's and the Thief's are their own disjoint lists dealt at Start; the Killer and the Accomplice share the rest, and the Accomplice sees the Killer's pick live (Cabal). No list changes by a non-Cabal seat's pick. An NPC seat takes its card at the card's close, and every `Player.look` is written in one tick as today. The game-over frame pairs each seat id with its player's name and profile. No field, order, count or event tells a human seat from an NPC seat, which card was worn, or that a cover picked | `Private.seatId`, `coverHints` own client only; `party` and the roster public; the names at game over | W1a (joins 7), W1b |
| 26 | The true look (I3): `Private.trueLook` (string), the look the seat's own client draws for its own figure: `zealot`, `activist` or `bandit` from the deal for the Killer of that vendetta, `hitman` from the turning (row 20) for the turned seat, '' otherwise. Every client loads the true-look atlases of every vendetta the map allows with the deck, whatever its card, so a load never tells a card. No avatar, roster row or message to another client carries it; a cover's public look stays `Player.look` | own client only | W2 (joins 7) |
| 27 | Characters on the plate (I2; fix 2): during a world match the server sends no player name or profile for any seat (row 25); the client draws every nameplate, portrait label and Tribunal or Inquest label from `Player.look` through `looks.json` `loreName`, else the card's name. `S2C.gameOver.names` (_new_) `{seatId, name, profile}[]` pairs seats with players, in the game-over frame only. The lobby and the party list keep names with no seat id | names public at game over only | W1a (server), W3 (client) |
| 28 | Routes and the ledger (I5, I6, I9): `Private.route {kind, step, of}`, the seat's own route progress, and `Private.converted` (u8), the Vicar's count of converted seats, never names. `S2C.gameOver.victories` (optional) `{seatId, kind}[]`, sent only in the game-over frame, `kind` from the append-only `Victory` list. No count, step or kind changes any other client's view before game over, and a route's progress moves only on the seat's own view | `route`, `converted` own client only; `victories` at game over | W5, W6 |
| 29 | The seat's learning (I26, I33): `Private.recipes` (string list, recipes taught), `Private.branch` (string), `Private.standing` (u8: 0 Stranger, 1 Known, 2 Trusted). Each is moved only by the seat's own quest, chore or reading | own client only | K4, T3 |
| 30 | Windows and stations (I38): row 3's `PropState` gains the states `lit`, `dark`, `warm`, `cold`, `missing` and `sigil`. A window and a station follow one rule of the look's work (row 15: at work, thin, gone, dormant, hardship), so a dark window and a cold station never tell a hardship from the Hitman or a seat owing the line; they read `Player.look`, `Player.alive`, the fare and the hardship, never the sim's death, `Avatar.lookOf` or the card. A silhouette is a scene `Silhouette {windowId, x, y}` sent only to seats outside in sight of the window, carrying no handle, look or height | public to the scene | T4 |
| 31 | The snare and the smoke (I27, I14): a set snare is a scene prop `{id, x, y}` sent only to its layer and to seats within `snare.seeTiles`; a held seat shows the existing Slowed sign; the layer's Notebook entry names the drawn look (`Avatar.lookOf`), never a seat. A smoke cloud is a public scene prop for its time, and the server's sight rule treats its tiles as blocking | snare: layer and seats in reach; smoke: public to the scene | K6, N4 |
| 32 | The Medium's seance (I15): `S2C.seance {phrases}` to the ghost alone when a seance on its body completes, `seance.answer {i}` from that ghost's client, queued and consumed in `step()`, and the Medium's Notebook reading (row 24's `NoteKind` rule). The prompt reaches a ghost only for a death the town has seen; a seance on an unseen death or a day death is refused like an empty one. An NPC ghost answers after a delay drawn on its own `npcTiming` stream within `seance.answerS` and is silent with `seance.npcSilentChance`, so neither the timing nor a silence tells an NPC ghost from a person (fix 5) | ghost and Medium only | N5 |
| 33 | Spectators (I62; fix 6): a `spectator` client role in the room with no seat. Live, it receives only the public `GameState` root that every client receives (row 25's anonymous roster with no names, no scene and no position; the petition, manhunt and Tribunal rows; the phase); its view holds no scene-scoped state. Its picture of the world is `spectator.frame`, one scene of its choice rebuilt from a server-side buffer `spectator.delayS` old, from that scene's public state only. Never a `Private`, a role, a ghost tag or a chat channel; names only at game over | the spectator only | M5 |
| 34 | The Wisp (I50): `act.wisp {kind, targetId}` from a ghost whose death is public, queued and consumed in `step()` and refused with A1's reasons; its effect is the public one any seat could cause (a light out for 1 s, a rattle's noise, a clue a tile over). NPC ghosts whose death is public wisp too, by `ghosts.npcWispChance` on their own streams, so a wisp never marks a human ghost (fix 5). Nothing names the ghost | public to the scene | M2 |

Every row joins schema version 7 in merge order. The leak test of round 8 (A170) runs on each.

## 4. The build plan

Pull requests under 400 lines, each with its tests; GDD changes in the same pull request. "After" names a pull request
of this plan or of the live sessions. Models by section 0's rule.

**Who builds each step (6Z, A276).** The steps and their order stand. 6Z gave the Opus steps of the three Sonnet
sessions to Opus sessions, and `docs/SESSIONS.md` (Round 10, the briefs) and `docs/round10/README.md` win where this
section names another session: 10S builds world mode itself (W1a, W1b, W2 to W8; the census named a new session, 10W)
and then M5; 10N also builds K6, T1 and M2; 10A builds K1 and T4; 10B builds T5; 10C builds V1 to V4.

### 4.1 Wave 1 (sent to 6Z; no seams row, no open question)

| PR | What | Paths | Tests | After | Model |
|---|---|---|---|---|---|
| S1 | Containers and loot (I21) | `interactions.json` (`lootTables`, container classes: search, pry, pick), `sim/interact/` (a `loot` handler on the `loot` stream, activation), `scenes/*.json` (6 `containerSlots`, new ids), GDD 3.14 | determinism per seed; one roll per container; nothing on the wire before opening; nav reachability; per-scene counts | none | Opus |
| S2 | Berries, Game, Stew (I22) | `resources.json`, `items.json`, `recipes.json`, `economy.json` (market buys berries), scenes' `nodes`, `body/verbs.ts` `eat` for every food, GDD 3.14 | bare-handed forage; stew cures; market price under ask | none; before D4b | Sonnet |
| S3 | The forge chain (I23) | `items.json`, `recipes.json`, `interactions.json` (tier-2 walls), GDD 3.14, 3.22 | tier-2 wall refuses a tier-1 tool; armour factors; no recipe takes a bound item | S1 (the `armoury` table) or none | Sonnet |
| S4 | The mugging's Flee and Fight (GDD 3.24) | `sim/townsfolk/mug.ts` | flee's share only if caught; fight's strikes both ways | none | Sonnet (10D) |
| S5 | The art style in the menu only (world-mode 10) | `view/Hud.ts`, `scenes/Meeting.ts`, `scenes/World.ts`, `ui/artStyle/`, `view/artStyle.ts`, GDD 3.13 | no switch in a match; a request refuses while a match runs | y9 (#402) if it touches `Hud.ts` | Sonnet (10Y) |

### 4.2 Session 10S: world mode (Opus, 800k)

| PR | What | Paths | Tests | After |
|---|---|---|---|---|
| W1a | Hidden seats (row 25's ids, names, profiles, connection; row 27's game-over names). About 350 lines | `packages/shared/src/schema/` (`Private.seatId`, `GameState.party`), `rooms/handlers/lobby.ts` (seats at Start), the session-to-seat map in room memory, `S2C.gameOver.names`, the client's own-seat lookup, GDD 3.12, 3.21 | no client receives a lobby session id as a seat id; no name or profile during the match; order and connection tell nothing; the leak test (A170) over a world match with 1 and 9 NPC seats | B6c |
| W1b | The world-mode deal (I1). About 350 lines | `sim/Deck.ts`, `rules/deck.ts`, `sim/Covers.ts`, `maps/*.json` `roster`, `vendettas.json` `minHumans`, `partners`, `balance.json` `deal.*`, the content check, GDD 3.1, 3.9, 3.17 | human Killer; partners human; Accomplice from 6; every worn card withdrawn; enough looks free for every H; the Drifter's and Thief's lists disjoint and fixed; seat count constant by vendetta; streams untouched | W1a; 10C's list in `Deck.ts` |
| W2 | The true look (I3, row 26) and the Bandit's own look (I4) | `schema/`, `sim/Deck.ts`, client own figure and badge, `looks.json` | the field only on its own view; every client loads every true look | W1b |
| W3 | Nameplates as characters (I2, row 27), the client half | `looks.json` `loreName`, client labels, the end screen's pairing, GDD 3.17 | no seat name drawn in a match; names at game over | W1a; y12 (#409) |
| W4 | The dawn card and the manifest (I10) | client HUD overlay, UI.md | the manifest names characters | W3 |
| W5 | Routes: the engine, Watch, Role, Town (I6, row 28) | `sim/routes/` (new), `Private.route`, GDD 3.8 | each route meets on its event; nothing holds the match open | B6c |
| W6 | The ledger (I5, row 28) | `S2C.gameOver.victories`, `ui/GameOver.ts` | victories only at game over | W5; C5b, C4b |
| W7 | Conversion and Peaceful (I9) | `sim/routes/peaceful.ts`, `economy/faith.ts`, GDD 3.23 | Faith private; the converted count names nobody | W5, B7 |
| W8 | Trade and Healer routes | `sim/routes/` | each route, by anyone | W5, T4 (lanterns), 10V Autopsy |

### 4.3 Session 10N: the new roles (Opus, 800k)

| PR | What | After |
|---|---|---|
| N1 | Butler: Lock / Unlock, the Ledger, the Killer's Lock door (I11, I17) | W1b, B7 (the Inquest) |
| N2 | Child: crawlspaces, Witness, the pick-up rule (I12) | 10V's hiding spots |
| N3 | Ranger: Shoot, the Arrest (I13; Q-S1) | B4, K6 (snares) |
| N4 | Thief: Lockpick tier, Pickpocket, Smoke (row 31), the sea door, Heirlooms (I14, I31) | S1, I47's theft (T5) |
| N5 | Medium: the seance (I15, row 32) | B7 (a death made public) |
| N6 | Lobby toggles and the faction-only reveal (I16); Forged Alibi (I18) | W1b, B6a, 10V Inspect |

Each new card: `roles.json`, `abilities.json` routes (`status: live`, 10R's test), `looks.json` placeholder, GDD 3.2,
the rolecards.md lines. Tests per card: each ability's refusals, and a secrecy test that a client of another card sees
nothing of it beyond the drawn figure.

### 4.4 Session 10K: kit and the wild (Sonnet, 500k; K1 Opus)

| PR | What | After | Model |
|---|---|---|---|
| K1 | Weapons (I24) | C6 (`body/fists.ts`) | Opus |
| K2 | Armour's resistances (I25) | S3 | Sonnet |
| K3 | Candles for all, Handcuffs (I28, I29) | B4 | Sonnet |
| K4 | Recipe teaching and the chains (I26, row 29) | S3 | Sonnet |
| K5 | Skill checks (I36) | K4 | Sonnet |
| K6 | Snares and Rope (I27, row 31) | none | Opus |
| K7 | Crows, the bog-wisp, deep mud (I51, I52, I56) | none | Sonnet |
| K8 | The bog lurker, poison food (I53, I55) | C4c (spoiled stock) | Sonnet |

### 4.5 Session 10T: the town (Sonnet, 500k; T1 and T4 Opus)

| PR | What | After | Model |
|---|---|---|---|
| T1 | The Trades as cards (I30; Q-S2) | W1b | Opus |
| T2 | Chores and errands (I33) | D9b | Sonnet |
| T3 | Standing, examine lines, leads, Faith's sources (I33 to I35, row 29) | T2 | Sonnet |
| T4 | Town work, windows, stations, silhouettes (I37, I38, I39, row 30) | C4c, C4d | Opus |
| T5 | Theft, trespass Notices, curfew locks, forced labour, the heresy trial (I44 to I47) | B6b, B6c | Opus (to 10B as its list ends) |
| T6 | New places (I42), mood hooks (I40) | none | Sonnet |

### 4.6 Session 10M: ghosts, talk and modes (Sonnet, 500k; M2 and M5 Opus)

| PR | What | After | Model |
|---|---|---|---|
| M1 | Barks and the world lines (I61) | none | Sonnet |
| M2 | Wisp (I50, row 34) | B7 | Opus |
| M3 | Shove, fists on townsfolk, two-player carrying (I57 to I59) | C6 | Sonnet |
| M4 | The minimap and fog (I43) | none | Sonnet |
| M5 | Spectator mode (I62, row 33) | W3 | Opus |

### 4.7 Vendettas (to 10C as its list ends: Opus)

| PR | What | After |
|---|---|---|
| V1 | The Following (I7) | W1b, B7 (the bell) |
| V2 | Redemption and the Baron | W1b, B7, C5c (guards and the Knife) |
| V3 | The Getaway and the six-shooter | W1b, C4b (the Dusk Train) |
| V4 | Plot traces and the jail search (I8) | V1 to V3, B6a |

### 4.8 Order

1. Wave 1 now. 10K, 10T and 10M start their first pull requests that have no "after".
2. 10S starts W1a when B6c merges, and runs W1a, W1b, W2 to W8 in order. 10N starts when W1b merges (N2 earlier, after 10V's
   hiding spots).
3. The vendettas follow 10C's last step, the town's T5 follows 10B's last.
4. 10Z sweeps after every one of these, as seams.md 7 says.

## 5. Questions for the owner

Six choices that are really his, each with a default the build takes if he does not answer.

### Q-S1. The Ranger's Arrest

The card says "Arrest (1 bolt on a player): the target is cuffed and dragged to the square". World mode's law starts a
manhunt only from a signed petition.

- **Proposed default:** the Arrest is a cuff at bolt range, once per match, only on a manhunt's accused (section 2.4).
  The town still decides who is hunted.
- **Other choice:** a warrantless arrest of any figure, once per match, tried on the Ranger's own charge and entries.

### Q-S2. The Company Clerk

Follow-up 4 made the Clerk a guard figure, out of the deck; world mode had named him a card and the Activist's partner.

- **Proposed default:** the Clerk stays a guard figure; the Watchman stays the Activist's partner; the Heir route has
  no holder.
- **Other choice:** a Clerk card as well, dealt to a human when the Activist is drawn, with the guard figure as his
  stand-in when the card is not dealt.

### Q-S3. The roads (evolutions)

The lore's roads (the Fence, the Handler, the Vigilante, the Grave Robber and the rest) change a card mid-match and
share another role's win. Today `evolutions.json` is empty.

- **Proposed default:** round 10 builds the four Trades with their default routes and leaves the roads for a later
  pass.
- **Other choice:** build the roads in round 10 too, as a session of its own after the Trades.

### Q-S4. NPC seats at night

10X's audit found that an NPC seat does nothing at night that a human might (gather, trade, saw, pick a lock, sleep),
so a figure seen doing those at night is a human.

- **Proposed default:** NPC seats gain the night versions of their day work (gathering in lit places, a bed at home)
  and pick locks by the mini-game's chance, so the tell goes.
- **Other choice:** keep the tells, as the price of a quiet town at night.

### Q-S5. The jail scrub's hour

Each scrub was to take an hour off the sentence, but every sentence ends at the morning train.

- **Proposed default:** each scrub takes `jail.scrub.offS` (_new_, 30 s) off; the seat is released at the hub at that
  tick, whatever the phase.
- **Other choice:** an early release never falls after dusk, so a jailed Killer still loses the night.

### Q-S6. Proximity chat

Free text by proximity would tell people from NPC seats, which never type.

- **Proposed default:** no free text outside meetings; the quick-chat pool grows and NPCs bark from it (section 2.9).
- **Other choice:** a lobby toggle for free text, with the cost said in the lobby.
