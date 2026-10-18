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
    expect(m.portals).toEqual([{ id: 'p1', x: 160, y: 96 }]);
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
