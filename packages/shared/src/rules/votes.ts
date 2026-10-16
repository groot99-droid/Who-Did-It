// `resolveVotes` (GDD 3.8): plain plurality with Skip. Pure functions over plain data (ARCHITECTURE 5.8).

export const SKIP_VOTE = 'skip';

/**
 * The anti-stall rules of GDD 3.8 exist as arguments and stay off by default (A30): the caller passes
 * them in once a playtest enables them.
 */
export interface VoteOptions {
  /** Default true. False discards Skip votes (the forced vote after two quiet meetings). */
  skipAllowed?: boolean;
  /** Default 0. A player is ejected only when holding at least this many votes (`ceil(living / 3)` in the forced vote). */
  minVotes?: number;
}

export interface VoteOutcome {
  /** Votes per target id, plus `"skip"`; zero entries are omitted and voters are never named. */
  tally: Record<string, number>;
  /** The ejected player, or undefined when nobody is ejected. */
  ejectedId?: string;
}

/**
 * `votes` maps a voter id to a target id or `"skip"`. A vote from someone who is not in `living`, or
 * for a target who is not in `living`, is discarded; a living player who did not vote is an abstention.
 * A tie for first place, or a Skip count at least as large as the best player's, ejects nobody.
 */
export function resolveVotes(
  votes: Readonly<Record<string, string>>,
  living: readonly string[],
  options: VoteOptions = {},
): VoteOutcome {
  const { skipAllowed = true, minVotes = 0 } = options;
  const alive = new Set(living);
  const tally: Record<string, number> = {};
  for (const [voter, target] of Object.entries(votes)) {
    if (!alive.has(voter)) continue;
    if (target === SKIP_VOTE ? !skipAllowed : !alive.has(target)) continue;
    tally[target] = (tally[target] ?? 0) + 1;
  }
  let best = 0;
  let leaders: string[] = [];
  for (const [target, count] of Object.entries(tally)) {
    if (target === SKIP_VOTE) continue;
    if (count > best) {
      best = count;
      leaders = [target];
    } else if (count === best) leaders.push(target);
  }
  const skips = tally[SKIP_VOTE] ?? 0;
  const [only] = leaders;
  if (leaders.length !== 1 || only === undefined || best <= skips || best < minVotes) return { tally };
  return { tally, ejectedId: only };
}
