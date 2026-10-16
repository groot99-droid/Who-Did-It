/**
 * One JSON line per finished match on stdout, for the playtest metrics (ROADMAP 7.5). Tests replace
 * `matchLog.write` to capture the line.
 */
export interface MatchRecord {
  code: string;
  seats: number;
  durationS: number;
  /** A `Winner` name: `village` or `cabal` in the main mode; quick mode adds `debtor` and `nobody` (A39). */
  winner: 'village' | 'cabal' | 'debtor' | 'nobody';
  /** `main` or `onub` (round 4). */
  mode?: 'main' | 'onub';
  rounds: number;
  kills: number;
  vanished: number;
  players: {
    id: string;
    name: string;
    role: string;
    faction: string;
    survived: boolean;
    clues: number;
    /** NPC seat (GDD 3.12); stdout only, never on the wire. */
    isNpc?: boolean;
  }[];
  meetings: {
    round: number;
    reason: string;
    votes: number;
    /** Share of the votes cast that named a Cabal member, 0 when nobody voted. */
    accuracy: number;
    ejectedId?: string;
    ejectedRole?: string;
    ejectionCorrect?: boolean;
  }[];
}

export const matchLog = {
  write: (line: string): void => {
    process.stdout.write(`${line}\n`);
  },
};

export function logMatch(record: MatchRecord): void {
  matchLog.write(JSON.stringify({ event: 'match', ...record }));
}
