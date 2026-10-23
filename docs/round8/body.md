# Bodies: health, stamina, effects, fists, inspect (8A, 8B)

Rules land in GDD 3.22 (new), and 3.6 and 3.15 change where the two-hit-point model is replaced. Every number goes
in `balance.json` `body` (replacing `health`) and `effects.json` (new), never here.

## 1. What exists today (6Z, read on 6e5a91b)

Hit points exist only as room memory in `sim/mobs/hurt.ts`: 2 HP, a wolf bite takes 1, and the seat regains 1 every
90 s. A wolf bite to 0 is a `wolf` death (`Kill.ts` `creatureKill`), and the other creatures stop at 1. The Knife
ignores hit points (A89). `knifeDamage`, `woundedS` and `woundedSpeedFactor` are in the schema and unused.
Wounded, Stun and Snared exist only as text in `abilities.json`. There is no stamina. The Killer's **Hunger**
(GDD 3.3, A50) is a different thing and keeps its name; the body's food need is called **Famished**.

## 2. Health and stamina (8A)

- **Health** becomes a scale fine enough for a fist: `body.maxHp`, a number 8A picks (about 100) so that the
  smallest hit (a fist) is a few points and a wolf bite is a quarter or more. It regenerates slowly out of combat
  (`body.regen*`), never while Bleeding or Poisoned.
- **Stamina**: `body.maxStamina`. Running (`movement.runTilesPerS`, already in balance), striking and struggling
  free cost it; walking and standing restore it. At zero the seat is **Fatigued** until it is back over
  `body.fatigueRecover`.
- Both live in `Private.body` (schema version 6, [seams.md](seams.md)). Only the seat itself receives them, never
  another client and never a public field.
- Ghosts have no body. A meeting's gather to the square leaves health and effects as they are, but wakes a
  knocked-out seat (Dazed).
- NPC seats have bodies like anyone. Ambient townsfolk (8E) have a reduced body: health and the effects they can
  show, no stamina.

## 3. The damage table

Every attack is a row of `body.damage` (or of `mobs.json` for creatures) with its damage, its chance of each
effect, and whether it can kill:

| Source | Damage | Effects it can apply | At zero health |
|---|---|---|---|
| Killer's Knife (`kill`) | none: it kills outright, as today (A89) | none | death, cause `knife` |
| Fists (`strike`, new, every seat) | small | Dazed (rare), Weakened (on a heavy hit) | **knocked out** |
| Mugging blow (8E) | as fists | as fists | knocked out |
| Wolf bite | large | Bleeding | death, cause `wolf` |
| Boar, bat, rat | per row | Bleeding (boar), Poisoned (rat) | death (the owner's answer: creatures kill), cause `creature` |
| Bleeding tick | per second | none | death, cause `bled` |
| Poisoned tick (food, a rat, a sublethal dose) | per second | Weakened | death, cause `sickened` |
| Nightshade night power (`poison`) | as today | none | death, cause `poison` (unchanged) |
| Last shot (`lastShot`) | as today | none | death, cause `shot` (unchanged) |
| Slingshot (`slingshot`, Child, now live) | small | Stunned | knocked out |

`DeathCause` is append-only: `creature`, `bled` and `sickened` are added, and `wolf` stays. A death by `bled` or
`sickened` leaves the body where it fell with no killer clue and no kill scream. A death by `creature` is like
`wolf`. GDD 3.18's death cutscenes gain rows for the new causes.

## 4. Fists (8A)

`strike` is a new ability every card has, in every world phase. It has a short cooldown, costs stamina, and has a
reach of about one tile (`body.strike*`). It is an `act.ability` like the Knife and goes through `Actions.ts`. It
hurts seats, ambient townsfolk and creatures; creatures gain an `hp` column, so a seat can fight a rat off or
drive a wolf away. A strike is public: the swing plays for everyone who can see it (3.7). It leaves no clue unless
blood is drawn. The Knife is untouched: a Killer's `kill` is still the instant kill, in its phases, with its
cooldown and clues.

## 5. The knockout

At zero health from fists, a mugging or a slingshot, the seat is **knocked out** for `body.koS`. It lies where it
fell (anim `down`) and cannot move, act, talk in proximity chat or be targeted by the Knife's protection powers.
It drops `body.koPurseShare` of its purse on the ground, where anyone can take it (8C). It wakes at
`body.koWakeHp`, Dazed. A meeting wakes it early. Being knocked out is never a death: no body, no meeting trigger,
no clue but the dropped coins.

## 6. Effects (8A; ids are fixed in [seams.md](seams.md), numbers in `effects.json`)

| Effect | What it does | Sources | Cures | Physical sign (public) |
|---|---|---|---|---|
| Slowed | speed factor | a snare, deep mud, Wounded | time, salts | `limp` |
| Wounded | as GDD 3.6 (speed factor, drip trail) | health under `body.woundedBelow` | healing over the threshold | `limp`, drip trail |
| Bleeding | health per second | wolf and boar bites, broken glass | bandage, medkit | `bleeding`, drip trail |
| Weakened | strike damage factor | heavy hits, Poisoned, Famished | food, rest | none (inspect only) |
| Poisoned | health per second | bad food, rat bites, a sublethal dose | remedy, salts | `poisoned` (a green cast) |
| Fatigued | no running, slower strikes | stamina at zero | rest, a Wake Loaf | `fatigued` (a stagger) |
| Stunned | no move or act, briefly | slingshot, a heavy blow | time | `stunned` |
| Dazed | blurred view (own client), slower | waking from a knockout | time | `dazed` |
| Famished | stamina regenerates slower | no food for `body.famishedAfterS` | any food | none (inspect only) |
| Knocked out | see 5 | see 5 | time, a meeting | `down` |
| Indebted | (8D's, an economy status) | unpaid rent | paying | none (inspect only) |

Medkit, bandage, salts and remedy (`items.json`) become what the table says. `heal` (+HP) goes live with the
medkit. A **Wake Loaf** item is added, bought at the bakery (8C) and baked at Crumb's Ovens. It cures Famished and
restores stamina. 8A may add effects only by appending rows and ids.

## 7. Inspect and the relations table (8B)

- **Inspect** (`act.inspect`, new) works on a seat or an ambient figure within reach, in every world phase, with
  a short cooldown. The inspector receives a private `inspect.result` message with what the eye can see:
  - the physical signs above, as words ("limping", "pale and sweating");
  - a health band ("unhurt", "bruised", "badly hurt"), never the number;
  - a carried light, a held tool;
  - a purse band ("a light purse", "a heavy purse"). This is 6Z's call: the jingle is a physical sign, and it is
    how money becomes visible to people and to muggers (8E).
- Inspect **never** reveals a card, a cover, a vendetta, an inventory beyond the held tool, a notebook or a role's
  private state (CLAUDE.md, role secrecy).
- The look itself is public: anyone in sight sees the inspector turn and study the target (anim `inspect`), and the
  inspected seat gets a private note "<look> looked you over".
- **Suspicion.** `relations.json` (new content) holds rows `{ inspector, inspected, map?, suspicion, note? }`.
  Each side is a role id, a vendetta id, a faction or a look; `map` limits a row to one setting.
  - When a row matches, the server raises the inspector in the suspicion of every NPC seat that saw the look,
    including the inspected one if it is an NPC (`Brain.suspicion`), by the row's `suspicion`. When the row has a
    `note`, it sends the inspected human a private, card-blind hunch ("their eyes lingered on your watch chain").
  - Matching is server-side only. What a client receives depends only on what it could see, never on the cards
    that matched.
  - The owner's example ("an Activist inspecting a Railroad Baron") is a row from the Activist vendetta to the
    Railroad Baron. The Baron is a Bible catalyst who arrives on the Train in R9, so the row ships inert until that
    role exists. 8B seeds the table with rows for today's cards and vendettas: the Detective and Vicar
    relationships, the Bandit and Clerk, the Zealot and Vicar, the Hitman and the mark, and so on. It lists them
    in its PR for the owner's review.
- Inspect is a client prompt like `E` ("Inspect" on a seat in reach when nothing else is offered), with a card
  panel in the HUD (8H animates it).

## 8. Tests the sessions owe

- **8A**:
  - every row of the damage table;
  - each effect's on/tick/cure;
  - knockout and wake;
  - the meeting wake;
  - `Private.body` reaches only its seat, and no public field moves except the status bits;
  - the Knife unchanged;
  - `pnpm auto -- --matches 50` clean with a new invariant `bodyBounds` (health and stamina within bounds, no dead
    seat with a body).
- **8B**:
  - inspect returns only physical signs;
  - a cover-wearer and a true wearer of the same look return the same message types;
  - the relations rows move NPC suspicion;
  - no row's match changes anything a third client receives.
