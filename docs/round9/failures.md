# Round 9 (9B): failure messages

Status: design only, for owner review. Nothing here is built. Brief item 8 (`owner-brief.md`): "stuff just says can't do that yet, if it's a problem on my side mark it with NFY, if it takes an unlock creatively say why it fails." This document counts every refusal the server can send, replaces the free-text messages with a closed list of reasons, says when a refusal is `NFY` and when it names what is missing, and fixes the client so the reason reaches the player. Rules and numbers stay in `GDD.md` and `packages/content/data`; every number below marked _proposed_ moves into data when the owner approves.

**Owner answers folded in (9D, 2026-10-25).** All eight failure-message questions (FM1 to FM8) took the default, so the rules of sections 3 to 6 stand as written. Other answers add refusals: the tool walls on piles (LT1), the lock-pick mini-game (LT2), the inventory (LT4), the law, the jail and sleeping (WM2, WM11, LW9, follow-up 2). They are in sections 4.9 and 5, marked "(owner answer <ID>)". Section 10 lists the reconciliations.

## 1. What the player sees today, and why

Every refusal is one frame, `S2C.error { code, msg }`, built by `reject()` (`apps/server/src/sim/World.ts:59`). The server writes `msg` as a debug word (`'not now'`, `'cannot do that'`). The client throws it away:

- `apps/client/src/scenes/World.ts:761-770` (`refusal()`) reads only `code`. Code 422 (`ErrorCode.cannot`) shows `refuse.nothing` after a kill, `refuse.reported` after a report, and otherwise `refuse.generic`, which is "That did not work" (`apps/client/src/ui/copy/world.ts:32-42`). Codes 423 to 428 each map to one fixed line (`REFUSAL`, `World.ts:87`).
- `lastVerb` (`World.ts:178,195,488,534`) is a guess at what the player last pressed. It exists only because the reason is not on the wire.

Of the 221 places the server refuses a request, 143 use code 422. So about two refusals in three read "That did not work", whatever the cause: a missing tool, a full pack, a wrong phase and a malformed request all look the same. That is the "can't do that yet" the owner met. Nothing in the text says whether the game is unfinished or the player is missing something.

## 2. Census

Produced by walking every `ErrorCode.*` use under `apps/server/src` (tests excluded) and reading the message beside it. The full per-site table is the appendix (section 8): 221 sites in 34 files.

| Code | Name | Sites |
| ---: | --- | ---: |
| 422 | `cannot` | 143 |
| 425 | `wrongPhase` | 33 |
| 427 | `outOfRange` | 22 |
| 426 | `busy` | 13 |
| 424 | `cooldown` | 7 |
| 423 | `locked` | 2 |
| 428 | `closed` | 1 |
| | total | 221 |

There are 95 distinct message strings. The ten most common, with the number of sites:

| Message today | Sites | What it really meant |
| --- | ---: | --- |
| `not now` | 49 | Five different things: the phase is wrong (24), the seat is a ghost or between scenes (16), the seat is stunned or knocked out (5), the lobby has closed (3), and a Mugging prompt that is not open (1) |
| `cannot do that` | 18 | Twelve are a malformed request (a client bug or a cheat); three are a verb with no handler yet (`Actions.ts:78`, `body/verbs.ts:35`, `Hold.ts:87`), which is unfinished work; the other three are a Last Shot not aimed, an ability the role lacks and a ghost impersonating |
| `too far` | 16 | Out of reach; fine, but the line should say of what |
| `busy` | 13 | The seat's hands are in a hold |
| `no target` | 8 | Nobody in range |
| `not enough Scrip` | 5 | Short of money |
| `not ready` | 4 | A cooldown, with no time left shown |
| `nothing there` | 4 | The id points at nothing |
| `nothing happens` | 3 | A kill voided by a Bandage, Watch, Remedy or charm; opaque on purpose (rule 4) |
| `no room` | 2 | Full pack |

Three groups are worth naming because they decide the design:

- **Malformed requests: 20 sites** (`BAD_REQUEST`). A real client never sends these. They are logged, never shown.
- **Unfinished work: 5 sites** end in a shrug today: the dispatch defaults (`Actions.ts:78`, `body/verbs.ts:35`, `Hold.ts:87`), the Mugging's flee and fight (`townsfolk/mug.ts:363`) and the HQ gate (`economy/hq.ts:30`). These are the honest `NFY`s.
- **Missing unlocks: 19 sites** already know what is missing and say a bare word: a tool (2: `needs a tool` at `Resources.ts:159`, `you lack the tool` at `Minigames.ts:66`), an item (6: `no bandage`, `no knife`, `no light`, `you hold none`, `not enough`), materials (3: `missing materials` at `economy/hq.ts:42`, `Craft.ts:41`, `Quests.ts:129`), a station (1: `Craft.ts:37`), Scrip (6) and Faith (1). Locked doors are worse: `Portals.ts:180-183` says `locked` for every keyed door because "keys arrive with M5", and no scene file has a lock at all (no portal in `data/scenes/*.json` has a `lock`), so the rule below has nothing to attach to until `logic-table.md` gives doors their interaction.

Five sites belong to voting and disappear with it (`RETIRED_VOTE`: `Meeting.ts:95,101,108,114` and `FinalNight.ts:42`). `docs/round9/phases.md` (9A) owns that removal; they are listed so the count adds up.

## 3. The rule

Every refusal has exactly one reason from the list in section 4, and each reason belongs to one of five families. The family decides how it is worded.

1. **`NFY`: the game is unfinished.** The design has the feature and the build does not. The line is literal: `NFY: <feature>` (the owner's word), for example "NFY: fighting back". It is used only for a feature that exists in the design and is not built. It is never a polite word for "you cannot": a feature the design retired has no refusal, and a thing the player can fix has a reason of its own. A verb whose handler is missing is `NFY` by construction: `interactions.json` (logic-table.md 3) marks the entry `status: "nfy"` and the server answers `NFY` with the entry's `feature` tag, so the "unbuilt" state is data, not a code path nobody noticed.
2. **A missing unlock is named in the world's voice.** `NEED_TOOL`, `NEED_KEY`, `NEED_ITEM`, `NEED_MATERIALS`, `NEED_STATION`, `NEED_SCRIP`, `NEED_FAITH` carry what is missing (an item id, a station id or a shortfall) and the line says what happened and what would fix it. The owner's example is the template: "Failed to pick the lock. Looks like you might need a lock pick." Two parts: what you tried and why it failed, then what you lack. The item is named by its plain name in `items.json`, so the line cannot drift from the item.
3. **Nothing is "can't do that".** The generic fallback goes away. A refusal the client has no line for shows `Nothing happens` in release builds (the same words a voided kill already uses) and logs the unknown reason; a development build shows `Bug: unhandled refusal <reason>`. A test (section 7) makes sure no reason in the enum lacks a line, so the fallback should never fire.
4. **Secrecy comes first.** A reason must not tell the player something the world has not shown them. A voided kill stays `VOIDED` ("Nothing happens") whether a Bandage, a Watch, a Remedy or a charm caused it, and takes the same time. `NOT_YOUR_POWER` (an ability the seat's role lacks) is never offered by the client, so it only fires for a cheat, and its line must not hint at which roles have the ability.
5. **A malformed request is not the player's fault.** `BAD_REQUEST` and `DEBUG_ONLY` are never shown in release. They keep the old `msg` for the server log.

## 4. The reason list

This replaces the 95 strings. It is one closed enum in `@wdi/shared` (`RefusalReason`), next to `ErrorCode`. The legacy `code` stays: the client uses it for the door sound and the prompt shake (`World.ts:283-286`) and for older builds. `Sites` is the number of sites in the appendix that map to the reason. The lines are draft copy in the world's voice; `{item}` is filled from the item's name and `{n}` from the shortfall.

### 4.1 Unfinished and malformed

| Reason | Code | Sites | Args | Line (draft) |
| --- | ---: | ---: | --- | --- |
| `NFY` | 422 | 5 | `feature` | NFY: {feature}. |
| `BAD_REQUEST` | 422 | 20 | none | _never shown_ (dev: `Bug: bad request`) |
| `DEBUG_ONLY` | 422 | 1 | none | _never shown_ |

### 4.2 The seat and the moment

| Reason | Code | Sites | Args | Line (draft) |
| --- | ---: | ---: | --- | --- |
| `PHASE_CLOSED` | 425 | 27 | `until` (a phase class) | Not now. This waits for {until}. |
| `NOT_IN_PLAY` | 422 | 18 | `why` (`ghost`, `transit`) | A ghost: You have no hands for it now. Between scenes: Wait until you arrive. |
| `DOWN_OR_STUNNED` | 422 | 5 | none | You are too dazed to do that. |
| `BUSY` | 426 | 13 | none | Your hands are full right now. |
| `COOLDOWN` | 424 | 4 | `readyInS` | Not ready yet: {readyInS} s. |
| `SPENT` | 422 | 8 | `what` | A power: You have used it up for tonight. A stock: Nothing is left. |
| `LOBBY_ONLY` | 425 | 4 | none | The party has started. That is settled now. |
| `NOT_LEADER` | 422 | 2 | none | Only the party leader can change that. |
| `LOBBY_RULE` | 422 | 5 | `rule` | The party cannot do that: {rule}. |

### 4.3 Reach and targets

| Reason | Code | Sites | Args | Line (draft) |
| --- | ---: | ---: | --- | --- |
| `TOO_FAR` | 427 | 16 | `of` (a target class) | Too far from {of}. Step closer. |
| `NO_TARGET` | 422 | 9 | none | There is nobody within reach. |
| `NOTHING_THERE` | 422 | 11 | none | There is nothing there. |
| `TARGET_DOWN` | 422 | 2 | none | They are already down. |
| `NOTHING_TO_CURE` | 422 | 2 | none | There is nothing wrong that this would mend. |
| `VOIDED` | 422 | 3 | none | Nothing happens. (Opaque on purpose, rule 4.) |
| `NO_WAY` | 422 | 1 | none | There is no way through there. |
| `NOT_AIMED` | 422 | 1 | none | You have no shot lined up. |
| `ALREADY_DONE` | 422 | 3 | `what` | Already done: {what}. |
| `ALREADY_HAVE` | 422 | 2 | `item` | You have {item} already. |

### 4.4 Missing unlocks (rule 2)

| Reason | Code | Sites | Args | Line (draft) |
| --- | ---: | ---: | --- | --- |
| `NEED_TOOL` | 422 | 2 | `need`, `tier` | Generic: You cannot work this without {item}. Per interaction, in `interactions.json`: "The seam will not give. A spade would." |
| `NEED_KEY` | 423 | 0 (new) | `need` | The lock holds. It wants {item}. |
| `LOCKED` | 423 | 1 | `lock` | Failed to pick the lock. Looks like you might need a lock pick. (When `lock` names a pickable tier and the seat holds none; with a pick but too low a tier: "Your pick is too thin for this lock.") |
| `CURFEW` | 423 | 1 | none | Locked for the night. Curfew keeps you out. |
| `BOARDED` | 428 | 1 | none | Boarded up. Not open yet. |
| `NEED_ITEM` | 422 | 6 | `need` | You are missing {item}. |
| `NEED_MATERIALS` | 422 | 3 | `missing` (list) | You are short: {missing}. |
| `NEED_STATION` | 422 | 1 | `need` | You need a {station} to do that. |
| `NEED_SCRIP` | 422 | 6 | `short` | You are {short} Scrip short. |
| `NEED_FAITH` | 422 | 1 | `short` | Your Faith is {short} short. |
| `NOT_YOUR_POWER` | 422 | 2 | none | You do not know how. |

### 4.5 Packs, money and counters

| Reason | Code | Sites | Args | Line (draft) |
| --- | ---: | ---: | --- | --- |
| `PACK_FULL` | 422 | 5 | none | Your pockets are full. |
| `FAITH_FULL` | 422 | 1 | none | You cannot hold any more Faith. |
| `NO_COUNTER` | 427 | 8 | `kind` | There is no {kind} here. |
| `COUNTER_CLOSED` | 422 | 2 | `kind` | The {kind} is closed. |
| `NOT_FOR_SALE` | 422 | 1 | `item` | That is not for sale. |
| `NOT_BOUGHT_HERE` | 422 | 1 | `item` | Nobody here buys {item}. |
| `NOTHING_OWED` | 422 | 1 | none | You owe nothing. |
| `SEAL_BLOCKS` | 422 | 1 | none | The Seal still shields them. |
| `OWN_NAME` | 422 | 1 | none | You cannot post a notice on yourself. |

### 4.6 People and tasks

| Reason | Code | Sites | Args | Line (draft) |
| --- | ---: | ---: | --- | --- |
| `NOT_YOURS` | 422 | 2 | `what` | That is not yours to {what}. |
| `TASK_TAKEN` | 422 | 1 | none | Someone else has taken that. |
| `TOO_MANY_QUESTS` | 422 | 1 | none | You are carrying all the work you can. |
| `LOOK_TAKEN` | 422 | 1 | none | A teammate already wears that. |
| `SAY_SOMETHING` | 422 | 2 | none | _the empty line is dropped; nothing is shown_ |
| `CHAT_RATE` | 424 | 2 | `readyInS` | Slow down. Wait {readyInS} s. |

### 4.7 Retired with voting

| Reason | Code | Sites | Note |
| --- | ---: | ---: | --- |
| `RETIRED_VOTE` | mixed | 5 | `Meeting.ts:95,101,108,114`, `FinalNight.ts:42`. They go with `docs/round9/phases.md`; the enum never gains them. Until voting is removed they keep their old words. |

### 4.8 Check

Sites by reason, from the generator behind the appendix: `PHASE_CLOSED` 27, `BAD_REQUEST` 20, `NOT_IN_PLAY` 18, `TOO_FAR` 16, `BUSY` 13, `NOTHING_THERE` 11, `NO_TARGET` 9, `SPENT` 8, `NO_COUNTER` 8, `NEED_ITEM` 6, `NEED_SCRIP` 6, `LOBBY_RULE` 5, `DOWN_OR_STUNNED` 5, `NFY` 5, `PACK_FULL` 5, `RETIRED_VOTE` 5, `LOBBY_ONLY` 4, `COOLDOWN` 4, then 3 each for `ALREADY_DONE`, `VOIDED`, `NEED_MATERIALS`; 2 each for `NOT_LEADER`, `NOT_YOUR_POWER`, `TARGET_DOWN`, `NOTHING_TO_CURE`, `NOT_YOURS`, `NEED_TOOL`, `ALREADY_HAVE`, `COUNTER_CLOSED`, `SAY_SOMETHING`, `CHAT_RATE`; and 1 each for `DEBUG_ONLY`, `NOT_AIMED`, `TASK_TAKEN`, `TOO_MANY_QUESTS`, `BOARDED`, `LOCKED`, `CURFEW`, `NO_WAY`, `NOTHING_OWED`, `NOT_FOR_SALE`, `NOT_BOUGHT_HERE`, `OWN_NAME`, `FAITH_FULL`, `NEED_FAITH`, `LOOK_TAKEN`, `NEED_STATION`, `SEAL_BLOCKS`. That is 48 reasons for 221 sites, 5 of them retired with voting.

New reasons the logic table adds, none of which exists today (so none has a site yet): `NEED_KEY`, and the per-interaction `fail` lines of section 5.

### 4.9 Reasons the owner answers add

None exists today, so none has a site yet. Each joins the enum with a line in the copy table.

| Reason | Code | Args | Line (draft) | From |
| --- | ---: | --- | --- | --- |
| `IN_JAIL` | 422 | `untilDawn` | You are in the county jail until dawn. | `world-mode.md` 5.1 (owner answers WM11, LW9) |
| `ASLEEP` | 426 | none | _never shown_: any input wakes the sleeper instead | `world-mode.md` 7.3 (follow-up 2) |
| `NO_BED` | 422 | none | This is not your bed. Your own is at home. | `world-mode.md` 7.3 |
| `BOARDED_HOME` | 428 | none | Your house is boarded up. Pay what you owe, or find a cot. | owner answer EP3 |
| `PETITION_GRACE` | 422 | `readyInS` | The case was just dismissed. Wait {readyInS} s. | `world-mode.md` 3.1 (owner answer WM2) |
| `PETITION_OPEN` | 422 | none | A petition is already open against them. Sign that one. | `world-mode.md` 3.1 |
| `NOT_HUNTED` | 422 | none | There is no warrant for them. Petition first. | `world-mode.md` 3.1 (cuffing without a manhunt) |
| `PICK_SNAPPED` | 422 | none | The pick snaps. Ease the tension next time. | `logic-table.md` 8.5 (owner answer LT2) |
| `GRID_NO_RECIPE` | 422 | none | Nothing comes of that. | `logic-table.md` 8.6 (owner answer LT4) |
| `GRID_BOUND` | 422 | `item` | {item} stays with you. It cannot be worked. | `logic-table.md` 8.6 (a role-bound item; the line names the item, never the role) |
| `NEEDS_PART` | 422 | `missing` | The oven wants the parts first: {missing}. | `logic-table.md` 7.1 (owner answer LT1) |

`PACK_FULL` keeps its line with the bigger pack (LT4); `NEED_TOOL` covers every pile now walled by its tool (LT1).

## 5. In-world lines come from the interaction, not the reason

A generic `NEED_TOOL` line is a fallback. The table of `logic-table.md` gives each interaction its own `fail` lines, keyed by reason, because the owner's example is specific to the lock and the tool:

| Interaction (logic-table.md) | Reason | Line (draft) |
| --- | --- | --- |
| Pick a lock, no pick | `NEED_TOOL` (`pick`) | Failed to pick the lock. Looks like you might need a lock pick. |
| Pick a lock, tier too low | `NEED_TOOL` (`pick`, tier 2) | The pick bends. This lock wants a finer one. (With the mini-game, owner answer LT2, a low-tier pick may still try, with a narrow band; the line shows only on a snap, as `PICK_SNAPPED`) |
| Chop a lumber pile, no axe | `NEED_TOOL` (`cut`) | You tug at the timber. It will not come apart by hand. An axe would. (Owner answer LT1: by hand it gives nothing) |
| Fell a tree, no axe | `NEED_TOOL` (`cut`) | The trunk will not move for your hands. An axe would fell it. (owner answer LT1) |
| Take from a rock or ore pile, no pickaxe | `NEED_TOOL` (`break`) | The pile is packed hard. A pickaxe would break it loose. (owner answer LT1) |
| Saw logs, not at a saw | `NEED_STATION` | Logs want a saw. The lumber mill has one, or a saw horse will do slowly. (owner answer LT1) |
| Break a boulder, no pickaxe | `NEED_TOOL` (`break`) | The boulder does not care. You would want a pickaxe. |
| Dig a tin seam, no spade | `NEED_TOOL` (`dig`) | The seam will not give. A spade would. |
| Pry a nailed crate | `NEED_TOOL` (`pry`) | The lid is nailed down. Something to lever it with would help. |
| Open a locked chest, no key | `NEED_KEY` | The lock holds. It wants a key, or a pick. |

`interactions.json` stores the `fail` lines so a writer changes copy without touching code, and a test checks that every `NEED_*` an interaction can raise has a line. The generic lines of section 4 apply when an interaction defines none.

## 6. How the reason reaches the player

### 6.1 Wire

`S2C.error` becomes `{ code, reason, args?, interaction?, msg }`.

- `reason` is a `RefusalReason` id (section 4). `args` is a small record (`need`, `tier`, `readyInS`, `missing`, `of`, `feature`). `interaction` is an interaction id when the refusal came from the table.
- `code` is derived from the reason by one table in `@wdi/shared` (`REASON_CODE`), so the two can never disagree. It stays on the wire for the door sound, the shake and older clients.
- `msg` stays for logs, tests and `WDI_DEBUG`. The client never shows it.
- The server sends ids, not sentences: copy is client-side, so a language or a writer's change needs no server release, and nothing in a sentence can leak server state.

`reject(room, sessionId, code, msg)` becomes `reject(room, sessionId, reason, args?)`. The 221 call sites are a mechanical edit (section 7, PR 2). A lint rule forbids a string literal as the last argument of `reject` and `refuse`.

### 6.2 Client

- Add `apps/client/src/ui/copy/refusals.ts`: a `Record<RefusalReason, string | ((args) => string)>`, with `{item}` resolved from `items.json` through `@wdi/content` (the client already imports it: `net/mock/worldMock.ts`).
- `refusal()` at `World.ts:761-770` becomes: if `e.interaction` and the interaction has a `fail` line for `e.reason`, use it; otherwise use the copy table; otherwise the unknown-reason fallback (rule 3). The `lastVerb` guess and its four assignments (`World.ts:178,195,488,534`) are deleted. The `REFUSAL` code map (`World.ts:87`) stays only as the answer to a server that does not send a `reason` yet.
- `refuse.generic` ("That did not work") and the unreachable parts of `ui/copy/world.ts:32-42` are deleted. `refuse.nothing` becomes the line of `VOIDED`.
- Display: the line goes through `hud.say` as today, but a `NEED_*` refusal also shows the missing item's icon beside the line for the usual 2.5 s toast, and the refused prompt keeps its shake (`refusedIn`, UI.md 9). An `NFY` line is styled apart (a muted tag) so a tester can tell "the game is unfinished" from "you are missing something" at a glance.
- Prevent the refusal where possible. With `interactions.json` in the client bundle, the use prompt for a prop reads its best verb and greys it when the tool is missing, with the same missing-item line as a hint: "Chop (needs an axe)". The refusal then fires only for races (someone else emptied the pile first). This is the cheap half of the owner's complaint and costs no server work.
- A repeated refusal escalates: the second identical `NEED_*` in 30 s appends where the missing thing is found, when `interactions.json` knows (`hint`: "The general store sells axes."). This is open question 5.

### 6.3 What does not change

- The refusal never reveals hidden state (rule 4). The client gets the same few reasons it could infer from the world.
- `act.*` handlers still run only inside `step()`; a refusal is a reply, not a mutation.
- `ErrorCode` stays; nothing in `@wdi/shared` is renamed or removed.

## 7. Build plan and tests (for round 10; not part of this PR)

Each step is a PR under 400 lines and keeps the build green.

1. **Shared and content.** Add `RefusalReason`, `REASON_CODE`, and the optional `reason`, `args` and `interaction` fields on the error frame (additive; old clients ignore them). Add `refusals.ts` copy and its test.
2. **Server codemod.** Change `reject` and `refuse` to take a reason; convert the 221 sites, file by file, in three PRs by directory (`rooms/`, `sim/economy`, `sim/` rest). The server keeps sending `msg`.
3. **Client.** Read `reason` in `refusal()`; delete `lastVerb`, `refuse.generic`; add the NFY styling and the greyed prompt.
4. **Lint and the NFY audit.** Forbid a literal message; make every handler fallthrough return `NFY` with a feature tag.

Tests: every `RefusalReason` has a line (a type-level check on the `Record`); every `NEED_*` that an interaction can raise has a `fail` line or a generic one; `REASON_CODE` covers the enum; a golden test of the lines for the seven owner-visible examples in section 5; a test that no reason's line contains a role or ability name (rule 4); and the existing test that `reject` runs only inside `step()`.

## 8. Open questions for the owner

**All answered: FM1 to FM8 took the default (owner, 2026-10-25; `owner-answers.md`).** NFY shows in every playtest build and one switch hides it before release (FM1); lines name the exact item (FM2); plain second person, no jokes (FM3); a voided kill stays silent (FM4); a second identical refusal in 30 s adds a hint (FM5); ghosts get the same lines (FM6); the client may grey a tool or key check, never a hidden one (FM7); general copy in the client, each object's lines in the table (FM8). The questions as asked:

1. **How loud is `NFY`?** The brief wants it for the owner's own testing. _Default:_ shown in every build while the game is in playtest; a single flag hides it before release, in which case an `NFY` reads "Nothing happens" and is logged. Alternative: always show it.
2. **Does a missing-unlock line name the exact item?** "You might need a lock pick" tells a new player what to hunt for; some prefer a riddle ("something thin and bent"). _Default:_ name the item, as the owner's example does.
3. **Voice.** Plain second person, one short sentence for what happened and one for what is missing, with no jokes. _Default:_ yes. Alternative: each location speaks in its own voice (the chapel hushed, the mine terse); that is more copy to write.
4. **Should a voided kill ever explain itself?** Rule 4 keeps it opaque so the Killer learns nothing about who is protected. _Default:_ opaque. Alternative: tell the Killer "they were ready" (a protected target); it helps the Killer and gives a Bandage a new meaning.
5. **Do repeated refusals escalate to a hint?** _Default:_ yes, on the second identical `NEED_*` within 30 s, and only when the table knows where the thing is sold or found.
6. **Do ghosts get refusal lines?** _Default:_ yes, the same list; `NOT_IN_PLAY` carries the ghost wording.
7. **Is the client allowed to refuse before sending?** The greyed prompt in 6.2 stops a doomed request locally. _Default:_ yes for tool and key checks, never for anything that depends on hidden state.
8. **Where is the copy kept?** In the client (`ui/copy/refusals.ts`, section 6.2), and per-interaction lines in `interactions.json`. _Default:_ as written. Alternative: all copy in content JSON so one writer owns every line, at the cost of the client reading the whole file at load.

## 9. Appendix: every refusal site

Generated from `grep -rn "ErrorCode\." apps/server/src` (tests excluded) and checked against the code at each line. `Site` is the line number in the file named in the heading; `Code` is the `ErrorCode` name used there; `Message today` is the literal or the constant it passes. The proposed reason is the one named in section 4. A site with more than one cause is mapped by its line, not its message (for example the five `not now` lines that test `bodyBlocksAct` are `DOWN_OR_STUNNED`, not `PHASE_CLOSED`).

#### `rooms/handlers/admin.ts` (1)

| Site | Code | Message today | Proposed reason |
| --- | --- | --- | --- |
| `62` | cannot | msg | `DEBUG_ONLY` |

#### `rooms/handlers/lobby.ts` (12)

| Site | Code | Message today | Proposed reason |
| --- | --- | --- | --- |
| `111` | cannot | (code only) | `NOT_LEADER` |
| `112` | wrongPhase | (code only) | `LOBBY_ONLY` |
| `118` | cannot | (code only) | `LOBBY_RULE` |
| `202` | cannot | cannot change settings | `NOT_LEADER` |
| `203` | wrongPhase | not now | `LOBBY_ONLY` |
| `211` | cannot | bad setting | `BAD_REQUEST` |
| `218` | cannot | cannot add | `LOBBY_RULE` |
| `219` | wrongPhase | not now | `LOBBY_ONLY` |
| `221` | cannot | party is full | `LOBBY_RULE` |
| `227` | cannot | cannot remove | `LOBBY_RULE` |
| `228` | wrongPhase | not now | `LOBBY_ONLY` |
| `229` | cannot | no NPC seats | `LOBBY_RULE` |

#### `sim/Actions.ts` (16)

| Site | Code | Message today | Proposed reason |
| --- | --- | --- | --- |
| `45` | cannot | not now | `NOT_IN_PLAY` |
| `46` | wrongPhase | not now | `PHASE_CLOSED` |
| `47` | busy | busy | `BUSY` |
| `49` | cannot | not now | `DOWN_OR_STUNNED` |
| `78` | cannot | cannot do that | `NFY` |
| `88` | cannot | no bandage | `NOT_YOUR_POWER` |
| `95` | cooldown | not ready | `COOLDOWN` |
| `102` | cannot | no target | `NO_TARGET` |
| `106` | outOfRange | too far | `TOO_FAR` |
| `113` | cannot | no bandages left | `SPENT` |
| `134` | cannot | no body there | `NOTHING_THERE` |
| `141` | outOfRange | too far | `TOO_FAR` |
| `145` | cannot | already reported | `ALREADY_DONE` |
| `170` | outOfRange | too far | `TOO_FAR` |
| `175` | outOfRange | too far | `TOO_FAR` |
| `179` | cannot | the rope is spent | `SPENT` |

#### `sim/Chat.ts` (8)

| Site | Code | Message today | Proposed reason |
| --- | --- | --- | --- |
| `22` | cannot | say something | `SAY_SOMETHING` |
| `26` | wrongPhase | not now | `PHASE_CLOSED` |
| `28` | cannot | not now | `DOWN_OR_STUNNED` |
| `61` | cannot | (code only) | `NOT_IN_PLAY` |
| `63` | wrongPhase | (code only) | `PHASE_CLOSED` |
| `67` | cooldown | (code only) | `CHAT_RATE` |
| `68` | cooldown | (code only) | `CHAT_RATE` |
| `96` | cannot | say something | `SAY_SOMETHING` |

#### `sim/Coop.ts` (5)

| Site | Code | Message today | Proposed reason |
| --- | --- | --- | --- |
| `45` | wrongPhase | not now | `PHASE_CLOSED` |
| `46` | cannot | not now | `NOT_IN_PLAY` |
| `47` | busy | busy | `BUSY` |
| `49` | outOfRange | too far | `TOO_FAR` |
| `72` | cannot | cannot do that | `BAD_REQUEST` |

#### `sim/Covers.ts` (4)

| Site | Code | Message today | Proposed reason |
| --- | --- | --- | --- |
| `35` | wrongPhase | not now | `PHASE_CLOSED` |
| `36` | cannot | cannot do that | `BAD_REQUEST` |
| `42` | cannot | cannot do that | `BAD_REQUEST` |
| `46` | cannot | a teammate wears that | `LOOK_TAKEN` |

#### `sim/Craft.ts` (6)

| Site | Code | Message today | Proposed reason |
| --- | --- | --- | --- |
| `31` | wrongPhase | not now | `PHASE_CLOSED` |
| `32` | cannot | not now | `NOT_IN_PLAY` |
| `33` | busy | busy | `BUSY` |
| `35` | cannot | no such recipe | `BAD_REQUEST` |
| `37` | outOfRange | needs a station | `NEED_STATION` |
| `41` | cannot | missing materials or no room | `NEED_MATERIALS` |

#### `sim/FinalNight.ts` (1)

| Site | Code | Message today | Proposed reason |
| --- | --- | --- | --- |
| `42` | cannot | no skip in the final vote | `RETIRED_VOTE` |

#### `sim/Hold.ts` (8)

| Site | Code | Message today | Proposed reason |
| --- | --- | --- | --- |
| `41` | wrongPhase | not now | `PHASE_CLOSED` |
| `42` | cannot | not now | `NOT_IN_PLAY` |
| `43` | busy | busy | `BUSY` |
| `45` | cannot | nothing there | `NOTHING_THERE` |
| `46` | outOfRange | too far | `TOO_FAR` |
| `48` | cannot | already in your notebook | `ALREADY_DONE` |
| `64` | cannot | not now | `DOWN_OR_STUNNED` |
| `87` | cannot | cannot do that | `NFY` |

#### `sim/Impersonate.ts` (6)

| Site | Code | Message today | Proposed reason |
| --- | --- | --- | --- |
| `129` | cannot | cannot do that | `BAD_REQUEST` |
| `131` | cannot | cannot do that | `NOT_IN_PLAY` |
| `132` | wrongPhase | not now | `PHASE_CLOSED` |
| `134` | busy | busy | `BUSY` |
| `142` | cooldown | not ready | `COOLDOWN` |
| `146` | cannot | no target | `NO_TARGET` |

#### `sim/Kill.ts` (6)

| Site | Code | Message today | Proposed reason |
| --- | --- | --- | --- |
| `61` | cannot | no knife | `NEED_ITEM` |
| `64` | cannot | not now | `DOWN_OR_STUNNED` |
| `68` | cannot | no target | `NO_TARGET` |
| `106` | cannot | nothing happens | `VOIDED` |
| `111` | cannot | nothing happens | `VOIDED` |
| `114` | cannot | nothing happens | `VOIDED` |

#### `sim/LastShot.ts` (2)

| Site | Code | Message today | Proposed reason |
| --- | --- | --- | --- |
| `96` | cannot | cannot do that | `NOT_AIMED` |
| `101` | cannot | no target | `NO_TARGET` |

#### `sim/Meeting.ts` (5)

| Site | Code | Message today | Proposed reason |
| --- | --- | --- | --- |
| `95` | wrongPhase | no vote open | `RETIRED_VOTE` |
| `101` | wrongPhase | votes open ${balance.meeting.minVoteS} s into the discussion | `RETIRED_VOTE` |
| `108` | cannot | ghosts do not vote | `RETIRED_VOTE` |
| `114` | cannot | no such candidate | `RETIRED_VOTE` |
| `115` | cannot | FAITH_COPY.blocked | `SEAL_BLOCKS` |

#### `sim/Minigames.ts` (16)

| Site | Code | Message today | Proposed reason |
| --- | --- | --- | --- |
| `52` | wrongPhase | not now | `PHASE_CLOSED` |
| `54` | cannot | not now | `NOT_IN_PLAY` |
| `55` | busy | busy | `BUSY` |
| `59` | cannot | not your task | `NOT_YOURS` |
| `61` | wrongPhase | only at night | `PHASE_CLOSED` |
| `63` | outOfRange | too far | `TOO_FAR` |
| `66` | cannot | you lack the tool | `NEED_TOOL` |
| `85` | wrongPhase | not now | `PHASE_CLOSED` |
| `86` | cannot | not now | `NOT_IN_PLAY` |
| `87` | busy | busy | `BUSY` |
| `89` | cannot | you carry it already | `ALREADY_HAVE` |
| `90` | cannot | no room in your pockets | `PACK_FULL` |
| `117` | cannot | cannot do that | `BAD_REQUEST` |
| `119` | cannot | problem | `BAD_REQUEST` |
| `191` | cannot | nothing open | `NOTHING_THERE` |
| `208` | cannot | try again | `BAD_REQUEST` |

#### `sim/NightPowers.ts` (10)

| Site | Code | Message today | Proposed reason |
| --- | --- | --- | --- |
| `78` | cannot | cannot do that | `BAD_REQUEST` |
| `80` | cannot | cannot do that | `NOT_YOUR_POWER` |
| `82` | cannot | not now | `NOT_IN_PLAY` |
| `85` | wrongPhase | not now | `PHASE_CLOSED` |
| `89` | cooldown | used tonight | `SPENT` |
| `93` | cannot | none left | `SPENT` |
| `96` | cannot | no target | `NO_TARGET` |
| `98` | cannot | no target | `NO_TARGET` |
| `105` | cannot | watched last night | `SPENT` |
| `160` | cannot | cannot do that | `BAD_REQUEST` |

#### `sim/Phases.ts` (3)

| Site | Code | Message today | Proposed reason |
| --- | --- | --- | --- |
| `133` | cannot | bad deal | `BAD_REQUEST` |
| `139` | cannot | unknown phase | `BAD_REQUEST` |
| `144` | wrongPhase | not now | `PHASE_CLOSED` |

#### `sim/Portals.ts` (8)

| Site | Code | Message today | Proposed reason |
| --- | --- | --- | --- |
| `157` | wrongPhase | not now | `PHASE_CLOSED` |
| `162` | busy | busy | `BUSY` |
| `168` | cannot | no such door | `NOTHING_THERE` |
| `173` | outOfRange | too far | `TOO_FAR` |
| `177` | closed | boarded up | `BOARDED` |
| `182` | locked | locked | `LOCKED` |
| `187` | locked | locked | `CURFEW` |
| `192` | cannot | no way through | `NO_WAY` |

#### `sim/Quests.ts` (11)

| Site | Code | Message today | Proposed reason |
| --- | --- | --- | --- |
| `36` | wrongPhase | not now | `PHASE_CLOSED` |
| `37` | cannot | not now | `NOT_IN_PLAY` |
| `38` | busy | busy | `BUSY` |
| `62` | cannot | cannot do that | `BAD_REQUEST` |
| `64` | cannot | cannot do that | `BAD_REQUEST` |
| `67` | outOfRange | too far | `TOO_FAR` |
| `96` | cannot | already taken | `TASK_TAKEN` |
| `101` | cannot | too many quests | `TOO_MANY_QUESTS` |
| `125` | cannot | not taken | `BAD_REQUEST` |
| `129` | cannot | you lack what is wanted | `NEED_MATERIALS` |
| `133` | cannot | no room for the reward | `PACK_FULL` |

#### `sim/Resources.ts` (8)

| Site | Code | Message today | Proposed reason |
| --- | --- | --- | --- |
| `148` | wrongPhase | not now | `PHASE_CLOSED` |
| `149` | cannot | not now | `NOT_IN_PLAY` |
| `150` | busy | busy | `BUSY` |
| `153` | cannot | nothing there | `NOTHING_THERE` |
| `154` | cannot | nothing left | `SPENT` |
| `156` | outOfRange | too far | `TOO_FAR` |
| `159` | cannot | needs a tool | `NEED_TOOL` |
| `161` | cannot | no room | `PACK_FULL` |

#### `sim/body/cures.ts` (3)

| Site | Code | Message today | Proposed reason |
| --- | --- | --- | --- |
| `40` | cannot | nothing to cure | `NOTHING_TO_CURE` |
| `44` | cannot | none left | `SPENT` |
| `63` | cannot | nothing to eat | `NOTHING_TO_CURE` |

#### `sim/body/fists.ts` (4)

| Site | Code | Message today | Proposed reason |
| --- | --- | --- | --- |
| `49` | cannot | no target | `NO_TARGET` |
| `53` | outOfRange | too far | `TOO_FAR` |
| `60` | cannot | already down | `TARGET_DOWN` |
| `134` | cannot | already down | `TARGET_DOWN` |

#### `sim/body/verbs.ts` (7)

| Site | Code | Message today | Proposed reason |
| --- | --- | --- | --- |
| `35` | cannot | cannot do that | `NFY` |
| `58` | cannot | no ${def.name.toLowerCase()} | `NEED_ITEM` |
| `65` | cannot | not now | `DOWN_OR_STUNNED` |
| `70` | cooldown | not ready | `COOLDOWN` |
| `77` | cannot | no ${items.items[def.requires]?.name.toLowerCase() ?? def.requires} | `NEED_ITEM` |
| `112` | cannot | no target | `NO_TARGET` |
| `116` | outOfRange | too far | `TOO_FAR` |

#### `sim/economy/bank.ts` (4)

| Site | Code | Message today | Proposed reason |
| --- | --- | --- | --- |
| `40` | cannot | no bank here | `NO_COUNTER` |
| `52` | cannot | cannot do that | `BAD_REQUEST` |
| `58` | cannot | no bank open | `COUNTER_CLOSED` |
| `66` | cannot | not enough Scrip | `NEED_SCRIP` |

#### `sim/economy/coins.ts` (5)

| Site | Code | Message today | Proposed reason |
| --- | --- | --- | --- |
| `81` | wrongPhase | not now | `PHASE_CLOSED` |
| `82` | cannot | not now | `NOT_IN_PLAY` |
| `83` | busy | busy | `BUSY` |
| `85` | cannot | nothing there | `NOTHING_THERE` |
| `87` | outOfRange | too far | `TOO_FAR` |

#### `sim/economy/faith.ts` (12)

| Site | Code | Message today | Proposed reason |
| --- | --- | --- | --- |
| `59` | wrongPhase | not now | `PHASE_CLOSED` |
| `60` | outOfRange | no altar here | `NO_COUNTER` |
| `62` | cannot | your Faith is full | `FAITH_FULL` |
| `64` | cannot | no Scrip to give | `NEED_SCRIP` |
| `74` | cannot | not now | `NOT_IN_PLAY` |
| `77` | cannot | you hold none | `NEED_ITEM` |
| `82` | wrongPhase | not now | `PHASE_CLOSED` |
| `83` | outOfRange | no altar here | `NO_COUNTER` |
| `87` | cannot | you hold a Seal already | `ALREADY_HAVE` |
| `88` | cannot | not enough Faith | `NEED_FAITH` |
| `89` | cannot | not enough Scrip | `NEED_SCRIP` |
| `90` | cannot | your pack is full | `PACK_FULL` |

#### `sim/economy/holds.ts` (7)

| Site | Code | Message today | Proposed reason |
| --- | --- | --- | --- |
| `40` | wrongPhase | not now | `PHASE_CLOSED` |
| `41` | cannot | not now | `NOT_IN_PLAY` |
| `42` | busy | busy | `BUSY` |
| `45` | cannot | nothing there | `NOTHING_THERE` |
| `47` | outOfRange | too far | `TOO_FAR` |
| `48` | cannot | the bag is empty | `SPENT` |
| `50` | cannot | nothing to haul | `NOTHING_THERE` |

#### `sim/economy/hq.ts` (7)

| Site | Code | Message today | Proposed reason |
| --- | --- | --- | --- |
| `30` | cannot | not yet | `NFY` |
| `31` | wrongPhase | not now | `PHASE_CLOSED` |
| `35` | outOfRange | no station here | `NO_COUNTER` |
| `36` | cannot | not yours to build | `NOT_YOURS` |
| `39` | cannot | fully built | `ALREADY_DONE` |
| `40` | cannot | not enough Scrip | `NEED_SCRIP` |
| `42` | cannot | missing materials | `NEED_MATERIALS` |

#### `sim/economy/notices.ts` (7)

| Site | Code | Message today | Proposed reason |
| --- | --- | --- | --- |
| `33` | cannot | not now | `NOT_IN_PLAY` |
| `34` | cannot | no such notice | `NOTHING_THERE` |
| `37` | wrongPhase | only at a meeting | `PHASE_CLOSED` |
| `44` | wrongPhase | not now | `PHASE_CLOSED` |
| `46` | cannot | NOTICE_COPY.ownName | `OWN_NAME` |
| `52` | wrongPhase | not now | `PHASE_CLOSED` |
| `54` | outOfRange | no buyer here | `NO_COUNTER` |

#### `sim/economy/rent.ts` (4)

| Site | Code | Message today | Proposed reason |
| --- | --- | --- | --- |
| `144` | wrongPhase | not now | `PHASE_CLOSED` |
| `145` | outOfRange | no bank here | `NO_COUNTER` |
| `147` | cannot | you owe nothing | `NOTHING_OWED` |
| `148` | cannot | not enough Scrip | `NEED_SCRIP` |

#### `sim/economy/shops.ts` (13)

| Site | Code | Message today | Proposed reason |
| --- | --- | --- | --- |
| `38` | wrongPhase | not now | `PHASE_CLOSED` |
| `40` | cannot | not now | `NOT_IN_PLAY` |
| `42` | cannot | nothing here | `NOTHING_THERE` |
| `45` | outOfRange | too far | `TOO_FAR` |
| `57` | cannot | no shop here | `NO_COUNTER` |
| `59` | cannot | problem | `NO_COUNTER` |
| `80` | cannot | cannot do that | `BAD_REQUEST` |
| `81` | cannot | no shop open | `COUNTER_CLOSED` |
| `97` | cannot | not for sale | `NOT_FOR_SALE` |
| `102` | cannot | not enough Scrip | `NEED_SCRIP` |
| `106` | cannot | no room | `PACK_FULL` |
| `125` | cannot | not bought here | `NOT_BOUGHT_HERE` |
| `129` | cannot | not enough | `NEED_ITEM` |

#### `sim/inspect/index.ts` (6)

| Site | Code | Message today | Proposed reason |
| --- | --- | --- | --- |
| `27` | cannot | not now | `NOT_IN_PLAY` |
| `28` | wrongPhase | not now | `PHASE_CLOSED` |
| `29` | busy | busy | `BUSY` |
| `31` | cooldown | not ready | `COOLDOWN` |
| `49` | cannot | no one there | `NO_TARGET` |
| `52` | outOfRange | too far | `TOO_FAR` |

#### `sim/mobs/light.ts` (2)

| Site | Code | Message today | Proposed reason |
| --- | --- | --- | --- |
| `54` | cannot | not now | `NOT_IN_PLAY` |
| `58` | cannot | no light | `NEED_ITEM` |

#### `sim/townsfolk/mug.ts` (3)

| Site | Code | Message today | Proposed reason |
| --- | --- | --- | --- |
| `358` | cannot | not now | `NOTHING_THERE` |
| `361` | cannot | bad choice | `BAD_REQUEST` |
| `363` | cannot | not yet | `NFY` |

#### `sim/vendettas/contract.ts` (1)

| Site | Code | Message today | Proposed reason |
| --- | --- | --- | --- |
| `95` | cannot | cannot do that | `BAD_REQUEST` |

## 10. Reconciled

- **The bell's ding is not a refusal (owner answer WM2).** Ringing the bell with no purpose answers with a ding, which is the bell working, so it is neither `NFY` nor a refusal line.
- **A refused pairing is an answer, not a refusal (owner answer WM2).** "Walk with me" declined by a figure shows the figure's answer ("Not tonight."), drawn and timed alike for a human, an NPC seat and a townsperson (`world-mode.md` 12, R6). It never uses a `RefusalReason`, so the reason list cannot tell a person from an NPC.
- **A protected Killer's strike stays silent (FM4) while sentences are public.** `VOIDED` is unchanged. The Tribunal's verdict is public (`phases.md` 4); a refusal never echoes it.
- **NFY for the parts not yet built.** Until each owner-answer system ships, its verb answers `NFY` with a feature tag: `lock-pick mini-game`, `crafting grid`, `petition`, `manhunt`, `county jail`, `sleeping`, `the mill`, `bakery sections`. The `interactions.json` `status: "nfy"` rule covers the table's verbs; the new handlers register theirs.
