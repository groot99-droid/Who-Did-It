// The invariants the runner and the weekly soak check (round 6, Session 6B; docs/round6/auto-admin.md 5). They
// register on the server (`apps/server/src/sim/auto/invariants.ts`), where the admin room runs them too; importing
// this module makes the registration explicit and refuses a run in which a round-6 check is missing, so a run can
// never come back clean because nothing was checked. Round 7 adds the vendetta checks (Session 7H, GDD 3.20); round 8
// the body check (Session 8A, GDD 3.22).
import { registeredInvariants } from '../../../apps/server/src/sim/auto/invariants';
import '../../../apps/server/src/sim/vendettas/invariants';
import '../../../apps/server/src/sim/body/invariants';

/** The seven checks of `auto-admin.md` 5, in its order (DECISIONS A84 has the names). */
export const ROUND6_CHECKS = [
  'privLeak',
  'seatLeak',
  'npcStuck',
  'phaseOverrun',
  'step',
  'matchLength',
  'killClues',
] as const;

/** The four vendetta checks of `docs/round7/vendettas.md` 2, in their registration order (GDD 3.20). */
export const ROUND7_CHECKS = ['vendettaOnce', 'contractQuest', 'strongboxOnce', 'vendettaPublic'] as const;

/** The body check of `docs/round8/body.md` 8 (GDD 3.22). */
export const ROUND8_CHECKS = ['bodyBounds'] as const;

/** The round-6, round-7 and round-8 checks missing from `names`. */
export function missingChecks(names: readonly string[]): string[] {
  return [...ROUND6_CHECKS, ...ROUND7_CHECKS, ...ROUND8_CHECKS].filter((name) => !names.includes(name));
}

const missing = missingChecks(registeredInvariants());
if (missing.length > 0)
  throw new Error(`tools/auto/checks: invariants not registered: ${missing.join(', ')}`);
