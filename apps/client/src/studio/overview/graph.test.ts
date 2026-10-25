import { describe, expect, it } from 'vitest';
import { maps, scenes, type Scene } from '@wdi/content';
import { CARD, dotOffset, edgeOf, edgesOf, layoutOf, linksOf } from './graph';

const all = scenes as unknown as Record<string, Scene>;
const hm = maps.hollowmere;

describe('linksOf', () => {
  it('lists each portal that leads to a scene of the map, once', () => {
    const links = linksOf(hm.scenes, all);
    expect(links).toContainEqual({ scene: 'bakery', portal: 'bk.door', to: 'overworld', toSpawn: 'bakery' });
    expect(links.every((l) => hm.scenes.includes(l.to as never))).toBe(true);
    expect(new Set(links.map((l) => `${l.scene}/${l.portal}`)).size).toBe(links.length);
  });

  it('leaves out a portal with no target and one into another map', () => {
    expect(linksOf(['cave_entry'], all)).toEqual([]);
    expect(linksOf(['bakery', 'overworld'], all).every((l) => ['bakery', 'overworld'].includes(l.to))).toBe(
      true,
    );
  });
});

describe('layoutOf', () => {
  const links = linksOf(hm.scenes, all);

  it('puts the hub first and every scene on the grid exactly once', () => {
    const l = layoutOf(hm.scenes, hm.hub, links);
    expect(l.source).toBe('auto');
    expect(l.cards.map((c) => c.id).sort()).toEqual([...hm.scenes].sort());
    expect(l.cards.find((c) => c.id === hm.hub)).toMatchObject({ x: 0 });
    const spots = l.cards.map((c) => `${c.x},${c.y}`);
    expect(new Set(spots).size).toBe(spots.length);
  });

  it('places a scene one column past the hub when a door joins them', () => {
    const l = layoutOf(hm.scenes, hm.hub, links);
    expect(l.cards.find((c) => c.id === 'bakery')!.x).toBe(CARD.w + CARD.gapX);
    expect(l.cards.find((c) => c.id === 'crumb_oven')!.x).toBe(2 * (CARD.w + CARD.gapX));
  });

  it('keeps a scene no door reaches, in a last column', () => {
    const l = layoutOf(['overworld', 'bakery', 'barn'], 'overworld', [], undefined);
    expect(l.cards.find((c) => c.id === 'bakery')!.x).toBe(CARD.w + CARD.gapX);
    expect(l.cards).toHaveLength(3);
  });

  it('uses the map file layout only when it places every scene', () => {
    const saved = { overworld: { x: 5, y: 6 }, bakery: { x: 300, y: 40 } };
    const full = layoutOf(['overworld', 'bakery'], 'overworld', [], saved);
    expect(full.source).toBe('map');
    expect(full.cards).toEqual([
      { id: 'overworld', x: 5, y: 6, h: CARD.h },
      { id: 'bakery', x: 300, y: 40, h: CARD.h },
    ]);
    expect(layoutOf(['overworld', 'bakery', 'barn'], 'overworld', [], saved).source).toBe('auto');
  });
});

describe('edgeOf', () => {
  it('runs from the facing sides of two cards', () => {
    const a = { id: 'a', x: 0, y: 0, h: CARD.h };
    const b = { id: 'b', x: 300, y: 100, h: CARD.h };
    expect(edgeOf(a, b)).toEqual({ x1: CARD.w, y1: CARD.h / 2, x2: 300, y2: 100 + CARD.h / 2 });
    expect(edgeOf(b, a)).toEqual({ x1: 300, y1: 100 + CARD.h / 2, x2: CARD.w, y2: CARD.h / 2 });
  });
});

describe('edgesOf', () => {
  const links = linksOf(hm.scenes, all);
  const at = new Map(layoutOf(hm.scenes, hm.hub, links).cards.map((c) => [c.id, c]));

  it('gives every link ending on the same card a dot of its own, inside the card', () => {
    const into = edgesOf(links, at).filter((e) => e.link.to === 'overworld');
    expect(into.length).toBeGreaterThan(5);
    expect(new Set(into.map((e) => e.y2)).size).toBe(into.length);
    const card = at.get('overworld')!;
    for (const e of into) {
      expect(e.y2).toBeGreaterThan(card.y);
      expect(e.y2).toBeLessThan(card.y + card.h);
    }
  });

  it('grows a busy card so its dots do not overlap', () => {
    expect(at.get('overworld')!.h).toBeGreaterThan(CARD.h);
    expect(at.get('widow_bedroom')!.h).toBe(CARD.h);
  });

  it('centres a lone dot and spreads two', () => {
    expect(dotOffset(0, 1)).toBe(0);
    expect(dotOffset(0, 2)).toBe(-dotOffset(1, 2));
  });
});
