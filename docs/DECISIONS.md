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

1. **Engine line.** The plan pins Phaser 3.90.0 as decided and uses no 4-only features. Phaser 4.2.1 is now the maintained line and the official guidance is to start new projects on it; the switch costs about one M0 day (lighting and tint API names differ) and nothing else in this plan changes. Keep 3.90.0 or move to 4.2.1?
2. **Hosting from day 3.** Railway Hobby needs a card and $5 per month from M0; Render Free is enough for M1-M3 tests if you accept a one-minute wake. Which do you want first?
3. **Hat replaces boots as the third trait** (cap / bowler / bare), with Felt on the door frame as its clue. Approve?
4. **Practice at 4.** 4 players is labelled practice (Cabal needs 3 kills, no ranking) and 5 is the real minimum. Approve, or do you want 4 treated as a full match with the weaker balance?
5. **Higgsfield plan tier.** All generated assets must come from a paid, watermark-free plan; confirm the account tier before the first asset is committed.
6. **Original art licence.** `LICENSE-ASSETS`: All Rights Reserved (safest for a public repo) or CC BY-NC-SA 4.0?
7. **Where masters live.** Creative Cloud or Drive for `.ai`, `.aep`, `.psd` and character `.blend` files (the repo holds only exports and the rig)?
8. **Final Night.** The bell channel is replaced by a 90 s hunt and a forced vote that Cabal wins on a tie. Approve this ending?
