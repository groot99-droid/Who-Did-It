import { describe, expect, it } from 'vitest';
import { Scene, scenes, type Scene as SceneT } from '../src/index.js';
import { tilemapFor } from '../src/tilemap.js';

// Round 9, 9U (WORLD 4.3): a prop's or building's `rot` is a quarter turn, written to the tilemap for the client.
type Tiled = {
  layers: Array<{
    name: string;
    objects?: Array<{ name: string; properties?: Array<{ name: string; value: unknown }> }>;
  }>;
};
const prop = (map: Tiled, layer: string, name: string, key: string) =>
  map.layers
    .find((l) => l.name === layer)
    ?.objects?.find((o) => o.name === name)
    ?.properties?.find((p) => p.name === key)?.value;

describe('rot', () => {
  it('takes only quarter turns', () => {
    const s = structuredClone(scenes.overworld) as SceneT;
    s.props[0] = { ...s.props[0]!, rot: 90 };
    expect(Scene.safeParse(s).success).toBe(true);
    s.props[0] = { ...s.props[0]!, rot: 45 as never };
    expect(Scene.safeParse(s).success).toBe(false);
  });

  it('is written to the tilemap for a turned prop and building, and left out at 0', () => {
    const s = structuredClone(scenes.overworld) as SceneT;
    s.props[0] = { ...s.props[0]!, rot: 180 };
    s.buildings![0] = { ...s.buildings![0]!, rot: 90 };
    const map = tilemapFor(s) as unknown as Tiled;
    expect(prop(map, 'props', s.props[0]!.id, 'rot')).toBe('180');
    expect(prop(map, 'buildings', s.buildings![0]!.id, 'rot')).toBe('90');
    const plain = tilemapFor(scenes.overworld as SceneT) as unknown as Tiled;
    expect(prop(plain, 'props', s.props[0]!.id, 'rot')).toBeUndefined();
  });
});
