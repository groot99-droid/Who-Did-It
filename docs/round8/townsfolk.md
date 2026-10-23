# Moods, mugging and ambient townsfolk (8E)

The owner: "having a lot of money raises your chances of getting mugged when alone with hungry/scared/angry/etc
NPCs", and both NPC seats and new ambient townsfolk mug (A134). The rules land in GDD 3.24 (new). The numbers live
in `balance.json` `moods` and `townsfolk`.

## 1. Needs and moods (NPC seats and ambient townsfolk)

The NPC brain (`sim/npc/memory.ts` `Brain`) has no needs or moods today: only reaction state, suspicion and the
Killer's timer (A100). 8E adds four **needs**, each a 0..1 level in room memory, server-only and never on the
wire:

| Need | Rises with | Falls with |
|---|---|---|
| **Hunger** (food) | time without food; Famished (body.md 6) | eating a Wake Loaf, a meal at home |
| **Fear** | a body seen, a creature's chase, night outdoors without a light, being struck, a meeting's ejection | daylight, company, a lit scene, home |
| **Anger** | being struck, robbed, taxed (8D's rent), refused at a shop, an Indulgence denied | time, a Wake Loaf, a meeting that ejects the seat it suspects |
| **Want** (money) | a light purse, debt (Indebted, 8D), a missed wage | wages, a sale |

The **mood** is the strongest need over its threshold: Calm, Hungry, Scared, Angry or Desperate (two or more
needs high). A mood changes the routine's weights:
- Scared goes home earlier and avoids the dark.
- Angry lingers near whoever it is angry at.
- Hungry heads for the bakery.
- Desperate walks the quiet places.

A mood also shows publicly as a gait or idle variant (8F's `fidget`, `cower` and `stomp` idles, seams.md), never as
a word. Inspect reads it as a physical sign ("restless", "red-faced", "hollow-eyed"). R10's propagation matrix
(Calm, Panicked, Entranced, Rioting) builds on these moods and never replaces them.

## 2. Ambient townsfolk

- **What they are.** New non-seat figures that make the town feel lived in and give money somewhere to go: a few
  per map (`townsfolk.count` by profile). They wear the `villager` look family (new variants by 8F, never a card's
  look) and walk routines like NPC seats (`routines.json`, home and work stations). They have needs and moods (1)
  and the reduced body (body.md 2).
- **What they never do.** They are not seats: no card, no vote, no task list, no part in any win. They are never
  the Knife's prey, and the Killer cannot kill them. They never die except to creatures: a wolf can take one, and
  its body is cleared at the next meeting with a line in the meeting text. Fists knock them out like seats.
- **On the wire.** They travel as scene avatars with opaque handles like seats (A50), so nothing but the drawn
  figure tells them apart.
- **Two named figures.** Each map has a **Company Clerk** (HollowMere) or **Tallyman** (BlackPine), who collects
  rent or quota for 8D, and **stallholders** at the market and shops (8C). They are ambient townsfolk with fixed
  routines.
- **Random streams.** They use a stream of their own (`townsfolk`), keyed per figure, never a secret one.

## 3. The mugging rule

- **When the chance is rolled.** An NPC seat or ambient figure in a Hungry, Angry or Desperate mood, that is
  **alone** with a target, rolls each second for a mugging. "Alone" uses A100's room rule: any scene but the map's
  hub, or within `sightTiles` in a large one, with no other seat or figure present.
- **What raises the chance**, each factor a number in `moods.mug*`:
  - the target's **purse band**: wealth is the owner's link;
  - the mugger's mood strength;
  - night;
  - the target being Weakened, Fatigued or alone with a heavy purse for long.
- **What lowers it**: the target carrying a lit light, the mugger being Scared, a Watchman nearby.
- **The mugging.** The mugger walks up and threatens (anim `threaten`). The target gets a prompt with three
  choices, chosen within `moods.mugAnswerS`, or the mugger strikes:
  - **Pay**: lose `moods.mugShare` of the purse.
  - **Fight**: strikes on both sides (body.md 4) until one is knocked out or flees.
  - **Flee**: run, at stamina's cost. The mugger may chase.

  A knocked-out target is robbed of the share. A knocked-out mugger drops what it carried. Banked Scrip is safe.
- **Who mugs whom.** An NPC seat mugs by its mood, never by its card (the card-blind rule of GDD 3.12). A Killer
  NPC's kill still comes only from its roll and its A100 timer, and mugging is never a second kill path. Ambient
  figures mug seats; seats can fight them off.
- **What humans can do.** A human can rob a knocked-out seat or figure (`act.hold` on it, `body.robHoldS`), which
  the owner's design implies. That is a crime others can witness, and a witness raises the robber in NPC
  suspicion (8B's machinery).
- **What it leaves behind.** A mugging leaves a `scuffle` clue (new `clues.json` row, append-only) and dropped
  coins. It does not trigger a meeting.

## 4. Tests 8E owes

- Needs rise and fall with their events.
- The mood picks the routine variant.
- The mugging roll rises with the purse band and the mood, and is zero with company or a lit light.
- The three choices; the robbery of a knocked-out seat.
- Ambient figures are never Knife prey, never in a vote, never in a win count.
- Moods and needs never reach a client.
- `pnpm auto -- --matches 50` clean with an invariant `figureNotSeat`: no ambient figure in any seat list, vote or
  win tally.
