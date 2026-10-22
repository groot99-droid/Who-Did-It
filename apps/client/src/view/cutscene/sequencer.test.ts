import { describe, expect, it } from 'vitest';
import { type TimelineStep, advance, cameraPose, ease, planTimeline } from './sequencer';

const cap = (durationS: number, withPrevious?: boolean): TimelineStep => ({
  t: 'caption',
  durationS,
  withPrevious,
});

describe('planTimeline', () => {
  it('runs steps one after another', () => {
    const tl = planTimeline([cap(2), cap(3), { t: 'wait', durationS: 1 }], 60);
    expect(tl.map((e) => [e.startMs, e.endMs])).toEqual([
      [0, 2000],
      [2000, 5000],
      [5000, 6000],
    ]);
  });

  it('starts a withPrevious step with the entry before it without moving the cursor', () => {
    const tl = planTimeline([cap(2), { t: 'camera', durationS: 9, withPrevious: true }, cap(3)], 60);
    expect(tl.map((e) => [e.startMs, e.endMs])).toEqual([
      [0, 2000],
      [0, 9000],
      [2000, 5000],
    ]);
  });

  it('chains withPrevious steps to the same start, and lets a leading one start at 0', () => {
    const tl = planTimeline(
      [
        { t: 'audio', key: 'a', withPrevious: true },
        cap(2),
        { t: 'audio', key: 'b', withPrevious: true },
        { t: 'audio', key: 'c', withPrevious: true },
      ],
      60,
    );
    expect(tl.map((e) => e.startMs)).toEqual([0, 0, 0, 0]);
  });

  it('takes no time for an instant step', () => {
    const tl = planTimeline([cap(2), { t: 'cardSlam' }, cap(1)], 60);
    expect(tl.map((e) => [e.startMs, e.endMs])).toEqual([
      [0, 2000],
      [2000, 2000],
      [2000, 3000],
    ]);
  });

  it('clamps to maxS and drops what would start after it', () => {
    const tl = planTimeline([cap(4), cap(4), cap(4)], 6);
    expect(tl.map((e) => [e.startMs, e.endMs])).toEqual([
      [0, 4000],
      [4000, 6000],
    ]);
  });

  it('keeps an instant step that lands exactly on maxS, such as the card slam closing an opening', () => {
    const tl = planTimeline([cap(5), { t: 'cardSlam' }], 5);
    expect(tl.map((e) => e.step.t)).toEqual(['caption', 'cardSlam']);
  });

  it('runs a hold to maxS', () => {
    const tl = planTimeline([cap(2), { t: 'hold' }], 8);
    expect(tl[1]).toMatchObject({ startMs: 2000, endMs: 8000 });
  });
});

describe('advance', () => {
  const tl = planTimeline([cap(2), { t: 'camera', durationS: 5, withPrevious: true }, cap(3)], 60);

  it('starts each entry once when the caller passes the last time it asked', () => {
    expect(advance(tl, 0).starting).toHaveLength(2);
    expect(advance(tl, 500, 0).starting).toHaveLength(0);
    expect(advance(tl, 2100, 1900).starting.map((e) => e.startMs)).toEqual([2000]);
  });

  it('lists the running entries and says when everything is over', () => {
    expect(advance(tl, 1000).running).toHaveLength(2);
    expect(advance(tl, 3000).running).toHaveLength(2);
    expect(advance(tl, 4999).done).toBe(false);
    expect(advance(tl, 5000)).toMatchObject({ running: [], done: true });
  });

  it('is done at once for an empty timeline', () => {
    expect(advance([], 0).done).toBe(true);
  });
});

describe('cameraPose', () => {
  const leg = {
    from: { x: 0, y: 10 },
    to: { x: 10, y: 0 },
    zoomFrom: 1,
    zoomTo: 2,
    durationS: 4,
    ease: 'linear' as const,
  };

  it('moves from the first tile to the last and holds there', () => {
    expect(cameraPose(leg, 0)).toEqual({ tx: 0, ty: 10, zoom: 1 });
    expect(cameraPose(leg, 2000)).toEqual({ tx: 5, ty: 5, zoom: 1.5 });
    expect(cameraPose(leg, 9000)).toEqual({ tx: 10, ty: 0, zoom: 2 });
  });

  it('keeps the zoom when a leg gives none', () => {
    expect(cameraPose({ ...leg, zoomFrom: undefined, zoomTo: undefined }, 1000).zoom).toBe(1);
  });
});

describe('ease', () => {
  it('starts at 0, ends at 1 and stays inside', () => {
    for (const kind of ['linear', 'sine', 'quad'] as const) {
      expect(ease(kind, 0)).toBe(0);
      expect(ease(kind, 1)).toBeCloseTo(1);
      expect(ease(kind, 0.5)).toBeCloseTo(0.5);
      expect(ease(kind, -1)).toBe(0);
      expect(ease(kind, 2)).toBeCloseTo(1);
    }
  });
});
