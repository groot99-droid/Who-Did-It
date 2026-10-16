import type { PartyRoom } from '../rooms/PartyRoom';

/**
 * The quick-mode night Conductor (GDD 3.11, ARCHITECTURE 5.14, A39): dusk plate-setting, the window
 * list, wakes and sleeps, timeouts, the dawn hand-off to the meeting. Runs every tick after the portals
 * and before the views reconcile (`sim/Step.ts`); a no-op in the main mode. Round 4: Session R.
 */
export function runConductor(_room: PartyRoom): void {}
