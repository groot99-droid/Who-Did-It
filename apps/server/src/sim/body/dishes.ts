import { Phase } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { cureEffect, effectDef, effectsOn } from './effects';
import { bodies } from './state';

/**
 * A dish's buff lasts until the next dawn, not a clock (round 10, x11, A413; GDD 3.14): its `effects.json` row has
 * `durationS` 0 and `dish`, so `tickEffects` never ends it, and the night turning to day takes it off every body. The
 * dawn is the one `SleepRest.ts` and `NightPowers.ts` read, `night` to `day`; a meeting's new day is not one, so a
 * loaf eaten by day lasts through that night. Called once a tick from `runBody`, in every phase, so the change is
 * seen once.
 */
const lastPhase = new WeakMap<PartyRoom, number>();

export function endDishesAtDawn(room: PartyRoom): void {
  const now = room.state.phase;
  const was = lastPhase.get(room) ?? -1;
  lastPhase.set(room, now);
  if (was !== Phase.night || now !== Phase.day) return;
  for (const [id, body] of bodies(room)) {
    for (const effect of effectsOn(body)) if (effectDef(effect).dish) cureEffect(room, id, body, effect);
  }
}
