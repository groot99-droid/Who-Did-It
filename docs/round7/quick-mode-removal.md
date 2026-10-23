# The quick mode leaves; Crumb's Ovens gains its rooms

Written by 6Z on 2026-10-23 from the owner's two decisions of 13:05Z (DECISIONS A115, A116). Two sessions
build it: **7J** removes One Night Ultimate Baguette from the game; **7K** turns the owner's four station
pictures into walkable rooms of Crumb's Ovens on HollowMere. The ten kitchen pictures stay as source art for
the Port-au-Levain map (round 8, ROADMAP R8). The rules and every number stay in `docs/GDD.md` and
`packages/content/data`; this document points at them.

## 1. The decision

The owner, 2026-10-23: "did you get rid of quick mode", answered with "Remove the quick mode entirely", "Now, in
round 7"; then "you must make individual rooms for those pictures i sent that you used in onub", answered with
"Both" (the four station rooms now, inside Crumb's Ovens; the ten kitchen scenes seed Port-au-Levain). Nothing
before that message asked for either, so until 7J's PRs land the mode is still in the game and GDD 3.11 still
describes it.

What stays:

- The main mode, its rules and every number of `balance.json`.
- **Crumb's Ovens** (`bakery`, WORLD 4.3): a HollowMere building with a task node and a basin; its scene id, like
  every id of `SCENE_IDS`, is append-only (GDD 3.13) and is never removed or reused. 7K adds rooms to it.
- **The four mini-games** (pour, stoke, slide, crates): GDD 3.16 reuses them at the main mode's task stations.
  They move out of any `onub` folder and lose nothing: `view/onub/minigames/**` becomes `view/minigames/**`
  (`view/minigames/board.ts` imports it today), and the station numbers `sim/Minigames.ts` reads from
  `balance.onub.json` (`basesFromOnub`) move to a `minigames` block of `balance.json` with their schema, GDD
  3.16 naming the new place. No number changes.
- **The owner's art and recordings**: `assets/source/concepts/onub/*.jpg` (the pictures) and their rows in
  `assets/source/MANIFEST.md` stay, re-described as the Crumb's Ovens rooms (7K) and the Port-au-Levain
  reference set (round 8). The Baker's Bell track stays in the ROSW sound library (`who-did-it/the-baker-s-bell`)
  and leaves the client; it comes back with Port-au-Levain if the owner wants it there.
- `bakery.json`'s tilemap and the HollowMere map.

What goes: everything else that exists only for the quick mode. The inventory below was taken at b951a8d:
269 files exist only for the mode (their names say so, most of them renders) and 258 others mention it.

## 2. Inventory (7J)

| Area | What | Notes |
|---|---|---|
| `packages/shared` | `rules/onub.ts`, `rules/onubNight.ts`, their tests; `constants.ts` `LOFT_SCENE_INDEX`, `ONUB_ACT_PREFIX`, `ONUB_PREP`, `ONUB_ACTS`, `OnubActName`; `protocol/index.ts` `OnubLegalAct`, `OnubWakeView`, `OnubActLogEntry`, the `nightWake`/`nightReveal`/`onub.*` messages, the `dawn` meeting reason; `protocol/admin.ts` `mode: 'main' \| 'onub'`; `schema/index.ts` `Settings.mode`, `OnubState` and every quick-mode field | Schema version 5 (after 7H's 4). `SCENE_IDS` keeps every id. |
| `packages/content` | `balance.onub.json`, `roles.onub.json`, `schemas/onubBalance.ts`, `schemas/onubRoles.ts`, `test/onub.test.ts`, the quick-mode checks of `validate.ts` | `scenes/bakery.json` and `bakery.nav.json` stay. |
| `apps/server` | `sim/Onub.ts`, `sim/onub/**`, `sim/npc/onub.ts`, the quick-mode branches of `Conductor.ts`, `Phases.ts`, `Meeting.ts` (claims, the Pantry vote, no Skip), `Deck.ts`, `Npc.ts`, `Actions.ts`, `Win.ts`, `Covers.ts`, `Hunger.ts`, `Mobs.ts`, `NightPowers.ts`, `Portals.ts`, `Resources.ts`, `Minigames.ts`, `Train.ts`, `auto/Auto.ts`, `handlers/lobby.ts` (the mode setting), `services/MatchLog.ts`; tests `onub*.test.ts`, `onubNightHelpers.ts`, `onubPrepHelpers.ts` | The main-mode branch of each file is the one that stays; a `mode === 'main'` check becomes no check. 6P's #73 touches `apps/server/test/*.test.ts`: 7J deletes the `onub*` files only and edits no other existing test file. |
| `apps/client` | `net/onub*.ts`, `net/mock/onub*`, `ui/onub/**`, `ui/copy/{onubNight,onubPrep}.ts`, `view/onub/**` (the mini-games move to `view/minigames/`), the DOM of `scenes/{Kitchen,Night}.ts`, the mode chip and toggle of `ui/Lobby.ts` (`mode-chip`, `mode-toggle`, the "Change Mode" control), `admin/Controls.ts` mode select, the music classes `kitchen`, `rush`, `over` and the `onub_*` playlists and tracks of `music.json` and `audio/music/manifest.json`, `e2e/onub.spec.ts`, the two `onub_kitchen` fixtures, `public/assets/{,lowpoly/,placeholder/}onub/**` | `MUSIC_CLASSES`, `MusicDirector.test.ts` and the per-map byte checks follow; 7A owns `music.json` and the bus, so 7J's edit there is the removal of the three classes and nothing else, merged after 7A's open PR. |
| `tools` | `bots/quick.ts` and its test, the `--mode` of `swarm.ts`, `soak.ts` and `ruin.ts`, `bots:*:onub` scripts in `package.json`, `.github/workflows/soak.yml`'s `onub` matrix row, `sprites/onub*.ts`, `sprites/onub-fixes.json`, `sprites/placeholder-onub.ts`, `sprites/test/onub.test.ts`, the `onub` rows of `tools/auto` | `pnpm auto` keeps its main-mode path. |
| Docs | GDD 3.11 (the section becomes a four-line record of what it was and A115; 3.12 to 3.21 keep their numbers), ARCHITECTURE 5.14, ASSETS 6.7, UI.md 14.12 and the quick-mode rows of 3, 11 and 12, `docs/guides/QUICK_MODE.md` (deleted), `docs/round5/onub-contract.md` (kept as history with a one-line header), WORLD 4.3's bakery row, PROTOCOL.md regen, CLAUDE.md's three mentions, README.md, the `CREDITS.md` and `LICENSES/vendors/README.md` rows of the quick-mode art and sounds, ROADMAP rows M3b and ONUB v2 (marked removed, A115) | The naming caution of CLAUDE.md goes with the name. |

## 3. 7J's PRs

Deletion-only PRs are exempt from the 400-line rule (A115): each PR is the deletions plus the smallest edits
that keep `pnpm lint && pnpm typecheck && pnpm test` green. Order:

1. **Client.** The quick-mode screens, net layer, mocks, copy, e2e, fixtures and renders; the mode chip and
   toggle leave `ui/Lobby.ts` (after 7E's glass PR lands, so merge the base first); the mini-games move to
   `view/minigames/`; `admin/Controls.ts` loses the mode select. `Settings.mode` is still on the wire and the
   client sends `main`.
2. **Server, shared, content, tools.** The wire (schema version 5), the rules, the server branches, the content
   files and their schemas, the bots, the scripts, the soak workflow row. `PROTOCOL.md` regenerated with
   `pnpm docs:protocol`.
3. **Assets and documents.** The sprite tools, CREDITS and MANIFEST rows, LICENSES, GDD 3.11 and the other
   document edits of the inventory, the music classes and tracks (after 7A's PR 2, #101, is on the base),
   `docs/guides/QUICK_MODE.md`.

Each PR says in its body what it deletes by area, what it keeps and why (the mini-games, the bakery, the art
sources), and the test counts before and after. 7J never edits `apps/server/test/*.test.ts` files other than the
`onub*` ones it deletes, never renames a scene id, and never touches `ui/theme/**`, `sim/vendettas/**`,
`sim/Train.ts` or `sim/Memorial.ts` beyond removing a quick-mode branch.

## 4. Crumb's Ovens' rooms (7K)

The owner's four station pictures, `assets/source/concepts/onub/station_{fridge,mixer,proofing}.jpg` and the
oven render behind `onub_station_oven`, become four interior scenes behind Crumb's Ovens' back wall: the cold
room, the mixing room, the oven room and the proofing room. Each is a scene under GDD 3.13 and WORLD 4.3: a
new id with a new prefix (never `bk`, never a reused one), `profile: small`, `kind: interior`, `biome: house`,
a door to `bakery` and, where the picture shows one, a second door between rooms; one spawn, one clue spot and
one hiding spot each; the station prop as a task node of the main mode (GDD 3.16: the room's mini-game at its
station); lights from the picture. The tilemaps are made the way round 5's interiors were (`docs/SPRITES.md`,
`tools/grid`, `tools/blender` for the lowpoly set, the 8-bit set by hand), with the picture as the reference
and a CREDITS row for each render that is generated. `maps/hollowmere.json` lists the four scenes; `SCENE_IDS`
appends them; WORLD 4.3 gains four rows and GDD 3.13's scene count changes in the same PR.

7K's PRs: (1) the four scene JSONs, nav, portals, the map and `SCENE_IDS`, content validation, WORLD 4.3,
GDD 3.13; (2) the tilemaps and renders for both art styles, CREDITS and MANIFEST; (3) the task nodes and the
e2e walk (`e2e/looks.spec.ts` or a new `e2e/ovens.spec.ts`) through the four rooms. Each under 400 lines
where the data allows.

Not 7K's: the ten kitchen scenes (cellar, cold pantry, command desk, dish pit, expediter, front of house,
hygiene, lamination, shaping bench, sub-basement). They are Port-au-Levain's and wait for round 8; 7K lists them
in `docs/round8/` as a seed note when that folder exists, or in its log line until then.

## 5. Order and gates

- 7G reverts its quick-mode re-skin commit on `claude/r7-table-ui` and ships the meeting and game over alone; its
  admin page PR waits for 7J's PR 1 so the mode select is gone first.
- 7E's lobby glass PR lands before 7J's PR 1; 7E leaves the mode chip and toggle untouched.
- 7A's #101 lands before 7J's PR 3 touches `music.json`.
- 6P drops `onub.spec.ts` and `bots:soak:onub` from #73's list (A115).
- 7K's PR 1 merges before 7J's PR 2 only if both are ready together; otherwise whichever is green first, and
  the other merges the base (both touch `SCENE_IDS` by appending; `validate.ts` by different checks).
- 7P's integration adds the removal to its soaks: `pnpm auto -- --matches 50` per map, and the `soak` workflow
  with its single `main` row.
