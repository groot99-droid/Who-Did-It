import { describe, expect, it } from 'vitest';
import type { AdminSeat } from '@wdi/shared/protocol';
import { AdminStore, MAX_EVENTS, gridCells, gridShape, labelOf, nextOrder, yawOfStep } from './model';
import type { AdminSnapshot } from './AdminNet';

const seat = (id: string, sceneId: string, extra: Partial<AdminSeat> = {}): AdminSeat => ({
  id,
  name: id.toUpperCase(),
  roleId: 'townsfolk',
  look: 'townsfolk',
  sceneId,
  x: 0,
  y: 0,
  dead: false,
  ...extra,
});

const snap = (seats: AdminSeat[], extra: Partial<AdminSnapshot> = {}): AdminSnapshot => ({
  tick: 1,
  phase: 1,
  scale: 1,
  paused: false,
  effectiveScale: 1,
  seats,
  invariants: [],
  ...extra,
});

describe('grid', () => {
  it('divides 1280x720 into 426x360 cells for six viewports', () => {
    const cells = gridCells(['a', 'b', 'c', 'd', 'e', 'f'], 1280, 720);
    expect(cells).toHaveLength(6);
    expect(cells[0]).toEqual({ key: 'a', x: 0, y: 0, w: 426, h: 360 });
    expect(cells[5]).toEqual({ key: 'f', x: 852, y: 360, w: 426, h: 360 });
  });

  it('shows at most six, and a lone scene fills the canvas', () => {
    expect(gridCells(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 1280, 720)).toHaveLength(6);
    expect(gridCells(['a'], 1280, 720)).toEqual([{ key: 'a', x: 0, y: 0, w: 1280, h: 720 }]);
    expect(gridCells([], 1280, 720)).toEqual([]);
  });

  it('picks the shape by count', () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => gridShape(n))).toEqual([
      { cols: 1, rows: 1 },
      { cols: 2, rows: 1 },
      { cols: 2, rows: 2 },
      { cols: 2, rows: 2 },
      { cols: 3, rows: 2 },
      { cols: 3, rows: 2 },
    ]);
  });
});

describe('labels and order', () => {
  it('names a seat, its true role and the look it wears', () => {
    expect(labelOf(seat('a', 'x'))).toBe('A: townsfolk');
    expect(labelOf(seat('k', 'x', { roleId: 'killer', look: 'baker', coverOf: 'killer' }))).toBe(
      'K: killer (as baker)',
    );
    expect(labelOf(seat('d', 'x', { dead: true }))).toBe('D: townsfolk †');
  });

  it('keeps a scene in its slot until it empties', () => {
    const first = nextOrder([], [seat('a', 'bakery'), seat('b', 'chapel')]);
    expect(first).toEqual(['bakery', 'chapel']);
    expect(nextOrder(first, [seat('b', 'chapel'), seat('a', 'chapel'), seat('c', 'barn')])).toEqual([
      'chapel',
      'barn',
    ]);
  });

  it('faces the way a seat steps', () => {
    expect(yawOfStep(0, -1)).toBeCloseTo(0);
    expect(yawOfStep(1, 0)).toBeCloseTo(Math.PI / 2);
  });
});

describe('AdminStore', () => {
  it('queues the seventh scene and swaps it in with pin', () => {
    const store = new AdminStore();
    const scenes = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    store.applySnapshot(snap(scenes.map((s, i) => seat(`s${i}`, s))), 0);
    expect(store.visibleScenes()).toEqual(scenes.slice(0, 6));
    expect(store.queuedScenes()).toEqual(['g']);
    store.pin('g');
    expect(store.visibleScenes()[0]).toBe('g');
    expect(store.queuedScenes()).toEqual(['f']);
  });

  it('collapses the grid to the followed seat’s scene', () => {
    const store = new AdminStore();
    store.applySnapshot(snap([seat('a', 'bakery'), seat('b', 'chapel')]), 0);
    store.follow('b');
    expect(store.visibleScenes()).toEqual(['chapel']);
    store.applySnapshot(snap([seat('a', 'bakery')]), 1);
    expect(store.followed).toBeNull();
  });

  it('keeps invariant failures once, until Reset', () => {
    const store = new AdminStore();
    const failure = { name: 'stuck', tick: 4, detail: 'x' };
    store.addFailure(failure);
    store.applySnapshot(snap([], { invariants: [failure] }), 0);
    expect(store.failures).toHaveLength(1);
    store.reset();
    expect(store.failures).toEqual([]);
  });

  it('caps the event stream', () => {
    const store = new AdminStore();
    store.addEvents(Array.from({ length: MAX_EVENTS + 20 }, (_, i) => ({ tick: i, kind: 'phase' })));
    expect(store.events).toHaveLength(MAX_EVENTS);
    expect(store.events[0]?.tick).toBe(20);
  });
});
