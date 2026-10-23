import { describe, expect, it } from 'vitest';
import { content, maps, scenes, validateContent, type Content } from '../src/index.js';

function broken(edit: (c: Content) => void): string[] {
  const copy = structuredClone(content);
  edit(copy);
  return validateContent(copy);
}
const hit = (text: string) => expect.arrayContaining([expect.stringContaining(text)]);

describe('the Daily Train station (GDD 3.3, WORLD 4.3, round 7)', () => {
  it("is a walkable spawn of Hollowmere's hub on the platform planks beside the rail spur", () => {
    expect(validateContent(content)).toEqual([]);
    expect(maps.hollowmere.station).toBe('overworld.platform');
    const ow = scenes.overworld;
    const spawn = ow.spawns.find((s) => s.id === 'platform')!;
    expect(ow.grid[spawn.y]?.[spawn.x]).toBe('S');
    expect(ow.material?.[spawn.y]?.[spawn.x]).toBe('w');
    expect(ow.material?.[spawn.y]?.[spawn.x + 2]).toBe('=');
    expect(ow.lights?.some((l) => l.id === 'ov.lt_platform')).toBe(true);
  });

  it('has no station on Blackpine, so Blackpine has no Train', () => {
    expect(maps.blackpine.station).toBeUndefined();
  });

  it('refuses a station that is not a spawn of the hub', () => {
    expect(broken((c) => (c.maps.hollowmere.station = 'overworld.nowhere'))).toEqual(
      hit('station overworld.nowhere is not a spawn of the hub'),
    );
    expect(broken((c) => (c.maps.hollowmere.station = 'barn.door'))).toEqual(
      hit('station barn.door is not a spawn of the hub'),
    );
  });
});
