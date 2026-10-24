// The prop art lookup of SPRITES 3 (round 8, 8K): kind, id tail, then the tail without `_<n>`, for one-tile and
// multi-tile props alike, and the `dressing` kind drawn by its tail like `decor`.
import { describe, expect, it } from 'vitest';
import { type DefContext, mapStatics, propStems } from './mapDefs';
import { readSceneMap } from './sceneMap';

const frames = new Set<string>();
const ctx: DefContext = {
  mapId: 'blackpine',
  theme: 'pine',
  hasFrame: (atlas, frame) => frames.has(`${atlas}:${frame}`),
};
const prop = (name: string, type: string, footprint?: string) => ({
  name,
  type,
  x: 64,
  y: 64,
  width: 64,
  height: 64,
  properties: footprint ? [{ name: 'footprint', value: footprint }] : [],
});
const statics = (...props: ReturnType<typeof prop>[]) =>
  mapStatics(
    readSceneMap({
      orientation: 'isometric',
      width: 20,
      height: 20,
      properties: [
        { name: 'theme', value: 'pine' },
        { name: 'map', value: 'blackpine' },
      ],
      layers: [{ name: 'props', type: 'objectgroup', objects: props }],
    }),
    ctx,
  );

describe('propStems', () => {
  it('is the kind, the id tail, then the tail without a trailing number', () => {
    expect(propStems('decor', 'bw.kiln_1')).toEqual(['decor', 'kiln_1', 'kiln']);
    expect(propStems('pump', 'bc.pump')).toEqual(['pump']);
    expect(propStems('decor', 'bl.bunks_n')).toEqual(['decor', 'bunks_n']);
  });
});

describe('mapStatics: the prop lookup order (SPRITES 3)', () => {
  it('draws a one-tile prop by its numbered tail, then by its stem', () => {
    frames.clear();
    frames.add('props_blackpine:prop_ore_cart');
    expect(statics(prop('bm.ore_cart_0', 'decor'))[0]).toMatchObject({ frame: 'prop_ore_cart' });
    frames.add('props_blackpine:prop_ore_cart_0');
    expect(statics(prop('bm.ore_cart_0', 'decor'))[0]).toMatchObject({ frame: 'prop_ore_cart_0' });
  });

  it('slices a multi-tile decor prop by its id tail, and a numbered one by its stem', () => {
    frames.clear();
    frames.add('props_blackpine:prop_forge#0_0');
    frames.add('props_blackpine:prop_kiln#0_0');
    const forge = statics(prop('bf.forge', 'decor', '6,1,3,1'));
    expect(forge.map((d) => d.frame)).toEqual(['prop_forge#0_0', 'prop_forge#1_0', 'prop_forge#2_0']);
    const kiln = statics(prop('bw.kiln_1', 'decor', '2,2,2,2'));
    expect(kiln).toHaveLength(4);
    expect(kiln[3]!.frame).toBe('prop_kiln#1_1');
  });

  it('draws dressing by its tail like decor, and nothing when the art is missing', () => {
    frames.clear();
    frames.add('props_blackpine:prop_sawhorse');
    expect(statics(prop('bs.sawhorse_2', 'dressing'))[0]).toMatchObject({
      atlas: 'props_blackpine',
      frame: 'prop_sawhorse',
    });
    expect(statics(prop('bs.crate_9', 'dressing'))).toEqual([]);
  });
});
