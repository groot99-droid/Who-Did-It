import { describe, expect, it } from 'vitest';
import {
  type Atlas,
  type BaseEntry,
  type HdSources,
  type Sized,
  buildHdManifest,
  texelFactor,
} from '../hd-manifest.ts';

// The HD manifest builder (art.md 3, A164): the keys present against the 8-bit set, the missing ones listed.

const base: BaseEntry[] = [
  { key: 'char_a', type: 'multiatlas', url: 'chars/char_a.json', path: 'chars/' },
  { key: 'anims_a', type: 'animation', url: 'chars/a.anims.json' },
  { key: 'iso_ground_harbour', type: 'image', url: 'ground/iso_ground_harbour.png', maps: ['hollowmere'] },
  { key: 'tiles_grass', type: 'image', url: 'tiles/tiles_grass.png' },
  { key: 'nodes', type: 'multiatlas', url: 'm5b/nodes.json', path: 'm5b/' },
];

const atlas = (cell: number, names = ['a/idle/e/000', 'a/idle/e/001']): Atlas => ({
  textures: [
    { image: 'page-0.png', frames: names.map((n) => ({ filename: n, sourceSize: { w: cell, h: cell } })) },
  ],
});

function sources(hd: { images?: Record<string, Sized>; atlases?: Record<string, Atlas> }): HdSources {
  const baseImages: Record<string, Sized> = {
    'ground/iso_ground_harbour.png': { width: 1280, height: 640 },
    'tiles/tiles_grass.png': { width: 64, height: 32 },
    'chars/page-0.png': { width: 1024, height: 1024 },
    'm5b/page-0.png': { width: 512, height: 512 },
  };
  const baseAtlases: Record<string, Atlas> = {
    'chars/char_a.json': atlas(128),
    'm5b/nodes.json': atlas(64, ['n']),
  };
  return {
    base,
    imageAt: (root, rel) =>
      (root === '' ? baseImages[rel] : root === 'hd/' ? (hd.images ?? {})[rel] : undefined) ?? null,
    atlasAt: (root, rel) =>
      (root === '' ? baseAtlases[rel] : root === 'hd/' ? (hd.atlases ?? {})[rel] : undefined) ?? null,
  };
}

describe('buildHdManifest', () => {
  it('lists the keys with HD files at their measured factor and names the keys that fall back', () => {
    const { manifest, missing } = buildHdManifest(
      sources({
        images: {
          'ground/iso_ground_harbour.png': { width: 2560, height: 1280 },
          'chars/page-0.png': { width: 4096, height: 4096 },
          'm5b/page-0.png': { width: 512, height: 512 },
        },
        atlases: { 'chars/char_a.json': atlas(512), 'm5b/nodes.json': atlas(64, ['n']) },
      }),
    );
    expect(manifest).toMatchObject({ version: 1, art: 'hd' });
    expect(manifest.texels).toBe(4);
    expect(manifest.entries).toEqual([
      { key: 'char_a', type: 'multiatlas', url: 'chars/char_a.json', path: 'chars/', filter: 'linear' },
      {
        key: 'iso_ground_harbour',
        type: 'image',
        url: 'ground/iso_ground_harbour.png',
        maps: ['hollowmere'],
        filter: 'linear',
        texels: 2,
      },
      { key: 'nodes', type: 'multiatlas', url: 'm5b/nodes.json', path: 'm5b/', filter: 'linear', texels: 1 },
    ]);
    expect(missing).toEqual(['tiles_grass']);
    expect(manifest.entries.map((e) => e.key)).not.toContain('anims_a');
  });

  it('picks the commonest factor as the default, the larger one on a tie', () => {
    const { manifest } = buildHdManifest(
      sources({
        images: {
          'ground/iso_ground_harbour.png': { width: 2560, height: 1280 },
          'tiles/tiles_grass.png': { width: 128, height: 64 },
          'chars/page-0.png': { width: 4096, height: 4096 },
          'm5b/page-0.png': { width: 2048, height: 2048 },
        },
        atlases: { 'chars/char_a.json': atlas(512), 'm5b/nodes.json': atlas(256, ['n']) },
      }),
    );
    expect(manifest.texels).toBe(4);
    expect(manifest.entries.filter((e) => e.texels !== undefined).map((e) => [e.key, e.texels])).toEqual([
      ['iso_ground_harbour', 2],
      ['tiles_grass', 2],
    ]);
  });

  it('builds an empty manifest with every key missing before any HD render', () => {
    const { manifest, missing } = buildHdManifest(sources({}));
    expect(manifest.entries).toEqual([]);
    expect(manifest.texels).toBe(2);
    expect(missing).toEqual(['char_a', 'iso_ground_harbour', 'tiles_grass', 'nodes']);
  });

  it('refuses a file that is not a whole factor of its 8-bit one, a frame the 8-bit atlas lacks, a page not there', () => {
    expect(() =>
      buildHdManifest(sources({ images: { 'tiles/tiles_grass.png': { width: 96, height: 48 } } })),
    ).toThrow(/tiles_grass is 96x48 against 64x32/);
    expect(() =>
      buildHdManifest(sources({ images: { 'tiles/tiles_grass.png': { width: 128, height: 32 } } })),
    ).toThrow(/not a whole factor/);
    expect(() =>
      buildHdManifest(
        sources({
          images: { 'chars/page-0.png': { width: 4096, height: 4096 } },
          atlases: { 'chars/char_a.json': atlas(512, ['a/idle/e/000', 'a/jump/e/000']) },
        }),
      ),
    ).toThrow(/frame a\/jump\/e\/000 is not in the 8-bit atlas/);
    expect(() => buildHdManifest(sources({ atlases: { 'chars/char_a.json': atlas(512) } }))).toThrow(
      /page page-0.png is listed but missing/,
    );
  });
});

describe('a sliced atlas (bld_*, props_<map>)', () => {
  const frame = (filename: string, w: number, h: number) => ({ filename, sourceSize: { w, h } });
  // In 8-bit a slice keeps its building's whole canvas; at HD it is cropped to its box.
  const bld: Atlas = {
    textures: [
      {
        image: 'b-0.png',
        frames: [frame('inn#0_0', 320, 400), frame('inn#1_0', 320, 400), frame('well', 64, 96)],
      },
    ],
  };
  const hdBld = (texels?: number, well: [number, number] = [128, 192]): Atlas => ({
    textures: [
      {
        image: 'b-0.webp',
        frames: [frame('inn#0_0', 212, 38), frame('inn#1_0', 90, 410), frame('well', ...well)],
      },
    ],
    ...(texels === undefined ? {} : { meta: { texels } }),
  });
  const src = (hd: Atlas): HdSources => ({
    base: [{ key: 'bld_x', type: 'multiatlas', url: 'buildings/bld_x.json', path: 'buildings/' }],
    imageAt: (root, rel) =>
      root === 'hd/' && rel === 'buildings/b-0.webp' ? { width: 4096, height: 2048 } : null,
    atlasAt: (root, rel) => (rel === 'buildings/bld_x.json' ? (root === '' ? bld : hd) : null),
  });

  it('takes its factor from meta.texels, not from the cropped slices, and still measures its whole frames', () => {
    expect(buildHdManifest(src(hdBld(2))).manifest.entries).toEqual([
      { key: 'bld_x', type: 'multiatlas', url: 'buildings/bld_x.json', path: 'buildings/', filter: 'linear' },
    ]);
    expect(buildHdManifest(src(hdBld(2))).manifest.texels).toBe(2);
    expect(() => buildHdManifest(src(hdBld(4)))).toThrow(/frame well is not at factor 4/);
  });

  it('refuses slices with no meta.texels to say their factor', () => {
    const slicesOnly: Atlas = {
      textures: [{ ...hdBld().textures[0]!, frames: hdBld().textures[0]!.frames.slice(0, 2) }],
    };
    expect(() => buildHdManifest(src(slicesOnly))).toThrow(/only slices and no meta.texels/);
  });
});

describe('texelFactor', () => {
  it('is the whole ratio on both axes', () => {
    expect(texelFactor({ width: 256, height: 128 }, { width: 128, height: 64 }, 'x')).toBe(2);
    expect(texelFactor({ width: 128, height: 64 }, { width: 128, height: 64 }, 'x')).toBe(1);
    expect(() => texelFactor({ width: 64, height: 32 }, { width: 128, height: 64 }, 'x')).toThrow();
  });
});
