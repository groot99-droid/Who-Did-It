import { describe, expect, it } from 'vitest';
import { navs, SCENE_IDS, scenes } from '../src/index.js';

describe('nav bitmaps', () => {
  it('exist for every scene and match its grid', () => {
    for (const id of SCENE_IDS) {
      const scene = scenes[id];
      const nav = navs[id];
      expect(nav.w, id).toBe(scene.size.w);
      expect(nav.h, id).toBe(scene.size.h);
      expect(nav.tile).toBe(64);
      scene.grid.forEach((row, y) =>
        [...row].forEach((ch, x) => {
          const solid = '#DHB'.includes(ch) ? '1' : '0';
          expect(nav.solid[y]?.[x], `${id} ${x},${y}`).toBe(solid);
        }),
      );
      expect(nav.gates.map((g) => g.id)).toEqual(scene.gates.map((g) => g.id));
    }
  });
});
