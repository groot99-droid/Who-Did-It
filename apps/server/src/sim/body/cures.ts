import { balance } from '@wdi/content';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { AnimId } from '../constants';
import { emitSim } from '../events/bus';
import { take } from '../Inventory';
import { reject } from '../World';
import { showClip } from './damage';
import { cureWith, deriveEffects, effectDef, effectsOn } from './effects';
import { bodyOf } from './state';
import { openVerb, seatInReach, startCooldown } from './verbs';

/**
 * The curing items (GDD 3.22; docs/round8/body.md 6): the Medkit's `heal` (self or a seat in reach; `body.healHp`
 * and whatever the medkit cures), the Doctor's `salts`, the Remedy's `antidote` (whoever holds it, by day as by
 * night), and `eat` for a food in the kit. An item is never spent on a seat it would not change.
 */

/** Whether the item cures an effect that is on. */
const curesSomething = (effects: readonly string[], item: string): boolean =>
  effects.some((id) => (effectDef(id as never).cures as readonly string[]).includes(item));

/** `act.ability {abilityId: 'heal' | 'salts' | 'antidote', targetId?}`: no `targetId` is the actor itself. */
export function handleCure(
  room: PartyRoom,
  sessionId: string,
  id: 'heal' | 'salts' | 'antidote',
  payload: Record<string, unknown>,
): void {
  const v = openVerb(room, sessionId, id);
  if (!v) return;
  const self = payload.targetId === undefined || payload.targetId === null;
  const targetId = self ? sessionId : seatInReach(room, sessionId, v, payload.targetId);
  if (targetId === null) return;
  const body = bodyOf(room, targetId);
  const item = v.def.consumes ?? v.def.requires;
  if (!body || item === undefined) return;
  const heals = id === 'heal' ? balance.body.healHp : 0;
  if (!curesSomething(effectsOn(body), item) && (heals === 0 || body.hp >= body.maxHp)) {
    reject(room, sessionId, 'NOTHING_TO_CURE');
    return;
  }
  if (v.def.consumes !== undefined && !take(v.player, v.def.consumes, 1)) {
    reject(room, sessionId, 'SPENT', { what: 'stock' });
    return;
  }
  cureWith(room, targetId, body, item);
  if (heals > 0) body.hp = Math.min(body.maxHp, body.hp + heals);
  deriveEffects(room, targetId, body);
  startCooldown(v);
}

/**
 * `act.ability {abilityId: 'eat'}`: eats the row's food from the kit. Any food cures what `food` cures (Famished,
 * Weakened) and resets the Famished clock; a food that cures Fatigued (the Wake Loaf) also fills the stamina, or
 * Fatigued would be back the next tick. The `eat` clip is public.
 */
export function handleEat(room: PartyRoom, sessionId: string): void {
  const v = openVerb(room, sessionId, 'eat');
  if (!v) return;
  const item = v.def.consumes;
  if (item === undefined || !take(v.player, item, 1)) {
    reject(room, sessionId, 'NOTHING_TO_CURE');
    return;
  }
  v.body.lastAteTick = v.tick;
  cureWith(room, sessionId, v.body, item, true);
  if ((effectDef('fatigued').cures as readonly string[]).includes(item)) v.body.stamina = v.body.maxStamina;
  deriveEffects(room, sessionId, v.body);
  showClip(v.body, AnimId.eat, v.tick);
  startCooldown(v);
  emitSim(room, { tick: v.tick, kind: 'eat', seat: sessionId, data: { seat: sessionId } }); // 8E's hunger hears it
}

/** The Bandage's one line in `Actions.ts` (GDD 3.22): a Doctor's Bandage also stops the target's Bleeding. */
export function cureBy(room: PartyRoom, targetId: string, item: string): void {
  const body = bodyOf(room, targetId);
  if (body) cureWith(room, targetId, body, item);
}
