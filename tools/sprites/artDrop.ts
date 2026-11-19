/**
 * The art-drop size warning (ASSETS 6.6: "CI warns when a PR adds more than 25 MB of binaries"; round 11, T3).
 *
 * Sums the bytes a pull request adds in binary files against its base and prints a GitHub `::warning::` above the
 * line. It never fails the job: a drop that big is the owner's to see, not a red build. A file the PR changes
 * counts the growth only (new size minus old size, never below zero); an added file counts whole; a deleted one
 * counts nothing.
 *
 *   tsx artDrop.ts <base-sha> [head-ref]
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** ASSETS 6.6's line, in bytes (25 MiB). Over it warns; at it does not. */
export const LIMIT_BYTES = 25 * 1024 * 1024;

export interface Entry {
  path: string;
  binary: boolean;
  oldSize: number; // 0 for an added file
  newSize: number; // 0 for a deleted file
}

/** `git diff --numstat` lines to the set of binary paths (git prints `-\t-\t<path>` for them). */
export function binaryPaths(numstat: string): Set<string> {
  const out = new Set<string>();
  for (const line of numstat.split('\n')) {
    const m = /^-\t-\t(.+)$/.exec(line);
    if (m?.[1]) out.add(m[1]);
  }
  return out;
}

/** The bytes the entries add: binary files only, growth of a changed file, the whole of an added one. */
export function addedBinaryBytes(entries: Entry[]): number {
  let total = 0;
  for (const e of entries) {
    if (!e.binary) continue;
    total += Math.max(0, e.newSize - e.oldSize);
  }
  return total;
}

export function overTheLine(bytes: number): boolean {
  return bytes > LIMIT_BYTES;
}

export function message(bytes: number): string {
  const mb = (bytes / (1024 * 1024)).toFixed(1);
  const limit = LIMIT_BYTES / (1024 * 1024);
  return overTheLine(bytes)
    ? `This pull request adds ${mb} MB of binaries, over the ${limit} MB art-drop line (ASSETS 6.6): split the drop or tell the owner.`
    : `This pull request adds ${mb} MB of binaries, under the ${limit} MB art-drop line.`;
}

function git(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

function blobSize(rev: string, path: string): number {
  return Number(git(['cat-file', '-s', `${rev}:${path}`]).trim());
}

/** Reads the diff of `head` against `base` from the local repository. */
export function collect(base: string, head = 'HEAD'): Entry[] {
  const binary = binaryPaths(git(['diff', '--numstat', '--no-renames', base, head]));
  const entries: Entry[] = [];
  for (const path of binary) {
    const inBase = git(['ls-tree', base, '--', path]).trim() !== '';
    const inHead = git(['ls-tree', head, '--', path]).trim() !== '';
    entries.push({
      path,
      binary: true,
      oldSize: inBase ? blobSize(base, path) : 0,
      newSize: inHead ? blobSize(head, path) : 0,
    });
  }
  return entries;
}

function main(): void {
  const [base, head] = process.argv.slice(2);
  if (!base) {
    console.error('usage: tsx artDrop.ts <base-sha> [head-ref]');
    process.exit(2);
  }
  const bytes = addedBinaryBytes(collect(base, head ?? 'HEAD'));
  console.log(overTheLine(bytes) ? `::warning title=Art drop over 25 MB::${message(bytes)}` : message(bytes));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
