import { ErrorCode, type OnubPrepStreams } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { refuse } from '../Flow';

// Evening Prep (GDD 3.11 "Evening Prep", ARCHITECTURE 5.14): the `onub.prep` commit, the prep clock and the end
// of prep. Session 5A owns this file; the pre-seed holds the signatures of contract 4.3 with stub bodies.

/**
 * `act.ability {abilityId: 'onub.prep', targets: [stationId, cardId]}`, from `handleOnubAbility`: once per seat
 * in `Phase.dusk` (425 outside it; 422 for a second commit, `prepCommitProblem` or malformed `targets`).
 */
export function handlePrep(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  void payload;
  refuse(room, sessionId, ErrorCode.cannot, 'cannot do that'); // stub until 5A lands
}

/**
 * Each tick in `Phase.dusk` (`runOnubPhases`): ends prep at `phaseEndsTick`, or early when every seat has
 * committed and `prep.endsWhenAllCommitted`.
 */
export function runPrep(room: PartyRoom): void {
  void room; // stub until 5A lands
}

/**
 * The three match streams `resolvePrep` draws from (contract 4.1, `deck/wire.md` 2.2): `piles` the public order
 * of each pile, `thaw` the card each Thermostat Flip discards (secret until game over), `perk` the Pantry Location
 * the proofing visitors see (private to them). Pre-seeded and implemented; `endPrep` passes it to `resolvePrep`.
 */
export function prepStreams(room: PartyRoom): OnubPrepStreams {
  return { piles: room.seeds.get('piles'), thaw: room.seeds.get('thaw'), perk: room.seeds.get('perk') };
}

/**
 * The end of prep (`runPrep`, `onubClock`): timeout commits (`prepTimeout` stream), `resolvePrep(commits, seats,
 * onubBalance.stations, onubBalance.cards, onubBalance.ruin, onubBalance.pantry.locations, prepStreams(room))`,
 * `o.cards = tableAtNight(...)`, the board's piles, ruin and perk, the perk's `nightReveal` to each proofing
 * visitor, then `Phase.prepReveal` for `prepRevealS`.
 */
export function endPrep(room: PartyRoom): void {
  void room; // stub until 5A lands
}
