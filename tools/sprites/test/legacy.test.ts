import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEGACY } from './legacy.ts';

const real = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../../apps/client/public/assets/manifest.json'), 'utf8'),
) as { entries: Array<{ key: string }> };

describe('the LEGACY allowlist (art plan 1.7)', () => {
  it('lists each key once', () => {
    expect(new Set(LEGACY).size).toBe(LEGACY.length);
  });

  it('lists only keys of the real manifest: a PR that removes a key deletes its line', () => {
    const keys = new Set(real.entries.map((e) => e.key));
    expect(LEGACY.filter((k) => !keys.has(k))).toEqual([]);
  });

  // K6 adds: it('is empty', () => expect(LEGACY).toEqual([]));
});
