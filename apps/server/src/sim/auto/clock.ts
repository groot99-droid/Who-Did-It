import type { PartyRoom } from '../../rooms/PartyRoom';
import type { ClockScale } from '@wdi/shared';

/**
 * The sim clock (round 6, docs/round6/auto-admin.md 2): how many `step`s the fixed tick runs. The sim is tick-
 * deterministic, so a time scale is a loop count, never a faster timer. A `party` room is always at 1x and nothing
 * in the `C2S` union changes that; only `sim/auto/Auto.ts` writes `scale` or `paused` (a test asserts it).
 * Pre-seeded by 6Z; Session 6A fills `stepsThisTick`.
 */
export interface SimClock {
  scale: ClockScale;
  paused: boolean;
  /** Single steps requested while paused (`admin.clock {step}`), consumed by the next tick. */
  pendingSteps: number;
  /** Steps the tick budget pushed to a later tick. */
  carry: number;
}

/** The tick stops running extra steps past this many milliseconds; the rest carries over (6A). */
export const MAX_SIM_MS_PER_TICK = 40;

const clocks = new WeakMap<PartyRoom, SimClock>();

export function clockOf(room: PartyRoom): SimClock {
  let clock = clocks.get(room);
  if (!clock) {
    clock = { scale: 1, paused: false, pendingSteps: 0, carry: 0 };
    clocks.set(room, clock);
  }
  return clock;
}

/**
 * How many steps this tick runs: `scale` plus the carry, capped so `lastTickMs * steps` stays under
 * `MAX_SIM_MS_PER_TICK`; paused returns only the pending single steps. At 1x it returns 1 and touches nothing.
 */
export function stepsThisTick(clock: SimClock, _lastTickMs: number): number {
  if (clock.scale === 1 && !clock.paused) return 1;
  return 1; // 6A: the budget guard, the carry and the pause
}
