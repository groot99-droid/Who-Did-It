import type { Rng } from './prng';

// Quick mode rules (GDD 3.11, ARCHITECTURE 5.14). Round 4: Session R fills this module and its
// property tests; the signatures below are the contract the server and the bots code against.

/** One night window as the Conductor runs it: `role` wakes, the window lasts `ticks` after the fade. */
export interface NightWindow {
  order: number;
  role: string;
  /** Window length in seconds including its seeded jitter, before the fade. */
  seconds: number;
}

/** A night act as `applyNightAct` sees it: the actor's dealt role, the act id and the slots it names. */
export interface NightAct {
  roleId: string;
  act: string;
  /** Prop ids: the actor's own plate first where the act swaps with it. */
  slots: string[];
}

export interface DawnOutcome {
  tally: Record<string, number>;
  /** Everyone holding the most votes when that is at least `minVotesToTurnOut`, ties included. */
  outs: string[];
}

/** Deals `deck` (ids.length + 3 loaves) to `ids`; the three left over are the dead's loaves. */
export function dealOnub(
  _ids: readonly string[],
  _deck: readonly string[],
  _rng: Rng,
): { dealt: Map<string, string>; center: string[] } {
  throw new Error('M3b: dealOnub is Session R work');
}

/** Every window whose role is in the deck (dealt or among the dead's loaves), in order, with jitter. */
export function nightScript(
  _deck: readonly string[],
  _windows: readonly { order: number; role: string; seconds: number }[],
  _rng: Rng,
  _jitterMaxS: number,
): NightWindow[] {
  throw new Error('M3b: nightScript is Session R work');
}

/** Applies one act to the loaves (slot -> role id) and returns the new map and what the actor saw. */
export function applyNightAct(
  _loaves: ReadonlyMap<string, string>,
  _act: NightAct,
): { next: Map<string, string>; reveal: { slot: string; roleId: string }[] } {
  throw new Error('M3b: applyNightAct is Session R work');
}

/** The dawn vote (GDD 3.11): no Skip, no self-vote, an abstention is absent from `votes`. */
export function resolveDawn(
  _votes: Readonly<Record<string, string>>,
  _seats: readonly string[],
  _rule: { minVotesToTurnOut: number; tiesTurnOutAll: boolean },
): DawnOutcome {
  throw new Error('M3b: resolveDawn is Session R work');
}

/** The winners table of `balance.onub.json`, judged on final loaves (GDD 3.11). */
export function onubWinners(
  _outs: readonly string[],
  _finals: ReadonlyMap<string, string>,
  _center: readonly string[],
  _roleFaction: (roleId: string) => 'village' | 'cabal' | 'neutral',
): { rowId: string; winnerIds: string[] } {
  throw new Error('M3b: onubWinners is Session R work');
}
