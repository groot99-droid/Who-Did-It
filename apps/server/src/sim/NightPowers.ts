import { type DeathCause, ErrorCode } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { reject } from './World';

// Night powers, protections, Nightshade, the Last Shot and Inherit (GDD 3.2, round-5 `deck/wire.md` 5). Session
// 5G owns this file; the round-5 pre-seed holds the hooks below with stub bodies, called from their locked sites
// (wire.md 8.1). 5G keeps its memory in `PlayerSim` fields and `flow.poisoned`.

/**
 * A stage after `runImpersonation` (`Step.ts`): clears spent powers when a dusk or the Final Night begins,
 * resolves Nightshade at daybreak, runs the NPC night powers and Last Shots, closes aims and checks Inherit each
 * tick. Pre-seed stub: no-op.
 */
export function runNightPowers(room: PartyRoom): void {
  void room;
}

/**
 * `act.ability` with `confession`, `keepWatch`, `remedy`, `poison` or `lastShot` (`handleAbility`, `Actions.ts`).
 * Pre-seed stub: refused 422 "cannot do that", as every unknown ability is today.
 */
export function handleNightPower(room: PartyRoom, seat: string, payload: Record<string, unknown>): void {
  void payload;
  reject(room, seat, ErrorCode.cannot, 'cannot do that');
}

/** From `openMeeting`, before `alive` flips: Nightshade resolves (`markDead(seat, 'poison')`). Pre-seed stub: no-op. */
export function onMeetingOpenNight(room: PartyRoom): void {
  void room;
}

/** First line of `endReveal`: true keeps the reveal waiting for an ejected Gamekeeper's shot. Stub: false. */
export function holdReveal(room: PartyRoom): boolean {
  void room;
  return false;
}

/**
 * From `markDead`: a dying Gamekeeper (cause knife, poison or ejected) starts its aim and gets `aim {endsTick}`;
 * true defers the `killed` message until the aim closes. Pre-seed stub: false (`killed` goes out as today).
 */
export function beginAim(room: PartyRoom, seat: string, cause: DeathCause): boolean {
  void room;
  void seat;
  void cause;
  return false;
}

/**
 * From `handleKill`, for every strike `validateKill` accepts, after the Knife's cooldown is set and before the
 * Bandage check: spends one protection in the order Bandage, Watch, Remedy and returns true when the strike is
 * voided ("nothing happens"); also sets the actor's `lastStrikeRound` and caps the Final Night cooldown. Pre-seed
 * stub: false, so today's Bandage check runs as now.
 */
export function spendProtection(room: PartyRoom, target: string, actor: string): boolean {
  void room;
  void target;
  void actor;
  return false;
}

/**
 * Whether `seat` is aiming its Last Shot: its view holds no avatar (`Visibility.ts`) and the win check of its death
 * batch waits (`drainDeaths`). Pre-seed stub: false.
 */
export function isAiming(room: PartyRoom, seat: string): boolean {
  void room;
  void seat;
  return false;
}

/** `resetToLobby`: `flow.deck`, `flow.undealt`, `flow.poisoned` and the night-power memory. Stub: no-op. */
export function resetNightForLobby(room: PartyRoom): void {
  void room;
}
