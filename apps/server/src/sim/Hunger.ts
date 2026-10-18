import type { PartyRoom } from '../rooms/PartyRoom';

// Hunger (GDD 3.3, round-5 `deck/wire.md` 5). Session 5G owns this file; the round-5 pre-seed holds the hook below
// with a stub body, called from its locked site in `Step.ts`.

/**
 * After `runAiAndHazards` (`Step.ts`): a living Killer whose last strike is `hunger.cyclesWithoutKill` rounds old
 * when a day starts is Hungry and leaves a `hungerPrints` clue every `hunger.trailEveryS` of movement. Pre-seed
 * stub: no-op.
 */
export function runHunger(room: PartyRoom): void {
  void room;
}
