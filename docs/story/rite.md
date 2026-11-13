# Brief: the Medium's rite and the 10X Vicar

Written 2026-11-10 by P0 from the owner's W1 clarification (`arc.md` 8.1, DECISIONS A517 addendum). This is a build
brief for a new session, called **R** below. It restates no number: every number goes in `balance.json` and
`docs/GDD.md` only, in the same pull request as the behaviour that uses it.

## 1. What the owner decided

- The Vicar dies a martyr (GDD 3.20, the martyr's due). The **Medium resurrects him**, and he returns **the next day of
  the same match** as the **10X Vicar**, fighting **against** the Zealot.
- **No rite, no return.** Without the rite there is no return and no buff. The rule holds in every game, story and
  multiplayer alike.
- **The rite** happens at the **Zealot's hideout** in the deep woods, the anti-theme of the Vicar's chapel (`arc.md`
  8.2). It costs nothing and cannot be interrupted. The dead Vicar goes there through the world.
- **The Medium is an NPC gate.** It is always present and cannot be killed. It is not a card and not a seat, and it
  draws on no secret stream (`sim/seeds.ts`). **It replaces the dealt Medium card.**
- **The 10X buff** is the Vicar's conversion power, upgraded from one seat at a time to an area spread, plus speed and
  health. It lasts the whole return day and is tuned so the Vicar could plausibly win that day. It supersedes the owner
  brief's next-match return (`flow.ascendedVicarCandidate`).
- **The martyr's task weight** (GDD 3.20, `tasks.martyrWeight`) is gated behind the rite as well.

## 2. What exists today

| Piece | Where | State |
| --- | --- | --- |
| The martyr, the memorial film, the candidate | `apps/server/src/sim/Memorial.ts`, GDD 3.20 | Built. The martyr follows the **public look**; the candidate follows the **dealt card** |
| The martyr's 10x task weight | `sim/Minigames.ts` `taskBarValue`, `balance.json` `tasks.martyrS`, `tasks.martyrWeight` | Built, with no gate |
| The next-match candidate | `sim/Flow.ts` `ascendedVicarCandidate` | Written, never read |
| Ghosts | GDD 3.8 "Death and ghosts", `sim/Movement.ts`, `sim/Portals.ts`, `sim/Visibility.ts` | Built. A ghost sees every role and reads the Cabal channel |
| A comeback | GDD 3.22 "On the line" (C1), `sim/Train.ts`, `sim/Death.ts` | Built. A day death by bite or shot comes back at the next Train with `respawn.hp`; the seat gets no ghost view while it waits |
| Conversion (Faith, the sermon, the Peaceful win) | `docs/round10/scope.md` I9 | Built server side by story I9 (A606): `isConverted`, `addFaith` for R6 |
| The Medium card | `roles.json` `medium` (V2, `seance`, `seanceChalk`), GDD 3.2 row | In data, in no deck |
| The hideout | `arc.md` 8.2 | No scene. `forest_deep` ("The Fenwood") exists |
| Story revive | `sim/story/handover.ts` `reviveHuman` | Built, story rooms only |

## 3. Questions to settle before code (each has a default)

**Answered (owner, 2026-11-10): the defaults on all of R-Q1 to R-Q8.** R logs them as a DECISIONS row in its first PR.

- **R-Q1. The buff list.** Is it the owner brief's three (a 10x conversion aura, Righteous Stride, Divine Judgement),
  or "area spread, speed, health"? Default: the area-spread conversion aura, plus a speed and health buff. Righteous
  Stride's door-breaking and Divine Judgement wait for a later PR.
- **R-Q2. Where is the hideout?** Is it the Fenwood (`forest_deep`), or a new building? Default: the site is data (a
  scene and a spawn in `balance.json` or a content file), so it moves without code. R builds against a test site, and
  ships on whatever site the map revamp names. Any new id is append-only, under a new prefix.
- **R-Q3. Who gets the rite: the look or the card?** The martyr follows the public look, so a cover in the Vicar's look
  is a martyr. The candidate follows the dealt card. If only the dealt Vicar comes back, his return tells everyone that
  the mourned seat was no cover, which breaks role secrecy (CLAUDE.md). Default: **the martyr gets the rite.** The
  return and its public buffs (speed, health) follow the look, so nothing leaks. The conversion aura works only for the
  dealt Vicar, and its effects stay private to each converted seat (I9 already requires a private count).
- **R-Q4. What the dead Vicar knows.** A ghost sees every role and reads the Cabal channel, so a ghost who comes back
  would know who the Killer is. Default: from the moment of death, the martyr is a **shade**, not a ghost. It walks
  like a ghost (through walls and portals, unseen by the living) but with a living seat's view: no roles, no Cabal or
  ghost channel. This is the same rule that keeps a seat on the line blind. If the martyr never takes the rite, it
  becomes an ordinary ghost at the next dawn.
- **R-Q5. When "next day" starts.** The Knife strikes only at dusk and at night, so the martyr dies at night N.
  Default: he returns at the start of the first day phase after the rite completes. He stands at the hideout with full
  health and the buff, and the buff ends at that day's dusk. If no rite is done by the end of that day, there is no
  return.
- **R-Q6. The martyr weight, once gated.** Today a ghost's tasks count 10x for `tasks.martyrS` from the reveal.
  Default: the window opens at the return, and it counts the returned Vicar's real tasks. With no rite, his ghost's
  tasks count like any ghost's.
- **R-Q7. Seance.** Keep `seance` and `seanceChalk` for the NPC's rite (as a cosmetic), or retire them with the card?
  This is open decision 3 in `orchestrator-handoff.md`. Default: retire both. The rite is a hold at the NPC.
- **R-Q8. The rest of the Ascended Vicar.** Does the next-match candidacy (`flow.ascendedVicarCandidate`) go away?
  Default: yes. R removes the field and its writer in the same PR as the return, and updates GDD 3.20.

## 4. The build, as pull requests

Each PR is under 400 lines, has tests for every rules change and changes the GDD in the same PR. All of R's PRs merge
into `claude/story-part2`, and merging needs the orchestrator's word.

| PR | Branch | Contents | Waits on |
| --- | --- | --- | --- |
| R1 | `claude/story-r-medium-card` | Retire the Medium card: a `retired` flag (or the schema's existing equivalent) on `roles.json` `medium`, so the id is never reused or dealt; `seance` and `seanceChalk` per R-Q7; the lobby toggle; `storyCoverage` skips retired cards; GDD 3.1, the 3.2 row and the 3.10 V2 list; `docs/round10/rolecards.md`; a DECISIONS row. Wire ids are retired, never renumbered | R-Q7 |
| R2 | `claude/story-r-shade` | The martyr becomes a shade, not a ghost (R-Q4): `Death.ts` and `Visibility.ts` on the on-the-line pattern, `Memorial.ts` names it. The leak test proves that a shade receives no role, no Cabal line and no ghost line. GDD 3.8 and 3.20 | R-Q3, R-Q4 |
| R3 | `claude/story-r-rite` | The Medium NPC at the rite site: an unkillable figure (no seat, no deal, no secret stream) in `sim/npc` or `sim/townsfolk`; the rite as a hold at the NPC, uninterruptible and free; a private `rite` message to the shade; the rite site as data; `balance.json` `rite.*` for the hold; GDD 3.20 | R-Q2, R2 |
| R4 | `claude/story-r-return` | The return at the next day's start (R-Q5) on the Train's respawn path: `alive` true, at the site, the cooldowns where they stood; the gated `martyrWeight` (R-Q6, `Minigames.ts`); `Flow.ascendedVicarCandidate` removed (R-Q8); GDD 3.20; tests for no rite, rite before day, rite late, and a cover martyr | R3 |
| R5 | `claude/story-r-buff` | The 10X buff for the return day: speed and health on GDD 3.22's effect table, numbers in `balance.json` `rite.buff.*`; the buff ends at dusk; GDD 3.20 and 3.22 | R-Q1, R4 |
| R6 | `claude/story-r6-aura` | The conversion aura: while the dealt Vicar is ascended, seats within `rite.aura.tiles` gain Faith (`addFaith`), and I9 converts them (A607) | I9 (#515, merged), R-Q1, R-Q3 |
| R7 | `claude/story-r-client` | Client: the Medium's figure, the shade's view (no roles), the rite prompt and hold, the return, and the buff on the HUD. UI.md rows, e2e at 390w and 1280x720 with `--trace off` | R3 to R5 |
| R8 | `claude/story-r8-*` | Story: `arc.md` 3.4 (drafted by R, A608), after the Doctor's 3.3, where the player takes the shade to the rite and plays the 10X Vicar against the Zealot. R8a the draft; R8b to R8d the engine needs E15 to E17; 3.4's `story.json` entry with P5's chapter 3 | R4, R5; the entry waits on P5 (W3) |

R6 is the only piece that needs work outside R. Until I9 builds conversion, the return day carries speed and health
only. GDD 3.20 says so, so the "could win that day" tuning is checked again when R6 lands.

## 5. Rules R must keep

- **Secrecy.** Nothing a client receives may show that the martyr wears a cover, a cover's true role, or the
  conversion count. The rite and its prompt go only to the shade. The return is public, because a seat comes back to
  life, so it must follow the look (R-Q3). The A168 per-message leak audit (`leak.test.ts`) gains a case for each new
  message.
- **Step only.** Every action (walking to the rite, the hold) is queued and consumed in `step()`. The Medium NPC acts
  from the step, not from a message callback.
- **Frozen ids.** A new scene, spawn or portal is a new id under a new prefix; nothing is renamed. Retired role and
  ability ids are never reused.
- **Locked files.** `Step.ts`, `Death.ts`, `Win.ts`, `Meeting.ts` and `Kill.ts` are locked call sites
  (`docs/SESSIONS.md`). R names any line it adds there in its PR description, as P4 did for `runAchievements`.
- **Numbers.** Only in `balance.json` and the GDD.
- **The base.** Nothing goes to `claude/zen-turing-m1jnw0` without the owner.

## 6. Paths R owns

- `apps/server/src/sim/Memorial.ts`, `Minigames.ts` (the martyr lines only), a new `sim/rite/`, `Flow.ts` (one
  field), and the lines `Death.ts` and `Visibility.ts` need for the shade.
- `packages/content/data/roles.json` (`medium` only), `abilities.json` (`seance`), `items.json` (`seanceChalk`),
  `balance.json` and its schema (`rite.*` only), and `validateStory.ts` (`storyCoverage` only).
- `apps/client/src/` for the shade view, the rite prompt and the buff.
- GDD 3.1, 3.2, 3.8, 3.10, 3.20 and 3.22; `docs/round10/rolecards.md`; DECISIONS rows; R's lines in
  `docs/story/status.md`.

## 7. Done when

- With no rite, a martyr stays dead, its tasks count like any ghost's, and nothing about the rite reaches any client.
- With the rite, the martyr comes back at the next day's start with the buff, the buff ends at dusk, and the martyr
  weight runs from the return.
- A cover martyr and a true Vicar martyr look the same to every other client.
- The Medium card is retired: it is in no deck, toggle or coverage list, and its id is kept.
- The lint, typecheck, content, server and client suites pass, along with the leak audit and the e2e run.
