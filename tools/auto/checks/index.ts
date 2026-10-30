// The invariants the runner and the weekly soak check (round 6, Session 6B; docs/round6/auto-admin.md 5). They
// register on the server (`apps/server/src/sim/auto/invariants.ts`), where the admin room runs them too; importing
// this module makes the registration explicit and refuses a run in which a round-6 check is missing, so a run can
// never come back clean because nothing was checked. Round 7 adds the vendetta checks (Session 7H, GDD 3.20); round 8
// the body check (Session 8A, GDD 3.22); round 10 the decoded-view check of `pnpm auto -- --views` (10X, x14, A453).
import { registeredInvariants } from '../../../apps/server/src/sim/auto/invariants';
import '../../../apps/server/src/sim/vendettas/invariants';
import '../../../apps/server/src/sim/body/invariants';
import '../../../apps/server/src/sim/tasks/invariants';
import '../../../apps/server/src/sim/auto/shadowViews';

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

/**
 * The four vendetta checks of `docs/round7/vendettas.md` 2, in their registration order (GDD 3.20), then 7M's task
 * check (GDD 3.5, A133) from `sim/tasks/invariants.ts`.
 */
export const ROUND7_CHECKS = [
  'vendettaOnce',
  'contractQuest',
  'strongboxOnce',
  'vendettaPublic',
  'taskBar',
] as const;

/**
 * The round-8 checks in their registration order: 8E's `figureNotSeat` (docs/round8/townsfolk.md 4, GDD 3.24), which
 * the body stage imports first, then the body check of `docs/round8/body.md` 8 (GDD 3.22).
 */
export const ROUND8_CHECKS = ['figureNotSeat', 'bodyBounds'] as const;

/**
 * The round-10 check (10X, x14, A453, GDD 3.19): each seat's decoded view against the server. It registers when the
 * harness attaches the shadows of a `--views` match, not on import (the default registry is the list above), so the
 * runner asserts it after the first match of a `--views` run and never claims the check it did not make.
 */
export const ROUND10_CHECKS = ['decodedViews'] as const;

/** The round-6, round-7 and round-8 checks missing from `names`, and with `views` the round-10 check too. */
export function missingChecks(names: readonly string[], views = false): string[] {
  return [...ROUND6_CHECKS, ...ROUND7_CHECKS, ...ROUND8_CHECKS, ...(views ? ROUND10_CHECKS : [])].filter(
    (name) => !names.includes(name),
  );
}

/** Refuses a run in which a check is missing from the server's registry. */
export function assertChecks(views = false): void {
  const missing = missingChecks(registeredInvariants(), views);
  if (missing.length > 0)
    throw new Error(`tools/auto/checks: invariants not registered: ${missing.join(', ')}`);
}

assertChecks();
