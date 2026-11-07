# Round 10 (10R): the role cards and the Satchel

**Status.** Design only (2026-10-30). This document and the mock in [`samples/rolecards/`](samples/rolecards/index.html)
change no code, no rule and no number. `GDD.md`, `UI.md` and `DECISIONS.md` are not edited here; the build edits them
once the owner approves. Every number the card shows is a token read from `packages/content/data` at run time ("data
wins, card generated", A168), so no number is written in this document's copy either.

**Owner review.** The owner answered on 2026-10-30. Section 12 records the answers and what each one changes; it wins
over any earlier section that disagrees. The build (section 9) is 10R's, in round 10.

## 0. The brief

Session 10R (Opus, 800k): a design session the owner added to round 10 on 2026-10-30 for the role cards and a player
dashboard. 6Z adds its row to `docs/SESSIONS.md` and `docs/round10/README.md` in its next docs pull request. The brief
is copied here, as it asked, so it survives a compaction.

The owner's request, verbatim:

> the role cards have to be given a lot work, a role has cryptic instructions, and a bunch of stuff the player doesnt
> need. for our new role cards i want a trifold card that takes up the whole desktop screen and can be flipped through
> on a phone. in this new role every button should be mapped out, every action a player can take in the game, win
> conditions per role, lore etc. the biggest problem ive scene is that everything else has become so in depth but the
> role cards are still flat. i want a dashboard each player can use, this is where i want the chores to go, the
> inventory, and any thing else players dont need super quick access to, this new UI should aim to be efficient,
> clean, but also very cool and stylized. i really like the former design style you used on your questionnaire breif.

What 10R writes (design only):

1. `docs/round10/rolecards.md`:
   - the audit, role by role, of the card as it reads today (GDD 3.2, UI.md 7, `ui/RoleCard.ts`, the role data):
     what is cryptic, what the player doesn't need, what is missing;
   - the trifold: each panel's content, filling a desktop screen, the phone flip one panel at a time by swipe and by
     buttons, how it opens and closes at the reveal and later, and what becomes of the reveal's Ready and timer;
   - one table of every action and button, the single source for both the input code and the card, desktop keys and
     phone touch, where it lives and how a new action joins it;
   - win conditions and lore per role, from GDD and the content data, numbers as tokens, the copy drafted for review in
     short plain lines;
   - the dashboard: what moves into it (chores, inventory, quest log, notebook, rent and debts, anything else not
     needed at a glance), what stays on the HUD, its tabs, key and phone button, and how it behaves in play (does the
     world run on, can the player be attacked);
   - the style: the questionnaire's language mapped onto the game's design system without breaking the faction colours,
     UI.md 7's frames, contrast or the three art styles; a font the game doesn't ship gets its licence checked against
     ASSETS 6.5, and the build adds its `CREDITS.md` row;
   - role secrecy: the card and the dashboard live only in the private view and draw only what the wire already carries;
     a cover-wearer's card is theirs alone; check the GDD before any panel lists other roles; nothing new on the wire
     (a need goes to 6Z as a proposed `seams.md` 3 row);
   - phone and desktop, reduced motion, keyboard use, screen readers, the frame-rate cost on the test Android;
   - the build: pull requests under 400 lines, their paths and tests, the live sessions' paths each touches
     (`seams.md` 4);
   - questions for the owner, each with a proposed default, in the form of `docs/round11/questions.md`. One asks when
     to build: now, in round 10's tail before 10Z, or in round 11 beside the art makeover. The default is round 10.
2. `docs/round10/samples/rolecards/`, a clickable mock: one self-contained HTML file (inline CSS and JS, Google Fonts
   only, nothing else on the network), the desktop trifold and the phone flip for at least a Village, a Cabal and a
   neutral or cover role, the dashboard with its sections, real data from `packages/content`, under 5 MB.

The questionnaire's style (6Z's round-11 page): display Alegreya SC 700 in small caps; body Alegreya Sans 400, 500, 700
at 17 px, 1.5 line height; labels IBM Plex Mono 400, 500, uppercase eyebrows at 0.08em, id chips, tabular numbers.
Light: paper #ECEEF2, card #FBFBFC, ink #222733, soft #586072, rule #D3D8E0, well #F1EBDD, mustard #8C600A text and
#F2B33D fill with #241B05 on it, moss #2F6B45, blood #9E3B2A, focus #2D5FA8, slate sheet #2C3240. Dark: paper #2A303D,
card #343B4A, ink #DDD6C6, soft #A9AFBC, rule #4A5264, well #3D4352, mustard #F2B33D, moss #8FCBA2, blood #EC917A, focus
#8DB4F0. Components: section heads under a 2 px ink rule, cards with a 1 px rule border and 8 px corners, mono id chips
(ink and card swapped), uppercase outlined pills, beige "Proposed" wells with a mono label, a sticky top bar with a
mustard progress meter, buttons with 6 px corners and the primary one mustard-filled.

How 10R works: design only, in `docs/round10/rolecards.md` and `docs/round10/samples/rolecards/`; ask the teardown "why
is it like this" before redesigning (ROSW read-only, never written); the live sessions are 10B, 10C, 10D, 10X, 10Y and,
later, 10E, and 6Z sequences the build; branch `claude/r10-r1-rolecards` from `origin/claude/zen-turing-m1jnw0`; one
draft pull request against that base, `pnpm lint` before every push, driven to green, "Complete" at the top of its
description and one line to 6Z (`session_01M5mAcWJXBeyh4yPTi8ZPYa`): "10R: #NNN (role cards design) complete". 6Z
merges. After a compaction or a restart, re-read this section and `docs/round10/seams.md` before the next edit. After
the merge, stay available for the owner's answers and the build plan.

**What the teardown says** (ROSW `teardowns/who-did-it/chapters/01-ui.md` and `answers.json`, read at `main`). Two
answers shape this design:

- "Paper = what you hold". The owner chose it on 2026-10-23 (A168). A110 then moved the card to glass, and the owner's
  final word was to leave A110 alone for now, "I didn't like the paper style from before so I'll probably create a new
  one if want to go back". The questionnaire style is that new paper. The card and the Satchel are what a player holds,
  so they take it, and the world's HUD stays glass.
- "Pixel on menus, not in matches". The card and the Satchel use no pixel face. Today's card sets the role name and
  the faction word in Press Start 2P (`ui/match.css:39`, `:51`); both go.

## 1. The audit

### 1.1 What the card is today

- **The data.** `roles.json` holds, per role: `goal`, `cardText`, `beware`, `win`, `startKit`, `abilities` and
  `bellPulls`. Numbers are tokens (`packages/content/src/cardText.ts`).
- **The wire.** The server builds the private `roleReveal` (`rooms/handlers/lobby.ts` `buildRoleReveal`). It sends
  `goal`, `cardText`, `beware`, the ability rows, the kit, the traits, the deck, the look, the cover hints and the
  Cabal mates. It does not send `win`.
- **The screen.** `ui/RoleCard.ts` draws, top to bottom (UI.md 7):
  - the stripe and the role name;
  - the look line and the traits;
  - the cover picker, for a cover role;
  - the deck strip;
  - the goal;
  - up to three ability rows (keycap, name, cooldown);
  - the kit as chips;
  - the card text, the Beware line and the Cabal mates;
  - the 20 s timer (`phases.roleRevealS`), Ready and "Tab reopens this card".
- **The look.** A110 sets an indigo fill, lilac text and Press Start 2P on the name.

### 1.2 Problems every card shares

| # | Problem | Where |
| --- | --- | --- |
| A1 | **Ability keys are dealt by position, whatever the ability's kind.** The server gives the first ability Q, the second R and the third F. So a passive gets a key that does nothing: Townsfolk "Q Tasks", Gamekeeper "Q Last Shot", Accomplice "F Inherit". | `lobby.ts` `buildRoleReveal` (`ABILITY_KEYS[i]`) |
| A2 | **A hold ability's key does nothing.** `World.abilityKey` returns for anything but `kind: 'active'`. I found no client code that sends `act.hold` with `drag`, `inspect` or `autopsy`: only `collect`, `task`, `sleep` and `shop` go out. So Inspect, Dust / Compare, Autopsy and Drag body are on the card with a key and have no input path. The build confirms each one on a live match before it fixes it. | `scenes/World.ts:541-556`; `grep "hold('"` in `apps/client/src` |
| A3 | **On a phone only Q exists.** The touch cluster has Use, Act (Q), Run, Sneak and Strike. R and F have no disc, so these are out of reach on a phone: Impersonate, Salts, Chalk, Rope, Fake Blood and, once A2 is fixed, Dust / Compare and Drag body. | `input/TouchControls.ts:59-63` |
| A4 | **The Killer never sees its vendetta.** `VENDETTA_COPY['vendetta.goal.*']` is used nowhere but its own file. `RoleCard.ts` does not read `Private.vendetta`, so the Accomplice never sees its Killer's either. | `ui/copy/vendettas.ts`; `ui/RoleCard.ts` |
| A5 | **No card says how you win or lose.** `win` never reaches the client. The goal line is a fragment ("Village."), and the card text mixes advice with lore. | `RoleRevealPayload` |
| A6 | **The copy is for the voting game.** "Vote with evidence", "steer the vote", "get yourself voted out", "the Final Night vote fails". B6 retires voting, and every such line goes stale the day it merges. | `roles.json` |
| A7 | **Rules trivia the player doesn't need.** "Counts as nobody for parity", "Two-Killer games outpace your bandages" (true only at 10 seats), "(meetings show portraits)", a cooldown column that is empty for most rows, the kit as chips that repeat the hotbar. The deck strip is unexplained. | `roles.json` `beware`, `cardText` |
| A8 | **Missing: every control but Tab.** The card does not say: what E does in each place; when a power works (`abilities.json` `phases`: the Knife only after dark); what a power costs (a Lens, a Plant Kit) or how often it can be used; Strike, Run, Sneak, Hide, Check, Report, the Bell, the hotbar keys; the panels on I, C, J, K and N; T at a giver. | `ui/RoleCard.ts` |
| A9 | **Missing: lore.** Only the professions' card text and the Gamekeeper's ("Vane paid you") carry a line of the world. The Bible and the Codex give every role a place in HollowMere (`docs/round6/owner-brief.md` 2, Book I.5 to I.7). | `roles.json` |
| A10 | **Tab is the toggle and also the browser's focus key.** A keyboard user cannot Tab through the card's own controls (the cover picker, Ready), and the HUD chip says "(Tab)" with no other key. | `ui/RoleCard.ts:248` |
| A11 | **The timer closes the card mid-read.** When the 20 s run out, the card shuts whether the player has read it or not. Reopening plays the 600 ms flip every time. | `ui/RoleCard.ts` `show`, `hide` |
| A12 | **GDD 3.2's prose types numbers the data has since changed.** For example, Impersonate's cooldown and duration in 3.2 and 3.17 disagree with `balance.json` `impersonate` after A5's scaling. The card reads the data, so it is right. 10Z's sweep should fix the prose. | GDD 3.2, 3.17 |

### 1.3 Role by role

The dealt cards come first, then the cards that are never dealt. "Today" is the card as `roles.json` and `RoleCard.ts`
give it at this branch.

| Role | Cryptic | Doesn't need | Missing |
| --- | --- | --- | --- |
| **Killer** | "A guarded target voids your kill": "guarded" is never defined (it means a Bandage, the Watch or a Remedy). "Walk in a borrowed character". "F Drag body" does nothing (A2). | "Be the loudest voice asking who did it" is advice for the vote. | The vendetta (A4). That the Knife works only after dark. Hunger. That Impersonate changes your face only out of sight. How to use the Rag and the Bucket. The Cabal channel. How you win and lose. |
| **Accomplice** | "Vouch at the right moment". "F Inherit" is a key for a passive (A1). "A Forged entry tells the village an Accomplice exists". | — | How to plant: you choose the traits. That the Crowbar is a hold on a door (its R does nothing, A2). The Killer's vendetta (A4). What happens when you inherit the Knife. |
| **Accomplice, Knife-bearer** (heir) | — | — | What changed: you now hold the Knife, and your Hunger clock has started. Today a private message tells you, and the new card does not say what moved. |
| **Detective** | "Collect, inspect, cross-reference". "Compare never gives a name". Q Inspect and R Dust / Compare do nothing (A2). | "Prime target" is said twice, once as Beware. | How many Lenses you have left (`Private.lensCharges`) and how you get one back. That a Verified clue goes on the Case Board. |
| **Doctor** | "Two-Killer games outpace your bandages" (A7). R Autopsy does nothing (A2). | The 10-seat caveat. | That Bandage is not for yourself. What the target and the witnesses learn. That Autopsy reads the cause and the time. That Salts is F, which a phone cannot reach (A3). How the Medkit is used. |
| **Vicar** | "Steer the vote" (A6). | — | That Hear Confession picks a seat from a list, once a night, with no walking, and the answer goes to your Notebook. How you win. |
| **Watchman** | — | — | How you win. The card text is clear. |
| **Herbalist** | — | — | That the Remedy also cures Poisoned by day (`antidote`, GDD 3.22). How you win. |
| **Gamekeeper** | "Q Last Shot" is a key for a passive. It fires from a picker when you die (A1). | — | That the picker opens by itself, and how long it stays open. How you win. |
| **Lamplighter, Baker, Fisher, Tinner** | "Q Tasks" is a key for a passive (A1). All four share one goal line. | The goal repeated in the card text. | That they ring the Bell more often than other cards (`bellPulls`), their one edge. Chalk and Rope are R and F, which a phone cannot reach (A3). How a chore writes an alibi. |
| **Drifter** | "Counts as nobody for parity". "Fake Blood: (meetings show portraits)". | Both lines. | That dying to the Killer loses. That Fake Blood is F, which a phone cannot reach (A3). |
| Butler, Child | Not dealt until M4 (GDD 3.1). | — | No look yet. The new card draws them when they ship. |
| Ranger, Thief, Medium | Not shipped (V1.5, V2). | — | The same. The card reads `ships` and never draws an unshipped card. |

## 2. The trifold

### 2.1 What goes on each panel

The trifold is one sheet folded in three, like a pamphlet. Each panel answers one question.

| Panel | Question | What it holds | Source |
| --- | --- | --- | --- |
| **1. Who** | Who am I here? | the faction stripe and frame; the role name; the portrait slot (`portrait_<look>`, UI.md 13 until the art lands); the look the town sees, with your traits and the line "traits come with your seat, every clue you leave shows them"; the lore (two sentences); for a cover role, the cover picker; your Cabal mates; the deck, public, with one line on what each card does | `roleReveal`, `Private.coverLook`, `mateLooks`, `roles.json` (public content) |
| **2. Win** | How do I win and lose? | the goal in one line; the win routes, numbered; for a Killer, the vendetta and its steps; for the Accomplice, its Killer's vendetta; "You lose when"; Beware, at most four short lines; "How to play it", at most three tips | `roles.json` (the new fields of 4), `Private.vendetta` |
| **3. Do** | What can I press? | "Your card": each ability with its key and touch control, one plain line, and pills for when (after dark), how long it rests, the hold it takes, its uses a match, what it costs and what it needs; a passive shows "Always on", never a key. "Your kit": each item, Bound or not, and how it is used. "Everyone can": every universal verb. "Screens": card, Satchel and its tabs, Esc. Reopened in play, a row shows its live cooldown and charges (`Private.cooldownEndTick`, `lensCharges`) | the action table (3), `abilities.json`, `items.json`, `Private` |

Panel 1 holds no rule, panel 2 no control, panel 3 no lore. A player in a hurry reads panel 3 alone. The copy of every
line is in section 4.

### 2.2 Desktop

- **Size.** The card fills the viewport less a 16 px margin. Its three panels share the width (about 1 : 1.1 : 1.15;
  panel 3 is the longest).
- **Scrolling.** The card itself never scrolls. A panel that overflows scrolls on its own, so the stripe and the top bar
  stay put.
- **Above 1600 px.** The card stops at 1600 px wide and centres, so a line stays under about 80 characters.
- **The folds.** A dashed rule with a soft inner shadow marks each fold.
- **The top bar** (the questionnaire's sticky bar) holds:
  - the faction stripe and the role name;
  - one status line ("The match starts when everyone is Ready, or in N s"; in play, "The world runs on behind this
    card");
  - the action: Ready at the reveal, Close in play;
  - along its bottom edge, the mustard progress meter, the reveal's timer (2.5).
- **Below 800 px wide, or a short window** (a laptop at 200% zoom), the card takes the phone layout (2.3). The switch is a
  container query on the card's own width, so the overlay, the Studio and a test harness all behave the same.

### 2.3 Phone: one panel at a time

- **Layout.** The card fills the screen with no outer frame. The faction rule becomes a 4 px edge under the stripe, and
  the corner motif sits in the stripe, so UI.md 7's frame still marks the faction in greyscale.
- **Panels.** They sit side by side in a horizontal scroller with mandatory scroll snap, one panel wide. A swipe turns
  exactly one panel (`scroll-snap-stop: always`).
- **Buttons.** Three ways to move, so swiping is never the only one:
  - a tab row under the title, "Who · Win · Do", with a mustard rule under the current tab;
  - a bottom bar with Back and Next and three dots;
  - the arrow keys on a tab or the bar, for a keyboard or a switch.
- **Turning.** Each one scrolls the strip. Swiping updates the tabs and the dots.
- **Where it opens.** At the reveal, on Who for a cover role (the picker) and on Win for everyone else. Reopened, it
  opens on the panel last read.
- **Why scroll snap.** It is native scrolling, with no pointer code and no animation on the main thread. On the test
  Android it costs a compositor scroll and nothing else.

### 2.4 Opening and closing

| Moment | Opens | Closes |
| --- | --- | --- |
| The reveal (`phases.roleRevealS`) | By itself when `roleReveal` arrives. Desktop: the two outer panels unfold from the middle one (two 3D turns, `--wdi-dur-flip`). Phone: the sheet rises. | Ready (the seat's private ready, as today), or the timer. The sheet then folds into the HUD chip at the top left, so the eye learns where it went. |
| Any time later | Tab while the world has focus, or a tap on the HUD's card chip (both send the same action, 3). It opens without the unfold (it is a reference now) and fades in under `--wdi-dur-panel`. | Tab again, Esc, the Close button, a click on the scrim (desktop), or a hit (5.4). |

The card is a non-modal dialog (`aria-modal="false"`, as today), so the HUD stays reachable. Inside the card, Tab moves
focus and Esc closes it, which fixes A10. A Tab on the world toggles the card only when the focus is on the game, never
inside a form, a chat field or the card.

### 2.5 What becomes of the reveal

The reveal phase stays as it is on the server: its length, the private Ready and the cover pick (GDD 3.17). The client
changes three things:

- **The timer** becomes the top bar's mustard meter, draining over the phase's time left (from `phaseChange.endsTick`,
  so a late joiner sees the right length). The numeric seconds sit beside it. Under reduced motion the meter still
  drains: it is status, not decoration.
- **Ready** stays the primary button, top right. It sends `role.ready` once and changes to "Ready ✓". The card stays
  open until the phase ends, so a player can read on after Ready. Today Ready closes the card at once.
- **When the phase ends,** the card folds into the chip whatever the player was doing, as the server starts grace.
  Nothing waits on a reader. The 3-2-1 countdown stays as it is, over the folding card.

## 3. Every action and every button

### 3.1 Where the table lives

The table lives in the client, as `apps/client/src/input/actions.ts`. Keys and touch controls are presentation: the
server never reads a key code, and V2 (first person) will have its own controls over the same rules. The slot keys stay
`@wdi/shared` `ABILITY_KEYS`, which the table reads, so the two never differ.

Today's bindings are spread over five files:

- `World.bindKeys`: E, N, Q, R, F, X;
- `ABILITY_SLOTS` in `World.ts`;
- `M5bLayer.onKey`: I, 1 to 6, C, J, T, K, Esc;
- `RoleCard`: Tab;
- `InputController` and `vectors.ts`: WASD, the arrows, Space, Shift.

The build moves every one of them into the table.

**One source, three readers.**

1. **The input code** binds by action id: `input.bindAction('satchel.chores', handler)`. `InputController.bind(code)`
   becomes private, so a key can only be bound through a row.
2. **The touch HUD** builds its discs and buttons from the rows that have a `touch` control.
3. **The card's panel 3** draws its rows, keycaps and touch labels from the same rows.

A key that changes in the table changes all three at once.

### 3.2 The rows

`hold` means the action lasts while the key or the disc is held. "When" is the gate the input code checks before it
sends anything. The server still refuses with A1's reasons.

| Id | Label (UI.md 14) | Desktop | Phone | When | What it does |
| --- | --- | --- | --- | --- | --- |
| `move` | Walk | W A S D, or the arrows | the stick | in the world | Moves. Screen axes turned into the world frame (`vectors.ts`). |
| `run` | Run | Space (hold) | push the stick to its rim (_proposed_, Q-C3) | in the world | Faster and louder; spends stamina. |
| `sneak` | Sneak | Shift (hold) | the Sneak toggle under the stick | in the world | Silent steps, slower. |
| `use` | Use | E (hold for a hold) | the Use disc (the large one) | in the world | Whatever is in reach, as the prompt says: a door, a clue (hold: collect), a body (report), the bell, a shop or bank counter, a bed, a chore station, a node, a giver, a seat (inspect). The prompt names the verb. |
| `slot1` | the card's first slot ability | Q | the first slot disc, labelled with the ability's name | when the card has one | An active ability fires at its target. A hold ability holds while Q is held at its target (Inspect at a clue, Autopsy and Drag at a body, Crowbar at a door), which fixes A2. A seat-list ability opens the seat picker. |
| `slot2` | the second slot ability | R | the second slot disc | when the card has one | As `slot1`. |
| `slot3` | the third slot ability | F | the third slot disc | when the card has one | As `slot1`. |
| `strike` | Strike | X | the Strike disc | in the world | Fists: knocks out, never kills (GDD 3.22). |
| `hotbar.1` to `hotbar.6` | Hold an item | 1 to 6 | tap a hotbar slot | in the world | Picks the held item (`inv.select`). Use acts with it. |
| `card` | Role card | Tab | tap the card chip | always | Opens and closes the trifold. |
| `satchel` | Satchel | I | the Satchel button | always | Opens and closes the Satchel on its last tab. |
| `satchel.pockets` | Pockets | I | the Pockets tab | always | Opens the Satchel at Pockets. |
| `satchel.craft` | Craft | C | the Pockets tab | always | Opens it at Pockets, focused on the crafting square. |
| `satchel.chores` | Chores | K | the Chores tab | always | Opens it at Chores. |
| `satchel.quests` | Quests | J | the Quests tab | always | Opens it at Quests. |
| `satchel.notebook` | Notebook | N | the Notebook tab | always | Opens it at the Notebook. |
| `talk` | Ask for work | T | Use, at a giver | at a giver | Opens the giver's quests. |
| `close` | Close | Esc | the screen's Close button | a screen is open | Closes the topmost screen. During an opening cutscene it skips (today's behaviour). |
| `minigame.*` | the mini-game's own keys | arrows, Space, Enter | the board's own controls | a mini-game is open | Owned by each board (`view/minigames/*`). Listed so the card can name them. The table checks that none of them collides with a world key while a board is open. |

Ghosts use the same rows. Rows with a `when` a ghost fails (slots, strike, use on a body) are hidden on its card. The
Studio keeps its own keys (F8 and the editor's), outside this table and outside the match.

**The phone cluster.** It holds the Use disc, one disc per slot ability the card has (at most three, labelled with the
ability's name, never a bare letter) and Strike. Run and Sneak move to the stick (`run`, `sneak` above), so there are
at most five discs, against today's five. A card with only passives shows only Use and Strike. This fixes A3.

**Slots.** The client gives the slots in card order to the abilities that are not passive. It reads `abilities.json`
`kind`, which it already loads, and ignores the wire's positional `key`. A passive gets no slot and shows "Always on".
This fixes A1 with no change on the wire. The server's `key` field can be dropped later in a protocol tidy-up (Q-B4).

### 3.3 How a new action joins

1. Add a row to `actions.ts`: id, label copy key, desktop codes, touch control, `when` and group.
2. Add its label to UI.md 14 and to `ui/copy/`.
3. Bind it by id where it is handled.

Four tests keep the table whole:

- **Unique.** No two rows that can be live at once share a key code or a touch control.
- **Bound.** Every `bindAction` id names a row, and `bind(code)` cannot be called from outside `InputController`
  (a type error).
- **Reachable.** Every non-passive ability of every shipped card in `roles.json` maps to a slot that has a desktop key
  and a touch control. This test fails today for the R and F rows (A3).
- **Drawn.** The card's panel 3 and the touch HUD render one row per table row, in a DOM test.

## 4. Win conditions and lore, per role

### 4.1 The new fields

`roles.json` gains these fields on each card. Numbers are tokens, filled by `cardText.ts` as `goal` and `beware` are
today:

| Field | What it is | Replaces |
| --- | --- | --- |
| `lore` | Two sentences of the world. No rule, no number. | Nothing; today the professions' flavour hides in `cardText`. |
| `goal` | One line, the headline. | `goal`, rewritten. |
| `wins` | Rows of `{text, kind, ships}`, each one way to win. `ships` names the step or milestone that builds the route, so a route the server does not check yet is never shown. | `win`, which never reached the screen. |
| `loses` | Lines. | Nothing. |
| `beware` | Up to four lines, each its own sentence. | `beware`, split. |
| `tips` | Up to three lines of how to play it. | `cardText`. |

Abilities gain a `line`: one plain sentence for the card. `effect` stays the rules text for designers. The copy below is
the draft for review. Each line is short. `{…}` marks a token.

**Two sets of wins.** Today the rules are GDD 3.8's: votes, parity, the Final Night. B6 retires voting and rewrites
GDD 3.8. The routes that come after it (`docs/round9/world-mode.md` 2 and 3) are mostly not in round 10's plan. So
each role gets:

- its wins today, which the mock shows;
- the line each world-mode route will carry, marked "when built".

The build writes only the rows whose step has merged and leaves the rest of the draft in this document for later steps.

### 4.2 Lines several cards share

| Id | Line |
| --- | --- |
| `V-win-1` | Every Cabal member is dead or voted out. |
| `V-win-2` | The chores bar reaches 100%. |
| `V-win-3` | The Final Night vote takes a Cabal member. |
| `V-lose-1` | The Cabal matches the living village at {byCount.parity.from}+ players, or one villager is left at {byCount.villageAtMostOne.sizes} players. |
| `V-lose-2` | The Final Night vote takes nobody, or someone else. |
| `C-win-1` | Living Cabal at least match the living village ({byCount.parity.from}+ players), or one villager is left at {byCount.villageAtMostOne.sizes}. |
| `C-win-2` | The Final Night vote takes nobody, or someone who is not Cabal. |
| `C-lose-1` | You are voted out, killed or poisoned, and no Cabal member carries on. |
| `C-lose-2` | The chores bar reaches 100%. |
| `W-law` (when built: B6) | A murder conviction stops the Killer. Everyone who cuffed, signed the petition or filed the evidence wins a Law victory. |
| `W-trial` (when built: the end trial, `phases.md` 5) | At the end trial, the case you filed convicts the Killer. |
| `W-town` (when built: world-mode 2 "Town") | The chores bar fills before the Killer's vendetta completes. Everyone who finished a chore wins. |

### 4.3 Each card

**Killer** (Cabal, cover)

- Lore: Lord Vane was the first. You walk the lanes in someone else's coat, and the fog keeps your secrets until the
  lamps go out.
- Goal: Thin the village after dark, and never be voted out.
- Wins today: `C-win-1`, `C-win-2`. When built: your vendetta completes (its own line, 4.4); or, unstopped, you reach the
  end trial unconvicted ("Unseen").
- Loses: `C-lose-1`, `C-lose-2`.
- Beware: Every clue shows your own height and scarf, whatever face you wear. · Blood shows on you within
  {clues.clues.blood.params.visibleTiles} tiles until you wash. · A Bandaged, watched or Remedied target survives your
  strike. · Go {word:balance.hunger.cyclesWithoutKill} full days without striking and you leave glowing footprints.
- Tips: The Knife works only at dusk, at night and in the Final Night hunt. · Strike when the room is empty. Clean one
  clue, then wash at the well. · Impersonate a living seat to walk under their name for
  {balance.impersonate.durationS} s.
- Ability lines:
  - Kill: Strike a figure in reach. They die at once and leave a body and clues.
  - Impersonate: Walk under a living seat's name and look. Your height stays your own.
  - Drag body: Drag a body at half speed. Drop it in a body spot to hide it.

**Accomplice** (Cabal, cover)

- Lore: You never held the knife. You held the coat, the lamp and the story, and in HollowMere a good story buys a
  night.
- Goal: Keep the Killer's story straight, and take the Knife if they fall.
- Wins: as the Killer, and you also see your Killer's vendetta (4.4).
- Loses: `C-lose-1`, `C-lose-2`.
- Beware: Inspect marks a planted clue Forged. · One Forged entry tells the town an Accomplice is in play. · Your face
  is a claim. Someone may test it.
- Tips: Plant a footprint or a thread with the traits you choose. · Break a locked door for the Killer with the Crowbar.
  It is loud. · If the last Killer falls, the Knife passes to you.
- Ability lines:
  - Plant Clue: Leave a false footprint or thread with the traits you pick.
  - Crowbar: Hold at a locked door to break it. Loud, and it stays broken.
  - Inherit: When the last Killer falls, the Knife is yours. Always on.

**Accomplice, Knife-bearer** (heir; Cabal; the card the Accomplice turns into)

- Lore: The Killer is gone, and the town does not know it yet. The Knife is in your hand now.
- Goal: Finish what the Killer started.
- Wins and loses: as the Killer.
- Beware: Your Hunger clock starts the day you take the Knife. · Your face is still a claim.
- Tips: Everything the Killer could do with the Knife, you can do. Your Plant Kit and Crowbar stay yours.
- A "What changed" well at the top of panel 2 names the new Kill row. It shows once, the first time the card opens after
  the switch.

**Detective** (Village)

- Lore: The mainland sent you when Lord Vane was found dead. HollowMere calls you the outsider and keeps its doors shut.
- Goal: Prove who holds the Knife.
- Wins today: `V-win-1`, `V-win-2`, `V-win-3`. When built: `W-law`, `W-trial`.
- Loses: `V-lose-1`, `V-lose-2`.
- Beware: You are the first one they will come for. · A Bloody Rag can wipe a clue before you reach it. · A planted clue
  still costs a Lens to expose. · If you die, anyone can pick up your Magnifier and Inspect in
  {abilities.abilities.inspect.params.droppedMagnifierCastS} s.
- Tips: Collect every clue you pass. Inspect the ones that matter: each costs a Lens. · You get
  {word:abilities.abilities.inspect.params.lensPerMeeting} Lens back at each meeting, up to
  {abilities.abilities.inspect.params.lensMax}. · Compare two prints to learn whether they match. It never gives a
  name.
- Ability lines:
  - Inspect: Read what a clue hides and expose a forgery. Costs a Lens.
  - Dust / Compare: Lift a print, or compare two: Match or No match.

**Doctor** (Village)

- Lore: The apothecary's back room is the nearest thing HollowMere has to a hospital. You stitch the living and read the
  dead.
- Goal: Keep people alive, and read the dead.
- Wins: as the Detective. When built: the Healer route (world-mode 2): every body autopsied and nobody lost to a bleed
  or poison you were in reach to treat.
- Loses: `V-lose-1`, `V-lose-2`.
- Beware: You cannot Bandage yourself. · A Bandage stops only the Knife, and only once.
- Tips: Bandage someone before the dark. If the Knife comes, they live, and they learn the attacker's height. · An
  autopsy gives the time of death and the cause. Times break alibis. · Salts cure Slowed and Poisoned.
- Ability lines:
  - Bandage: Protect a neighbour in reach from the next Knife strike.
  - Autopsy: Hold at a body: the time of death and the cause go on the board.
  - Salts: Cure Slowed or Poisoned in a neighbour in reach.

**Vicar** (Village)

- Lore: The new faith came in on the railroad, and you came with it. Everyone in HollowMere confesses to you sooner or
  later.
- Goal: Learn where {word:balance.nightPowers.perNight} soul stands each night, and choose how much to say.
- Wins: as the Detective. When built: the Peaceful route (every living seat converted).
- Loses: `V-lose-1`, `V-lose-2`.
- Beware: Everyone can see you are the Vicar, the Cabal first among them. · If your card was not dealt, someone may
  wear your face and lie in your name.
- Tips: After dark, pick a seat from the list. Its faction goes in your Notebook as Verified. · You need not walk
  anywhere. Nobody sees you hear a confession.
- Ability line: Hear Confession: After dark, learn one seat's faction.

**Watchman** (Village)

- Lore: You walk the lanes after dark with the only lantern the company pays for.
- Goal: Stand guard over {word:balance.nightPowers.perNight} neighbour each night.
- Wins: as the Detective. When built: the Watch route (your watch holds against the Knife).
- Loses: `V-lose-1`, `V-lose-2`.
- Beware: Never yourself, and never the same soul two nights running. · Poison and the Gamekeeper's shot go past you.
- Tips: Each night, pick a seat. If the Knife comes for them before dawn, it fails, and your Notebook says so.
- Ability line: Keep Watch: After dark, pick a seat. The Knife fails on them tonight.

**Herbalist** (Village)

- Lore: Mother Moll taught you which root heals and which one ends. You keep one bottle of each.
- Goal: Save one life and end one, {times:roles.roles.herbalist.startKit.0.qty} each, and be right both times.
- Wins: as the Detective. When built: your Nightshade takes the Killer or the Accomplice.
- Loses: `V-lose-1`, `V-lose-2`.
- Beware: Nightshade kills a villager as readily as a killer. · A Remedy cannot stop Nightshade.
- Tips: Pour the Remedy where the Knife will fall. Yourself counts. · Pour Nightshade only where you are certain. · By
  day, the Remedy cures Poisoned in a neighbour.
- Ability lines:
  - Remedy: After dark, pick a seat. It survives the next Knife strike.
  - Nightshade: After dark, pick a seat. It dies when the night ends.

**Gamekeeper** (Village)

- Lore: Vane paid you to keep the wood. The fowling piece is still loaded.
- Goal: If you fall, take the right one with you.
- Wins: as the Detective. When built: your Last Shot takes the Killer.
- Loses: `V-lose-1`, `V-lose-2`.
- Beware: You never see the blow that fells you. · The face that walked up may have been borrowed. · A wasted shot
  kills a friend.
- Tips: When you die, a list opens. Pick one living seat, or hold your fire. · Watch who comes near you at night: that
  is your aim.
- Ability line: Last Shot: When you die, pick one seat to take with you. Always on.

**Lamplighter, Baker, Fisher, Tinner** (Village, professions)

- Lore, one each:
  - Lamplighter: You light the lanterns that keep the wolves off the square. When a lamp is out, you notice first.
  - Baker: Up before anyone, flour to the elbows. Crumb's Ovens feeds HollowMere, and an empty shelf is the first sign
    something is wrong.
  - Fisher: The fog keeps the boats in, so you mend nets and listen. The harbour hears everything.
  - Tinner: The mine is shut. Your hands are not.
- Goal: Work your chores in company, and vote with evidence. After B6: "Work your chores in company, and bring what you
  see to the law."
- Wins: as the Detective. When built: `W-town`, and each trade's own route (world-mode 2: Trade).
- Loses: `V-lose-1`, `V-lose-2`.
- Beware: Alone, you are easy prey. In pairs, you are hard to fool.
- Tips: Every chore you finish writes your alibi: the time and the place. · Work beside someone. Two alibis are stronger
  than one. · You can ring the Bell {word:roles.roles.baker.bellPulls} times a match. Most cards ring it once.
- Ability lines:
  - Tasks: Your chores fill the village bar and write your alibi. Always on.
  - Chalk: Draw a floor mark everyone can see.
  - Rope: Free a snared player in reach.

**Drifter** (Neutral, cover)

- Lore: You came in on the last train with nothing but a borrowed name. Whatever you are running from, the rope looks
  like rest.
- Goal: Get yourself voted out. After B6: "Get yourself convicted and hanged."
- Wins today: a vote ejects you. You win alone, the match goes on, and the end screen lists you among the winners. When
  built (world-mode 2 "Gallows"): a trial sentences you to death.
- Loses: The Killer, Nightshade or a shot takes you first. · The match ends before anyone votes you out.
- Beware: A calm village never votes. Stir it. · You wear a cover, like the Cabal, but you are alone. · You do not count
  toward either side's numbers.
- Tips: Look guilty enough to be voted out, not so guilty that nobody bothers. · Act Shifty rings fake footsteps where
  you stand. · Fake Blood shows on you in the world for {abilities.abilities.fakeBlood.params.durationS} s, once a
  match.
- Ability lines:
  - Act Shifty: Ring fake footsteps where you stand.
  - Fake Blood: Show Blood on yourself in the world, once a match.

**Butler, Child, Ranger, Thief, Medium.** Never drawn until they ship. Their drafts are written with their build.

### 4.4 Vendettas (panel 2 of a Killer and an Accomplice)

Today's lines (`ui/copy/vendettas.ts`, UI.md 14.29) never reach a screen (A4), and two of them are about the vote. The
card shows a title, one line and the steps. A tick per step needs a private progress field that the vendetta builds do
not carry yet (8).

| Vendetta | Line | Steps (today's rules, GDD 3.20) |
| --- | --- | --- |
| Zealot | You despise the Vicar and want his flock. | Stay near the Vicar while the flock gathers. · Let doubt take the flock. |
| Activist | You want the Company's grip broken. | Tamper with the Company's work stations. The count becomes a token in R3, read from the sabotage vendetta's data; today's copy types it. |
| Bandit | Four scores and a clean getaway. | Crack the manor's strongbox after dark, alone. |
| Hitman | The mail brings you a contract. | Accept it from your Notebook. · Take only its mark. · Catch the train out. |

The world-mode vendettas (the sigils and the Mass, the Disarray acts, the four robberies, the Dusk Train) take their
steps from the builds that make them. None is in round 10's plan (`round10-plan.md` 4), so the build leaves room for
them and writes none.

### 4.5 The match's mode

The card never hard-codes one mode's text. Each `wins` and `loses` row in `roles.json` names the modes it holds in
(`modes: ["main"]`, `["world"]`, `["paint"]`). The card draws only the rows of the match's mode, which the client
already knows:

| Mode | How the client knows | What panel 2 says |
| --- | --- | --- |
| **Main** (today's game, until B6) | — | 4.2 and 4.3's "today" lines: parity, the vote, the Final Night. They retire at B6. Because the card builds after B6 (9), it never ships them. They stay in this document only to show today's rules. |
| **World mode** | B6 retires the vote, and world mode then replaces the main mode outright (6Z, 2026-10-30), so it needs no flag. It is the card's default. | No faction tally and no parity (`world-mode.md` 2): the heading reads "You win when", never "The Village wins when". Each seat's own routes, the "when built" lines of 4.3, plus `W-law`, `W-trial` and `W-town`. The Killer's vendetta is its main route, and "Unseen" is the lesser one. The Accomplice shares its Killer's kind. |
| **Paint The Town Red** (two humans) | `Private.paintTown` (seams row 18, #382) | Both Killers' panel 2 holds one shared route. |

The Paint The Town Red copy (draft):

- Goal: Paint the town red before you are caught.
- Wins:
  - Between you, kill {paintTown.target} different townspeople who hold a card. The townsfolk who only walk the lanes
    don't count, and a kill of someone the train brought back adds to your total, not to the count.
  - Or the Vicar, the Company Clerk and the Constables lie dead at the same moment before the morning train.
- Loses: You are both convicted of murder, or the end trial closes first.
- Tips: The ledger ranks you two by total kills.

Panel 1's Cabal well names the other Killer, as today's mates. "The town" here means the NPC seats; nothing on the card
says which seat is an NPC, since only the deal itself is two humans and the rest NPCs (GDD 3.12, public by the mode).

**Story mode** (one player, 10E's E2, three chapters with a role switch at each break) is open. 10E sets the chapter
cards when it starts. This design proposes that a chapter card is panel 2 of the trifold for the chapter's role, and
that the role switch reopens the card at Win. 10E decides.

**World-mode copy in the mock** (the Mode select's default):

| Card | Goal | You win when | You miss out when |
| --- | --- | --- | --- |
| Detective | Prove who holds the Knife, and bring the case to the law. | `W-law`; `W-trial` | The Killer completes the vendetta first, or reaches the end trial unconvicted. |
| Killer | Complete your vendetta before the law catches you. | Your vendetta completes (4.4). · You reach the end trial unconvicted, the vendetta unfinished: Unseen, a lesser win. | A murder conviction, a death after dark, or your vendetta foiled. |
| Drifter | Get yourself convicted and hanged. | A trial sentences you to death: Gallows. You win alone. | The Killer, Nightshade or a shot takes you first. · The end trial closes before any court hangs you. |
| Baker | Keep the town fed, and bring what you see to the law. | The Wake Loaves are baked every morning: Trade. · `W-town`. · `W-law`. | The Killer completes the vendetta first. |

In world mode the second heading reads "You miss out when": a seat that does not win has not lost to a side, since there
is no side (`world-mode.md` 2). The other cards follow the same pattern, from 4.3's "when built" lines.

`{paintTown.target}` is a match token, not a content path. `paintTown.winUnique` is a fraction (6Z's C5 ruling, seams
row 18, #382), so printing the key would show "0.5". The client fills the token when the card opens:
ceil(`winUnique` × the NPC seats at the deal), at least 1. In this mode every seat but the two Killers is an NPC, so the
NPC seats are the seat count less two, and nothing new goes on the wire. The end screen keeps its own
`gameOver.paintTown.target`. Only roster NPC seats count (`world-mode.md` 1.6). The ambient townsfolk (GDD 3.24) don't
count, and the guards count only toward the pillars. R3 registers the token beside the content tokens of `cardText.ts`,
as a token filled at run time, and its check refuses the row until C5 adds the key, so it cannot ship early. The mock has a Mode select: world mode (the default), Paint The Town Red (the Killer only) and
today's main mode. It shows a key that is not in the data yet as its name in brackets.

## 5. The Satchel

The owner named it the Satchel (Q-D1, 2026-10-30): the bag a player carries, holding what they own and the papers of
their day.

### 5.1 What moves in

| Today | Where it goes |
| --- | --- |
| Pockets (`ui/Inventory.ts`, I) and the crafting square | the Pockets tab |
| Crafting (`ui/Crafting.ts`, C) | the Pockets tab, the crafting side |
| Chores (`ui/Chores.ts`, K) and the work bar (`mountWorkBar`) | the Chores tab |
| Quests (`ui/QuestLog.ts`, J) | the Quests tab |
| The Notebook sheet (`view/NotebookPanel.ts`, N) and its HUD button | the Notebook tab, with the contract note and its Accept button (`vendettas.ts`) |
| The purse detail, the bank balance, rent due, the line's fare, Faith, Indebted | the Purse tab (new; the numbers are already private: `purse`, `bank`, `fare`, `faith`) |
| The body's detail (health and stamina in numbers, each effect with its cure), your home (`Private.home`), your seat's public face | the You tab (new) |
| The four HUD key buttons (Pockets, Craft, Quests, Chores) | one Satchel button |
| The HUD deck chip (`main/deckChip.ts`) | panel 1 of the card |

### 5.2 What stays on the HUD

These are the things a player needs at a glance or with a thumb:

- the clock and the phase;
- the card chip ("Your card", the goal line, Tab);
- the body bars and the effect chips (8A);
- the purse counter;
- the hotbar;
- the E prompt;
- the toasts and the log;
- the edge cues;
- the settings gear;
- the Satchel button.

The work bar leaves the HUD. A toast says when it passes each quarter (_proposed_, Q-D3).

### 5.3 Tabs, key and phone button

| Tab | Key | Holds |
| --- | --- | --- |
| Pockets | I (C focuses the crafting square) | the hotbar, the pack, the belt, the head, body and weapon slots, the held item with Use, and the crafting square (2 by 2, 3 by 3 at a workbench). The moves and the dimmed slots are A13's, unchanged. |
| Chores | K | the village's work bar (public); your list with what to fetch, where from and where to, the next step marked, night-only chores marked. A Cabal or neutral seat sees "A show of work", as today. |
| Quests | J | the quests you hold, the count of the most you can hold (`quests.maxActive`), each one's wants, progress and pay; the nearby givers' offers when one is in reach. |
| Notebook | N | entries with their status pills (claimed, verified, corroborated, forged), the contract note. Filters: clues, alibis, night powers. |
| Purse | — | on you, in the bank, Faith; what you owe (rent and when it is due, the line's fare) and what owing does (the halved pay, the dear stall); a dot on the tab and the Satchel button while something is owed. |
| You | — | health and stamina in numbers, each effect and its cure, your home, what everyone sees of you. |

- **Desktop.** I opens the Satchel on its last tab. K, J, N and C open it at their tab, and the same key on an open tab
  closes it. The arrow keys move between tabs. Esc closes.
- **Phone.** The Satchel button at the top right opens it. The tabs sit along the bottom, under the thumb.

### 5.4 How it behaves in play

- **The world runs on.** A match is shared, so no screen of one seat pauses it. That includes story mode, which the
  server runs too (Q-D2).
- **You can be attacked.**
  - Desktop: the Satchel is a side sheet on the right, about 620 px wide, and the world stays visible on the left. It
    is non-modal: the movement keys still move you, and only its own keys are taken.
  - Phone: it fills the screen and covers the stick, so you stand still.
  - Both: the edge cues (a scream, a door) still draw over it, and a hit closes it (_proposed_, Q-D4). The client sees
    its own health drop in `Private.body`, so no new field is needed.
- **The card** follows the same rule: a hit closes it in play, but never at the reveal, when nobody can be hit.
- **Asleep, knocked out or on the line.** The Satchel closes and its button greys, as today's panels do when the World
  sleeps (`M5bLayer.setAsleep`).
- **A ghost** keeps the Notebook and Chores tabs (it finishes its own chores, GDD 3.7) and loses Pockets and Purse.

## 6. The style

### 6.1 Mapping the questionnaire onto the game

The card and the Satchel are paper: what you hold (2). The HUD and the world stay on the night glass of A110 and 7B.

| Questionnaire | In the game | Why |
| --- | --- | --- |
| paper, card, rule, well, soft (light and dark) | a new `dossier` set in `palette.json`, beside round 7's `night` set: DOM only, never art, never a world tint (`theme.test.ts` checks it, as for `night`) | They are new hexes. UI.md 2's rule is that no colour is born outside `palette.json`. |
| ink #222733 | `--wdi-ink` #12141C | The game's own ink, darker; 17.77 on card |
| dark ink #DDD6C6 | `--wdi-bone` #D9D2C2 | The game's own bone; 7.46 on dark card |
| mustard fill #F2B33D | `--wdi-mustard` | The same hex |
| text on mustard #241B05 | `--wdi-ink` | 9.88, as UI.md 10 |
| slate sheet #2C3240 | `--wdi-slate` | The same hex: the portrait slot and wells on dark |
| mustard text #8C600A | `dossier.mustardText` | Eyebrows and numbers on light paper |
| moss, blood | `dossier.moss` and `dossier.brick` (renamed) | Status only: done and forged. "Blood" is a faction word in this game, so the questionnaire's blood is renamed brick, and it never colours a faction |
| focus #2D5FA8 (dark #8DB4F0) | `dossier.focus` light; `--wdi-moon` on dark paper | The game's double ring (ink and mustard) fails on light paper (mustard on card is 1.80). Moon passes on dark paper (4.78). |
| Alegreya SC, Alegreya Sans, IBM Plex Mono | the card and the Satchel only | 6.2 |
| section heads under a 2 px ink rule, 1 px rule cards, 8 px corners, mono chips, outlined pills, Proposed wells, the sticky bar and meter, 6 px buttons | `.wdi-dossier` components in a new `ui/theme/dossier.css` | The game's `components.css` stays as it is |

**What does not change.**

- **The faction colours** stay moon, blood and mustard, on the stripe only, with their UI.md 10 text pairs: ink on moon
  7.83, bone on blood 4.61, ink on mustard 9.88.
- **UI.md 7's frames.** The trifold is framed by them: a 2 px ink outer rule, the faction rule inside it and the corner
  motif. On light paper the motif is drawn in ink, because moon (2.27) and mustard (1.80) fall under 3:1 on the card
  colour. The frames still differ by shape, which is what UI.md 7 asks.
- **The faction stays on the card.** It never reaches the HUD chip, the Satchel or a roster (UI.md 1.6). The mock's
  chip says "Your card", never the faction or the role.
- **The three art styles** (8-bit, Low poly, HD) change the world behind the card, never the card. The card is the
  same DOM in all three, and the portrait slot shows the look's portrait, which is one per look, not per style. On
  desktop the scrim leaves the world visible at the card's margin in every style.

**Light or dark paper.** The paper follows the device's `prefers-color-scheme`, with an override in the settings panel
(_proposed_, Q-E2). The mock has a switch.

### 6.2 The fonts

| Family | Weights | Licence | ASSETS 6.5 |
| --- | --- | --- | --- |
| Alegreya SC (Huerta Tipográfica, Juan Pablo del Peral) | 700 | SIL OFL 1.1 | Allowed: "UI uses OFL fonts only". Not Adobe Fonts. |
| Alegreya Sans (the same) | 400, 500, 700 | SIL OFL 1.1 | Allowed |
| IBM Plex Mono (IBM) | 400, 500 | SIL OFL 1.1 | Allowed |

- **How they ship.** Like 7B's (A106): self-hosted Latin woff2, unmodified from Fontsource, copied into
  `apps/client/src/assets/fonts/`. No new npm dependency, and the sessions upgrade none (CLAUDE.md). Each file gets
  its `CREDITS.md` row and its licence text in `LICENSES/fonts/`.
- **The allow-lists.** `style.json` `ui.fonts` and `theme.test.ts` allow-list the three families.
- **What changes in the docs.** ASSETS' line "those four are the only families" changes, and the change gets a
  `DECISIONS.md` row.
- **Loading.** The faces load with the match's assets, before the role card, and only from the stylesheet that uses
  them. The build measures their size and sets a budget in ASSETS 6.8 (I have not measured them).
- **The mock** reads them from Google Fonts, as the brief allows. The game never does.

**What the mock simplifies.** It draws the phone card without the 4 px faction edge of 2.3, has no 1600 px cap, uses
sample private state for the Satchel (marked in its source), and stands a gradient in for the world.

### 6.3 Contrast (measured, WCAG 2 relative luminance)

| Pair | Light | Dark | Use |
| --- | --- | --- | --- |
| ink on card | 17.77 | 7.46 | text |
| ink on paper | 15.82 | 8.78 | text |
| ink on well | 15.46 | 6.57 | text in wells |
| soft on card / paper | 6.10 / 5.43 | 5.10 / 6.01 | hints |
| soft on well | 5.30 | 4.50 | hints in wells; on dark, at its floor, so muted text stays out of dark wells |
| mustard text on card / well | 5.35 / 4.66 | 6.04 / 5.32 | eyebrows, numbers |
| moss on card | 6.14 | 6.00 | done |
| brick on card / well | 6.52 / 5.68 | 4.76 / 4.19 | forged. On dark, never in a well (4.19 < 4.5) |
| focus on paper (non-text, 3:1) | 5.46 | 5.63 (moon) | focus ring |
| ink on mustard | 9.88 | 9.88 | the primary button |

`theme.test.ts` gains these rows, as it measures UI.md 10's.

## 7. Role secrecy

- **Private only.** The card and the Satchel draw from the seat's own `roleReveal` and `Private` view and from public
  content. They are mounted in the overlay only for the seat they belong to, and they are never written to storage, the
  console or the network, as `RoleCard.ts` promises today.
- **A cover-wearer's card is theirs alone.** Panel 1 shows its true card and the look it walks in (`Private.coverLook`).
  Cabal mates' picks come from `mateLooks`, as today. Nothing on the HUD, the Satchel or any shared screen names a card,
  a faction or a cover. The HUD chip shows the goal, as today, and is the seat's own screen.
- **Listing other roles.** Panel 1 lists the deck and what each card does. GDD 3.1 makes the deck public by design:
  "the deck list itself is public, in the lobby, on the role card and in the HUD". In world mode the whole roster is
  dealt (`world-mode.md` 1.2), which is public too. Each card's description is `roles.json`, which every client
  already loads. The list never marks which cards are undealt or who holds what.
- **The Notebook and chores** keep today's rules: a fake list reads "A show of work" in its owner's view only (GDD 3.5).
- **Nothing new on the wire.** Everything above is already sent to the seat:
  - `roleReveal`;
  - `Private.vendetta`, `coverLook`, `mateLooks`, `cooldownEndTick`, `lensCharges`;
  - `inventory`, `notebook`, `tasks`, `quests`;
  - `body`, `purse`, `bank`, `faith`, `home`, `fare`;
  - the public `taskBar`.

  The client reads `win`, the new `wins` and the lore from `roles.json`, which it loads already. No `seams.md` 3 row is
  requested.
- **Two needs left for their owners.** These are not requested now:
  - A vendetta step's tick needs a private progress field. It belongs to each vendetta's own build and its own row.
  - Bell pulls left would need a private count. Today the card shows the pulls per match, from the data, and no more.

## 8. Phone, desktop and access

- **Equal on both** (the owner, teardown 01). Every screen is checked at 1280 by 720 and at 390 by 844, in the e2e specs
  (9).
- **Reduced motion.** No unfold, no rise, no slide, no smooth scroll. The panels swap and the sheets appear in place.
  The reveal meter still drains, because it is status (UI.md 9).
- **Keyboard.**
  - Inside the card and the Satchel, Tab moves focus, Esc closes, and the arrow keys turn panels and tabs.
  - On the world, Tab opens the card (2.4).
  - Focus goes to Ready at the reveal and to the panel heading when the card is reopened. It returns to the chip when
    the card closes.
- **Screen readers.**
  - The card is a `dialog` labelled by the role name.
  - Each panel is a `region` with a heading, and the phone's tab row is a `tablist`.
  - A keycap reads "Key Q", and a touch label reads as its words.
  - The reveal's time left is announced once at the start and once five seconds before the end, never every second
    (`aria-live="polite"`).
  - The Satchel's tabs are a `tablist` with a `tabpanel`, and each status pill says its word (verified, forged), never
    colour alone.
- **Frame rate on the test Android** (the 2022 mid-range phone of ROADMAP M5a, at its target there).
  - The paper is opaque. It has no backdrop blur, which is the costliest thing glass does, so the card is cheaper to
    draw than today's.
  - Scroll snap runs on the compositor, and the unfold is two transforms.
  - While the card or the Satchel covers the whole screen on a phone, the World scene can stop drawing the canvas.
    The camera turns invisible, and the simulation and the network keep running. The build measures that with the FPS
    overlay before and after, and keeps it only if it helps.
  - The mock weighs about 130 KiB, including the content it embeds.

## 9. The build

Five pull requests, each under 400 lines, in order. The paths are the client's and the content's. The last column is
what each one touches that a live session owns or uses (`seams.md` 4); 6Z sequences them.

| PR | What | Paths | Tests | Touches |
| --- | --- | --- | --- | --- |
| **R1. The action table** | `input/actions.ts`; `bindAction`; World, M5bLayer, RoleCard and `TouchControls` bind by id; slots from `kind`; the phone's slot discs; run on the stick; the hold slots send `act.hold` (A2) | `apps/client/src/input/**`, `scenes/World.ts` (the bind block), `ui/M5bLayer.ts` (`onKey`), `input/TouchControls.ts`, `ui/copy/world.ts` | the four table tests (3.3); A2's holds against the mock net | 10Y (client screens); 10H's `M5bLayer` keys (A13 merged); `World.ts` lines other sessions hold locked (8A, 6I, 8G); 6Z grants each |
| **R2. The paper** | the `dossier` palette set, `ui/theme/dossier.css`, the three faces, `style.json` `ui.fonts`, `CREDITS.md`, `LICENSES/fonts/`, UI.md 2, 3 and 10, ASSETS' font line, one `DECISIONS.md` row | `packages/content/data/palette.json`, `style.json`, `apps/client/src/ui/theme/**`, `apps/client/src/assets/fonts/**` | `theme.test.ts` (the new pairs and families) | 10Y; the content's canonical layout (`pnpm --filter @wdi/content format`) |
| **R3. The card copy** | `roles.json` `lore`, `wins`, `loses`, `tips`, `beware` as lines, `abilities.json` `line`; the schema; the token check over the new fields; UI.md 14 (a reserved subsection from 6Z); GDD 3.2 says the card shows them | `packages/content/data/roles.json`, `abilities.json`, `packages/content/src/schemas/*`, `cardText.ts` | the content tests; a drift test: every `wins` row's `ships` names a merged step | 10C (`roles.json` `townWork`, C3; C4 `roles.json`); 10H (`abilities.json` clocks): JSON merges keep both sides' keys (`seams.md` 1) |
| **R4. The trifold** | `ui/RoleCard.ts` rewritten as `ui/card/*` (three panels, the phone strip, the reveal meter, Ready, open and close, the hit close), `match.css` card rules removed, UI.md 7 rewritten, GDD 2 step 4 | `apps/client/src/ui/card/**`, `ui/RoleCard.ts`, `ui/match.css`, `ui/main/deckChip.ts` | `RoleCard.test.ts` rewritten; e2e at 1280 and 390 for one card of each faction; the cover picker's tests kept | 10Y; 10E's chapter cards (E2) share the reveal slot |
| **R5. The Satchel** | `ui/satchel/*`: the shell, the six tabs, the Purse and You tabs; Inventory, Crafting, Chores, QuestLog and NotebookPanel mounted inside it; the HUD button and the four key buttons removed; UI.md 6 and 14 | `apps/client/src/ui/satchel/**`, `ui/M5bLayer.ts`, `view/Hud.ts`, `view/NotebookPanel.ts` | DOM tests per tab against the mock net; e2e opening every tab by key and by tap | 10H's Inventory and Crafting (A13 merged); 10C's fare (C2) and 10D's rent (D7) for the Purse tab's lines; 10Y |

| **R6. The protocol tidy-up** (Q-B4) | `RoleRevealAbility.key` leaves the wire. The server stops writing it, and the client already gives slots from the action table (R1) | `packages/shared/src/protocol/index.ts`, `rooms/handlers/lobby.ts` `buildRoleReveal`, `PROTOCOL.md` (`pnpm docs:protocol`) | the lobby handler's reveal test; the client's card tests with no `key` in the fixture | a `seams.md` 3 row from 6Z before it is built; any open PR on `lobby.ts` |

R1 and R2 have no dependency between them, and both start at once. R3 goes after both and after B6c, then R4, then R5,
and R6 after R1. R3 writes only the
world-mode and Paint The Town Red rows, so no main-mode row is ever built and then dropped. R4 and R5 each fit under 400 lines
only by moving the existing panels as they are: their restyle is CSS in R2's file.

### 9.1 Keys that move

Checked against the client at this base. Desktop keys:

- E, Q, R, F, N and X are in `World.bindKeys`, and Q, R and F also in `ABILITY_SLOTS`.
- I, 1 to 6, C, J, T, K and Esc are in `M5bLayer.onKey`.
- Tab is in `RoleCard`.
- W, A, S, D, the arrows, Space and Shift are in `InputController` and `vectors.ts`.

No desktop key changes letter. What moves is what a key opens, and the phone's controls:

| Key or control | Today | After | PR |
| --- | --- | --- | --- |
| I | the Pockets panel | the Satchel, at Pockets | R5 |
| C | the Crafting panel | the Satchel, at Pockets, with the crafting square focused | R5 |
| J | the Quests panel | the Satchel, at Quests | R5 |
| K | the Chores panel | the Satchel, at Chores | R5 |
| N | the Notebook sheet | the Satchel, at the Notebook | R5 |
| T | the Quests panel, at a giver | the Satchel, at Quests (with the giver's offers) | R5 |
| Tab | toggles the card everywhere, even inside it (A10) | toggles the card only when the world has focus; inside the card it moves focus | R4 |
| Q, R, F | fire an active ability only; positional keys, so a passive shows a dead key (A1, A2) | active, hold or seat-list abilities by slot; passives get none | R1 |
| HUD Notebook button, and the Pockets, Craft, Quests and Chores buttons | five buttons | one Satchel button | R5 |
| Phone: the Act (Q) disc | Q only | one disc per slot ability, named (A3) | R1 |
| Phone: the Run and Sneak discs | two discs | run at the stick's rim; a Sneak toggle under the stick (Q-C3) | R1 |
| Phone: the card | the "Role card" chip button | the card chip ("Your card") | R4 |

## 10. Questions for the owner

Each question has a proposed default. You can answer **default** or **different**, with a note in your own words.

### Scope

#### Q-A1. When to build it

The build is five pull requests in the client and the content (9). Round 10's build sessions are still landing, and
round 11 brings the art makeover.

- **Proposed default:** round 10, in its tail before 10Z's final sweep, after B6 retires voting. World mode then
  replaces the main mode, so the card's copy is written once, for the rules that stay.
- **Other choices:** now, beside 10B, 10C and 10D, with more grants on shared files; or round 11, beside the art
  makeover and the portraits.

#### Q-A2. World-mode win lines before their routes exist

Most world-mode routes (Healer, Watch, Trade, Peaceful, the vendettas' new steps) are not in round 10's plan.

- **Proposed default:** the card shows only routes the server checks. The rest stay drafted here and join with their
  build.
- **If you don't answer:** the same.

### The card

#### Q-B1. The three panels

- **Proposed default:** Who · Win · Do, in that order. At the reveal the phone opens on Win, or on Who for a cover role
  that must pick.

#### Q-B2. The reveal

- **Proposed default:** Ready no longer closes the card. It marks you ready and the card stays open until the phase
  ends, so you can read on.

#### Q-B3. Lore lines

Two sentences per card, drafted in 4.3 from the Bible and the Codex.

- **Proposed default:** approve them as drafted, or mark the ones to rewrite.

#### Q-B4. The server's ability keys

The client will give the keys from the action table and ignore the wire's positional key (3.2).

- **Proposed default:** a later protocol tidy-up drops the field. Nothing changes on the wire now.

### Controls

#### Q-C1. Hold abilities on their slot key

Inspect, Autopsy, Drag body and the Crowbar become "hold Q, R or F at the target" (A2).

- **Proposed default:** yes.

#### Q-C2. The phone's slot discs

- **Proposed default:** one disc per slot ability the card has, labelled with the ability's name (Kill, Impersonate,
  Salts).

#### Q-C3. Run and Sneak on the phone

- **Proposed default:** run by pushing the stick to its rim; Sneak is a toggle under the stick. This frees two discs
  for the slots.
- **Other choice:** keep both discs and add the slots, seven discs in all.

### The Satchel

#### Q-D1. Its name

- **Proposed default:** "Daybook".
- **Other choices:** "Satchel", "Your papers".
- **Answer:** "Satchel".

#### Q-D2. Pausing in story mode

- **Proposed default:** no pause, in every mode. The server runs the world.

#### Q-D3. The work bar

- **Proposed default:** it moves into the Chores tab, and a toast marks each quarter.

#### Q-D4. A hit closes it

- **Proposed default:** a hit closes the Satchel and a reopened card, with a setting to turn that off.

### Style

#### Q-E1. The new paper replaces A110's glass for the card and the Satchel

You said "paper = what you hold", and later that you might design a new paper style. This is that style.

- **Proposed default:** yes. The HUD and the world's panels stay glass.

#### Q-E2. Light or dark paper

- **Proposed default:** follow the device setting, with an override in the settings.

#### Q-E3. Three new font families

Alegreya SC, Alegreya Sans and IBM Plex Mono, all OFL, self-hosted.

- **Proposed default:** yes, on the card and the Satchel only. Oswald and Inter stay everywhere else.

## 11. Ability census (follow-up, 10R, 2026-10-30)

6Z found that A2 goes deeper than the client. `sim/Hold.ts` `handleHold` routes only these holds:

- collect, task, gather, craft;
- shop, bank, the civic holds;
- sleep, errand and `interact`.

Any other hold is refused `NFY {feature: 'this action'}` (`Hold.ts:84-86`). `sim/Actions.ts` `handleAbility` does the same
for any ability it does not route (`Actions.ts` default branch). `act.hide`, `act.check`, `act.burst` and `act.present` are
in the protocol, but `sim/Commands.ts` queues and ignores them ("arrive with M4+"). So R1's "the hold slots send
`act.hold`" would only move today's silent dead key to an NFY toast. The census below is what each card would really
offer at this base (`origin/claude/zen-turing-m1jnw0` after #383).

### 11.1 The census

The census covers every ability a shipped card shows, the kit items with a `use`, and the universal verbs.

- **Server:** built (the file that runs it) or not built (where it falls today).
- **Client:**
  - desktop: the key or control that sends it today;
  - phone: whether the touch HUD reaches it.
- **Card slot:** the slot it takes on the new card (3.2).

| Ability | Kind | Cards | Server | Client today | Card slot |
| --- | --- | --- | --- | --- | --- |
| Kill | active | Killer, heir | built: `Kill.ts` (via `Actions.ts`) | Q; phone: Act | Q |
| Impersonate | active, seat list | Killer | built: `Impersonate.ts` | R; phone: none | R |
| Drag body | hold | Killer | **not built**: no drag code; `act.hold drag` → `NFY` | none | F, shown as coming later |
| Plant Clue | active | Accomplice, heir | **not built**: `Actions.ts` default → `NFY` | Q fires and is refused `NFY`; phone: Act, refused | Q, shown as coming later |
| Crowbar (break a locked door) | hold | Accomplice, heir | **not built** for doors. The Crowbar is a `pry` tool (`items.json` `tool`), which A10's `pryCrate` interaction and D7's boarded house use | none for doors; E (`interact`) at a nailed crate | R, shown as coming later; its working pry belongs to the kit row |
| Inherit | passive | Accomplice | built: `Inherit.ts` | — | none (Always on) |
| Inspect | hold | Detective | **partly built**: the Detective's `collect` marks the clue Verified (`Hold.ts:158`). No Lens, no hidden attribute, no Forged reading | E (collect); Q does nothing | Q. The card says "your collects are Verified" until the Lens lands |
| Dust / Compare | hold | Detective | **not built**: no fingerprint code | none | R, shown as coming later |
| Bandage | active | Doctor | built: `Actions.ts` `handleBandage` | Q; phone: Act | Q |
| Autopsy | hold | Doctor | **not built** | none | R, shown as coming later |
| Salts | active | Doctor | built: `sim/body/verbs.ts` | F; phone: none | F |
| Hear Confession, Keep Watch, Remedy, Nightshade | active, seat list | Vicar, Watchman, Herbalist | built: `NightPowers.ts` | Q / R; phone: Act (Q) only | Q / R |
| Last Shot | passive (picker on death) | Gamekeeper | built: `LastShot.ts` | the picker opens by itself | none (Always on) |
| Tasks | passive | professions | built: `Tasks.ts`, `Hold.ts` `task` | E at a station | none (Always on) |
| Chalk | active | professions | **not built**: `Actions.ts` default → `NFY` | R, refused; phone: none | R, shown as coming later |
| Rope | active | professions | **not built** (no snares yet, V1.5) | F, refused; phone: none | F, shown as coming later |
| Act Shifty | active | Drifter | **not built**: `NFY` | Q, refused; phone: Act, refused | Q, shown as coming later |
| Fake Blood | active | Drifter | **not built**: `NFY` | R, refused; phone: none | R, shown as coming later |
| Skeleton Key (item) | hold | Killer kit | **not built**: "a keyed door stays locked" (`Portals.ts:181`) | none | kit row, coming later |
| Clean, the Bloody Rag (item) | hold | Killer, Drifter kits | **not built** | none | kit row, coming later |
| Wash, the Bucket (item) | hold | Killer kit | **not built**: Blood only fades on its own clock | none | kit row, coming later |
| Medkit (item) | active | Doctor kit | built: `body/verbs.ts` `heal` | Pockets, Use | kit row |
| Light (Lantern, Candle) | active | many kits | built: `C2S.light`, `mobs/light.ts` | Pockets, Light / Douse | kit row |
| Eat (Wake Loaf, Herb Bread) | active | any | built: `body/verbs.ts` | Pockets, Use | kit row |
| Lockpicks (pick a lock) | interaction | any holder | built: A10 `pickLock`, D5 | E at a locked door | kit row |
| Collect | hold | everyone | built: `Hold.ts` | E | universal |
| Report body, the Bell | active | everyone | built: `Actions.ts` | E | universal |
| Strike | active | everyone | built: `body/verbs.ts` | X; phone: Strike | universal |
| Sneak | movement | everyone | built: `input.move` `sneak` | Shift; phone: Sneak | universal |
| Hide, Check, Burst Out | active / hold | everyone | **not built**: `act.hide`, `act.check` and `act.burst` are queued and ignored (`Commands.ts` default) | none | universal, shown as coming later |
| Present a Notebook entry | active | everyone (meetings) | **not built**: `act.present` ignored. B6 retires the meeting | none | dropped with the vote |
| The Paint The Town Red goal line | (the card's Win panel) | the two Killers, in Paint The Town Red | built: 10C's C5b (stacked on #391). Today's `ui/RoleCard.ts` shows `card.paint.goal` (`ui/copy/looks.ts`) and the target when `Private.paintTown` is true. The target comes from the shared pure rule `paintTarget(winUnique, npcSeats)`, where npcSeats is the roster less two (public, `seams.md` 3 row 18) | today's card | R1 carries it to the new card, and the Killer's Win panel shows the Paint goal and target. 4.5's `{paintTown.target}` calls `paintTarget` and never computes the target itself |

**What the census adds to 1.2.**

Fourteen things a shipped card shows have no server behind them:

- Drag body, Plant Clue, Crowbar (doors), Dust / Compare, Autopsy;
- Chalk, Rope, Act Shifty, Fake Blood;
- Skeleton Key, Rag, Wash;
- Hide, Check and Burst Out (counted once);
- Inspect, built only in part.

The Accomplice's and the Drifter's whole card rests on them. The Accomplice can Inherit, and nothing else of its own
works. The Drifter has nothing that works but its kit's look.

### 11.2 What the card does with an unbuilt ability (Q-A4)

**Proposed default:** the card shows it, greyed, with a "Coming later" pill and no keycap or disc, and a short line on
what it will do. It never takes a live key or a phone disc. The slot keys go to the built abilities first, so a Doctor's
Salts stays on a key while Autopsy waits greyed.

- Each row reads a new `status` on its `abilities.json` row: `live` (the server runs it) or `planned`. This mirrors
  `interactions.json` `status`.
- A test keeps the status honest. A `live` row must have a server route: a case in `handleAbility`, a branch in
  `handleHold` or an interaction. A `planned` row must have none. So a status cannot drift from the code the way the
  card's keys did.
- The owner asked that the card map "every action a player can take". A dead key is not one, and hiding the row would
  leave a card that names its own abilities in its lore with no row for them. A greyed row says honestly what exists and
  what is coming.
- **Other choice:** hide planned rows, and show a card only what works.

**Answer (owner, 2026-10-30): "Build the ones we were going to grey out."** There are no "Coming later" rows. A new
session, 10V, builds the census's missing verbs in round 10, as 11.3's three pull requests. Rope comes with the V1.5
snares, which the owner also moved into round 10. The `status` field and its test stay as the mechanism: an ability
whose row is not `live` when the card ships stays off the card until its pull request lands and flips it. By 10Z,
every row a card lists is live.

### 11.3 Owner question

#### Q-A3. When to build the missing V1 abilities

The census finds that these are written in GDD 3.2, 3.4 and 3.7 as V1 and have no server:

- the Killer's Drag body, Skeleton Key, Rag and Wash;
- the Accomplice's Plant Clue and Crowbar on doors;
- the Detective's Lens Inspect and Dust / Compare;
- the Doctor's Autopsy;
- the professions' Chalk;
- the Drifter's Act Shifty and Fake Blood;
- everyone's Hide, Check and Burst Out.

Rope waits for the V1.5 snares. Without them, the Accomplice and the Drifter have almost nothing to do, and world mode's
evidence (prints, autopsies, forged clues) has fewer sources than its law needs.

- **Proposed default:** build them in round 11, as their own session beside the art makeover. Round 10 is full, and 10X
  works fixes, not features. The session takes them in three Opus pull requests under 400 lines each, one per system:
  - the evidence verbs: Inspect with Lenses, Dust / Compare, Autopsy, Plant Clue;
  - the cover-up verbs: Drag body, Rag, Wash, Skeleton Key, Crowbar on doors;
  - the hiding spots (Hide, Check, Burst Out), with Chalk, Act Shifty and Fake Blood.

  Each pull request flips its abilities' `status` to `live`, so the card lights them up with no client change. Until
  then the card shows them greyed (11.2).
- **Other choices:**
  - round 10's tail, beside the card's build (10X with 6Z's grant, or a new 10-series session), which delays 10Z;
  - drop the ones that world mode no longer needs, and rewrite the cards around what exists.

## 12. The owner's answers (2026-10-30)

The owner's words, verbatim, through 6Z:

> Q-A1: default; Q-A2: different - Round 10 will get this done; Q-A3: Round 10's tail; Q-A4: different - Build the ones
> we were going to grey out; Q-B1: default; Q-B2: default; Q-B3: default; Q-B4: different - Tidy up; Q-C1: default;
> Q-C2: default; Q-C3: default; Q-D1: Satchel; Q-D2: default; Q-D3: default; Q-D4: default; Q-E1: different - Design
> those to be paper like; Q-E2: default; Q-E3: default

On Q-E1, 6Z asked what "those" covers. The owner chose "Only card and Satchel": the paper covers the card and the
Satchel, and the HUD and the world's panels stay glass. The owner also moved every gameplay feature except the Beast
boss into round 10 (V1, V1.5 and V2's gameplay), so round 11 is Blender only.

| Question | Answer | What it changes |
| --- | --- | --- |
| Q-A1 When to build | default | Round 10. R1 and R2 start now. R3 waits for R1, R2 and B6c (voting retires), then R4, R5, R6 (9). |
| Q-A2 World-mode routes | "Round 10 will get this done" | The card shows each world-mode route as round 10 builds it. R3's drift test keeps that honest: a `wins` row is drawn only when its `ships` step has merged. |
| Q-A3 The missing V1 abilities | round 10's tail | Session 10V builds them (11.3's three pull requests), with Rope after the V1.5 snares. |
| Q-A4 Unbuilt abilities | "Build the ones we were going to grey out" | No greyed rows. An ability that is not yet live stays off the card until its pull request lands (11.2). |
| Q-B1 to Q-B3 | default | Who · Win · Do; Ready keeps the card open; the lore of 4.3 as drafted. |
| Q-B4 The server's ability keys | "Tidy up" | R6: `RoleRevealAbility.key` leaves the wire after R1. Its `seams.md` 3 row goes to 6Z first. |
| Q-C1 to Q-C3 | default | Hold abilities on their slot key; named slot discs; run at the stick's rim and a Sneak toggle. |
| Q-D1 The dashboard's name | "Satchel" | The Satchel, everywhere: this document, the mock, `ui/satchel/**`, the copy keys (`satchel.*`) and the action ids (`satchel`, `satchel.chores` and so on). |
| Q-D2 to Q-D4 | default | No pause in any mode; the work bar moves into Chores with a toast at each quarter; a hit closes the Satchel and a reopened card, with a setting. |
| Q-E1 The paper | paper on the card and the Satchel only | As 6.1 proposed. The HUD and the world's panels stay glass. |
| Q-E2, Q-E3 | default | Light or dark from the device with an override; Alegreya SC, Alegreya Sans and IBM Plex Mono on the card and the Satchel. |

**Rows.** 10R's copy goes in UI.md 14.53, and its DECISIONS rows start at A237 and go up by 20 (A257, A277 and so on).
A237 records these answers.
