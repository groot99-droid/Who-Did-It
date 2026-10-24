# Mini-games: the stations and the polish (7M, round 7)

> 7M's notes for the five mini-game kinds (GDD 3.16) and the ten tasks that play them (GDD 3.5): how each row is drawn
> as its own station, what the UDGT teardown found and what PR 5 changed, and the lore drifts left for the owner.
> Decision A151. Numbers live in `GDD.md` and `balance.json`; this file restates none.

## 1. Each row drawn as its own station (A151 (3))

Nine fetch tasks share five kinds, so a kind's widget used to draw its first station everywhere: the fence and the
flour sack drew the cold room's cart and crates. Each `minigames.json` row now carries a `skin`: the station's own
object and the pieces the hands move, one per step (the last one repeats). The widget draws those labels where it
drew fixed ones, and the hints and buttons name them (`{station}`, `{piece}` in `ui/copy/minigames.ts`). The labels
stand in for atlas frames until the mini-game art exists. A skin changes no rule: the board, the answer and the
server's replay are the same bytes.

| Row | Kind | Task | Station | Pieces |
|---|---|---|---|---|
| `lanternPour` | pour | Light the lanterns | lantern | oil |
| `pumpSlide` | slide | Fix the well pump | pump | washer |
| `letterTap` | tap | Deliver a letter | door | letter |
| `fenceCrates` | crates | Mend the fence | fence | plank |
| `flourCrates` | crates | Fetch the flour | flour bin | sack |
| `doughPour` | pour | Mix the dough | mixer | flour, water |
| `ovenStoke` | stoke | Stoke the oven | brick oven | oak |
| `coldCrates` | crates | Stock the cold room | cart | crate |
| `proofSlide` | slide | Proof the loaves | proofer | banneton |

Shutter the windows has no row: it is the co-op hold (PR 4b). A board that no row names (a test's, or a task before
its row is written) draws its kind's own station (`DEFAULT_SKINS`, `view/minigames/skin.ts`). The modal shows the
task's name under its title, so the player knows which job the board is.

The station gestures of `docs/round8/stations.md` (knead, rake, peel, heave, hammer) are new kinds with their own
rules, so they are station PRs S5 and S6, not skins.

## 2. The teardown's findings (ROSW `teardowns/who-did-it/`, read only)

| Finding | Where | What PR 5 did |
|---|---|---|
| "Readable in 20 seconds" (GDD 1); pixel type on menus, not in matches (owner, 2026-10-23) | 01-ui, "Pixel type" | The mini-game's title and buttons read in the display face (`--wdi-font-display`), not the pixel one. A mini-game is play under time pressure. |
| The board does not say what it is for | 03-gameplay, the second layer | The task's name sits under the title. Hints name the station's own objects, not the cold room's. |
| Phone and desktop equally (the HUD's stick and touch buttons) | 01-ui, "Phone and desktop" | The canvas takes `touch-action: none`, so a drag never scrolls or zooms the page. A long press neither selects nor opens the callout. A touch the browser takes back (`pointercancel`) puts a dragged crate or banneton back and ends a pour, where before it stuck held and ran on to a spill. On a coarse pointer every small control is a full touch target (`--wdi-touch`). |
| Reduced motion | UI.md, `prefers-reduced-motion` | The moving needles and markers are the rule itself (the server replays their timing), so they stay. Nothing else in a widget moves; the modal's backdrop blur was already off under reduced motion. |

Not done here: both screenshot sizes for the mini-game modal on every e2e run (the teardown's "equal is tested, not
just intended"). That belongs to the integration's screenshot set (7P), not to a 7M PR.

## 3. Lore drifts, for the owner (not changed here)

Read in ROSW (the lore digest, the Daybook of Crumb's Ovens, the Lamplighter's Round, the Gazette). Each is a canon
question for 8V's pass (`docs/round8/teardown.md` 4), not a 7M change:

- The lore dates HollowMere to 1893; GDD 3.13 says 1931.
- The lore kneads at a trough and proofs cold; the rooms have a mixer and a candle-warmed cabinet (A118).
- The lore keeps the pump and the well apart. The Overworld has both (`ov.pump`, `ov.well`), and the well is a
  wash station that becomes the luck meter (stations.md 4).
- The lore knows no wrench at the apothecary. Fix the well pump takes its tool from there (GDD 3.5).
