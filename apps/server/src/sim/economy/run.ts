import type { PartyRoom } from '../../rooms/PartyRoom';
import { registerInvariant } from '../auto/invariants';
import { runStakes, scripConserved } from './purse';
import { runWages } from './wages';

// Registered here, not in `purse.ts`, which the lobby imports before the invariant registry exists.
registerInvariant('scripConserved', scripConserved);

/**
 * The economy's Step stage (round 8, GDD 3.23; the locked `runEconomy` call site in `sim/Step.ts`, after
 * `runMemorial`), Session 8C: Scrip's stages in order. 8D adds one line per loop of its own (rent, quota, faith,
 * rumours, HQ tiers) at the end, and nothing else.
 */
export function runEconomy(room: PartyRoom): void {
  runStakes(room);
  runWages(room);
}
