import { describe, expect, it } from 'vitest';
import {
  content,
  DEFAULT_MAP,
  MAP_IDS,
  mapIdOf,
  mapOf,
  maps,
  SCENE_IDS,
  scenes,
  validateContent,
  type Content,
  type Scene,
} from '../src/index.js';

function broken(edit: (c: Content) => void): string[] {
  const copy = structuredClone(content);
  edit(copy);
  return validateContent(copy);
}
const hit = (text: string) => expect.arrayContaining([expect.stringContaining(text)]);

/** A material layer that agrees with the grid: planks on floor, walls on solid, `P` under props on walls. */
const materialOf = (scene: Scene): string[] =>
  scene.grid.map((row, y) =>
    [...row]
      .map((ch, x) => {
        if (ch === '.' || ch === 'S') return 'w';
        return ch === '#' && scene.props.some((p) => p.x === x && p.y === y) ? 'P' : 'W';
      })
      .join(''),
  );

describe('maps and frozen ids (GDD 3.13, WORLD 4.3)', () => {
  it('keeps the 15 scene ids of 2026-10-10 first and in order', () => {
    expect(SCENE_IDS.slice(0, 15)).toEqual([
      'overworld',
      'tavern_bar',
      'tavern_back',
      'apoth_shop',
      'apoth_loft',
      'widow_parlour',
      'widow_bedroom',
      'forest',
      'bakery',
      'cave_entry',
      'manor_hall',
      'manor_upper',
      'barn',
      'chapel',
      'cellar',
    ]);
  });

  it('ships Hollowmere first, the default map, with the overworld as its hub', () => {
    expect(MAP_IDS[0]).toBe('hollowmere');
    expect(DEFAULT_MAP).toBe('hollowmere');
    expect(maps.hollowmere.hub).toBe('overworld');
    expect(maps.hollowmere.bell).toBe('ov.bell');
    expect(mapOf('cellar')).toBe('hollowmere');
    expect(mapIdOf('nowhere')).toBe('hollowmere');
  });

  it('puts every scene in exactly one map', () => {
    const listed = MAP_IDS.flatMap((id) => maps[id].scenes);
    expect([...listed].sort()).toEqual([...SCENE_IDS].sort());
  });

  it('refuses a map without a Small cave', () => {
    expect(broken((c) => (c.scenes.cave_entry.biome = 'house'))).toEqual(
      hit('map hollowmere: has no cave scene'),
    );
  });

  it('refuses a portal that leaves its map, and a scene in no map', () => {
    const errors = broken((c) => {
      c.maps.hollowmere.scenes = c.maps.hollowmere.scenes.filter((s) => s !== 'cellar');
    });
    expect(errors).toEqual(hit('portal ov.well leaves the map for cellar'));
    expect(errors).toEqual(hit('scene cellar belongs to no map'));
  });

  it('refuses a scene unreachable from the hub', () => {
    expect(
      broken((c) => {
        c.scenes.overworld.portals = c.scenes.overworld.portals.filter((p) => p.id !== 'ov.widow');
      }),
    ).toEqual(hit('widow_parlour is unreachable from the hub at small'));
  });

  it('refuses too few start spawns and a bell that is not a bell', () => {
    const errors = broken((c) => {
      c.maps.hollowmere.startSpawns = c.maps.hollowmere.startSpawns.slice(0, 9);
      c.maps.hollowmere.bell = 'ov.pump';
    });
    expect(errors).toEqual(hit('startSpawns has 9, needs 10'));
    expect(errors).toEqual(hit('bell ov.pump has kind pump, expected bell'));
  });

  it('refuses a duplicate scene prefix', () => {
    expect(broken((c) => (c.scenes.cellar.prefix = 'ch'))).toEqual(hit('prefix ch is also'));
  });
});

describe('scene world fields (GDD 3.13)', () => {
  it('requires every cave to be dark', () => {
    expect(broken((c) => (c.scenes.cave_entry.dark = false))).toEqual(
      hit('scene cave_entry: a cave scene must be dark'),
    );
  });

  it('keeps building doors on the south or east face', () => {
    expect(
      broken((c) => {
        // The real tavern grown to 13 x 8: its front door is left inside the footprint, off the south row.
        const tavern = c.scenes.overworld.buildings!.find((b) => b.id === 'ov.bld_tavern')!;
        tavern.footprint = { x: 25, y: 28, w: 13, h: 8 };
      }),
    ).toEqual(hit('door ov.tavern_front is not on the south or east face of ov.bld_tavern'));
  });

  it('checks the material layer against the grid', () => {
    expect(broken((c) => (c.scenes.widow_bedroom.material = materialOf(c.scenes.widow_bedroom)))).toEqual([]);
    const floor = (s: Scene) => {
      const y = s.grid.findIndex((row) => row.includes('.'));
      return { x: s.grid[y]!.indexOf('.'), y };
    };
    expect(
      broken((c) => {
        const s = c.scenes.widow_bedroom;
        const m = materialOf(s);
        const { x, y } = floor(s);
        m[y] = m[y]!.slice(0, x) + 'T' + m[y]!.slice(x + 1);
        s.material = m;
      }),
    ).toEqual(hit('material "T" at'));
    expect(
      broken((c) => {
        const s = c.scenes.widow_bedroom;
        const m = materialOf(s);
        m[0] = 'P' + m[0]!.slice(1);
        s.material = m;
      }),
    ).toEqual(hit('material at 0,0 must be "P" exactly where'));
  });

  it('keeps lights, nodes, spawners and givers in their scene', () => {
    const errors = broken((c) => {
      const forest = c.scenes.forest;
      const corner = forest.paths[0]!.points[0]!;
      forest.spawners = [{ id: 'fo.sp_wolf', mob: 'wolf', ...corner, leashTiles: 6, pathId: 'fo.nowhere' }];
      forest.lights = [{ id: 'zz.lt_moon', kind: 'moon', x: 1, y: 1, radiusTiles: 4 }];
    });
    expect(errors).toEqual(hit('spawner fo.sp_wolf walks unknown path fo.nowhere'));
    expect(errors).toEqual(hit('light zz.lt_moon lacks prefix fo.'));
  });

  it('has a forest and a cave open at Small in every map', () => {
    for (const id of MAP_IDS) {
      const small = maps[id].scenes.map((s) => scenes[s]).filter((s) => s.profile === 'small');
      expect(
        small.some((s) => s.biome === 'forest'),
        id,
      ).toBe(true);
      expect(
        small.some((s) => s.biome === 'cave' && s.dark === true),
        id,
      ).toBe(true);
    }
  });
});
