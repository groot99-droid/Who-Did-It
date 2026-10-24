import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import {
  MAP_PROPS_FRAMES,
  bldPropFrames,
  expectedFrames,
  packStatic,
  type StaticManifest,
} from '../pack-static.ts';
import type { MultiAtlas, PackInput } from '../pack.ts';

// Round 8 (8J): a map's single-tile props may pack into its building atlas's last page, never onto a new or larger
// page (BLD_PROPS_MAPS).
/** A `w` x `h` block in its own colour (the packer folds identical frames into one). */
let seed = 0;
const block = (w: number, h: number): Buffer => {
  const c = createCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = `#${((++seed * 40503) % 0xffffff).toString(16).padStart(6, '0')}`;
  g.fillRect(0, 0, w, h);
  return c.toBuffer('image/png');
};

/** `bld_hollowmere` with `n` building slices of 200 x 200 and every prop frame it packs, each 32 x 32. */
function sheet(n: number): { manifest: StaticManifest; inputs: PackInput[] } {
  const manifest: StaticManifest = { version: 1, atlas: 'bld_hollowmere', frames: {} };
  const inputs: PackInput[] = [];
  for (let i = 0; i < n; i++) {
    const name = `bld_inn#0_${i}`;
    manifest.frames[name] = { file: `${name}.png`, cell: [200, 200] };
    inputs.push({ name, png: block(200, 200) });
  }
  for (const name of bldPropFrames('hollowmere')) {
    manifest.frames[name] = { file: `${name}.png`, cell: [32, 32] };
    inputs.push({ name, png: block(32, 32) });
  }
  return { manifest, inputs };
}

describe('BLD_PROPS_MAPS', () => {
  it("moves HollowMere's single-tile props out of its props atlas and into its building atlas", () => {
    const own = MAP_PROPS_FRAMES.props_hollowmere!;
    expect(bldPropFrames('hollowmere')).toEqual(own);
    expect(expectedFrames('props_hollowmere')).toEqual([]);
    expect(expectedFrames('bld_hollowmere')).toEqual([...own].sort());
    expect(bldPropFrames('blackpine')).toEqual([]);
  });

  it("packs the props into the building page's free room, keeping its size", async () => {
    const { manifest, inputs } = sheet(18);
    const atlas = JSON.parse(
      (await packStatic(manifest, inputs, false)).get('bld_hollowmere.json')!.toString('utf8'),
    ) as MultiAtlas;
    expect(atlas.textures.map((t) => t.size)).toEqual([{ w: 1024, h: 1024 }]);
    expect(atlas.textures[0]!.frames).toHaveLength(inputs.length);
  });

  it('refuses props that would need a new or larger page', async () => {
    const { manifest, inputs } = sheet(25);
    await expect(packStatic(manifest, inputs, false)).rejects.toThrow(/new or larger page/);
  });
});
