// The all-NPC match runner (round 6, docs/round6/auto-admin.md 4, GDD 3.19; Session 6A owns this file, 6B owns
// report/ and checks/). Plays matches in-process on the server's test harness (`apps/server/test/autoHelpers.ts
// runAutoMatch`), no network: one line per match (winner, ticks, rounds, failures), every invariant failure with the
// four seed words of each stream so the admin page can replay it, exit 1 on any failure.
//
//   pnpm auto -- [--matches 20] [--seed 7] [--map hollowmere|blackpine]
//                [--difficulty easy|normal|hard] [--seats 10] [--json]
import { Winner } from '@wdi/shared';
import {
  AUTO_STREAMS,
  type AutoResult,
  bootAutoServer,
  captureMatchLog,
  runAutoMatch,
} from '../../apps/server/test/autoHelpers';
import { npcIdsFor, parseArgs, seedWordsFor } from './args';
import './checks';

const opts = parseArgs(process.argv.slice(2).filter((a) => a !== '--'));
if (opts === null) {
  console.error(
    'usage: pnpm auto -- [--matches N] [--seed N] [--map ID] [--difficulty L] [--seats N] [--json]',
  );
  process.exit(2);
}

const winnerName = (w: number): string => Object.entries(Winner).find(([, v]) => v === w)?.[0] ?? String(w);
const out = (line: string) => process.stdout.write(`${line}\n`);

const seedLines = (r: AutoResult): string[] => [
  ...Object.entries(r.seeds).map(([name, w]) => `  seed ${name} ${(w ?? []).join(' ')}`),
  `  npcIds ${r.npcIds.join(' ')}`,
];

let records: unknown[] = [];
captureMatchLog((line) => records.push(JSON.parse(line)));

const colyseus = await bootAutoServer();
let failed = 0;
try {
  for (let m = 0; m < opts.matches; m++) {
    records = [];
    const t0 = performance.now();
    const r = await runAutoMatch(colyseus, {
      map: opts.map,
      seats: opts.seats,
      difficulty: opts.difficulty,
      seeds: seedWordsFor(opts.seed, m, AUTO_STREAMS),
      npcIds: npcIdsFor(opts.seed, m, opts.seats),
    });
    const ms = Math.round(performance.now() - t0);
    if (r.failures.length > 0) failed++;
    if (opts.json) {
      const { events: _events, ...rest } = r;
      out(JSON.stringify({ match: m + 1, ms, ...rest, winner: winnerName(r.winner), log: records[0] }));
      continue;
    }
    out(
      `match ${m + 1}/${opts.matches} winner=${winnerName(r.winner)} ticks=${r.ticks} rounds=${r.rounds} ` +
        `failures=${r.failures.length} ${ms}ms`,
    );
    if (r.failures.length === 0) continue;
    for (const f of r.failures) out(`  FAIL ${f.name} at tick ${f.tick}: ${f.detail}`);
    for (const line of seedLines(r)) out(line);
  }
} finally {
  await colyseus.shutdown();
}
if (!opts.json) out(`${opts.matches - failed}/${opts.matches} matches clean`);
process.exit(failed > 0 ? 1 : 0);
