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
