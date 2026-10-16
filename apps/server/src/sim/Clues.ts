import type { PartyRoom } from '../rooms/PartyRoom';

/**
 * Clue decay and the per-scene cap (GDD 3.4), run every tick after the portals. Session L fills this
 * in; the stage is wired in `Step.ts` so no session edits the step order.
 */
export function runDecay(_room: PartyRoom): void {}
