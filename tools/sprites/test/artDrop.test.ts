import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addedBinaryBytes,
  binaryPaths,
  collect,
  type Entry,
  LIMIT_BYTES,
  message,
  overTheLine,
} from '../artDrop.ts';

/** ASSETS 6.6, round 11 T3: the 25 MB art-drop warning. */
const bin = (newSize: number, oldSize = 0): Entry => ({ path: 'a.png', binary: true, oldSize, newSize });

describe('the art-drop line', () => {
  it('is 25 MiB, and a drop under it does not warn', () => {
    expect(LIMIT_BYTES).toBe(25 * 1024 * 1024);
    expect(overTheLine(addedBinaryBytes([bin(LIMIT_BYTES - 1)]))).toBe(false);
  });

  it('does not warn at the line, and warns one byte over', () => {
    expect(overTheLine(addedBinaryBytes([bin(LIMIT_BYTES)]))).toBe(false);
    expect(overTheLine(addedBinaryBytes([bin(LIMIT_BYTES + 1)]))).toBe(true);
  });

  it('sums many files, counts growth of a changed file only, and ignores text and deletions', () => {
    const total = addedBinaryBytes([
      bin(10 * 1024 * 1024),
      bin(20 * 1024 * 1024, 8 * 1024 * 1024), // grew by 12 MiB
      bin(0, 99 * 1024 * 1024), // deleted
      bin(5 * 1024 * 1024, 9 * 1024 * 1024), // shrank: counts nothing
      { path: 'x.json', binary: false, oldSize: 0, newSize: 500 * 1024 * 1024 },
    ]);
    expect(total).toBe(22 * 1024 * 1024);
    expect(overTheLine(total)).toBe(false);
    expect(overTheLine(total + 4 * 1024 * 1024)).toBe(true);
  });

  it('reads the binary paths from a git numstat', () => {
    const numstat = [
      '12\t3\tapps/client/src/a.ts',
      '-\t-\tapps/client/public/assets/chars/p.png',
      '0\t0\tREADME.md',
    ].join('\n');
    expect([...binaryPaths(numstat)]).toEqual(['apps/client/public/assets/chars/p.png']);
  });

  it('says which side of the line it is on', () => {
    expect(message(LIMIT_BYTES + 1024 * 1024)).toMatch(/over the 25 MB art-drop line/);
    expect(message(1024 * 1024)).toMatch(/1\.0 MB of binaries, under/);
  });
});

describe('collect on a real fixture diff', () => {
  it('counts the binary a commit adds against its base, not the text', () => {
    const dir = mkdtempSync(join(tmpdir(), 'artdrop-'));
    const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' }).trim();
    git('init', '-q');
    git('config', 'user.email', 't@example.com');
    git('config', 'user.name', 't');
    writeFileSync(join(dir, 'a.txt'), 'text\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    const base = git('rev-parse', 'HEAD');
    const png = Buffer.alloc(3000, 0);
    png.write('\x89PNG', 0, 'latin1');
    writeFileSync(join(dir, 'p.png'), png);
    writeFileSync(join(dir, 'a.txt'), 'more text\n'.repeat(1000));
    git('add', '.');
    git('commit', '-qm', 'drop');
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const entries = collect(base);
      expect(entries).toEqual([{ path: 'p.png', binary: true, oldSize: 0, newSize: 3000 }]);
      expect(addedBinaryBytes(entries)).toBe(3000);
    } finally {
      process.chdir(cwd);
    }
  });
});
