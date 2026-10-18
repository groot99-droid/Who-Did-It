import { PANTRY_VOTE } from '../constants';
import type { NightRevealEntry, OnubLegalAct, OnubWakeView } from '../protocol/index';
import { type OnubCards, type SlotKind, pantrySlot, parseSlot, seatSlot } from './onub';
import type { Rng } from './prng';

// Quick mode rules, ONUB v2 (GDD 3.11): the night acts on the card table, the wake view, the vote and the winners.
// Pure functions over plain data. Slots and the table are `onub.ts`.

/** Where one pick of an act may come from (`balance.onub.json` `acts[id].targets`). */
export type OnubTargetKindLike =
  'anySeatCard' | 'anySeatRole' | 'otherSeatRole' | 'otherSeatLoc' | 'pantryRole' | 'pantryLoc';

/** What the rules read of a `balance.onub.json` act. */
export interface OnubActLike {
  id: string;
  targets: readonly OnubTargetKindLike[];
  picks: number;
  effect: 'cloche' | 'peek' | 'swapWithOwn' | 'swapWithPeeked' | 'swapPair';
  reveal: 'picked' | 'ownAfter' | 'ownCards' | 'none';
  then?: string | undefined;
}

/** What the rules read of a `balance.onub.json` window. */
export interface OnubWindowLike {
  order: number;
  role: string;
  seeEachOther: boolean;
  sees: readonly string[];
  acts: readonly string[];
  onlyIfAlone: boolean;
  onTimeout: 'nothing' | 'seededPick';
}

/** The table's shape: seats in the deal order, then the Pantry (`balance.onub.json` `pantry`). */
export interface TableSize {
  seats: number;
  pantryRoles: number;
  pantryLocs: number;
}

/** A reveal row before the server names the seat behind it (`of`). */
export type OnubReveal = Omit<NightRevealEntry, 'of'>;

/**
 * The slots one pick of `act` may name for the seat at deal index `actor` (GDD 3.11): every slot of the act's
 * target kinds (`other*` never the actor's own, `any*` the actor's own included, `pantry*` every Pantry
 * position), minus `cloche`. Empty when the act cannot be made at all: a `swapWithOwn` act whose own card of the
 * target's kind lies under the cloche. Empty for an act without picks. Slot order: seats in deal order, then the
 * Pantry; for `anySeatCard` each seat's Role slot before its Location slot.
 */
export function targetPool(act: OnubActLike, actor: number, size: TableSize, cloche: string): string[] {
  if (act.picks === 0) return [];
  const kinds = new Set(act.targets);
  const any = kinds.has('anySeatCard');
  const roleOwn = any || kinds.has('anySeatRole');
  const roleOther = kinds.has('otherSeatRole');
  const locOwn = any;
  const locOther = kinds.has('otherSeatLoc');
  if (act.effect === 'swapWithOwn') {
    // The actor's own card of the target's kind must be free to move.
    const ownKind: SlotKind = roleOwn || roleOther || kinds.has('pantryRole') ? 'role' : 'loc';
    if (seatSlot(actor, ownKind) === cloche) return [];
  }
  const pool: string[] = [];
  const add = (slot: string): void => {
    if (slot !== cloche) pool.push(slot);
  };
  for (let i = 0; i < size.seats; i++) {
    if (roleOwn || (roleOther && i !== actor)) add(seatSlot(i, 'role'));
    if (locOwn || (locOther && i !== actor)) add(seatSlot(i, 'loc'));
  }
  if (kinds.has('pantryRole')) for (let k = 0; k < size.pantryRoles; k++) add(pantrySlot('role', k));
  if (kinds.has('pantryLoc')) for (let k = 0; k < size.pantryLocs; k++) add(pantrySlot('loc', k));
  return pool;
}

/**
 * Why a pick list is refused (422), or null: `count` when it does not name exactly `act.picks` slots,
 * `duplicate` when a slot repeats, `slot` when a slot is outside `targetPool` (the cloche included), `step`
 * when a `swapWithPeeked` act has no `peeked` slot or another act arrives while one is pending.
 */
export function actTargetsProblem(
  act: OnubActLike,
  actor: number,
  size: TableSize,
  cloche: string,
  targets: readonly string[],
  peeked: string,
): 'count' | 'duplicate' | 'slot' | 'step' | null {
  if (act.effect === 'swapWithPeeked' ? peeked === '' : peeked !== '') return 'step';
  if (targets.length !== act.picks) return 'count';
  if (new Set(targets).size !== targets.length) return 'duplicate';
  const pool = new Set(targetPool(act, actor, size, cloche));
  return targets.every((slot) => pool.has(slot)) ? null : 'slot';
}

export interface CardActResult {
  /** The table after the act: the same multiset of roles and of stations as before, whatever the act. */
  next: OnubCards;
  /** What the actor is shown, per `act.reveal`: the picks before the act, the own card after it, or both own cards. */
  reveal: OnubReveal[];
  /** The slot the act covered (`effect: cloche`), else empty. */
  cloche: string;
  /** The slots for the act log: the actor's own slot first for `swapWithOwn`, the peeked slot first for `swapWithPeeked`, both own slots for `onub.inspect`. */
  logSlots: string[];
}

/**
 * Applies one validated act (`actTargetsProblem` returned null) to the table, for the seat at deal index `actor`.
 * `peeked` is the Pantry slot the actor peeked in the first step, for `swapWithPeeked`. A `peek` or `cloche`
 * changes nothing; a swap exchanges two slots of the same kind. Never refuses: throws on a pick it cannot apply.
 */
export function applyCardAct(
  cards: OnubCards,
  act: OnubActLike,
  actor: number,
  targets: readonly string[],
  peeked: string,
): CardActResult {
  const roles = new Map(cards.roles);
  const locs = new Map(cards.locs);
  const table = (slot: string): Map<string, string> => {
    const kind = parseSlot(slot)?.kind;
    if (kind === 'role') return roles;
    if (kind === 'loc') return locs;
    throw new Error(`not a card slot: ${slot}`);
  };
  const read = (slot: string): string => {
    const v = table(slot).get(slot);
    if (v === undefined) throw new Error(`no card at ${slot}`);
    return v;
  };
  const row = (slot: string): OnubReveal => ({
    slot,
    kind: parseSlot(slot)?.kind === 'role' ? 'role' : 'loc',
    value: read(slot),
  });
  const swap = (a: string, b: string): void => {
    const t = table(a);
    if (t !== table(b)) throw new Error(`cannot swap ${a} with ${b}: different kinds`);
    const va = read(a);
    t.set(a, read(b));
    t.set(b, va);
  };
  const picked = targets.map(row);
  let cloche = '';
  let logSlots = [...targets];
  switch (act.effect) {
    case 'cloche':
      cloche = targets[0] ?? '';
      break;
    case 'peek':
      if (act.reveal === 'ownCards') logSlots = [seatSlot(actor, 'role'), seatSlot(actor, 'loc')];
      break;
    case 'swapWithOwn': {
      const target = targets[0] ?? '';
      const own = seatSlot(actor, parseSlot(target)?.kind === 'role' ? 'role' : 'loc');
      swap(own, target);
      logSlots = [own, target];
      break;
    }
    case 'swapWithPeeked': {
      const target = targets[0] ?? '';
      swap(peeked, target);
      logSlots = [peeked, target];
      break;
    }
    case 'swapPair':
      swap(targets[0] ?? '', targets[1] ?? '');
      break;
  }
  const next: OnubCards = { roles, locs };
  let reveal: OnubReveal[] = [];
  if (act.reveal === 'picked') reveal = picked;
  else if (act.reveal === 'ownCards') reveal = [seatSlot(actor, 'role'), seatSlot(actor, 'loc')].map(row);
  else if (act.reveal === 'ownAfter') reveal = [row(logSlots[0] ?? '')];
  return { next, reveal, cloche, logSlots };
}

/**
 * The view a waker's table shows (`nightWake.view`, GDD 3.11), from the DEALT roles (`dealt[i]` is seat `i`'s,
 * `seats[i]` its id): `mates` the other seats dealt `window.role` when `seeEachOther`; `seen` the seats dealt a
 * role of `window.sees`; `alone` when `seeEachOther` and nobody else was dealt the role; `legal` empty once
 * `state.acted`, the `then` act alone while `state.peeked` is set, else the window's acts (none when
 * `onlyIfAlone` and not `alone`) whose `targetPool` holds at least `picks` slots; `must` when
 * `window.onTimeout` is `seededPick`.
 */
export function wakeView(
  window: OnubWindowLike,
  actor: number,
  dealt: readonly string[],
  seats: readonly string[],
  acts: Readonly<Record<string, OnubActLike | undefined>>,
  size: TableSize,
  cloche: string,
  state: { acted: boolean; peeked: string },
): OnubWakeView {
  const sameRole = (i: number): boolean => dealt[i] === window.role;
  const mates = window.seeEachOther ? seats.filter((_, i) => i !== actor && sameRole(i)) : [];
  const seen = seats.flatMap((seat, i) => {
    const roleId = dealt[i];
    return roleId !== undefined && window.sees.includes(roleId) ? [{ seat, roleId }] : [];
  });
  const alone = window.seeEachOther && mates.length === 0;
  let open: OnubActLike[] = [];
  if (!state.acted) {
    if (state.peeked !== '') {
      const followUp = window.acts.map((id) => acts[id]?.then).find((id) => id !== undefined);
      const next = followUp === undefined ? undefined : acts[followUp];
      open = next ? [next] : [];
    } else if (!window.onlyIfAlone || alone) {
      open = window.acts.flatMap((id) => (acts[id] ? [acts[id]] : []));
    }
  }
  const legal: OnubLegalAct[] = [];
  for (const act of open) {
    const slots = targetPool(act, actor, size, cloche);
    if (slots.length >= act.picks) legal.push({ act: act.id, picks: act.picks, slots });
  }
  return { mates, seen, alone, cloche, legal, must: window.onTimeout === 'seededPick' };
}

/**
 * The picks the server makes for a must-act left undone (the `nightTimeout` stream): `act.picks` distinct slots
 * uniform over `targetPool`, or null when the pool is too small (the act is then skipped).
 */
export function seededTargets(
  act: OnubActLike,
  actor: number,
  size: TableSize,
  cloche: string,
  rng: Rng,
): string[] | null {
  const pool = targetPool(act, actor, size, cloche);
  if (pool.length < act.picks) return null;
  const picks: string[] = [];
  for (let n = 0; n < act.picks; n++) {
    const j = Math.floor(rng() * pool.length);
    picks.push(pool.splice(j, 1)[0] as string);
  }
  return picks;
}

// --- The vote and the winners -----------------------------------------------------------------------------

/** What the vote and the winners read of a `roles.onub.json` role. */
export interface OnubRoleInfo {
  team: 'baker' | 'mold' | 'croissant';
  spore: boolean;
  onOut: 'none' | 'dragVote';
}

/** `balance.onub.json` `vote`, as `resolveDawn` reads it. */
export interface OnubVoteRule {
  minVotesToTurnOut: number;
  tiesTurnOutAll: boolean;
  pantryTarget: boolean;
  critiqueHops: number;
}

export interface DawnOutcome {
  /** Votes per seat id, and per `"pantry"`. */
  tally: Record<string, number>;
  /** Seats in the oven, in `seats` order, the Critique's drag included. */
  outs: string[];
  /** The seat a `dragVote` card pulled in, or empty. */
  hop: string;
  /** The Pantry was among the top with at least `minVotesToTurnOut` votes. */
  pantryOut: boolean;
  /** Seats in play whose vote was not counted (none cast, or one for a non-target or for themselves). */
  abstained: string[];
}

/**
 * The CRUST vote (GDD 3.11). `seats` are the seats in play (a leaver is neither a voter nor a target); `votes`
 * maps a voter to a seat id or `"pantry"` (when `pantryTarget`); a vote from or for anyone else, or for oneself,
 * is an abstention. Everyone at the top goes in, ties included (`tiesTurnOutAll`), when the top count reaches
 * `minVotesToTurnOut`; the Pantry at the top only sets `pantryOut`. Then, `critiqueHops` times at most, a seat in
 * `outs` whose final card `onOut` is `dragVote` pulls in the seat it voted for, if that seat is not out yet.
 * `finals` maps every seat to its final Role card.
 */
export function resolveDawn(
  votes: Readonly<Record<string, string>>,
  seats: readonly string[],
  finals: ReadonlyMap<string, string>,
  roleInfo: (roleId: string) => OnubRoleInfo,
  rule: OnubVoteRule,
): DawnOutcome {
  const inPlay = new Set(seats);
  const valid = (voter: string, target: string | undefined): target is string =>
    target !== undefined &&
    inPlay.has(voter) &&
    target !== voter &&
    (inPlay.has(target) || (rule.pantryTarget && target === PANTRY_VOTE));
  const tally: Record<string, number> = {};
  const counted = new Set<string>();
  for (const voter of seats) {
    const target = votes[voter];
    if (!valid(voter, target)) continue;
    counted.add(voter);
    tally[target] = (tally[target] ?? 0) + 1;
  }
  const abstained = seats.filter((seat) => !counted.has(seat));
  const top = Math.max(0, ...Object.values(tally));
  const leaders = Object.keys(tally).filter((id) => tally[id] === top);
  const turnsOut = top >= rule.minVotesToTurnOut && (leaders.length === 1 || rule.tiesTurnOutAll);
  const out = new Set(turnsOut ? leaders.filter((id) => id !== PANTRY_VOTE) : []);
  const pantryOut = turnsOut && leaders.includes(PANTRY_VOTE);
  let hop = '';
  for (let n = 0; n < rule.critiqueHops; n++) {
    const pulled: string[] = [];
    for (const seat of seats) {
      if (!out.has(seat)) continue;
      const finalRole = finals.get(seat);
      if (finalRole === undefined || roleInfo(finalRole).onOut !== 'dragVote') continue;
      const target = votes[seat];
      if (valid(seat, target) && target !== PANTRY_VOTE && !out.has(target)) pulled.push(target);
    }
    if (pulled.length === 0) break;
    for (const id of pulled) out.add(id);
    hop ||= pulled[0] as string;
  }
  return { tally, outs: seats.filter((seat) => out.has(seat)), hop, pantryOut, abstained };
}

/** One row of `balance.onub.json` `winners`: every `when` flag that is present must match. */
export interface OnubWinnerRowLike {
  id: string;
  when: {
    ruined?: boolean | undefined;
    croissantOut?: boolean | undefined;
    sporeOut?: boolean | undefined;
    sporeAmongPlayers?: boolean | undefined;
    moldOut?: boolean | undefined;
    anyoneOut?: boolean | undefined;
  };
  winners: readonly ('baker' | 'mold' | 'croissant' | 'nobody')[];
}

/** The facts the winners table is judged on (GDD 3.11), over the final cards. */
export interface OnubWinFlags {
  ruined: boolean;
  /** A seat in `outs` holds a `croissant`-team card. */
  croissantOut: boolean;
  /** A seat in `outs` holds a `spore` card. */
  sporeOut: boolean;
  /** Some seat (in play or not) holds a `spore` card. */
  sporeAmongPlayers: boolean;
  /** A seat in `outs` holds a `mold`-team card. */
  moldOut: boolean;
  anyoneOut: boolean;
}

/** The flags for a dawn: `outs` from `resolveDawn`, `finals` every seat's final Role card, `ruined` from prep. */
export function onubWinFlags(
  outs: readonly string[],
  finals: ReadonlyMap<string, string>,
  ruined: boolean,
  roleInfo: (roleId: string) => OnubRoleInfo,
): OnubWinFlags {
  const held = [...finals.values()].map(roleInfo);
  const heldOut = outs.flatMap((seat) => {
    const roleId = finals.get(seat);
    return roleId === undefined ? [] : [roleInfo(roleId)];
  });
  return {
    ruined,
    croissantOut: heldOut.some((r) => r.team === 'croissant'),
    sporeOut: heldOut.some((r) => r.spore),
    sporeAmongPlayers: held.some((r) => r.spore),
    moldOut: heldOut.some((r) => r.team === 'mold'),
    anyoneOut: outs.length > 0,
  };
}

/**
 * The winners table, first row whose `when` holds (GDD 3.11). The tokens resolve to seats by final card: `baker`,
 * `mold` and `croissant` every seat whose final card is of that team (seats in the oven included), `nobody` no
 * seat. Throws when no row holds (the table's last row must catch every dawn).
 */
export function onubWinners(
  flags: OnubWinFlags,
  finals: ReadonlyMap<string, string>,
  roleInfo: (roleId: string) => OnubRoleInfo,
  rows: readonly OnubWinnerRowLike[],
): { rowId: string; winnerIds: string[] } {
  const row = rows.find((r) =>
    (Object.keys(r.when) as (keyof OnubWinFlags)[]).every(
      (key) => r.when[key] === undefined || r.when[key] === flags[key],
    ),
  );
  if (!row) throw new Error('no winners row holds');
  const winnerIds = [...finals.entries()]
    .filter(([, roleId]) => {
      const team = roleInfo(roleId).team;
      return row.winners.some((w) => w === team);
    })
    .map(([seat]) => seat);
  return { rowId: row.id, winnerIds };
}

/**
 * `GameState.winner` for a quick-mode result (GDD 3.11): `croissant` when the row's winners include `croissant`
 * and a seat won with it, else `nobody` when no seat won, else `cabal` for a `mold` row, else `village`.
 */
export function onubWinnerName(
  row: OnubWinnerRowLike,
  winnerIds: readonly string[],
): 'croissant' | 'village' | 'cabal' | 'nobody' {
  if (winnerIds.length === 0) return 'nobody';
  if (row.winners.includes('croissant')) return 'croissant';
  return row.winners.includes('mold') ? 'cabal' : 'village';
}
