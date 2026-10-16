import { describe, expect, it } from 'vitest';
import { decodePng, encodePng } from '../bleed.ts';
import { LOFT_KEYS } from '../keys.ts';
import { finishLoft, LOFT_SIZES } from '../loft.ts';

function image(w: number, h: number): Buffer {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(i % 7 ? [0, 0, 0, 0] : [217, 210, 194, 255], i * 4);
  return encodePng({ width: w, height: h, data });
}

const inputs = () => new Map(LOFT_KEYS.map((k) => [k, image(...LOFT_SIZES[k]!)]));

describe('finishLoft', () => {
  it('writes one PNG per loft key at its size, deterministically', () => {
    const a = finishLoft(inputs());
    expect([...a.keys()].sort()).toEqual(LOFT_KEYS.map((k) => `${k}.png`).sort());
    for (const k of LOFT_KEYS) {
      const img = decodePng(a.get(`${k}.png`)!);
      expect([img.width, img.height]).toEqual(LOFT_SIZES[k]);
    }
    const b = finishLoft(inputs());
    for (const [name, bytes] of a) expect(bytes.equals(b.get(name)!)).toBe(true);
  });

  it('refuses a missing key or a wrong size', () => {
    const missing = inputs();
    missing.delete('prop_bedroll_self');
    expect(() => finishLoft(missing)).toThrow(/missing prop_bedroll_self/);
    const wrong = inputs();
    wrong.set('prop_bedroll', image(56, 92));
    expect(() => finishLoft(wrong)).toThrow(/56x92, want 112x184/);
  });
});
