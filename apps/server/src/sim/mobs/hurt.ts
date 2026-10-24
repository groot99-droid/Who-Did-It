import { balance } from '@wdi/content';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { bodyOf } from '../body/state';

/**
 * Round 8 (GDD 3.22, Session 8A): the two-hit-point model moved into `sim/body/` (docs/round8/seams.md 5). This
 * file keeps the round-6 names so 6G's callers compile: a creature's attack is a row of the damage table now.
 */
export { hurtByCreature } from '../body/damage';

/** A seat's hit points now, rounded up (a ghost's, or a seat's before the deal, reads full). */
export const hpOf = (room: PartyRoom, seat: string): number =>
  Math.ceil(bodyOf(room, seat)?.hp ?? balance.body.maxHp);

/** Bodies are reset by the deal (`initBodies`) and dropped in the lobby (`runBody`); nothing is left to reset here. */
export function resetHurts(_room: PartyRoom): void {}
