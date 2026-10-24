import { createCanvas } from '@napi-rs/canvas';
import { packAsync } from 'free-tex-packer-core';
import { describe, expect, it } from 'vitest';
import { decodePng, encodePng } from '../bleed.ts';
import { PACK_OPTIONS, type PackInput } from '../pack.ts';
import { packCapped } from '../pack-static.ts';

// packCapped re-encodes the packer library's pages with encodePng (8J, round 8): lossless, and a quarter to
// a half smaller than the library's own writer.

function frame(i: number): PackInput {
  const c = createCanvas(48, 48);
  const g = c.getContext('2d');
  g.fillStyle = ['#B3121F', '#6F7A8C', '#2E8B57', '#D9A441'][i % 4]!;
  g.fillRect(4 + i, 6, 30, 36 - i);
  g.fillStyle = 'rgba(20, 30, 40, 0.5)';
  g.fillRect(10, 10 + i, 12, 12);
  return { name: `prop_test_${i}`, png: c.toBuffer('image/png') };
}

describe('packCapped pages', () => {
  it('decode to exactly the pixels of the packer library buffer, re-encoded by encodePng', async () => {
    const inputs = [0, 1, 2, 3, 4, 5].map(frame);
    const { atlas, pages } = await packCapped('props_test', inputs, 256, 256, true);
    expect(atlas.textures).toHaveLength(1);
    const ours = pages.get('props_test-0.png')!;

    // The library run packCapped makes for a finished page: no extrude, the full padding.
    const files = inputs.map((i) => ({ path: `${i.name}.png`, contents: i.png }));
    const options = { ...PACK_OPTIONS, width: 256, height: 256, textureName: 'props_test', extrude: 0 };
    const out = await packAsync(files, options as Parameters<typeof packAsync>[1]);
    const theirs = out.find((f) => f.name.endsWith('.png'))!.buffer;

    const a = decodePng(ours);
    const b = decodePng(theirs);
    expect([a.width, a.height]).toEqual([b.width, b.height]);
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
    expect(ours.equals(encodePng(b))).toBe(true);
  });
});
