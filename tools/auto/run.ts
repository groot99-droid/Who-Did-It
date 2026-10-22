// The all-NPC match runner (round 6, docs/round6/auto-admin.md 4; Session 6A owns this file, 6B owns report/ and
// checks/). Plays matches in-process on the server's test harness (`apps/server/test/autoHelpers.ts
// runAutoMatch`), no network: one line per match (winner, ticks, rounds, failures), every invariant failure with the
// four seed words of each stream so the admin page can replay it, exit 1 on any failure.
//
//   pnpm auto -- [--matches 20] [--seed 7] [--map hollowmere|blackpine] [--mode main|onub]
//                [--difficulty easy|normal|hard] [--seats 10] [--json]
//
// Pre-seeded by 6Z: prints this usage and exits 2.
import { parseArgs } from './args';

const opts = parseArgs(process.argv.slice(2));
if (opts === null) {
  console.error(
    'usage: pnpm auto -- [--matches N] [--seed N] [--map ID] [--mode main|onub] [--difficulty L] [--seats N] [--json]',
  );
  process.exit(2);
}
console.error('pnpm auto: round 6, Session 6A fills the runner (docs/round6/auto-admin.md 4)');
process.exit(2);
