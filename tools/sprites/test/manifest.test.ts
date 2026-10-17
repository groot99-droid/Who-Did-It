import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOFT_KEYS } from '../keys.ts';

const ASSETS = join(import.meta.dirname, '../../../apps/client/public/assets');
const read = (rel: string) =>
  JSON.parse(readFileSync(join(ASSETS, rel), 'utf8')) as {
    art: string;
    entries: Array<{ key: string; type: string }>;
  };

describe('asset manifests (docs/SPRITES.md 5)', () => {
  const real = read('manifest.json');
  const placeholder = read('placeholder/manifest.json');

  it('give the real and the placeholder art the same keys and types', () => {
    const shape = (m: typeof real) => m.entries.map((e) => `${e.key}:${e.type}`).sort();
    expect(real.art).toBe('real');
    expect(placeholder.art).toBe('placeholder');
    expect(shape(placeholder)).toEqual(shape(real));
  });

  it('list the props and vfx atlases and the loft images', () => {
    const keys = placeholder.entries.map((e) => e.key);
    expect(keys).toEqual(expect.arrayContaining(['props', 'vfx', 'anims_vfx', ...LOFT_KEYS]));
    for (const k of LOFT_KEYS) expect(real.entries.find((e) => e.key === k)?.type).toBe('image');
  });
});
