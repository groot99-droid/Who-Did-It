# Parallel sessions (started 2026-10-10)

Four Claude Code sessions build the first milestones in parallel, one track each. This file is
the coordination contract: which paths each session owns, where PRs go, and the brief each
session was started with. A session reads this file first and never writes outside its paths.

## Branches and pull requests

| Session | Model | Track | Branch | Owns |
|---|---|---|---|---|
| **A. Server & shared** | Sonnet 5.5 | Code | `claude/m0-server` | root tooling (`eslint.config.js`, prettier, vitest config, root `package.json` scripts), `.github/workflows/ci.yml`, `packages/shared/**`, `apps/server/**`, `docs/DECISIONS.md` (spike results only), `docs/ARCHITECTURE.md` (only when code forces a correction) |
| **B. Client & Pages** | Sonnet 5.5 | Code | `claude/m0-client` | `apps/client/**` except `apps/client/public/assets/**`, `.github/workflows/pages.yml`, `LICENSES/fonts/**` |
| **C. Content data** | Opus 5.5 | Content | `claude/content-data` | `packages/content/**`, `docs/GDD.md`, `docs/WORLD.md` (id corrections only), the zod pin row in `docs/ARCHITECTURE.md` 5.1 |
| **D. Art pipeline** | Opus 5.5 | Art | `claude/art-pipeline` | `tools/blender/**`, `tools/sprites/**`, `assets/**`, `apps/client/public/assets/**`, `CREDITS.md`, `LICENSES/vendors/**`, `docs/SPRITES.md`, `docs/ASSETS.md` |
| **E. Decisions round (plan mode)** | Opus 5.5 | Design | `claude/decisions-round-3` | `docs/DECISIONS.md` and every document or data file a decision changes (`docs/GDD.md`, `WORLD.md`, `ARCHITECTURE.md`, `ASSETS.md`, `ROADMAP.md`, `packages/content/data/**`), `LICENSE-ASSETS`, `CREDITS.md`. Started 2026-10-10 after A to D closed; no other session runs beside it. |

- Base branch and PR target: `claude/zen-turing-m1jnw0` (the repo's default branch; no `main`
  exists yet). When the owner renames the default branch to `main`, open PRs follow automatically.
- Draft PRs, under 400 lines where the work allows (split by step or by data file). Each PR runs
  `pnpm lint && pnpm typecheck && pnpm test` clean before push.
- The root scaffold (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.nvmrc`,
  `.npmrc`, `.gitignore`, `.gitattributes`, `LICENSE`) is shared. Only Session A edits root
  files; the others add their package under `apps/*`, `packages/*` or `tools/*`.
- `pnpm-lock.yaml` will conflict between PRs. Resolution: merge the base branch, run
  `pnpm install` (pnpm resolves lockfile conflict markers itself), commit.
- Versions are pinned in `docs/ARCHITECTURE.md` 5.1. No session upgrades or substitutes a
  dependency. New dependencies a session needs (zod, free-tex-packer-core, mitt, eslint tooling)
  are added with a caret pin to the current npm release and recorded in 5.1 by that session.
- Role secrecy and the server `step()` rules in `CLAUDE.md` apply to every PR.

## Interfaces between sessions

| From | To | Contract |
|---|---|---|
| C content | A shared/server | `roles.json` is keyed so `assignRoles(ids, settings, rng)` reads a roster row by player count with no transformation; every record carries `gddRef`. Until C merges, A tests rules with inline fixtures that copy C's field names from this file's brief. |
| A shared | B client | Message names, payloads and error codes in `docs/ARCHITECTURE.md` 5.5. B keeps a local copy in `src/net/protocol.ts` with a TODO to import `@wdi/shared/protocol` once A merges. |
| D art | B client | Placeholder manifest keys in `docs/SPRITES.md`. Code imports keys, never paths. `?art=placeholder` keeps playtests running. |
| C content | D art | Scene ids, sizes and the ASCII grid legend (`#` wall, `D` door, `S` spawn, `H` hiding spot, `B` body spot, `.` floor) are frozen by C; D's placeholder tiles and `bld_<id>_ext` keys use those ids. |

Suggested merge order when several PRs are ready: A (tooling) -> C (content) -> B (client) -> D (art).

## Briefs

### A. Server & shared (Sonnet 5.5)

Read `CLAUDE.md`, this file, `docs/ARCHITECTURE.md` 5.1-5.8 and 5.10-5.12, `docs/ROADMAP.md` 7.1
(M0, M1) and 7.7 days 1, 2 and 4. Deliver in order:

1. Root tooling: `eslint.config.js` (typescript-eslint flat config), prettier, vitest config, root
   scripts wired with `pnpm -r`; `.github/workflows/ci.yml` per 5.10 (checkout@v7, setup-node@v7
   on 22, pnpm via corepack, lint + typecheck + test, dist size report, `lfs: false`).
2. `packages/shared` (`@wdi/shared`): `version.ts` (`BUILD_VERSION` from env with a dev
   fallback), `constants.ts` (`TILE_PX = 64` and only the radii ARCHITECTURE or GDD name; never
   invent numbers), `metrics.ts`, `dirFromVector` with a unit test, `schema/` in
   `@colyseus/schema` 5 builder style exactly as 5.4 (`Presence`, `Private`, `Player`, `Door`,
   `SceneState`, `Settings` with `mode` uint8, `MeetingState`, `GameState`), `protocol/` with the
   typed message names, payload types and error codes of 5.5, `rules/` with `mulberry32` and only
   what M1 needs (`assignRoles`, `dealTraits`) tested with inline fixtures.
3. `apps/server`: Colyseus 0.18, `GET /health` -> `{ok, build, rooms, tickP95, patchBytes}`, CORS
   per 5.10, `trust proxy` plus the token bucket on matchmake, `PartyRoom` with a custom 5-char
   `roomId` from an unambiguous alphabet, `presence.sadd` uniqueness, private matchmaking,
   `maxClients = 10`, `joinById`, one generic join error, the version handshake,
   `setFixedTimestep` 20 Hz with `sim/Step.ts` in the 5.6 order (empty stages are fine), a command
   queue (nothing mutates state in a message callback), `onJoin` with a `StateView` holding the
   player's own `Player` and its `SceneState`. Debug handlers only under `WDI_DEBUG=1`.
4. Day-2 spike results in `docs/DECISIONS.md` under "Spike results (M0)": custom `roomId` +
   `joinById`, one `.view()` field hidden from other clients, `setFixedTimestep` behaviour.
5. `@colyseus/testing` tests: 10 bots join and each sees only its own `priv`; the 11th join and a
   version mismatch are refused with the same generic error.

Check Colyseus 0.18 and `@colyseus/schema` 5 APIs with Context7 before writing them. Never add
`colyseus.js`; `@colyseus/sdk` is client-only and does not belong here.

### B. Client & Pages (Sonnet 5.5)

Read `CLAUDE.md`, this file, `docs/ARCHITECTURE.md` 5.1, 5.3, 5.5, 5.9, 5.10, `docs/ROADMAP.md`
7.1 (M0, M1) and 7.7 days 2, 3, 5 and 7. Deliver in order:

1. `apps/client` from the official Phaser 4 Vite + TypeScript template (phaser 4.2.1, vite ^8.3,
   typescript ~5.9; drop the template's log-ping script), `base: '/Who-Did-It/'`, hash routing,
   `pixelArt: false`, `src/{main,net,scenes,view,ui,flags}`; a Boot scene that reads flags
   (`?art=placeholder`, `?mock=1`, `#/join/CODE`) and polls `${VITE_SERVER_URL}/health`; a
   "Waking the village..." state while the Render Free server wakes; the canvas prints
   `{ok, build}` once `/health` answers.
2. `NetworkService` over `@colyseus/sdk` ^0.18.5 (never `colyseus.js`): `create("party", {name,
   build, deviceId})`, `joinById(code.toUpperCase())`, typed `send` / `request` from a local
   `src/net/protocol.ts` copied from 5.5 (TODO: import `@wdi/shared` when it merges), a `mitt`
   bus, the reconnection token in `localStorage` keyed by room code, every join failure shown as
   "party not found or unavailable".
3. DOM overlay (`pointer-events: none` except controls): Landing (Create Party, Join Party, name
   2-16 chars), Lobby (code, copy-link, player list, leader Start gated at 4 with a confirm
   dialog), RoleCard (CSS flip, 12 s, Ready, Tab to reopen) driven by the `roleReveal` payload of
   5.5 with a fixture behind `?mock=1`. Fonts Oswald + Inter self-hosted, licence texts in
   `LICENSES/fonts/`.
4. `.github/workflows/pages.yml` per 5.10 (`VITE_SERVER_URL`, `VITE_BUILD_VERSION=${GITHUB_SHA::8}`
   from Actions variables, configure-pages@v6, upload-pages-artifact@v5 of `apps/client/dist`,
   deploy-pages@v5) on push to the default branch; the PR lists what the owner must set.
5. Playwright ^1.64 smoke: two contexts create then join and both reach the lobby, against the
   `?mock=1` fixture while the server is absent; use the pre-installed Chromium, never
   `playwright install`.

Nothing in the client stores or shows another player's role. Check Phaser 4.2 and
`@colyseus/sdk` APIs with Context7 first.

### C. Content data (Opus 5.5)

Read `CLAUDE.md`, this file, `docs/GDD.md` in full, `docs/WORLD.md` 4.2-4.8,
`docs/ARCHITECTURE.md` 5.2, 5.4, 5.8, 5.14, `docs/ASSETS.md` 6.1, `docs/DECISIONS.md`.
Goal: `packages/content` (`@wdi/content`) is the single machine-readable source of every
roster, number and scene id that `GDD.md` and `WORLD.md` describe, validated by zod and tests.
Deliver:

1. Package skeleton: `package.json` (`@wdi/content`, ESM, exports data and validators), zod,
   vitest; one zod schema per file in `src/schemas/`; `src/index.ts` validates every JSON at
   import and exports typed data.
2. `data/palette.json`, `data/metrics.json` (ASSETS 6.1, WORLD 4.2), `data/roles.json`,
   `traits.json`, `items.json`, `abilities.json`, `clues.json`, `tasks.json`, `balance.json`:
   every number copied from GDD 3.x, each record carrying `gddRef`. Where the GDD is silent or
   ambiguous, choose and change `GDD.md` in the same PR.
3. `data/scenes/*.json` for all 15 scenes of WORLD 4.3: frozen ids, profile, size, portals with
   target scene and spawn, spawn ids, hiding and body spots, an ASCII grid at the exact tile size
   (`#` wall, `D` door, `S` spawn, `H` hiding spot, `B` body spot, `.` floor; overworld per 4.4);
   tests that every portal resolves, every grid matches its size and profile gating is consistent.
4. Quick mode: `data/roles.onub.json`, `data/balance.onub.json` (decks 4-10, night windows,
   timers, winner table) with tests for N+3 loaves per deck and a window for every role.
5. `pnpm --filter @wdi/content test` green and a short `packages/content/README.md`.

Design field names so `assignRoles(ids, settings, rng)` reads `roles.json` by player count
without transformation and so Tiled exports can replace the grids later with the same
`.nav.json` contract (ASSETS 6.3). No server or client code.

### D. Art pipeline (Opus 5.5)

Read `CLAUDE.md`, this file, `docs/ASSETS.md` in full, `docs/WORLD.md` 4.1, 4.2, 4.7,
`docs/GDD.md` 3.1-3.2, `docs/DECISIONS.md` open questions 5 and 6. Deliver:

1. `docs/SPRITES.md`: atlas key grammar `char/<body>/<anim>/<dir>` with non-role body ids, the
   8-direction order and frame regex of ASSETS 6.2, 128 px cells, the `Feet` pivot manifest,
   overlay passes (body, scarf, hat_cap, hat_bowler, blood), palette tokens, and every placeholder
   key M1-M3 needs (one villager body with idle / walk / swing / die x 8 directions, overlays, the
   clue sprites of 6.3, `bld_<id>_ext` for the Small-profile buildings, the 6 ground tilesets).
2. `tools/blender/build_rig.py` builds `render_rig.blend` from nothing on Blender 5.2 LTS
   (orthographic camera X = 40° Z = 0°, straight-down tile camera, turntable `TT`, camera-parented
   lights, toon node group, outline preset, 1 m checker cube and grid plane, EEVEE settings of
   6.2) so the rig is reproducible; `batch_render.py` (frame regex, 12 fps `frame_step`, 128 px
   cells, material-override passes, `Feet` -> `manifest.json`); `palettize.py`. Run the `--smoke`
   calibration render if Blender or the `bpy` wheel installs in the container and commit the sheet
   under `apps/client/public/assets/calibration/`; otherwise document the exact command and mark
   the PR unverified.
3. `tools/sprites/pack.ts` on free-tex-packer-core (exporter `Phaser3`, `allowRotation: false`,
   `allowTrim: true`, `detectIdentical: true`, `pot: true`, padding 2, extrude 1, max 2048, sorted
   inputs), `gen-anims.ts` writing per-frame origins from `manifest.json`, a unit test on a
   synthetic frame set, and `placeholder.ts` generating the placeholder atlas for every key in
   `SPRITES.md` (flat palette shapes, direction arrow, label).
4. `assets/source/prompts/<slug>.md` for prompts (1)-(10) of ASSETS 6.4 with the style suffix
   verbatim and the `generate_3d` settings of 6.9; `assets/source/MANIFEST.md` template;
   `CREDITS.md` header and policy (6.5); `LICENSES/vendors/README.md` listing the vendor terms
   to save before the first asset. If Higgsfield tools are available in the session, generate the
   hero villager concept (prompt 1) and one turnaround, save under `assets/source/concepts/` with
   a `CREDITS.md` row citing the generation id, and stop there; if not, stop at the prompt sheets
   and say so.
5. Faction and trait icons as SVG (Village, Cabal, Neutral; Height, Scarf, Hat variants) in
   `apps/client/public/assets/ui/icons/` on the 48 px grid, 2 px ink stroke, palette only; listed
   in `SPRITES.md`.

CC0 by default, CC-BY only with a `CREDITS.md` row, never Synty, never raw Mixamo or Quaternius
in the repo. Leave `LICENSE-ASSETS` absent until open question 6 is answered.

## Integration log (2026-10-10)

All four sessions finished their briefs in one pass each and opened draft PRs #1 to #4. The
orchestrator merged the four branches into `claude/zen-turing-m1jnw0` in the order A, C, B, D
(the only conflicts were in `pnpm-lock.yaml`, regenerated with `pnpm install`), reviewed the
integrated tree, and fixed the seams in one commit on top of the merges:

- Session A's eslint and prettier now apply to every package: the client's untyped room, the
  Playwright spec swept up by vitest, and the formatting of B, C and D files; `packages/content/data`,
  `apps/client/public/assets` and `assets/source` are prettier-ignored because their generators own
  their layout.
- `assignRoles` reads `roster[String(n)].deal`, the row shape of `roles.json` (A12); rules numbers left
  `@wdi/shared/constants.ts` for `balance.json`.
- The matchmake throttle keys on the last `x-forwarded-for` hop and `maxMessagesPerSecond` is applied
  (A13); the client treats `CloseCode.CONSENTED`, not 1000, as a consented leave.
- Docs reconciled: well ladder (A10), interior minimum (A11), rig built from code (A9), the Hireling act
  id, the M4 task count, the quick-mode chip, dependency rows in ARCHITECTURE 5.1, root `assets:render`.
- Held back: the two Higgsfield concept images stay on `claude/art-pipeline` until open question 13.

### Follow-ups for the next sessions

1. **Client imports `@wdi/shared/protocol`** instead of its local copy: add the workspace dependency,
   delete the duplicated types in `apps/client/src/net/protocol.ts`, and align the `roleReveal` payload
   (trait value ids, `teammates[]` element shape, `uses: number | null`). M1 blocker before Start works.
2. **Server Start**: `lobby.start` handler calling `assignRoles(ids, settings, rng, roles.rosters)` with
   `@wdi/content` as a server dependency, then `roleReveal` per client and the lobby -> roleReveal phase.
3. **Accomplice kit**: GDD 3.2 lists Forged Alibi (V1.5) in the kit while `roles.json` omits it; either
   add it with a `ships` flag or move it to the V1.5 note and delete the dead test exception.
4. `tools/sprites` declares `engines.node >= 22.18` (type stripping) against the root `>= 22.12`;
   `batch_render.py` writes `Feet` pivots only during the `body` pass; ARCHITECTURE 5.4's excerpt still
   shows `t.array(t.string())`; `/health.patchBytes` is not fed yet.
5. **Owner**: open questions 12 to 14 in `docs/DECISIONS.md`; GitHub Pages source = GitHub Actions and the
   `VITE_SERVER_URL` Actions variable; the Render Free service for `apps/server`.

## Round 2 (started 2026-10-10, after PRs #1 to #6 merged)

Five sessions, one track each, same rules as round 1 (draft PRs against `claude/zen-turing-m1jnw0`,
under 400 lines where the work allows, lint + typecheck + test clean before every push, pinned
versions only, no model identifiers in committed files). Code and tooling run on Sonnet 5.5; design
and art run on Opus 5.5 or Fable 5.1.

| Session | Model | Track | Branch | Owns |
|---|---|---|---|---|
| **F. M1 finish** | Sonnet 5.5 | Code | `claude/m1-finish` | `packages/shared/src/protocol/**`, `packages/shared/src/rules/roles.ts`, `apps/server/src/rooms/PartyRoom.ts` (lobby, Start, roleReveal, phase machine), `apps/server/src/rooms/handlers/lobby.ts` (new), `apps/server/test/lobby*.test.ts`, `apps/client/src/net/**`, `apps/client/src/ui/**` (except `theme/`), `apps/client/src/scenes/{Boot,Landing,Lobby,RoleReveal}.ts`, `apps/client/e2e/**`, `tools/bots/**`, `docs/PROTOCOL.md` (generated), `docs/ARCHITECTURE.md` 5.3 to 5.5 and 5.8, the Accomplice kit in `packages/content/data/roles.json` with `docs/GDD.md` 3.2 |
| **G. M2 movement + one house** | Sonnet 5.5 | Code | `claude/m2-movement` | `apps/server/src/sim/**`, `apps/server/src/rooms/handlers/movement.ts` (new), `apps/server/test/sim*.test.ts`, `packages/shared/src/{collision,nav}/**` (new), `apps/client/src/scenes/{Preload,World}.ts` (new), `apps/client/src/view/**`, `apps/client/src/input/**` (new), `apps/client/src/net/mock/**` (extend the `?mock=1` fixture only), `tools/grid/**`, `packages/content/src/nav*` (new), `docs/ARCHITECTURE.md` 5.6 to 5.7. Scene, portal and spawn ids in `packages/content/data/scenes/*.json` stay frozen; G may add a `nav` export contract beside them. |
| **H. Character art** | Opus 5.5 | Art | `claude/art-villager` | `assets/source/**`, `apps/client/public/assets/**` except `ui/` and `calibration/`, `tools/blender/**` (render and pipeline scripts; rig constants only with a `docs/DECISIONS.md` row), `tools/sprites/**`, `CREDITS.md`, `assets/source/MANIFEST.md`, `docs/ASSETS.md` 6.3, 6.4, 6.7 |
| **I. UI design system** | Fable 5.1 | Design | `claude/ui-design-system` | `docs/UI.md` (new), `apps/client/public/assets/ui/**`, `apps/client/src/ui/theme/**` (new: tokens and component CSS, a README), `packages/content/data/style.json` and its schema, the UI paragraph of `docs/ASSETS.md` 6.1 |
| **J. ROSW studio project** | Sonnet 5.5 | Process | `claude/rosw-studio` here; a branch in `groot99-droid/Pipelines-Plugin` | In this repo only `docs/ASSETS.md` 6.10 (status) and `assets/source/MANIFEST.md`; everything else lives in the ROSW repo and needs push access there (`add_repo` with push; stop and report if refused) |

### Seams in round 2

| From | To | Contract |
|---|---|---|
| F | G | When every player is Ready on the role card (or its 12 s elapse), F sets `phase = PLAY` and sends each client `sceneEnter {sceneId: "overworld", spawn, facing}` (ARCHITECTURE 5.5). G's `World` scene starts on `sceneEnter`; until F merges, G drives `World` from the `?mock=1` fixture, which G extends with `sceneEnter` and presence updates. |
| G | F | `PartyRoom` already queues every C->S message into `CommandQueue`; G consumes `input.move` and `act.enterPortal` inside `sim/Step.ts` and never adds message handlers to `PartyRoom`. If G needs one line in `PartyRoom` (an import and a `registerMovement(this)` call), it is the only line G touches there. |
| I | F | `apps/client/src/ui/theme/tokens.css` (palette, type scale, spacing, the Art-Deco card frame classes) is importable by F's DOM screens. F does not wait for it; I's README says how to swap it in. |
| H | G | `docs/SPRITES.md` keys stay. H replaces the content behind `char_villager` (and overlays) with real renders under the same keys and `manifest.json` layout; G loads by key and never by path. |
| H | tools | H fixes the `tools/sprites` engines field (`>= 22.12`, no unflagged type stripping at runtime) and makes `batch_render.py` write `Feet` pivots on every pass, not only `body`. |
| J | H | J's studio notes and `higgsfield-library-sync` catalog ids are what H cites in `CREDITS.md` rows once J exists; until then H cites generation ids as D did. |

Suggested merge order: F, G, I, H, J.

### Round 2 log: F (M1 finish)

Done on `claude/m1-finish`: follow-ups 1 to 3 and the 5.4 excerpt of item 4 above. For G: lobby and role-card messages (`lobby.start`, `lobby.ready`, `role.ready`) go to `PartyRoom.lobbyCommands`, not `commands`, so `sim/Commands.ts` never sees them and its `lobby.ready` case is dead code you can delete. `PartyRoom` calls `runLobbyCommands` and `runLobbyPhase` after `step()`. `net.roleCard` keeps the player's own card for Tab in any scene; `RoleReveal` starts a `World` scene (if registered) on `sceneEnter`. The server runs from source with `pnpm --filter @wdi/server serve` (tsx needs `--conditions=development` to read `@wdi/content` source).

## Integration log, round 2 (2026-10-15)

All five sessions finished their briefs; H and I were cut off by the org usage limit after their PRs
were up and resumed on 2026-10-15. The orchestrator merged F, G, I, H, J in that order (conflicts: the
F/G union in `apps/client/package.json`, `PartyRoom.ts` imports, `tsup.config.ts`, root scripts and
`tools/bots/package.json`; the H/J union in `CREDITS.md` and `MANIFEST.md`; the lockfile), ran the
unit suites, the Playwright suites against the real server, and a review pass, then fixed the seams in
one commit (DECISIONS A29):

- One first `sceneEnter` per player (the sim places; the lobby handler only switches the phase).
- One starter of the World scene (the router); the role card sleeps so Tab still reopens it in play;
  the mock world triggers on the card's `lobby.ready`; its loop keeps wall-clock time under load.
- A seat that completes its join after Start is refused (test added).
- Door reach and the collision box moved from code into `balance.json` and `metrics.json` (GDD 3.7,
  WORLD 4.2); the dead `lobby.ready` branch left `sim/Commands.ts`; placement marks views dirty.
- The default asset manifest's stand-in paths no longer climb above `assets/`.
- The World HUD classes are namespaced `wdi-world-*` so the theme's opt-in cannot restyle them.
- Credits rows for the two self-hosted OFL fonts; `docs/UI.md` in the docs index; the 5.6 step
  excerpt and the tsup bundling note in ARCHITECTURE.

### Follow-ups for round 3

1. **Client room exposure**: `net/worldRouter.ts` still reads `NetworkService`'s private room through a
   cast and polls it every 250 ms, and `sceneEnter` is registered on the room twice; expose the room (a
   getter or event) and attach the world feed from there.
2. **HUD adopts the theme**: replace `view/hud.css` with the `wdi-hud-*` components of `docs/UI.md`
   (the `wdi-world-*` namespace then disappears), and wire the lobby, card and landing screens to
   `ui/theme/` per its README.
3. **M3 first playable**: kill -> body -> clues -> report -> meeting -> vote -> win, per ROADMAP M3; then
   M3b quick mode, M3c NPC fill.
4. **Art**: the owner's sign-off on the villager block-out contact sheet; the real buildings, tiles and
   clue sprites still point at placeholder stand-ins in the default manifest.
5. **Small**: `placeNewPlayers` scans every sim player each tick to see whether the profile is fixed
   (keep a flag); `assets/source/MANIFEST.md` is not prettier-formatted (ignored by lint).
6. **Owner**: GitHub Pages source and `VITE_SERVER_URL`; the Render service; a 2022 mid-range Android
   frame-rate check and the first 2-4 person playtest (M2 exit); run the studio pipeline from the ROSW
   checkout for the notes PR groot99-droid/Pipelines-Plugin#10 lists.

## Round 3 (started 2026-10-16, after round 2 landed at a98cc3f)

Seven sessions build **M3, the first playable** (ROADMAP: kill -> body -> clues -> report -> meeting ->
vote -> win) plus the round-3 follow-ups 1, 2 and 5 above, the art and audio M3 needs, and the
playtest kit for the M3 exit. M3b (quick mode) and M3c (NPC fill) are round 4; nothing in round 3 may
make them harder (the `loft` scene, `Settings.mode`, `Winner.debtor/nobody` and the NPC seats stay as
designed). Same rules as rounds 1 and 2: draft PRs against `claude/zen-turing-m1jnw0`, under 400 lines
where the work allows (split by step), `pnpm lint && pnpm typecheck && pnpm test` clean before every
push, pinned versions only, no model identifiers in committed files, `docs/GDD.md` changes in the same
PR as a behaviour change. Code and tooling run on Sonnet 5.5; art and design run on Opus 5.5.

**Pre-seeded on the base branch** (commit "Round 3 contract" and its follow-up, DECISIONS A30), so no
two sessions add the same thing: the schema fields `Body.of`, `Clue.value`, `Clue.dir`,
`GameState.startTick` and `NotebookEntry.status` 4 (`teaching`); the shared constants `ClueKind` and
`NotebookStatus` (`@wdi/shared/constants`); the protocol types `DeathCause`, `MeetingReason`,
`ChatChannel` and the `killed`, `meetingStart`, `chat.msg`, `voteResult` payloads
(`@wdi/shared/protocol`, `docs/PROTOCOL.md` regenerated); `StatusBit.bloody` = 2 in both mirrors
(`apps/server/src/sim/constants.ts`, L, and `apps/client/src/view/animIds.ts`, N); the `RoomSim` seam
fields (`PlayerSim.dead`, `sceneIdx`, `bloodyUntilTick`, `bandagedUntilTick`, `hold`,
`resetForLobby()`; `RoomSim.meetingRequests`, `deaths`, `profileFixed`, `clueSeq` per scene,
`resetForLobby()`); `enterScene(..., transit, announce = true)` in `Portals.ts`, which mirrors
`PlayerSim.sceneIdx` and writes the public `Player.sceneId` only while the player is alive or their
death is public; `Visibility.ts` keyed on `sceneIdx`; the stage stubs `sim/Clues.ts` (`runDecay`, L)
and `sim/Phases.ts` (`runPhases`, K) already called by `sim/Step.ts`; `meeting.vote` and `chat.say`
routed to `PartyRoom.lobbyCommands` (the flow queue K drains); the four empty rules modules
`packages/shared/src/rules/{votes,win,kill,clues}.ts` already exported by `rules/index.ts`;
`apps/server/test/simHelpers.ts` recording every server message and taking white-box roles by bot
name; the `meetingRequest` event and optional `resume()` on the client `WorldFeed`; the
`data-testid="hud-clock"` hook the three e2e suites locate the HUD by; the two numbers
`phases.gameOverS` and `chat.maxChars` in `balance.json` with their GDD 3.3 and 3.5 lines. **Nobody
edits** `packages/shared/src/{schema,protocol,rules}/index.ts`, `packages/shared/src/index.ts`,
`apps/server/src/sim/Step.ts`, `apps/server/test/simHelpers.ts`, `balance.json` or its schema: a
session that needs another contract writes it in its PR description and carries on with a local
stand-in; the orchestrator adds it to the base branch. Every `*Tick` field is in ticks: a seconds value
from content is multiplied by `TICK_RATE` at the write, as `secondsToTicks` in `handlers/lobby.ts`
does. Content paths are the whole file: `clues.clues.blood.decay.seconds`,
`clues.clues.footprints.decay.seconds`, `clues.clues.blood.params.visibleTiles`,
`abilities.abilities.kill.rangeTiles`, `roles.roles[id].bellPulls`.

| Session | Model | Track | Branch | Owns |
|---|---|---|---|---|
| **K. Match flow** | Sonnet 5.5 | Code | `claude/m3-flow` | `apps/server/src/rooms/**` (PartyRoom, `handlers/{lobby,debug,movement}.ts`), `apps/server/src/sim/{Phases,Meeting,Chat,Win,Visibility}.ts`, `apps/server/src/services/MatchLog.ts` (new), `apps/server/test/flowHelpers.ts` (new) and `apps/server/test/{flow,meeting,chat,win,lobby,party,visibility}*.test.ts`, `packages/shared/src/rules/{votes,win}.ts` and their tests, `docs/GDD.md` 3.3, 3.5 (the chat lines), 3.7 (the ghost lines) and 3.8 (one sentence each, only where the PR changes behaviour, marked "(M3)"), `docs/ARCHITECTURE.md` 5.7 and 5.8 |
| **L. Kill, bodies, clues, Notebook** | Sonnet 5.5 | Code | `claude/m3-kill` | `apps/server/src/sim/{Commands,Movement,Portals,PortalQueue,RoomSim,World,constants,Clues}.ts`, new `apps/server/src/sim/{Actions,Kill,Death,Bodies,Hold,Noise}.ts`, `apps/server/test/killHelpers.ts` (new) and `apps/server/test/{sim,kill,clue,hold,report,ghost}*.test.ts`, `packages/shared/src/rules/{kill,clues}.ts` and their tests, `docs/GDD.md` 3.2 (the Kill and Bandage rows) and 3.4 (one sentence each, marked "(M3)"), `docs/ARCHITECTURE.md` 5.6 |
| **M. Screens: meeting, game over, chat, theme** | Sonnet 5.5 | Code | `claude/m3-meeting` | `apps/client/src/ui/**` (the theme's `tokens.css` and `components.css` only for fixes noted in the PR, never the `.wdi-hud*`, `.wdi-log*`, `.wdi-edge-cue*`, `.wdi-toast*`, `.wdi-stick*`, `.wdi-touch-*` or `.wdi-notebook*` rules), `apps/client/src/net/{NetworkService,mock,fixtures,protocol,worldRouter}.ts`, new `apps/client/src/net/{meeting,meetingColyseus}.ts` and `net/mock/meetingMock.ts`, `apps/client/src/scenes/{Boot,Preload,Landing,Lobby,RoleReveal,registry}.ts`, new `scenes/{Meeting,GameOver}.ts`, `apps/client/src/main.ts`, `apps/client/index.html`, `apps/client/e2e/{party,smoke}.spec.ts`, new `e2e/meeting.spec.ts`, `apps/client/public/mockups/**`, `docs/UI.md` 11 and 12, `docs/ARCHITECTURE.md` 5.9 |
| **N. World actions** | Sonnet 5.5 | Code | `claude/m3-world` | `apps/client/src/scenes/World.ts`, `apps/client/src/view/**` (Hud, hud.css, EntityView, PlayerView, animIds, assets, greybox; new `BodyView`, `ClueView`, `PropView`, `Lighting`, `NotebookPanel`, `AudioBus`), `apps/client/src/input/**`, `apps/client/src/net/{world,worldColyseus}.ts`, `apps/client/src/net/mock/worldMock.ts`, `apps/client/e2e/world.spec.ts`, `docs/SPRITES.md` 5 (loading notes only) |
| **O. Bots, match e2e, soak** | Sonnet 5.5 | Code | `claude/m3-bots` | `tools/bots/**`, `tools/grid/test/**`, new `apps/client/e2e/match.spec.ts`, `apps/client/e2e/env.ts`, `apps/client/playwright.config.ts`, root `package.json` scripts, `docs/ARCHITECTURE.md` 5.12, `docs/ROADMAP.md` 7.5 (the Bot-only row only) |
| **P. Art: props, clues, VFX, body** | Opus 5.5 | Art | `claude/m3-art` | `assets/**`, `apps/client/public/assets/**` except `ui/`, `audio/` and `calibration/` (so `manifest.json`, `chars/`, `clues/`, new `props/`, `vfx/`), `tools/blender/**`, `tools/sprites/**`, `CREDITS.md` (rows appended at the end of the "Generated assets" and "Hand-made original art" tables), `assets/source/MANIFEST.md`, the `assets/source` line of `.prettierignore` (the one root file P edits), `docs/ASSETS.md` 6.3 and 6.7, `docs/SPRITES.md` 8 |
| **Q. Playtest kit, audio, copy** | Opus 5.5 | Design | `claude/m3-playtest` | new `docs/PLAYTESTS/**`, new `apps/client/public/assets/audio/**` (files plus its own `audio/manifest.json`), `LICENSES/**` (new licence texts only), `CREDITS.md` (rows appended at the end of the "Third-party assets" table), `docs/UI.md` 14 (new: the M3 copy deck), `docs/ROADMAP.md` 7.5 (the feedback form, a new paragraph after the metrics paragraph), `docs/GDD.md` 2 (wording only, no rule or number) |

Suggested merge order: L, K, N, M, O, P, Q. Shared documents: edits stay inside the named section
with no renumbering or reflow, and the orchestrator keeps both sides of any conflict. Decisions a
session has to make go to `docs/DECISIONS.md` under its reserved number (K A31, L A32, M A33, N A34,
O A35, P A36, Q A37; a second row takes the number plus 10), never editing an older row. Nobody else
touches GDD 3.x. Owner, before the first M3 playtest: the Railway Hobby service and `VITE_SERVER_URL`
(ROADMAP M3, A6) and the Pages source; Q's `docs/PLAYTESTS/README.md` lists them as prerequisites.

### Briefs

**K. Match flow (server).** Build the loop around the kill: phases, meetings, votes, chat, win, game
over, ghosts' views, lobby reconnection, the debug helpers tests need, and the match log. Everything
runs inside the fixed step: `runPhases(room)` in `sim/Phases.ts` is called by `step()` last; the flow
commands (`lobby.*`, `meeting.vote`, `chat.say`) arrive in `PartyRoom.lobbyCommands` and are drained
by `runLobbyCommands`. Phases (GDD 3.3, A30): `beginPlay` and `runDebugStart` both set
`GameState.startTick`; grace -> day -> dusk -> night -> day... with `round` + 1 on every entry into
day; every length from `balance.phases`. On the grace -> day transition `runPhases` sets
`priv.cooldownEndTick.set("kill", tick + byCount[n].killCooldownS * TICK_RATE)` for every seat whose
role lists `kill` (the Knife's first cooldown; L's `validateKill` reads only `cooldownEndTick`).
Meetings: drain `simOf(room).meetingRequests` (pushed by L's report and bell); on the first request
move every player, living or dead, with `enterScene(room, player, p, 'overworld', 'square_<ordinal %
10>', false, false)` (the seventh argument suppresses the `sceneEnter`; L keeps the default), set
`sim.viewsDirty = true`, flip `alive = false` for every `PlayerSim.dead`, reset `hasVoted = false` and
`priv.myVote = ""` on every seat, fill `MeetingState` (`phase`, `reason`, `callerId`, `bodyOf`,
`endsTick`; `missing` and `board` stay empty until M4), then broadcast `meetingStart` and set
`meetingDiscussion` with `byCount[n].discussionS` (n = max(4, seats)), in that order. `MeetingState.phase`
holds the same `Phase` id as `GameState.phase` (0 outside a meeting) and `MeetingState.endsTick`
mirrors `phaseEndsTick`, which every meeting `setPhase` sets and broadcasts as `phaseChange`. Votes
(`sim/Meeting.ts`): from living players in `meetingDiscussion` and `meetingVote`, `targetId` a living
player's id or `"skip"`; a repeated vote replaces `priv.myVote` without any reply and `hasVoted` stays
true (no retraction); a vote in `reveal` or outside a meeting is refused 425, from a dead player 422,
with an unknown or dead target 422; when every living player has voted go to `reveal` at once (in
`meetingDiscussion` too), else after `voteS`. `resolveVotes(votes, living)` in
`packages/shared/src/rules/votes.ts` is pure: plurality, a tie or a Skip plurality ejects nobody; the
anti-stall rules of GDD 3.8 stay off (their arguments exist, default off). `reveal` lasts `revealS`:
broadcast `voteResult {tally, ejectedId?, role?}` (counts per target and `skip`; voters never
revealed); an ejected player gets `dead = true`, `alive = false`, private `killed {sceneId, cause:
"ejected", roles}`. `checkWin` (`rules/win.ts`, pure, GDD 3.8: Village when no Cabal lives; Cabal at
`byCount[n].cabalWin`, `parity` at 6+, `villageAtMostOne` at 4-5; neutral roles count for nobody;
tasks and Final Night are M4) runs on the tick a `DeathEvent` is drained from `sim.deaths` and, for an
ejection, when the reveal phase ends, so the stamp and the role line show for the whole reveal; never
on a bare tick. No winner: on entering `immunity` (`immunityS`, a world phase in which L refuses
kills) call `enterScene(room, player, p, 'overworld', 'square_<ordinal % 10>', false)` again for every
player, living or dead, and set `sim.viewsDirty = true`: this announced `sceneEnter` is the client's
cue to leave the meeting; then `day`. Winner: phase `gameOver`, `winner`, broadcast `gameOver
{winner, roles, summary}` (no `sceneEnter`), one match-log line (`services/MatchLog.ts`: JSON to
stdout with players, duration, winner, kills, meetings, each ejection's correctness, vote accuracy per
meeting, clues collected per player; ROADMAP 7.5), and after `phases.gameOverS` `resetToLobby`:
phase `lobby`, `room.unlock()`, every seat kept with `alive`, `ready`, `hasVoted`, traits, `sceneId`,
`presence` and `priv` cleared, bodies and clues cleared, `simOf(room).resetForLobby()` (which resets
every `PlayerSim`). Chat (`sim/Chat.ts`): `chat.say` text trimmed to `balance.chat.maxChars`, empty
refused 422; from a living player only in `meetingDiscussion`, `meetingVote` and `reveal` (425
otherwise), sent to every client as channel `meeting`; from a dead player in any phase, sent to dead
players only as channel `ghost`; the Cabal channel and quick chat are M4. Visibility: a living viewer
receives the presence of living (`!dead`), placed players in its scene; a dead viewer receives
everyone in its scene; scene tests use `PlayerSim.sceneIdx`, never the public `sceneId`; in the
meeting, reveal and gameOver phases no presence is encoded (`isWorldPhase` is false). Blood is the one
presence field that correlates with a role in M3 (only the Killer gains it): it is encoded to every
client in the scene, so a modified client reads it beyond 3 tiles; V1 accepts this (A30, like
darkness). Disconnect: in phase `lobby`, `onLeave` keeps the seat with `connected = false` through
`this.allowReconnection(client, balance.disconnect.deathAfterS)` and frees it when the window lapses
or the player left consented (GDD 3.10 "reconnection in lobby"); during play `onLeave` only sets
`connected = false` and pushes `{playerId, cause: "vanished", tick}` to `sim.deaths`, and the next
`runPhases` sets `PlayerSim.dead` and runs `checkWin` from the drain (no body, no reconnection; both
M7); the leader passes as today. Debug (`WDI_DEBUG=1` only, flags consumed in the step; `debug.play`
stays exactly as today): `debug.deal {roles: {sessionId: roleId}}` (any client; a test maps names to
ids through the public roster) fixes the next deal: at Start the fixed seats take their roles, each
such role is removed once from the roster row, and `assignRoles` deals the remaining roles to the
remaining ids, so the roster counts hold; `debug.clock {phase?, clearCooldowns?}` with `phase` a name
among `grace`, `day`, `dusk`, `night`, `immunity` (else 422) jumps first (a fresh `phaseEndsTick`,
`round` unchanged), then `clearCooldowns: true` zeroes every `cooldownEndTick` entry and every
`bandagedUntilTick`. Tests with `@colyseus/testing` (helpers in `test/flowHelpers.ts`, importing
`simHelpers` unchanged): the phase loop and the Knife cooldown at day; a report moves everyone to
the square, sends `meetingStart` after the placements and no `sceneEnter`; after the reveal every
client receives a second `sceneEnter`; a vote from a dead player is refused; early end when all have
voted; a second meeting starts with `hasVoted` false; tie ejects nobody; the ejected role is revealed
and `gameOver` arrives only after `revealS`; Village and Cabal wins at 4, 5 and 6 seats; ghost chat
reaches only the dead; a living client never receives a dead player's presence and never sees a
ghost's `sceneId` change before the meeting; Blood state absent from the meeting roster (no public
`Player` field changes with the Blood timer); a dropped lobby bot that reconnects within the window
keeps its seat and name; the lobby reset keeps the seats and clears the private state; the match log
line. K calls only the existing `enterScene` (Portals.ts) and `isWorldPhase` / `sceneKey` (World.ts),
whose signatures L keeps. Do not touch `sim/Commands.ts`, `Portals.ts`, `Movement.ts`, `RoomSim.ts`
or the schema.

**L. Kill, bodies, clues, Notebook (server).** The verbs. `sim/Commands.ts` keeps its switch and
dispatches `act.ability`, `act.hold`, `act.reportBody` and `act.bell` to `sim/Actions.ts`; every
payload is untrusted. "Alive" below always means `!PlayerSim.dead`, never the public `alive`, which
stays true for a ghost until the meeting. Kill (`sim/Kill.ts`, GDD 3.2 and A30): `act.ability
{abilityId: "kill", targetId}` from a player whose `priv.role.roleId` lists `kill`; refused unless the
phase is day, dusk or night (425), the actor is alive, placed, not busy (426) and past
`priv.cooldownEndTick.get("kill")` (424, the entry K writes at day); the target is alive, in the same
scene (`sceneIdx`), not in transit, within `abilities.abilities.kill.rangeTiles` plus the distance the
target moved in the last 250 ms (`positionAt`, 427), with no solid tile on the straight line between
them; a Bandaged target (`bandagedUntilTick > tick`) refuses with 422 "nothing happens", spends the
bandage, and the attacker still gains Blood and restarts the cooldown. `validateKill` in
`packages/shared/src/rules/kill.ts` is pure over plain numbers and a `solidBetween` callback, with
property tests. On a kill: the victim's `PlayerSim.dead = true` (the public `alive` stays true until
the next meeting, A30), `sim.viewsDirty = true` so the living stop receiving the victim's presence on
that tick, push `{playerId, cause: "knife", killerId, tick}` to `sim.deaths`, send the victim private
`killed {sceneId, cause: "knife", roles}` (every seat's roleId; ghosts see all roles), spawn the `Body`
(`id: "body_<playerId>"`, `of`, `hidden: false`) in that scene's `bodies`, give the killer
`bloodyUntilTick = tick + clues.clues.blood.decay.seconds * TICK_RATE` (OR `StatusBit.bloody` into
`presence.statusBits` where `Movement.ts` writes them), reset `cooldownEndTick.kill` from
`byCount[n].killCooldownS * TICK_RATE`, and emit the scream (`sim/Noise.ts`, `emitNoise` moved out of
`Portals.ts`, radius `noise.killScream`). `Body.x/y` and `Clue.x/y` are pixel centres of their tile
(`tileCentre(tx, TILE_PX)`), the same units as `Presence.x/y`. Clues (`rules/clues.ts` pure,
`sim/Clues.ts`): every kill spawns Footprints (`ClueKind.footprints`, `value` = the killer's height
index) at the kill tile with `dir` toward the nearest portal of the scene, and a Thread
(`ClueKind.thread`, `value` = the killer's scarf index) on the walkable tile beside that portal; the
2-of-3 choice, felt and prints come with M4(a). Ids: the teaching clue is `clue_teaching`; every other
clue is `clue_<sceneId>_<n>` from `sim.clueSeq` (one counter per scene, so an id never counts kills
elsewhere); a `NotebookEntry.id` is `entry_<n>` counted per player and `clueFound.entryId` carries it.
Footprints decay after `clues.clues.footprints.decay.seconds` (`runDecay`, the stub in `sim/Clues.ts`),
Thread never; above `balance.clues.capPerScene` the oldest claimed clue goes first. At the first
placement spawn the teaching clue at the `ov.teaching_clue` prop (Footprints, value tall). Collect
(`sim/Hold.ts`): `act.hold {action: "collect", targetId, on}` starts a hold kept in `PlayerSim.hold`,
re-validated every tick (a world phase, alive, same scene, within `balance.doors.reachTiles` of the
clue, not busy; leaving a world phase cancels it); after `abilities.abilities.collect.castS` the clue is
`claimed`, a `NotebookEntry` is pushed to the collector's `priv.notebook` (`clueKind`, `value`,
`sceneId`, `tick`, `status`: `verified` for a role with `inspect`, `teaching` for `clue_teaching`,
else `claimed`) and private `clueFound {entryId}` is sent; several players may collect the same clue;
releasing or moving cancels. Report and bell push `{reason, callerId, bodyOf}` to
`sim.meetingRequests` (K drains): `act.reportBody {bodyId}` from a living player within
`abilities.abilities.report.rangeTiles` of a body in its scene during a world phase and not yet
reported (L keeps `RoomSim.reportedBodies` and refuses a second report with 422); `act.bell` from a
living player on the overworld within `abilities.abilities.bell.rangeTiles` of `ov.bell` during day,
dusk or night, at most `roles.roles[role].bellPulls` times per match (room memory). Bandage
(`act.ability {abilityId: "bandage", targetId}`): a role with `bandage`, target alive, not self, same
scene, within its `rangeTiles`, cooldown `cooldownS`, consumes one `bandage` from the inventory, sets
the target's `bandagedUntilTick` for `params.protectS`; knockback, blackout and witness entries are
M4(c). Ghosts (`dead`): move at walk speed, skip collision and the lock and busy checks of portals; a
ghost's crossing updates only `PlayerSim.sceneIdx` (the base `enterScene` already freezes the public
`sceneId` while the death is private), swings no door and emits no noise; every verb refuses a ghost
(422). Fill `PlayerSim.resetForLobby()` and `RoomSim.resetForLobby()` with every field you add
(`reportedBodies`, bell pulls, collectors per clue, the teaching flag). Death by ejection is K's.
Tests (helpers in `test/killHelpers.ts`, importing `simHelpers` unchanged, with its white-box roles):
kill range with and without the ring slack; grace, immunity and cooldown refusals; the bandaged
target; the body and both clues appear in the scene state and nowhere else; a client outside the
scene never receives the body or the clue; the ARCHITECTURE 5.4 fuzz test scoped to M3 (over a
scripted kill a non-Cabal client outside the kill scene receives no field change at all, and a client
inside the scene receives only the `bodies` and `clues` additions of that scene and `statusBits` bit 2
on the killer); collect timing, cancel on move and on phase change, Detective `verified`; report and
bell push a request, a second report of the same body is refused, the bell count; a ghost walks
through a locked door, leaves `Door.swingUntilTick` untouched and sends no `noise`. Do not touch
`rooms/**`, `sim/Visibility.ts`, `sim/Phases.ts`, `test/simHelpers.ts` or the schema.

**M. Screens: meeting, game over, chat, theme (client).** Follow-up 1 first: give `NetworkService` a
`room` getter (null until wired) and a `room` bus event; the router attaches both feeds from it with no
cast and no interval. The room's `sceneEnter` handler stays in N's `ColyseusWorldFeed`: remove
`sceneEnter` from `NetworkService.SERVER_MESSAGES` and let the router re-emit the feed's `sceneEnter`
on `net.bus` for `RoleReveal`, so it is registered once. Then the theme (follow-up 2, screens part):
import `ui/theme/tokens.css` and `components.css` once in `main.ts`, `class="wdi-root"` on `#overlay`,
and move Landing, Lobby and the role card to the theme classes per `docs/UI.md` 11, keeping every
`data-testid`. Meeting feed (`net/meeting.ts`, `meetingColyseus.ts`, `mock/meetingMock.ts`): the
public roster (`id`, `name`, `traits`, `alive`, `hasVoted`), `MeetingState`, the clock, own vote, chat
lines, events `meetingStart`, `voteResult`, `gameOver`, `chat.msg`, `phaseChange`; `vote(target)`
sends `meeting.vote {targetId}` (`"skip"` for Skip), `say(text)` sends `chat.say`. Router: a
`sceneEnter` that arrives while no `Meeting` is active is today's World restart; on `meetingStart`
sleep `World` and launch `Meeting`; only a `sceneEnter` received after `meetingStart` stops `Meeting`
and starts `World`; on `gameOver` stop both and start `GameOver`; when the phase returns to `lobby`
start `Lobby` (the roster still flows from `NetworkService`). In mock mode only, the router forwards
the world feed's `meetingRequest` event to `MockNetwork.openMeeting(req)`, which emits `meetingStart`,
runs discussion -> vote -> reveal (bots vote at random, the player's vote counts), emits `voteResult`
and then either `gameOver` or calls `resume()` on the published world feed, which re-emits
`sceneEnter`. `Meeting` (DOM, `docs/UI.md` 6 and the `mockups/meeting.html`): the reason line ("Hana
reported Gus's body", "Hana rang the bell"), the portrait grid (name, trait icons, `is-dead`,
`is-self`, the vote chip from `hasVoted`, `is-selected` for own vote; the picture is the villager
atlas drawn to a canvas from the public traits, an initial on slate when the atlas is absent), tap a
portrait or Skip to vote (living only; a ghost sees the grid and the chat but cannot vote), the
discussion and vote timers from `phaseEndsTick`, tabs Report and Chat (the Notebook tab is wired at
integration with `new NotebookPanel(tabElement, feed)` from N, `update()` and `destroy()`), the chat
log and form (a ghost's form posts to the ghost channel; `chat.msg` lines show their channel), and the
reveal: tally numbers on the portraits, the stamp on the ejected portrait, the role line. The scene
stays until the `sceneEnter` that follows the reveal. `GameOver` (DOM): winner banner, every seat's
role and faction, the summary, a countdown to the lobby. Frozen `data-testid`s for O: `meeting`,
`meeting-reason`, `portrait-<playerId>`, `vote-skip`, `vote-count-<playerId>`, `stamp`, `reveal-role`,
`chat-log`, `chat-input`, `gameover`, `gameover-winner`, `gameover-role-<playerId>`. Mock: `?mock=1`
must reach the meeting, the reveal, game over and back to the lobby without a server. e2e
(`meeting.spec.ts`, mock): vote, early end, stamp, game over, lobby. `party.spec.ts` keeps passing
against the real server (it locates the HUD by `hud-clock`). Do not touch `scenes/World.ts`,
`view/**`, `input/**`, `net/world*.ts` or `net/mock/worldMock.ts`.

**N. World actions (client).** Extend `net/world.ts` (and both feeds) with `bodies()`, `clues()`,
`notebook()` (own entries), `dead()`, `kill(targetId)`, `ability(id, targetId)`, `hold(action,
targetId, on)`, `reportBody(bodyId)`, `bell()`, and the events `killed`, `clueFound`, `phaseChange`.
`dead()` turns true on `killed` or when your own roster `alive` is false, is held in the feed (never in
the scene) so it survives World restarts, and resets when `clock().phase` returns to `lobby`. In
`World`: a prompt (`data-testid="prompt"`) and the E key act on the nearest target in reach (a body:
"Report", a clue: "Hold E to collect" with a 2 s ring, the bell on the overworld: "Ring the bell", a
door: "Enter"); the Q/R/F keys send `act.ability` for the card's ability rows (`ABILITY_KEYS`,
`getNet(this).roleCard.abilities`; `REG_ROLE_CHIP` stays `{team, goal}`) with the nearest living
player as target; a hold starts on keydown and ends on keyup, and on touch the Use disc sends `on:
true` on `pointerdown` and `on: false` on `pointerup` or `pointercancel`, Report, Enter and Ring the
bell fire on `pointerdown`, a release before `castS` is a cancelled hold. Draw bodies (`BodyView`: the
last `die` frame of `char_villager` with the dead player's overlays from the public traits), clues
(`ClueView`: `clue_footprint_<s|m|t>_mid` five times along `dir` from the tile,
`clue_thread_<red|green|blue>`; keys from `docs/SPRITES.md` 8), the overworld props of
`scenes/overworld.json` (`PropView`: `ov.bell`, `ov.pump`, `ov.board`, `ov.chest`, the lantern posts
by key `prop_<kind>` from the `props` atlas), the Blood overlay (`PlayerView` shows the `blood` pass
while `statusBits & StatusBit.bloody` and the player is within `clues.clues.blood.params.visibleTiles`
of you), the night mask (`Lighting`: a radius of `vision.dayTiles` by day and `vision.nightTiles` at
night around you, a "Night falls" toast at dusk), the phase on the HUD clock, and ghost mode after
`killed` (your sprite translucent, "You are a ghost", prompts hidden except doors, movement kept). A
greybox mark stands in for any key the manifest lacks (`textures.exists`). `Body.x/y` and `Clue.x/y`
are pixel centres, used unscaled. On `clueFound` the Notebook opens on the new entry (GDD 2 step 5);
during grace show the three toasts of GDD 2 step 5 (the bell one reads "E at the bell calls a
meeting"; ids from UI.md 14 once it exists, the GDD lines until then). The HUD adopts the theme
(follow-up 2, World part): `view/Hud.ts` and `hud.css` move to `.wdi-hud` with
`__tl/__tc/__tr/__bl/__br`, `.wdi-hud-chip`, `.wdi-hud-clock` (`--night`), `.wdi-log` lines,
`.wdi-toast` and `.wdi-edge-cue` for noise; import the theme CSS from the module (`hud.css` after it,
so N's overrides win; the global import lands with M) and put `wdi-root` on the HUD root element so
the fonts apply before M's `#overlay` change; the `wdi-world-*` namespace disappears; the touch
cluster uses `.wdi-stick`, `.wdi-touch-cluster` and `.wdi-touch-btn` with Use (E), Act (Q), Run and
Sneak; the Notebook opens from the N key and a button beside the chip. Frozen `data-testid`s:
`hud`, `hud-clock` (already on the clock), `hud-fps`, `prompt`, `notebook`, `notebook-entry`,
`touch-use`, `touch-act`. `World` hides the HUD, the prompt and the touch cluster on
`Phaser.Scenes.Events.SLEEP` and shows them on `WAKE`, so M's `Meeting` never touches `view/**`.
`NotebookPanel` (`new NotebookPanel(parent, feed)`, `update()`, `destroy()`, `.wdi-notebook`): one
row per entry with the clue icon, the trait value, the scene name and `m:ss` from `tick -
startTick`, and the status chip (claimed, verified, teaching). `AudioBus`: loads
`assets/audio/manifest.json` when it exists and plays `footstep`, `door_open`, `door_close`,
`door_locked` (error 423 or 428), `pickup`, `scream`, `bell` and `ambient` by key, silent otherwise (Q
supplies the files). Mock (`MockWorldFeed`): the player kills the nearest bot (body and both clues
appear), collects, opens the Notebook, sees the night mask; `reportBody` and `bell` emit the
`meetingRequest` event on the feed bus; `resume()` re-emits `sceneEnter` for the current scene; the
mock never emits `meetingStart`, `voteResult` or `gameOver`. e2e (`world.spec.ts`): the existing door
flow plus kill -> body -> collect -> one Notebook entry on the mock. Do not touch `ui/**` except
reading `ui/dom.ts` and the theme CSS, `net/{NetworkService,worldRouter,mock}.ts`,
`net/mock/meetingMock.ts`, `main.ts` or `manifest.json`.

**O. Bots, match e2e, soak (tooling).** `tools/bots`: `swarm.ts` gains `vote: "skip" | "leader" |
"random" | <player name>` (cast as soon as a meeting starts), `report: boolean` (report a body in
reach), `walk: boolean` (default true for walkers, false keeps a bot on its spawn), and keeps
`SwarmOptions` `code`, `count`, `url` and `ready` with today's defaults so `party.spec.ts` runs
unchanged; `walk.ts` walkers step toward a body they see and report it, vote per option, and, when
their own card holds `kill` and `--killer` is set, strike the nearest player in reach once the
cooldown allows; `soak.ts` reaches play through `debug.deal` from the leader bot and `lobby.start`
(every bot sends `lobby.ready {ready: true}` on `roleReveal` as `swarm.ts` does; `debug.play` stays
for L's tests) and runs 6 walkers with one killer and reporters so bodies, clues and meetings exist
during the 30 minutes, still failing on a presence leak, a dropped bot, a protocol error beyond
refusals or p95 tick above 15 ms. `apps/client/e2e/match.spec.ts` against the real server (the
Playwright `webServer` runs the server with `WDI_DEBUG=1` on port 2570; `e2e/env.ts` keeps exporting
`E2E_SERVER_PORT` and `E2E_SERVER_URL`): host and guest in two browsers plus three bots, `debug.deal`
makes the host the Killer, `debug.clock {phase: "day", clearCooldowns: true}`, the host walks to the
guest and presses Q, reports the body with E, everyone votes the host, the stamp lands, Village wins,
the game-over screen shows every role, and the lobby comes back with the same code; a second test at 4
seats (host, guest, two bots with `walk: false` standing on `square_2` and `square_3`): the host is the
Killer, kills the first bot, reports it, the host and the guest vote the second bot while the bots
vote skip, and the Cabal game-over screen shows. The spec locates screens by the frozen ids in M's and
N's briefs and the lobby ids that exist today. `tools/grid/test/reach.test.ts` adds the widow cottage
(both rooms), the forest and the cave entry. `docs/ARCHITECTURE.md` 5.12 and ROADMAP 7.5's bot row
describe the new bots. Write the spec against the contracts in this file and A30; run it once K, L, M
and N have merged (the orchestrator re-runs it at integration).

**P. Art: props, clues, VFX, body (Opus).** Rebuild the villager masters from
`tools/blender/build_villager.py` (they existed only in Session H's container), record their hashes in
`assets/source/MANIFEST.md`, run `prettier --write` on it and remove the `assets/source` line from
`.prettierignore` (follow-up 5). Through the rig: the real clue sprites under the existing `clues`
atlas keys (SPRITES 8: footprints x3 heights x3 mud, thread x3, felt x3, smear, print, wet bucket,
fur, claw, drag) replacing the placeholder entry in the real manifest; the square props as a `props`
atlas (`prop_bell`, `prop_pump`, `prop_noticeBoard`, `prop_kitChest`, `prop_lanternPost` with `_lit`
and `_unlit`, keyed by the `kind` of `scenes/overworld.json`, origin at the base); a `vfx` atlas
(`vfx_blood_pool` 8 f, `vfx_blood_splat` 12 f, `vfx_vote_stamp` 10 f, `vfx_dust_step` 6 f); and a
contact sheet of the `die` clip's last frame in all 8 directions with the hat and scarf overlays, since
it is the body sprite. New keys go to `docs/SPRITES.md` 8 and `manifest.json`; CC0 rows in
`CREDITS.md` with catalog ids where Higgsfield is used (ASSETS 6.5, A17). Nothing here touches client
code: N draws a greybox mark for any key the manifest lacks.

**Q. Playtest kit, audio, copy (Opus).** `docs/PLAYTESTS/`: `README.md` (how a session runs: the Pages
link, the server, Discord, the host's script for a 5-player M3 session, three matches, timing, and the
owner prerequisites above), `FORM.md` (the ROADMAP 7.5 feedback form, ready to paste into a Google
Form), `SCORECARD.md` (the fun-or-stop sheet for the M3 exit: three 5-player matches end in a Village
or Cabal win in 10-18 min, vote accuracy from the match log, "would play again" 1-10, the decision
line), `TEMPLATE.md` for one session's notes, and `2026-xx-xx-m2.md` as the M2 playtest entry stub.
Audio: eight CC0 SFX and one ambient loop from Kenney or Freesound CC0, OGG q5 under
`apps/client/public/assets/audio/` with `audio/manifest.json` entries `{key, url, gain}` (`url`
relative to `assets/audio/`, keys exactly `footstep`, `door_open`, `door_close`, `door_locked`,
`pickup`, `scream`, `bell`, `stamp`, `ambient`), their `CREDITS.md` rows, and any licence text under
`LICENSES/`; N plays them by key and M plays `stamp` at the reveal. Copy: `docs/UI.md` 14, the M3 copy
deck: every toast, prompt, meeting line, ghost line, reveal and game-over line with an id, consistent
with GDD 2 (the bell toast reads "E at the bell calls a meeting", since the bell is the E prompt); M and
N paste from it, and GDD 2 is touched only for wording.

### Seams in round 3

| From | To | Contract |
|---|---|---|
| L | K | L pushes `{reason: "body" \| "bell", callerId, bodyOf?}` to `simOf(room).meetingRequests` and `{playerId, cause, killerId?, tick}` to `simOf(room).deaths`; K drains both in `runPhases`. L sets `PlayerSim.dead` and keeps `sceneIdx` through `enterScene`; K flips the public `alive` at meeting start and on ejection and keys `Visibility.ts` on `dead` and `sceneIdx`. Neither imports a function the other adds in round 3; the exports that exist at the base (`enterScene`, `placeNewPlayers`, `reconcileViews`, `isWorldPhase`, `sceneKey`, `simOf`) keep their signatures. |
| K | L | K keeps `isWorldPhase` as the gate for movement and portals and writes the Knife's first `cooldownEndTick` at day; L refuses kills outside day, dusk and night and every verb in `immunity`. `debug.clock` clears cooldowns and bandages through the seam fields. |
| K, L | M, N | The wire: the pre-seeded schema fields and payloads (A30). `killed {sceneId, cause, roles}` is the ghost switch on the client; `clueFound {entryId}` points at a `priv.notebook` entry; at meeting start the placements send no `sceneEnter` and `meetingStart` follows them; at the start of `immunity` K re-places everyone with an announced `enterScene`, and that `sceneEnter` is the router's cue to stop `Meeting`; on a winner `gameOver` comes with no `sceneEnter`. |
| M | N | The router (M) constructs N's `ColyseusWorldFeed(room)` and `MockWorldFeed` unchanged, publishes them under `REG_WORLD`, and starts, sleeps and stops `World`; N never starts a scene; `World` hides its DOM on SLEEP. Mock handoff: N's mock emits `meetingRequest` and exposes `resume()`; M's `MockNetwork.openMeeting` runs the meeting and calls `resume()`; `meetingMock.ts` never edits `worldMock.ts` and vice versa. M mounts N's `NotebookPanel(parent, feed)` on the meeting's Notebook tab at integration. The HUD (N) and the screens (M) adopt the theme separately: M's theme fixes never touch the HUD, log, edge-cue, toast, stick, touch or notebook rules; N overrides those only in `view/hud.css`. N reads the card from `getNet(this).roleCard`; `REG_ROLE_CHIP` stays `{team, goal}`. The e2e suites locate the HUD by `hud-clock`, never by class. |
| N | P | Keys only, never paths: `clues`, `props`, `vfx` atlas keys from `docs/SPRITES.md` 8; N draws a greybox mark when `textures.exists(key)` is false. |
| N, M | Q | `assets/audio/manifest.json` entries `{key, url, gain}` with the nine keys above; a missing key is silent. M and N paste copy from `docs/UI.md` 14 once it exists; until then the GDD 2 lines. |
| O | K | `debug.deal`, `debug.clock` and the unchanged `debug.play` (K) are what the bots and `match.spec.ts` drive; the soak and the spec start play through `debug.deal` then `lobby.start`; `runDebugStart` sets `startTick` like `beginPlay`. O writes against the A30 contract and the frozen ids and runs after the merges. |

### Clarifications recorded before the round (DECISIONS A30)

See the A30 row; in short: death is private until the next meeting (`alive` flips there, the victim
gets `killed`, a ghost's public `sceneId` is frozen); ghosts walk, see everyone in their scene, are
seen only by other ghosts, and chat on their own channel; M3 spawns Footprints toward the nearest
portal and a Thread beside it, both readable in the world and logged on collect; Blood is a presence
bit with a client-side 3-tile mask and is the one role-correlated field V1 accepts; kills only in day,
dusk and night, with the ring slack and a straight-line check; a meeting moves everyone to the square
silently, votes are secret counts, plain plurality with Skip, the reveal lasts its full time before a
win; the win check runs after deaths and ejections only; after game over the room returns to the lobby
with the same code; a disconnected player is a ghost at once (M7 adds reconnection and the body) and a
lobby seat survives a dropped connection for the disconnect window; `WDI_DEBUG=1` adds `debug.deal`
and `debug.clock` beside `debug.play`.

### Round 3 log: L

**Landed** (`claude/m3-kill`): `validateKill`, `segmentBlocked`, `trailDir`, `besideTile`, `evictOverCap` in `packages/shared/src/rules/{kill,clues}.ts` (pure, randomized property tests in `packages/shared/test/kill.test.ts`); on the server `sim/{Actions,Kill,Death,Bodies,Hold,Noise}.ts`, the filled `Clues.ts` (`spawnClue`, `spawnKillClues`, `spawnTeachingClue`, `runDecay`), ghosts in `Movement.ts` and `Portals.ts`, the new fields in `RoomSim.ts` (all reset in both `resetForLobby()`), and `reject`, `isKillPhase`, `isVerbPhase` in `World.ts`. Tests: `test/killHelpers.ts` and `test/{kill,clue,hold,report,ghost}.test.ts`, including the ARCHITECTURE 5.4 diff test scoped to M3. GDD 3.2 and 3.4 got their "(M3)" sentences, ARCHITECTURE 5.6 a note, DECISIONS A32 the small calls.

**For K and the orchestrator.**

- The tests set `room.state.phase` white-box through `setPhase`, which also pushes `phaseEndsTick` out an hour. If K's `runPhases` derives a phase from `startTick`, `debug.play` and the cooldown rather than from `phaseEndsTick`, those tests need `debug.clock` instead.
- `record()` in `killHelpers.ts` wraps `sim.meetingRequests` and `sim.deaths` so the report and bell tests still see requests once K drains them. The kill test reads `sim.deaths` through it too.
- The fuzz test tolerates the victim's presence disappearing from a witness view (K's `Visibility.ts` change); it does not require it. After the merge, add an assertion that the living stop receiving the victim.
- The kill cooldown is read from `priv.cooldownEndTick.kill` only; with no entry (a `debug.play` match before K's day transition) the Knife is ready but the grace phase still refuses (425).
- Death by ejection, flipping the public `alive`, and clearing `scenes.*.bodies/clues` at the lobby reset are K's; `RoomSim.resetForLobby()` clears `clueMeta`, `reportedBodies` and the teaching flag, so K only has to delete the schema entries.
- The Killer's scream is not sent to the Killer; every other placed player in the scene within `noise.killScream` hears it, ghosts included.

**Not done.** Kill does not require the Knife item in the inventory (the Knife is bound; the role list decides). No ack message exists for Bandage; the Doctor sees the stock and cooldown change in the private state. Felt, prints, the 2-of-3 choice, knockback, blackout and witness entries are M4.
### Round 3 log: K (match flow, server)

**Landed** (`claude/m3-flow`): `resolveVotes` and `checkWin` in `@wdi/shared` rules with tests (property loop over seeded votes); `sim/{Flow,Phases,Meeting,Chat,Win}.ts` and `services/MatchLog.ts`: the phase loop (grace -> day -> dusk -> night -> day, `round` + 1 on every day, Knife first cooldown at day), meetings (square placement without `sceneEnter`, `meetingStart`, discussion, vote, early end, reveal, announced `sceneEnter` at immunity), secret plurality votes, the win check on a drained death and at the end of an ejection's reveal, `gameOver` with one match-log JSON line, the reset to the lobby, chat by channel, ghost-aware reconcile, lobby reconnection (`onDrop`, `onReconnect`, `onLeave`), the vanished death during play, and `debug.deal` / `debug.clock`. Tests: `flow`, `meeting`, `win`, `chat`, `visibility` and the new reconnection block of `lobby`, with helpers in `flowHelpers.ts`. Choices are in DECISIONS A31.

**For the orchestrator and the next sessions.** L's `report` and `bell` only need to push to `sim.meetingRequests` and the kill to `sim.deaths`; my tests stand in for both white-box (`request`, `murder` in `flowHelpers.ts`), so run K's and L's suites together after the merge. `debug.play` now broadcasts `phaseChange` and stamps the grace clock, so a debug match leaves grace after `graceS` seconds like a real one: tests that need a day call `debug.clock {phase: "day"}`. Ghost presence is hidden by `PlayerSim.dead`, which L sets on a kill; nothing else changes the view code. A bot or e2e that leaves during play ends the match for the Cabal when the Village falls to its limit, because a leaver is a ghost at once. **Not done:** the missing-person roll-call, the suspect set and `meeting.board` (M4), the anti-stall rules and the wrong-ejection bonus (off in M3), reconnection and the body for a player who drops during play (M7).
### Round 3 log: N (World actions, client)

**Landed** on `claude/m3-world` (one draft PR; it is over 400 lines because the HUD move, the feeds and
the views only make sense together): `net/world.ts` and both feeds with `bodies()`, `clues()`,
`notebook()`, `dead()`, `kill`, `ability`, `hold`, `reportBody`, `bell` and the `killed`, `clueFound`,
`phaseChange` events (`clock()` also returns `startTick`; `PlayerSnap` gains the roster `alive`);
`World` with the one prompt (`data-testid="prompt"`), E, Q/R/F, N and the touch Use and Act discs, the
2 s collect ring, `BodyView`, `ClueView`, `PropView`, the Blood pass, `Lighting`, ghost mode, the grace
toasts and the Night falls toast, `NotebookPanel` (+ the `NotebookSheet` that opens it over the world),
`AudioBus`, and the HUD on the theme (`.wdi-hud`, `.wdi-log`, `.wdi-toast`, `.wdi-edge-cue`,
`.wdi-stick`, `.wdi-touch-*`; the `wdi-world-*` namespace is gone). `InputController` gained `bind`,
`unbindAll` and `setSink`. Unit tests for the mock verbs and the pure view helpers; `world.spec.ts`
keeps the door flow (now polling the prompt instead of fixed sleeps, and asserting no page errors) and
adds kill -> body -> collect -> one Notebook entry, the night mask and the ghost. DECISIONS A34.

**For L (server).** The client breaks a tie between a body and a clue in reach in favour of the body
("Report"), so Footprints must not sit on the victim's own tile or the clue cannot be collected; the
mock puts them one tile along the trail. `NotebookEntry.sceneId` is read as an index into `SCENE_IDS`.
A hold ends client-side without a message when the player moves or leaves reach, and `on: false` is sent
only for a release. `noise` kinds are matched loosely: anything containing "scream" is the scream
(magenta ring, log line, edge cue, sound), `doorMuffled` is the muffled door, the rest a creaking door.

**For M and the orchestrator.** `World` hides its HUD, the prompt, the night mask and the touch cluster on
`SLEEP`, closes the Notebook sheet and releases its keys, and restores them on `WAKE`; it never starts a
scene. The mock's `resume()` re-emits `sceneEnter` for the current scene; it emits `meetingRequest` for
the report and the bell and nothing from the meeting. The mock reads `?phase=day|dusk|night`,
`?bots=still` and `?ghost=1` (documented in A34); the `?fps=1` readout now also prints `at x,y`,
`bodies n` and `clues n`, which the e2e and the bots can read. Importing the theme CSS from `Hud.ts` is
enough for the fonts; the theme's `.wdi-hud__*` groups anchor with `inherit`, which ignores the
safe-area padding, so `view/hud.css` sets the offsets itself (M may fix the theme and drop that block).
`NotebookPanel` (`new NotebookPanel(parent, feed)`, `update()`, `destroy()`) takes the same `WorldFeed`
the Meeting gets from the router.

**Not done.** Toast and prompt ids from `docs/UI.md` 14 (it did not exist; the GDD 2 lines are used,
with the bell hint reading "E at the bell" as briefed, while GDD 2 step 5 still says "B", which is Q's
wording to fix). The real `props`, `vfx` and audio files are P's and Q's: until then props draw as
labelled greybox blocks and the game is silent. Hold abilities (`inspect`, `dragBody`, `autopsy`) and
the passive rows are M4. The night mask is a DOM vignette with one soft edge; line-of-sight shadows are
not attempted. Not run: a real-server kill (L's server was not on the base), so the real feed's
`bodies()`/`clues()`/`notebook()` reads are covered by types and review only.
### Round 3 log: M

**Landed** (`claude/m3-meeting`): `NetworkService.room` (getter and `room` bus event) with `sceneEnter` removed
from its message list; the router attaches `ColyseusWorldFeed` and the new `ColyseusMeetingFeed` from the
room with no cast and no interval, re-emits the feed's `sceneEnter` on `net.bus`, and owns every start of
`World`, `Meeting`, `GameOver` and the return to `Lobby` (ARCHITECTURE 5.9); the theme on Landing, Lobby and
the role card with every `data-testid` kept (`ui/styles.css` is page chrome plus five layout classes); the
`Meeting` and `GameOver` scenes and screens with the frozen test ids (`meeting`, `meeting-reason`,
`portrait-<id>`, `vote-skip`, `vote-count-<id>`, `stamp`, `reveal-role`, `chat-log`, `chat-input`,
`gameover`, `gameover-winner`, `gameover-role-<id>`; extras `voted-<id>`, `meeting-clock`,
`gameover-summary`, `gameover-countdown`); the mock meeting (`net/mock/meetingMock.ts`,
`MockNetwork.openMeeting`) and `e2e/meeting.spec.ts` (body: vote, early end, stamp, game over, lobby; bell:
nobody ejected, back to the village). DECISIONS A33.

**For the integration**
- `World` must hide its DOM on SLEEP (N's side of the seam): until it does, the HUD chip and clock sit on
  top of the meeting.
- Notebook tab: `meetingScene.tabs?.addTab('notebook', 'Notebook', (panel) => new NotebookPanel(panel, worldFeed))`
  (`Meeting.tabs` is the screen; the panel needs `update()` and `destroy()`).
- The mock world should emit `meetingRequest` itself and implement `resume()`; until it does, `MockNetwork`
  re-emits the same `sceneEnter` as the stand-in, and the e2e uses the mock-only hook
  `window.__wdiMock.requestMeeting('body' | 'bell')`, which sends the same event.
- N's `InputController` is kept in the registry for the whole page and a second mock match (after the mock
  game over) would reuse it with the old feed; real rooms keep one feed, so only `?mock=1` is affected.
  Chat keystrokes also reach it while `World` sleeps: it should ignore typing (`isTyping` in `ui/dom.ts`).
- `phaseChange` and `gameOver` are registered on the room by both `NetworkService` and the meeting feed
  (the SDK allows several handlers); only `sceneEnter` had to be single.

**Not done**: the `stamp` sound (no `AudioBus` or audio manifest at the base); a real-server meeting e2e
(O's `match.spec.ts` covers it after the merges); the ghost channel form is exercised by unit-level reading
only, since the mock has no ghost; the Report tab is a short facts list until the copy deck (UI.md 14)
lands, and all meeting copy lives in `ui/meetingText.ts` so the deck replaces it in one file.
### Round 3 log: O (Bots, match e2e, soak)

- **Landed.** `tools/bots/walk.ts` is now the one bot brain: `walk`, `vote` (`skip`, `leader`, `random` or a player name, cast as soon as a meeting opens and repeated until the server records it), `report` (steps toward a body it sees, reports once per body, a Killer never reports) and `killer` (hunts the nearest player and strikes in reach past the cooldown when its own card holds `kill`). `swarm.ts` keeps `code`, `count`, `url`, `ready` and today's behaviour (stands still, votes Skip) so `party.spec.ts` is unchanged. `soak.ts` plays matches back to back through `debug.deal` (rotating Killer) and `lobby.start` from the leader bot, and additionally fails on a protocol error beyond refusals, or on a 5-minute-plus run with no kill or no meeting. `tools/grid/test/reach.test.ts` covers the widow cottage, the forest and the cave entry (they pass). ARCHITECTURE 5.12, ROADMAP 7.5 and DECISIONS A35 updated. `playwright.config.ts` starts the server with `WDI_DEBUG=1`.
- **`match.spec.ts` is written against the contracts but skipped.** It runs only with `WDI_E2E_MATCH=1` (5-seat Village win with a lobby return, and 4-seat Cabal win). It could not be run here: `debug.deal`, `debug.clock`, the kill, report, meeting and game-over screens do not exist on the base branch. The orchestrator should run `WDI_E2E_MATCH=1 CI=1 pnpm --filter @wdi/client test:e2e` at integration and expect to adjust timings and the exact `prompt` text ("Report") and `vote-count-*` text.
- **Soak against the base branch.** A 30-second run passed plumbing (`debug.deal` is ignored without K, so no kill or meeting occurs); the full 30 minutes needs K and L merged. Run `pnpm --filter @wdi/server build && pnpm bots:soak`.
- **Assumptions to check at integration.** The Killer's body id is `body_<playerId>` (L's brief); `Player.sceneId` indexes `Object.keys(scenes)`; a ghost's own `sceneId` may be frozen, so ghost bots skip the leak monitor; the spec's kill needs the host within about 1.1 tiles of the victim, found from the observer bot's public presence.
### Round 3 log: P (art)

Done on `claude/m3-art` (PR #12). Blender runs headless here as the `bpy` 5.2.0 wheel with Mesa EGL
(`tools/blender/README.md`); the calibration sheet re-renders byte-identical to the committed one.
Higgsfield was not used, so every new asset is CC BY 4.0 hand-made art (DECISIONS A36).

- **Villager masters** rebuilt by `build_villager.py` into git-ignored `assets/external/villager/`:
  the GLB matches Session H's hash byte for byte, the `.blend` differs only by save-time data, and
  a `die` render from the rebuilt `.blend` matches all 320 shipped `die` frames exactly. Hashes are in
  `assets/source/MANIFEST.md`, now prettier-formatted with its `.prettierignore` line removed
  (follow-up 5). Copy both files to ROSW `studio/assets/who-did-it/character/villager/` on the
  owner's laptop; the studio note is still to be written by the studio pipeline.
- **Real keys** in `apps/client/public/assets/manifest.json`: `clues` (all 21 keys, now real art at
  `clues/`), `props` (`prop_bell`, `prop_pump`, `prop_noticeBoard`, `prop_kitChest`,
  `prop_lanternPost_lit` / `_unlit`, base pivots), `vfx` with `anims_vfx` (`vfx_blood_pool` 8,
  `vfx_blood_splat` 12, `vfx_vote_stamp` 10, `vfx_dust_step` 6; 12 fps, played once). Each is one
  page. The body is the last `die` frame (no new key); review sheet
  `assets/source/review/villager-body-contact.png`.
- **Still placeholder** in the real manifest: the four `bld_*_ext` exteriors and the six `tiles_*`
  sets. The placeholder manifest has no `props` or `vfx`, so `?art=placeholder` shows N's greybox
  marks for them.
- **For N**: props are placed at the tile centre and their frame pivot puts the base there;
  footprints and the drag segment point screen-up, so rotate by `Clue.dir`; drag segments chain
  top to bottom; the stamp's frames 0 and 5 run off the cell on purpose.
- **Rebuild**: `python tools/blender/build_props.py -- --out build/render`, `python
  tools/blender/build_vfx.py -- --out build/render`, then `pnpm --filter @wdi/sprites pack:static
  ../../build/render/<atlas> ../../apps/client/public/assets/<atlas>` for `clues`, `props`, `vfx`; the
  atlases rebuild byte-identical. The body sheet: a `batch_render.py --anims die` run, then
  `pnpm --filter @wdi/sprites contact:body`.
### Round 3 log: Q

**Landed** (PR #14, `claude/m3-playtest`): nine CC0 OGG Vorbis q5 files under
`apps/client/public/assets/audio/`, one per key (`footstep`, `door_open`, `door_close`,
`door_locked`, `pickup`, `scream`, `bell`, `stamp`, `ambient`). Seven are from Kenney's RPG Audio and
Impact Sounds; the scream and the wind loop are from Freesound CC0. `audio/manifest.json` is
`{version: 1, entries: [{key, url, gain}]}`, the art manifest's wrapper (A37), so N's `AudioBus`
reads `entries`. `CREDITS.md` has one row per file. `docs/UI.md` 14 is the M3 copy deck: every line
has an id, and values are placeholders. GDD 2 step 5 now has the E bell toast. `docs/PLAYTESTS/`
holds the run sheet, the form, the scorecard, the notes template and the M2 stub. ROADMAP 7.5 has one
paragraph pointing to the kit, and DECISIONS A37 records the choices.

**Owner, before the first M3 playtest** (`docs/PLAYTESTS/README.md` 1): merge round 3; create the
Railway Hobby service with `WDI_DEBUG` unset and check `/health`; set the Actions variable
`VITE_SERVER_URL` to the Railway URL and re-run `pages`; set Pages source = GitHub Actions; confirm
the build matches on both sides; do a solo smoke run the day before; build the Google Form from
`FORM.md`; write the two bars at the top of `SCORECARD.md` before anyone plays.

**Not done or left open:**
- The Freesound pair are the site's HQ previews rather than the originals, because downloading
  originals needs an account. They are CC0 either way; swap in the originals if a cleaner master is
  ever wanted.
- The sharp-attack SFX land below -16 LUFS, because the limiter allows at most 6 dB of gain
  reduction. The manifest gains balance them; tune them by ear at the first session.
- Four things outside Q's paths for the orchestrator:
  - `docs/UI.md` 6 still uses "B at the bell calls a meeting" as its toast example.
  - `docs/README.md` does not index `docs/PLAYTESTS/`.
  - The Killer's `goal` in `roles.json` speaks of parity, while at 4-5 players the win is
    `villageAtMostOne` (GDD 3.8).
  - The match-log field names are described from K's brief; README 4 says the log line wins if they
    differ.

## Integration log, round 3 (2026-10-16)

All seven sessions finished their briefs inside half an hour and opened green draft PRs (#12 to #18),
none of them asking for a missing contract. The orchestrator merged L, K, N, M, O, P, Q in that order
(conflicts only in `docs/DECISIONS.md` and `docs/SESSIONS.md`, both appended by every session and kept
as unions), ran lint, typecheck, the unit suites, the build and every Playwright flow, including O's
real-server match test with `WDI_E2E_MATCH=1`: the kill -> body -> report -> meeting -> vote -> win
loop ran end to end on the first merged tree, Village win and Cabal win. Fixes made at integration
(DECISIONS A38):

- Footprints spawn one tile along the trail from the kill tile, never on the body's tile, since the
  client's prompt prefers the body there and the clue could not be collected (L's `Clues.ts`, test).
- The meeting's Notebook tab mounts N's `NotebookPanel` on the world feed (M's `Meeting` scene).
- L's report and bell tests return to a world phase beside the target after each accepted request,
  because K's meeting now really opens on the first request and moves everyone to the square.
- Wording: the Killer's card goal names the 4-5 player rule, the UI.md 6 toast example reads "E at
  the bell", `docs/README.md` indexes `docs/PLAYTESTS/`.

### Follow-ups for round 4

1. **M3 exit (owner)**: Railway Hobby service, `VITE_SERVER_URL`, Pages source (Q's
   `docs/PLAYTESTS/README.md` 1), then three 5-player sessions with the scorecard and the
   fun-or-stop decision recorded in `docs/PLAYTESTS/`.
2. **M3b quick mode** and **M3c NPC fill** (ROADMAP), in that order, as the next build round.
3. **Copy deck adoption**: N's toasts and prompts and M's `ui/meetingText.ts` still carry the GDD 2
   lines; replace them with the ids of `docs/UI.md` 14.
4. **Placeholder manifest**: `?art=placeholder` has no `props` or `vfx` entries (greybox marks show);
   the four `bld_*_ext` exteriors and six `tiles_*` sets are still stand-ins in the real manifest.
5. **Client small**: `InputController` stays in the registry across a second `?mock=1` match and keeps
   the old feed; the `stamp` sound at the reveal is not played yet (M has no `AudioBus`); the ghost
   chat form is covered by unit reads only; `view/hud.css` sets HUD corner offsets because the theme's
   `.wdi-hud__*` anchors ignore the safe area (fix in the theme, drop the block).
6. **Server small**: Kill does not require the Knife item (the role list decides); no ack for Bandage;
   the missing-person roll-call, suspect sets, `meeting.board`, the anti-stall rules and the
   wrong-ejection bonus are M4; in-play reconnection and the vanished body are M7.
7. **Soak**: run the full 30-minute `pnpm bots:soak` with the merged server (kills and meetings now
   occur); O ran 30 s against the base only.
8. **Art masters**: copy the rebuilt `villager.blend` and `villager.glb` from `assets/external/villager/`
   into the ROSW checkout (`studio/assets/who-did-it/character/villager/`); the two Freesound files
   are HQ previews, swap in the originals if a cleaner master is wanted.

## Round 4 (started 2026-10-16, after round 3 landed at 2f829e2)

Eight sessions build **M3b, quick mode** (One Night Ultimate Baguette, GDD 3.11, ARCHITECTURE 5.14,
ROADMAP M3b) and **M3c, NPC fill** (GDD 3.12, ROADMAP M3c) in one round, plus the round-3 follow-ups 3
to 7 above (the copy deck in code, the placeholder manifest, the client and server smalls, the
30-minute soak). Follow-ups 1 (the owner's M3 playtests) and 8 (the art masters on the owner's laptop)
stay the owner's and run beside this round: the site and the server are live. Same rules as rounds 1
to 3: draft PRs against `claude/zen-turing-m1jnw0`, under 400 lines where the work allows (split by
step, each PR green), `pnpm lint && pnpm typecheck && pnpm test` clean before every push, pinned
versions only, no model identifiers in committed files, `docs/GDD.md` changes in the same PR as a
behaviour change, numbers only in `docs/GDD.md` and `packages/content/data`. Code and tooling run on
Sonnet 5.5; art, content and design run on Opus 5.5. The decisions of this round are DECISIONS A39; a
session never re-decides them.

**Pre-seeded on the base branch** (the "Round 4 contract" commits, DECISIONS A39), so no two sessions
add the same thing. Shared: the constants `LOFT_SCENE_ID`, `LOFT_SCENE_INDEX` (255),
`ONUB_ACT_PREFIX`, `ONUB_SET_PLATE` and `NpcLevel` (`@wdi/shared/constants`); the schema `Prop.of`
(the owner's seat id of a quick-mode plate, empty otherwise), `NightReveal {slot, of, roleId}` and
`Private.nightReveal`, `Claim {from, roleId, targetId, sawRoleId}` with `MeetingState.claims` and
`MeetingState.traces`, `Settings.npcDifficulty` and `Settings.npcSeats`; the protocol `lobby.settings
{mode?, npcDifficulty?}`, `lobby.addNpc`, `lobby.removeNpc` (no payload: it removes the most recently
added NPC seat, so it never tells a seat apart), `meeting.claim {roleId, targetId?, sawRoleId?}` (all
2/s, all routed to `PartyRoom.lobbyCommands` and drained by `runLobbyCommands`, `meeting.claim`
already calling `handleClaim` in `sim/Meeting.ts`), the private `nightWake {windowRole, endsTick,
spawn}`, `nightReveal {entries}` and `nightSleep`, `MeetingReason` `dawn`, `voteResult.outs`,
`voteResult.roles` and `voteResult.abstained`, `gameOver.onub` (`OnubGameOver`: `dealt`, `final`,
`center`, `swapLog`, `votes`, `outs`, `plates` (plate prop id -> seat id), `rowId`, `winnerIds`), the
types `NightRevealEntry` and `SwapLogEntry` (`docs/PROTOCOL.md` regenerated); the rules module
`packages/shared/src/rules/onub.ts` with the signatures `dealOnub`, `nightScript`, `applyNightAct`,
`resolveDawn` (`DawnOutcome {tally, outs, abstained}`) and `onubWinners` (bodies throw until R fills
them) and `rules/npc.ts` with `pickNpcNames` (implemented, tested), both exported by `rules/index.ts`.
Content: `packages/content/data/names.json` (40 names, schema `NamesFile`, validated: lobby-legal,
unique, no role token, at least `players.max`) exported as `names` from the server-only entry
`@wdi/content/server` (`packages/content/src/{names,server}.ts`, tested in
`packages/content/test/names.test.ts`; an eslint rule forbids that entry under `apps/client`, so the
pool never ships in the client bundle); the `balance.json` rows `npc.wander {stepMinS, stepMaxS,
portalSteerChance, portalChance}` and `npc.vote {delayMinS, delayMaxS}` with their GDD 3.12 line;
`balance.onub.json` `targetLengthMin {min, max}` with its GDD 3.11 line; the `storm` winners row
reworded to the seat holding the Hireling loaf (GDD 3.11). Server: the stages `runNpcs(room)`
(`sim/Npc.ts`, after `syncRoster`, before `applyInputs`) and `runConductor(room)` (`sim/Conductor.ts`,
after `runPortals`, before the views reconcile), both empty, with `isNpcSeat(room, id)` and
`resetNpcsForLobby(room)` beside the first; `sim/Onub.ts` with `isOnub(room)`, `startOnubMatch(room,
ids, rng)` (called by `startMatch` before the main deal, with `ids = [...room.state.players.keys()]`)
and `beginOnubPlay(room)` (called first by `beginPlay`), both returning false outside quick mode,
`handleOnubAbility` (every `act.ability` whose id starts with `onub.` reaches it from
`handleAbility`), `plateOf(room, seatId)` and `onubNpcPlan(room, seatId)` (null until R fills them)
and `resetOnubForLobby`; the loft guards: `isLoft(idx)` in `sim/World.ts`, `applyInputs` and
`moveAndCollide` skipping loft players, `runPortals`, `livingActor` (every `act.*` verb) and
`holdProblem` refusing a loft player 425, `reconcileViews` giving a loft viewer no scene and no
presence and never sharing a loft player, `PlayerSim.sceneHidden` honoured by `enterScene` and reset
for the lobby; the quick-mode seal: `runPortals` refuses every portal 425 (nobody leaves the bakery,
GDD 3.11) and `placeNewPlayers` places nobody, so no quick-mode seat ever stands in the overworld;
`MeetingRequest.reason: MeetingReason` (`sim/RoomSim.ts`); `resetToLobby` clearing `nightReveal`,
`claims`, `traces` and every scene's `props`, then calling `resetOnubForLobby` and
`resetNpcsForLobby`; `endMatch` writing `players[].isNpc` from `isNpcSeat`; `MatchRecord.winner`
widened with `mode` and `players[].isNpc`. Client: the `?mode=onub` flag (`flags/index.ts`),
`REG_AUDIO` in `scenes/registry.ts`, the copy modules
`apps/client/src/ui/copy/{index,world,meeting,lobby}.ts` (one per client session, `fill()` for
placeholders), an empty `Loft` scene (`scenes/Loft.ts`, T's) registered in `main.ts` after `World`,
the `AUDIO_KEYS` `storm`, `creak`, `stamp` and `loaf_crack` (silent until `audio/manifest.json` lists
them), and `meetingRequest.reason` accepting `dawn` in `net/world.ts` and `MockMeetingRequest`.

**Nobody edits** `packages/shared/src/{schema,protocol,rules}/index.ts`,
`packages/shared/src/index.ts`, `packages/shared/src/constants.ts`, `packages/content/src/**` (the
schemas, `index.ts`, `names.ts`, `server.ts`, `validate.ts`),
`apps/server/src/sim/{Actions,Bodies,Clues,Commands,Death,Hold,Kill,Movement,Noise,PortalQueue,Portals,RoomSim,Step,Visibility,World,constants}.ts`,
`apps/server/test/{simHelpers,killHelpers}.ts`, `eslint.config.js`, `balance.json`,
`balance.onub.json` or `roles.onub.json`: a session that needs another contract writes it in its PR
description and carries on with a local stand-in; the orchestrator adds it to the base branch. Every
`*Tick` field is in ticks (`secondsToTicks`); content paths are the whole path:
`onubBalance.timers.duskS`, `onubBalance.acts[id].holdS`, `onubBalance.windows.find((w) => w.role ===
role)` (an array), `onubBalance.vote.minVotesToTurnOut`, `onubBalance.targetLengthMin.min`,
`onubFor(n).discussionS`, `balance.npc.difficulty[level]`, `balance.npc.wander.portalSteerChance`,
`abilities.abilities.kill.rangeTiles`, `names.pool` (`@wdi/content/server`, the server only).

| Session | Model | Track | Branch | Owns |
|---|---|---|---|---|
| **R. Quick mode, server** | Sonnet 5.5 | Code | `claude/m3b-server` | `apps/server/src/sim/{Conductor,Onub,Phases,Meeting,Win,Flow,Chat}.ts`, `apps/server/src/services/MatchLog.ts`, `packages/shared/src/rules/onub.ts` and `packages/shared/test/onub*.test.ts`, new `apps/server/test/onubHelpers.ts` and `apps/server/test/onub*.test.ts`, `apps/server/test/{flowHelpers.ts,flow,meeting,chat,win,visibility}.test.ts` (edits only where the mode branch needs them), `docs/GDD.md` 3.11 (one sentence per behaviour the PR changes, marked "(M3b)"), `docs/ARCHITECTURE.md` 5.14 |
| **S. NPC fill, server** | Sonnet 5.5 | Code | `claude/m3c-npc` | `apps/server/src/sim/Npc.ts`, new `apps/server/src/sim/npc/**`, `apps/server/src/rooms/PartyRoom.ts`, `apps/server/src/rooms/handlers/{lobby,debug,movement}.ts`, `packages/shared/src/rules/npc.ts` and `packages/shared/test/npc.test.ts`, new `apps/server/test/npcHelpers.ts` and `apps/server/test/npc*.test.ts`, `apps/server/test/{lobby,party,sim-movement,sim-portal,throttle}.test.ts`, `docs/GDD.md` 3.12 (marked "(M3c)"), `docs/ARCHITECTURE.md` 5.3 (the start flow) and 5.4 (the NPC line) |
| **T. Quick mode, client world** | Sonnet 5.5 | Code | `claude/m3b-world` | `apps/client/src/scenes/{World,RoleReveal,Loft,registry}.ts`, `apps/client/src/view/**` (except `hud.css`), `apps/client/src/input/**`, `apps/client/src/flags/**`, `apps/client/src/net/{world,worldColyseus,worldRouter}.ts` and `worldRouter.test.ts`, `apps/client/src/net/mock/worldMock.ts` and its test, `apps/client/src/ui/copy/world.ts`, `apps/client/e2e/world.spec.ts`, `docs/SPRITES.md` 5 (loading notes only) |
| **U. Quick mode, client meeting and end** | Sonnet 5.5 | Code | `claude/m3b-meeting` | `apps/client/src/scenes/{Meeting,GameOver}.ts`, `apps/client/src/ui/{Meeting,GameOver,meetingText,portrait,RoleCard}.ts` and their tests, `apps/client/src/net/{meeting,meetingColyseus}.ts`, `apps/client/src/net/mock/meetingMock.ts` and its test, `apps/client/src/ui/copy/meeting.ts`, `apps/client/src/ui/theme/components.css` (new rules appended at the end under a "Round 4 (U)" comment only), `apps/client/e2e/meeting.spec.ts`, `docs/UI.md` 11 and 12 (the meeting and end rows) |
| **V. Lobby, settings, network edge** | Sonnet 5.5 | Code | `claude/m3c-lobby` | `apps/client/src/ui/{Lobby,Landing,dom}.ts`, `apps/client/src/ui/styles.css`, `apps/client/src/scenes/{Lobby,Landing,Boot,Preload}.ts`, `apps/client/src/net/{NetworkService,mock,protocol,storage,index,fixtures}.ts` and their tests, `apps/client/src/ui/copy/lobby.ts`, `apps/client/src/ui/theme/tokens.css`, the five `.wdi-hud__*` anchor rules of `apps/client/src/ui/theme/components.css` and the lobby rules there, `apps/client/src/view/hud.css` (the safe-area block only), `apps/client/index.html`, `apps/client/src/main.ts`, `apps/client/e2e/{party,smoke}.spec.ts`, `docs/UI.md` 6 (the lobby rows) |
| **W. Bots, e2e, soak, CI** | Sonnet 5.5 | Code | `claude/r4-bots` | `tools/bots/**`, `tools/grid/test/**`, `apps/client/e2e/{match.spec,env}.ts`, new `apps/client/e2e/{onub,npc}.spec.ts`, `apps/client/playwright.config.ts`, `.github/workflows/ci.yml`, new `.github/workflows/soak.yml`, root `package.json` scripts, `docs/ARCHITECTURE.md` 5.12, `docs/ROADMAP.md` 7.5 (the Bot-only row only) |
| **X. Art: bakery, loft, placeholder manifest** | Opus 5.5 | Art | `claude/r4-art` | `assets/**`, `apps/client/public/assets/**` except `ui/`, `audio/` and `calibration/`, `tools/blender/**`, `tools/sprites/**`, `CREDITS.md` (rows appended at the end of the "Generated assets" and "Hand-made original art" tables), `assets/source/MANIFEST.md`, `docs/ASSETS.md` 6.3 and 6.7, `docs/SPRITES.md` 8 |
| **Y. Content, copy, audio, playtest kit** | Opus 5.5 | Design | `claude/r4-content` | `packages/content/data/names.json` and `packages/content/test/names.test.ts`, `docs/UI.md` 14 (new 14.12 quick mode and 14.13 NPC lobby lines), `docs/PLAYTESTS/**`, `apps/client/public/assets/audio/**` (files and `audio/manifest.json`), `LICENSES/**` (new licence texts only), `CREDITS.md` (rows appended at the end of the "Third-party assets" table), `docs/GDD.md` 2 (wording only, no rule or number), `docs/WORLD.md` (the bakery row and a loft note), `docs/ROADMAP.md` 7.5 (two new rows only: `4-6 humans` for M3b and `1-3 humans` for M3c, after the `4-5 humans` row) |

Suggested merge order: R, S, T, U, V, W, X, Y. Shared documents: edits stay inside the named section
with no renumbering or reflow, and the orchestrator keeps both sides of any conflict. Decisions a
session has to make go to `docs/DECISIONS.md` under its reserved number (R A40, S A41, T A42, U A43, V
A44, W A45, X A46, Y A47; a second row takes the number plus 10), never editing an older row. GDD 3.x
is touched only by R (3.11, behaviour sentences) and S (3.12); Y touches GDD 2 only, the 3.11 card
wording stays frozen this round, and nobody touches another 3.x section. The orchestrator runs the two
opt-in e2e suites and the 30-minute soak at integration.

### Briefs

**R. Quick mode, server.** Build the whole quick-mode match on the server: the deal and the cards, the
dusk, the night Conductor, the acts, the dawn meeting, the vote without Skip, the winners, the end
screen and the match log, all behind `isOnub(room)` so the main mode is untouched (every existing test
keeps passing). Rules first (`packages/shared/src/rules/onub.ts`, pure, property-tested with the
PRNG): `dealOnub(ids, deck, rng)` shuffles `onubFor(n).deck` (n = seats, 4 to 10; `deck.length ===
ids.length + 3` or throw) and returns `{dealt, center}`; `nightScript(deck, onubBalance.windows, rng,
timers.windowJitterMaxS)` keeps every window whose role is in the deck, dealt or among the dead's
loaves, in `order`, each with a seeded jitter in [0, jitterMaxS], so the night never leaks the deal;
`applyNightAct(loaves, act)` returns `{next, reveal}`, a permutation whatever the act;
`resolveDawn(votes, seats, vote)` turns out everyone holding the most votes when that is at least
`vote.minVotesToTurnOut`, ties included when `tiesTurnOutAll`, nobody otherwise, and lists the living
seats with no vote in `abstained`; `onubWinners(outs, finals, center, roleFaction)` walks
`onubBalance.winners` in order and returns the first row whose `when` holds and the seat ids that win,
every flag judged on **final** loaves: `debtorOut` = some out's final loaf is `debtor`, `poisonerOut`
= some out's final loaf is `poisoner`, `poisonerAmongMourners` = some seat's final loaf is `poisoner`,
`anyoneOut` = `outs.length > 0`; the winner tokens: `village` every seat whose final loaf is neither
Cabal nor the Debtor, `cabal` every seat whose final loaf is a Poisoner or the Hireling (a turned-out
Hireling included), `debtor` the seat holding the Debtor loaf, `hirelingIfMourner` the seat holding
the Hireling loaf, or nobody when it lies among the dead's loaves. Tests: every count's deck gives the
right loaf count and three dead loaves, the script never depends on which seats hold which roles,
every act is a permutation, the swap log replays from dealt to final, the winners table is exhaustive
and `debtorAndVillage` beats `debtorAlone`. Deal (`sim/Onub.ts` `startOnubMatch`, called by
`startMatch` with the ids and the seeded rng, before the main deal and before `startMatch` clears
`ready`, so it does every step `startMatch` does after the deal itself): consume
`flowOf(room).fixedDeal` (fixed seats keep their loaf, the rest of the deck is shuffled to the other
seats and the centre; set it to null); `dealt` and `center` into room memory (a module
`WeakMap<PartyRoom, OnubState>` holding `dealt`, `plateOf: Map<seatId, slot>` with slot = the seat's
index in `ids` (the client's `players` map order; a seat that left before the deal is not in `ids`, so
slots are always 0 to n-1, never `PlayerSim.ordinal`), `loaves: Map<propId, roleId>` over
`bk.plate_<slot>` and `bk.deadloaf_0..2`, `center`, `swapLog`, `script`, `windowIdx`,
`windowEndsTick`, `acted`, `plateSet`, `npcPlans`, `traces`, `votes`); `plateOf(room, seatId)` returns
`bk.plate_<slot>`; `priv.role.roleId` = dealt role, `priv.role.team` from
`onubRoles.roles[id].faction`, `priv.cabalMates` = the other Poisoner for a Poisoner and nobody else
(the Hireling learns the Poisoners at its window, never on the card), traits as the main deal, `ready
= false`, `alive = true`, `room.lock()`, `setPhase(roleReveal, onubBalance.timers.roleCardS)`, and one
`roleReveal` per seat built without `buildRoleReveal` (it throws on an onub id): `roleId`, `team`,
`goal` = `onubRoles.roles[id].nightAct`, `cardText`, `beware` = `onubRoles.cardLine`, `abilities` and
`inventory` empty, `teammates` the Poisoner partner, `traits`. `runLobbyPhase` then calls `beginPlay`,
whose first line hands quick mode to `beginOnubPlay(room)`: set `round = 0`, `startTick`, clear
`ready`, fix the profile (`sim.profile = profileFor(n)`, `applyProfileToDoors`, `sim.profileFixed =
true`), place every seat in the bakery itself (`enterScene(room, player, p, 'bakery', 'door', false)`,
announced, stacking allowed, `p.placed = true`, `player.alive = true`, `sim.viewsDirty = true`;
`placeNewPlayers` places nobody in quick mode, so no seat ever gets an overworld `sceneEnter` and no
teaching clue spawns), seed `scenes.bakery.props` with one `Prop {id, kind, turned: false, of}` per
seated plate (`of` = the owner's seat id; plates are named in the fiction, so the owner is public) and
for the three dead loaves and the ledger (`of` empty; ids and kinds from `scenes.bakery.props`), and
`setPhase(dusk, timers.duskS)` instead of grace. Dusk: accept `act.ability {abilityId:
'onub.setPlate', targetId: plateOf(actor)}` within `actRangeTiles` (427 otherwise; 422 for another
plate; 425 outside dusk); at the end of dusk every unset plate is set by the server. Portals are
refused 425 all match (pre-seeded). Night: at `dusk -> night` the Conductor sets every seat's public
`sceneId` to `LOFT_SCENE_INDEX`, `PlayerSim.sceneHidden = true`, `sceneIdx = LOFT_SCENE_INDEX`, `input
= null`, `room.commands.clearMove(id)`, sends each client `nightSleep`, builds the script and sets
`phaseEndsTick` to the whole night (windows plus jitter plus `timers.fadeS` per window). Every wake
and every sleep runs in `runConductor` and sets `sim.viewsDirty = true`; `runOnubPhases` (in
`sim/Conductor.ts`; `runPhases` hands quick mode to it) only advances dusk -> night -> dawn -> meeting
-> reveal and, every tick, empties `sim.meetingRequests` and `sim.deaths` (the only meeting quick mode
opens is the dawn one). Per window the Conductor moves the seats whose **dealt** role equals the
window's role, NPC seats included, to the bakery `door` with `enterScene(..., false, false)` plus a
private `nightWake {windowRole, endsTick, spawn: 'door'}` (an NPC seat has no client, so nothing is
sent, but its presence reaches the co-wakers as a human's would); `seeEachOther` needs nothing more,
both Poisoners share the bakery view; a Poisoner alone (`onlyIfAlone`) may peek one dead loaf. For an
NPC waker the Conductor picks a seeded legal act and target at the window's start (nothing for a "may"
act with `onTimeout: nothing` when the seeded draw says so) and returns it from `onubNpcPlan(room,
seatId)`, so S's brain walks there and sends it; if the NPC has not acted by the window's end the
Conductor applies the plan itself, before the fade. At the window's end every waker gets `nightSleep`
and returns to the loft; `onTimeout: seededPick` (the Sot) applies a seeded dead loaf when the window
expires without an act. Acts (`handleOnubAbility`): phase night (425), the open window's role equals
the actor's dealt role (425), not yet acted this window (422), the target prop exists and is within
`actRangeTiles` of the actor (427), legal for `acts[id].target` judged by `plateOf` (`otherPlate`
never the own plate, `ownPlate` only the own plate, `deadLoaf` only `bk.deadloaf_*`, `ledger` only
`bk.ledger`; 422), `picks: 2` acts take `targetId` and `targetId2` in one message (`onub.swapPlates`
two other plates, `onub.peekDead` one or two dead loaves for the Sin-Eater); then `applyNightAct`, the
swap log row `{order, roleId, act, slots}` for swapping acts, `Private.nightReveal` entries and a
private `nightReveal {entries}` for revealing acts (`of` = the plate's owner for a plate, empty for a
dead loaf; `onub.readLedger`: one entry per Poisoner, `slot: 'bk.ledger'`, `of` the Poisoner's seat);
nothing in a window changes `Prop.turned`. Dawn: after the last fade, `dawn` for `timers.dawnS`
(everyone still in the loft), then `openMeeting` with reason `dawn` (the meeting does not move anyone
to the square), `MeetingState.traces` = the `traceText` of every window in the script (cosmetic, A39),
`setPhase(meetingDiscussion, onubFor(n).discussionS)`; the public `sceneId` of every seat stays 255
until `resetToLobby` resets it. Votes (`handleVote`, mode branch): `"skip"` and the own id refused 422
when `vote.skipAllowed` and `vote.selfVoteAllowed` are false, a missing vote abstains, the vote ends
early when every connected living seat has voted (a leaver, `connected === false`, counts neither for
`allVoted` nor as a living target), the vote phase lasts `timers.voteS`; `startReveal` uses
`resolveDawn`, `setPhase(reveal, timers.revealS)`, broadcasts `voteResult {tally, outs, roles,
abstained}` with the final roles of the turned-out only, and sets `PlayerSim.dead = true` and
`Player.alive = false` on them directly (quick mode sends no `killed` and pushes no death event:
`voteResult.outs` is the cue); `endReveal` goes straight to `endMatch` with `onubWinners`:
`state.winner` = `debtor` when the Debtor is out, else `village` or `cabal` per the row, else
`nobody`; `gameOver {winner, roles: final roles, summary: row.text, onub: {dealt, final, center,
swapLog, votes, outs, plates, rowId, winnerIds}}` (`plates` maps every seated `bk.plate_<slot>` to its
seat id); `MatchRecord` with `mode: 'onub'` (`players[].isNpc` is pre-seeded); then `resetToLobby`
after `balance.phases.gameOverS` (and `resetOnubForLobby` drops the room memory). Claims
(`handleClaim`): a living seat in `meetingDiscussion` or `meetingVote` in quick mode, `roleId` an onub
role id, `targetId` a seat or empty, `sawRoleId` an onub role id or empty; replaces the seat's
`MeetingState.claims` row; 422 in the main mode, 425 in any other phase (the reveal included). A
leaver during a quick-mode match abstains and never ends the match. Chat: unchanged (meeting channel
in the three meeting phases). Debug (`runDebugCommands`): `debug.clock {phase: 'dawn'}`, and in quick
mode `{window: <roleId>}` to jump the Conductor to that window (the current wakers sleep on the same
tick the next ones wake) and `{phase: 'night'}` to start the night now; `debug.deal` accepts onub role
ids when the mode is onub (validated against `roles.onub.json`), consumed by `startOnubMatch`. Tests
(`test/onubHelpers.ts`: `startOnub(colyseus, n, dealtByName?)` sets `settings.mode` white-box, sends
`lobby.start` from the leader, readies every seat and waits for dusk; `openWindow(m, roleId)` through
`debug.clock`): a 6-seat deal has 9 loaves and 3 dead; a room with a leaver and a rejoin still deals
plates `bk.plate_0` to `bk.plate_<n-1>`, each prop's `of` naming its seat; no `sceneEnter` names the
overworld and `scenes.overworld.clues` stays empty; the Hireling's `nightReveal` names both Poisoners;
a sleeper receives no `presence`, no `SceneState`, no `sceneEnter` and no `nightWake` during any
window of another role (diff the view as `visibility.test.ts` does), once with the windows run in turn
and once with a `{window}` jump; a sleeper's `act.enterPortal`, `act.hold` and `act.reportBody` are
refused 425 and its view stays empty; the public roster shows every `sceneId` as 255 all night; each
of the Sin-Eater, Cutpurse, Busybody, Sot and Lamplighter acts verified (the Sot's timeout included);
a second act in one window and an act outside the window are refused; `"skip"` and a self-vote are
refused 422; a tie turns out both; `voteResult.abstained` names a seat that did not vote; nobody
receives `killed` in a quick-mode match; the swap log replays to the final roles; the match log line
carries `mode: 'onub'`. Not in scope: the loft view, claims chips and the end screen (T, U), NPC seats
and the NPC brain (S), bots (W). Every number from `balance.onub.json` and `balance.json`; a timing
the GDD lacks is a DECISIONS A40 row, never a literal.

**S. NPC fill, server.** Fill the seats below `players.min` with server-side NPC villagers and let the
leader add more (GDD 3.12, A26, A39), hidden on the wire. Seats: extract the seat constructor of
`PartyRoom.onJoin` (`Player`, `Traits`, `Presence`, `Private`, `Role`, `Inventory`) into
`handlers/lobby.ts` `newSeat(room, id, name)` and call it for NPC ids from `generateId()`
(`@colyseus/core`), `connected = true`, `ready = true` in the lobby, a name from
`pickNpcNames(names.pool, taken, count, rng)` (`names` from `@wdi/content/server`; seeded from
`room.matchSeed` or `randomInt` at add time), never the leader (`passLeader` and the first-seat leader
rule skip NPC ids). `isNpcSeat(room, id)` reads a `Set<string>` in `sim/Npc.ts` room memory that lives
as long as the room: an id leaves it only when `lobby.removeNpc` removes the seat, a human takes the
seat in `onJoin`, or `syncRoster` drops a seat the roster no longer holds; NPC seats survive
`resetToLobby` like connected humans, and `resetNpcsForLobby` (pre-seeded hook at the end of
`resetToLobby`) sets them `ready = true` again and clears the brain state. Humans are counted by
`room.clients` (`startRefusal`, `onLeave` of a human as today). Ready: `startMatch` clears every
seat's `ready` as today (in quick mode `startOnubMatch` does it); during the role card `runNpcs`
readies each NPC seat after a seeded delay drawn from `npc.vote.delayMinS..delayMaxS` (human-paced, so
the ready ticks never mark a seat; add that clause to GDD 3.12), and `runLobbyPhase` counts NPC seats
as it counts humans. Fill at Start: when `lobby.start` is accepted with fewer than `players.min` seats
the server adds NPC seats up to `players.min` before `startMatch` deals (remove the A28 cut in
`rosterFor`: every roster row is now a full row); `lobby.addNpc` (leader, lobby, below `players.max`,
else 422/425) adds one seat in the lobby, `lobby.removeNpc` (leader, lobby, no payload) removes the
most recently added NPC seat (422 when there is none); a human joining a full party with an NPC seat
takes that seat (`onJoin`: remove one NPC, then seat the human); `Settings.npcSeats` is the live
count; `lobby.settings {mode?, npcDifficulty?}` (leader, lobby) writes `Settings.mode` (0 or 1, else
422) and `Settings.npcDifficulty` (an `NpcLevel`, accepted only while `npcSeats >=
balance.npc.difficultyMinNpcs`, else 422; the default `NpcLevel[balance.npc.defaultDifficulty]` is
written at room creation, and like `mode` the setting persists through the lobby reset). Behaviour
(`runNpcs`, every tick, before `applyInputs`; a port of `tools/bots/walk.ts` `startWalker` into the
room): in a main-mode world phase an NPC writes `PlayerSim.input {seq, dx, dy, sprint: false, sneak:
false, tick}` with a new heading every `npc.wander.stepMinS..stepMaxS` (seeded `mulberry32` per room),
aimed at the nearest portal with chance `npc.wander.portalSteerChance` at each new heading and taking
a portal in reach with chance `npc.wander.portalChance` (`queuePortal`), staying inside the nav grid
(the sim collides it like a human); it reports the nearest unhidden body it is within
`abilities.abilities.report.rangeTiles` of after the difficulty row's `reportDelayS` (`runAction(room,
id, 'act.reportBody', {bodyId})`; a Killer NPC never reports); it votes
`npc.vote.delayMinS..delayMaxS` after the discussion opens through `handleVote(room, id, {targetId})`:
with probability `suspectVoteChance` the seat with the most reports or sightings in its own memory
(the Case Board is M4; record in A41 what "most Verified clues" means until then), else `"skip"`; in
quick mode it votes a random living other seat, never itself, never Skip (`isOnub(room)` from
`sim/Onub.ts` is the only mode test S uses). A Killer NPC with the kill ability, alone with a human in
its scene at night, strikes with `killChancePer10s` per ten seconds of opportunity (`runAction(room,
id, 'act.ability', {abilityId: 'kill', targetId})` within `abilities.abilities.kill.rangeTiles`), then
walks to the nearest basin scene and the square and votes with the majority of the cast votes at the
reveal; `plantsPerNight` waits for M4 (Accomplice). NPC seats hold no Notebook and no tasks. Quick
mode (the hooks return null until R lands, so these branches idle): in dusk an NPC walks to
`plateOf(room, id)` (writing `PlayerSim.input` toward the plate's tile) and, within reach, calls
`handleOnubAbility(room, id, {abilityId: ONUB_SET_PLATE, targetId})`; in the loft it does nothing;
when the Conductor has woken it, it walks to the target of `onubNpcPlan(room, id)` and sends that act
through `handleOnubAbility` (the Conductor applies the plan itself if it never arrives). Debug
(`handlers/debug.ts`, `WDI_DEBUG=1`): `debug.npc {walk: false}` parks every NPC on its spawn for the
e2e; the callback pushes onto a `debugFlags` queue in `sim/Npc.ts` room memory that `runNpcs` drains,
so nothing changes state in the callback. Tests (`test/npcHelpers.ts`): 1 human + 3 NPCs starts and
deals the 4-row (practice label unchanged, GDD 3.9); `lobby.addNpc` up to 10 and `removeNpc` down to
none, then 422; a human join takes an NPC seat; after `resetToLobby` a 1+3 room still reports
`npcSeats` 3 and its NPCs move in the next match; the flattened public roster of a 1+3 room and a
4-human room have identical key sets and `connected`, `ready`, `hasVoted` shapes
(`flatten`/`diffPaths` of `killHelpers.ts`), during the role card before any human readies (every
`ready` false in both) and in the lobby; no `isNpc`, no `npc_` substring and no pool-only marker on
the wire (`JSON.stringify` of the encoded state); NPCs move and cross portals within the grid; an NPC
reports a body after `reportDelayS`; NPCs vote inside the window; the NPC Killer scripted-match test
(one NPC Killer, Normal, five seeded matches with `debug.clock` shortening the phases) wins at least
one, gated `WDI_SLOW=1`; p95 tick under 15 ms with 1 client and 9 NPCs for 30 s of day (`metrics`
delta), gated `WDI_SLOW=1`. Once R has merged (merge the base branch into your branch), add: 1 human +
3 NPCs completes a quick-mode match through the Conductor, and a human Poisoner whose partner is an
NPC receives the partner's presence in the Poisoners' window. `docs/GDD.md` 3.12 gets one sentence per
behaviour the PR fixes ("(M3c)") and A41 the voting stand-in. Not in scope: the lobby UI (V), the
Conductor (R), bots (W), the match log (pre-seeded).

**T. Quick mode, client world.** Everything a quick-mode player sees between the role card and the
meeting, plus the world side of the follow-ups. Router (`net/worldRouter.ts`): a `nightSleep` event
starts the `Loft` scene (pre-seeded empty and registered in `main.ts`; stopping `World`), a
`nightWake` or a bakery `sceneEnter` starts `World` in the bakery (stopping `Loft`), `meetingStart`
stops `Loft` as it sleeps `World`, `phaseChange` to lobby stops `Loft`; cases in
`worldRouter.test.ts`. Feeds (`net/world.ts`, `worldColyseus.ts`): events `nightWake`, `nightReveal`,
`nightSleep`; `props(): PropSnap[]` (`{id, kind, turned, of}` from `SceneState.props`); `mates():
string[]` from `priv.cabalMates`; `nightReveal(): NightRevealEntry[]` from `priv.nightReveal`;
`ability(id, targetId?, targetId2?)` sending `targetId2`; `mode(): 'main' | 'onub'` from
`state.settings.mode`. Loft (`scenes/Loft.ts`, DOM in `view/LoftView.ts` from
`public/mockups/loft.html` and the theme's `.wdi-loft`, `.wdi-bedrolls`, `.wdi-bedroll(.is-self)`):
one bedroll per seat of `feed.snapshot()` (`data-testid="bedroll-<id>"`), every one occupied all
night, the own one marked, the backdrop and bedroll images from the manifest entries `loft_backdrop`,
`prop_bedroll` and `prop_bedroll_self` (`type: image`, their `url` read through `view/assets.ts` and
set as CSS backgrounds; the mockup's CSS bedrolls stay as the fallback when an entry is missing),
storm ambience (`AudioBus` key `storm`) and muffled pulses (`creak`) from a random edge every
`timers.sleeperPulseMinS..MaxS` with a local RNG (`edgeCue` without a label), no clock, no HUD, no
input (`InputController.stop()`), `data-testid="loft"`; the Loft never reads the roster's `sceneId`.
Bakery (`World.ts`, `view/PropView.ts`): static props come from the content `scenes[sceneId].props` as
today, and the feed's `props()` overlays the ids it lists (plates, dead loaves, ledger) with their
`turned` bit and owner; in quick mode a `plate` is drawn only when the feed lists it (seated slots),
labelled with the name of the seat in its `of`; keys by `prop_<kind>` then `prop_<id tail>` as
`PropView` does (`prop_plate`, `prop_deadLoaf`, `prop_ledger`, `prop_wakeTable`, `prop_oven`,
`prop_basin`, `prop_flour_sacks`) with the labelled greybox fallback until X lands. In dusk the prompt
on the own plate (the prop whose `of` is the own id) reads the `prompt.plate.set` line, a hold of
`timers.plateHoldS` drawn with the collect ring, then `ability('onub.setPlate', plateId)`; in a
`nightWake` window the HUD shows the window's role name and `setTimer` from `endsTick`, the prompts
come from `onubBalance.windows.find((w) => w.role === windowRole)?.acts` and `acts[id].target` and
`holdS` (`deadLoaf`, `ledger`, `otherPlate`, `ownPlate`), a `picks: 2` act holds the first pick in
scene state and sends both on the second, the own plate is never offered for `otherPlate`, a
Poisoner's partner nameplate glows red (`PlayerView.setMate(true)` for `mates()`); a `nightReveal`
shows each entry as a toast and a HUD line until the window ends, "<seat name>: <role name>" when `of`
is set, the role name alone for a dead loaf (`onubRoles.roles[roleId].name`);
`data-testid="night-wake"` on the window banner. Phases: `dawn` in `Lighting` as dusk, `dusk` and
`night` labels from the copy. Portals: no door prompt in quick mode (the server refuses them).
Follow-ups: adopt the copy deck (`ui/copy/world.ts` from `docs/UI.md` 14.1 to 14.5 and 14.8, every
literal in `World.ts`, `Hud.ts`, `NotebookPanel.ts` replaced, `world.spec.ts` following
`prompt.collect`); stop the `InputController` timer on the router's lobby return and on `meetingStart`
and guard `start()` (follow-up 5); the audio keys are pre-seeded. `?mode=onub` makes `worldMock.ts`
play dusk at the bakery (plate props with `of`), a short night with one `nightWake` window for the
self seat, a `nightReveal` and `nightSleep`, then `meetingRequest` with reason `dawn` (U's meeting
mock plays quick mode on that reason), so the Loft and the prompts run without a server
(`world.spec.ts` covers the loft and the plate prompt in the mock). Not in scope: the meeting, claims,
the end screen (U), the lobby (V), `hud.css` and `main.ts` (V). Numbers from `balance.onub.json`
through `@wdi/content`, never literals.

**U. Quick mode, client meeting and end.** The dawn meeting, claims, the plural reveal, the end screen
and the meeting side of the follow-ups. Feeds (`net/meeting.ts`, `meetingColyseus.ts`): `mode():
'main' | 'onub'` (`GameStateLike.settings`), `claims(): Claim[]` and `traces(): string[]` from
`MeetingState`, `claim(roleId, targetId?, sawRoleId?)` sending `meeting.claim`, `result()` carrying
`outs`, `roles` and `abstained`, `over()` carrying `onub`. Meeting (`ui/Meeting.ts`): reason `dawn`
(`reasonLine`), the report tab lists `traces()` as the board's trace lines, the vote hides `vote-skip`
and refuses a self tap when `mode() === 'onub'`, a claim chip strip in the chat panel built from
`onubRoles.roles` (`.wdi-chip--claim`, `data-testid="claim-<roleId>"`) that posts the seat's claim (a
role tap, then an optional seat and seen-role pick for the revealing roles) and shows every seat's
claim under its portrait as "Claimed"; the reveal stamps every id in `result().outs`, the
`ejectionLine` names them all with their final roles, and a line names the abstainers; `factionOf` and
`roleTitle` read `roles.onub.json` when the mode is onub (`sinEater` is "Sin-Eater" through the role's
`name`). Game over (`ui/GameOver.ts`): with `over().onub`, one row per seat "dealt -> final"
(`gameover-role-<id>` keeps the dealt role, new `gameover-final-<id>`), the three dead loaves, the
swap log as a timeline (`data-testid="swaplog"`, one line per entry from the window's role name and
the plate owners' names, each slot resolved through `onub.plates` (plate id -> seat id) or "a dead
loaf", e.g. "The Cutpurse took Hana's loaf"), the vote arrows as "A voted B" lines, the winner line
from `summary` and the `winnerIds` marked; the countdown as today. Stamp sound: the Meeting scene
plays `stamp` on the `REG_AUDIO` bus on a `voteResult` with an ejection or outs (follow-up 5; the key
is pre-seeded). Copy: `ui/copy/meeting.ts` from `docs/UI.md` 14.6, 14.7, 14.9, 14.10 and the
quick-mode lines Y adds in 14.12 (until Y lands, the GDD 3.11 wording with ids `meeting.claim.*`,
`reveal.outs`, `gameover.swap.*`), every literal in `Meeting.ts`, `GameOver.ts`, `meetingText.ts`
replaced. `ROLE_CARD_SECONDS` in `RoleCard.ts` reads `balance.phases.roleRevealS`, or
`timers.roleCardS` when the card is a quick-mode one (the card payload's `beware` equals
`onubRoles.cardLine`). Mock (`meetingMock.ts`): `MockMeetingFeed` plays quick mode when `req.reason
=== 'dawn'` (T's world mock sends that with `?mode=onub`; `MockMeetingRequest.reason` already accepts
it): a dawn meeting with traces, claims, a vote without Skip, a two-seat tie reveal with one abstainer
and a `gameOver` with `onub` fixtures (`plates` included); `meeting.spec.ts` covers the claim strip,
the missing Skip and the swap log. Theme: new rules appended at the end of `components.css` under
"Round 4 (U)" only. Not in scope: the loft and the world (T), the lobby (V).

**V. Lobby, settings, network edge.** The lobby for both milestones and the client edge both server
sessions talk to. `NetworkService`: `LobbySnapshot.settings {mode, npcDifficulty, npcSeats}` kept in
sync from `state.settings` (`onChange`), `LobbyPlayer` unchanged (NPC seats look like humans, GDD
3.12); `setMode(mode)`, `setNpcDifficulty(level)`, `addNpc()`, `removeNpc()` sending `lobby.settings`,
`lobby.addNpc`, `lobby.removeNpc {}`. Lobby (`ui/Lobby.ts`, `scenes/Lobby.ts`): a settings block
between the code row and the roster: the mode chip (`data-testid="mode-chip"`, "Who Did It" or "One
Night Ultimate Baguette, {min}-{max} min, {players}" with the length from
`onubBalance.targetLengthMin.min` and `.max` and the counts from `balance.players`, A15) with a
leader-only toggle (`data-testid="mode-toggle"`), the leader-only "Add NPC" (`add-npc`) and "Remove"
(`remove-npc`; the server drops the most recently added NPC seat, since nothing on the client marks
one; Remove hidden when `settings.npcSeats` is 0, Add hidden when the party is full), the difficulty
select (`npc-difficulty`, options from `Object.keys(balance.npc.difficulty)`, default
`npc.defaultDifficulty`, disabled below `npc.difficultyMinNpcs` NPC seats using `settings.npcSeats`),
the hint line replaced by the copy deck's (no more "NPC fill is coming"); `player-count` keeps its "n
/ 10" shape (the existing specs assert it). Mock (`net/mock.ts`, `net/fixtures.ts`): the four messages
change the mock snapshot's settings and roster; the mock passes T's `meetingRequest` through
unchanged. Theme (follow-up 5): the five `.wdi-hud__*` anchors use `calc(var(--wdi-space-3) +
env(safe-area-inset-*))` so the HUD respects the safe area, then the override block in `view/hud.css`
is deleted (the only `hud.css` edit). Copy: `ui/copy/lobby.ts` from `docs/UI.md` 14.11 and Y's 14.13,
the literals of `Landing.ts` and `Lobby.ts` replaced. e2e: `party.spec.ts` keeps `'6 / 10'`; a new
case toggles the mode chip and sees the chip text change (mock); `smoke.spec.ts` unchanged. Not in
scope: the server side (S), the match screens (T, U).

**W. Bots, e2e, soak, CI.** Make every bot and harness play both modes and run the long checks. Brain
(`tools/bots/walk.ts`): read `state.settings.mode`; in quick mode a bot walks to its own plate in dusk
(the bakery prop whose `of` is its own id) and sends `act.ability {abilityId: 'onub.setPlate',
targetId}`, sleeps between `nightSleep` and `nightWake` (no `input.move`, no portal: the server
refuses portals in quick mode), and in its window picks a legal act from `onubBalance.windows.find((w)
=> w.role === windowRole)?.acts` and a target of `acts[id].target` among the scene's `props` (never
its own plate for `otherPlate`, `targetId2` for `picks: 2`), counts `wakes`, `acts`, `claims` and
`nightLeaks` (any `presence`, `SceneState`, `sceneEnter` or `nightWake` received while asleep);
`VoteMode` gains `other` (a random living other seat, never self, never Skip), chosen automatically in
quick mode, with a cap on repeated refusals; `claims: true` posts "I was <card.roleId>" once per
meeting through `meeting.claim`. `swarm.ts` exposes `settings` as a read-only accessor and
`addNpc`/`removeNpc` on the observer for the specs. Soak (`soak.ts`): `--mode onub` sets the mode
through `lobby.settings` from the leader (a bot there), skips `debug.deal`, idles when `meetings === 0
|| acts === 0`, reports matches; the main-mode run unchanged; `pnpm bots:soak` runs the full 30
minutes against the built server (follow-up 7) and the result goes in the round-4 log with the p95; a
new `.github/workflows/soak.yml` (`workflow_dispatch` plus a weekly cron, `timeout-minutes: 45`, never
on push) runs both modes. Live (`live.ts`): `--mode onub` plays through the role cards and dusk. e2e:
`onub.spec.ts` (two real browsers plus swarm bots, opt-in `WDI_E2E_ONUB=1`,
`test.setTimeout(300_000)`): the host page toggles `mode-toggle` (V's frozen hook) and the chip reads
the quick-mode text, the observer only reads `state.settings.mode`, the host starts, both pages see
the quick-mode card line, dusk at the bakery with the plate prompt, the loft (`loft`, `bedroll-<id>`),
a `night-wake` on the page whose dealt role (`debug.deal` with onub ids, consumed by R's deal) has a
window, `debug.clock {phase: 'dawn'}` after one window, the dawn meeting with `claim-<roleId>` and no
`vote-skip`, a vote, the reveal, `gameover` with `swaplog` and `gameover-final-<id>`, the lobby
return; `npc.spec.ts` (one browser, opt-in `WDI_E2E_NPC=1`): the host presses `add-npc` three times
and sees `'4 / 10'` with three names that are not the host's, presses Start, `debug.npc {walk:
false}`, kills and reports as `match.spec.ts` does, the meeting opens with three NPC votes inside the
window, the match ends; a second case presses Start alone and sees four portraits in the meeting (the
fill at Start); a quick-mode variant with 1 human + 3 NPCs through the Conductor. The pool is
server-only: no spec imports `@wdi/content/server`. CI: `timeout-minutes: 15` on the check job; the
server suite in its own job if the wall clock passes 4 minutes; the opt-in suites documented in
ARCHITECTURE 5.12. Not in scope: server behaviour (R, S), client screens (T, U, V).

**X. Art: bakery, loft, placeholder manifest.** The bakery props, the loft and the stand-ins the
playtests still show. Props atlas (`props/`), keys `prop_plate`, `prop_deadLoaf`, `prop_ledger`,
`prop_wakeTable`, `prop_oven`, `prop_basin`, `prop_flour_sacks` (the id-tail key `PropView` falls back
to, since `bk.flour_sacks` has kind `taskSource`), each a top-down 2.5D render at the `metrics.json`
cell from Blender masters (CC BY 4.0 hand-made, masters to ROSW per ASSETS 6.6, `MANIFEST.md` rows) or
a CC0 source with a `CREDITS.md` row, never Synty, never raw Mixamo or Quaternius; a
`prop_plate_named` variant is not needed (the client draws the name). Loft: `loft_backdrop` (one
image, the bakery loft at night, storm light at the window), `prop_bedroll` and `prop_bedroll_self`,
added as `type: image` manifest entries (T sets them as CSS backgrounds in the DOM loft) and sized for
the `.wdi-bedrolls` grid of `mockups/loft.html`. Placeholder manifest (follow-up 4):
`?art=placeholder` gains `props` and `vfx` entries that point at greybox marks so no greybox label
shows in a playtest; the four `bld_*_ext` exteriors and the six `tiles_*` sets get real stand-ins
where the hours allow, in this order. `manifest.json` keys contract: T draws by these keys with a
greybox fallback, so land the manifest entries first and the images after. Docs: ASSETS 6.3 (the new
rows), 6.7, SPRITES 8. Not in scope: UI art, audio (Y).

**Y. Content, copy, audio, playtest kit.** The words, sounds and run sheets of both milestones. Names:
review `packages/content/data/names.json` (40 names today; server-only, read through
`@wdi/content/server`) for the 1931 Hollowmere register and the house style, keep every name
lobby-legal and free of role tokens, and extend `packages/content/test/names.test.ts` if the review
adds a rule (the schema and validator are frozen: a new rule they need goes in the PR description).
Copy: `docs/UI.md` 14.12 "Quick mode" (the lobby chip, the dusk plate prompt, the loft, the window
banner, every act prompt and reveal line, the claim chip lines, the dawn reason, the plural reveal and
the abstainers line, the swap-log sentence patterns, the winner lines per `balance.onub.json` winners
row) and 14.13 "NPC lobby" (Add NPC, Remove, difficulty, the hint, the practice line), ids in the 14.x
style, no numbers; T, U and V paste them. Audio: `storm` (loop), `creak`, `loaf_crack` (`stamp` is
already shipped); CC0 or CC BY with `LICENSES/` texts and `CREDITS.md` rows, listed in
`audio/manifest.json` under the pre-seeded `AUDIO_KEYS`. Playtest kit: `docs/PLAYTESTS/README.md` gets
the M3b and M3c rows (prerequisites unchanged; the session plan for a 6-player quick-mode evening and
for a 1-3 human NPC session), `SCORECARD.md` the M3b lines of ROADMAP (three 6-player matches in 5-7
minutes, players naming their final role at the reveal in half the matches, "would play again" against
M3) and the M3c lines (1 human + 3 NPCs completes a match, the NPC Killer wins), `FORM.md` two
questions, a `TEMPLATE.md` note. Docs: GDD 2 (wording only), WORLD.md (the bakery row's plates and the
loft note), ROADMAP 7.5 (two new rows after `4-5 humans`: `4-6 humans` for M3b and `1-3 humans` for
M3c, no other change). The 3.11 card texts and `roles.onub.json` stay frozen this round; a wording fix
goes in the PR description. Not in scope: code.

### Seams in round 4

| Producer -> consumer | Contract | Until it lands |
|---|---|---|
| R -> T, U | `nightWake`, `nightReveal`, `nightSleep`, `Prop.of`, `MeetingState.claims` and `traces`, `voteResult.outs`, `roles` and `abstained`, `gameOver.onub` with `plates`, `Settings.mode` (all pre-seeded); one bakery `sceneEnter` at dusk and never an overworld one in quick mode | T and U build on `?mode=onub` mocks of their own files and test against R's branch at integration |
| R -> U | the quick-mode `roleReveal`: `beware = onubRoles.cardLine`, `goal = roles[id].nightAct`, `cardText = roles[id].cardText`, empty `abilities` and `inventory` | U detects the quick-mode card by `beware` |
| R -> S | `startOnubMatch` and `beginOnubPlay` (pre-seeded hooks in `startMatch` and `beginPlay`) deal, place and start quick mode; S never edits those two lines; `isOnub(room)` is the only mode test S uses; `plateOf` and `onubNpcPlan` drive the NPC brain in quick mode | the hooks return false and null until R lands, so S's fill and settings run in the main mode and the quick-mode brain idles |
| S -> R | `isNpcSeat(room, id)` (pre-seeded, false until S lands): the Conductor plans an NPC waker's act and applies it if the brain never sends it; `endMatch` reads it for `players[].isNpc` and `resetToLobby` calls `resetNpcsForLobby` (both pre-seeded) | R treats every seat as human until S lands |
| R -> W | `debug.clock {phase: 'dawn' \| 'night', window}` and `debug.deal` with onub ids (consumed by `startOnubMatch`); the quick-mode message flow; plates found by `Prop.of` | W's `onub.spec.ts` and `--mode onub` are opt-in and run at integration |
| S -> V, W | `lobby.settings`, `lobby.addNpc`, `lobby.removeNpc {}` accepted; `Settings.npcSeats` and `npcDifficulty` written; `debug.npc` | V tests on its mock; W's `npc.spec.ts` is opt-in |
| V -> W | the frozen hooks `mode-toggle`, `mode-chip`, `add-npc` | W's specs are opt-in and run at integration |
| T -> U | the router starts `Meeting` on `meetingStart` from `World` or `Loft` alike; in the mocks `meetingRequest {reason: 'dawn'}` is the quick-mode signal, and V's `mock.ts` passes it through unchanged | nothing to stub: U's scene is started as today |
| X -> T | manifest keys `prop_plate`, `prop_deadLoaf`, `prop_ledger`, `prop_wakeTable`, `prop_oven`, `prop_basin`, `prop_flour_sacks`; `loft_backdrop`, `prop_bedroll`, `prop_bedroll_self` as `type: image` entries; static props stay content, the feed overlays plates, dead loaves and the ledger | T draws a labelled greybox for a missing key and the mockup's CSS bedrolls for a missing image |
| Y -> T, U, V | `docs/UI.md` 14.12 and 14.13 ids and lines; audio files for the pre-seeded keys `storm`, `creak`, `loaf_crack` | the sessions use the GDD 3.11 wording under ids of the 14.x shape and rename when Y lands; audio is silent until the manifest lists a key |
| V -> T, U | `LobbySnapshot.settings` | not needed by T or U: both read `state.settings.mode` through their own feeds |

### Clarifications recorded before the round (DECISIONS A39)

- The loft is a pseudo-scene (`LOFT_SCENE_INDEX` 255), never a sixteenth content scene; sleepers get
  no SceneState and no presence, every public `sceneId` reads 255 from night start until the lobby
  reset, and a loft player is refused every portal, hold and verb.
- Quick mode never leaves the bakery: `beginOnubPlay` places every seat at the `door` spawn,
  `placeNewPlayers` places nobody, and every portal is refused 425.
- Plates are the frozen `bk.plate_<slot>` props, slot = the seat's index in the deal order, owner in
  `Prop.of`; `Prop.turned` stays false in V1; the dawn traces list every window the night ran, so they
  are cosmetic.
- Every quick-mode act, the dusk plate set included, is one `act.ability` after a client-side hold;
  the server validates once (phase, window, actor, reach, target).
- `Private.role` is the dealt role all match (no `Private.dealtRole`); `cabalMates` is the Poisoner
  pair only; final roles, the loaves and the swap log are room memory until the reveal and the end
  screen.
- The dawn vote has no Skip and no self-vote, abstentions are allowed and named in
  `voteResult.abstained`, ties turn out everyone at the top when the count reaches
  `minVotesToTurnOut`; the turned-out are marked dead without a `killed` message; `winner` is one
  `Winner`, `gameOver.onub` carries the rest; the winners table is judged on final loaves.
- NPC seats are ordinary `Player` rows with session-shaped ids, connected, ready in the lobby and
  readied at a human pace on the role card, named from the server-only pool, never the leader; humans
  are counted by `room.clients`; the fill happens at Start, "Add NPC" in the lobby;
  `Settings.npcSeats` publishes a count only and `lobby.removeNpc` names no seat.
- `runNpcs` writes inputs and calls the verbs directly inside the step; its numbers are the
  `balance.json` `npc` rows. In quick mode the Conductor wakes NPC seats like humans and plans their
  acts.
- Frozen e2e hooks: `mode-chip`, `mode-toggle`, `add-npc`, `remove-npc`, `npc-difficulty`, `loft`,
  `bedroll-<id>`, `night-wake`, `claim-<roleId>`, `swaplog`, `gameover-final-<id>`; `vote-skip` is
  absent in quick mode.
- Reserved DECISIONS rows: R A40, S A41, T A42, U A43, V A44, W A45, X A46, Y A47.

### Round 4 log: R (quick mode, server)

**Landed** (branch `claude/m3b-server`, DECISIONS A40): the pure rules `dealOnub`, `nightScript`,
`applyNightAct`, `resolveDawn` and `onubWinners` (`packages/shared/src/rules/onub.ts`, property tests in
`packages/shared/test/onub.test.ts` and against the real content in `apps/server/test/onubRules.test.ts`);
the deal and role cards, dusk with plate-setting, the acts and the NPC plans (`sim/Onub.ts`); the night
Conductor, `runOnubPhases` and the quick-mode `debug.clock` (`sim/Conductor.ts`, `sim/Phases.ts`); the dawn
meeting, the vote without Skip, the plural reveal and claims (`sim/Meeting.ts`); the winners, `gameOver.onub`
and the match log (`sim/Win.ts`, `services/MatchLog.ts`). Server tests: `onubDeal`, `onubNight`, `onubMeeting`,
`onubNpc` (helpers in `onubHelpers.ts`); the main-mode suites pass unchanged. GDD 3.11 and ARCHITECTURE 5.14
carry the "(M3b)" sentences and the module map.

**For the next session and the orchestrator**
- This PR is far over 400 lines (about 1000 lines of source, the rest tests) because the deal, the Conductor,
  the meeting branch and the end screen only make sense together; the rules commit stands alone if it needs
  splitting at review.
- `onubWinners` takes the winners table as a fifth argument (`@wdi/shared` cannot import `@wdi/content`); callers
  pass `onubBalance.winners`.
- S: `isNpcSeat` is the only NPC test the Conductor makes. It wakes NPC seats at the `door` spawn, calls
  `planNpcAct`, and applies the plan itself at the window's end; `onubNpcPlan(room, id)` returns it while the
  window is open and the seat has not acted. `onubNpcPlan` returns `{abilityId, targetId, targetId2?}`; the brain
  sends it through `handleOnubAbility` (reach is checked, so it must walk there: one pick within 2 tiles for a
  two-pick act). `onubNpcPlan` is null when the draw chose nothing. `onubNpc.test.ts` stubs `isNpcSeat` with
  `vi.mock`; replace the stub by a real NPC seat once S has merged. A quick-mode Start with fewer than
  `players.min` seats is refused 422 until S's fill exists.
- T, U, W: a sleeper's `act.hold` and `act.reportBody` answer 422, only the portal answers 425 (the pre-seeded
  guards; the brief said 425). The hold time of an act is the client's: the server validates once.
- The night's `phaseEndsTick` is the nominal total; the dawn starts when the Conductor finishes, so a client
  clock must not assume the two agree after a `debug.clock {window}` jump.

**Not done**: nothing in the brief is open. The Gamekeeper hop and the Pallbearers stay V1.1 (`onubBalance.winners`
needs no change).

### Round 4 log: S (NPC fill, server)

Landed: NPC seats (`newSeat`, `addNpcSeat`, fill at Start, `lobby.addNpc/removeNpc/settings`, a human takes the
newest NPC seat), the `runNpcs` brain (`sim/npc/*`: role-card ready delay, wander with path-followed portal
headings, reports, suspicion votes, Killer strike and flee, quick-mode plate and night-act branches), `debug.npc`,
shared decision helpers in `rules/npc.ts`, GDD 3.12 (M3c), ARCHITECTURE 5.3/5.4 and DECISIONS A41.

For the next session: the quick-mode branches (`sim/npc/onub.ts`) idle until R's `plateOf` and `onubNpcPlan`
return values; the two promised post-R tests (1 human + 3 NPCs through the Conductor, a human Poisoner seeing an NPC
partner) are not written, merge R and add them. `test/npcSlow.test.ts` (`WDI_SLOW=1`) has never been run: the
Killer-wins-one-of-five test depends on the wandering NPC finding a lone human and may need tuning. `Win.ts`
(not mine) hands the lead to the first player after a reset if the leader left; `resetNpcsForLobby` corrects it.
No contract was missing from the base branch.

### Round 4 log: T

Quick mode, client world (`claude/m3b-world`). **What landed:** the router starts the `Loft` on
`nightSleep`, the bakery `World` on `nightWake` (no `sceneEnter` comes with a wake, so the router starts
it at the message's `spawn`) or on a bakery `sceneEnter`, and stops the loft on a meeting, the game over
and the lobby return; the feeds carry `nightWake`, `nightReveal`, `nightSleep`, `props()`, `mates()`,
`nightReveal()`, `mode()`, `wake()` (new, A42) and `ability(id, targetId?, targetId2?)`; the loft
(`scenes/Loft.ts`, `view/LoftView.ts`: bedrolls, manifest backdrop and bedroll images with the CSS
fallback, `storm` loop, unlabelled `creak` cues, no HUD, `InputController.stop()`); the bakery (`PropView`
draws plates only for listed seats with the owner's name, `view/quickMode.ts` picks the act a window
offers where, the plate and act holds draw the collect ring and send one `act.ability`, the window banner
`night-wake`, `night-reveal` lines and toasts, the partner's red nameplate, dawn in `Lighting`); the copy
deck of UI 14.1 to 14.5 and 14.8 in `ui/copy/world.ts` and every literal of `World`, `Hud`,
`NotebookPanel` and `TouchControls` replaced; the `InputController` timer stops between screens and
`start()` is idempotent; `?mode=onub` makes the world mock play dusk, a window (`&window=<role>`,
`&speed=N`), a reveal, the loft and the dawn `meetingRequest`; `world.spec.ts` covers the plate prompt and
the whole loft cycle in the mock. **Next session or the orchestrator:** (1) the whole client was built
against the pre-seeded contracts and the mock only; nothing here has run against R's server, so at
integration run `?mode=onub` against it and check that a `nightWake` really arrives without a
`sceneEnter` (the router depends on it) and that `Private.cabalMates` is empty outside the Poisoners. (2)
The quick-mode copy ids (`prompt.act.onub.*`, `quick.*`, `loft.*`) are stand-ins: when Y's UI.md 14.12
lands, change the strings in `ui/copy/world.ts`. (3) The loft cues use `Math.random` and the manifest
keys `loft_backdrop`, `prop_bedroll`, `prop_bedroll_self`; until X ships them the CSS bedrolls show. (4)
Not done: the `prompt.ability` lines (14.2) and `ghost.secret`/`ghost.roles` (no round-4 screen shows
them), the `prop_wakeTable` greybox (deliberately blank, the plates stand on it), and a real-server e2e
(W's `onub.spec.ts` is opt-in). (5) The PR is larger than 400 lines (about 1.2k added, over half of it
tests, the mock and the copy deck); the commits are split by layer.

### Round 4 log: U

**Landed** (branch `claude/m3b-meeting`, one PR): the meeting feeds (`mode()`, `claims()`, `traces()`,
`claim()` on `MeetingFeed`, `ColyseusMeetingFeed` and `MockMeetingFeed`); the dawn meeting in
`ui/Meeting.ts` (dawn reason line, traces and claims in the report tab, `vote-skip` hidden and the own
portrait disabled when `mode() === 'onub'`, the claim strip with `claim-<roleId>`, `claim-target`,
`claim-saw`, `claim-post`, "Claimed: <role>" under each portrait as `claimed-<id>`, a stamp on every
seat in `outs`, the plural reveal line and `reveal-abstained`); the quick-mode end screen in
`ui/GameOver.ts` (dealt and final role per seat, `gameover-final-<id>`, the dead's loaves, `swaplog`,
the vote lines, `is-winner` rows, "You won" and "You lost" tags); the `stamp` sound on the `REG_AUDIO`
bus in `scenes/Meeting.ts`; `RoleCard.ts` reading `balance.phases.roleRevealS`, or `timers.roleCardS` for
a card whose `beware` is `onubRoles.cardLine`, and naming quick-mode roles through `roles.onub.json`
(`roleTitle(id, mode)`, `factionOf(id, mode)`); the copy deck in `ui/copy/meeting.ts` with every literal
of `Meeting.ts`, `GameOver.ts` and `meetingText.ts` replaced; the `dawn` mock in `meetingMock.ts`
(traces, claims, no Skip, a two-seat tie, an abstainer, a `gameOver` with `onub` and `plates`);
`meeting.spec.ts` gained the dawn case and follows the deck's reveal wording; DECISIONS A43; UI.md 11
and 12; "Round 4 (U)" rules at the end of `components.css`.

**For the orchestrator and the next session**
- Y's UI.md 14.12 ids: `meeting.claim.*`, `reveal.outs*`, `reveal.abstained`, `over.swap.*`,
  `over.votes.*`, `over.row.arrow` and `over.winner.mark` in `copy/meeting.ts` carry GDD 3.11 wording and
  are renamed when 14.12 lands. Adopting the deck changed three existing lines (A43).
- The swap log names no actor, so the end screen finds the actor's plate through `onub.dealt`
  (A43). If R's `swapLog.slots` for `onub.take` or `onub.swapDead` ever drops the actor's own plate, the
  sentence falls back to the first plate slot; check once at integration with a real quick-mode match.
- To check against R's branch: `voteResult.roles` carries the final roles of `outs` only, as the
  contract says; `MeetingState.claims` rows with an empty `targetId` or `sawRoleId` read as absent.
- The vote ends early only when every connected living seat voted (R); the mock's abstainer shortcut
  is mock-only (A43).
- The `stamp` key is silent until `audio/manifest.json` lists it (Y).
- Not done: nothing in the brief. The real-server paths (`ColyseusMeetingFeed` reading
  `state.settings.mode`, `meeting.claims`, `meeting.traces`) are covered by typecheck only; W's
  `onub.spec.ts` exercises them at integration.

### Round 4 log: V (lobby, settings, network edge)

Branch `claude/m3c-lobby`. What landed: `LobbySnapshot.settings` kept in sync from `state.settings`
(`listen('settings')` plus `onChange`), `setMode`, `setNpcDifficulty`, `addNpc`, `removeNpc` on both
`NetworkService` implementations; the lobby settings block with the frozen hooks `mode-chip`,
`mode-toggle`, `add-npc`, `remove-npc`, `npc-difficulty` (`ui/Lobby.ts`, `scenes/Lobby.ts`); the mock
handles the four messages (`MockNetwork(mode)` starts in quick mode with `?mode=onub`, NPC names from
`MOCK_NPC_NAMES`); `ui/copy/lobby.ts` carries every literal of `Landing.ts` and `Lobby.ts`; the HUD
anchors carry the safe area and the `hud.css` override block is deleted; DECISIONS A44; UI.md 6.
Tests: `net/mock.test.ts`, `ui/Lobby.test.ts`, two cases in `NetworkService.test.ts`, a mock e2e case
in `party.spec.ts` (toggle, add, remove).

For the orchestrator: the copy ids are mine until Y's UI.md 14.13 lands (`lobby.mode.*`, `lobby.npc.*`
and `lobby.hint.fill`); rename them in `ui/copy/lobby.ts` then. The e2e needs `pnpm --filter
@wdi/content build` first on a fresh checkout. Not done: the real-server path of the settings
messages is untested end to end until S lands (the unit test covers the messages sent and the state
read); `npc-difficulty` shows the default level until the server publishes `npcDifficulty`.

### Round 4 log: W (bots, e2e, soak, CI)

PR `claude/r4-bots`. **Landed.** The bot brain plays both modes (`tools/bots/walk.ts`, pure choices in
the new `quick.ts`): in quick mode a bot sets its own plate at dusk, sends no input between `nightSleep`
and `nightWake`, acts once in its window, claims (`claims`) and votes `other`; `WalkerStats` gained
`wakes`, `acts`, `claims` and `nightLeaks`. `swarm.ts` exposes `settings`, `addNpc()` and `removeNpc()`.
`soak.ts --mode onub` and `live.ts --mode onub` exist; `.github/workflows/soak.yml` runs both modes on
`workflow_dispatch` and weekly. `onub.spec.ts` (`WDI_E2E_ONUB=1`) and `npc.spec.ts` (`WDI_E2E_NPC=1`) are
in. CI has `timeout-minutes: 15`. `tools/grid` has a test that the bakery's plates, dead loaves and ledger
are within act range of the `door` spawn. ARCHITECTURE 5.12 and the ROADMAP 7.5 Bot-only row are updated;
the root `package.json` has `bots:soak:onub`, `bots:live:onub` and `e2e`.

**The 30-minute soak (follow-up 7), main mode, built server, this container:** `pnpm bots:soak` passed.
Worst tick p95 **0.303 ms** (limit 15 ms; typically 0.17 to 0.30 ms), 6 matches, 24 kills, 7 reports, 7
meetings, 0 presence leaks, 0 protocol errors, 0 dropped bots. The quick-mode soak could not run: on the
base branch `startOnubMatch` still throws.

**Checked here:** lint, typecheck and the unit suites are clean; `CI=1 pnpm --filter @wdi/client
test:e2e` passes (15, with the 6 opt-in specs skipped); `WDI_E2E_MATCH=1` `match.spec.ts` passes (2) with
the changed brain; main-mode `bots:live` and a 1-minute `bots:soak` pass. The quick-mode brain is
covered by a scripted-room suite (`tools/bots/test/quickBrain.test.ts`) and a pure-choice suite
(`quick.test.ts`), not by a real server.

**For the orchestrator at integration.**
- Run, in this order, with R, S, V, T and U merged: `pnpm bots:live:onub -- --url ...`, a 2-minute
  `pnpm bots:soak:onub -- --minutes 2`, then `WDI_E2E_ONUB=1 WDI_E2E_NPC=1 CI=1 pnpm --filter @wdi/client
  test:e2e`, then the 30-minute quick-mode soak (`soak.yml` or `pnpm bots:soak:onub`). None of these has
  run against a real quick-mode server.
- What the bots and specs assume of the other sessions (a mismatch shows up as a leak or a timeout, not as a
  bot bug): the bakery `props` reach the bot at dusk (`Prop.of` set, `bk.plate_<slot>` ids); a window act
  needs the bot within `actRangeTiles` of its targets (the bot stops at 0.9 of it, standing between a pair
  for `picks: 2`) and only needs `holdS` of waiting, with no client-side hold message; a sleeper's `scenes`
  map is empty and its roster has no presence from `nightSleep` to `nightWake` (the bot allows 1.5 s of
  patch lag before it counts a leak); a waker's `sceneEnter` is followed by a `nightWake` for the same role
  as `roleReveal.roleId`; `meeting.vote` with another seat's id is accepted in the discussion phase;
  `meeting.claim` accepts `{roleId}` and `{roleId, targetId, sawRoleId}`.
- `onub.spec.ts` deals the host `cutpurse` and the guest `mourner` through `debug.deal` and ends the night
  with `debug.clock {phase: 'dawn'}` after the host's window. `npc.spec.ts` needs `debug.npc {walk:
  false}` to keep parked NPCs on their spawns after the first kill and report (it re-sends `debug.clock
  {phase: 'day', clearCooldowns: true}` after the meeting); if S's park does not survive a meeting, the
  third kill in the first case needs a retry. The first case ends the match by three kills (the watcher
  bot, then two NPCs), because NPCs vote Skip without Verified clues, so a vote cannot end it.
- `swarm.addNpc()` and `removeNpc()` send from the first bot, which is not the leader in the specs; the
  specs use the host page's buttons instead. They are there for a swarm whose first bot creates the room.
- The CI server job is not split: the server suite is 2m40s here and the whole `pnpm test` 2m45s, under
  the 4-minute trigger. R and S add suites; if a run passes 4 minutes, move `pnpm --filter @wdi/server test`
  into its own job in `ci.yml`.

**Not done.** No DECISIONS row A45 (the session's paths do not include `docs/DECISIONS.md`, and nothing
here changed a decision). No quick-mode soak or e2e results, for the reason above. Playwright is not in
CI (as before this round: it needs a Chromium and a built client); the specs run in the cloud image, where
`PLAYWRIGHT_BROWSERS_PATH` is set.

### Round 4 log: X (art)

Done on `claude/r4-art`. Blender runs headless as the `bpy` 5.2.0 wheel with Mesa EGL, as in round 3;
the existing props and clues re-render byte-identical. No Higgsfield or kit asset, so everything new is
CC BY 4.0 hand-made art (DECISIONS A46).

- **Manifest keys for T** (the X -> T seam): the `props` atlas now holds `prop_wakeTable`, `prop_plate`,
  `prop_deadLoaf`, `prop_ledger`, `prop_oven`, `prop_basin`, `prop_flour_sacks` beside the six square
  props (one 1024 x 512 page); `loft_backdrop`, `prop_bedroll`, `prop_bedroll_self` are `type: image`
  entries under `loft/`. Both manifests carry every key.
- **Placing the bakery props (T)**: put each sprite at its tile centre and keep the frame's own pivot
  (do not `setOrigin(0.5, 1)` as `PropView` does for the square): the Wake Table's pivot is
  `bk.wake_table`'s tile, its back row's middle, and the table covers x 6-10, y 4-5; a plate's pivot is
  33 px below the plate so it sits on the table's top; three `prop_deadLoaf` at x 3, y 1-3 form the
  oven ledge. Draw plates above the table where they share its depth (row 4). A check composite of
  all bakery props at their `bakery.json` tiles lined up on the 64 px grid.
- **Loft (T)**: `loft_backdrop` is 1280 x 720 and opaque, for `background-size: cover` behind
  `.wdi-loft` (its centre is dark and empty); the bedrolls are 112 x 184, twice the mockup's 56 x 92
  `.wdi-bedroll__blanket`, transparent, for `background-size: contain`; the self roll differs only by
  moon stripes, so keep the CSS glow.
- **Placeholder manifest** (follow-up 4): `?art=placeholder` gains `props`, `vfx` with `anims_vfx`
  and the three loft images, as unlabelled greybox marks on the real cells and pivots.
- **Stand-ins**: the four `bld_*_ext` exteriors (`buildings/`) and the six `tiles_*` sets (`tiles/`) are
  rendered from code (`build_buildings.py`, `build_tiles.py`); the real manifest no longer points into
  `placeholder/`. The client draws neither yet.
- **Rebuild**: `python tools/blender/build_props.py -- --out build/render` then `pack:static` for
  `props`; `build_loft.py`, `build_buildings.py`, `build_tiles.py`, then `pnpm --filter @wdi/sprites
  images ../../build/render ../../apps/client/public/assets`; `pnpm --filter @wdi/sprites placeholder`.
  Everything rebuilds byte-identical.
- **Owner**: copy `assets/external/bakery/bakery_props.blend` and `assets/external/loft/loft.blend`
  (built by `python tools/blender/save_masters.py -- --out assets/external`) to ROSW
  `studio/assets/who-did-it/world/{bakery,loft}/`; the studio notes are still to be written by the
  studio pipeline. A re-save changes the hash, so update `MANIFEST.md` from the copy you keep.
- **Not done**: the plate, dead-loaf and ledger states (cracked, turned, open) and the flour decal
  wait for V1.1 traces; UI art and audio were out of scope. `e2e/world.spec.ts` "kill -> body ->
  collect -> one Notebook entry" fails now and then under the full parallel run on the base manifest
  too (it passes alone every time); W owns the spec.

### Round 4 log: Y (content, copy, audio, playtest kit)

Session Y (content, copy, audio, playtest kit), branch `claude/r4-content`, PR #20.

- **Copy.** `docs/UI.md` 14.12 (quick mode) and 14.13 (NPC lobby) are in; T, U and V paste from them.
  U's provisional ids stay as `meeting.claim.*` and `reveal.outs.*`; the swap log is `over.swap.*`
  (not `gameover.swap.*`), the night reveal lines are `night.reveal.*`, the dusk prompt is
  `prompt.plate.set`. A dead loaf's reveal reads "A dead loaf: {role}" rather than the bare role
  name T's brief suggested. The 14.12 lines never use the parody title outside `lobby.mode.onub`, so
  the neutral label of GDD 3.11 is a one-line change.
- **Audio.** `storm` (loop), `creak` and `loaf_crack` ship in `audio/manifest.json`, all CC0 (OpenGameArt
  and two Kenney packs), with `CREDITS.md` rows and the licence copies in `LICENSES/vendors/`. The
  vendors table in `LICENSES/vendors/README.md` still reads "no" for Kenney and OpenGameArt; Y only
  added new licence texts, so the orchestrator or the owner ticks those rows. Freesound refused this
  container (403), which is why the storm comes from OpenGameArt.
- **Names.** Three names changed (Jack Tarr, Wally, Bert Hale); the test adds the register and cast
  rules. Validator and schema unchanged.
- **Docs.** GDD 2 step 3 wording: its practice line said "Cabal needs 3 kills", which disagrees with
  3.9 (at four seats the Cabal wins with one villager left, two deaths); the line now cites 3.9 and
  the copy deck instead of a number, and the settings panel names the mode chip and the NPC
  controls. WORLD.md bakery row and loft note; ROADMAP 7.5 rows `4-6 humans` and `1-3 humans`.
- **Playtest kit.** README 8 (quick-mode evening) and 9 (NPC session), SCORECARD 6 and 7, FORM items
  9 and 10 with item 1's quick-mode options, a TEMPLATE note.
- **Not done.** DECISIONS row A47 is reserved for Y but `docs/DECISIONS.md` is not in Y's paths; Y's
  decisions are the ones listed here, for the orchestrator to record. No wording fix was needed in
  the frozen 3.11 card texts or `roles.onub.json`.

## Integration log, round 4 (2026-10-17)

All eight sessions opened draft PRs (#19 to #26). The orchestrator merged them in the order R, S, T,
U, V, W, X, Y (`b3495d2`). Conflicts came only in the appended docs (`docs/DECISIONS.md`,
`docs/SESSIONS.md`, `CREDITS.md`, `docs/ROADMAP.md`, `docs/UI.md`, `docs/GDD.md`,
`docs/ARCHITECTURE.md`), and each was kept as a union. Lint, typecheck and every unit suite passed on
the merged tree (the server suite takes about 300 s now). The opt-in specs `onub.spec.ts` and
`npc.spec.ts` were written against mocks and had never run against a server, so their first real run
was at integration. Fixes made at integration (DECISIONS A48):

- **Integration commit 1.** Rows A45 (W) and A47 (Y) recorded, because neither session could write
  `docs/DECISIONS.md`. The Kenney and OpenGameArt rows of `LICENSES/vendors/README.md` ticked. Y's log
  heading moved to the session-log level.
- **Integration fix 2 (`a0850ba`), specs.**
  - `npc.spec.ts` reads row names with `textContent`, because CSS uppercases `innerText`.
  - It waits for `reveal-role` instead of a stamp, because an all-Skip vote stamps nobody.
  - It counts kills by bodies, because a kill stays secret until a meeting opens.
  - It waits for the report prompt before pressing E.
  - `onub.spec.ts` checks dusk by the bakery and its plate toast.
  - Both specs treat `vote-skip` as hidden (`toBeHidden()`), not removed.
  - Both accept several stamps on a tie (`.first()`).
- **Integration fix 2, client.** `World.watchPhase` raises the quick-mode dusk toast, which the
  entry toasts missed because the bakery `sceneEnter` arrives before the phase turns to dusk.
- **Result.** Both `npc.spec.ts` lobby cases pass. `onub.spec.ts` runs card, dusk, loft, a window,
  dawn claims, vote, game over and the lobby return, then fails its last check: 3 bot night leaks.
  The review below traced this to the bot monitor counting the sleeper's own presence
  (`tools/bots/walk.ts:373`), not to a server leak.
- **Review.** A five-dimension review (privacy, server seam, wire seam, client seam, conventions)
  found these on the merged tree:
  - one major privacy finding: the deal can be recovered from public traits and NPC names, all drawn
    from the 32-bit match seed;
  - the bots plan their night act before the bakery props arrive;
  - PropView overrides X's frame pivots;
  - the quick-mode match log drops vanished seats;
  - `debug.deal` across a mode change crashes the debug server;
  - two NPC tells: an early vote, and only NPC seats ready at the lobby return;
  - copy ids drifted between Y's UI.md 14.12 and the T, U and V modules.
  Round 5 takes them over; most quick-mode ones retire with the ONUB v2 rebuild.

Not run at integration: the `npc.spec.ts` quick-mode case, the quick-mode soaks, the 30-minute
soak, `WDI_SLOW=1`. On 2026-10-17 the owner asked for round 5 instead (below), which carries them.

### Follow-ups for round 5

1. Fix the review's findings above (round 5, Session 5I and the ONUB v2 sessions).
2. Close M3b and M3c: the quick-mode soak, the real-NPC-seat quick-mode server test, `WDI_SLOW=1`.
3. M3 exit (owner): three 5-player playtests with the scorecard, recorded in `docs/PLAYTESTS/`.
4. Art masters to the owner's ROSW checkout (rounds 3 and 4 items, owner).

## Round 5 (started 2026-10-17, after round 4 landed at a0850ba)

Thirteen sessions build **M5a, Living World** (GDD 3.1-3.3, 3.8, 3.9, 3.12, 3.13, 3.17; ROADMAP M5a) and
**ONUB v2** (GDD 3.11; ROADMAP ONUB v2), the owner's round-5 brief (`docs/round5/owner-brief.md`, quoted word
for word), plus the round-4 review findings (docs/SESSIONS.md "Integration log, round 4"). Round 6 (M5b:
resources and crafting, mobs, quests, the main-mode mini-games) builds on it. Same rules as rounds 1 to 4:
- draft PRs against `claude/zen-turing-m1jnw0`, under 400 lines where the work allows (split by step, each PR
  green);
- `pnpm lint && pnpm typecheck && pnpm test` clean before every push;
- pinned versions only, and no model identifiers in committed files;
- `docs/GDD.md` changes in the same PR as a behaviour change;
- numbers only in `docs/GDD.md` and `packages/content/data`.

Code and tooling run on Sonnet 5.5; art, content and maps run on Opus 5.5. The decisions of this round are
DECISIONS A49 (the owner's answers), A50 (the contract) and A51 (the quick-mode Start below the minimum); a
session never re-decides them.

**What changed for everyone.**
- **Public role looks (main mode).** Every seat walks the world as its card's character. Only the cover roles
  (Killer, Accomplice, Drifter) wear another card's look. CLAUDE.md's secrecy convention is rewritten for
  this.
- **Isometric presentation.** Both modes present isometrically on the client; the server stays cartesian
  (`docs/SPRITES.md` 10, the projection contract).
- **ONUB v2 replaces the round-4 quick mode.** The pre-seed cut the round-4 quick-mode code to compiling
  stubs. The lobby's mode toggle shows only with `?onub=1` until ONUB v2 lands at integration.
- **Independent random streams.** Every match stream is `sfc32` with four crypto words (`sim/seeds.ts`);
  nothing secret shares a stream with anything public, each NPC seat draws only from its own keyed streams,
  and `fixSeeds` lives only in `apps/server/test/seedHelpers.ts` (`deck-wire.md` 2.2).

**The contract documents** (`docs/round5/`) carry everything a session needs beyond this section:
- `seams.md`: every pre-seeded hook, its owner, its locked call site and its stub body;
- `onub-contract.md`: ONUB v2 wire, state, hooks, frozen hooks, copy ids, the compile cut;
- `deck-wire.md` and `deck-data.md`: the deck, covers, avatars and Impersonate;
- `world.md`: maps, scene fields, `MapSites.ts`, the new scenes; the projection, the tilemap and the lighting
  layer are `docs/SPRITES.md` 10;
- `npc.md`: routines and tests;
- `art-plan.md`: style, asset lists, keys, routes, Higgsfield prompt templates;
- `owner-brief.md` and `art-index.md`.

Read your brief below, then `seams.md`, then the sections of those documents it names. The docs already carry
the round's rules (GDD 3.11 replaced, the "(M5a)" sentences of 3.1-3.3, 3.8, 3.9, 3.12, 3.13 and 3.17, SPRITES
10, WORLD 4, ARCHITECTURE 5.4 and 5.14, ASSETS 6.11): a session edits them only where what it builds differs,
in the same PR.

**Round-4 findings and follow-ups.** The pre-seed fixed the deal stream, the cross-mode `debug.deal` crash and
the vanished count; the quick-mode findings retire with ONUB v2 (`onub-contract.md` 9). PropView's pivots go
to 5I, the two NPC tells and `WDI_SLOW=1` to 5H, the lobby copy ids to 5C (bug #126), the quick-mode soak and
the real NPC seat through quick mode to 5E. Follow-ups 3 (the owner's M3 playtests) and 4 (the art masters)
stay the owner's.

**Pre-seeded on the base branch** (265bda9 and the A50 contract commit on top of it), additively: nothing the
code at 265bda9 reads was removed or made required. `seams.md` lists every hook with its owner, its locked
call site and its stub body. In short: the ONUB v2 contract and the compile cut of the round-4 quick mode
(`onub-contract.md` 2-5, 9 and 13); the streams (`sfc32` in `rules/prng.ts`, `MatchSeeds.get(name, key?)` in
`sim/seeds.ts`, `PartyRoom.fixedSeeds` with `fixSeeds` in the test helper, `prepStreams(room)` in
`sim/onub/Prep.ts`); the wire, content and server and client hooks of the deck, looks, covers, avatars and
Impersonate (`deck-wire.md` 1-3 and 8, `deck-data.md`), with `Private.sceneId` beside `Player.sceneId` and
`SceneState.avatars` still empty; the scene fields, `maps/hollowmere.json`, `@wdi/shared/iso`,
`sim/MapSites.ts` with every map site routed through it, the `map` lobby setting and the empty
`ui/lobby/MapPicker.ts` (`world.md` 1 and 9.1); `routines.json`, the `balance.json` `npc` rows and
`AnimId.interact` (`npc.md` 1-6); and the art code and data (`style.json` with `pixelFinish`, `palette.json`
`world`, `tools/sprites/{oklab,palette,pixel,refs}.ts`, `LEGACY`, the replaced `manifest.test.ts`, the package
scripts and the placeholder split: `placeholder.ts` and `placeholder-kit.ts` core, one
`placeholder-{world,chars,onub}.ts` module per art session; `art-plan.md` 1.2 and 9).

**Nobody edits** `packages/shared/src/**` except the rule bodies a brief names (`rules/onub.ts` 5A,
`rules/onubNight.ts` 5B, `rules/deck.ts` `coverHints` 5F and `dealDeck` 5G), `packages/content/src/**` and the
content data except the lines a brief names,
`apps/server/src/sim/{seeds,Flow,Step,Death,Kill,Movement,RoomSim,constants}.ts`, `sim/onub/state.ts`,
`apps/server/test/{simHelpers,killHelpers,seedHelpers}.ts`, the pre-seeded call sites in
`rooms/handlers/lobby.ts`, `rooms/PartyRoom.ts`,
`sim/{Actions,Clues,Meeting,Phases,Portals,Visibility,Win,Npc}.ts` and `sim/npc/{world,walk}.ts` (the other
lines of those files belong to the owners in the table), the client contract files
(`net/{onub,onubRouter,meeting,meetingColyseus,protocol,NetworkService,mock}.ts`,
`net/mock/{onubMock,meetingMock}.ts`, `view/animIds.ts` and every pre-seeded mount line in
`ui/{Lobby,Meeting,GameOver}.ts` and `view/Hud.ts`),
`tools/sprites/{placeholder,placeholder-kit,oklab,palette,pixel,refs}.ts`,
`tools/sprites/test/manifest.test.ts` and `eslint.config.js`. A session that needs another contract writes it
in its PR description and carries on with a local stand-in; the orchestrator adds it to the base branch. The
exceptions are the contract phases of 5F and 5G (`deck-wire.md` 10): each is one commit in the session's last
PR, edits only the files its table lists (other sessions' files included; they keep the edit when they merge
the base branch), and leaves the locked ONUB mock (`onubMockRoleCard`) typechecking.

| Session | Model | Track | Branch | Owns |
|---|---|---|---|---|
| **5A. ONUB v2 rules, server deal and prep** | Sonnet 5.5 | Code | `claude/r5-onub-rules` | `rules/onub.ts` bodies; `sim/Onub.ts`, `sim/onub/Prep.ts`; their tests |
| **5B. ONUB v2 server night and morning** | Sonnet 5.5 | Code | `claude/r5-onub-night` | `rules/onubNight.ts` bodies; `sim/Conductor.ts`, `sim/onub/Acts.ts`; the quick branches of `Meeting.ts` and `Win.ts`; their tests |
| **5C. ONUB v2 client prep, mini-games, deck editor** | Sonnet 5.5 | Code | `claude/r5-onub-prep-ui` | `scenes/Kitchen.ts`, `view/onub/` prep views and the four mini-games, `ui/lobby/DeckEditor.ts`, `onubPrepMock.ts`, bug #126 |
| **5D. ONUB v2 client night, morning and results** | Sonnet 5.5 | Code | `claude/r5-onub-night-ui` | `scenes/Night.ts`, `view/onub/` night views, `ui/onub/**`, `net/onubColyseus.ts`, `onubNightMock.ts`, the quick paths of `ui/Meeting.ts` and `ui/GameOver.ts` |
| **5E. ONUB v2 bots, NPC brains, e2e and soak** | Sonnet 5.5 | Code | `claude/r5-onub-bots` | `sim/npc/onub.ts`, the quick-mode bots, `onub.spec.ts`, the quick case of `npc.spec.ts`, the soaks |
| **5F. Avatars, public looks, covers, Impersonate** | Sonnet 5.5 | Code | `claude/r5-avatars` | `sim/{Avatars,Impersonate,Covers,Visibility}.ts`, `coverHints`, the world feed, `EntityView.ts`, `RoleCard.ts`, `SeatPicker.ts`; the wire contract phase |
| **5G. Main deck and Werewolf roles** | Sonnet 5.5 | Code | `claude/r5-deck` | `sim/{Deck,NightPowers,Hunger}.ts`, `dealDeck`, `Phases.ts` main lines, Knife and Bell phases, `ui/main/**`; the deck contract phase |
| **5H. NPC routines and fixes** | Sonnet 5.5 | Code | `claude/r5-npc` | `sim/Npc.ts`, `sim/npc/**` but `onub.ts`, the NPC tests, the CI split |
| **5I. Isometric client and lighting** | Sonnet 5.5 | Code | `claude/r5-iso` | `view/**` but `EntityView.ts` and `view/onub/**`, `input/**`, `scenes/World.ts`, `world.spec.ts` |
| **5J. Maps** | Opus 5.5 | Maps | `claude/r5-maps` | `data/maps/**`, the new and changed scenes, `tools/grid/**`, `MapSites.ts` bodies, the map setting, `MapPicker.ts` |
| **5K. World art** | Opus 5.5 | Art | `claude/r5-world-art` | the 5K list of `art-plan.md` 1.1 (ground, kits, buildings, props, clues, thumbnails, ambience) |
| **5L. Character art** | Opus 5.5 | Art | `claude/r5-char-art` | the 5L list of `art-plan.md` 1.1 (IsoCam rig, looks, portraits, VFX, ability icons) |
| **5M. ONUB art** | Opus 5.5 | Art | `claude/r5-onub-art` | the 5M list of `art-plan.md` 1.1 (the owner's images, the Brick Oven, cards, portraits, `onub_mini`) |

Suggested merge order: 5A, 5B, 5F, 5G, 5H, 5J, 5I, 5C, 5D, 5E, 5K, 5L, 5M: rules and servers before the
clients that draw them, the wire (avatars, the deck) before the world that walks on it, and art last because
it swaps keys the code already loads as placeholders. Shared documents: edits stay inside the named section
with no renumbering or reflow, and the orchestrator keeps both sides of any conflict. Copy: the ONUB lines go
in `docs/UI.md` 14.12 (5C) and 14.14 (5D); a main-mode session that needs new lines adds a 14 subsection of
its own (5F 14.15, 5G 14.16, 5J 14.17) and a copy module of its own under `ui/copy/`. Theme: new rules are
appended at the end of `ui/theme/components.css` under a "Round 5 (5X)" comment, one block per session.
Decisions a session has to make go to `docs/DECISIONS.md` under its reserved row, which every session may fill
(5A A52, 5B A53, 5C A54, 5D A55, 5E A56, 5F A57, 5G A58, 5H A59, 5I A60, 5J A61, 5K A62, 5L A63, 5M A64;
integration A65). A second row takes the number plus 14 (A66 to A78, appended after A65, so it never meets the
integration row); nobody edits an older row. The orchestrator runs the opt-in e2e suites (`WDI_E2E_ONUB=1`,
`WDI_E2E_NPC=1`, `WDI_E2E_LOOKS=1`), `WDI_SLOW=1` and the 30-minute soaks of both modes at integration, and
takes the `?onub=1` gate off the mode toggle once ONUB v2 has merged.

### Briefs

Every brief names the session's paths, the sections it reads, its PR split, its tests and what it leaves
alone. Every session reads `docs/round5/seams.md` before writing code and records its round-5 log under its
reserved "Round 5 log" heading at the end of this section.

**5A. ONUB v2 rules, server deal and prep.** Fill the pure prep rules and run a quick match on the server from
Start through the role card, Evening Prep and the crime-scene board to the night. Everything stays behind
`isOnub(room)`, so the main mode is untouched. **Owns** `packages/shared/src/rules/onub.ts` (the bodies), new
`packages/shared/test/onubPrep.test.ts`, `apps/server/src/sim/Onub.ts` (the `handleOnubAbility` dispatcher
stays as pre-seeded), `apps/server/src/sim/onub/Prep.ts`, new
`apps/server/test/{onubDeal,onubPrep,onubContract}.test.ts` and `onubPrepHelpers.ts`, the GDD 3.11 sentences
marked "(5A)" in "Two cards each", "Decks", "Evening Prep" and "The crime scenes", and ARCHITECTURE 5.14 rows
"Rules (prep)" and "Server modules (deal, prep)". **Reads** `onub-contract.md` 1, 2.4, 4.1-4.6, 6 (O1-O3), 9,
10, 12 and 13; `deck-wire.md` 2.2; GDD 3.11; DECISIONS A51 (no below-minimum refusal: the only Start refusal
is the deck check). `beginOnubPlay` writes `LOFT_SCENE_INDEX` to both `Player.sceneId` and `Private.sceneId`;
Ready on the role card goes through 5F's `markCardReady` and `allCardReady`; `endPrep` makes the exact
`resolvePrep(..., prepStreams(room))` call written in its doc comment; `debug.deal` drops ids unknown to
`roles.onub.json`. **PRs**: (1) the rule bodies with `onubPrep.test.ts`; (2) the deal, the role card,
`onubDeckSetting` and `resetOnubForLobby` with `onubDeal.test.ts`; (3) `handlePrep`, `runPrep`, `endPrep` and
the prep reveal with `onubPrep.test.ts` and `onubContract.test.ts`, then the GDD and ARCHITECTURE lines.
**Tests**: the property tests of 2.4 and O1 to O3. **Not**: `rules/onubNight.ts`, `sim/Conductor.ts` and the
night (5B); the locked list of `onub-contract.md` 1. Before code, `seams.md`; log under "Round 5 log: 5A".

**5B. ONUB v2 server night and morning.** Fill the pure night rules (acts, wake view, vote, winners), then run
the night (the windows, the public narrator, the Iron Cloche, must-act timeouts), dawn, the Morning Rush with
structured claims, CRUST with the Pantry vote and Restaurant Shutdown, the reveal and game over. The night
moves nobody: every seat already sits in the loft. **Owns** `packages/shared/src/rules/onubNight.ts` (the
bodies), new `packages/shared/test/onubNight.test.ts`, `apps/server/src/sim/Conductor.ts`, new
`apps/server/src/sim/onub/Acts.ts`, the quick-mode branches of `apps/server/src/sim/Meeting.ts` (`openMeeting`
for `dawn`, `handleVote`, `startOnubReveal`, `endReveal`, `runMeeting`, `handleClaim`) and of
`apps/server/src/sim/Win.ts` (`endOnubMatch`, the quick lines of `resetToLobby`), new
`apps/server/test/{onubNight,onubMorning}.test.ts` and `onubNightHelpers.ts`, the GDD 3.11 sentences marked
"(5B)" in "The Baking Cycle", "The Iron Cloche", "Must and may", "Dawn and the Morning Rush", "The vote" and
"Reveal and game over", and ARCHITECTURE 5.14 rows "Rules (night, vote)", "Messages", "Privacy" and "Server
modules (night, morning)". **Reads** `onub-contract.md` 1, 2.5, 4.3-4.6, 6 (O4-O8), 9, 10, 12 and 13; GDD
3.11. The hand-off lines of `runOnubPhases` and its vanished count stay as pre-seeded; CRUST never ends before
`timers.crustCountdownS` and the Rush never ends early. **PRs**: (1) the `onubNight.ts` bodies with
`onubNight.test.ts` (shared); (2) the Conductor, `Acts.ts` and `onubClock` with the server
`onubNight.test.ts`; (3) the meeting, vote, reveal and `endOnubMatch` branches with `onubMorning.test.ts`,
then the docs. **Tests**: the cases of 2.5 and O4 to O8. **Not**: the main-mode lines of `Meeting.ts` and
`Win.ts` and the 5F and 5G hooks there; 5A's files. Before code, `seams.md`; log under "Round 5 log: 5B".

**5C. ONUB v2 client prep, mini-games, deck editor.** Build the client from the role card's end to the prep
reveal: the kitchen overview, the four station rooms with their mini-games, the hand and the commit, the
waiting panel and the crime-scene board; and the lobby deck editor. Fix bug #126 (the lobby copy ids and the
Start confirm's fill line). **Owns** `apps/client/src/scenes/Kitchen.ts` (pre-seeded empty),
`apps/client/src/view/onub/{PrepView,StationView,PilesView}.ts` and
`view/onub/minigames/{crates,pour,slide,stoke}.ts` with tests, `apps/client/src/ui/lobby/DeckEditor.ts` with
its test, `apps/client/src/net/mock/onubPrepMock.ts` with its test, new `apps/client/src/ui/copy/onubPrep.ts`,
the "Round 5 (5C)" block of `components.css`, new `apps/client/e2e/kitchen.spec.ts` (mock only,
`?mock=1&mode=onub`), for bug #126 only the lobby-chip and 14.13 ids in `ui/copy/lobby.ts` and the fill line
of `openDialog` in `ui/Lobby.ts`, and `docs/UI.md` 14.12 (replaced wholesale). **Reads** `onub-contract.md` 1
(bug #126), 2.2-2.4, 5, 6, 7, 8 and 10; GDD 3.11 "Decks", "Evening Prep" and "The crime scenes"; `art-plan.md`
5.4 and 5.7 (the kitchen quadrants, `onub_mini`). The mini-game result never reaches the wire; the Done
control appears after `timers.minigameAssistS`; until 5A lands, the editor uses a local stand-in of
`onubDeckProblem`. **PRs**: (1) the kitchen, the station room, the hand and the commit on the mock, with the
copy; (2) the crates and pour mini-games; (3) the slide and stoke mini-games; (4) `PilesView`, `DeckEditor`,
bug #126, `kitchen.spec.ts` and UI.md 14.12. **Tests**: one per mini-game (success, the assist, nothing sent
but `onub.prep`), the editor's five problem lines, the frozen hooks of `onub-contract.md` 7. **Not**: the
composer `onubMock.ts`, `net/onub.ts`, the mount hooks, any other line of `ui/Lobby.ts` or `ui/copy/lobby.ts`,
5D's half. Before code, `seams.md`; log under "Round 5 log: 5C".

**5D. ONUB v2 client night, morning and results.** Build everything from the night to game over: the
lights-out screen with the narrator, a waker's role scene with the card table and the Cloche, dawn, the
Morning Rush board and claim form, CRUST and its countdown, the reveal and the end screen with the act
timeline. Write the real `ColyseusOnubFeed`, which serves 5C's prep half too. **Owns**
`apps/client/src/scenes/Night.ts` (pre-seeded empty), `view/onub/{NightView,CardTableView,LightsOutView}.ts`
with tests, `ui/onub/{rush,claim,over,actlog}.ts` with tests, new `net/onubColyseus.ts` with its test,
`net/mock/onubNightMock.ts` with its test, new `ui/copy/onubNight.ts`, the "Round 5 (5D)" block of
`components.css` plus deleting the round-4 `.wdi-loft*`, `.wdi-bedroll*` and `.wdi-claims*` rules, deleting
`scenes/Loft.ts` and `view/LoftView.ts`, new `e2e/night.spec.ts` (mock only), the quick-mode paths of
`ui/Meeting.ts` and `ui/GameOver.ts`, and new `docs/UI.md` 14.14. **Reads** `onub-contract.md` 2.2, 2.3, 2.5,
5, 6 (O9 and the night audio), 7, 8, 9, 10 and 13; GDD 3.11 from "The Baking Cycle"; `art-plan.md` 5.5 and
5.6. The headline comes from the winners row and `loaf_crack` plays at the reveal (both round-4 bugs).
**PRs**: (1) the Night scene, lights-out and the narrator with `NightView.test.ts` (O9); (2) the card table,
the acts and the reveals; (3) the Rush, claims and CRUST; (4) the end screen, the act log, `onubColyseus.ts`,
`night.spec.ts`, the deletions and UI.md 14.14. **Tests**: O9, each view's unit tests on the mock, the frozen
hooks of 7. **Not**: the main-mode lines and 5G mounts of `ui/Meeting.ts` and `ui/GameOver.ts`;
`net/{meeting,meetingColyseus}.ts` and `meetingMock.ts`; 5C's half. Before code, `seams.md`; log under "Round
5 log: 5D".

**5E. ONUB v2 bots, NPC brains, e2e and soak.** Make NPC seats and bots play ONUB v2 without walking: prep
commits, night acts, claims and votes, each NPC from its own keyed streams. Rewrite the quick-mode e2e and run
the soaks, reporting the ruin rate per party size against the 20-30% target. **Owns**
`apps/server/src/sim/npc/onub.ts`, new `apps/server/test/onubNpc.test.ts`, the quick-mode parts of
`tools/bots/{quick,walk,soak,live}.ts` and `tools/bots/test/quick*.test.ts`, the main-mode reads of
`tools/bots/walk.ts` after 5F's contract phase (prey and Kill by avatar handle),
`apps/client/e2e/onub.spec.ts` (rewritten), the quick-mode case of `apps/client/e2e/npc.spec.ts`,
`.github/workflows/soak.yml`, the GDD 3.11 sentences marked "(5E)" in "NPC seats", and ARCHITECTURE 5.12 (the
quick-mode bot rows). **Reads** `onub-contract.md` 1, 4.3, 6, 7, 10, 11 and 12 (item 13, the NPC numbers);
`deck-wire.md` 2.2, 8.3 and 10.1. **PRs**: (1) the NPC planner (pure) and `runOnubNpc` with `onubNpc.test.ts`;
(2) the bot planner and its tests, the leak monitor (a sleeper never receives `nightWake` or `nightReveal`,
nobody receives a presence); (3) `onub.spec.ts`, the `npc.spec.ts` quick case and the soak report; (4) after
merging 5F's branch, the main-mode bot reads. **Tests**: a real NPC seat through a full quick match (bugs.md),
NPC ticks inside `commitS`, `actFrac`, `claimFrac` and `voteFrac`, the sabotage roll drawn by every NPC.
**Not**: 5A's and 5B's server files, `sim/Npc.ts` routing, the main-mode brain (5H). Before code, `seams.md`;
log under "Round 5 log: 5E".

**5F. Avatars, public looks, covers, Impersonate.** Put the secrecy model of A49 and A50 on the wire: other
seats walk as scene-scoped avatars under opaque handles, `Player.look` goes public in one tick when the card
closes, cover roles pick a look from their hints, Ready on the card is private in both modes, and Impersonate
changes the face only unseen. Then remove the public scene index and other seats' presence (contract phase).
**Owns** `apps/server/src/sim/{Avatars,Impersonate,Covers,Visibility}.ts`, the `coverHints` body in
`packages/shared/src/rules/deck.ts`, new `apps/server/test/{avatars,coverPick,impersonate}.test.ts` and the
updates of `visibility.test.ts` and `lobby.test.ts`; in `apps/client/src`: `net/{world,worldColyseus}.ts`,
`net/mock/worldMock.ts` and its test, `view/EntityView.ts` and its test, new `view/targets.ts` and its test,
`ui/RoleCard.ts` and its test, `ui/portrait.ts`, new `ui/SeatPicker.ts`, a new `ui/copy/` module, and in
`scenes/World.ts` (5I's) only the target of the Kill and Bandage prompts (`nearestAvatar`, which the pre-seed
could not land); new `apps/client/e2e/looks.spec.ts` (opt-in `WDI_E2E_LOOKS=1`); GDD 3.17 and the secrecy
sentence of 3.1; ARCHITECTURE 5.4 and 5.5 (the text of `deck-wire.md` 9, checked against what lands); UI.md
14.15. **Reads** `deck-wire.md` 1, 3, 4, 6, 7.1, 8 and 10.1; `deck-data.md` 6; GDD 3.1 and 3.17. **PRs**: (1)
`Avatars.ts` and the avatar views beside presence, with `avatars.test.ts`; (2) `Covers.ts` (the cover pick,
card-ready for both modes, `publishLooks`, the reset) and `coverHints`, with `coverPick.test.ts`; (3)
`Impersonate.ts` with `impersonate.test.ts`; (4) the client feed, `EntityView`, `targets.ts`, the World prompt
target, the role-card picker, `SeatPicker` and portraits by look; (5) the contract phase (`deck-wire.md` 10.1:
`Player.sceneId` and others' presence, with every file it lists) and `looks.spec.ts`. **Tests**:
`deck-wire.md` 7.1, each privacy invariant of 6 that is 5F's. **Not**: the locked call sites in `lobby.ts`,
`Meeting.ts`, `Win.ts`, `Step.ts`, `Death.ts` and `Kill.ts`; `Flow.ts`; 5G's `Deck`, `NightPowers` and
`Hunger`; the shared schema outside the contract-phase commit. Before code, `seams.md`; log under "Round 5
log: 5F".

**5G. Main deck and Werewolf roles.** Deal the public n+2 deck with professions, move the Knife to dusk, night
and the Final Night, and build Hunger, the Final Night, the four night roles (Vicar, Watchman, Herbalist,
Gamekeeper), Inherit and the Bell phases, so every match ends. Build the main-mode screens (the lobby deck
list, the HUD deck chip, portraits and the reveal line by look, the end screen, the shot toast), then remove
the roster deal (contract phase). **Owns** `apps/server/src/sim/{Deck,NightPowers,Hunger}.ts`, the main-mode
lines of `sim/Phases.ts` (the ONUB hand-off and the `isAiming` call stay), `isKillPhase` in `sim/World.ts` and
the phase check of `handleBell` in `sim/Actions.ts` (those lines only), the `dealDeck` body in
`packages/shared/src/rules/deck.ts`, new `apps/server/test/{nightPowers,lastShot,inherit}.test.ts` and the
update of `flow.test.ts`; `apps/client/src/ui/main/**`, a new `ui/copy/` module, the "Round 5 (5G)" block of
`components.css`; the rows of `roles.json`, `abilities.json`, `items.json` and `clues.json` (the pre-seed
landed them; 5G retunes); GDD 3.2, 3.3, 3.8, 3.9 and the deck paragraphs of 3.1; UI.md 14.16. **Reads**
`deck-wire.md` 2.1, 4.3, 4.4 (the deal), 5, 6, 7.2, 8 and 10.2; `deck-data.md` 1-5 and 7; `npc.md` 7 and 8
(the `Brain` draws, `npcVoteTarget`); GDD 3.1-3.3, 3.8, 3.9 and 3.17. **PRs**: (1) `dealMainDeck`, `dealDeck`
and `debug.deal`; (2) the Knife phases, the Bell, the clock and the Final Night in `Phases.ts`, with
`flow.test.ts`; (3) the night powers, protections and Nightshade with `nightPowers.test.ts`; (4) Last Shot,
Inherit and Hunger with their tests; (5) the `ui/main` screens; (6) the contract phase (`deck-wire.md` 10.2:
`rosters`, `standIn`, `assignRoles`, `rosterFor`, with every file it lists). **Tests**: `deck-wire.md` 7.2;
the soak gate (median match 12-18 min, at most a third reaching the Final Night). **Not**: the locked call
sites; `Flow.ts`; 5F's files and `ui/SeatPicker.ts` (5G plugs into it); `net/{meeting,meetingColyseus}.ts`,
`meetingMock.ts`; the quick paths of `ui/Meeting.ts` and `ui/GameOver.ts` (5D). Before code, `seams.md`; log
under "Round 5 log: 5G".

**5H. NPC routines and fixes.** Replace the endless wander with routines (travel, work, idle, stroll, react),
keep NPCs to lit scenes at night, and remove the two round-4 NPC tells (the early vote, the lobby-return
ready). Every NPC draws only from its own keyed streams, and the server suite moves to its own CI job.
**Owns** `apps/server/src/sim/Npc.ts`, `apps/server/src/sim/npc/{routine,world,walk,meeting,memory,seats}.ts`,
`apps/server/test/{npcHelpers,npcTells}.ts`, new `apps/server/test/{npcRoutine,npcTells,presence}.test.ts`,
`npc.test.ts`, `npcBrain.test.ts`, `npcSlow.test.ts`, `packages/content/test/routines.test.ts`, the main-mode
case of `apps/client/e2e/npc.spec.ts`, `.github/workflows/ci.yml` (the server suite in its own job), GDD 3.12
(main mode), and ARCHITECTURE 5.3 (the start flow's last sentence), 5.6 (the presence write) and 5.12 (the CI
line). **Reads** `npc.md` 1-8 and its tests part; `deck-wire.md` 2.2; GDD 3.12. The `quick` branch of
`runMeetingVotes` and `NpcMemory.rng` go; the NPC Killer sends the prey's avatar handle once 5F lands.
**PRs**: (1) the keyed streams, the `Brain` fields, the persona and `routine.ts`; (2) work, strolls and idles
with `npcRoutine.test.ts`; (3) reactions, the night and the placement idle; (4) the vote window,
`npcVoteTarget`, the lobby ready, `npcTells.test.ts` and `presence.test.ts`; (5) the CI split. **Tests**: the
tests part of `npc.md`; gates: a 2-minute main-mode soak with no presence leak and a meeting, `WDI_SLOW=1`,
and the `WDI_E2E_NPC=1` main case against 5F's merged branch. **Not**: `lobby.ts` (its calls are locked),
`Movement.ts`, `constants.ts`, `animIds.ts`, `routines.json`, `balance.json`, `sim/npc/onub.ts` (5E). Before
code, `seams.md`; log under "Round 5 log: 5H".

**5I. Isometric client and lighting.** Present the world isometrically on the client (projection, depth,
occlusion, input, camera, the vision ellipse) and add the darkness layer with data lights; the server stays
cartesian. Fix the round-4 client finding that survives the rebuild (PropView's frame pivots). **Owns**
`apps/client/src/view/**` except `EntityView.ts` (5F), `LoftView.ts` (5D deletes it), `view/onub/**` (5C, 5D)
and `animIds.ts`; `apps/client/src/input/**`; `apps/client/src/scenes/World.ts` (5F writes the Kill and
Bandage prompt target there); `apps/client/e2e/world.spec.ts`; GDD 3.13 from "Isometric presentation" to "Dark
scenes"; SPRITES 5 (loading notes, the manifest `modes` field) and 10 (only where what lands differs);
ARCHITECTURE 5.9 (one sentence on the isometric view). **Reads** SPRITES 10.1-10.11 and 10.13-10.15, and 5;
`world.md` 2 (`buildings`, `lights`, `dark`, `material`) and 9.2; `art-plan.md` 1.3 and 6; `npc.md` 4
(`AnimId.interact`). **PRs**: (1) the projection from `@wdi/shared/iso`, input (`keysToWorld`,
`stickToWorld`), the camera and zoom snapping; (2) depth and occlusion (slices, shells, deep cull, fade); (3)
the isometric tilemap reader with the greybox fallback of SPRITES 10.13; (4) the lighting layer, the darkness
ambient and lights by phase; (5) `screenDirOfYaw` and the `interact` pose in `PlayerView`, PropView's pivots,
the `modes` filter in `view/assets.ts`, `hungerPrints` in `ClueView`, and `world.spec.ts`. **Tests**: the 5I
rows of SPRITES 10.15; the 45 fps check of ROADMAP M5a at integration. **Not**: `EntityView.ts`; the server;
`tools/grid` (5J); art files. Before code, `seams.md`; log under "Round 5 log: 5I".

**5J. Maps.** Make Hollowmere a manifest map with the new Fenwood and Flooded Gallery, add Blackpine (logging
camp, woods, tin mine), let the leader choose the map in the lobby, and write the isometric tilemap exporter.
Every map has a forest and a dark cave, and no frozen id is renamed or reused. **Owns**
`packages/content/data/maps/**`; the new scenes `forest_deep`, `cave_gallery`, `bp_camp`, `bp_lodge`,
`bp_mill`, `bp_woods`, `bp_mine`, `bp_office`, `bp_smithy` and `bp_deep` (`packages/content/data/scenes/`)
with their navs, and the edits to the existing scenes that `world.md` 1 and 7 list; the appends to `SCENE_IDS`
(`schemas/scene.ts`) and `MAP_IDS` (`schemas/maps.ts`) and their imports in
`packages/content/src/{index,nav}.ts` (those lines only); a `routines.json` row for any new prop kind, in the
same PR; `packages/content/test/{scenes,world}.test.ts`; `tools/grid/**`; the bodies of
`apps/server/src/sim/MapSites.ts`, the map branch of `handleSettings` in `rooms/handlers/lobby.ts` and the
scene creation in `rooms/PartyRoom.ts`; `apps/server/test/mapSites.test.ts` and a lobby case for the map
setting; `apps/client/src/ui/lobby/MapPicker.ts` (frozen hook `map-select`) and a new `ui/copy/` module; GDD
3.13 from "Choosing a map" to "Biomes"; WORLD 4 (the maps and the new scenes); SPRITES 10.12 (exporter notes);
ARCHITECTURE 5.3 (the map setting); UI.md 14.17. **Reads** `world.md` 1-10; SPRITES 10.12, 10.13 and 10.15;
`npc.md` 8 (5J -> 5H); `art-plan.md` 6 (`thumb_<mapId>`, the themes); GDD 3.13. **PRs** as `world.md` 1: (1)
Hollowmere's forest, cave and door moves; (2, 3) Blackpine, split by data file; (4) the exporter; (5) the map
choice. A scene file is data: split by file rather than held under 400 lines. **Tests**: `world.md` 10 and the
exporter row of SPRITES 10.15; `pnpm grid:export --check` clean. **Not**: `npc/world.ts`, `npc/walk.ts`,
`Meeting.ts`, `Actions.ts`, `Portals.ts` and `Clues.ts` (they reach the map only through `MapSites.ts`);
`ui/Lobby.ts`, `net/protocol.ts`, `net/NetworkService.ts`, `net/mock.ts`. Before code, `seams.md`; log under
"Round 5 log: 5J".

**Art sessions (5K, 5L, 5M).** Each owns exactly its list in `art-plan.md` 1.1 and keeps the shared-file rules
there: its own block in both manifests, rows appended to `CREDITS.md`, `assets/source/MANIFEST.md` and
`LICENSES/vendors/README.md`, only its own lines of `tools/sprites/test/legacy.ts` removed, PR by PR.
`placeholder-kit.ts` is core and owned by no session. Generation uses the Higgsfield MCP tools on the owner's
account (`art-plan.md` 2: `balance`, one model chosen with `models_explore`, the `style.json` references
uploaded, a cost preflight in the first PR description, the committed batch file
`tools/sprites/batches/<session>.json`), within the generation cap of `art-plan.md` 2.7 (about 138 images, cap
160; a session that would pass its line by more than 25% stops and asks through its PR). Every shipped
generation gets a `CREDITS.md` "Generated" row with its generation id and the catalog id
`pending higgsfield-library-sync` (A49, `art-plan.md` 2.5). If the Higgsfield tools are not available in the
session, it writes the batch prompt files of `art-plan.md` 2.2 (every item with its template, subject,
references and key colour, `jobs` empty), finishes every route that needs no generation, and stops for the
orchestrator. Gates A, B and C and the Brick Oven pick go to the owner through the orchestrator (`art-plan.md`
7); an art PR whose gate is unanswered waits. The orchestrator writes the Gate A answer into `style.json`
`pixelFinish.enabled.main`; if it flips, 5K and 5L re-run their batch scripts (`art-plan.md` 1.8).

**5K. World art.** Make the isometric environment of both maps: ground sets, kits, sliced buildings, props,
spots, portals, clues, thumbnails and ambient loops, every one built so the pixel finish is one switch. Gate A
(the Hollowmere square with the finish on and off) goes to the owner with K2. **Owns** the 5K list of
`art-plan.md` 1.1 (the `tools/blender` static and kit scripts,
`tools/sprites/{pack-static,images,tileset,slice,review-world,placeholder-world}.ts` and their tests,
`apps/client/public/assets/{ground,kit,buildings,props,clues,thumbs}/**` with their placeholder twins, the
`amb_*` loops, the Kenney, KayKit and Poly Haven licence files, `batches/5K.json`, the review sheets), ASSETS
6.3 Buildings and environment and Props, and SPRITES 8. **Reads** `art-plan.md` 1, 2, 3, 6 and 7; SPRITES
10.3, 10.5 and 10.12-10.14; `world.md` 2 (`material`, `lights`) and 6-8; ASSETS 6.9 and 6.11. **PRs**: K1 to
K6 of `art-plan.md` 3.11; K1-K3 start before Gate A is answered and their art merges after it; K6 asserts
`LEGACY` empty and integrates after L4, L5 and M1. **Tests**: `art-plan.md` 1.7 and the 3.11 tests. **Not**:
code outside its list, 5L's and 5M's keys. Higgsfield: the paragraph above. Before code, `seams.md`; log under
"Round 5 log: 5K".

**5L. Character art.** Build the IsoCam rig and one character per look id of `looks.json` in 8 directions with
idle, walk, interact, swing and die, then the main-game portraits, `vfx_disguise` and the six new ability
icons. Gate B (the Baker's contact sheet and lineup beside `portrait_baker`) goes to the owner with L3.
**Owns** the 5L list of `art-plan.md` 1.1 (the rig and look scripts in `tools/blender`, `build_villager.py`
deleted, `tools/sprites/{keys,pack,gen-anims,contact,body-contact,lineup,placeholder-chars}.ts` and their
tests, `apps/client/public/assets/{chars,portraits,vfx,calibration}/**` with their placeholder twins, the
`icon_ability_*.svg` icons and their `icons.test.ts` rows, `batches/5L.json`, the review sheets), ASSETS 6.2
rig notes and 6.3 Characters and VFX, and SPRITES 1-4, 6 and 9. **Reads** `art-plan.md` 1, 2, 4, 6 and 7;
`deck-data.md` 6 and 9; SPRITES 1-4, 10.3 and 10.4; `npc.md` 4. **PRs**: L1 to L5 of `art-plan.md` 4.7, L1
(the rig) first, since every other render waits on it. **Tests**: `art-plan.md` 1.7, `palette.test.ts`,
`budget.test.ts`, `looks.test.ts`. **Not**: 5K's and 5M's keys; the client code that draws the keys (5F, 5I).
Higgsfield: the paragraph above. Before code, `seams.md`; log under "Round 5 log: 5L".

**5M. ONUB art.** Ingest and finish the owner's 13 ONUB images, generate the Brick Oven for the owner to pick,
and make the kitchen overview, the ingredient and location cards, the cloche, the ONUB portraits and the
mini-game atlas `onub_mini`. Gate C goes to the owner with M1. **Owns** the 5M list of `art-plan.md` 1.1
(`tools/sprites/{onub,onub-cards,onub-mini,placeholder-onub}.ts`, `onub-fixes.json`, `test/onub.test.ts`,
`batches/5M.json`, `apps/client/public/assets/onub/**` with its placeholder twin, the loft removal, the review
sheets), ASSETS 6.3 UI and role cards, and the new SPRITES 11. **Reads** `art-plan.md` 1, 2, 5, 6 and 7;
`onub-contract.md` 5.4; `art-index.md`; GDD 3.11. **PRs**: M1 to M4 of `art-plan.md` 5.9, the Gate C test
render first; every key carries `modes: ['onub']`. The merge of the room exports and their derivatives waits
on the owner's provenance answer for the 13 images (`art-plan.md` 7, item 1); the work does not. **Tests**:
`art-plan.md` 1.7 and the 5.9 assertions of `onub.test.ts`. **Not**: the bakery frames (5K moves them to
`props_hollowmere`), the client code (5C, 5D). Higgsfield: the paragraph above. Before code, `seams.md`; log
under "Round 5 log: 5M".

### Seams in round 5

The detailed seam tables are in the contract documents; this table names them and adds the seams between
tracks that none of them holds.

| Producer -> consumer | Contract | Until it lands |
|---|---|---|
| ONUB: 5A, 5B, 5C, 5D, 5E, 5F, 5M | `onub-contract.md` 10 | as that table says |
| Deck and avatars: 5F, 5G, 5H, 5A, 5B, 5D, 5E, 5I, 5L | `deck-wire.md` 8.3 | as that table says |
| NPC: 5H with 5F, 5G, 5J, 5E, 5I | `npc.md` 8 | as that table says |
| Art: 5K, 5L, 5M with 5I, 5J, 5F, 5G, 5C, 5D | `art-plan.md` 6 | as that table says |
| 5I -> 5F | `PlayerView` takes world-frame positions and yaw and projects them itself (`@wdi/shared/iso`, SPRITES 10.2 and 10.4), so `EntityView` stays in the world frame | the top-down drawing |
| 5F -> 5I | the Kill and Bandage prompts in `scenes/World.ts` send `nearestAvatar(...)` from `view/targets.ts`; 5F writes those lines in 5I's file, and 5I keeps them | the prompts send the seat id, which the pre-seeded `resolveHandle` accepts |
| 5J -> 5I | the isometric tilemaps of `tools/grid` (SPRITES 10.12); the map's art loaded per SPRITES 10.13 | the greybox of SPRITES 10.13 |
| 5G -> 5I | `ClueKind.hungerPrints` (9) clues, which 5I's `ClueView` draws with 5K's `clue_footprint_<s\|m\|t>_glow` | the footprint frame in its light tint |
| 5F, 5G -> later sessions | the contract-phase commits (`deck-wire.md` 10) edit files of 5H, 5E and others | each later session merges the base branch and keeps the edit |

### Round 5 log: 5A (ONUB v2 rules, server deal and prep)

Done 2026-10-18 on `claude/r5-onub-rules` (PR #27, three commits, one per brief step):
1. `rules/onub.ts` bodies and `packages/shared/test/onubPrep.test.ts` (unit cases and O2).
2. `startOnubMatch`, `beginOnubPlay`, `onubDeckSetting`, `onubDeckInPlay` and `onubRoleReveal` in `sim/Onub.ts`, with `test/onubDeal.test.ts` and `test/onubPrepHelpers.ts`.
3. `handlePrep`, `runPrep`, `endPrep` in `sim/onub/Prep.ts`, with `test/onubPrep.test.ts` and `test/onubContract.test.ts` (O1, O3), then the GDD, ARCHITECTURE 5.14 and DECISIONS A52 lines.

Notes for the next sessions: 5B finds `OnubState.dealt`, `.commits`, `.prep`, `.cards`, `.prepAuto` filled and `Phase.prepReveal` running for `prepRevealS`; `handleOnubAct` is still its stub. 5E can commit through `handleOnubAbility` with `onub.prep` as any seat id. No contract changes were needed. The GDD carried no "(5A)" markers, so the one sentence added (commit refusals, departed seats) ends with one.

### Round 5 log: 5B (ONUB v2 server night and morning)

**Branch** `claude/r5-onub-night`, one draft PR against `claude/zen-turing-m1jnw0` (the branch rule leaves one branch, so the three steps of the brief are three commits of one PR). **Done**: (1) `rules/onubNight.ts` bodies with `packages/shared/test/onubNight.test.ts` (48 tests over the real `balance.onub.json` and `roles.onub.json`); (2) `sim/Conductor.ts` (`enterNight`, `runConductor`, `onubClock`), `sim/onub/Acts.ts` (`handleOnubAct`, `onubWakeView`, `finalRoles`, the act log and reveals) with `apps/server/test/onubNight.test.ts` (29 tests: O4 to O8 and the acts, Cloche, must-acts and `debug.clock`) and `onubNightHelpers.ts`; (3) the quick branches of `Meeting.ts` (`handleVote` with the Pantry, `runMeeting`, `startOnubReveal`, `handleClaim`; `openMeeting` for `dawn` needed no change) and `Win.ts` (`endOnubMatch`; the quick lines of `resetToLobby` were already right) with `onubMorning.test.ts` (22 tests), the GDD 3.11 sentence on window length, ARCHITECTURE 5.14 rows "Rules (night, vote)", "Messages", "Privacy" and "Server modules (night, morning)", and DECISIONS A53.

**For the next sessions.** 5A: my tests build a match white-box at `Phase.prepReveal` (`createOnubState`, `tableAtNight`, `onubNightHelpers.ts`) and set `Player.alive = true` themselves; the real Start must do the same. `endOnubMatch` reads `o.commits`, `o.prepAuto`, `o.prep` and `o.cards` and degrades to empty facts when they are missing. 5D: `nightWake` is re-sent after each accepted act (the latest wins), `nightReveal` answers every accepted act (empty entries for a blind swap), sightings arrive as `mate` rows at the window's opening, `voteResult` has `outs`, `hop`, `pantryOut`, `roles` (of `outs` only) and `abstained`, and `gameOver.onub` is the whole end-screen record. 5E: `onubWakeView(room, seatId)` is the NPC brain's view; NPC acts go through `handleOnubAct` like a human's, and a must-act an NPC leaves undone is completed by seed at the window's end. Debug: `debug.clock` takes `{phase: 'prepReveal' | 'night' | 'dawn'}` and `{window: roleId}` in quick mode.

**Tests I could not write here.** The prep half of the flow (Start through the role card and Evening Prep to `Phase.prepReveal`) is 5A's; the full Start-to-game-over path runs at integration (`WDI_E2E_ONUB=1`). Server suites are timing-sensitive on a loaded machine: the new files wait on the messages they assert (`until`) rather than on the step alone.

### Round 5 log: 5C (ONUB v2 client prep, mini-games, deck editor)

- Done: `scenes/Kitchen.ts` over `view/onub/{PrepView,StationView,PilesView}.ts`; the four mini-games in
  `view/onub/minigames/` as pure models with a canvas layer; `ui/lobby/DeckEditor.ts`; `net/mock/onubPrepMock.ts`;
  `ui/copy/onubPrep.ts`; the "Round 5 (5C)" block of `components.css`; bug #126 (copy ids and the Start confirm's
  fill line); `e2e/kitchen.spec.ts` (mock only, run green against `vite preview`); UI.md 14.12 replaced.
- Tests: one per mini-game (success, bands, the assist time, nothing sent but `onub.prep`), `PrepModel`, the
  editor's five problem lines, the frozen hooks of `onub-contract.md` 7 (`view/onub/hooks.test.ts` reads the
  sources, as the client unit tests run without a DOM).
- Stand-ins to delete or check at integration: `localDeckProblem` (falls back only while 5A's body throws), the
  mock's local pile resolution (5A's `resolvePrep`), the greybox mini-game drawing (5M's `onub_mini`), the
  `onub_kitchen` background (greybox quadrants until 5M).
- Not touched, per the brief: `onubMock.ts`, `net/onub.ts`, the mount hooks, other lines of `Lobby.ts` and `lobby.ts`.
- The e2e needs `pnpm --filter @wdi/content build` first (the preview build resolves `@wdi/content` through `dist`).
- The full-repo `pnpm test` showed one failure of `apps/server/test/npc.test.ts` ("1 human + 3 NPCs ... deals the
  4-row") that did not repeat in isolation, on base or on this branch.

### Round 5 log: 5D (ONUB v2 client night, morning and results)

Four stacked draft PRs (#31 Night scene, lights-out and narrator; #36 card table and acts; #39 Rush, claims and CRUST; this one the end screen, `ColyseusOnubFeed`, `night.spec.ts` and the deletions). Decisions: DECISIONS A55.

- **Built.** `scenes/Night.ts` over `view/onub/{NightView,CardTableView,LightsOutView,NightSound}.ts`; `ui/onub/{rush,claim,over,actlog,actflow,slots,rushModel}.ts`; `net/onubColyseus.ts` (prep, night and Rush reads, `board`/`claims` events on state patches); the night half of the mock (windows, acts on a fixed table); `ui/copy/onubNight.ts` (UI.md 14.14, generated from it); the "Round 5 (5D)" CSS block; round-4 `Loft`, `LoftView`, `.wdi-loft*`, `.wdi-bedroll*` and `.wdi-claims*` deleted.
- **Bugs closed.** The end headline reads the winners row; `loaf_crack` plays at the quick-mode reveal (a two-line edit in `scenes/Meeting.ts`, outside the brief's list but named by it).
- **Tests.** O9 in `NightView.test.ts`; `actflow`, `rushModel`, `actlog` and the mock's acts; the Colyseus feed on a fake room; `e2e/night.spec.ts` (mock, passes locally after building `@wdi/shared` and `@wdi/content`).
- **For the orchestrator.** (1) `net/worldRouter.ts` `liveOnubFeed` must become `new ColyseusOnubFeed(room)` at integration. (2) The mock meeting has no quick-mode tally with roles or `OnubGameOver`, so the reveal and end screen are covered by unit tests only. (3) The Tourrier's two-step path is not reachable in the 5-seat mock deck. (4) `OnubBoardView` has no per-window `endsTick`; the waker's clock reads `nightWake.endsTick`.

### Round 5 log: 5E (ONUB v2 bots, NPC brains, e2e and soak)

**Done** (branch `claude/r5-onub-bots`; decisions in DECISIONS A56):
- `sim/npc/onub.ts`: the NPC seat's pure planners and `runOnubNpc` (prep at `commitS`, the act at `actFrac` of its window from `onubWakeView`, one claim at `claimFrac`, the vote at `voteFrac` of the Rush plus CRUST); `test/onubNpc.test.ts` (30 tests: timing windows, one send, fixed draw counts, claim and vote logic per team, the two-step Tourrier, a sleeper's view never computed). The verbs are mocked there, since 5A and 5B were stubs on the base.
- `tools/bots/quick.ts` and the quick branch of `walk.ts`: the bots' prep, night act, claim and vote (Pantry included), the night leak monitor (`WalkerStats.nightLeaks`), `soak.ts --mode onub` with `--sizes`, `--sabotage` and `--pace`, the ruin report per size, `ruin.ts` (`pnpm bots:ruin`, Monte Carlo over the real prep rules); `test/quick.test.ts`, `test/ruin.test.ts`.
- `apps/client/e2e/onub.spec.ts` (rewritten on the frozen hooks) and the quick case of `npc.spec.ts`; both opt-in (`WDI_E2E_ONUB=1`, `WDI_E2E_NPC=1`) and not run here.
- `.github/workflows/soak.yml` (quick leg with `--sizes 4,6,8,10` and the Monte Carlo), GDD 3.11 "NPC seats" (the draw of the picks, the Tourrier's step delay), ARCHITECTURE 5.12.

**Not done / for integration.**
- PR 4 of the brief, the main-mode bot reads after 5F's contract phase (prey from `SceneState.avatars` by handle, Kill by handle, the leak monitor counting any other seat's `presence` and any avatar outside the own scene): 5F had not merged. `walk.ts` keeps `Player.sceneId` and presence reads until then.
- The real-seat-through-a-full-quick-match test, the specs and the soaks need 5A to 5D merged: run `WDI_E2E_ONUB=1 WDI_E2E_NPC=1 pnpm --filter @wdi/client test:e2e`, `pnpm bots:soak:onub -- --bots 4 --sizes 4,6,8,10` and `pnpm bots:ruin`, and read the ruin table against the 20-30% target.
- Contract request: `balance.onub.json` `npc.stepS` for the Tourrier's second-step delay (now `STEP_DELAY_S` in the code; DECISIONS A56).
- Unverified against the real rules: whether a second `nightWake` follows a first step (the bot rebuilds the Tourrier's second step itself when it does not; the server NPC reads `onubWakeView` fresh each tick).

### Round 5 log: 5F (avatars, public looks, covers, Impersonate)

Branch `claude/r5-avatars`, one draft PR (#35) with one green commit per step of the brief's split (the branch is the
only one the session may push to). Decisions: DECISIONS A57.

- **Step 1, avatars.** `sim/Avatars.ts` (handles, transit tails, `publishAvatars`, `resolveHandle`), the avatar half of
  `Visibility.ts`, `avatars.test.ts` (P2, P4, P5, P6, P12). Kill and Bandage tests name handles (`avatarHelpers.ts`).
- **Step 2, covers.** `sim/Covers.ts` (cover pick, private card Ready for both modes, `assignCovers`, `mainRevealFields`,
  `publishLooks`, the reset) and the `coverHints` body; `coverPick.test.ts` (P7, P8, P13, P14, P16).
- **Step 3, Impersonate.** `sim/Impersonate.ts`; `impersonate.test.ts` (P6, P9, P10, P11 and the 4.5 rules).
- **Step 4, client.** World feed (`avatars()`, `selfHandle()`, `coverState()`, `vfx`), `EntityView`, `targets.ts`, the
  World prompt target and seat picker branch, `RoleCard` (deck strip, walk line, cover picker), `SeatPicker`,
  `portrait.ts` by look, `ui/copy/looks.ts`, UI.md 14.15, the mock feed.
- **Step 5, contract phase.** `Player.sceneId` and every other seat's `presence` are gone from the wire; `Private.sceneId`
  is the only scene index. `PlayerSim.sceneHidden` and `ViewState.presences` removed; the tests of 10.1 updated;
  `looks.spec.ts` (opt-in `WDI_E2E_LOOKS=1`); ARCHITECTURE 5.4; `docs/PROTOCOL.md` regenerated.
- **Hand-offs.** 5A: `beginOnubPlay` writes `priv.sceneId` only now (no public field exists). 5H: send
  `priv.avatar` for the NPC Kill, then drop the NPC branch of `resolveHandle`. 5E: `tools/bots/walk.ts` still reads
  `p.sceneId` and others' `presence`, which no longer arrive; switch it to avatars by handle. 5G: delete the
  `dealMainDeck` stand-in in `coverPick.test.ts`; plug night powers into `SeatPicker` through the `target: 'seat'`
  branch of `World.ts` `abilityKey`. 5I: `EntityView.playVfx` and the look id (`players[lookOf].look`) are ready for
  the iso `PlayerView`.
- **Not run here:** `pnpm test:e2e` (the looks spec needs 5G's deal) and the 2-minute soak (the bot swarm still sends
  seat ids, see 5E).

### Round 5 log: 5G (main deck and Werewolf roles)

Branch `claude/r5-deck`, one draft PR (#34) carrying the six steps of the brief as commits: (1) `dealMainDeck`, `dealDeck` tests, deck-aware `debug.deal`; (2) the Knife after dark (`isKillPhase`), the Bell in grace and day, the Final Night hunt and forced meeting (`sim/FinalNight.ts`, `Phases.ts`); (3) night powers, protections and Nightshade (`sim/NightPowers.ts`, `sim/nightMemory.ts`); (4) Last Shot (`sim/LastShot.ts`), Inherit (`sim/Inherit.ts`, the `heir` card) and Hunger (`sim/Hunger.ts`); (5) the `ui/main` screens, `ui/copy/deck.ts`, UI.md 14.16; (6) the contract phase (`rosters`, `standIn`, `assignRoles`, `rosterFor`, `dealRoles` removed; `cover` and `look` required). Tests: `dealDeck`, `nightPowers`, `lastShot`, `inherit` (with Hunger), the Final Night cases of `flow.test.ts`, `ui/main/main.test.ts`. Decisions: DECISIONS A58.

Open for the orchestrator: the two contract requests of A58 (`startReveal` aim for an ejected Gamekeeper; `gameOverExtras` in `endMatch`); the NPC night-power and Last Shot draws are 5H's (`Brain.nightPowerAtTick`, `nightPowerPick`, `lastShotAtTick` stay -1 until it lands, so NPCs use no power until then); the night-power picker and aim list wait for 5F's `SeatPicker` and a HUD mount point; the soak gate (median 12-18 min, at most a third reaching the Final Night) needs 5E's swarm and runs at integration.

### Round 5 log: 5H (NPC routines and fixes)

Branch `claude/r5-npc`, one draft PR (the brief's five steps are five commits of it; the work did not split into PRs under
400 lines because `routine.ts`, `world.ts` and their tests are one piece). What landed:
- **Streams**: every NPC draw is from `npcPlay:<seatId>` or `npcTiming:<seatId>` (`playRng`, `timingRng` in
  `sim/npc/memory.ts`); `NpcMemory.rng` and the `quick` branch of `runMeetingVotes` are gone; the card-blind draws
  (strike roll, the vote's four uniforms and the per-second tie roll, the night-power tick and pick at each dusk and
  Final Night hunt, the Last Shot delay) are made by every NPC.
- **Routine** (`sim/npc/routine.ts`, `world.ts`, `walk.ts`): persona, stations by kind from `routines.json`, work, strolls,
  idles, scene dwell, the 12 s walking cap, stuck goals, Collect on clues, the startle and report at a body for every NPC,
  the placement idle, the lit-scenes-at-night rule with the seeded leave delay and the walk home, the Killer's hunt.
- **Meetings, ready**: the vote tick over `npc.vote.windowFrac`, `npcVoteTarget` (confession, plurality, suspect,
  forced random), NPC seats Ready after `npc.ready.delayS` on the role card, after Add NPC and after the lobby return.
- **Tests**: `npcRoutine` (P1-P4, R1-R18), `npcBrain` (M1-M7 and the walking, report and Killer cases), `npc` (D1-D4),
  `presence` (A1-A5), `npcTells` (E1-E3, four seed sets under `WDI_SLOW=1`), the helpers `advance`, `holdPhase`,
  `standardParty`. The whole NPC suite runs in about 40 s of wall time, none of it asleep.
- **CI**: the server suite in its own job. **Docs**: GDD 3.12 (one-door trips, pause and resume, stuck by movement, the
  hunt), ARCHITECTURE 5.12, DECISIONS A59.
- **For the orchestrator** (contract changes, not made here): `isKillPhase` in `sim/World.ts` should read
  `abilities.json` `kill.phases` once 5G lands (the Final Night strike test of `npcBrain.test.ts` is `skipIf` until then);
  the Final Night itself is 5G's, so E1 ends its match white-box at round 5 until it exists; 5G adds
  `brain.lastShotAtTick` (a delay in ticks) to the tick its Last Shot aim starts; the NPC Killer sends
  `priv.avatar || seatId` as its Kill target, so it follows 5F with no change.

### Round 5 log: 5I (isometric client and lighting)

Branch `claude/r5-iso`, draft PR #29 (the brief's five steps are five commits on it, since the session has one branch; each commit passes
`pnpm lint && pnpm typecheck && pnpm test` on its own). Decisions: DECISIONS A60.

- **Step 1, projection, input, camera.** `view/iso.ts` (depth bands and biases, `isoZoom`, `cameraBounds`, the decal transform and
  `decalHolder`, tile and scene diamonds); `PlayerView`, `BodyView`, `ClueView`, `PropView` take world px; `input/vectors.ts` `worldMove`;
  `World.ts` keeps targets, reach and the noise words in the world and screen frames they belong to.
- **Step 2, depth and occlusion.** `view/statics.ts` (kit frame names, occluder rules, slices, the fade and the cull) and `StaticView`.
- **Step 3, tilemap reader.** `view/sceneMap.ts`, `mapDefs.ts` (objects to statics with the SPRITES 10.13 lookup order), `GroundView`,
  `greyboxColours.ts`, the `maps` and `modes` fields (`manifestRules.ts`, `assets.ts`), `dayPart.ts`.
- **Step 4, lighting.** `Lighting` and `lightMath.ts`, the 1 x 1 px `night-mask` hook, scene lights by part of the day with flicker and
  glows, `setCarried` as an unused slot.
- **Step 5, poses and the rest.** `interact` clip with the greybox teal tick, `PlayerLook.lookId` (for 5F's `EntityView`; the plain
  villager body when the look's atlas is not loaded), `hungerPrints` in `ClueView`, `world.spec.ts` rewritten (world directions are two
  keys, sent together by one page call; the darkness hook cases).
- **Checked.** The 5I rows of SPRITES 10.15: `vectors.test.ts`, `iso.test.ts` (zoom snapping, the decal transform), `statics.test.ts` (depth
  against building slices), `lightMath.test.ts` (ambient for day, night and a dark scene; lights by phase), `poses.test.ts`; and all of
  `world.spec.ts` against `?mock=1` in Chromium. The 45 fps check of ROADMAP M5a waits for the isometric maps and the art (integration).
- **For others.** 5F: pass `lookId` in the `PlayerLook` you give `PlayerView`, and the look's `interact` and the other clips are looked up
  as `char/<lookId>/<clip>/<dir>`; the deck looks wear their scarf and hat baked in, so the villager overlays are hidden for them. 5J:
  the client reads `theme`, `map`, `kind`, `dark`, `void` and the object groups of SPRITES 10.12 and falls back to a flat diamond for an
  orthogonal file; delete the legacy props fallback in `view/PropView.ts` with your tilemaps. 5K: the pivots come from the frames
  themselves (`customPivot`), with `(0.5, 1)` for a frame without one.

### Round 5 log: 5J (maps)

Session 5J, 2026-10-18. Four draft PRs against `claude/zen-turing-m1jnw0`. They stack: each branch holds the one
before it, and each PR description says which commit to review. Decisions: A61.

1. **#32 `claude/r5-maps`: Hollowmere.**
   - The Fenwood (`forest_deep`) and the Flooded Gallery (`cave_gallery`), both Medium; `fo.deep` and `ce.gallery`.
   - The four moved doors, the overworld buildings and the Wake Table footprint.
   - `material` and `lights` on all 15 old scenes, and the Gallows Wood wolf spawners.
   - Fixture updates forced by the moved doors: `tools/grid/test/export.test.ts` and
     `apps/server/test/sim-portal.test.ts` (stand at `tavern_bar.front` instead of a hard-coded tile).
2. **#38 `claude/r5-maps-2`: Blackpine.**
   - The eight `bp_*` scenes and `maps/blackpine.json`; `SCENE_IDS` +8, `MAP_IDS` + `blackpine`.
   - The Blackpine cases of `world.test.ts`; `mapSites.test.ts` pins Hollowmere's 17 scenes.
   - One PR rather than two (A61.1).
3. **#41 `claude/r5-maps-3`: the isometric exporter** (SPRITES 10.12, with exporter notes there).
   - Every `tilemap.json` regenerated; navs byte-identical.
   - The quadrant reading of the shells (A61.2).
   - `tools/grid` now depends on `@wdi/content` (`workspace:*`).
4. **#44 `claude/r5-maps-4`: the map choice.**
   - Server: `mapIdOfRoom` reads `Settings.map`, and `handleSettings` has its map branch.
   - Client: `MapPicker.ts` (frozen `map-select`), `ui/copy/maps.ts` (UI.md 14.17), the "Round 5 (5J)" CSS block.
   - Docs: ARCHITECTURE 5.3.
   - Tests: `apps/server/test/maps.test.ts` (the setting: leader, unknown id, all or nothing, kept through the
     lobby; a Blackpine start on the yard spawns, the meeting spread, the Bell only at `bc.bell`, the teaching
     clue at `bc.teaching_clue`) and `ui/lobby/MapPicker.test.ts`.

**For other sessions.**
- 5I: until your isometric World lands, the top-down `World.ts` cannot draw the new tilemaps. `world.spec.ts` walks
  west to `tb.front`, which is now on the south wall.
- 5K: `thumb_<mapId>` shows in the map row as soon as the manifest has it; until then the row shows names and
  blurbs.
- No new prop kind, so `routines.json` is unchanged.

### Round 5 log: 5K (world art)

Session 5K, `claude/r5-world-art`, PR #40 against `claude/zen-turing-m1jnw0`, 2026-10-18. Decisions in
DECISIONS A62.

- **K1, ground**: `iso_ground_harbour` and `iso_ground_timber` (1280 x 1792, gid = 1 + 20 m + c), 14
  materials in four variants each, from Poly Haven textures under IsoCam (`build_ground.py`), joined and
  finished by `tools/sprites/tileset.ts`. The CC0 packs are fetched by `env/kits.py` into git-ignored
  `assets/external/kits/`, with their licence files.
- **K2, kits**: `iso_kit_<theme>`, 44 frames named `<kind>/<height>/<v>`, pivot (w/2, h - 16) art px
  (`build_kit.py`, `kit_import.py`); `review-world.ts` composites the review sheets; six T2 style boards
  (12 Higgsfield images of 5K's 12, one retry) in `assets/source/review/boards-*.png` and
  `batches/5K.json`. Gate A: `assets/source/review/gate-a-world-{on,off}.png`, in the PR description.
- **K3, props**: `props` (shared props, 8 spots, 20 portal frames), `props_hollowmere` (33 props, 22
  spots) and the 24 `clues` keys, Hunger's glowing footprints new.
- **K4, buildings**: `bld_hollowmere` from `build_buildings.py` recipes at the `world.md` footprints,
  rendered with a raw tile-code pass that `tools/sprites/slice.ts` cuts into `<art>#dx_dy` slices sharing
  their building's pivot; the multi-tile props are sliced the same way.
- **K5, Blackpine**: `props_blackpine` (18 props, 14 spots) and `bld_blackpine`.
- **K6**: `thumb_<mapId>.webp` (480 x 270), the four `amb_*` loops (`env/ambience.py`, CREDITS rows),
  the world masters (`save_masters.py`, `assets/source/MANIFEST.md`), placeholder twins for every new
  key, ASSETS and SPRITES notes.
- **Rebuild**: the commands in `tools/blender/README.md` ("World art (round 5)" onwards) and
  `tools/sprites/README.md`; every sheet passes the palette audit (no off-palette or partial-alpha pixel,
  saturated share under the cap) when the finish is on.
- **A79, both styles**: `tools/sprites/world.ts` rebuilds every 5K key per art style from the raw renders
  (8-bit at the root, unchanged byte for byte; low poly into `assets/lowpoly/` with its `manifest.json`);
  `test/world.test.ts` checks the low-poly keys, frames, pivots and page caps against the 8-bit ones.
- **Owner**: copy `assets/external/world/<mapId>/{buildings,props}_<mapId>.blend` and
  `assets/external/loft/loft.blend` to ROSW `studio/assets/who-did-it/world/` (hashes in MANIFEST change on
  every re-save); sync the 12 board generations into the ROSW catalog (CREDITS says "pending
  higgsfield-library-sync").
- **Not done**: the `tiles_*` keys stay until 5J's tilemaps no longer read them; `LEGACY` is not asserted
  empty yet, which waits on L4, L5 and M1 at integration. `bld_hollowmere` takes two pages (A62).

### Round 5 log: 5L (character art)

Branch `claude/r5-char-art`, PR #33 (the L1-L5 split as commits on one branch). Decisions in DECISIONS A63.

- **L1, rig.** IsoCam (ortho, X 60 / Z 45, 90.51 px per ground metre), the environment and character roots
  (`Z_SCALE` 0.75), lights keeping their camera-frame azimuths, toon stops 0.25 / 0.65, the calibration sheet and
  `calibration.json` (feet, marker vectors, the 128 x 64 tile diamond). `palettize.py` snaps to the world palette in
  OKLab. `palette.test.ts` and `budget.test.ts` over the real manifests.
- **L2, base and clips.** `build_looks.py` (one five-heads-tall base, 22 bones, rigid parts, five clips keyed in code),
  `looks_spec.py`, `look_parts.py`; `keys.ts` (`interact`, the `blood` pass), `pack.ts` (look pages, extrude only on
  frames with partial alpha), `placeholder-chars.ts` (every look and portrait has a greybox twin).
- **L3 / L4, looks.** All ten world looks rendered in 8 directions, finished and packed (304 frames per pass, one
  1024 x 1024 body page and one overlay page each); the real villager left the real manifest (ruling C11). Every
  posed vertex of every look stays within 110 px above and 10 px below the feet row; four rounds of fixes got there
  (the kneel, the lamplighter's raise, the detective's magnifier moved to the left hand, the toque).
- **L5.** 13 portraits (T4), `vfx` re-rendered through IsoCam plus `vfx_disguise`, the six ability icons, and the
  low-poly style of every 5L key under `assets/lowpoly/` (art plan 1.9, A79), packed from the same renders.
- **Higgsfield.** 36 images (20 T3, 16 T4), 108 credits, inside the 400-credit share; nothing generated for low poly.
- **For 5K.** `build_villager.py` is a shim re-exporting `look_parts.py`'s shapes until `static_common.py` imports
  them from there; SpriteCam is gone (`IsoCam`, `TileCam` remain); `packFrames` skips the extrude only when every
  frame is finished; `palette.test.ts` exempts the `ovl_` mask pages from the saturated cap (A63).
- **For 5F / 5I.** Atlas keys `char/<lookId>/<anim>/<dir>` for the ten looks (no hat passes); the villager loads
  only with `?art=placeholder`; a style manifest lacking a key falls back to the 8-bit entry.
- **Open.** Gate B (`assets/source/review/gate-b-character.png`) for the owner; ASSETS 6.1 still words the 10%
  saturated cap as applying to every page (A63 exempts the overlay masks).

### Round 5 log: 5M (ONUB art)

- **Done (2026-10-18), one draft PR from `claude/r5-onub-art`, commits grouped M1 to M4.** Every key of
  `onub-contract.md` 5.4 plus `onub_mini` in both manifests with `modes: ['onub']`; 13 owner rooms finished; the
  proofing clean-up; the kitchen overview; 24 card faces and backs; the cloche; 15 role portraits and `onub_baker`;
  the mini-game atlas; the placeholder twins; the loft images out of both manifests and `LEGACY`. Calls in DECISIONS
  A64; keys and layout in SPRITES 11; ASSETS 6.3 "What shipped, ONUB v2".
- **Generation**: 78 images and 33 background removals, 357 credits; every shipped pick has a CREDITS "Generated"
  row and a MANIFEST row (catalog id pending `higgsfield-library-sync`). Raw generations stay out of git.
- **Waiting on the owner**: Gate C, the Brick Oven pick (greybox until then), and the provenance of the 13 images.
- **For other sessions**: the client's `queueManifest` loads every manifest entry today and ignores `modes`, so until
  the client filters by mode (5C, 5D, 5I) the ONUB images would load in the main mode too; 5C and 5D draw
  `mini_fire` from `mini_oven/0..3`. 5K: please move `frame` from `build_loft.py` into `static_common.py` and drop the
  loft step of `save_masters.py`, after which `build_loft.py` can be deleted.
- **Retakes (2026-10-18, on the orchestrator's round-5 budget of 300 credits for 5M)**: 6 more images and 1 more
  background removal, 16 credits (balance 3010.31 to 2994.31). The Champignon and Commis portraits sat on a grey or
  blue panel against the other portraits' navy void, and `mini_cart` had come out as a three-shelf rack; the new picks
  (`retryNote` and `retrySubject` in `batches/5M.json`) replace their CREDITS and MANIFEST rows. Every other pick held
  up on the review sheets, so the rest of the share stays unspent; the oven waits on the owner's pick.
- **Low-poly style (2026-10-18, A79, art plan 1.9)**:
  - Base merged at 2aa57ac.
  - `onub.ts build` now writes both styles. The low-poly set is every ONUB key and `onub_mini` under
    `assets/lowpoly/onub/` with `assets/lowpoly/manifest.json`, 3.9 MiB, and the 8-bit set is byte-identical to
    before. Calls are in A64, layout in SPRITES 11.
  - Gate C is answered (the pixel finish is the 8-bit style), and so is the provenance (Nano Banana Pro). Google's
    terms rows are in `LICENSES/vendors/README.md`.
  - Still open: the Brick Oven pick.
- **Brick Oven (2026-10-18)**: the owner picked D (`99cad74c`). `pick` and the oven's `locBoxes` and `floorBoxes`
  are set, and `onub_station_oven`, its kitchen quadrant, `onub_loc_oven` and the oven's Ingredient cards are rebuilt
  in both styles; no greybox is left. The real oven pushed the low-poly set past 4 MiB, so the
  generated and composed art goes to quality 82 (3.85 MiB; A64). The three retake MANIFEST rows now cite their new generation ids.
