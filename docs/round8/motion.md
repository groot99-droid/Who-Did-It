# Motion: every new animation (8F, 8G, 8H)

The owner: "create animations for everything, animate wolves attacking, characters attack since all characters
should be able to deal a small amount of damage, create animations for collectible materials breaking after
collection, and everything else including UI animations like hover, transitions, transport, activation, and more"
(A134). The art rules are `docs/SPRITES.md` and `docs/ASSETS.md` (CC0 or own renders, both art styles, the
budgets of ASSETS 6.8); the motion rules are `docs/UI.md` 9. Every animation honours reduced motion: a movement
becomes a cut or a single held frame, a flash becomes a static mark.

## 1. Characters (8F)

**What exists.** `looks.json` clips idle, walk, swing, interact and die, rendered by the Blender rig
(`tools/blender/rig_common.py` `V1_CLIPS`) for the 13 looks and 8 directions, in both art styles. They are played by
`view/PlayerView.ts` as `char/<lookId>/<clip>/<dir>`, with the scarf, hat and blood passes.

**New clips**, ids fixed in seams.md and frame counts 8F's to set against the budget:

| Clip | Plays when |
|---|---|
| `strike` | fists (body.md 4); `swing` stays the Knife's |
| `hurt` | a hit lands |
| `knockdown` | health reaches zero by fists |
| `down` | the knockout (loop) |
| `getup` | waking |
| `run` | running (today running plays `walk` faster) |
| `limp` | Slowed, Wounded |
| `stagger` | Fatigued, Dazed |
| `stunned` | Stunned |
| `inspect` | inspect (body.md 7) |
| `threaten` | a mugging's threat |
| `cower` | a Scared idle |
| `fidget` | a restless idle |
| `stomp` | an Angry idle |
| `eat` | eating a Wake Loaf |
| `rob` | robbing a knocked-out seat |

- **Which looks.** Every clip, for every look and the `villager` family (8F adds 3 or more villager variants for the
  ambient townsfolk), in both art styles.
- **Overlays.** The physical signs are client-drawn overlays on any clip, so they need no new renders:
  - bleeding: a drip trail and a red tick on the blood pass;
  - poisoned: a green cast;
  - dazed: wobbling stars;
  - stunned: sparks.
- **Budget.** A clip that does not fit the atlas budget (`tools/sprites/test/budgets.ts`) gets fewer frames, never
  a higher budget, unless 6Z grants one in a DECISIONS row.
- **Order.** 8F renders through the rig, `palettize.py` and `save_masters.py`; the MANIFEST rows go to
  `assets/source/MANIFEST.md`.

## 2. Creatures, resources, VFX (8G)

- **Creatures.** Today: idle, walk and attack, drawn in code (`tools/sprites/m5b-mobs.ts`, A95), with the attack
  playing once. 8G adds:
  - the **wolf's attack** as a readable sequence: crouch, lunge and bite, recoil, with a hit flash on the target;
  - `hurt` and `death` clips for every creature: they now take fists (body.md 4) and can die to fists, bolts and
    lights;
  - a `flee` gait.
- **Resource nodes breaking.** Today a node only swaps `ready` for `spent`. 8G adds a `break` sequence for every
  resource: timber splinters, stone cracks and crumbles, resin drips and seals, herbs and mushrooms are plucked and
  wilt, tin ore shatters. It plays once on collection, ends on `spent` with debris, and plays in reverse as the
  node regrows at `respawnTick`. The ids are `node_<id>/break/<nnn>`, drawn in code like the rest of A95.
- **Effects (VFX)**: hit spark; blood spatter; poison puff; coin burst (a mugging, a dropped purse, a sale); dust
  from footsteps and from a fall; the knockout's stars; the Wake Loaf's crumbs; the HQ tier's build dust and its
  upgraded props (economy.md 3); the Clerk's ledger; the mailbag.
- **Transport**: door swings (both ways), the portal fade and step, the well ladder's climb, the Train's arrival
  and departure (7I's station), the cellar hatch.
- **Owner's sounds.** The sounds that go with these come from the ROSW sound library by id (CLAUDE.md), with
  CREDITS and MANIFEST rows. 8G picks them and lists them for the owner.

## 3. The interface (8H)

- **What exists.** Duration tokens in `ui/theme/tokens.css` (`--wdi-dur-fast`, `-base`, `-flip`, zeroed under
  reduced motion), a handful of keyframes in `components.css`, the button transition, and `view/Transition.ts`
  (fade, iris, wipe).
- **What 8H adds**, every value a token and UI.md 9 its table:
  - **Hover and press**: every control (glass buttons, chips, cards, list rows, the inventory slots), with focus
    rings in step.
  - **Panels**: open and close (the notebook, inventory, crafting, quest log, shop, inspect card, mugging prompt,
    meeting), with a stagger for lists.
  - **Transitions**: menu to lobby to match; scene to scene (`Transition.ts` variants per portal kind: a door
    wipes, a ladder irises, the Train fades through the station); the meeting gather.
  - **Transport**: the in-transit veil, the Train journey card, the ladder's climb overlay.
  - **Activation**: ability buttons (a cooldown sweep, a press flash, a refused shake), item use, the E prompt
    appearing and filling while held, a task's mini-game opening.
  - **The body HUD**: the health and stamina bars with drain and regen easing and a damage flash; effect icons that
    pulse on apply, carry a timer ring and fade on cure; a vignette at low health, pulsing while Bleeding; the
    Dazed blur (own view only).
  - **The economy HUD**: the purse counter rolling, coins flying to the purse on a wage, the shop's buy and sell,
    and the HQ tier unlock.
- **Rules.** It touches no rule, number or wire. It uses `components.css` under a "Round 8 (8H)" block and the
  existing tokens; a new token is added to `tokens.css` with its reduced-motion zero.

## 4. Tests the sessions owe

- **8F**: the manifest keys for every look × clip × direction × style, the atlas budgets, and a
  `PlayerView.test.ts` case per new clip.
- **8G**: the mob clips per kind, `node_<id>/break` for every resource, and `NodeView` playing break on the active
  flag's fall.
- **8H**: `theme.test.ts` (no literal colour, the reduced-motion zero of every new token), and e2e screenshots of
  the HUD states (`e2e/motion.spec.ts`, new).
