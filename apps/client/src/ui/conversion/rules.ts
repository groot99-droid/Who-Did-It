import balance from '@wdi/content/data/balance.json';
import roles from '@wdi/content/data/roles.json';
import { Phase } from '@wdi/shared';
import { TICK_RATE } from '@wdi/shared/constants';
import { fill } from '../copy';
import { CONVERSION_COPY as C } from '../copy/conversion';

/** The Vicar's public look (`roles.json`): a seat in it may preach, card or cover (GDD 3.23, A606). */
export const VICAR_LOOK: string | null =
  (roles as { roles: Record<string, { look: string | null }> }).roles.vicar?.look ?? null;

/** How long E must stay down at the bell before it preaches instead of ringing (a tap still rings). */
export const PREACH_HOLD_MS = 500;

/** Whether this seat may be offered the sermon now; the server decides every act. */
export function canPreach(o: {
  look: string;
  phase: number;
  dead: boolean;
  nearBell: boolean;
  round: number;
  preachedRound: number;
}): boolean {
  return (
    VICAR_LOOK !== null &&
    o.look === VICAR_LOOK &&
    o.phase === Phase.day &&
    !o.dead &&
    o.nearBell &&
    o.preachedRound !== o.round
  );
}

/** The whole seconds left of a sermon begun on `startTick`. */
export const sermonSecondsLeft = (startTick: number, tick: number): number =>
  Math.max(0, Math.ceil((startTick + balance.conversion.sermonS * TICK_RATE - tick) / TICK_RATE));

/** The preacher's toast for a sermon `heard` by this many seats. */
export function heardLine(heard: number): string {
  if (heard <= 0) return C.heardNone;
  if (heard === 1) return C.heardOne;
  return fill(C.heard, { n: heard });
}
