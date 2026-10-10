# Production Plan

> Generated from `docs/MASTER_PLAN.md` (v0.1, 2026-10-10). Milestones, parallel tracks, placeholder strategy, risks, playtests, workflow and the day-by-day schedule for M0-M2.

## 7. Production plan

Effort is in focused solo-dev days with AI coding sessions; code uses placeholders until M6. The order is M0 -> M1 -> M2 -> M3 (first playable, "fun or stop") -> M3b (quick mode) -> M4 -> M5 -> M6 -> M7. M3b can be pulled ahead of M3 if the owner wants the quick mode as the first playtest: it needs no kills, clues or ghosts (see DECISIONS.md, open questions).

### 7.1 Milestones

| M | Goal | Deliverables | Definition of done | Days | Playtest |
|---|---|---|---|---|---|
| **M0 Scaffold** | Monorepo, two workflows, hello-world on Pages and Render Free | pnpm workspaces, tsconfig / eslint / prettier / vitest; `ci.yml`, `pages.yml`; Render Free web service from the GitHub repo (Railway Hobby at the M3 exit); `/health`; `BUILD_VERSION` handshake; `metrics.json`, `palette.json`, `constants.ts`; `.gitattributes`; `docs/` seeded from this plan plus `SPRITES.md` conventions; Day-2 spike proving custom 5-char `roomId` + `joinById`, one `.view()` field hidden from other clients, and `setFixedTimestep`; calibration render of the checker cube | Pages URL shows a Phaser canvas connected to the hosted server printing `{ok, build}`; CI green; spike results recorded in `DECISIONS.md` | 3 | Smoke |
| **M1 Lobby + role cards** | Create / Join by code, Start, private role card | `PartyRoom` create / join / start; `CodeRegistry`; generic join error; phase machine lobby -> roleReveal; `assignRoles` + `dealTraits` with property tests; `Private` view privacy; DOM Landing, Lobby, RoleCard (CSS flip, 12 s, Ready, Tab); deep link `#/join/CODE`; `swarm.ts` join-only bots. Content: `roles.json`, `traits.json`, `items.json` card text | Two browsers create / join; 11th refused; server test proves other players' `priv` is absent on the wire; card read in 20 s by a first-time tester | 4 | 2 people, one on a phone |
| **M2 Movement + one house** | Authoritative movement, scene-scoped sync, portal into a 2-room interior | 20 Hz fixed step with the `step()` order above; one input per tick; command queue; swept AABB; 150 ms lerp; `Visibility.ts` scene-scoped `presence` and `scenes` views; synchronous `Portals.ts` with transit; `World` restart; ASCII grid exporter; 40x30 overworld greybox + tavern bar + back room; keyboard + one touch stick + 3 buttons; HUD chip + timer | 2 humans + 6 bots walk, enter and leave both rooms; test proves outsiders receive no interior data and no cross-scene positions; 60 fps desktop, >= 45 fps on a 2022 mid-range Android; 30 min bot soak clean | 6 | 2-4 people: movement feel, phone controls |
| **M3 First playable: kill -> body -> vote** | The deduction loop, minimal; at exit, move the server to Railway Hobby before friends play | Kill (CD, range slack, grace, busy), body entity, Blood tint 60 s, Thread + Footprints with hold-E collect, Notebook, Detective auto-Verified; report body / square bell; Meeting scene with portraits, chat, secret vote, early end, eject + reveal; `resolveVotes` plurality + Skip; `checkWin` (all Killers out, parity, practice rule); ghosts + ghost chat; phases grace / day / dusk / night; widow cottage (2 rooms), forest, cave entry greybox; roles Killer / Detective / Doctor (Bandage only) / Townsfolk | Three 5-player matches in a row end in a Village or Cabal win in 10-18 min; vote accuracy and "would play again" logged; **fun-or-stop decision recorded** | 6 | 4-5 humans, two sessions |
| **M3b Quick mode** | One Night Ultimate Baguette playable end to end | `Settings.mode`; bakery greybox with plates, ledge and ledger; dusk plate-setting; sleep screen and night Conductor with per-window wake and validated acts; `loft` pseudo-scene; the pure `onub.ts` rules with property tests; Meeting reuse with no Skip and claim chips; `resolveDawn` and the winner table; the reveal with the swap log. Content: `roles.onub.json`, `balance.onub.json`, bakery scene JSON | Three 6-player matches in a row finish in 6-9 min; a sleeper's client provably receives no presence during the night; the Hireling, Sin-Eater, Cutpurse, Busybody, Sot and Lamplighter acts each verified in a server test; players name their final role correctly at the reveal in at least half the matches | 4 | 4-6 humans, two sessions; compare "would play again" against M3 |
| **M4 Deduction depth** | Everything that makes the vote smarter, one feature per playtest | Four PR-sized sub-goals: (a) clues 2-of-3 + prints, Lens charges, Dust / Compare, Autopsy, Rag, Bucket + Wet Bucket, drag smear, Corroborated; (b) Case Board with auto-Verified, Present 1, summary rows, suspect sets, structured accusations; (c) Butler Lock / Ledger, Child Witness, Accomplice Plant + inheritance, Drifter, Bandage knockback rules; (d) tasks (4 incl. 1 co-op, fetched tools, fake Cabal list, bar), Hunger, Final Night vote, missing-person roll-call, no-eject plurality rule. Content: `clues.json`, `abilities.json`, `tasks.json`, `balance.json` | Every V1 mechanic in 3.10 toggled on and tested in at least one session; suspect sets correct in server tests; vote accuracy tracked per feature | 12 | 5-6 humans after each sub-goal |
| **M5 World, stealth, items, PvE** | All V1 scenes and the stealth layer | 14 V1 scenes as grids with profiles and boarded doors; door state machine, keys, Skeleton Key, Crowbar; hiding + body spots, Burst Out, Check evidence; 5-slot inventory; noise with portal halving; sneak / run; lanterns and candles; quick-chat + pings; wolves, fence task, Wounded; 10-player rules and snowball guard; clue GC and tick budget gate | Full loop square -> house -> forest -> cave -> square with locks and hiding; 10 bots + 3 wolves at p95 tick < 15 ms; 8-player match with wolves reports "wolf" kills correctly | 11 | 6-8 humans: stealth and night |
| **M6 Art pass** | Replace placeholders with Blender renders | `batch_render.py`, `pack.ts`, `gen-anims.ts`, per-frame pivots; overlays and tint; Tiled maps replacing grids with decor and occluder layers; building and interior renders; UI from Illustrator; VFX; CREDITS complete | Every placeholder key resolved by a shipped atlas; first load <= 12 MB; <= 6 pages resident; 45 fps on the test Android; contact sheet reviewed | 10 code + Tier B art hours | 4-6 humans: trait and Blood readability at night |
| **M7 Polish + beta** | Reconnection everywhere, mobile, balance, public link | 60 s mid-match reconnection with notebook resync; "vanished" bodies; leader handoff, kick, transfer; profanity; rate limits; UI scale 200%, colour-blind check, reduce-motion; tutorial toasts; telemetry JSON lines; balance pass from data; Playwright e2e; README | Three consecutive 8-10 player public sessions without a room crash; reconnect success >= 95%; "would play again" >= 7/10 | 8 | 10-person stress, two public betas |

Total about 64 focused code days (16 weeks at 4 days per week, M3b included) with the first roles-on playtest at day 19 and Tier A art (60 h) in parallel from day 1; Tier B art (119 h) starts only after the M3 verdict.

### 7.2 Parallel tracks

| Track | Starts | Blocks on | Day-1 items |
|---|---|---|---|
| Code | Day 1 | nothing | scaffold, spike, lobby |
| Content (JSON) | Day 1 | GDD only | `roles.json`, `traits.json`, `items.json`, `scenes/*.json` ids, `tasks.json`, `clues.json`, `balance.json`; rules tests consume these before any map exists |
| Art | Day 1 | `metrics.json`, `SPRITES.md`, palette | calibration render, Illustrator kit, faction / trait icons, hero concept, base body |

Rule: art lands in `apps/client/public/assets` under keys the placeholder manifest already uses; code imports manifest keys, never paths; `?art=placeholder` keeps playtests running if a render breaks.

### 7.3 Placeholder strategy

Characters: a generated placeholder atlas (`tools/sprites/placeholder.ts`) with all 8 directions and the final animation keys, drawn as a capsule scaled by height, a scarf rectangle tinted R/G/B, a hat shape, a nameplate with the scarf shape icon; `PlayerView` logic is final from M2. World: Kenney Roguelike / Tiny Town 16 px tiles scaled x4 with nearest filtering set per key from the manifest `filter` field; doors as four-state coloured rectangles. Clues and bodies: coloured circles with a letter plus the final `clue_<id>` key. UI: DOM + CSS with palette tokens and Oswald / Inter. Audio: Kenney UI packs under the final SFX keys.

### 7.4 Risk register

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| 1 | Hosting cold start ruins the first impression | H | M | Render Free only until the M3 exit, with the `/health` "waking" landing state; Railway Hobby always-on from the first friends playtest |
| 2 | WebSocket blocked on school / corporate networks | M | H | wss on 443 only; hotspot advice in the error; documented limit |
| 3 | Role or position leak via synced state | M | H | Four privacy classes, view-scoped presence, fuzz test, no roles in logs or metadata |
| 4 | Scope creep (12 roles, 14 scenes) | H | H | M3 gate; V1.5 list frozen; one new mechanic requires one removal or a GDD change entry |
| 5 | Art style drift across Higgsfield / Blender / Kenney | H | M | Hero reference + calibration cube in every prompt; `palettize.py`; auto contact sheet from `pack.ts` |
| 6 | Cannot gather testers | H | M | Game designed to be fun at 4-5 humans; bots are load clients only; Discord playtest channel |
| 7 | Mobile performance | M | H | Baked lighting, 2048² pages, FPS overlay, real Android test each milestone |
| 8 | Licensing (Synty, Mixamo raw, NC, Pixabay) | M | H | Policy in `ASSETS.md`; CREDITS row in the PR template; masters outside the repo |
| 9 | Framework APIs behave differently from the write-up | M | M | Day-2 spike; in-memory role Map fallback; lerp-only netcode |
| 10 | Browser audio autoplay | H | L | Unlock on the Create / Join click; visual twin for every sound |
| 11 | Rubber-banding | M | M | 150 ms lerp, no prediction, swarm bot tick metrics |
| 12 | Deduction too certain or too weak | M | H | 2-of-3 clues, Lens charges, suspect sets; metrics from M3; all knobs in `balance.json` |
| 13 | Reconnection edge cases | M | M | State-driven UI; server tests per phase; 60 s window |
| 14 | Pages bandwidth / size | L | M | Budgets in 6.8; CI size report |
| 15 | Burnout in M4 | M | H | Four demoable sub-goals; each shipped behind a toggle |
| 16 | Tick budget on a shared vCPU | M | M | int16 positions, uint8 enums, 5 Hz view reconcile, clue GC, p95 gate before M4 |

### 7.5 Playtest plan

| Tier | When | Setup | Goal |
|---|---|---|---|
| Bot-only | every PR from M2 | `pnpm bots --n 9` | crashes, tick p95, patch size, memory over 1 h |
| 2-person | M1, M2 | owner + 1 friend, one on a phone | onboarding, controls, portal feel |
| 4-5 humans | M3, each M4 sub-goal | friends via Discord | is the vote fun; clue readability; meeting length |
| 6-8 humans | M5, M6 | friends + bots as load only | stealth, night, PvE |
| 10-person | M7 | 6 humans + 4 bots, then 10 humans | suspect sets in 2-Killer games, chat spam, load |

Metrics per match (server JSON lines): phase durations; kill -> report time; unreported bodies; clues collected per player; Inspect / Compare uses; vote accuracy; suspect-set correctness; chat lines per player; disconnects and reconnect success; FPS percentiles by device class; match length and winner by player count. Feedback form after each session: role played; "understood my role in 20 s" 1-5; "I knew where to go"; "the vote felt fair"; most confusing moment; phone or desktop; would play again 1-10; one thing to add, one to remove.

### 7.6 Workflow

`main` is always deployable and protected by CI. One branch per milestone task (`m4a/clues-and-lenses`), one AI session per branch scoped to a single task prompt from `ROADMAP.md`, PRs under 400 lines with tests for rules changes and a GDD note when behaviour changes. Squash-merge; tag `v0.<milestone>.<n>` at milestone exit. `pnpm docs:balance` regenerates `BALANCE.md` from `balance.json` and the PR template has a "docs updated" checkbox; there is no CI grep gate, no changelog automation and no preview deployments until a second contributor exists. Sessions never upgrade dependencies.

### 7.7 Day 1 to Day 14

| Day | Work |
|---|---|
| 1 | Repo init, `.gitattributes`, pnpm workspaces, tsconfig / eslint / prettier / vitest, `@wdi/shared` with `version.ts`, `constants.ts`, `metrics.ts`; `@wdi/content` with `palette.json`, `metrics.json`, zod; `docs/` seeded; LICENSE files. Art: pin palette, write the hero prompt, start the rig `.blend` |
| 2 | Spike package: custom `roomId` + `joinById`, hidden `.view()` field, `setFixedTimestep`; record results. `apps/server` with `defineServer`, `/health`; `apps/client` from the official Phaser 4 Vite + TypeScript template (Vite bumped to 8, `-nolog` scripts) with a Boot scene; `ci.yml` |
| 3 | `pages.yml`; Render Free web service from the GitHub repo (Railway Hobby at the M3 exit); CORS; version handshake; calibration render. **M0 exit** |
| 4 | Schemas (`Player`, `Private`, `Presence`, `GameState`, `Settings`); `PartyRoom` create / join; `CodeRegistry`; generic join error; tests for 11th join and version mismatch |
| 5 | Landing + Lobby DOM; join by code and deep link; Start gating with the confirm dialog |
| 6 | `roles.json`, `traits.json`; `assignRoles` + `dealTraits` with property tests; privacy test |
| 7 | Role card: `roleReveal` payload, DOM card with CSS flip, trait line, 12 s, Ready, Tab; join-only bots. 2-person test. **M1 exit**, tag `v0.1.0` |
| 8 | ASCII grid exporter -> tilemap + nav bitmap; 40x30 overworld greybox; collision loader shared by both sides |
| 9 | Fixed step with the `step()` order; one input per tick; command queue; swept AABB; client input at 20 Hz; placeholder atlas generator |
| 10 | `EntityView` / `PlayerView`, 150 ms lerp, teleport on view add; nameplates; HUD chip + timer |
| 11 | `Portals.ts` synchronous with transit; `Visibility.ts` scene-scoped views; `sceneEnter`; `World` restart; tavern bar + back room |
| 12 | Touch stick + 3 buttons, resize; FPS overlay; test "outsider never sees interior or cross-scene positions" |
| 13 | 30 min bot soak; Android check; fixes |
| 14 | 2-4 person test; **M2 exit**, tag `v0.2.0`; `PLAYTESTS/` entry; M3 task prompts |

### 7.8 V2 outline

After the V1 beta: (1) 3D `ISceneCollider` from Blender navmesh exports; (2) `input.move` uses `yaw`; (3) cone + occlusion visibility predicate; (4) Three.js or Babylon.js renderer loading the same GLB sources used for the sprite renders; (5) Medium, the Beast, bats, spatial audio, voice chat. Gate: V1 rules tests green and content JSON frozen behind `schemaVersion`.
