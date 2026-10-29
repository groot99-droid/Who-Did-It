import { type Effect, type EffectKey, balance, effects } from '@wdi/content';
import { TICK_RATE } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { StatusBit } from '../constants';
import { emitSim } from '../events/bus';
import { type Body, bodyOf, bodyRng } from './state';

/**
 * Effects (GDD 3.22; docs/round8/body.md 6): the rows of `effects.json`, applied, ticked and cured here. An
 * application emits `body.effect { target, effect, on }` once when the effect comes on and once when it goes.
 */
export const effectDef = (id: EffectKey): Effect => effects.effects[id];

export const hasEffect = (body: Body, id: EffectKey): boolean => body.effects.has(id);

/** The effects on a body, in application order. */
export const effectsOn = (body: Body): EffectKey[] => [...body.effects.keys()];

/**
 * Puts an effect on (a fresh application restarts a timed one's clock and adds a stack); `untilTick` 0 means it
 * lasts until cured or until its condition ends. `durationTicks` overrides the row (the knockout's `body.koS`).
 */
export function applyEffect(
  room: PartyRoom,
  target: string,
  body: Body,
  id: EffectKey,
  durationTicks = Math.round(effectDef(id).durationS * TICK_RATE),
): void {
  const tick = room.state.tick;
  const untilTick = durationTicks > 0 ? tick + durationTicks : 0;
  const on = body.effects.get(id);
  if (on) {
    on.untilTick = untilTick;
    on.stacks = Math.min(255, on.stacks + 1);
    return;
  }
  body.effects.set(id, { untilTick, stacks: 1 });
  emitSim(room, { tick, kind: 'body.effect', seat: target, data: { target, effect: id, on: true } });
}

/** Takes an effect off; returns whether it was on. */
export function cureEffect(room: PartyRoom, target: string, body: Body, id: EffectKey): boolean {
  if (!body.effects.delete(id)) return false;
  emitSim(room, {
    tick: room.state.tick,
    kind: 'body.effect',
    seat: target,
    data: { target, effect: id, on: false },
  });
  return true;
}

/**
 * An item cures every effect whose row names it (`cures`); an item of kind `food` cures every effect that `food`
 * cures. Returns the effects cured.
 */
export function cureWith(
  room: PartyRoom,
  target: string,
  body: Body,
  itemId: string,
  food = false,
): EffectKey[] {
  const cured: EffectKey[] = [];
  for (const id of effectsOn(body)) {
    const cures = effectDef(id).cures as readonly string[];
    if (cures.includes(itemId) || (food && cures.includes('food'))) {
      if (cureEffect(room, target, body, id)) cured.push(id);
    }
  }
  return cured;
}

/** Product of the `speedFactor`s on; 0 while an effect forbids moving. */
export function speedFactorOf(body: Body): number {
  let factor = 1;
  for (const id of body.effects.keys()) {
    const def = effectDef(id);
    if (def.noMove) return 0;
    factor *= def.speedFactor ?? 1;
  }
  return factor;
}

const anyOn = (body: Body, flag: (def: Effect) => boolean | undefined): boolean => {
  for (const id of body.effects.keys()) if (flag(effectDef(id))) return true;
  return false;
};
export const blocksAct = (body: Body): boolean => anyOn(body, (d) => d.noAct);
export const blocksRun = (body: Body): boolean => anyOn(body, (d) => d.noRun);
export const blocksRegen = (body: Body): boolean => anyOn(body, (d) => d.blocksRegen);

/** Product of a factor over the effects on (strike damage, strike cooldown, stamina regeneration). */
export function factorOf(body: Body, pick: (def: Effect) => number | undefined): number {
  let factor = 1;
  for (const id of body.effects.keys()) factor *= pick(effectDef(id)) ?? 1;
  return factor;
}

/** The `StatusBit`s the effects on show on the drawn figure (seams.md 2): only what the eye can see. */
export function statusBitsOf(body: Body): number {
  let bits = 0;
  for (const id of body.effects.keys()) {
    const sign = effectDef(id).sign;
    if (sign) bits |= StatusBit[sign];
  }
  return bits;
}

/**
 * The effects that follow a condition rather than a clock (`durationS` 0 with a threshold in `balance.json` `body`):
 * Wounded under `woundedBelow`, Fatigued from empty stamina until `fatigueRecover`, Famished after `famishedAfterS`
 * without food. A figure (no stamina) is never Fatigued.
 */
export function deriveEffects(room: PartyRoom, target: string, body: Body): void {
  const b = balance.body;
  const tick = room.state.tick;
  if (body.hp > 0 && body.hp < b.woundedBelow) applyEffect(room, target, body, 'wounded', 0);
  else if (body.hp >= b.woundedBelow) cureEffect(room, target, body, 'wounded');
  if (!body.figure) {
    if (body.stamina <= 0) applyEffect(room, target, body, 'fatigued', 0);
    else if (body.stamina >= b.fatigueRecover) cureEffect(room, target, body, 'fatigued');
    if (tick - body.lastAteTick >= Math.round(b.famishedAfterS * TICK_RATE))
      applyEffect(room, target, body, 'famished', 0);
  }
}

/**
 * One tick of the effects on: the timed ones wear off, the draining ones take their health per second and the
 * ones that spread roll their chance per second (`applies`). A drain stops at 1 health (round 10, A6, GDD 3.22):
 * Bleeding and Poisoned leave a seat Wounded and never kill; only the Knife and a creature's bite take it to zero.
 */
export function tickEffects(room: PartyRoom, target: string, body: Body): void {
  const tick = room.state.tick;
  const dt = 1 / TICK_RATE;
  for (const [id, on] of [...body.effects]) {
    if (on.untilTick > 0 && tick >= on.untilTick) {
      cureEffect(room, target, body, id);
      continue;
    }
    const def = effectDef(id);
    if (def.hpPerS !== undefined && body.hp > 0) {
      body.hp = Math.max(Math.min(1, body.hp), body.hp - def.hpPerS * dt);
    }
    if (def.applies) {
      for (const [spread, chance] of Object.entries(def.applies) as [EffectKey, number][]) {
        if (bodyRng(room)() < chance * dt) applyEffect(room, target, body, spread);
      }
    }
  }
}

/**
 * Whether a seat lies knocked out (the night powers' Keep Watch and Remedy refuse it, body.md 5; GDD 3.22). It lives
 * here, not in `run.ts`, so `NightPowers.ts` (reached by `auto/invariants.ts`) never loads the body's own invariant.
 */
export function knockedOut(room: PartyRoom, sessionId: string): boolean {
  const body = bodyOf(room, sessionId);
  return body !== undefined && hasEffect(body, 'knockedOut');
}
