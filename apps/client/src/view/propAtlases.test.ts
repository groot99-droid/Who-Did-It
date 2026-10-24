// The atlases a prop is looked up in (round 8, 8J, SPRITES 3): `props_<mapId>`, then `bld_<mapId>` (the
// single-tile props that pack into the building atlas's last page, BLD_PROPS_MAPS), then the shared `props`.
import { describe, expect, it } from 'vitest';
import { type DefContext, mapStatics, propAtlases } from './mapDefs';
import { readSceneMap } from './sceneMap';

const frames = new Set<string>();
const ctx: DefContext = {
  mapId: 'hollowmere',
  theme: 'harbour',
  hasFrame: (atlas, frame) => frames.has(`${atlas}:${frame}`),
};
const draw = (name: string, type: string) =>
  mapStatics(
    readSceneMap({
      orientation: 'isometric',
      width: 20,
      height: 20,
      properties: [
        { name: 'theme', value: 'harbour' },
        { name: 'map', value: 'hollowmere' },
      ],
      layers: [
        {
          name: 'props',
          type: 'objectgroup',
          objects: [{ name, type, x: 64, y: 64, width: 64, height: 64, properties: [] }],
        },
      ],
    }),
    ctx,
  );

describe('propAtlases', () => {
  it("is the map's props atlas, its building atlas, then the shared props", () => {
    expect(propAtlases(ctx)).toEqual(['props_hollowmere', 'bld_hollowmere', 'props']);
  });

  it('draws a prop from the building atlas when only it has the frame', () => {
    frames.clear();
    frames.add('bld_hollowmere:prop_bookcase');
    frames.add('props:prop_bookcase');
    expect(draw('mh.bookcase_3', 'dressing')[0]).toMatchObject({
      atlas: 'bld_hollowmere',
      frame: 'prop_bookcase',
    });
  });

  it("prefers the map's props atlas over the building atlas", () => {
    frames.clear();
    frames.add('bld_hollowmere:prop_bookcase');
    frames.add('props_hollowmere:prop_bookcase');
    expect(draw('mh.bookcase_3', 'dressing')[0]).toMatchObject({
      atlas: 'props_hollowmere',
      frame: 'prop_bookcase',
    });
  });
});
