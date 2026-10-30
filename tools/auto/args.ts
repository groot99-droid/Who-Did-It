// The runner's arguments, pure and tested (round 6, Session 6A widens it as the runner grows).
export interface AutoArgs {
  matches: number;
  seed: number;
  map: string;
  difficulty: 'easy' | 'normal' | 'hard';
  seats: number;
  json: boolean;
  /** Round 10, x14 (A453): decode a shadow view per seat and check it against the server every tick. */
  views: boolean;
}

const DEFAULTS: AutoArgs = {
  matches: 20,
  seed: 1,
  map: 'hollowmere',
  difficulty: 'normal',
  seats: 6,
  json: false,
  views: false,
};

/** Null on a flag it does not know or a value it cannot read. */
export function parseArgs(argv: readonly string[]): AutoArgs | null {
  const out: AutoArgs = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--json') {
      out.json = true;
      continue;
    }
    if (flag === '--views') {
      out.views = true;
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined) return null;
    i++;
    switch (flag) {
      case '--matches':
      case '--seed':
      case '--seats': {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1) return null;
        out[flag.slice(2) as 'matches' | 'seed' | 'seats'] = n;
        break;
      }
      case '--map':
        out.map = value;
        break;
      case '--difficulty':
        if (value !== 'easy' && value !== 'normal' && value !== 'hard') return null;
        out.difficulty = value;
        break;
      default:
        return null;
    }
  }
  return out;
}

/** Four 32-bit seed words of one stream. */
export type Words = [number, number, number, number];

/** A 32-bit mix (splitmix32's finaliser), so nearby `--seed` values give unrelated words. */
function mix(x: number): number {
  let z = (x + 0x9e3779b9) | 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}

/**
 * The seed words of match `match` (0-based) of a run with `--seed seed`, one record per stream name: the same
 * flags always replay the same matches.
 */
export function seedWordsFor(seed: number, match: number, streams: readonly string[]): Record<string, Words> {
  const out: Record<string, Words> = {};
  streams.forEach((name, s) => {
    const base = mix(mix(seed) ^ mix(match * 0x10001 + s));
    out[name] = [mix(base), mix(base + 1), mix(base + 2), mix(base + 3)];
  });
  return out;
}

/** The NPC seat ids of match `match`, fixed by the run's seed so the log names the same seats on a replay. */
export const npcIdsFor = (seed: number, match: number, seats: number): string[] =>
  Array.from({ length: seats }, (_, i) => `a${seed}m${match}s${i}`);
