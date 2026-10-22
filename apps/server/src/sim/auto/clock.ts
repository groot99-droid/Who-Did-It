import type { PartyRoom } from '../../rooms/PartyRoom';
import type { ClockScale } from '@wdi/shared';

/**
 * The sim clock (round 6, docs/round6/auto-admin.md 2): how many `step`s the fixed tick runs. The sim is tick-
 * deterministic, so a time scale is a loop count, never a faster timer. A `party` room is always at 1x and nothing
 * in the `C2S` union changes that; only `sim/auto/Auto.ts` writes `scale` or `paused` (a test asserts it).
 */
export interface SimClock {
  scale: ClockScale;
  paused: boolean;
  /** Single steps requested while paused (`admin.clock {step}`), consumed by the next tick. */
  pendingSteps: number;
  /** Steps the tick budget pushed to a later tick. */
  carry: number;
}

/** The tick stops running extra steps past this many milliseconds; the rest carries over. */
export const MAX_SIM_MS_PER_TICK = 40;

/** Ticks `effectiveScale` averages over. */
export const EFFECTIVE_SCALE_TICKS = 20;

const clocks = new WeakMap<PartyRoom, SimClock>();
/** Steps actually run by the last `EFFECTIVE_SCALE_TICKS` ticks of each clock, newest last. */
const history = new WeakMap<SimClock, number[]>();

export function clockOf(room: PartyRoom): SimClock {
  let clock = clocks.get(room);
  if (!clock) {
    clock = { scale: 1, paused: false, pendingSteps: 0, carry: 0 };
    clocks.set(room, clock);
  }
  return clock;
}

function record(clock: SimClock, steps: number): number {
  let ring = history.get(clock);
  if (!ring) {
    ring = [];
    history.set(clock, ring);
  }
  ring.push(steps);
  if (ring.length > EFFECTIVE_SCALE_TICKS) ring.shift();
  return steps;
}

/**
 * How many steps this tick runs: `scale` plus the carry, capped so `lastTickMs * steps` stays under
 * `MAX_SIM_MS_PER_TICK` (at least one step, so a slow sim crawls rather than stalls); the remainder goes back to
 * the carry, so nothing is skipped. Paused returns only the pending single steps, and clears them; with none
 * pending but `queuedCommands` waiting it returns 1, so a queued Start, Reset or Resume drains (the step is what
 * consumes the queue). At 1x it returns 1 and never touches the carry.
 */
export function stepsThisTick(clock: SimClock, lastTickMs: number, queuedCommands = 0): number {
  if (clock.paused) {
    const n = clock.pendingSteps > 0 ? clock.pendingSteps : queuedCommands > 0 ? 1 : 0;
    clock.pendingSteps = 0;
    return record(clock, n);
  }
  if (clock.scale === 1) return record(clock, 1);
  const want = clock.scale + clock.carry;
  const cap = lastTickMs > 0 ? Math.max(1, Math.floor(MAX_SIM_MS_PER_TICK / lastTickMs)) : want;
  const n = Math.min(want, cap);
  clock.carry = want - n;
  return record(clock, n);
}

/** Steps actually run per tick over the last `EFFECTIVE_SCALE_TICKS` ticks (for `admin.snapshot`). */
export function effectiveScale(clock: SimClock): number {
  const ring = history.get(clock);
  if (!ring || ring.length === 0) return clock.paused ? 0 : clock.scale;
  return ring.reduce((a, b) => a + b, 0) / EFFECTIVE_SCALE_TICKS;
}
