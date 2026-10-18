import { describe, expect, it } from 'vitest';
import { readSceneMap } from './sceneMap';

const base = {
  width: 6,
  height: 4,
  layers: [{ name: 'portals', type: 'objectgroup', objects: [{ name: 'p1', x: 128, y: 64 }] }],
};

describe('readSceneMap', () => {
  it('reads the size and puts a portal on its tile centre', () => {
    const m = readSceneMap({ ...base, properties: [{ name: 'kind', value: 'exterior' }] });
    expect(m).toMatchObject({ w: 6, h: 4, voidColour: 'slate', dark: false });
    expect(m.portals).toEqual([{ id: 'p1', x: 160, y: 96, kind: '', face: null, inBuilding: false }]);
  });
  it("uses ink for an interior and the file's own void and dark flag when present", () => {
    expect(readSceneMap({ ...base, properties: [{ name: 'kind', value: 'interior' }] }).voidColour).toBe(
      'ink',
    );
    const cave = readSceneMap({
      ...base,
      properties: [
        { name: 'kind', value: 'exterior' },
        { name: 'void', value: 'ink' },
        { name: 'dark', value: true },
      ],
    });
    expect(cave.voidColour).toBe('ink');
    expect(cave.dark).toBe(true);
  });
  it('has no portals when the layer is missing', () => {
    expect(readSceneMap({ width: 2, height: 2 }).portals).toEqual([]);
  });
});

describe('readSceneMap, isometric files (SPRITES 10.12)', () => {
  const iso = {
    orientation: 'isometric',
    width: 2,
    height: 2,
    properties: [
      { name: 'theme', value: 'harbour' },
      { name: 'map', value: 'hollowmere' },
      { name: 'kind', value: 'exterior' },
    ],
    layers: [
      { name: 'ground', type: 'tilelayer', data: [1, 2, 3, 0] },
      { name: 'blend_1', type: 'tilelayer', data: [0, 0, 0, 0] },
      {
        name: 'solids',
        type: 'objectgroup',
        objects: [
          { name: '1,1', type: 'wall/full/2', x: 64, y: 64, properties: [{ name: 'occluder', value: true }] },
        ],
      },
      {
        name: 'props',
        type: 'objectgroup',
        objects: [
          {
            name: 'ov.pump',
            type: 'pump',
            x: 0,
            y: 64,
            properties: [{ name: 'footprint', value: '0,1,1,2' }],
          },
        ],
      },
      {
        name: 'portals',
        type: 'objectgroup',
        objects: [
          {
            name: 'p',
            type: 'door',
            x: 0,
            y: 0,
            properties: [
              { name: 'face', value: 's' },
              { name: 'inBuilding', value: true },
            ],
          },
        ],
      },
    ],
  };
  it('reads the layers, the objects and their properties', () => {
    const m = readSceneMap(iso);
    expect(m).toMatchObject({
      isometric: true,
      theme: 'harbour',
      mapId: 'hollowmere',
      ground: [1, 2, 3, 0],
      blend1: [0, 0, 0, 0],
      blend2: [],
    });
    expect(m.solids[0]).toMatchObject({ type: 'wall/full/2', x: 64, y: 64, props: { occluder: true } });
    expect(m.props[0]!.props.footprint).toBe('0,1,1,2');
    expect(m.portals[0]).toMatchObject({ face: 's', inBuilding: true, kind: 'door' });
  });
  it('ignores a tile layer of the wrong size and treats an orthogonal file as legacy', () => {
    const bad = readSceneMap({ ...iso, layers: [{ name: 'ground', type: 'tilelayer', data: [1] }] });
    expect(bad.ground).toEqual([]);
    expect(readSceneMap({ ...iso, orientation: 'orthogonal' }).isometric).toBe(false);
  });
});
