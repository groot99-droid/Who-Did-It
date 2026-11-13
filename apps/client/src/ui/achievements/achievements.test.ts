import mitt from 'mitt';
import { content } from '@wdi/content';
import { beforeEach, describe, expect, it } from 'vitest';
import type { NetEvents } from '../../net/NetworkService';
import { FakeNode, installFakeDom } from '../main/fakeDom';
import { mountAchievements } from './AchievementsLayer';
import { treeRows } from './model';
import { ACHV_KEY, markEarned, readEarned } from './store';

class Mem {
  data = new Map<string, string>();
  getItem = (k: string) => this.data.get(k) ?? null;
  setItem = (k: string, v: string) => void this.data.set(k, v);
}

describe('the device record', () => {
  it('keeps what is earned once, with its day', () => {
    const s = new Mem();
    expect(markEarned('oddJobs', s, new Date('2026-11-06T10:00:00Z'))).toBe(true);
    expect(markEarned('oddJobs', s, new Date('2026-11-09T10:00:00Z'))).toBe(false);
    expect(readEarned(s)).toEqual({ oddJobs: '2026-11-06' });
  });

  it('reads an empty, broken or blocked store as nothing earned', () => {
    const s = new Mem();
    expect(readEarned(s)).toEqual({});
    s.data.set(ACHV_KEY, '{not json');
    expect(readEarned(s)).toEqual({});
    s.data.set(ACHV_KEY, '[1,2]');
    expect(readEarned(s)).toEqual({});
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readEarned(blocked)).toEqual({});
    expect(markEarned('oddJobs', blocked)).toBe(true);
    expect(readEarned(undefined)).toEqual({});
  });
});

describe('the tree', () => {
  it('locks a node until everything it grows from is earned', () => {
    const find = (earned: Record<string, string>, id: string) =>
      treeRows(content.achievements, earned)
        .flatMap((t) => t.rows)
        .find((r) => r.id === id)!;
    expect(find({}, 'oddJobs').state).toBe('open');
    expect(find({}, 'steadyHands').state).toBe('locked');
    expect(find({ oddJobs: '2026-11-06' }, 'steadyHands').state).toBe('open');
    expect(find({ oddJobs: '2026-11-06' }, 'oddJobs').state).toBe('earned');
    // A join needs both of its parents.
    expect(find({ paidUp: 'x' }, 'sureEnough').state).toBe('locked');
    expect(find({ paidUp: 'x', hauler: 'x' }, 'sureEnough').state).toBe('open');
  });
});

describe('the toasts', () => {
  let root: () => FakeNode;
  beforeEach(() => {
    root = installFakeDom();
    (globalThis as unknown as { localStorage: unknown }).localStorage = new Mem();
  });

  it('shows a step small and an achievement earned, and records only the earned one', () => {
    const bus = mitt<NetEvents>();
    const parent = root();
    mountAchievements(
      parent as unknown as HTMLElement,
      { bus },
      (id) => (id === 'fullDay' ? 'A Full Day' : undefined),
      10,
    );
    bus.emit('achv', { id: 'fullDay', step: 1, steps: 3, done: false });
    expect(parent.byTestId('achv-toast')?.content).toBe('A Full Day: step 1 of 3');
    expect(readEarned()).toEqual({});
    bus.emit('achv', { id: 'fullDay', step: 3, steps: 3, done: true });
    expect(Object.keys(readEarned())).toEqual(['fullDay']);
  });
});
