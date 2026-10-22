// The runner's arguments, pure and tested (round 6, Session 6A widens it as the runner grows).
export interface AutoArgs {
  matches: number;
  seed: number;
  map: string;
  mode: 'main' | 'onub';
  difficulty: 'easy' | 'normal' | 'hard';
  seats: number;
  json: boolean;
}

const DEFAULTS: AutoArgs = {
  matches: 20,
  seed: 1,
  map: 'hollowmere',
  mode: 'main',
  difficulty: 'normal',
  seats: 6,
  json: false,
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
      case '--mode':
        if (value !== 'main' && value !== 'onub') return null;
        out.mode = value;
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
