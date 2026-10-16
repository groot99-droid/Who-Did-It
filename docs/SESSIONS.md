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
