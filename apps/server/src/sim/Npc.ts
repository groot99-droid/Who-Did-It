import type { PartyRoom } from '../rooms/PartyRoom';

/**
 * The NPC stage (GDD 3.12, A39): writes `PlayerSim.input` for every NPC seat and calls the verbs
 * (`runAction`, `queuePortal`, `handleVote`) directly, inside the step. Runs after `syncRoster` and
 * before `applyInputs` (`sim/Step.ts`). Round 4: Session S; NPC state is room memory of this module.
 */
export function runNpcs(_room: PartyRoom): void {}

/** Whether `id` is an NPC seat of this room (room memory, never on the wire). Session S keeps the set. */
export function isNpcSeat(_room: PartyRoom, _id: string): boolean {
  return false;
}
