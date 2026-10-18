// The ruin rate per party size (GDD 3.11 "Balance and length": 20-30% of the matches with a Team Mold card at
// the table; onub-contract.md 11), by Monte Carlo over the real prep rules: each run deals a deck, has every seat
// commit the way the bots and NPC seats do (`planCommit`: any station, a sabotage card with `--sabotage` chance
// when the card sabotages) and resolves the piles with `resolvePrep`. It reads the deal and the ruin rule from
// `@wdi/shared` and `balance.onub.json` only, so it needs no server. A real 30 minute soak plays three matches;
// this is where the rate gets its numbers.
//
//   pnpm bots:ruin -- [--runs 20000] [--sabotage 0.6] [--sizes 4,5,6,7,8,9,10] [--seed 1]
import { onubBalance, onubFor, onubRoles } from '@wdi/content';
import {
  type OnubCommit,
  type OnubPrepStreams,
  type PrepOutcome,
  dealOnub,
  dealPantryLocs,
  resolvePrep,
  sfc32,
} from '@wdi/shared';
import { fileURLToPath } from 'node:url';
import { RUIN_TARGET, type RuinSample, planCommit, ruinReport } from './quick';
import { mulberry } from './walk';

/** The rules `simulate` calls, so a test can stand in for them. */
export interface RuinRules {
  deal: typeof dealOnub;
  dealLocs: typeof dealPantryLocs;
  resolve: typeof resolvePrep;
}

export const realRules: RuinRules = { deal: dealOnub, dealLocs: dealPantryLocs, resolve: resolvePrep };

const streams = (seed: number): OnubPrepStreams => ({
  piles: sfc32(seed, 1, 2, 3),
  thaw: sfc32(seed, 4, 5, 6),
  perk: sfc32(seed, 7, 8, 9),
});

/** `runs` matches of `size` seats where a sabotaging card sabotages with chance `sabotage`. */
export function simulate(
  size: number,
  runs: number,
  sabotage: number,
  seed: number,
  rules: RuinRules = realRules,
): RuinSample[] {
  const rng = mulberry(seed);
  const seats = Array.from({ length: size }, (_, i) => `s${i}`);
  const deck = onubFor(size).deck;
  const out: RuinSample[] = [];
  for (let n = 0; n < runs; n++) {
    const deal = sfc32(Math.floor(rng() * 2 ** 32), Math.floor(rng() * 2 ** 32), size, n);
    const { dealt } = rules.deal(seats, deck, deal);
    rules.dealLocs(
      onubBalance.stations.map((s) => s.id),
      onubBalance.pantry.locations,
      deal,
    );
    const commits = new Map<string, OnubCommit>();
    for (const id of seats) {
      const role = dealt.get(id) as string;
      commits.set(id, planCommit(rng, onubRoles.roles[role]?.sabotages ?? false, sabotage));
    }
    const prep: PrepOutcome = rules.resolve(
      commits,
      seats,
      onubBalance.stations,
      onubBalance.cards,
      onubBalance.ruin,
      onubBalance.pantry.locations,
      streams(Math.floor(rng() * 2 ** 32)),
    );
    out.push({
      size,
      ruined: prep.ruined,
      mold: seats.some((id) => onubRoles.roles[dealt.get(id) as string]?.team === 'mold'),
    });
  }
  return out;
}

function main(): void {
  const argv = process.argv.slice(2);
  const get = (f: string, d: string) => (argv.includes(f) ? (argv[argv.indexOf(f) + 1] as string) : d);
  const runs = Number(get('--runs', '20000'));
  const sabotage = Number(get('--sabotage', String(onubBalance.npc.sabotageChance.normal)));
  const seed = Number(get('--seed', '1'));
  const sizes = get('--sizes', '4,5,6,7,8,9,10').split(',').map(Number);
  const samples = sizes.flatMap((size) => simulate(size, runs, sabotage, seed + size));
  console.log(
    `[ruin] ${runs} matches per size, sabotaging cards sabotage with chance ${sabotage}, target ` +
      `${RUIN_TARGET.min * 100}-${RUIN_TARGET.max * 100}% of matches with a Team Mold card`,
  );
  console.log(ruinReport(samples).join('\n'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
