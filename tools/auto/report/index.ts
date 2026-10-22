// `tsx report/index.ts <auto.log> [title]`: prints the markdown report of a `pnpm auto -- --json` run and exits 1
// when a match failed a check or never finished, or when no match was read (round 6, Session 6B; the weekly
// `.github/workflows/soak.yml` `auto` leg).
import { readFileSync } from 'node:fs';
import { readLines, summarize } from './summary';

const [file, title = 'auto'] = process.argv.slice(2).filter((a) => a !== '--');
if (file === undefined) {
  console.error('usage: tsx report/index.ts <auto.log> [title]');
  process.exit(2);
}
const report = summarize(title, readLines(readFileSync(file, 'utf8')));
process.stdout.write(`${report.markdown}\n`);
process.exit(report.matches === 0 || report.failed > 0 ? 1 : 0);
