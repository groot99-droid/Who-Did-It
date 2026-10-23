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

### Round 5 log: 5N (art-style switch)

**What shipped (client presentation only; no server, shared, content or art change).**
- `view/artStyle.ts` (Phaser-free): the style list from `style.json`, the guarded `wdi.artStyle` pick, the `?art=<id>`
  override, `requestArtStyle`, `onArtStyleChanged`.
- `view/manifestRules.ts`: `mergeStyleManifest` and `changedEntries` (pure, tested). `view/assets.ts`: the merged
  `resolveManifest`, per-entry roots, and the loaded-url record the swap compares against.
- `view/artSwap.ts`: the swap (stage under temporary keys, replace by key, filters, animations). Installed by `Preload`.
- `ui/artStyle/` and `ui/copy/artStyle.ts`: the control, the veil, the notice; UI.md 14.18.
- Subscriptions to `art-style-changed`: `World` (restart), `Kitchen`, `Night`, `Meeting` (portraits), `MapPicker`.
- Mounts: one line in `ui/Lobby.ts`, `Hud.ts`, and the quick-mode scenes.
- Tests: `artStyle.test.ts`, `styleManifest.test.ts`, `e2e/artStyle.spec.ts` with the fixture manifest in
  `e2e/fixtures/lowpoly/`.

**Integration note.** This replaces the landing-screen toggle of db8a55f (reload on pick, `ART_KEY` `wdi:art`, `overlay()`): the pick key is now `wdi.artStyle`, the merge is `mergeStyleManifest`, the switch needs no reload, and `flags.art` is back to `default | placeholder`.

**For other sessions.**
- 5F: no line is needed in `EntityView` or `RoleCard` today. The World restarts on a switch, so `EntityView` rebuilds
  from the new textures, and neither file reads a texture or a manifest url yet. If `RoleCard` comes to draw a
  `portrait_<lookId>` canvas or `<img>`, it should repaint on `art-style-changed` (`onArtStyleChanged` from
  `view/artStyle.ts`, or `game.events`).
- 5M: the real `assets/lowpoly/manifest.json` needs no client change. Its files must sit under `assets/lowpoly/` and its
  urls be relative to that folder.
- A DOM image that takes its url from `manifestImageUrls` must call it again on `art-style-changed`.


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

## Round 6 (started 2026-10-22, after round 5 landed at a60d855)

Fifteen sessions build **M5b, Resources, mobs and quests** (GDD 3.14-3.16; ROADMAP M5b), **M5c, Cinematics and
music** (GDD 3.18; ROADMAP M5c), **M5d, the admin auto-mode** (GDD 3.19; ROADMAP M5d), and the empty seams of
the owner's Integrated Master World, System & Design Bible (`docs/round6/owner-brief.md`, quoted word for word;
`bible-seams.md` stages it over rounds 6 to 9). Same rules as rounds 1 to 5:
- draft PRs against `claude/zen-turing-m1jnw0`, under 400 lines where the work allows (split by step, each PR
  green);
- `pnpm lint && pnpm typecheck && pnpm test` clean before every push;
- pinned versions only, and no model identifiers in committed files (the Model column of this table is the one
  exception, as in round 5);
- `docs/GDD.md` changes in the same PR as a behaviour change;
- numbers only in `docs/GDD.md` and `packages/content/data`.

**Models.** The owner's rule for this round: Sonnet 5.5 for almost everything; Opus 5.5 for planning and the
complex game logic (6A, 6B, 6G) and, as in round 5, for content and art (6E, 6M, 6N); Fable 5.1 only for the
system redesign, which is 6Z (this contract and the pre-seed). The decisions of this round are DECISIONS A81
(the owner's answers and the contract); a session never re-decides them.

**Context.** Every session compacts at 400k tokens: `.claude/settings.json` sets `autoCompactWindow` to 400000
(an absolute token count; a cloud session may compact earlier through its own percentage threshold, which is
fine) and `CLAUDE.md` "Compact instructions" says what a compacting session keeps. A session is spawned with its
model, that setting, and a prompt of the form "You are session 6X of docs/SESSIONS.md Round 6. Read your brief,
then docs/round6/seams.md, then the sections it names. Branch claude/r6-<slug>."

**What changed for everyone.**
- **The sim has a clock.** `PartyRoom`'s fixed step runs `step` `n` times per tick from `sim/auto/clock.ts`;
  a `party` room never leaves 1x and nothing in `C2S` changes the clock (`auto-admin.md` 2).
- **A match can have no human.** `RoomSim.auto` marks an auto match; the NPC Killer takes NPC prey only there;
  Start needs no leader there (`auto-admin.md` 3).
- **A seatless admin client** sees everything, in its own room (`admin`), only when `WDI_ADMIN=1` and the
  GitHub variables are set (`auto-admin.md` 7, 8).
- **Cutscenes are data** (`packages/content/data/cutscenes/`), captions are copy ids, the opening lengthens
  grace by `phases.openingS`, and a `killed` carries its cutscene id (`cutscene-music.md` 1).
- **Music is lazy and has its own budget** (<= 12 MB, <= 4 MB per map, loaded after Start); the 6 MB audio
  budget is SFX and ambience (`media.md` 2, DECISIONS A81).
- **Every sound comes from the ROSW sound library** by catalog id (the owner's tracks as a release batch, the
  stingers and ambiences from the catalog); `music-cue` is not used and nothing is copied into `studio/assets/`
  by hand (`media.md` 1, 4, 7; owner, 2026-10-22).
- **The Step order** gains `runAuto` (before `runNpcs`), `runResources`, `runMobs`, `runQuests` (in place of
  `runAiAndHazards`, after `runDecay`) and `runEvents` (after `runPhases`).

**The contract documents** (`docs/round6/`) carry everything a session needs beyond this section:
- `seams.md`: every pre-seeded hook, its owner, its locked call site and its stub body, kept current per step;
- `auto-admin.md`: the clock, the all-NPC match, the harness and `pnpm auto`, the invariants, the admin wire,
  the GitHub login, the observer;
- `cutscene-music.md`: cutscenes, loading, transitions, the trailer, music, the budgets;
- `m5b-data.md`: the M5b content, server modules, client views and art;
- `bible-seams.md`: the Bible's systems by round, and the empty seams round 6 leaves;
- `media.md`: the owner's audio, the two videos, the ROSW route, the provenance rows;
- `owner-brief.md`.

Read your brief below, then `seams.md`, then the sections of those documents it names. GDD 3.14-3.16, 3.18 and
3.19 are stubs that point at the contract documents until their owners write them (6E, 6J and 6L, 6A); ROADMAP
7.1 carries M5b, M5c, M5d and the round 7-9 rows; ARCHITECTURE 5.11 points at the admin gate (6C writes it).

**Pre-seeded on the base branch** by 6Z after this section, additively, in six steps (`seams.md` 1): (1) the
shared wire and schema (`protocol/admin.ts`, `S2C.cutscene`, `minigameStart`, the quest and mini-game `C2S`
types, `HoldAction` `gather` and `craft`, `killed.cutsceneId`, `DeathCause.wolf`, `StatusBit.lantern`,
`SceneState.nodes` and `mobs`, `Private.quests`, `GameState.lawStage`, `Role.evolvedFrom`, `PROTOCOL.md`
regenerated); (2) the content stubs with zod (`cutscenes/`, `music.json`, the five M5b files, the four Bible
files, the `balance.json` rows); (3) the server stubs and locked call sites (`sim/auto/{Auto,clock,AdminView,
invariants,log}.ts`, `sim/events/bus.ts`, `rooms/AdminRoom.ts` unregistered, `services/adminAuth.ts` with
`adminConfig` returning null, `RoomSim.auto`, the clock loop in `PartyRoom`, `preyFor`, the `startRefusal` auto
branch, the Step stages as no-ops, the `isAdminClient` line in `reconcileViews`, the `seeds.test.ts`
allowlist); (4) the client stubs (`#/admin`, `scenes/Admin.ts`, `admin/`, `view/cutscene/`,
`view/{MusicBus,MusicDirector,Transition,LoadingScreen}.ts` with their mount lines, the feed types); (5)
`tools/auto/` and `test/autoHelpers.ts`; (6) the `soak.yml` `auto` leg. Nothing the code at a60d855 reads is
removed or made required. Until a step lands, its rows in `seams.md` say "pending" and a session that needs
one writes a local stand-in with the same signature.

**Nobody edits** `packages/shared/src/**` except the rule bodies a brief names (`rules/cutscenes.ts` 6J,
`rules/minigames.ts` 6H), `packages/content/src/**` and the content data except the lines a brief names,
`apps/server/src/sim/{Step,RoomSim,Flow,Phases,Win,Npc,seeds,constants}.ts`, the pre-seeded call sites in
`rooms/PartyRoom.ts`, `rooms/handlers/lobby.ts`, `sim/{Visibility,Death,Actions,Commands}.ts` and
`sim/npc/world.ts` (the other lines of those files belong to the owners in the table), `apps/server/test/{simHelpers,
killHelpers,seedHelpers,npcHelpers}.ts`, the client contract files (`net/{world,worldColyseus,worldRouter,
protocol,NetworkService,mock}.ts`, `net/mock/worldMock.ts`, `scenes/registry.ts`, `view/animIds.ts`, `main.ts`
and every pre-seeded mount line in `scenes/{Preload,World}.ts`, `ui/{Landing,Lobby}.ts` and `view/Hud.ts`),
`tools/sprites/{placeholder,placeholder-kit}.ts` and `eslint.config.js`. A session that needs another contract
writes it in its PR description and carries on with a local stand-in; the orchestrator adds it to the base
branch.

| Session | Model | Track | Branch | Owns |
|---|---|---|---|---|
| **6Z. Round-6 contract and pre-seed** | Fable 5.1 | Contract | `claude/game-features-admin-planning-v43tvq` | `docs/round6/**`, this section, DECISIONS A81, the pre-seed of `seams.md` 1, the settings and CLAUDE.md compact sections in both repos |
| **6A. Time scale, auto mode, headless harness, CLI** | Opus 5.5 | Code | `claude/r6-auto-core` | `sim/auto/{Auto,clock}.ts`, `preyFor`, the `startRefusal` auto line, `test/autoHelpers.ts`, `test/auto.test.ts`, `tools/auto/run.ts`, GDD 3.19 |
| **6B. Event bus and invariants** | Opus 5.5 | Code | `claude/r6-invariants` | `sim/events/**`, `sim/auto/{invariants,log}.ts`, `tools/auto/{report,checks}/**`, `MatchLog` `event: 'auto'`, `test/invariants.test.ts`, `soak.yml` auto leg |
| **6C. GitHub auth and AdminRoom** | Sonnet 5.5 | Code | `claude/r6-admin-server` | `services/adminAuth.ts`, `rooms/AdminRoom.ts`, `rooms/handlers/admin.ts`, `sim/auto/AdminView.ts`, the admin block of `server.ts`, ARCHITECTURE 5.11 admin text, README Railway notes, tests |
| **6D. Admin client** | Sonnet 5.5 | Code | `claude/r6-admin-client` | `client/admin/**`, `scenes/Admin.ts`, `EntityView` label option, `interpolation.ts` delay parameter, `e2e/admin.spec.ts`, UI.md 14.18 |
| **6E. M5b content and GDD 3.14-3.16** | Opus 5.5 | Content | `claude/r6-m5b-content` | the five M5b files, their schemas and `checkM5b`, `items.json` rows, `balance.json` `resources`, `mobs`, `quests`, `vision.lanternTiles`, the scenes' `nodes`, `spawners`, `givers`, GDD 3.14-3.16, WORLD economy notes |
| **6F. Gathering and crafting** | Sonnet 5.5 | Code | `claude/r6-gather-craft` | `sim/{Resources,Craft,Inventory}.ts`, the `gather` and `craft` hold cases of `Actions.ts`, tests |
| **6G. Mobs and dark visibility** | Opus 5.5 | Code | `claude/r6-mobs` | `sim/Mobs.ts`, `sim/mobs/**`, `sim/Sight.ts`, the `canSee` line of `reconcileAvatars`, the lantern bit in `publishAvatars`, the wolf cause in `Kill.ts` and `Death.ts`, tests |
| **6H. Quests and mini-games** | Sonnet 5.5 | Code | `claude/r6-quests-minigames` | `sim/{Quests,Minigames}.ts`, `rules/minigames.ts`, the quest and mini-game cases of `Commands.ts`, the task hold of `Actions.ts`, the fake-list rule, tests |
| **6I. M5b client** | Sonnet 5.5 | Code | `claude/r6-m5b-client` | `view/{NodeView,MobView,GiverView}.ts`, `ui/{Inventory,Crafting,QuestLog}.ts`, `view/minigames/**`, the lantern glow of `Lighting.ts`, the readers of `worldColyseus.ts` and the mock, `ui/copy/m5b.ts`, `e2e/m5b.spec.ts`, UI.md 14.19 |
| **6J. Cutscenes** | Sonnet 5.5 | Code | `claude/r6-cutscenes` | `content/data/cutscenes/**` and the schema, `rules/cutscenes.ts`, `view/cutscene/**`, `ui/copy/cutscenes.ts`, the `beginPlay` broadcast and `openingS`, the `markDead` line, the `World.ts` play hooks, `e2e/cutscene.spec.ts`, GDD 3.18 cutscene lines, GDD 3.3 `openingS` line |
| **6K. Loading, transitions, trailer, budgets** | Sonnet 5.5 | Code | `claude/r6-polish-flow` | `view/{LoadingScreen,Transition}.ts`, `ui/copy/tips.ts`, the Landing video element, the `worldRouter.ts` wrappers' bodies, `tools/sprites/test/media.test.ts`, the video manifest shape, ASSETS 6.8 text, GDD 3.13 `transitionS` line |
| **6L. Music** | Sonnet 5.5 | Code | `claude/r6-music` | `view/{MusicBus,MusicDirector,audioSettings}.ts`, `ui/SettingsPanel.ts`, `AudioBus.setSfxVolume` and the `narr_*`/`sting_*` keys, `content/data/music.json` and its schema, the music manifest shape, the playlist slots filled from the sound library (CC0 only where it cannot) and their CREDITS, GDD 3.18 music lines |
| **6M. M5b art** | Opus 5.5 | Art | `claude/r6-m5b-art` | `tools/sprites/placeholder-m5b.ts`, node, mob, giver, tool and light sprites in both styles, manifest keys, SPRITES.md section, CREDITS |
| **6N. ROSW media (both repos)** | Opus 5.5 | Art | `claude/r6-rosw-media` | ROSW: the `sound-library` ingest of the owner's batch (`catalog.json`), the `video-shot` runs, their studio notes and library entries; here: `public/assets/{video,audio,audio/music}/**` binaries fetched by catalog id and mastered, the manifest rows, `assets/source/MANIFEST.md`, CREDITS rows |
| **6Q. Opening cinematic** (added 2026-10-22) | Sonnet 5.5 | Code | `claude/r6-intro` | `scenes/Intro.ts`, `ui/copy/intro.ts`, the `first` line of `Preload.ts`, the `intro` video budget line of `media.test.ts` and ASSETS 6.8, `e2e/intro.spec.ts`, UI.md 14.24 |
| **6P. Integration** | Sonnet 5.5 | Code | `claude/r6-integration` | merges, lockfile, `PROTOCOL.md` regen, the 50-match `pnpm auto` soak on both maps and modes, both 30-minute soaks, the opt-in e2e suites, this round's integration log, DECISIONS A97 |

Merge order: 6Z first and alone; then 6A, 6E, 6J, 6K, 6L, 6M in parallel; 6B and 6C after 6A; 6F, 6G, 6H
after 6E; 6D after 6C; 6I after 6F, 6G and 6H; 6N when its binaries pass `media.test.ts`; 6Q (added 2026-10-22, A98) after 6K and
6L; 6P last. Shared
documents: edits stay inside the named section with no renumbering or reflow, and the orchestrator keeps both
sides of any conflict. Copy: a session that needs new lines adds a UI.md 14 subsection of its own (6D 14.18,
6I 14.19, 6J 14.20, 6K 14.21, 6L 14.22) and a copy module of its own under `ui/copy/`. Theme: new rules are
appended at the end of `ui/theme/components.css` under a "Round 6 (6X)" comment, one block per session.
Decisions a session has to make go to `docs/DECISIONS.md` under its reserved row, which every session may fill
(6Z A82, 6A A83, 6B A84, 6C A85, 6D A86, 6E A87, 6F A88, 6G A89, 6H A90, 6I A91, 6J A92, 6K A93, 6L A94,
6M A95, 6N A96; integration A97). A second row takes the number plus 16 (A98 to A112, appended after A97, so it
never meets the integration row); nobody edits an older row. The orchestrator runs the opt-in e2e suites
(`WDI_E2E_ONUB=1`, `WDI_E2E_NPC=1`, `WDI_E2E_LOOKS=1`, and this round's `WDI_E2E_ADMIN=1`), `pnpm auto --
--matches 50` per map, mode and difficulty, and the 30-minute soaks of both modes at integration. The Railway
variables of `auto-admin.md` 7 are set by the owner.

### Briefs

Every brief names the session's paths, the sections it reads, its PR split, its tests and what it leaves
alone. Every session reads `docs/round6/seams.md` before writing code and records its round-6 log under its
reserved "Round 6 log" heading at the end of this section.

**6Z. Round-6 contract and pre-seed.** Write the contract (this section and `docs/round6/`), the shared-document
stubs, the settings and CLAUDE.md compact sections in both repos, then land the six pre-seed steps additively,
each PR green, editing `seams.md` as each lands. **Owns** `docs/round6/**`, this section, DECISIONS A81 and
A82, ROADMAP 7.1 rows M5b to M5d and rounds 7-9, GDD 3.14-3.16 pointers and the 3.18 and 3.19 stubs,
ARCHITECTURE 5.11's pointer, `docs/README.md`'s row, `CLAUDE.md` "Compact instructions" and
`.claude/settings.json` in both repos, ROSW's `render-pipeline` Kinds line, and every file `seams.md` 1 marks
as a pre-seed. **Reads** everything. **PRs**: (1) the documents and settings; (2)-(7) the six steps of
`seams.md` 1, each under 400 lines. **Tests**: `pnpm lint && pnpm typecheck && pnpm test` on every step;
`party.test.ts` still proves no `admin` room and no debug handlers without env; `protocol-doc.test.ts` after
`pnpm docs:protocol`; the content tests validate every new empty file. **Not**: any body a brief gives another
session. Log under "Round 6 log: 6Z".

**6A. Time scale, auto mode, headless harness, CLI.** Make the sim run at 1x, 2x, 5x and 10x from one place,
let a match run with every seat an NPC and no leader, and give the repo a headless harness and a CLI that plays
such matches to the end deterministically. **Owns** `apps/server/src/sim/auto/{Auto,clock}.ts`, the `preyFor`
body in `sim/npc/world.ts`, the auto branch of `startRefusal` in `rooms/handlers/lobby.ts`,
`apps/server/test/autoHelpers.ts`, new `apps/server/test/auto.test.ts`, `tools/auto/run.ts` and its
`package.json` scripts, GDD 3.19 (the whole section, from the stub), ARCHITECTURE 5.3's Start-flow paragraph
(`seams.md` 3). **Reads** `auto-admin.md` 1-4 and 6; `seams.md` 1.3 and 1.5; GDD 3.12 (the brains it drives).
`enableAuto` is the one production path that assigns `fixedSeeds`; `runAuto` is the only writer of the clock;
`startMatch` is called inside the step and never from a handler. **PRs**: (1) `clock.ts`, the loop in
`PartyRoom` filled, the writer test; (2) `Auto.ts`, `preyFor`, `startRefusal`, `autoHelpers.ts` and a one-day
auto match per mode in `auto.test.ts`; (3) the determinism test, `autoDispose` on a clientless room, `run.ts`
and GDD 3.19. **Tests**: the clock's budget guard (`carry` grows, `effectiveScale` drops, nothing is skipped);
an NPC Killer takes NPC prey only under `auto.npcPrey`; a `party` room's `tickP95` is unchanged at 1x; two
runs with the same seeds hash the same. **Not**: `Visibility.ts`, `AdminRoom.ts`, the invariants (6B), any
admin handler (6C). Before code, `seams.md`; log under "Round 6 log: 6A".

**6B. Event bus and invariants.** Give the sim an event bus the vendettas and the propagation matrix will
subscribe to, and an invariant registry the harness and the admin page run every few ticks; put the all-NPC
matches in the weekly soak. **Owns** `apps/server/src/sim/events/**`, `sim/auto/{invariants,log}.ts`,
`tools/auto/{report,checks}/**`, the `event: 'auto'` lines of `MatchLog` in `sim/Win.ts`, new
`apps/server/test/invariants.test.ts`, the one-line `emitSim` calls in `Kill.ts`, `Death.ts`, `Clues.ts`,
`Meeting.ts`, `Phases.ts` and `Win.ts` (listed in the PR; the orchestrator confirms them), the `auto` leg of
`.github/workflows/soak.yml`. **Reads** `auto-admin.md` 4-6; `bible-seams.md` 1 and 2; `seams.md` 1.3 and 1.5.
The log records seat ids, never avatar handles. **PRs**: (1) the bus, `runEvents`, the emitters and
`invariants.test.ts` for the bus; (2) the seven invariants of `auto-admin.md` 5 with tests on `npcHelpers`
rooms; (3) `log.ts`, `tools/auto/report`, the `soak.yml` leg. **Tests**: each invariant fires on a constructed
failure and not on a clean room; the leak invariant reproduces `visibility.test.ts`'s cases. **Not**: the
brains, `Auto.ts`, the admin wire. Before code, `seams.md`; log under "Round 6 log: 6B".

**6C. GitHub auth and AdminRoom.** Put the owner's GitHub login on the server and open the `admin` room only
to it: the OAuth routes, the signed token, the room that joins without a seat and sees everything, the admin
handlers that queue into the auto commands. **Owns** `apps/server/src/services/adminAuth.ts`,
`rooms/AdminRoom.ts`, new `rooms/handlers/admin.ts`, `sim/auto/AdminView.ts`, the admin block of `server.ts`,
new `apps/server/test/{adminAuth,adminRoom}.test.ts`, ARCHITECTURE 5.11's admin paragraph (from the pointer),
the Railway variable notes in `README.md`. **Reads** `auto-admin.md` 1, 3, 6-8; `seams.md` 1.3; ARCHITECTURE
5.11; `party.test.ts` (the debug-handler assertion it mirrors). No cookie; the token travels in the join
options; the generic join error never says why. **PRs**: (1) `adminAuth.ts` pure with `adminAuth.test.ts`; (2)
`AdminRoom`, `AdminView`, the `server.ts` block and `adminRoom.test.ts`; (3) `handlers/admin.ts` (the commands
into `autoOf(room).commands`), `admin.snapshot` every tick, the docs. **Tests**: `auto-admin.md` 7's list; a
`party` client in the same server never receives `Avatar.seat` alive nor any `admin.*`. **Not**: `PartyRoom.ts`
beyond its pre-seeded lines, `Auto.ts`, `Visibility.ts` beyond the pre-seeded line, any client file. Before
code, `seams.md`; log under "Round 6 log: 6C".

**6D. Admin client.** Build `#/admin`: the sign-in button, the controls, the grid of up to six scene viewports
rendered from the god view, the seat inspector and the log pane, on a mock first and on the live `admin` room
once 6C lands. **Owns** `apps/client/src/admin/**`, `scenes/Admin.ts`, the optional label of
`view/EntityView.ts`, the `remoteDelayMs(scale)` parameter of `view/interpolation.ts`, new
`apps/client/e2e/admin.spec.ts` (mock, opt-in `WDI_E2E_ADMIN=1` for the live case), new `ui/copy/admin.ts`, the
"Round 6 (6D)" block of `components.css`, UI.md 14.18. **Reads** `auto-admin.md` 6 and 8; `seams.md` 1.4;
`docs/UI.md` 1-5 (the DOM system). One Phaser game; `AdminSceneView` reuses the world views and owns no feed of
its own. **PRs**: (1) the route, the scene, the sign-in and the controls on `mockAdmin.ts`; (2) the viewport
grid and `AdminSceneView` with the label; (3) the inspector, the log pane, `admin.spec.ts`, UI.md 14.18; (4)
after 6C merges, `AdminNet.ts` on the live room. **Tests**: `auto-admin.md` 8's list. **Not**: `World.ts`,
`worldRouter.ts` beyond the pre-seeded route line, any server file. Before code, `seams.md`; log under "Round
6 log: 6D".

**6E. M5b content and GDD 3.14-3.16.** Write the rows: resources, recipes, mobs, quests and mini-games, the
tool items, the balance numbers, the nodes, spawners and givers on every scene of both maps, and the
cross-reference checks; then write GDD 3.14 to 3.16 from them. **Owns** `packages/content/data/{resources,
recipes,mobs,quests,minigames}.json`, their schemas under `packages/content/src/schemas/`, `checkM5b` in
`validate.ts`, the new rows of `items.json`, the `resources`, `mobs`, `quests` and `vision.lanternTiles` rows
of `balance.json` and their schema lines, the `nodes`, `spawners` and `givers` arrays of the scene files
(nothing else in them), GDD 3.14-3.16, WORLD 4's economy notes, the content tests. **Reads** `m5b-data.md` 1;
`owner-brief.md` 2 Book IV (what fits round 6) and 3; `bible-seams.md` 2.2 (what waits for round 8); GDD 3.5,
3.6, 3.7, 3.13; WORLD 4.2-4.10; `scene.ts:235-275`. Ids are stable from the first PR (6F to 6M build on them).
**PRs**: (1) resources and recipes with the tool items and `checkM5b`; (2) mobs and the spawners; (3) quests,
givers and the mini-games; (4) the nodes on every scene, the balance rows, GDD 3.14-3.16. **Tests**: every
cross-reference of the table; a scene with a node names a resource; every recipe is craftable from gatherable
inputs on its map. **Not**: code outside the content package. Before code, `seams.md`; log under "Round 6
log: 6E".

**6F. Gathering and crafting.** Make nodes gatherable as a hold, give seats an inventory, and let them craft
the six tools at stations. **Owns** `apps/server/src/sim/{Resources,Craft,Inventory}.ts`, the `gather` and
`craft` hold cases of `sim/Actions.ts`, new `apps/server/test/{resources,craft,inventory}.test.ts`, the GDD
3.14 sentences marked "(6F)" (the hold and respawn behaviour, if 6E's text differs from what lands). **Reads**
`m5b-data.md` 1 and 2.1; `seams.md` 1.3; GDD 3.5 and 3.14; `Actions.ts`'s `collect` case (the hold pattern it
copies). The node pool draws from `seeds.get('nodes')` only. **PRs**: (1) `Resources.ts` and the pool with
`resources.test.ts`; (2) `Inventory.ts` and the `gather` hold; (3) `Craft.ts` and the `craft` hold. **Tests**:
the pool fraction, respawn in ticks, a gather interrupted by movement, five slots, a craft refused without a
station in reach. **Not**: `Visibility.ts`, `Mobs.ts`, `Quests.ts`, any client file. Before code, `seams.md`;
log under "Round 6 log: 6F".

**6G. Mobs and dark visibility.** Spawn mobs from the scenes' spawners, drive them with a small FSM on keyed
streams, let a wolf kill in the dark, and make darkness real on the server: a living seat sees avatars in a
dark scene only within its radius and line of sight, lanterns widen it both ways. **Owns**
`apps/server/src/sim/Mobs.ts`, `sim/mobs/**`, `sim/Sight.ts`, the `canSee` filter line of `reconcileAvatars` in
`sim/Visibility.ts`, the lantern bit line of `publishAvatars` in `sim/Avatars.ts`, the `wolf` cause in
`sim/Kill.ts` and `sim/Death.ts`, new `apps/server/test/{mobs,sight}.test.ts` and the dark cases of
`visibility.test.ts`, the GDD 3.15 sentences marked "(6G)" and the 3.7 lantern line. **Reads** `m5b-data.md`
1 and 2.2; `seams.md` 1.3; GDD 3.6, 3.7, 3.15; `npc/walk.ts` (the pathing it reuses); `deck-wire.md` 6 (the
privacy invariants it must keep). **PRs**: (1) `Mobs.ts`, `spawn.ts`, `ai.ts` and the wire with `mobs.test.ts`;
(2) the wolf kill and the NPC flee; (3) `Sight.ts`, the filter line, the lantern bit and `sight.test.ts`.
**Tests**: the FSM transitions; a wolf never leaves its leash; 10 NPC seats plus 3 wolves at p95 tick < 15 ms;
a seat beyond the radius or behind a wall receives no avatar; a ghost receives all. **Not**: the NPC routines,
`Craft.ts`, `Resources.ts`, any client file. Before code, `seams.md`; log under "Round 6 log: 6G".

**6H. Quests and mini-games.** Let givers hand out fetch quests and take them back, and turn a station task's
hold into a server-checked mini-game the client plays, the same one for a Cabal seat's fake task. **Owns**
`apps/server/src/sim/{Quests,Minigames}.ts`, the `packages/shared/src/rules/minigames.ts` bodies and new
`packages/shared/test/minigames.test.ts`, the quest and mini-game cases of `sim/Commands.ts`, the `task` hold of
`sim/Actions.ts`, new `apps/server/test/{quests,minigames}.test.ts`, the GDD 3.16 sentences marked "(6H)".
**Reads** `m5b-data.md` 1 and 2.3; `seams.md` 1.1 and 1.3; GDD 3.5 (the fake list) and 3.16; `onub-contract.md`
2.3 (the four mini-game kinds). A `contract` quest refuses in round 6. **PRs**: (1) the pure rules with their
tests; (2) `Quests.ts` with `quests.test.ts`; (3) `Minigames.ts`, the task hold and `minigames.test.ts`.
**Tests**: `generate` is deterministic per rng; a wrong answer completes nothing; a Cabal fake task never moves
`taskBar`; a quest reward goes through `Inventory`. **Not**: `Resources.ts`, `Mobs.ts`, any client file. Before
code, `seams.md`; log under "Round 6 log: 6H".

**6I. M5b client.** Draw nodes, mobs and givers, build the inventory, crafting and quest panels and the hold
prompts, and wrap the ONUB mini-game widgets in a main-mode modal. **Owns** `apps/client/src/view/{NodeView,
MobView,GiverView}.ts` with tests, `ui/{Inventory,Crafting,QuestLog}.ts` with tests, `view/minigames/**`, the
lantern glow of `view/Lighting.ts`, the `nodes`, `mobs`, `quests` and `minigame` readers of
`net/worldColyseus.ts` and `net/mock/worldMock.ts`, new `ui/copy/m5b.ts`, the "Round 6 (6I)" block of
`components.css`, new `apps/client/e2e/m5b.spec.ts` (mock), UI.md 14.19. **Reads** `m5b-data.md` 1-3;
`seams.md` 1.4; UI.md 1-5; `view/onub/minigames/` (the widgets it imports). **PRs**: (1) the three views on the
mock; (2) the inventory and crafting panels with the hold prompts; (3) the quest log and the mini-game modal;
(4) `m5b.spec.ts`, UI.md 14.19, and after 6F-6H merge, the live readers. **Tests**: each panel on the mock; the
spec gathers, crafts a lantern, turns in a quest. **Not**: `worldRouter.ts`, `admin/**`, `World.ts` beyond
constructing the views on the pre-seeded lines, the ONUB widgets' files. Before code, `seams.md`; log under
"Round 6 log: 6I".

**6J. Cutscenes.** Write the HollowMere opening and the five death cutscenes as data, play them in-engine with
captions, camera and sound, and send them from the server at the right moments. **Owns**
`packages/content/data/cutscenes/**` and `schemas/cutscenes.ts`, the `packages/shared/src/rules/cutscenes.ts`
bodies with a test, `apps/client/src/view/cutscene/**` with tests, new `ui/copy/cutscenes.ts`, the `beginPlay`
broadcast and `balance.phases.openingS`, the `markDead` `cutsceneId` line, the play hooks in `scenes/World.ts`
(the two pre-seeded lines filled), the opening in `mock/worldMock.ts`, new `apps/client/e2e/cutscene.spec.ts`
(mock), the "Round 6 (6J)" block of `components.css`, UI.md 14.20, the GDD 3.18 cutscene paragraphs and the
GDD 3.3 `openingS` line. **Reads** `cutscene-music.md` 1; `seams.md` 1.1-1.4; `owner-brief.md` 2 Book I.1 (the
narration); GDD 3.3. No new phase; the server never waits for a client. **PRs**: (1) the schema, the index,
the rules and the server lines with `openingS`; (2) the sequencer and the player on the mock; (3) the five
death cutscenes, the HollowMere opening's captions, `cutscene.spec.ts`, the GDD lines. **Tests**: the sequencer
(timeline, `withPrevious`, `maxS`, Skip); the spec's caption, Skip and ghost handoff. **Not**: `Transition.ts`,
music, `worldRouter.ts`. Before code, `seams.md`; log under "Round 6 log: 6J".

**6K. Loading, transitions, trailer, budgets.** Give the game a loading screen with tips, animated transitions
between the scenes the router starts, the landing trailer loop, and the media budget test. **Owns**
`apps/client/src/view/{LoadingScreen,Transition}.ts` with tests, new `ui/copy/tips.ts`, the video element of
`ui/Landing.ts`, the bodies of the pre-seeded `transition` wrappers in `net/worldRouter.ts` (the call sites
stay), new `tools/sprites/test/media.test.ts`, the shape of `assets/video/manifest.json`, the "Round 6 (6K)"
block of `components.css`, UI.md 14.21, ASSETS 6.8's round-6 text, the GDD 3.13 `transitionS` line and
`balance.ui.transitionS`. **Reads** `cutscene-music.md` 2; `media.md` 2 and 3; `seams.md` 1.4 and 1.5; ASSETS
6.8. Reduce-motion makes every duration 0. **PRs**: (1) `Transition.ts` and the wrappers, with `transitionS`;
(2) `LoadingScreen.ts` and the tips; (3) the trailer element, `media.test.ts`, the manifest shape, ASSETS 6.8.
**Tests**: `transition` resolves on `transitionend` and on timeout; the loading screen never shows under 300
ms; `media.test.ts` passes on the empty manifests and fails on a constructed oversize entry. **Not**:
`World.ts`'s camera fade, the cutscene player, music. Before code, `seams.md`; log under "Round 6 log: 6K".

**6L. Music.** Give the game music that follows the phases per map, with a settings panel for music and SFX
volume, lazy-loaded within its own budget. **Owns** `apps/client/src/view/{MusicBus,MusicDirector,
audioSettings}.ts` with tests, new `ui/SettingsPanel.ts` with a test, `AudioBus.setSfxVolume` and the `narr_*`
and `sting_*` keys in `view/AudioBus.ts`, `packages/content/data/music.json` and `schemas/music.ts` with the
playlist-id test, the shape of `audio/music/manifest.json`, the beds for the playlist slots the owner's tracks
leave empty (fetched by id from the ROSW sound library with its `sound-library` skill and mastered as `media.md`
1; a CC0 bed only for a slot the library cannot fill, listed to the owner first) and their CREDITS rows, new
`ui/copy/settings.ts`, the "Round 6 (6L)" block of `components.css`, UI.md 14.22, the GDD 3.18 music paragraphs.
**Reads** `cutscene-music.md` 3; `media.md` 2, 4 and 7; `seams.md` 1.4; ROSW `sound-library/README.md`; ASSETS
6.5 (the CC0 sources, as the fallback). The server sends no music message; `AUDIO_KEYS` stays an SFX union.
**PRs**: (1) `MusicBus.ts` and `audioSettings.ts` with the settings panel; (2) `MusicDirector.ts`, `music.json`
and the schema; (3) the slot beds, the manifest rows for them, the GDD lines. **Tests**: the crossfade swaps
elements; a class change in the same phase does nothing; the settings persist; the budget test (6K's) passes
with the beds. **Not**: SFX files, the cutscene `audio` steps, 6N's tracks and stingers. Before code, `seams.md`; log under "Round 6 log: 6L".

**6M. M5b art.** Make the sprites M5b draws, in both styles: nodes in two states, the four mobs in eight
directions, the givers, the six tools as icons and held overlays, the lantern and torch glows. **Owns**
`tools/sprites/placeholder-m5b.ts`, the sprite sources and exports under the keys SPRITES.md names, the
manifest entries in both style manifests, SPRITES.md's round-6 section, CREDITS and MANIFEST rows. **Reads**
`m5b-data.md` 4; `art-plan.md` (round 5) 1.3 and its appendix (the style); SPRITES 10 and 11; ASSETS 6.5.
**PRs**: (1) the placeholders for every key; (2) nodes and tools; (3) mobs; (4) givers and glows. **Tests**:
`manifest.test.ts`, `budget.test.ts`, `palette.test.ts` as they stand. **Not**: code outside `tools/sprites`.
Needs 6E's ids first. Before code, `seams.md`; log under "Round 6 log: 6M".

**6N. ROSW media (both repos).** Ingest the owner's eleven files into the ROSW sound library from the release
the owner attaches them to, pick the stingers, the narration bed and the ambiences from the catalog by ear,
fetch every sound by id and master it, make the two videos with `video-shot`, and land the binaries and rows
here. **Owns** in ROSW: the `sound-library` ingest (the `catalog.json` commit, never a file under
`sound-library/files/`), the `video-shot` runs under `studio/`, the studio notes the pipeline writes, the
`studio/library/catalog.json` entries; here: `apps/client/public/assets/video/**`,
`apps/client/public/assets/audio/music/**`, the SFX, stingers and ambiences under
`apps/client/public/assets/audio/`, the rows of both media manifests and `audio/manifest.json`,
`assets/source/MANIFEST.md`, CREDITS rows. **Reads** `media.md` (all); `cutscene-music.md` 2 and 3 (the
shapes); ROSW `sound-library/README.md` and the `sound-library` skill first, then `studio/vault/CLAUDE.md` and
the `render-pipeline` skill for the videos. Never commits an original; never a link to an uploaded input;
never edits `catalog.json` by hand; asks before `--replace`. **PRs**: ROSW: (1) the catalog commit of the
ingest; (2) the video runs; here: (1) the SFX, stingers and ambiences with their rows; (2) the music with its
rows; (3) the two videos and the poster with their rows. **Tests**: `media.test.ts` passes with every file in
place; the library's own tests and `verify` after the ingest. **Not**: any `.ts`, any JSON under `packages/`,
`music-cue`. Needs the `SFX_2026_01` release of ROSW (the library zips are on it; the owner's two zips of
`media.md` 1 and 6 still to attach) and the manifest shapes of 6K and 6L. Before code, `seams.md`; log under
"Round 6 log: 6N".

**6P. Integration.** Merge in the order above, regenerate `PROTOCOL.md` and the lockfile, run the 50-match
`pnpm auto` soak on both maps, both modes and every difficulty, the two 30-minute soaks and the opt-in e2e
suites, fix what breaks in the seams, and write the integration log and DECISIONS A97. **Owns** the merges,
`pnpm-lock.yaml`, `docs/PROTOCOL.md`, "Integration log, round 6" below, DECISIONS A97; the Railway variables
are set by the owner from `auto-admin.md` 7. **Reads** everything. **Not**: new features; a fix that is a
session's goes back to it. Log under "Integration log, round 6".

**6Q. Opening cinematic (added 2026-10-22, DECISIONS A98).** Play the owner's opening cinematic before the menu:
a new `scenes/Intro.ts` that `Preload` starts before `Landing` (never before `Admin`), showing the poster with a
"tap to begin" control (the tap unlocks audio), then the video with its own sound, Skip on tap or Esc, once per
browser session (`sessionStorage['wdi:introSeen']`), skipped under `prefers-reduced-motion`, `saveData`,
`?intro=0` and in the mock e2e unless `?intro=1`; then `Landing` as today, where the `lobby` playlist (the owner's
theme, 6N) starts as it does now. **Owns** `apps/client/src/scenes/Intro.ts` with tests, `ui/copy/intro.ts`, the
"Round 6 (6Q)" block of `components.css`, the `first` line of `Preload.ts` (a locked line, granted), the `intro`
exception of `tools/sprites/test/media.test.ts` (one video key may be 5 MB, streamed, outside the first-load
count) and the matching ASSETS 6.8 sentence, `e2e/intro.spec.ts`, UI.md 14.24. **Reads** `media.md` 1, 3 and 6;
`docs/UI.md` 1-5; `view/MusicBus.ts` and `view/MusicDirector.ts`; `scenes/Preload.ts` and `scenes/Landing.ts`
(read only). **PRs**: (1) the scene on a stand-in clip (a 2 s generated test video under `apps/client/e2e/fixtures/`,
never under `public/`), the flag and the budget line; (2) `intro.spec.ts`, UI.md 14.24, the log, the A98 fill-in.
**Tests**: skip, once per session, reduce-motion, `?intro=0`, the admin route untouched, the budget line. **Not**:
`Landing.ts`, `World.ts`, `worldRouter.ts`, anything under `public/assets/` (6N lands `intro.webm`, its poster,
`landing_loop.webm` and the theme), `music.json`, `MusicBus.ts`. Before code, `seams.md`; log under "Round 6 log:
6Q".

### Round 6 log: 6Z (round-6 contract and pre-seed)

- **Documents and settings (2026-10-22).** `docs/round6/` written (`README`, `owner-brief`, `auto-admin`,
  `cutscene-music`, `m5b-data`, `bible-seams`, `media`, `seams`); this section; ROADMAP M5b's definition of
  done and the M5c, M5d and round 7-9 rows; DECISIONS A81 and the reserved rows; GDD 3.14-3.16 pointers, 3.18
  and 3.19 stubs; ARCHITECTURE 5.11's pointer; `docs/README.md`; `CLAUDE.md` "Compact instructions" and
  `.claude/settings.json` (`autoCompactWindow` 400000) here and in ROSW, with the `render-pipeline` Kinds line
  there. DECISIONS A80 had been taken by the art-style switch (5N) while this round was planned, so the round's
  rows start at A81.
- **Pre-seed (2026-10-22), six commits on the same branch and PR**, each green on `pnpm lint && pnpm typecheck &&
  pnpm test`: f83f419 the wire and schema (`seams.md` 1.1); 128ab5d the content stubs (1.2); b04fc0c the server
  stubs and locked call sites (1.3); bc21222 the client stubs and mount lines (1.4); e9fee71 `tools/auto` and the
  harness stubs (1.5); 9ede8c8 the `soak.yml` `auto` job (1.5). The branch rule of this session allowed one
  branch, so the steps are commits of PR #47 rather than six PRs; `seams.md` 1 now reads as landed, with line
  numbers. Two deviations from the plan text, recorded in the documents: `transition(kind, ms, then)` takes a
  callback and runs it synchronously at 0 ms, so the router tests keep their timing; the `nodes` and `mobs`
  streams already existed in `sim/seeds.ts`, so only `contract` and `events` were added. Nothing the code at
  a60d855 reads was removed or made required; the one baseline flake seen (`impersonate.test.ts`, a 120 ms sleep
  under load) passed on every clean run.
- **Audio route (2026-10-22, after the pre-seed).** The owner: "for the music, SFX and more use the pipeline's
  new SFX skill". ROSW main had merged its `sound-library` (PR #11: 2,648 owner recordings catalogued, the
  originals on GitHub Releases, a `sound-library` skill). `media.md` now routes every sound through it (the
  eleven uploads as a release batch, the stingers and ambiences by catalog id, candidates listed in its
  section 4, provenance rows in 7), `music-cue` leaves round 6, the 6L and 6N briefs, DECISIONS A81, ROADMAP
  M5c, `CLAUDE.md`, ASSETS 6.10 and the MANIFEST header follow, and the ROSW branch merges main and points the
  `sound-library` skill at `media.md`.
- **The owner's answers (2026-10-22, later).** Flow Music (model Lyria 3 Pro) made the three OuterSkylight
  tracks; `Trailer_Audio` is the start screen's trailer and credits piece; `HollowMere_`, `Port_Au_Levain` and
  `My_Song` (renamed `BlackPine`) are the three maps' loading-screen speech pieces, so `music.json` gains the
  class `loading` (`schemas/music.ts`, `cutscene-music.md` 2 and 3, `media.md` 4). 6Z zipped the eleven files as
  the two batches of `media.md` 1 and handed them back; the owner publishes the `sfx-2026-10` release (none exists
  yet). The admin gate keeps no password (`auto-admin.md` 7).
- **For the sessions**: `adminConfig` returns null and `AdminRoom` is unregistered, so no admin surface exists until
  6C; the quest and mini-game commands and the gather and craft holds refuse 422 until 6F and 6H; the Step stages
  `runAuto`, `runResources`, `runMobs`, `runQuests` and `runEvents` are no-ops; every new content record is
  empty; `pnpm auto` exits 2 with its usage.

### Round 6 log: 6A (time scale, auto mode, headless harness, CLI)

- **Three steps on one branch and one draft PR (2026-10-22)**, each commit green on `pnpm lint && pnpm typecheck &&
  pnpm test`: (1) `sim/auto/clock.ts` (`stepsThisTick` with the pause, the single steps, the budget guard and the
  carry; `effectiveScale` over the last 20 ticks) and the writer test; the `PartyRoom` loop was already the
  pre-seed's, so it is unchanged; (2) `sim/auto/Auto.ts` (`enableAuto`, `queueAutoStart`, `applyClock`, `runAuto`
  draining `start`, `setup`, `reset`, `clock`; `autoOptionsProblem`), `test/autoHelpers.ts runAutoMatch` on
  `advance` and a one-day match per mode in `auto.test.ts`; (3) the determinism test, the clientless dispose, the
  `party` room at one step per tick, `tools/auto/run.ts` with the seed derivation in `args.ts`, GDD 3.19, the
  ARCHITECTURE Start-flow sentence and DECISIONS A83. `preyFor` and the `startRefusal` auto line were complete in
  the pre-seed and stay as they were.
- **Measured.** A full 8-seat match runs headless in 1.1 to 1.7 s (main, about 18 000 steps) and 0.4 to 0.5 s
  (quick mode); two runs with the same seeds and seat ids gave the same digest in both modes, and `pnpm auto`
  printed the same lines twice for the same flags. A clientless room is disposed by Colyseus's seat-reservation
  timer (15 s by default) after `onCreate`; the harness disconnects its room itself.
- **For 6B.** `runAutoMatch` subscribes to the nine kinds of `auto-admin.md` 5 with `onSim` (`AUTO_EVENT_KINDS`), so
  `AutoResult.events` fills once `runEvents` delivers; `digest` stands in for `logHash` until `log.ts` lands; a
  `step` that throws is recorded as the failure `step`. `run.ts` needs one import of `./checks` when the
  invariants register there. **For 6C**: every admin command is an `AutoCommand` pushed onto
  `autoOf(room).commands`; `effectiveScale(clockOf(room))` is the snapshot field.
- **Seen in passing, for the owner and 6P.** All six distinct full main-mode probes (7 and 8 seats, normal and
  hard) ended in a Cabal win after the Final Night, and the two whose match log was read had one and two kills: the
  NPC Killer strikes only when alone with its prey (`preyFor`), which an all-NPC party rarely gives it. That is GDD 3.12 behaviour, not a harness fault; the 50-match
  soak will say whether it needs a balance look.

### Round 6 log: 6B (event bus and invariants)

- **Three steps on one branch and one draft PR (2026-10-22)**, as 6A did, each commit green on `pnpm lint && pnpm
  typecheck && pnpm test`: (1) `sim/events/bus.ts` delivers (`ANY_SIM` added), `sim/auto/log.ts` keeps the match's
  events and `logHash`, the emitters in `Kill.ts`, `Death.ts`, `Clues.ts` and `Meeting.ts`, and the bus tests of
  `invariants.test.ts`; (2) the seven invariants in `sim/auto/invariants.ts` with `guardStep`, each tested firing on a
  constructed failure and quiet on clean rooms; (3) `tools/auto/checks`, `tools/auto/report`, the `soak.yml` `auto`
  leg (guard off, difficulty in the matrix, `--seed` from the run number), DECISIONS A84 and this entry. `log.ts` moved
  from step 3 to step 1 because the bus delivers into it and `killClues` reads it.
- **Emitters.** `phase`, `start` and `end` come from the bus watching the phase, so `Phases.ts` and `Win.ts` carry no
  emitter and the match log's `event: 'auto'` line is written by `log.ts` at an auto room's `end` (DECISIONS A84). The
  four one-line calls for the orchestrator to confirm: `Kill.ts` before `markDead`, `Death.ts markDead` after the death
  is queued, `Clues.ts spawnClue` after the clue is set, and `Meeting.ts` in `openMeeting`, `handleVote`, `startReveal`
  and the quick-mode `outs` loop.
- **Measured.** 36 probe auto matches (both maps, both modes, three difficulties, 4, 7 and 10 seats) ran with no
  failure; the main-mode ones had 2 to 4 kills each, so `killClues` runs on real kills; `logHash` and the `auto` line
  replay identically for the same seeds and seat ids.
- **For 6A and 6C** (contract requests in the PR): `run.ts` gains `import './checks'`; `AutoResult` can carry
  `logHash(room)` beside `digest`, read before the room is disconnected; the admin room sends `admin.event` from an
  `onSim(room, ANY_SIM, ...)` listener and dedupes `admin.invariant` (the pure checks repeat while the state holds;
  `npcStuck`, `step` and `killClues` report each incident once).

### Round 6 log: 6C (GitHub auth and AdminRoom)

- PR 1 (`claude/r6-admin-server`): `services/adminAuth.ts` filled and pure. `adminConfig` is null unless `WDI_ADMIN=1`
  and all five variables are set, the key is at least 32 characters and the client URL is http(s). The state and the
  token are HMAC-SHA256 under the one key with a purpose prefix, so neither verifies as the other; `verifyAdminToken`
  checks the allowlist again, so dropping a login from the variable locks it out within the token's life. Every
  callback failure answers the same 403, and the callback is rate limited globally (20 burst) before it spends a
  GitHub call. `adminAuth.test.ts`: 17 tests with a fake `fetch` and a fake `now`.
- PR 2: `AdminRoom` and `sim/auto/AdminView.ts`. `onAuth` runs for create and every join: no config, a wrong build
  or a token that does not verify (absent, forged, expired, off the allowlist) all throw the generic join error.
  `onJoin` gives no seat and `client.view = createAdminView(room)`; the view holds every `Player` with the `presence`
  and `priv` tags and every avatar with the `ghost` tag, topped up by `reconcileAdminView` on the shared 5 Hz pass. A
  second client is refused; a leave or a drop disposes the room (no reconnection window). `isAdminClient` reads a
  per-room mark that only `AdminRoom` sets, so it is false in every `party` room without `Visibility.ts` importing the
  room. `adminRoom.test.ts` (8) and the gate test in `adminAuth.test.ts` (2) are one file each because a second
  `boot` in one process resets its first request (UND_ERR_SOCKET).
- PR 3: `rooms/handlers/admin.ts`, the per-tick feed in `sim/auto/AdminView.ts` and the docs. The four handlers
  validate and push `setup`, `start`, `reset` and `clock` onto `autoOf(room).commands` (32 at most), refusing a bad
  payload with a 422 and no change. `AdminRoom.setFixedTimestep` wraps the room's step: after it, `publishAdmin` sends the new invariant failures, the tick's events and `admin.snapshot`. The snapshot
  reads the clock through `AdminView.ts` (inside `sim/auto/`, where `auto.test.ts` allows `clockOf(`). `coverOf` is
  the card's own look, set only for a cover role whose public look differs. Failures are kept (200 at most) until
  Reset. Docs: ARCHITECTURE 5.11, the README Railway notes, DECISIONS A85. Tests: 6 wire tests in
  `adminRoom.test.ts`, one a todo (see the contract request below). Mutation check: without the drain step in
  `stepsThisTick` the paused-Start test fails.
- **Contract request to 6A** (also in the PR description): `stepsThisTick` returns 0 for a paused clock with no
  `pendingSteps`, and `PartyRoom` then skips `step`, so `runAuto` never drains `autoOf(room).commands` while paused.
  After `admin.reset` (which pauses) the next `start`, and the `paused: false` that would follow it, would wait for ever.
  Answered by 6Z (6A is archived): `stepsThisTick(clock, lastTickMs, queuedCommands)` returns 1 for a paused clock with
  queued commands and none pending (`PartyRoom` passes `autoOf(this).commands.length`); test in `auto.test.ts`; the
  local stand-in `grantDrainStep` is gone. The admin feed subscribes per kind (`ADMIN_EVENT_KINDS`: kill death clue meeting vote eject phase start end; 6Z
  declined the `ANY_SIM` switch) and forwards them as `admin.event`; the test in `adminRoom.test.ts` emits one and reads it on the wire.

### Round 6 log: 6D (admin client)

- **Branch `claude/r6-admin-client`, draft PR #66 (2026-10-22)**: (1) the route, scene, sign-in, controls and
  `mockAdmin.ts`; (2)-(3) the viewport grid with `AdminSceneView`, the label of `EntityView`, the seat inspector, the log
  pane, `e2e/admin.spec.ts` and UI.md 14.23 as one commit; (4) `AdminNet.ts` on the live room (6C had merged, so
  `connectAdmin` is written and unit-tested against a fake client with the wire of `protocol/admin.ts`; the live e2e
  case is opt-in, `WDI_E2E_ADMIN=1` with `WDI_E2E_ADMIN_TOKEN`).
- **Contract requests**: `readFlags` (`flags/index.ts`) read `route[0]` with its query (`admin?token=...`), so the GitHub
  callback never started the Admin scene; 6Z granted the one-line edit and 6D made it (with a flags test and the e2e case);
  UI.md 14.18 was already the art-style switch,
  so the admin page is 14.23; `AdminSeat` carries no inventory or notebook (open item for round 7: the snapshot is 6C's).
- **Tests**: `admin/*.test.ts` (model, token capture, the connect wire, controls, panels, the viewport maths), `EntityView`
  label, `remoteDelayMs`; `e2e/admin.spec.ts` on the mock (8 pass, 1 skipped: the live case is opt-in). The e2e build needs `pnpm --filter @wdi/content build` first in a fresh checkout.

### Round 6 log: 6E (M5b content and GDD 3.14-3.16)

- **One PR, four commits (2026-10-22)**, #49, each green on `pnpm lint && pnpm typecheck && pnpm test`, as 6Z did
  with one branch: (1) resources, recipes, the material items and the Spade, `checkM5b`'s craft checks; (2)-(3) mobs,
  quest npcs and quests, the harbourmaster's giver on the overworld, mini-games and their checks; (4) nodes on
  Gallows Wood and the Tin Gallery mouth and bats there, the per-profile craft check, `vision.lanternTiles` 2, GDD
  3.14-3.16, the WORLD 4.6 economy note, DECISIONS A87. Ids for 6F-6I and 6M: resources `timber`, `stone`, `tinOre`,
  `resin`, `herb`, `mushroom` (sprites `node_<snake>`); recipes = their tool ids `torch`, `snare`, `spade`,
  `lockpicks`, `lantern`, `crowbar`; mobs `wolf`, `boar`, `bat`, `rat` (sprites `mob_<id>`); npcs `harbourmaster`,
  `moll`, `foreman`, `smith`, `collier` (all `villager`); quests `caulkTheSkiff`, `mollsHerbs`, `mollsMushrooms`,
  `stackTheYard`, `smithsOre`, `colliersStone` (copy ids `quest.<id>`); mini-games `lanternPour`, `pumpSlide`,
  `letterSlide`, `fenceCrates`, `flourCrates`.
- **Contract notes for the orchestrator**: `seams.md` 1.2 still lists `gatherHoldS` (now `stackMax`);
  `schemas/items.ts` gained the `material` kind (one line). One baseline flake seen under full-suite load
  (`onubNight.test.ts`, a 422 not yet received); it passed alone three times and on the rerun.

### Round 6 log: 6F (gathering and crafting)

- **One branch, `claude/r6-gather-craft`, three commits (2026-10-22)**: (1) `Inventory.ts` and the node pool with
  `inventory.test.ts` and `resources.test.ts`; (2) the `gather` hold; (3) `Craft.ts`, the `craft` hold and `craft.test.ts`.
  For 6H: `addStack(player, item, qty): boolean`, `take(player, item, qty): boolean`, `count(player, item): number`
  and `exchange(player, takes, gives): boolean` (a turn-in is one `exchange`), all in `sim/Inventory.ts`.
- **Touched outside Owns**: `sim/Hold.ts` `runHolds` hands `gather`/`craft` holds to `tickGather`/`tickCraft`
  (without it the clue check cancels them every tick); `test/npcRoutine.test.ts` R17 allows the `nodes` stream beside `npcNames`. `Node` on the wire is `{ id, resource, x, y, active, respawnTick }`
  (not `carriedTicks` as `m5b-data.md` 2.1 says). GDD 3.14 (6F) sentences corrected. DECISIONS A88.

### Round 6 log: 6G (mobs and dark visibility)

- **Branch** `claude/r6-mobs`, one draft PR against `claude/zen-turing-m1jnw0` with the brief's three steps as three
  commits, each green on `pnpm lint && pnpm typecheck && pnpm test`, as 6E and 6K did with one branch.
- **Step 1-2, creatures, the wolf kill, the NPC flee** (2026-10-22): `sim/Mobs.ts`, `sim/mobs/{ai,spawn,hurt,light,
  flee}.ts`, `creatureKill` in `Kill.ts` (the `wolf` cause; `Death.ts` needed no change, `DeathCause` already had
  it), `test/mobs.test.ts` (the FSM, spawn by part of the day, the leash over two minutes, a two-bite wolf kill, a
  lit lantern, a bat's floor at 1 HP, the NPC flee, 10 seats and the wolves under 15 ms p95).
- **Step 3, dark sight**: `sim/Sight.ts` `canSee`, the lantern bit line of `publishAvatars`, `test/sight.test.ts`
  and the dark cases of `visibility.test.ts`; GDD 3.7's lantern line and the (6G) sentences of 3.15; DECISIONS A89.
- **What the client reads** (6I, 6M): `SceneState.mobs`, keyed by spawner id: `kind` (sprite `mob_<kind>`), `x`, `y`
  (world px), `yaw` (world frame as `Presence.yaw`; the atlas direction is `dirFromVector(sin yaw, -cos yaw)`
  through the iso table), `animId` (`AnimId.idle`, `walk`, `swing` = the attack frames); `state` needs no reader.
  `Avatar.statusBits & StatusBit.lantern` is a lit light, own avatar included.
- **Contract requests** (in the PR description, each with its stand-in): `act.light { on }` in `C2S` routed to
  `handleLight` (`sim/mobs/light.ts`); one line in `npc/world.ts` `runWorldNpc` calling `fleeCreature`
  (`sim/mobs/flee.ts`); the `reconcileViews` fix (applied in the PR: a P5 leak on the base, see A89).

### Round 6 log: 6H (quests and mini-games)

- **Three steps on one branch and one draft PR (2026-10-22)**, each commit green on `pnpm lint && pnpm typecheck &&
  pnpm test`: (1) `rules/minigames.ts` and `packages/shared/test/minigames.test.ts` (the four kinds, replayed answers);
  (2) `sim/Quests.ts` and `test/quests.test.ts`; (3) `sim/Minigames.ts`, the `task` branch in
  `sim/Hold.ts`, `test/minigames.test.ts`, the GDD 3.16 (6H) sentences and DECISIONS A90. The branch rule of this round
  allows one branch, so the steps are commits of one PR rather than three.
- **Contract requests (for the orchestrator)**: (a) done: 6F's `sim/Inventory.ts` landed (#61); the stand-in is deleted and
  the quest turn-in is one `exchange`. (b) done: the `minigame` stream (#65) is in use, `seeds.get('minigame', seat)`. (c) done: `Win.ts` clears `priv.quests` in the reset and `runQuests` no longer clears in the lobby. (d) The `task` branch of `handleHold` is in `sim/Hold.ts` (the brief says `Actions.ts`, which only dispatches
  to it); six lines, a call into `Minigames.ts`.
- **Gap found, for the orchestrator and the owner**: the base has no main-mode task layer. Nothing assigns
  `Private.tasks` (the `tasksEach` rows of `balance.json` are read by no code), nothing picks a deliverable up at its
  source prop, `GameState.taskBar` was never written, and `Win.ts` never checks it for the Village win. 6H wrote what
  its brief names (the hold that opens the mini-game, the check, the completion, the bar's recompute) and tests it on
  fixtures that give a seat a task and its tool by hand, so in a live match the modules are inert: a seat has no task to
  open. The assignment (3 to 5 per seat from `tasks.json`, the fake list for the Cabal under `tasks.cabalFakeList`),
  the pickup at the source and the 100% win line are a session of their own; ROADMAP M5b's definition of done should
  not count the station tasks as playable until it lands.
- **Measured / checked**: the new tests are 9 (shared), 9 (quests) and 8 (mini-games); a mutation that accepts any
  answer fails three of the mini-game tests.

### Round 6 log: 6I (M5b client)

- **Steps on one branch and one draft PR (`claude/r6-m5b-client`, 2026-10-22)**, each commit green on `pnpm lint &&
pnpm typecheck && pnpm test`: (1) the three views, `Lighting.ts` glow, the mock and Colyseus readers
  (`net/mock/m5bMock.ts`, `net/worldColyseus.ts`, `view/{NodeView,MobView,GiverView,m5bFrames}.ts`); (2) the pockets,
  crafting and quest panels, the prompt layer, the mini-game modal, copy and CSS; (3) `e2e/m5b.spec.ts`, UI.md 14.19,
  this log and DECISIONS A91.
- **Contract requests, granted by 6Z on #67 and done in the PR, so no stand-in lands**: (a) `WorldFeed` gained
  `inventory()`, `questAccept(id)`, `questTurnIn(id)` and `light(on)` with `StackSnap` beside the other snaps in
  `net/world.ts`; the Colyseus feed and the mock implement them and `net/m5b.ts` is deleted. (b) `World.ts` constructs
  `mountM5bLayer` beside the three views, destroys it with them and routes E (keyboard and touch) through `useKey`: the
  layer takes E for a node or a giver in reach (`takesUse`), and the clue, body, bell and door verbs run as before when
  it does not. `NodeView` no longer mounts the layer. (c) The four ONUB widgets gained `answer()` (what the player did:
  crates placed and the stop, each pour's hold, the slots in order, the stoke's taps) and `host.steps`/`host.holdS`,
  so a board with extra difficulty steps is played at the server's size; `view/minigames/answers.ts` is deleted and
  `board.ts` keeps only `bandRng`, which feeds a widget the server's bands. The Done control sends the server's
  `{assist: true}` answer.
- **Gap, for the owner**: the base has no main-mode task layer (see 6H), so `S2C.minigameStart` never fires in a live
  match. The modal is exercised from the mock, the `?minigame=<kind>` hook and fixtures; the live path waits on the
  task layer, which this session did not build.
- **Mock first**: `?mock=1&m5b=1` stands the own seat beside the overworld giver with a spade and five kit nodes
  (spread distances so the nearest-node prompt walks them in order), one rat, and a station-free craft. The mock mirrors
  the server rules (reach, hold time, yield and respawn, the spade, five slots, stack size, `quests.maxActive`).
- **Measured / checked**: client tests 496 (new: views 3 files, panels, answers, mock); `e2e/m5b.spec.ts` gathers, crafts
  and lights a lantern and turns in `caulkTheSkiff`, then opens a slide board through `?minigame=slide`.

### Round 6 log: 6J (cutscenes)

- **PR 1 (schema, index, rules, server lines, `openingS`)** on `claude/r6-cutscenes`: `rules/cutscenes.ts` bodies with
  `shared/test/cutscenes.test.ts`; `cutscenes.json` holds the HollowMere opening (50 s, 12 captions by copy id
  `cs.hollowmere.*`, a five-leg camera pan over the overworld, `storm`, `narr_bed_hollowmere` and `bell`) and the
  Blackpine two-step pan; `checkCutscenes` in `validate.ts` (kinds, maps, scenes, tiles, the opening against
  `openingS`, step kinds, main-track length against `maxS`); `balance.phases.openingS` 50; GDD 3.3 and 3.18 lines;
  DECISIONS A92; `apps/server/test/opening.test.ts` (broadcast and grace length through `beginPlay`). The five
  death cutscenes land in PR 3. No contract request.
- **PR 2 (sequencer and player on the mock)** on `claude/r6-cutscenes-player`, stacked on PR 1: `sequencer.ts`
  (`planTimeline`, `advance` with an optional `prevMs`, `cameraPose`, `ease`) with `sequencer.test.ts`; `Captions.ts`;
  `CutscenePlayer.ts` (`playId`, `play`, a `followOf` constructor argument the one World.ts constructor line passes,
  Esc and the Skip button, the hold on the HUD and the move input, the camera back on the own figure at the end);
  `ui/copy/cutscenes.ts` with its test (every caption resolves, at most 90 characters); `?cutscene=0` in `devFlags.ts`;
  the mock sends the opening at Start only under `?cutscene=1`, so the other mock specs reach the HUD at once;
  the "Round 6 (6J)" block of `components.css`; UI.md 14.20; `e2e/cutscene.spec.ts` (caption, Skip, Esc). The e2e run
  needs `pnpm --filter @wdi/shared build` and `@wdi/content build` first, as for every spec. No contract request.
- **PR 3 (death cutscenes, spec, GDD)** on `claude/r6-cutscenes-deaths`, stacked on PR 2: `deathKnife`, `deathPoison`,
  `deathShot`, `deathEjected` and `deathWolf` (a sound, a vfx, one whispered line, a held last frame, `maxS` 4) and
  their copy; `playDeath` stashes the id under `REG_CUTSCENE` when the World is asleep (a vote's ejection) so the rebuilt
  World plays it; `CutscenePlayer.playing`; the mock kills a `?cutscene=1&ghost=1` seat once the World first reads the
  feed; `kill.test.ts` pins `cutsceneId`; `cutscene.spec.ts` covers the death cutscene, Skip and the ghost handoff; GDD
  3.18 death paragraph. The ghost handoff guard (`if (!this.cutscenes.playing) this.refreshGhost();` in `World.update`) is in this PR: the
  orchestrator ruled it a World.ts play hook inside 6J's Owns.
- **Also in PR 2 (answered contract request)**: the first line of `World.ts` `preload()` is
  `mountMatchLoadingScreen(this, overlayRoot(), this.matchMap())`, added after #51 merged.
- **Done.** PR 1 (#52) is merged; PRs 2 and 3 (#55, #57) are retargeted by the orchestrator. Every PR was green on
  `pnpm lint && pnpm typecheck && pnpm test` before each push. Open items: none from 6J; the Port-au-Levain opening
  and the memorial video are round-7 content.

### Round 6 log: 6K (loading, transitions, trailer, budgets)

- **Branch** `claude/r6-polish-flow`, one draft PR against `claude/zen-turing-m1jnw0` (the three steps of the brief, pushed as three commits).
- **Step 1, transitions**: `view/Transition.ts` (host-injected core, DOM host, supersede rule), `balance.ui.transitionS` set to 0.4 / 0.6 / 0.7, GDD 3.13 "Transitions" paragraph, `.wdi-transition*` CSS, `Transition.test.ts`. The router's three call sites are untouched; only the comments of `transitionMs` and the first call changed. `worldRouter.test.ts` runs unchanged because a node run has no document and so counts as reduced motion.
- **Step 2, loading**: `view/LoadingScreen.ts` (`startLoading` controller, DOM host, `mountLoadingScreen`, `mountMatchLoadingScreen`, `loadingPlaylistFor`), `ui/copy/tips.ts`, `balance.ui.loading`, GDD 3.13 "Loading" paragraph, `LoadingScreen.test.ts`.
- **Step 3, trailer and budgets**: `ui/landingTrailer.ts` and its slot in `Landing.ts` (plus an optional `music` field on `LandingOptions`), the empty `assets/video/manifest.json` and `assets/audio/music/manifest.json`, `tools/sprites/test/{media.ts,media.test.ts}`, ASSETS 6.8 round-6 text, UI.md 14.21, DECISIONS A93.
- **Contract requests, as answered by the orchestrator**: the `scenes/Landing.ts` line (`music`) and the `scenes/Kitchen.ts` `preload()` line (`mountMatchLoadingScreen(this, overlayRoot(), QUICK_MATCH_MAP)`) are in this PR (Landing is inside 6K's Owns; Kitchen has no owner this round). The `scenes/World.ts` `preload()` line (`mountMatchLoadingScreen(this, overlayRoot(), this.matchMap())`) goes to 6J, who owns the World hooks; until it lands a World load shows no loading screen and asks for no loading music. 6L's `music/manifest.json` (merged in #48) replaced the empty stub 6K had written; `media.test.ts` passes on it. 6N: `video/manifest.json` rows are `{ key, url, poster?, durationS, bytes }`, `bytes` equal to the file.
- **Findings for the orchestrator**: the first-load budget. The art `Preload` queues plus Hollowmere is 10.6 MB (8-bit), under 12 MB; adding the SFX files and about 1.5 MB of engine gives about 14.4 MB, over ASSETS 6.8's wording. The lowpoly style's art set is 16.9 MB; it swaps in after boot, so the test checks the default style only. The test counts art only, as the brief names it.
- **Tests**: `pnpm lint && pnpm typecheck && pnpm test` green before every push.

### Round 6 log: 6L (music)

- **PR 1 (2026-10-22): bus, settings, panel.** `view/audioSettings.ts` (`wdi:audio`, a subscribe so a slider moves
  what is already playing), `view/MusicBus.ts` (two elements, lazy `src`, `crossfadeTo`/`prefetch`/`setVolume`/
  `setMuted`, a manifest parser; its timing is a `tick(dtMs)` the tests drive), `AudioBus.setSfxVolume` and the
  `narr_bed_hollowmere` and `sting_*` keys, `ui/SettingsPanel.ts` with `ui/copy/settings.ts`, the "Round 6 (6L)" CSS
  block, UI.md 14.22, and the empty `audio/music/manifest.json` shape. The sound library's release is not up, so no
  bed is fetched yet. The `narr_*` and `sting_*` keys are the ones `media.md` 4 names; 6N adds the files and rows.
- **PR 2 (2026-10-22): director and mapping.** `view/MusicDirector.ts` (a pure `MusicConductor` driven by the lobby,
  `phaseChange`, `gameOver` and `left` events; the meeting and the quick mode's four classes come from the phase, so
  no Kitchen or Night scene needs a call), `music.json` filled for both maps and the quick mode, the manifest's
  playlist slots declared with no tracks yet, a test that every id `music.json` names is a playlist of the committed
  manifest, and the GDD 3.18 music paragraph. `playlistFor(map, class)` is exported for 6K: its `LoadingScreen` calls
  `musicBus.crossfadeTo(playlistFor(mapId, 'loading'))`; a stand-in until it lands is that one line.
- **Step 3 (2026-10-22): the slot list, beds not fetched.** The `sfx-2026-10` release of ROSW is not published, and
  the cloud proxy refuses its release URLs, so no bed is fetched and `audio/music/manifest.json` keeps its slots
  with no tracks (a slot with no track is silence). The slots, against the catalog read from a read-only clone of
  ROSW (candidates by ear are 6N's and the owner's call):
  - **The owner's tracks fill**: `hollowmere_day` (Railroad Barons), `blackpine_day` (Extraction Camp), the three
    `*_loading` pieces, `trailer`, and `onub_kitchen` and `onub_rush` (The Baker's Bell, until round 8's map).
  - **The library can fill, as a looped, cross-faded bed**: `*_meeting` (`tension-builders/heartbeat-tension-builder`,
    48 s), `*_finalnight` (`tension-builders/tick-tension-builder`, 46 s, or `science-fiction-ambience/deep-scary-ambience`,
    42 s), `*_night` and `onub_night` (`science-fiction-ambience/tense-ambience`, 42 s, or `deep-scary-ambience`).
  - **The library cannot fill (it holds no melodic bed)**: `lobby`, and the two `*_gameover` plus `onub_over`
    (the `sting_win_*` stingers cover the end; a bed after them is optional). Proposed: `*_dusk` reuses the day
    theme, and the owner says whether they want to record or upload a `lobby` track and an end-screen track, or
    whether a CC0 bed (ASSETS 6.5, with a CREDITS row) fills them. Nothing is downloaded until that answer.
  - **Budget**: the owner's seven tracks master to about 9 to 10 MB of the 12 MB, so the library beds must be short
    loops (about 0.4 MB each at 20 s); `media.test.ts` (6K) enforces 12 MB and 4 MB per map.
  - **To finish**: when the release is up, `library.py fetch --id <id>` for the ids above, master as `media.md` 1,
    add the OGG, the manifest rows (tracks and playlist `tracks`), the `CREDITS.md` and `MANIFEST.md` rows (`media.md`
    7), and run the budget test.
- **CC0 beds (2026-10-22, owner: "Use a CC0 bed for lobby and the end screen").** `lobby` plays OpenGameArt
  "Contemplation" (Pro Sensory, CC0, first 60 s, 0.5 MB); `hollowmere_gameover`, `blackpine_gameover` and `onub_over`
  play "The Fade" (breadman, CC0, 0.8 MB). Mastered at -18 LUFS, Vorbis q3, CREDITS rows with URL, hash and date;
  no `MANIFEST.md` row, since a CC0 download is not a master. FreePD is closed, so OpenGameArt is the source. Still
  open: the library beds (release unpublished), and `*_dusk` reusing the day theme.

### Round 6 log: 6M (M5b art)

- Step 1 (nodes, held tools, glows, icons): `tools/sprites/m5b.ts` and `m5b-draw.ts` draw the six resource
  nodes in two states, the six tools as held overlays in eight directions and the lantern and torch glows, in
  both styles; `placeholder-m5b.ts` carries their greybox twins; six `icon_item_*` SVGs; SPRITES 12; the
  CREDITS row; DECISIONS A95; `test/m5b.test.ts`. Ids from 6E's step 1 (#49). `pnpm lint && pnpm typecheck &&
  pnpm test` green.
- Step 2 (mobs): `tools/sprites/m5b-mobs.ts` rigs the wolf, boar, bat and rat (ids from #49 step 2) and m5b.ts
  packs them as `mobs` and `anims_mobs` (idle, walk, attack in eight directions) in both styles, with greybox
  twins in `placeholder-m5b.ts`; SPRITES 12, A95 and the CREDITS row extended; `test/m5b.test.ts` covers the
  frames and animations. Green.
- Step 3 (givers): `tools/sprites/m5b-givers.ts` dresses the five quest npcs of #49 step 3 (`harbourmaster`,
  `moll`, `foreman`, `smith`, `collier`) on the mob rigs (`drawRig`), packed as `givers` and `anims_givers`
  (idle in eight directions) in both styles, with greybox twins; SPRITES 12, A95, CREDITS and `test/m5b.test.ts`
  extended. Green. All of the brief's sprites are in; what remains is review and 6I's consumption.

### Round 6 log: 6N (ROSW media)

- **Step 1 (2026-10-22): the library sounds.** From ROSW `SFX_2026_01` (the owner's tag; `media.md` still says
  `sfx-2026-10`, which 6Z corrects), fetched by id with `library.py fetch` (seven zips) and mastered as `media.md` 1:
  the five `sting_*` files, `narr_bed_hollowmere`, `amb_forest` and `amb_cave` (replacing 5K's CC0 loops), and the
  music beds `bed_heartbeat`, `bed_tick` and `bed_tense` in the `*_meeting`, `*_finalnight`, `*_night` and
  `onub_night` playlists. Rows in both manifests, `CREDITS.md` (the two replaced CC0 rows removed) and
  `assets/source/MANIFEST.md`; the picks and the reasons in DECISIONS A96. `media.test.ts` green. No `.ts`, nothing
  under `packages/`.
- **Step 2 (2026-10-22): the owner's tracks and field recordings.** The owner attached `Who.Did.It.zip` (one zip, so
  the ids are `who-did-it/<slug>`) and seven more packs; ROSW #14 ingests them (929 new; `Drones.zip` is damaged and
  two names collide, both left to the owner) and teaches the library to read an MP3's duration, which its own
  catalog test needs. Mastered at q3 stereo by 6Z's call: the three day themes as clean loops, the loading pieces
  and the trailer whole; the playlists `trailer`, `*_loading`, `*_day`, `*_dusk`, `onub_kitchen`, `onub_rush`
  filled; `train_arrive`, `train_brake`, `ferry_horn`, `crows` in `audio/manifest.json`. Numbers and reasons in A96.
  Contract requests, answered by 6Z: the four SFX keys in `AUDIO_KEYS` (granted, in this PR); the licence and the
  vendor row of the Flow Music tracks (asked of the owner; CREDITS says "licence open" until then).
- **Waiting**: the owner's intake and context answers for the two videos (step 3).

### Round 6 log: 6Q (opening cinematic)

- **Two steps on one branch and one draft PR (`claude/r6-intro`, 2026-10-22)**, each commit green on `pnpm lint && pnpm
  typecheck && pnpm test`: (1) `scenes/Intro.ts` with `scenes/introPolicy.ts` (the Phaser-free rules, so the unit tests can
  load them), `ui/copy/intro.ts`, the "Round 6 (6Q)" CSS block, the `first` line of `Preload.ts`, the 2 s stand-in clip under
  `e2e/fixtures/`, the `intro` budget line; (2) `e2e/intro.spec.ts`, UI.md 14.24, this log.
- **Contract requests, all granted by 6Z on #72 and done in the PR**: (a) `main.ts` lists `Intro` in the scene array (one
  import, one entry, after `Admin`); (b) the budget cap lives in `tools/sprites/test/media.ts` (`BUDGET.introVideoBytes`,
  `INTRO_VIDEO_KEY`), because `checkVideos` is there and `media.test.ts` only calls it; (c) the four live-server specs
  (`match`, `npc`, `onub`, `looks`) open `/Who-Did-It/` without `?mock=1`, so once 6N lands `intro.webm` they would stop on
  the poster: each now sets `sessionStorage['wdi:introSeen']` in an init script before its first page load (one line each). Until
  the file lands the scene finds no row and starts `Landing`, so nothing changed before this either.
- **Settled from the code (A98's open items)**: the first-load figure (A93) is unaffected, since `firstLoadBytes` counts the
  art manifests and the intro is fetched only after the tap; the cinematic's volume follows the player's music slider and mute
  (`wdi:audio`); a reload that rejoins `#/lobby/CODE` skips it. Still open for the owner: the cinematic's tool and date, and
  whether the lobby keeps the theme after the first match.
- **Measured / checked**: client tests 538 (new: `introPolicy.test.ts`), sprites tests 386 (new: the 5 MB intro line, a
  non-intro key at 4.5 MB fails, 5 MB + 1 fails); `e2e/intro.spec.ts` 8 specs (mock skip, live default, tap and end, Skip and
  once per session, Esc, `?intro=0` and reduced motion, missing file or row, admin route). Not run against a real cinematic:
  its file and poster are 6N's.

## Integration log, round 6

- **NPC test flake, R18 (2026-10-22).** On PR #47's CI run 252 (head ac0409c) `npcRoutine.test.ts` R18 failed
  with `npcPlay` 1216 against 1226 (paths equal); the push run on the same commit and every local run passed.
  Cause: `standardParty` reached the world through `until` polls (`start`, `toWorld`) while the room's own clock
  kept stepping, so the tick the test's `advance` loop started on, and where the brains' tick timers (placement
  idle, dwell, pauses) fell in the recorded window, depended on wall time; under load the two parties R18
  compares could start on different ticks. Fix in `apps/server/test/npcHelpers.ts` alone, the sim untouched, no
  rule or number changed: `standardParty` takes the room off its clock once the lobby exists (`pauseClock`, the
  Colyseus `setTimestep()` with no callback), advances to a fixed tick, queues Start itself and drives the card,
  grace and every placement with `advance`, so every run of a seed set has one tick timeline; `resumeClock` puts
  the same step back on the clock before the party is returned, so a test that still sends over the wire after it
  is unchanged. R18 now also compares the tick its recording starts on (M7's `voteAt` already did). Verified with
  R18 and the NPC suite under sixteen busy-loop processes, and with a throwaway probe of the timeline: the failure
  itself did not reproduce locally, only the tick drift that explains it (the lobby tick varied from 3 to 8, the
  card and grace ticks with it). The NPC tests stay S's and 5H's.
- **Quick-mode night test flake, wire timing (2026-10-22).** CI failed twice on commits that do not touch the quick
  mode: `onubNight.test.ts` line 419 (the Tourrier test) saw one refusal where it expected two (`[422]`), and line 521
  (the Iron Cloche test) saw `[]` where it expected one, right after waiting on `m.o.cloche`. Cause: the server's 422
  `ErrorCode.cannot` travels over the Colyseus wire after the state change the test waits for, so a synchronous read
  of `errorsOf` could run before it landed; a state wait is not a message wait. Fix in
  `apps/server/test/onubNight.test.ts` alone, `apps/server/src`, the rules and every number untouched, no assertion
  skipped or loosened: each `errorsOf` assertion that followed an act or a `debug.clock` without a wait on the error
  count now has `await until(() => errorsOf(bot).length >= N)` first, then asserts the exact contents. The audit
  found four more such reads besides the two reported, all in the `debug.clock` tests (the wrong-phase refusal of
  `{phase}`, the `{window}` of a role not in the deck, the `{bogus}` one, and the `{window}` outside the night);
  every other `errorsOf` read in the file already waited on the count. Verified with the file five times unloaded and five times under eight
  busy-loop processes on four cores, then `pnpm lint`, `pnpm typecheck` and `pnpm test`; the failure itself did not
  reproduce locally, on the unfixed file either. The night tests stay 5B's.
- **Quick-mode test flakes, wire timing (2026-10-22).** Three CI runs on commits that do not touch the quick
  mode failed in `onubNight.test.ts` (the Tourrier's two-step saw `[422]` for two refusals; the Boulanger's
  Cloche saw `[]` for one) and `onubDeal.test.ts` (one bot held no role card right after `onubRoleCard`
  returned); the twin run on each commit passed. Cause: each test waited for the server's state (`m.o.acted`,
  `m.o.cloche`, the phase) and then read a message (`errorsOf`, `cards`) that travels the Colyseus wire behind
  that state, so a read could run before it landed; under load it did. Fix in `apps/server/test/` alone, the
  server, rules and numbers untouched, no assertion loosened, on top of the `onubNight` error waits of the entry
  above: every such read now follows an `until` on the
  message count (`onubNight`, `onubDeal`, the `debug.clock` refusals, the proofing perk's reveals in
  `onubPrep`, the phase change in `onubContract`, the ghost chat in `onubMorning`), `onubRoleCard` waits until
  every human holds its card, and `cards` moved into `onubPrepHelpers.ts`. Verified with the `onub` suites
  repeated, and four times with busy loops on the three other cores, then `pnpm lint`, `pnpm typecheck` and
  `pnpm test`.
- **6Z follow-up after 6G and 6H (2026-10-22).** The locked lines the wave-2 PRs requested, in one PR on the
  orchestrator's branch: `act.light { on }` in `C2S` (`packages/shared/src/protocol`, rate 5/s) dispatched to
  `handleLight` in `sim/mobs/light.ts` from `sim/Commands.ts`, with `docs/PROTOCOL.md` regenerated; the
  `fleeCreature` line in `sim/npc/world.ts` `runWorldNpc` before the body reaction (6G's #59 request 2, which 6G's own
  permission check refused on its locked file); `minigame` in `StreamName` (`sim/seeds.ts`) for 6H's puzzles, keyed by
  seat; `priv.quests.clear()` in the `Win.ts` reset. `docs/round6/m5b-data.md` 2.1 now names `respawnTick` on the
  wire `Node`, as 6F built it (#61). Open for the owner and 6P from the wave-2 PRs: the base has no station-task
  layer (nothing assigns `Private.tasks`, nothing writes `taskBar`, `Win.ts` never checks it), so 6H's mini-games
  are inert in a live match until an assignment session lands; ROADMAP M5b does not count station tasks as playable
  before that. 6H switches its puzzle draw from the keyed `contract` stand-in to `seeds.get('minigame', seat)` and
  drops its lobby clear once this merges.

- **6Z after the first wave (2026-10-22, 22:40 UTC).** Every session PR of the first wave is in: #63 (6B), #61
  (6F), #65 (6Z), #64 (the onub wire waits, an owner fix), #60 (6H) and #58 (6C), each merged with a merge commit
  once both CI runs on its head were green; 6D (#66) and 6I (#67) are open. ROSW: the sound library is on the
  release `SFX_2026_01` (16 zips, 2,648 sounds) and ROSW #13 points `catalog.json` at it; the owner's two zips of
  `media.md` 1 are not on it yet, so `media.md` 1 and 6 and the 6N brief now name that tag and that gap, and 6N
  starts with the library part. Contract answers: 6D edits `flags/index.ts` (`admin: route[0]?.split('?')[0]
  === 'admin'`) in #66; 6I adds the four `WorldFeed` members, the M5b layer and E routing in `World.ts`, and
  `answer()` on the four ONUB widgets in #67, so no stand-in lands; 6C kept the per-kind admin feed.
## Round 7 (started 2026-10-23, after round 6's #81 landed at 11168d1; 6P's #73 and 6N's A102 still to land)

Ten sessions build **R7, Vendettas and memorials** (GDD 3.20; ROADMAP R7) and **R7b, the re-skin, parties and
profiles** (GDD 3.21; ROADMAP R7b): the owner's two Claude Design mockups of 2026-10-23 and their three answers
(DECISIONS A103), the party list with open and private parties, profiles and friends (A104), the map intro
tracks played whole over longer cinematic openings (A101), and the Bible's Book I.3 and I.6 staged by
`docs/round6/bible-seams.md` 2.1. The contract is `docs/round7/` (A105). Same rules as rounds 1 to 6:
- draft PRs against `claude/zen-turing-m1jnw0`, under 400 lines where the work allows (split by step, each PR
  green; a re-skin PR may run longer where one screen's CSS does, never two screens in one PR);
- `pnpm lint && pnpm typecheck && pnpm test` clean before every push;
- pinned versions only, and no model identifiers in committed files (the Model column of this table is the one
  exception);
- `docs/GDD.md` changes in the same PR as a behaviour change; a re-skin PR changes no rule, no number and no
  wire;
- numbers only in `docs/GDD.md` and `packages/content/data`.

**Models.** The owner's rule holds: Sonnet 5.5 for almost everything; Opus 5.5 for planning, the complex game
logic (7H, 7I), content and art (7A, 7B); Fable 5.1 for the orchestrator only. The decisions of this round are
DECISIONS A101 to A105; a session never re-decides them.

**Context.** Every session compacts at 400k tokens (`.claude/settings.json`, `CLAUDE.md` "Compact instructions").
A session is spawned with its model and a prompt of the form "You are session 7X of docs/SESSIONS.md Round 7.
Read your brief, then the docs/round7/ documents it names. Branch claude/r7-<slug>."

**What changed for everyone.**
- **Every screen is re-skinned** to the owner's mockups (`ui-reskin.md`): the night palette, two pixel fonts and
  the glass components are 7B's theme pieces; each screen session writes its rules in its own CSS file;
  `components.css` and `tokens.css` are 7B's alone; `theme.test.ts` scans every `.css` under `apps/client/src`.
- **The menu asks the name on Start and lists parties on Join** (`parties.md`): `CreateOptions { visibility,
  invited }`, `JoinOptions.profile`, `Player.profile` on the roster (schema version 4), `GET /parties` beside
  `/health`. The e2e helper `e2e/fixtures/party.ts` (7C) is the one place the specs create and join a party.
- **The openings run their track's length** and visit other scenes (`map-intros.md`): the music class
  `opening`, `loop: false`, the grace lengthened by the chosen map's opening.
- **The Step order** gains `runTrain` after `runEvents` (7I); the bus gains the `vendetta.*`, `train.*` kinds.
- **Round 6 is still landing**: 6P's #73 (tests, the integration log, A97) and 6N's A102 (the intro trim, the
  landing loop). A round-7 session never edits `apps/server/test/*.test.ts` files that exist today (new files
  only), the round-6 log or A97.

**Shared files.** Locked for every session but 6Z: `packages/shared/src/schema/index.ts` and `protocol/index.ts`
(7D adds the rows `parties.md` 2 names, 7H the `Private.vendetta` row after 7D merges; anything else through
6Z), `apps/server/src/sim/{Step,Deck,Flow,Quests,Npc,seeds}.ts` and `sim/npc/**` (the one-line hooks
`vendettas.md` names are agreed in a PR description first), `ui/theme/**` (7B), `e2e/fixtures/party.ts` (7C),
`.claude/settings.json`, `eslint.config.js`. Shared documents: edits stay inside the named section with no
renumbering or reflow, and the orchestrator keeps both sides of any conflict. Copy: a session that needs new
lines adds a UI.md 14 subsection of its own (7C 14.25, 7E 14.26, 7F 14.27, 7G 14.28, 7H 14.29, 7I 14.30) and a
copy module under `ui/copy/`. Decisions a session has to make go to `docs/DECISIONS.md` under its reserved row
(7A A101, 6N A102, 7B A106, 7C A107, 7D A108, 7E A109, 7F A110, 7G A111, 7H A112, 7I A113; integration A114). A
second row takes the number plus 14 (A115 to A128, appended after A114); nobody edits an older row.

| Session | Model | Track | Branch | Owns |
|---|---|---|---|---|
| **6Z. Round-7 contract** | Fable 5.1 | Contract | `claude/game-features-admin-planning-v43tvq` | `docs/round7/**`, this section, DECISIONS A103 to A105, GDD 3.20 and 3.21 stubs, ROADMAP R7 and R7b rows, UI.md 12 rows, the locked one-line hooks |
| **7A. Map intros** | Opus 5.5 | Code | `claude/r7-map-intros` | `music.json`, `cutscenes.json` and their schemas, `view/{MusicBus,MusicDirector}.ts`, `view/cutscene/**` (camera, staging, the `video` step), the grace line of `handlers/lobby.ts`, the opening cap of `validate.ts`, GDD 3.3 and 3.18 opening lines, `cutscene-music.md` 1 and 3, A101 |
| **7B. Theme pieces** | Opus 5.5 | Art | `claude/r7-theme` | `palette.json` night set, `style.json` `ui.fonts`, `ui/theme/**`, the two fonts and their licences, `ui/backdrop.ts`, the removal of `view/Backdrop.ts`, UI.md 2, 3, 6, 10, ASSETS 6.1, CREDITS rows, A106 |
| **7C. Menu, profile, friends, Quit, party list** | Sonnet 5.5 | Code | `claude/r7-menu` | `ui/Landing.ts`, `scenes/Landing.ts`, `ui/menu/**`, `ui/menu.css`, `ui/copy/menu.ts`, `public/help/index.html`, `e2e/fixtures/party.ts` and the two landing lines of every spec, `e2e/smoke.spec.ts`, the menu half of `e2e/party.spec.ts`, UI.md 14.25, GDD 3.21 client lines, A107 |
| **7D. Parties server** | Sonnet 5.5 | Code | `claude/r7-parties-server` | the wire rows of `parties.md` 2, `rooms/PartyRoom.ts` create and metadata lines, the `/parties` route in `server.ts`, `services/matchmakeGuard.ts` (the route's bucket), `balance.json` `party` and its schema, `test/parties.test.ts`, `tools/bots/swarm.ts` visibility, ARCHITECTURE 5.3, `PROTOCOL.md`, GDD 3.21 server lines, A108 |
| **7E. Lobby** | Sonnet 5.5 | Code | `claude/r7-lobby` | `ui/Lobby.ts`, `ui/lobby/**`, `ui/artStyle/**`, `ui/main/{deckList,deckChip,deckView}.ts`, `scenes/Lobby.ts`, `ui/lobby.css`, the lobby keys of `ui/copy/lobby.ts`, `Lobby.test.ts`, `MapPicker.test.ts`, `DeckEditor.test.ts`, the lobby half of `e2e/party.spec.ts`, UI.md 14.26, A109 |
| **7F. Match screens** | Sonnet 5.5 | Code | `claude/r7-match-ui` | `ui/RoleCard.ts`, `view/Hud.ts`, `view/hud.css`, `view/NotebookPanel.ts`, `ui/SettingsPanel.ts`, `view/{LoadingScreen,Transition}.ts`, the captions and Skip DOM of `CutscenePlayer.ts`, the Skip of `scenes/Intro.ts`, `ui/M5bLayer.ts`, `ui/{Inventory,Crafting,QuestLog}.ts`, `view/minigames/**`, `ui/match.css`, their tests, `e2e/m5b.spec.ts`, UI.md 14.27, A110 |
| **7G. Table and quick-mode screens, admin page** | Sonnet 5.5 | Code | `claude/r7-table-ui` | `ui/Meeting.ts`, `ui/GameOver.ts`, `ui/SeatPicker.ts`, `ui/main/{cards,overMain,shotToast,lookPortraits}.ts`, `ui/portrait.ts`, `ui/onub/**`, `view/onub/**`, the DOM of `scenes/{Kitchen,Night,Meeting,GameOver}.ts`, `client/admin/**`, `ui/table.css`, `ui/onub/onub.css`, their tests, `e2e/{meeting,onub,night,kitchen,admin}.spec.ts`, UI.md 14.28, A111 |
| **7H. Vendettas** | Opus 5.5 | Code | `claude/r7-vendettas` | `sim/vendettas/**`, `vendettas.json` and its schema, `balance.json` `vendettas`, `Private.vendetta` (after 7D), the strongbox rows of `scenes/manor_hall.json`, the `contract` acceptance line of `sim/Quests.ts`, `ui/copy/vendettas.ts`, `test/vendettas.test.ts`, the vendetta invariants, GDD 3.20 vendetta paragraphs, UI.md 14.29, A112 |
| **7I. The Train, the memorial, the Ascended Vicar** | Opus 5.5 | Code | `claude/r7-train` | `sim/{Train,Memorial}.ts`, the `runTrain` line, `scenes/station.json` (or the overworld spot), `maps/hollowmere.json`, `FlowState.ascendedVicarCandidate`, the memorial row of `cutscenes.json` and its caption block, `balance.json` `train`, `test/{train,memorial}.test.ts`, GDD 3.3 Train line and 3.20 memorial paragraph, WORLD 4.3, UI.md 14.30, A113 |
| **7P. Integration** | Sonnet 5.5 | Code | `claude/r7-integration` | merges, lockfile, `PROTOCOL.md` regen, the dead landing keys of `ui/copy/lobby.ts`, the opt-in e2e suites, both screenshot sets (UI.md 12), `pnpm auto -- --matches 50` per map, both 30-minute soaks, this round's integration log, A114 |

Merge order: 6Z first (this contract); then 7A, 7B, 7D, 7H (conversion and sabotage), 7I in parallel; 7C, 7E, 7F
and 7G after 7B's theme PR, and 7C's party list PR after 7D; 7H's heist and contract PRs after 7I's Train; 7I's
memorial PR after 7A's `video` step; 7P last. 6P's #73 and 6N's A102 merge whenever they are green.

### Briefs

Every brief names the session's paths, the sections it reads, its PR split, its tests and what it leaves
alone. Every session records its round-7 log under its reserved "Round 7 log" heading at the end of this section.

**7A. Map intros.** Play the owner's three intro pieces whole and never looped, lengthen each map's opening to
its track and make the openings cinematic, visiting the rooms and the caves. **Owns** the files of its row.
**Reads** `docs/round7/map-intros.md`, `docs/round6/cutscene-music.md` 1 and 3, `media.md` 1, GDD 3.3 and 3.18,
A81, A96, A98. **PRs**: (1) the `opening` class, `loop: false`, the once-only bus and the director's hold; (2) the
lengths, the cap, the grace line, GDD, validation, A101; (3) other-scene staging in the player and the two
rewritten openings; (4) the `video` step for 7I. **Tests**: MusicBus, MusicDirector, sequencer and player,
content validation, `e2e/cutscene.spec.ts`. **Not**: the day themes, any file 7F restyles (captions and Skip
DOM: 7A keeps the markup it finds and 7F restyles it). Stop and ask 6Z if staging proves heavier than two days.

**7B. Theme pieces.** Give every screen session the night palette, the two pixel fonts, the glass components and
the loop backdrop, exactly as `ui-reskin.md` 3 lists them, with UI.md 6 rows written first and the contrast of
every new pair measured in UI.md 10. **Owns** its row. **Reads** `ui-reskin.md` 1 to 3, UI.md 1 to 10, ASSETS
6.1, 6.5, 6.8, A93, A98, `LICENSES/fonts/README.md`, `theme.test.ts`. **PRs**: (1) fonts, palette, tokens, the
gate widened to every `.css` file, licences and CREDITS; (2) the glass components and `.wdi-title`; (3)
`ui/backdrop.ts` fed by 6N's `landing_loop` rows (a poster-only path until they land) and the removal of
`view/Backdrop.ts`. **Tests**: `theme.test.ts`, `media.test.ts`, the existing screens still render (`pnpm
test`, `e2e/smoke.spec.ts`). **Not**: any screen's own markup; a fifth or sixth colour beyond the set.

**7C. Menu, profile, friends, Quit, party list.** Build the menu of the mockup with every button, the Start
dialog, the party list, the profile, the friends list and Quit, as `parties.md` 4 says; restyle the help page.
**Owns** its row. **Reads** `parties.md`, `ui-reskin.md` 1, 2 and 4, GDD 2 step 1 and 3.21, UI.md 14.11, A98,
A103, A104. **PRs**: (1) the menu, the Start dialog (open or private), the code box, the Settings, How to Play
and Credits buttons, Create Profile, Friends and Quit greyed with the note, `e2e/fixtures/party.ts` and the
specs' landing lines; (2) the profile and the friends list, the chip; (3) Quit and the help page; (4) the party
list after 7D merges, with the invite pick on the Start dialog. **Tests**: new `ui/menu/*.test.ts`,
`e2e/party.spec.ts` (menu half), `e2e/smoke.spec.ts`, every spec still green through the helper. **Not**:
`ui/copy/lobby.ts`, the lobby, the server.

**7D. Parties server.** The wire, the server and the numbers of `parties.md` 2 and 3. **Owns** its row.
**Reads** `parties.md`, ARCHITECTURE 5.3 and 5.11, GDD 3.21, `rooms/PartyRoom.ts`, `services/{CodeRegistry,
matchmakeGuard}.ts`, `tools/bots/swarm.ts`. **PRs**: (1) `CreateOptions`, `JoinOptions.profile`, `Player.profile`
(schema version 4), `balance.json` `party`, `onAuth` checks, `PROTOCOL.md`; (2) the metadata and the `/parties`
route with its bucket, the swarm's visibility, ARCHITECTURE 5.3. **Tests**: `test/parties.test.ts` as
`parties.md` 3 lists, `schema.test.ts`, `protocol-doc.test.ts`. **Not**: the client, any existing test file.

**7E. Lobby.** The three columns of the mockup with every control the lobby has today, in 7B's pieces. **Owns**
its row. **Reads** `ui-reskin.md` 1, 2 and 4, UI.md 14.11 to 14.18, GDD 2 step 3. **PRs**: (1) columns A and C
(code, copy link, mode, NPCs, seats with tags, the deck chips, Start, Ready, Leave, the confirm dialog); (2)
column B (map cards with blurbs from `copy/maps.ts`, the art-style segment, HD disabled) and the deck editor.
**Tests**: `Lobby.test.ts`, `MapPicker.test.ts`, `DeckEditor.test.ts`, the lobby half of `e2e/party.spec.ts`,
`e2e/looks.spec.ts`. **Not**: a new wire field (the NPC tag only where the snapshot already says which seats are
NPCs); the "Locate" button.

**7F. Match screens.** The role card, the HUD and log, the notebook, the settings panel, the loading screen, the
transitions, the captions and Skip, the M5b layer and panels and the mini-games, in 7B's pieces, nothing moved
that the specs find by id. **Owns** its row. **Reads** `ui-reskin.md` 2 and 4, UI.md 7, 14.4, 14.5, 14.19 to
14.22, 14.24. **PRs**: (1) role card, HUD, notebook, settings; (2) loading, transitions, captions, the Skips; (3)
M5b layer and panels, mini-games. **Tests**: `RoleCard.test.ts`, `m5bPanels.test.ts`, `LoadingScreen.test.ts`,
`Transition.test.ts`, `e2e/m5b.spec.ts`, `e2e/cutscene.spec.ts`, `e2e/intro.spec.ts`. **Not**: the camera of the
player (7A), the rule of any panel.

**7G. Table and quick-mode screens, admin page.** The meeting, the game over, the seat picker, the main-mode
cards and toasts, every quick-mode screen and the admin page, in 7B's pieces. **Owns** its row. **Reads**
`ui-reskin.md` 2 and 4, UI.md 14.6 to 14.10, 14.12, 14.14 to 14.16, 14.23. **PRs**: (1) meeting and game over;
(2) the main-mode cards, seat picker, toasts; (3) the quick mode; (4) the admin page. **Tests**:
`meetingText.test.ts`, `main.test.ts`, the `onub` unit tests, `e2e/{meeting,onub,night,kitchen,admin}.spec.ts`
(the opt-in ones with their flags). **Not**: any rule or wire; the HUD (7F).

**7H. Vendettas.** The four vendettas of `vendettas.md` 2 as data, server modules, invariants and GDD 3.20.
**Owns** its row. **Reads** `vendettas.md`, `bible-seams.md` 1 and 2.1, `owner-brief.md` Book I.3, GDD 3.2,
3.3, 3.12, 3.16, A100, `sim/events/bus.ts`, `sim/auto/invariants.ts`, `sim/Quests.ts`. **PRs**: (1) the schema
widened, `vendettas.json` with the four rows, `balance.json` `vendettas`, the `vendetta` stream and draw (the
`Deck.ts` line agreed with 6Z), `Private.vendetta` after 7D, GDD 3.20's rules; (2) conversion and sabotage; (3)
heist and contract after 7I's Train; (4) invariants and the auto gate. **Tests**: `test/vendettas.test.ts`,
`seeds.test.ts`, `pnpm auto -- --matches 50` on HollowMere. **Not**: the NPC brain (one hook through 6Z), the
kill loop, the timer, anything public that names a vendetta.

**7I. The Train, the memorial, the Ascended Vicar.** `vendettas.md` 3. **Owns** its row. **Reads**
`vendettas.md`, `bible-seams.md` 1 and 2.1, `owner-brief.md` Book I.2 and I.6, GDD 3.3, 3.13, 3.18, WORLD 4.3,
A98, A99, `media.md` 3, `sim/Flow.ts`, `sim/Step.ts`, `sim/events/bus.ts`. **PRs**: (1) the station (scene or
spot), the Train with `train.arrive` and `train.delivery`, the sounds and the log line, `balance.json` `train`,
GDD 3.3's line, WORLD 4.3; (2) the memorial and the Ascended Vicar field after 7A's `video` step. **Tests**:
`test/train.test.ts`, `test/memorial.test.ts`, content validation of the new scene. **Not**: BlackPine, the
evolutions (round 8), the player.

**7P. Integration.** As 6P's brief, for this round: merges in the order above, lockfile, `PROTOCOL.md`, the dead
landing keys, the opt-in e2e suites, both screenshot sets, the soaks and `pnpm auto`, the log and A114.

### Round 7 log: 6Z

- 2026-10-23: #81 (A100, the Killer's timer) merged at 11168d1; the contract written from the owner's requests
  of 05:00Z to 07:10Z; 7A spawned first (its brief needed no other session), 6N given A102; the rest spawned as
  this contract lands.

### Round 7 log: 7A

- 2026-10-23: PR 1 (#83, music). The intro tracks are `<map>_opening` playlists with `loop: false`, in a new
  `opening` class held over grace until the piece ends or the opening is skipped; `loading` maps to the lobby
  piece. Contract requests (manifest, `MUSIC_CLASSES`, `LoadingScreen.test.ts`) granted by 6Z. Measured
  lengths 117 s and 80 s (A101); steps 2 and 3 (length, staging) are stacked locally and go up after #83.

### Round 7 log: 7B

- 2026-10-23: PR 1 (fonts, night set, tokens, the gate on every `.css` under `apps/client/src`, licences,
  CREDITS, UI.md 2, 3 and 10, ASSETS 6.1, A106). The night set sits in its own `palette.json` block (A106);
  glass contrast is measured over the darkest and the brightest bound of the loop, so it does not wait for 6N.
- 2026-10-23: PR 2 (the night glass, UI.md 6 rows first): the glass is a `::before` layer under the content so
  the stepped `clip-path` never cuts the focus ring; the checker sheen and the primary's hover wash are tokens
  and in the measured stacks (muted lilac on a sheen cell 4.63). `.wdi-seg` stays in 7E's
  `ui/artStyle/artStyle.css`, which loads after `components.css`, so the glass look is the modifier
  `.wdi-seg--glass` (with `.wdi-seg__note`) for 7E to add. `ui/theme/title.ts` builds the title's letters.

### Round 7 log: 7C

### Round 7 log: 7D

- PR 1 (wire): `CreateOptions`, `JoinOptions.profile`, `Player.profile` (schema version 4), `balance.json` `party`, the `onAuth` checks, `PROTOCOL.md`, `parties.test.ts` (auth half), ARCHITECTURE 5.3 and GDD 3.21 server lines, A108. `protocol-doc.ts` lists `PartyVisibility` and `CreateOptions`. Profile codes are exact-length upper-case join-alphabet strings; `newSeat` is untouched (the profile is set in `onJoin`).
- PR 2 (listing): `PartyRoom.syncListing` and the room-memory visibility, `services/partyListing.ts`, `GET /parties` in `server.ts`, `allowRoute` and the route's global bucket in `matchmakeGuard.ts`, `PartyListing` in the protocol, swarm `--create`, ARCHITECTURE 5.3, GDD 3.21, A108 amended. The route is the one place a new HTTP cost appears: 7C polls it every `listRefreshS`.

### Round 7 log: 7E

- PR 1 (columns A and C): `Lobby.ts` as three columns, `ui/lobby.css`, the Add friend stand-in and its test, the deck list's classes, UI.md 14.26, A109. Column B holds today's map, art-style, sound and deck-editor mounts in one card until PR 2.
- PR 2 (column B): the map cards with a tick, the art-style segment with `.wdi-seg--glass` and `.wdi-seg__note`, the deck editor as chips; the rules are in `ui/lobby.css` until 7B's glass classes land.

### Round 7 log: 7F

- 2026-10-23: PR 1 (role card, HUD and its log, notebook sheet, settings panel): `ui/match.css`, `view/hud.css`, UI.md 14.27, A110. Rules are scoped under an ancestor class, so they do not wait for 7B's glass classes; `theme.test.ts` and the 565 client unit tests pass.

### Round 7 log: 7G

### Round 7 log: 7H

- 2026-10-23: PR 1 (the four rows, the widened schema and its checks, `balance.json` `vendettas`, the `vendetta`
  stream, the draw through the `sim/Deck.ts` line, GDD 3.20, A112); the holding in room memory behind
  `privateVendetta` until 7D's schema version 4 lands. Hooks asked of 6Z in the PR description.

### Round 7 log: 7I

- 2026-10-23: PR 1, the Daily Train: the platform spot on HollowMere's overworld (A113), `sim/Train.ts` and its `runTrain` line, `balance.json` `train`, GDD 3.3, WORLD 4.3, UI.md 14.30, `test/train.test.ts`.

## Integration log, round 7
