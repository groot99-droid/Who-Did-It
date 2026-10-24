import type { PartyRoom } from '../../rooms/PartyRoom';
import { applyEffect, cureEffect, deriveEffects, hasEffect } from './effects';
import { bodyOf } from './state';

/**
 * The well's charm (GDD 3.22, Charmed; docs/round8/stations.md 4): one silent charge, Remedy-like. It shows only in
 * the seat's own `Private.body` and draws no status bit, so a seat with a spent or an unspent charm looks the same.
 */

/** 7M's well, on its `luck` band: the seat holds the charm. Returns false for a seat with no body or one already held. */
export function grantCharm(room: PartyRoom, seat: string): boolean {
  const body = bodyOf(room, seat);
  if (!body || hasEffect(body, 'charm')) return false;
  applyEffect(room, seat, body, 'charm', 0);
  return true;
}

/**
 * From `handleKill`, after the Watch, the Remedy and the Bandage: a killing Knife strike on a charmed seat spends the
 * charm and leaves it Wounded at 1 health instead. Returns whether it did; the striker is then told "nothing
 * happens", as for any voided strike, and nothing else (no hit, no clip, no scream, no clue).
 */
export function spendCharm(room: PartyRoom, seat: string): boolean {
  const body = bodyOf(room, seat);
  if (!body || !cureEffect(room, seat, body, 'charm')) return false;
  body.hp = 1;
  body.lastHurtTick = room.state.tick;
  deriveEffects(room, seat, body);
  return true;
}
