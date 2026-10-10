# Decisions Log

> Generated from `docs/MASTER_PLAN.md` (v0.1, 2026-10-10). Decisions made with the owner, changes made during review, and the open questions that still need an answer.

## Decisions locked with the owner (2026-10-09)

| Area | Decision |
|---|---|
| Perspective | **V1:** top-down 2.5D in Phaser using pre-rendered 3D sprites made in Blender. **V2:** first-person 3D in the browser, reusing the server, rules and world data. |
| Networking | Static client on **GitHub Pages** plus a small **authoritative Colyseus** (Node/TypeScript) server on a cheap or free host. The server owns roles and rules so nobody can peek. |
| Players | **4 to 10** per party (5 is the real minimum; 4 is a practice party, see open question 4). |
| Art direction | **Stylized toon-noir**: chunky low-poly characters, moody lighting, saturated accents, readable from above. |
| Tools | Adobe (Illustrator, After Effects, Photoshop, Premiere), Blender, Higgsfield, CC0 libraries (Kenney, KayKit, Poly Haven). |

## 8. Decisions & changes from review

1. **One source of numbers.** `GDD.md` and `balance.json` own every value; `WORLD.md` keeps geography, ids and lore only; `ARCHITECTURE.md` points at `roles.json` instead of restating a roster. The World Bible's 9-minute cycle, automatic dawn meeting, chapel voting room, gate closing, 3-hit wolves, name-revealing fingerprints, bloodhound, wolf-tooth charm, 20% item drop, NPC witnesses, sabotage and beacon rules are removed or deferred to V1.5 / V2.
2. **Metrics locked:** 64 px tiles, 1 m = 1 tile, 128 px character cells, 90 px silhouette; interiors use camera follow; overworld 64x48 with gated districts.
3. **Render rig corrected:** camera X = 40°, Z = 0° (no 45° yaw diamond), straight-down ground tiles, calibration render in M0. Lighting is baked (no Light2D, no normal maps) in V1.
4. **Traits:** boot trait replaced by hat; clue mapping Footprints = height, Thread = scarf, Felt = hat. Overlay passes (scarf, hats, blood) render through the rig for every clip; 10-hue LUT variants dropped.
5. **Scene scope:** 14 V1 scenes with player-count profiles; every V1 house has an internal door to a second scene; cave entry in V1; fisher cottage, lighthouse, sea exit and the Lurker deferred.
6. **Milestone reorder:** first roles-on playtest moved from day 39 to day 19 as "Mafia with walking"; M4 split into four toggled sub-goals; anti-stall rules and Case Board are enabled one per playtest; Tier B art waits for the M3 verdict.
7. **Netcode:** positions and status are view-scoped per scene (V1) with radius + occluder as a V1.5 predicate; four privacy classes in the schema; command queue inside `step()`; synchronous portals; busy / transit states; one input per tick; range slack with a position ring; tick-based time; int16 positions; secret votes; state-driven meeting UI; `localStorage` reconnection token; deviceId bans; generic join errors with proxy-aware rate limits; message cap 100 with dropping buckets; no prediction, 150 ms lerp.
8. **Balance:** 5 is the real minimum, 4 is practice with "Village <= 1" and 60 s kill CD; 2-of-3 trait clues per kill, Lens charges, suspect sets of up to 3 instead of a single name, Magnifier drops on death, Corroborated entries; locks never trap, Killer Lock expires and is off below 6; drag smears, screaming hidden bodies, one bell with per-player pulls, missing-person roll-call; Ledger lists houses without times and Autopsy is +/-45 s; Bandage never reveals a name; meetings show portraits; Final Night is a hunt plus a forced vote; the plurality rule needs ceil(living/3); Accomplice inherits the knife; Clue Surge dropped; ghosts see roles and get a Wisp; 30 s grace with a teaching clue; Ranger bolt becomes Arrest; hiding gets Burst Out and Check evidence; wolves flee any light and only the fence controls them; no well fall in V1.
9. **Process:** two workflows, Railway via GitHub integration with Nixpacks, no Dockerfile, no staging, no previews, no docs grep; kick / transfer / profanity / accessibility moved to M7; bots are load clients only.
10. **Assets and licensing:** masters outside the repo, `.gitattributes` on day 1, LFS only for rig sources, Mixamo and Quaternius sources never committed, Pixabay replaced by CC0, Synty banned, Adobe generative use logged and non-beta only, OFL fonts only, separate code and asset licences; packer `Phaser3` exporter with rotation off; dotLottie only and V1.5; portraits lazy WebP; V1 audio cut to 8 SFX + 1 loop; compressed textures deferred.
11. **Conventions fixed in M0:** `SPRITES.md` frame regex and direction table, one `dirFromVector`, tool paths (`tools/blender/batch_render.py`, `tools/sprites/pack.ts`), atlas keys `char/<body>/<anim>/<dir>` with non-role body ids, portal schema with `zoneId`, co-op task definition and `Entity.carriedBy`.

## 9. Open questions for the owner

1. **Engine line.** The plan pins Phaser 3.90.0 as decided and uses no 4-only features. Phaser 4.2.1 is now the maintained line and the official guidance is to start new projects on it; the switch costs about one M0 day (lighting and tint API names differ) and nothing else in this plan changes. Keep 3.90.0 or move to 4.2.1? **Resolved 2026-10-10: Phaser 4.2.1 (A5).**
2. **Hosting from day 3.** Railway Hobby needs a card and $5 per month from M0; Render Free is enough for M1-M3 tests if you accept a one-minute wake. Which do you want first? **Resolved 2026-10-10: Render Free until the M3 exit, then Railway Hobby (A6).**
3. **Hat replaces boots as the third trait** (cap / bowler / bare), with Felt on the door frame as its clue. Approve? **Resolved 2026-10-10: approved (A1).**
4. **Practice at 4.** 4 players is labelled practice (Cabal needs 3 kills, no ranking) and 5 is the real minimum. Approve, or do you want 4 treated as a full match with the weaker balance? **Reframed 2026-10-10 by A16:** 4 stays practice; below 4 the seats fill with NPCs (open question 15).
5. **Higgsfield plan tier.** All generated assets must come from a paid, watermark-free plan; confirm the account tier before the first asset is committed. **Resolved 2026-10-10: the account is the paid Plus tier (read from the connector by Session D).**
6. **Original art licence.** `LICENSE-ASSETS`: All Rights Reserved (safest for a public repo) or CC BY-NC-SA 4.0?
7. **Where masters live.** Creative Cloud or Drive for `.ai`, `.aep`, `.psd` and character `.blend` files (the repo holds only exports and the rig)? **Resolved 2026-10-10: the ROSW checkout on the owner's laptop (A2).**
8. **Final Night.** The bell channel is replaced by a 90 s hunt and a forced vote that Cabal wins on a tie. Approve this ending?

## Amendments (2026-10-10)

| # | Item | Decision |
|---|---|---|
| A1 | Open question 3 (hat replaces boots as the third trait) | **Approved by the owner.** Traits are Height, Scarf, Hat; clue mapping Footprints = height, Thread = scarf, Felt = hat. |
| A2 | Open question 7 (where masters live) | **Answered:** masters live on the owner's laptop in the ROSW checkout (`groot99-droid/Pipelines-Plugin`) under `studio/assets/who-did-it/<kind>/<slug>/`, git-ignored there, with a studio note per made thing. `ASSETS.md` 6.6 and 6.10 updated. |
| A3 | Theme addition: One Night Ultimate Baguette | **Added** as a lobby-selectable quick mode (GDD 3.11) with the wake-loaf fiction, Crumb's Ovens (`bakery`) in the world, rules and schema deltas (ARCHITECTURE 5.14), milestone M3b (ROADMAP) and three asset rows. The owner's friend invented the game as a wrapper of the one-night hidden-role card game; the ruleset and wording here are original. Trademark caution recorded in GDD 3.11 and CLAUDE.md. |
| A4 | Connection to the ROSW repo | A `.claude/settings.json` that registers the `rosw` marketplace and enables `ui-design@rosw` is specified in `ASSETS.md` 6.10 and was approved by the owner on 2026-10-10 (A8); `CLAUDE.md` documents where masters, studio notes and the Higgsfield library live; ROSW `writing-museum/` noted as the V2 renderer candidate. The ROSW repo itself was not changed (read access only). |

Open questions 1, 2, 3 and 7 above are closed. Still open: 4 (practice at 4), 5 (Higgsfield plan tier), 6 (asset licence), 9, 10 and 11 below. New since v0.1:

8. **Which playable first?** M3 (kill, body, clues, vote; "Mafia with walking") or M3b (the quick mode, no kills or clues, 4 days). **Resolved 2026-10-10: M3 first, M3b right after (A7).**
9. **Quick-mode sleep model.** Black "asleep in the loft" screen (no leaks, recommended) or sleepers standing in the dark loft hearing muffled noise pulses (more atmosphere, leaks window timing).
10. **Public name if the game is ever sold.** Keep the parody title private and ship as "The Wake Loaves", or pick another neutral name now.
11. **A `who-did-it` project in ROSW.** Creating the studio project folder, its first notes and a render-pipeline skill in Pipelines-Plugin needs push access to that repo; say so and the next session can open a pull request there.

| # | Item | Decision |
|---|---|---|
| A5 | Engine line (open question 1) | **Phaser 4.2.1.** The official Vite + TypeScript template, `setLighting(true)` for the V1.5 lighting experiment, filters for vignette and bloom. About one M0 day of difference; `ARCHITECTURE.md` 5.1, `WORLD.md` 4.7 and the day-2 schedule updated. |
| A6 | Hosting (open question 2) | **Render Free until the M3 exit, then Railway Hobby.** The landing page shows "Waking the village..." while `/health` is polled; only `VITE_SERVER_URL` changes at the move. `ARCHITECTURE.md` 5.10, `ROADMAP.md` M0, M3, day 3 and risk 1 updated. |
| A7 | First playable (open question 8) | **M3 (the full loop) first**, then M3b (the quick mode). |
| A8 | Marketplace settings (A4) | **Approved.** `.claude/settings.json` registers the `rosw` marketplace and enables `ui-design@rosw`. |
| A9 | Render rig (ASSETS 6.2), from Session D's calibration render | Key light at azimuth **225°** (at 315° every camera-facing surface fell into the shadow band); `die` renders in **256 px cells** with the feet centred (a falling 1.7 m body overshoots 128 px); the rig is **built from code**, no `.blend` committed. Pending the owner's look at the calibration sheet. |
| A10 | Well ladder (GDD 3.6, WORLD 4.3) | `ov.well` -> `cellar.well` **ships in V1 at the Large profile** as a plain portal; the Shove verb stays V1.5. |
| A11 | Interior minimum (WORLD 4.2) | Interiors are **at least 12x9 tiles**; the 20x11 figure was never met by the loft and bedroom rooms of 4.3. |
| A12 | Roster interface (ARCHITECTURE 5.8) | `assignRoles(ids, settings, rng, roster)` reads `roster[String(n)].deal`, the exact row shape of `roles.json`; rules numbers (vision, noise, radii) were removed from `@wdi/shared/constants.ts` and live only in `balance.json`. |
| A13 | Matchmake throttle (ARCHITECTURE 5.3) | The per-IP bucket keys on the **last** `x-forwarded-for` hop (`clientIp`), since `AuthContext.ip` is the forgeable first hop and Express's `trust proxy` does not reach the route; `maxMessagesPerSecond = 100` is now applied on the room (5.11). |
| A17 | AI art licence (owner, 2026-10-10: "open source the AI art") | **AI-generated images are CC0 1.0** (`LICENSES/CC0-1.0.txt`); the two Higgsfield concepts return to `assets/source/concepts/`. The vendor-terms rule in `ASSETS.md` 6.5 is relaxed to a dated link in `LICENSES/vendors/README.md`. Hand-made art stays under open question 6. |
| A15 | Quick mode length (open question 12) | **Accepted as it plays**: the target in `GDD.md` 3.11 and the M3b exit gate are 5-7 minutes; timers in `balance.onub.json` unchanged. |
| A16 | NPC fill (owner request 2026-10-10) | **Approved in principle**: below 4 humans the server fills seats with NPC villagers dealt from the same roster. `GDD.md` 3.12 holds the proposed rules, `ROADMAP.md` adds M3c (3 days) after M3b, `ARCHITECTURE.md` 5.3 gates Start on 1 human. The role policy and numbers are open question 15. |
| A14 | Higgsfield concepts (ASSETS 6.5) | The two generated concept images stay on branch `claude/art-pipeline` and are **held out of the integrated tree** until a dated copy of Higgsfield's terms is saved in `LICENSES/vendors/` (open question 13). Their `CREDITS.md` and `MANIFEST.md` rows remain. |

## Spike results (M0)

Run 2026-10-10 against the pinned `colyseus 0.18.9`, `@colyseus/core 0.18.18`, `@colyseus/schema 5.0.36` and `@colyseus/testing 0.18.6` (ROADMAP day 2). Each result is covered by a test in `apps/server/test/`.

| Question | Result |
|---|---|
| Custom 5-char `roomId` + `joinById` | **Works.** `onCreate` draws a code, `presence.sismember` / `sadd("wdi:codes")` keep it unique (the in-memory presence returns nothing from `sadd`, so the check is `sismember` first, plus a synchronous in-process claim set so two concurrent creates cannot draw the same code), then `this.roomId = code`. Setting it inside `onCreate` is the only moment Colyseus allows. `client.joinById(code)` finds the room; `setMatchmaking({ private: true })` keeps it out of `join()` / `joinOrCreate()`. Twelve concurrent creates produced twelve distinct codes. |
| One `.view()` field hidden from other clients | **Works.** With `presence` and `priv` tagged `t.ref(X).view()` and `scenes` tagged `.view()`, `onJoin` does `client.view = new StateView(); view.add(player); view.add(scene)`. Adding the `Player` is enough: its tagged `priv` and `presence` children arrive with it. With 10 bots, each client holds all 10 `Player` roster rows but `priv` and `presence` are `undefined` on the 9 others; the `scenes` map holds only the entries that client's view contains. The schema builder takes `t.ref(Presence).view()`, not the `Presence.view()` of the ARCHITECTURE 5.4 excerpt. Nested builders are not accepted as collection elements: `t.array("string")`, not `t.array(t.string())`. Primitives need `.default()` or a fresh instance holds `undefined`. |
| `setFixedTimestep` | **Behaves as an accumulator at the requested rate.** `setFixedTimestep((ctx) => step(room, ctx), 20)` gave 20 +/- 3 ticks in 1 s of wall clock; `ctx` carries only `dt` (0.05), `dtMs`, `tick`, `subSteps` and `subDt`, never measured time. The rate is advertised to clients in the join handshake. The callback is wrapped in `performance.now()` for the `/health` `tickP95` sample. `subSteps` is left at 1 (no sub-stepping is needed before M2 collision). |
| Join errors | `matchMaker.joinById` throws different messages for a missing room (`not found`) and a locked or full room (`is locked`; a room that reaches `maxClients` locks itself), so they leak. The single entry of the HTTP matchmake route is `matchMaker.controller.invokeMethod`; wrapping it turns every failure (missing, locked, full, version mismatch via the static `onAuth`, bad name) into `404 "party not found or unavailable"`. The same wrapper holds the per-IP and global token buckets and answers `429` when throttled. |
| CORS | The matchmake route reads `matchMaker.controller.DEFAULT_CORS_HEADERS` and `getCorsHeaders()`; the default sends `Access-Control-Allow-Origin: *`, so the default header is deleted and `getCorsHeaders` echoes only `https://groot99-droid.github.io` and localhost. |
| Not verified | `patchBytes` on `/health` is wired but not yet fed (patch size is not exposed on the room in 0.18; M2 must find a hook). The production-build check for `debug.roles` is runtime-gated by `WDI_DEBUG`, so the handler's code is present in the bundle but never registered; a stricter build-time strip is open. `trust proxy` is set on the Express app; the matchmake route takes the client address from Colyseus' `AuthContext.ip`, which needs a check behind Render's proxy at the first deploy. |

## Open questions added at integration (2026-10-10)

12. **Quick mode length.** With the timers in `balance.onub.json` a match runs about 5-7 minutes, under the 6-9 minute target of `GDD.md` 3.11. Raise the discussion timers to meet the target, or accept the shorter match and change the target? **Resolved 2026-10-10: the owner likes the mode as it plays; the target is now 5-7 minutes (A15).**
13. **Higgsfield terms.** Save a dated copy of Higgsfield's terms of service into `LICENSES/vendors/` (Session D could not fetch them; the account is the paid Plus tier, which settles open question 5). The two concept images then return from branch `claude/art-pipeline` into `assets/source/concepts/`. **Resolved 2026-10-10: the AI art is open source under CC0 and the rule is a dated link (A17); images restored.**
14. **Calibration sheet.** Look at `apps/client/public/assets/calibration/calibration_sheet.png` and confirm A9 (key light 225°, `die` in 256 px cells) or ask for a re-render.
15. **NPC fill policy (A16, GDD 3.12).** Recommended: fill to 4 automatically, leader may add NPCs up to 6 players, NPCs can hold any role including Killer with the scripted behaviour in 3.12, NPC matches count as practice. The simpler alternative is Village-only NPCs, which makes a 2-human party trivial (the Detective knows the other human is the Killer). Approve the recommendation, or choose Village-only?
