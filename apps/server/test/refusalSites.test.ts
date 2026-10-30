import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SIM = join(__dirname, '../src/sim');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : path.endsWith('.ts') ? [path] : [];
  });
}

/** Round 10, A3 (docs/round9/failures.md 7): a refusal site names a reason, never a code and a literal message. */
describe('refusal sites in sim/', () => {
  const files = sources(SIM)
    .map((path) => ({ name: relative(SIM, path), text: readFileSync(path, 'utf8') }))
    .filter((f) => f.name !== 'refusal.ts');

  it('send no legacy ErrorCode and message', () => {
    const legacy = files.filter((f) => /\bErrorCode\b/.test(f.text)).map((f) => f.name);
    expect(legacy).toEqual([]);
  });

  it('pass no literal message to reject or refuse', () => {
    const literal = files
      .filter((f) => /\b(?:reject|refuse)\(\s*room,\s*[\w.]+,\s*[\w.]+,\s*['`]/.test(f.text))
      .map((f) => f.name);
    expect(literal).toEqual([]);
  });
});
