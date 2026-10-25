import { describe, expect, it } from 'vitest';
import { SCENE_IDS, scenes } from '@wdi/content';
import {
  footprints,
  hiddenAtProfile,
  idLabels,
  lightRings,
  OVERLAYS,
  solidTiles,
  visionTiles,
  walkLinks,
} from './overlayData';

describe('collision and nav overlays', () => {
  it('lists the solid tiles of a scene and fewer of them when a gate opens with the profile', () => {
    const small = solidTiles('overworld', 'small');
    const large = solidTiles('overworld', 'large');
    expect(small.length).toBeGreaterThan(large.length);
    expect(large.length).toBeGreaterThan(0);
  });

  it('puts every solid tile inside its scene', () => {
    for (const id of SCENE_IDS) {
      const { w, h } = scenes[id].size;
      for (const t of solidTiles(id, 'large')) {
        expect(t.x).toBeLessThan(w);
        expect(t.y).toBeLessThan(h);
      }
    }
  });

  it('links only walkable neighbours and never across a wall', () => {
    const solid = new Set(solidTiles('bakery', 'large').map((t) => `${t.x},${t.y}`));
    const links = walkLinks('bakery', 'large');
    expect(links.length).toBeGreaterThan(0);
    for (const [a, b] of links) {
      expect(solid.has(`${a.x},${a.y}`)).toBe(false);
      expect(solid.has(`${b.x},${b.y}`)).toBe(false);
      expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1);
    }
  });
});

describe('id, light and footprint overlays', () => {
  it('labels props, portals, spawns, spots and lights with their frozen ids', () => {
    const labels = idLabels('bakery');
    const kinds = new Set(labels.map((l) => l.kind));
    expect(kinds).toEqual(new Set(['prop', 'portal', 'spawn', 'spot', 'light']));
    expect(labels.find((l) => l.id === 'bk.door')?.kind).toBe('portal');
  });

  it('rings every light with its radius', () => {
    expect(lightRings('bakery')).toContainEqual({ id: 'bk.lt_lamp_table', x: 5, y: 5, r: 2.5 });
  });

  it('gives a multi-tile prop its footprint', () => {
    expect(footprints('bakery')).toContainEqual({ id: 'bk.wake_table', x: 6, y: 4, w: 5, h: 2 });
  });
});

describe('sight and gating overlays', () => {
  it('sees farther by day than by night', () => {
    expect(visionTiles('day')).toBeGreaterThan(visionTiles('night'));
    expect(visionTiles('dawn')).toBe(visionTiles('day'));
  });

  it('shows what a profile hides, and nothing at large for an object open at every profile', () => {
    const smallHides = hiddenAtProfile('overworld', 'small').length;
    expect(smallHides).toBeGreaterThan(0);
    expect(hiddenAtProfile('overworld', 'large').every((h) => !h.hiddenAt.includes('large'))).toBe(true);
    expect(hiddenAtProfile('bakery', 'large')).toEqual([]);
  });

  it('names the overlays once each', () => {
    expect(new Set(OVERLAYS).size).toBe(OVERLAYS.length);
  });
});
