import { type Rng, shuffle } from './prng';

// Quick mode rules (GDD 3.11, ARCHITECTURE 5.14): pure functions over plain data. The deck, the windows,
// the vote rule and the winners table are `balance.onub.json`; the caller passes them in.

/** One night window as the Conductor runs it: `role` wakes for `seconds`, jitter included, before the fade. */
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
  /** Living seats whose vote was not counted (none cast, or one for a non-seat or for themselves). */
  abstained: string[];
}

/** One row of `balance.onub.json` `winners`: every `when` flag that is present must match. */
export interface WinnerRowLike {
  id: string;
  when: {
    debtorOut?: boolean | undefined;
    poisonerOut?: boolean | undefined;
    poisonerAmongMourners?: boolean | undefined;
    anyoneOut?: boolean | undefined;
  };
  winners: readonly string[];
}

/** Role ids the rules name (the roles the winners table is written against). */
const POISONER = 'poisoner';
const DEBTOR = 'debtor';
const HIRELING = 'hireling';

/** Deals `deck` (ids.length + 3 loaves) to `ids`; the three left over are the dead's loaves. */
export function dealOnub(
  ids: readonly string[],
  deck: readonly string[],
  rng: Rng,
): { dealt: Map<string, string>; center: string[] } {
  if (deck.length !== ids.length + 3) {
    throw new Error(`deck of ${deck.length} loaves for ${ids.length} seats: expected ${ids.length + 3}`);
  }
  const shuffled = shuffle(deck, rng);
  const dealt = new Map<string, string>();
  ids.forEach((id, i) => dealt.set(id, shuffled[i] as string));
  return { dealt, center: shuffled.slice(ids.length) };
}

/**
 * Every window whose role is in the deck (dealt or among the dead's loaves), in `order`, each with a seeded
 * jitter in [0, jitterMaxS]. It reads the deck and the rng only, never who holds what, so the night's shape
 * leaks nothing about the deal.
 */
export function nightScript(
  deck: readonly string[],
  windows: readonly { order: number; role: string; seconds: number }[],
  rng: Rng,
  jitterMaxS: number,
): NightWindow[] {
  const present = new Set(deck);
  return windows
    .filter((w) => present.has(w.role))
    .sort((a, b) => a.order - b.order)
    .map((w) => ({
      order: w.order,
      role: w.role,
      seconds: Math.round((w.seconds + rng() * jitterMaxS) * 10) / 10,
    }));
}

function swapped(loaves: ReadonlyMap<string, string>, a: string, b: string): Map<string, string> {
  const x = loaves.get(a);
  const y = loaves.get(b);
  if (x === undefined || y === undefined || a === b) {
    throw new Error(`cannot swap ${a} and ${b}`);
  }
  const next = new Map(loaves);
  next.set(a, y);
  next.set(b, x);
  return next;
}

function tokenOf(loaves: ReadonlyMap<string, string>, slot: string): { slot: string; roleId: string } {
  const roleId = loaves.get(slot);
  if (roleId === undefined) throw new Error(`no loaf at ${slot}`);
  return { slot, roleId };
}

/**
 * Applies one act to the loaves (slot -> role id) and returns the new map and what the actor saw. Whatever
 * the act, `next` holds the same multiset of loaves as `loaves`: an act swaps two slots or changes nothing.
 * `onub.readLedger` names seats, not loaves, so it changes nothing and shows nothing here.
 */
export function applyNightAct(
  loaves: ReadonlyMap<string, string>,
  act: NightAct,
): { next: Map<string, string>; reveal: { slot: string; roleId: string }[] } {
  const [first, second] = act.slots;
  switch (act.act) {
    case 'onub.peekPlate':
    case 'onub.peekDead':
    case 'onub.check':
      return { next: new Map(loaves), reveal: act.slots.map((s) => tokenOf(loaves, s)) };
    case 'onub.readLedger':
      return { next: new Map(loaves), reveal: [] };
    case 'onub.take': {
      // [own plate, the plate taken from]: the actor reads the token that moved to their own plate.
      if (first === undefined || second === undefined) throw new Error('onub.take needs two slots');
      return { next: swapped(loaves, first, second), reveal: [tokenOf(loaves, second)] };
    }
    case 'onub.swapPlates':
    case 'onub.swapDead': {
      if (first === undefined || second === undefined) throw new Error(`${act.act} needs two slots`);
      return { next: swapped(loaves, first, second), reveal: [] };
    }
    default:
      throw new Error(`unknown night act ${act.act}`);
  }
}

/**
 * The dawn vote (GDD 3.11): no Skip, no self-vote, an abstention is absent from `votes`. A vote from a
 * non-seat, for a non-seat or for the voter themselves is discarded and counts as an abstention.
 */
export function resolveDawn(
  votes: Readonly<Record<string, string>>,
  seats: readonly string[],
  rule: { minVotesToTurnOut: number; tiesTurnOutAll: boolean },
): DawnOutcome {
  const living = new Set(seats);
  const tally: Record<string, number> = {};
  const abstained: string[] = [];
  for (const seat of seats) {
    const target = votes[seat];
    if (target === undefined || target === seat || !living.has(target)) abstained.push(seat);
    else tally[target] = (tally[target] ?? 0) + 1;
  }
  const best = Math.max(0, ...Object.values(tally));
  if (best < rule.minVotesToTurnOut) return { tally, outs: [], abstained };
  const top = seats.filter((s) => tally[s] === best);
  return { tally, outs: rule.tiesTurnOutAll || top.length === 1 ? top : [], abstained };
}

/**
 * The winners table of `balance.onub.json`, judged on final loaves (GDD 3.11). `finals` maps every seat to
 * the loaf on its plate at dawn. The first row whose `when` holds wins; the tokens resolve to seats:
 * `village` every seat whose final loaf is neither Cabal nor the Debtor, `cabal` every Cabal loaf (a
 * turned-out Hireling included), `debtor` the Debtor loaf, `hirelingIfMourner` the seat holding the
 * Hireling loaf (nobody when it lies with the dead), `nobody` no seat.
 */
export function onubWinners(
  outs: readonly string[],
  finals: ReadonlyMap<string, string>,
  _center: readonly string[],
  roleFaction: (roleId: string) => 'village' | 'cabal' | 'neutral',
  rows: readonly WinnerRowLike[],
): { rowId: string; winnerIds: string[] } {
  const finalOf = (id: string): string | undefined => finals.get(id);
  const flags = {
    debtorOut: outs.some((id) => finalOf(id) === DEBTOR),
    poisonerOut: outs.some((id) => finalOf(id) === POISONER),
    poisonerAmongMourners: [...finals.values()].some((r) => r === POISONER),
    anyoneOut: outs.length > 0,
  };
  const row = rows.find((r) =>
    (Object.keys(flags) as (keyof typeof flags)[]).every((k) => r.when[k] === undefined || r.when[k] === flags[k]),
  );
  if (!row) throw new Error('the winners table has no row for this dawn');
  const seats = [...finals.keys()];
  const winning = new Set<string>();
  for (const token of row.winners) {
    for (const id of seats) {
      const roleId = finals.get(id) as string;
      const faction = roleFaction(roleId);
      if (
        (token === 'village' && faction !== 'cabal' && roleId !== DEBTOR) ||
        (token === 'cabal' && faction === 'cabal') ||
        (token === 'debtor' && roleId === DEBTOR) ||
        (token === 'hirelingIfMourner' && roleId === HIRELING)
      ) {
        winning.add(id);
      }
    }
  }
  return { rowId: row.id, winnerIds: seats.filter((id) => winning.has(id)) };
}
