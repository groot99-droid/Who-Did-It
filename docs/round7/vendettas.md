# Vendettas, the Daily Train and the Vicar's memorial (7H, 7I)

The Bible's Book I.3 and I.6 on HollowMere, staged for round 7 by `docs/round6/bible-seams.md` 2.1 and
ROADMAP R7. The rules and every number go to GDD 3.20 (7H writes it from the stub) and `balance.json`
`vendettas` and `train` (with their schemas); this document fixes the seams between the two sessions and the
rest of the game so the base kill loop stays what it is.

## 1. What round 6 left (`bible-seams.md` 1)

- `packages/content/data/vendettas.json` is `{ gddRef: "3", vendettas: {} }` under `schemas/bible.ts`
  `Vendetta { id, role, kind: conversion | sabotage | heist | contract, triggers: [{ on, where? }], emits }`;
  7H widens the shape in the same PR as its rules.
- `Quest.kind 'contract'` is allowed by the schema and refused by the server; `seeds.get('contract')` is the
  mail stream; `events` is the world-events stream (round 9, untouched).
- `Cutscene.kind 'memorial'`, the `video` step and `S2C.cutscene { scope: 'all' }` exist and nothing sends them;
  `memorial_vicar.webm` and its manifest row shipped with #76 and #78 (the Vicar's voice, A99).
- `sim/events/bus.ts`: `emitSim`, `onSim(room, kind, fn)`, `ANY_SIM`, `pendingSim`, `runEvents` after
  `runPhases`; the admin room's log pane hears every kind. `registerInvariant` (`sim/auto/invariants.ts`).
- `GameState.lawStage` and `Role.evolvedFrom` are round 8's; nothing here writes them.

## 2. Vendettas (7H)

- **A vendetta is a behaviour of a Killer's card**, drawn at the deal from `vendettas.json` on a stream of its
  own (`'vendetta'` joins `StreamName`, keyed by seat; `seeds.test.ts` allowlist), one per Killer seat, kept in
  the seat's private view (`Private.vendetta: str()`, schema version 4 together with 7D's `Player.profile`; the
  two sessions agree the bump through 6Z, 7D lands it first). Nothing public changes: no look, no card text
  another seat can read, no new `SimEvent` that names the vendetta's holder by kind (an event's `data` may name
  a seat only where the base game already tells everyone, as a body report does).
- **The four**, as the Bible writes them and GDD 3.20 will rule them: **conversion** (the Zealot against the
  Vicar: a trigger on time shared with the Vicar's seat, a consequence on the Vicar's standing at the meeting),
  **sabotage** (the Activist against the company: a trigger on the station mini-games and the task bar, a
  consequence on the bar), **heist** (the Bandit against the strongbox: a prop 7H places in `manor_hall` as a
  `Prop` of the scene data, a trigger on the Train's delivery, a consequence in the Killer's inventory and a clue
  at the scene), **contract** (the Hitman: a target drawn from the mail stream when the Train arrives, accepted
  as a `contract` quest in `sim/Quests.ts`, a consequence on the Killer's cooldown while the target lives). Each
  is a trigger and a consequence written as `SimEvent`s on the bus: `vendetta.<kind>.<step>` kinds, listed in
  the file's `emits`.
- **Pressure, not a second kill loop**: a vendetta never kills by itself, never changes who the Knife can take,
  and never touches the kill-opportunity timer (A100) or the strike roll. It adds a goal, a tell and a reward
  around the kill. The Accomplice shares the Killer's vendetta goal text (it already shares the Cabal mates)
  and nothing else.
- **The NPC Killer** carries a vendetta too and its brain (`sim/npc/world.ts`, 6Z's file) reads the goal through
  one hook 7H asks 6Z for: `vendettaGoalFor(room, seatId): { sceneId; targetSeat? } | null` in `sim/vendettas/`,
  which the brain treats as one more place to walk to under its routine weights; 7H never edits the brain.
- **Invariants** (`registerInvariant`, `tools/auto/checks`): a vendetta fires at most once per match and only
  for its holder; a `contract` quest exists only on a Killer with the contract vendetta; the strongbox is in one
  inventory at most; nothing public carries a vendetta kind. `pnpm auto -- --matches 50` on HollowMere clean.
- **Files**: `sim/vendettas/**`, the `vendetta` draw in `sim/Deck.ts` (one line, agreed with 6Z), the
  `contract` acceptance in `sim/Quests.ts` (6H's file; the refusal line only), the strongbox prop rows in
  `scenes/manor_hall.json`, `vendettas.json` and its schema, `balance.json` `vendettas`, `Private.vendetta`,
  the role card's goal line for a Killer (`ui/RoleCard.ts` through a copy key 7F renders; 7H supplies the key
  in `ui/copy/vendettas.ts` and UI.md 14.29), tests in `apps/server/test/vendettas.test.ts`, GDD 3.20,
  DECISIONS A112.

## 3. The Daily Train, the memorial and the Ascended Vicar (7I)

- **The Train** is HollowMere's master clock: at a fixed second of each day (`balance.json` `train.arriveAtS`,
  GDD 3.3's new line), a scene event on the station. There is no station scene: 7I appends a `station` scene to
  HollowMere's scene set (`SCENE_IDS` append-only, GDD 3.13, WORLD 4.3; a portal from the overworld's edge, a
  platform, the tracks as statics) or, if a scene is heavier than the round allows, a platform spot on the
  overworld; either way the event is `train.arrive` on the bus with `train_arrive` then `train_brake` played to
  the seats in that scene (`AudioBus` keys 6N shipped) and a log line for everyone. The Train brings the mail
  (`seeds.get('contract')` draws the Hitman's target; 7H consumes `train.arrive`) and the strongbox's delivery
  (`train.delivery`, which 7H's heist consumes). BlackPine has no Train this round (its clock is round 9's
  roll call).
- **The Vicar's martyrdom**: when the seat whose card is the Vicar (`roles.json` `vicar`) dies by the Knife, the
  server sends `cutscene { id: 'memorial.vicar', scope: 'all' }` once per match at the next meeting's reveal (so
  the meeting, not the night, carries the memorial) and the client plays `memorial_vicar.webm` through the
  `video` step 7A renders (`map-intros.md` 2); skippable like every cutscene; the quick mode never sends it.
- **The Ascended Vicar** is `flow.ascendedVicarCandidate` in `sim/Flow.ts` (round 7's `FlowState` field, room
  memory only): set when the memorial has played, read by round 8's evolutions. Nothing public changes this
  round beyond the cutscene everyone sees.
- **Files**: `sim/Train.ts` with its `runTrain` line in `sim/Step.ts` (agreed with 6Z: after `runEvents`),
  `scenes/station.json` and `.nav.json` (or the overworld spot), `maps/hollowmere.json`, `sim/Memorial.ts`, the
  `FlowState` field, the `cutscenes.json` memorial row and its caption keys (`ui/copy/cutscenes.ts` 6J's file: one
  block), `balance.json` `train`, tests in `apps/server/test/train.test.ts` and `memorial.test.ts`, GDD 3.3's
  Train line and 3.20's memorial paragraph (7H leaves that paragraph to 7I), WORLD 4.3 the station, DECISIONS
  A113, UI.md 14.30.

## 4. Order

7H and 7I start together. 7I's `train.arrive` and `train.delivery` land before 7H's contract and heist PRs
(7H builds conversion and sabotage first). The schema bump is 7D's; 7H adds `Private.vendetta` in its first PR
after 7D merges. 7A's `video` step lands before 7I's memorial PR; until then 7I's test asserts the message, not
the picture.
