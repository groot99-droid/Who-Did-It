import type { PartyRoom } from '../rooms/PartyRoom';

/**
 * Mobs (round 6, M5b, GDD 3.15; docs/round6/m5b-data.md 2.2): creatures spawned from the scenes' spawners, driven by
 * the FSM of `sim/mobs/ai.ts` on the `mobs` keyed streams, written to `SceneState.mobs` (no seat, no handle); a wolf
 * that reaches a living seat in the dark calls `markDead(room, seat, 'wolf')`. Pre-seeded by 6Z; Session 6G fills it.
 */

/** Step stage after `runResources` (locked call site in `sim/Step.ts`). No-op until 6G. */
export function runMobs(_room: PartyRoom): void {
  // 6G: spawn, think, move, attack
}
