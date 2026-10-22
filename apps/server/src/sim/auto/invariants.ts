import type { InvariantFailure } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';

/**
 * The invariant registry (round 6, docs/round6/auto-admin.md 5): checks the harness, `pnpm auto` and the admin room
 * run every few ticks. Pre-seeded by 6Z with an empty registry; Session 6B registers the seven round-6 checks and
 * later rounds add theirs. An invariant returns a failure or null and never mutates the room.
 */
export type Invariant = (room: PartyRoom) => InvariantFailure | null;

const registry = new Map<string, Invariant>();

export function registerInvariant(name: string, fn: Invariant): void {
  registry.set(name, fn);
}

export function registeredInvariants(): readonly string[] {
  return [...registry.keys()];
}

export function runInvariants(room: PartyRoom): InvariantFailure[] {
  const failures: InvariantFailure[] = [];
  for (const [name, fn] of registry) {
    const failure = fn(room);
    if (failure) failures.push({ ...failure, name });
  }
  return failures;
}
