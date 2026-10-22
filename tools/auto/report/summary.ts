// The report of a `pnpm auto -- --json` run (round 6, Session 6B; docs/round6/auto-admin.md 4): the step summary of
// the weekly soak's `auto` leg. Pure: the lines in, the markdown and the verdict out.

/** What the report reads of one `--json` line (`tools/auto/run.ts`). */
export interface MatchLine {
  match: number;
  ms: number;
  winner: string;
  ticks: number;
  rounds: number;
  failures: { name: string; tick: number; detail: string }[];
  seeds: Record<string, number[]>;
  npcIds: string[];
  log?: { kills?: number; mode?: string };
}

export interface Report {
  markdown: string;
  /** Matches with an invariant failure or without a winner. */
  failed: number;
  matches: number;
}

/** Every line that parses as a match; anything else (pnpm's own output) is skipped. */
export function readLines(text: string): MatchLine[] {
  const out: MatchLine[] = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('{')) continue;
    try {
      const rec = JSON.parse(line) as Partial<MatchLine>;
      if (typeof rec.match === 'number' && Array.isArray(rec.failures)) out.push(rec as MatchLine);
    } catch {
      // not a match line
    }
  }
  return out;
}

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length === 0) return 0;
  return s.length % 2 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
};

/** A match that ran out of ticks never reached game over: its winner reads `none`. */
const unfinished = (m: MatchLine): boolean => m.winner === 'none';

const countBy = <T>(xs: readonly T[], key: (x: T) => string): [string, number][] => {
  const out = new Map<string, number>();
  for (const x of xs) out.set(key(x), (out.get(key(x)) ?? 0) + 1);
  return [...out].sort((a, b) => b[1] - a[1]);
};

export function summarize(title: string, matches: readonly MatchLine[]): Report {
  const bad = matches.filter((m) => m.failures.length > 0 || unfinished(m));
  const ticks = matches.map((m) => m.ticks);

  const md: string[] = [
    `### ${title}`,
    '',
    `${matches.length - bad.length}/${matches.length} matches clean`,
    '',
  ];
  md.push('| winner | matches |', '|---|---|');
  for (const [w, n] of countBy(matches, (m) => m.winner)) md.push(`| ${w} | ${n} |`);
  md.push(
    '',
    `ticks: min ${ticks.length ? Math.min(...ticks) : 0}, median ${median(ticks)}, ` +
      `max ${ticks.length ? Math.max(...ticks) : 0}; rounds median ${median(matches.map((m) => m.rounds))}; ` +
      `kills median ${median(matches.map((m) => m.log?.kills ?? 0))}`,
  );
  const byCheck = countBy(
    matches.flatMap((m) => m.failures),
    (f) => f.name,
  );
  if (byCheck.length > 0) {
    md.push('', '| check | failures |', '|---|---|');
    for (const [name, n] of byCheck) md.push(`| ${name} | ${n} |`);
  }
  for (const m of bad) {
    md.push('', `**match ${m.match}** winner=${m.winner} ticks=${m.ticks}`, '```');
    if (unfinished(m)) md.push('UNFINISHED: no game over within the tick budget');
    for (const f of m.failures) md.push(`FAIL ${f.name} at tick ${f.tick}: ${f.detail.split('\n')[0]}`);
    for (const [name, w] of Object.entries(m.seeds)) md.push(`seed ${name} ${w.join(' ')}`);
    md.push(`npcIds ${m.npcIds.join(' ')}`, '```');
  }
  return { markdown: md.join('\n'), failed: bad.length, matches: matches.length };
}
