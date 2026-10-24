# Round 8 icons (8N): the review sheets

The status icons of `docs/round8/teardown.md` 3 (DECISIONS A168, A172), for the owner's look sign-off before the
set is drawn. Each icon is one square on the 48 px grid of `docs/SPRITES.md` 9 (2 px ink stroke, palette colours
only), hand-built as an SVG master in `tools/sprites/icons.ts` and finished for the three art styles the way every
other render is (`tools/sprites/pixel.ts`):

| Style | On the sheet | How |
|---|---|---|
| 8-bit | the 24 px cell at 2x (as the client draws it) and at 8x | the flat master at 48 px, snapped to the world palette and mode-halved |
| Low poly | the same cell at 2x and 8x | the flat master box-halved and alpha-bled |
| HD | drawn from the vector at 48 and 192 px | the gradient master, linear filtering |

The "white" ground is the bone ramp's lightest tone (`#FFF1DC`): the palette has no white in art (UI.md 2).

- `sheet-01.png`: the first six, bleeding first in the owner's words ("a dagger partially stabbed in a white
  background with red and around it and seemingly dripping"), then wounded, poisoned, stunned, dazed and knocked out.
- `icon_effect_<id>.<style>.png`: each icon's packed cell (8-bit and low poly, 24 px) or 48 px HD render.

Regenerate with `pnpm --filter @wdi/sprites icons:sheet <out.png> [key ...]`. Hand-made original art, CC BY 4.0
(`LICENSE-ASSETS`, A19); nothing third-party or generated went into it.

## Handover: what the icon line still has to draw (8N, 2026-10-24)

Round 8 stops after three PRs: #248 (A: the pipeline, the 11 effects, `sign_bloody`, `sign_hunted`), #250 (B: the
`mark_bleeding` figure mark) and #251 (D: 23 HUD icons). The masters, the format and the helper are in
`docs/SPRITES.md` 9.1. To add an icon:
1. Write `apps/client/public/assets/ui/icons/hd/<key>.svg` with the standard tile header of an existing master.
2. Run `pnpm --filter @wdi/sprites icons <key>`.
3. Add the key to `ICON_KEYS` (`apps/client/src/ui/icons.ts`) and its name to the SPRITES 9.1 table.
4. Review it with `icons:sheet` in all three styles.

The 8-bit look is the hard one: keep shapes and gaps at 4 px or more on the 48 grid.

Secrecy (6Z's brief): no icon encodes a secret, and a cover and its true wearer render the same. Charm, indebted,
role and card icons are shown only in their own seat's view.

### The remaining PRs, in order, each under 400 lines

- **Charm**: one effect icon, `effect_charm`. Draw it once 8A reserves `charm` in `EffectId`.
- **C, items**: `icon_item_<id>` for the ids in `packages/content/data/items.json`. The plan counted 45 items; the
  data now holds 51. Rebuild the list from the data: knife, skeletonKey, masterKeyring, bloodyRag, bucket, plantKit,
  crowbar, magnifier, notebook, lens, fingerprintKit, medkit, bandage, salts, lantern, candle, pocketWatch, chalk,
  rope, slingshot, replicaKnife, oil, wrench, planks, letter, flour, forgedAlibi, handcuffs, crossbow, bolt, snare,
  torch, lockpicks, sack, smokeBomb, heirloom, studyKey, seanceChalk, remedy, nightshade, fowlingPiece, spade,
  timber, stone, tinOre, resin, herb, mushroom, strongbox, indulgence, parishSeal.
  - `replicaKnife` must render exactly as `knife`, and `forgedAlibi` exactly as `letter`, if their public look must
    not tell them apart. Check GDD before drawing either differently.
  - `itemIconUrl(defId)` is ready.
- **E, abilities**: `icon_ability_<id>` for `abilities.json`. The plan counted 23 abilities: the ones not already
  shown by an item's icon. The data now holds 46: kill, killerLock, dragBody, plantClue, crowbar, inherit, inspect,
  dustCompare, bandage, autopsy, salts, lockUnlock, ledger, silentHide, witness, slingshot, tasks, chalk, rope,
  actShifty, fakeBlood, shoot, arrest, snare, pickpocket, lockpick, smoke, seance, skeletonKey, rag, wash, heal,
  light, collect, report, bell, hide, check, burstOut, sneak, impersonate, confession, keepWatch, remedy, poison,
  lastShot.
  - An ability whose button shows only to its holder (kill, impersonate, confession, poison and the like) is
    private-view only.
  - `abilityIconUrl(id)` is ready.
- **F, stations and mini-games**:
  - the tasks of `tasks.json`: lightLanterns, fixPump, deliverLetter, mendFence, fetchFlour, shutterWindows,
    mixDough, stokeOven, stockColdRoom, proofLoaves;
  - the mini-games of `minigames.json`: lanternPour, pumpSlide, letterTap, fenceCrates, flourCrates, doughPour,
    ovenStoke, coldCrates, proofSlide;
  - 8H's stations: oven and basin.
- **G, private-view sets**:
  - role cards (`roles.json`);
  - vendettas: zealot, activist, bandit, hitman;
  - clues (`clues.json`, 18): body, footprints, thread, felt, blood, wetBucket, fingerprint, dragSmear,
    timeOfDeath, silhouette, ledgerLine, droppedItems, fur, clawMarks, dripTrail, hungerPrints, landingPrints,
    teaching;
  - resources: timber, stone, tinOre, resin, herb, mushroom;
  - mobs: wolf, boar, bat, rat.

### Lists the peer sessions sent (2026-10-24), not yet drawn

- **8C (scrip)**:
  - drawn in D: the scrip coin (purse and prices), the bank's deposit and withdraw, wages;
  - still to draw: gain and loss, the shop (generic, or one per `economy.json` shop id), buy and sell,
    scrip-short, the coins pickup.
- **8D (civic)**:
  - drawn: indebted (A); faith, rent, quota, rumour, blackmail, HQ tiers 1 to 3 and the black market (D);
  - still to draw: rent due versus rent paid, if they differ; the mailbag, indulgence, parish seal, gazette, bank
    and altar; HQ tier 0, if it shows at all. HQ tier is public.
  - Curfew has **no** icon: a barred door must read as a plain `locked` door (8D, confirmed by 6Z).
- **8H (HUD)**:
  - goal; `phase_<phase>`; the report glyph (`talk_report` is drawn); toasts; settings glyphs; deck and role;
  - pockets, craft, quest and chores; `res_<id>`; work; the oven and basin stations; reward and turn-in;
    `task_<id>`;
  - health bands; look tags; run and sneak; `height_mid`; notebook statuses; contract; the meeting phases, tabs and
    labels.
  - DOM contract agreed with 8H: `iconImg` returns `<img class="wdi-r8icon" data-icon …>`, or null when the icon
    isn't drawn. 8H animates its host `span.wdi-icon-disc.wdi-anim-icon[data-state]`, never the image.
