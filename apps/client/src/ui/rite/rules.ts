import balance from '@wdi/content/data/balance.json';
import { TICK_RATE, TILE_PX } from '@wdi/shared/constants';

/** Where the shade's rite stands (story R7, GDD 3.20), from the private `rite` messages alone. */
export type RiteStage = 'none' | 'open' | 'begun' | 'done' | 'returned';

export interface RiteState {
  stage: RiteStage;
  /** The Medium's avatar handle (the hold's `targetId`), '' until `open`. */
  medium: string;
  /** The tick the rite is done on, while `begun`. */
  endsTick: number;
}

export const NO_RITE: RiteState = { stage: 'none', medium: '', endsTick: 0 };

/** The next state on a `rite` message; a stage never goes back. */
export function nextRite(
  was: RiteState,
  m: { stage?: string; medium?: string; endsTick?: number },
): RiteState {
  if (m.stage === 'open') return { stage: 'open', medium: m.medium ?? was.medium, endsTick: 0 };
  if (m.stage === 'begun') return { ...was, stage: 'begun', endsTick: m.endsTick ?? 0 };
  if (m.stage === 'done' || m.stage === 'returned') return { ...was, stage: m.stage };
  return was;
}

/** Whether the shade stands within `rite.reachTiles` of the Medium (the server decides; this only shows the prompt). */
export function inReach(me: { x: number; y: number }, medium: { x: number; y: number }): boolean {
  return Math.hypot(me.x - medium.x, me.y - medium.y) <= balance.rite.reachTiles * TILE_PX;
}

/** The whole seconds left of a running rite. */
export const secondsLeft = (endsTick: number, tick: number): number =>
  Math.max(0, Math.ceil((endsTick - tick) / TICK_RATE));
