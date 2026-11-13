import { balance } from '@wdi/content';
import { Phase } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { applyEffect, cureEffect, hasEffect } from '../body/effects';
import { type Body, bodyOf } from '../body/state';
import { onSim } from '../events/bus';

/**
 * The 10X Vicar's buff (story R5, GDD 3.20 and 3.22, DECISIONS A604; A600 R-Q1). The returned martyr wears the private
 * effect `ascended` from its return until the next dusk: its speed is `rite.buff.speedFactor` times (`speedFactorOf`)
 * and its maximum health `rite.buff.maxHpFactor` times the body's, and it comes back at that maximum. At dusk the
 * effect comes off and the extra maximum goes with it (health over the new maximum is lost). A return at the Final
 * Night has no dusk ahead, so the buff lasts to the match's end. It follows the look, as the return does: the effect
 * shows no sign, and its speed is all anyone else can see. The dealt Vicar's conversion aura while it lasts is `aura.ts` (R6).
 */
export const BUFF_EFFECT = 'ascended';

/** The health the buff adds to the body's maximum. */
export const buffHp = (): number => Math.round(balance.body.maxHp * (balance.rite.buff.maxHpFactor - 1));

/** Whether a body wears the buff (`invariants.ts` lets its maximum health rise by `buffHp`). */
export const ascended = (body: Body): boolean => hasEffect(body, BUFF_EFFECT);

const memories = new WeakMap<PartyRoom, { seat: string | null }>();

function memoryOf(room: PartyRoom): { seat: string | null } {
  let memory = memories.get(room);
  if (memory) return memory;
  memories.set(room, (memory = { seat: null }));
  const m = memory;
  onSim(room, 'phase', (e) => {
    const to = e.data?.to as number;
    if (to === Phase.dusk || to === Phase.lobby) endBuff(room);
  });
  onSim(room, 'start', () => void (m.seat = null));
  return memory;
}

/** At the return (`return.ts`): the seat's fresh body takes the buff, at its raised maximum health. */
export function grantBuff(room: PartyRoom, seat: string): void {
  const body = bodyOf(room, seat);
  if (!body) return;
  memoryOf(room).seat = seat;
  body.maxHp += buffHp();
  body.hp = body.maxHp;
  applyEffect(room, seat, body, BUFF_EFFECT, 0);
}

/** At dusk (or the lobby): the buff comes off and the body's maximum health falls back. */
export function endBuff(room: PartyRoom): void {
  const memory = memories.get(room);
  const seat = memory?.seat ?? null;
  if (!memory || seat === null) return;
  memory.seat = null;
  const body = bodyOf(room, seat);
  if (!body || !cureEffect(room, seat, body, BUFF_EFFECT)) return;
  body.maxHp = Math.max(1, body.maxHp - buffHp());
  body.hp = Math.min(body.hp, body.maxHp);
}
