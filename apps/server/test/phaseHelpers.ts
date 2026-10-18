import { Phase } from '@wdi/shared';
import type { Match } from './simHelpers';
import { setPhase } from './killHelpers';

/** White-box, round 5 (5G): the Knife works only after dark (GDD 3.3), so the strike tests stand in the night. */
export const toNight = (m: Match): void => setPhase(m, Phase.night);
