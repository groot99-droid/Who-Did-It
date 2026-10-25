import { describe, expect, it, vi } from 'vitest';
import { SCENE_IDS } from '@wdi/content';
import type { StudioSnapshot } from '../admin/StudioNet';
import {
  filterIds,
  LOG_LINES,
  moveOf,
  moveToSend,
  spawnsOf,
  STUDIO_LISTS,
  statusOf,
  StudioStore,
} from './model';

const snap = (over: Partial<StudioSnapshot> = {}): StudioSnapshot => ({
  tick: 7,
  sceneId: 'bakery',
  profile: 'large',
  x: 100,
  y: 120,
  tx: 3,
  ty: 4,
  yaw: 0,
  moving: false,
  noclip: false,
  scale: 1,
  paused: false,
  time: { phase: 'day', t: 0.5 },
  spawns: [],
  items: [],
  ...over,
});

describe('StudioStore', () => {
  it('keeps the newest snapshot and a refusal until the next command goes out', () => {
    const s = new StudioStore();
    const seen = vi.fn();
    s.bus.on('change', seen);
    s.refuse('cannot stand there');
    s.applySnapshot(snap());
    expect(s.snapshot?.tick).toBe(7);
    expect(s.refused).toBe('cannot stand there');
    s.clearRefusal();
    expect(s.refused).toBe('');
    s.clearRefusal();
    expect(seen).toHaveBeenCalledTimes(3);
  });

  it('keeps the last 50 log lines', () => {
    const s = new StudioStore();
    s.addLog(Array.from({ length: 40 }, (_, i) => `a${i}`));
    s.addLog(Array.from({ length: 40 }, (_, i) => `b${i}`));
    expect(s.log).toHaveLength(LOG_LINES);
    expect(s.log[0]).toBe('a30');
    expect(s.log.at(-1)).toBe('b39');
  });

  it('forgets everything on reset', () => {
    const s = new StudioStore();
    s.applySnapshot(snap());
    s.addLog(['x']);
    s.reset();
    expect([s.snapshot, s.log, s.refused]).toEqual([null, [], '']);
  });
});

describe('pickers', () => {
  it('filters ids case-insensitively', () => {
    expect(filterIds(['bakery', 'bp_camp', 'Barn'], 'BA')).toEqual(['bakery', 'Barn']);
    expect(filterIds(['a', 'b'], '  ')).toEqual(['a', 'b']);
  });

  it('lists every frozen scene id, in order, and the spawns of one', () => {
    expect(STUDIO_LISTS.scenes).toEqual([...SCENE_IDS]);
    expect(spawnsOf('bakery')).toContain('door');
    expect(spawnsOf('nowhere')).toEqual([]);
  });

  it('offers mobs, townsfolk, looks and items from the content', () => {
    expect(STUDIO_LISTS.mob).toContain('wolf');
    expect(STUDIO_LISTS.townsfolk).toContain('clerk');
    expect(STUDIO_LISTS.look.length).toBeGreaterThan(0);
    expect(STUDIO_LISTS.items).toContain('knife');
  });
});

describe('moveOf', () => {
  it('is still with no key held', () => {
    expect(moveOf(new Set())).toEqual({ dx: 0, dy: 0, sprint: false });
  });

  it('turns screen keys into a world-frame vector and sprints on shift or space', () => {
    const m = moveOf(new Set(['KeyD', 'ShiftLeft']));
    expect(m.sprint).toBe(true);
    expect(Math.hypot(m.dx, m.dy)).toBeGreaterThan(0);
    expect(moveOf(new Set(['Space'])).sprint).toBe(true);
    const opposite = moveOf(new Set(['KeyD', 'KeyA']));
    expect(opposite.dx).toBeCloseTo(0);
    expect(opposite.dy).toBeCloseTo(0);
  });
});

describe('statusOf', () => {
  it('fills the line and is empty before the first snapshot', () => {
    expect(statusOf(snap(), '{scene} {tx},{ty} #{tick}')).toBe('bakery 3,4 #7');
    expect(statusOf(null, '{scene}')).toBe('');
  });
});

describe('moveToSend', () => {
  const held = { dx: 1, dy: 0, sprint: false };
  const still = { dx: 0, dy: 0, sprint: false };

  it('resends a held vector every tick, so the room never sees 250 ms of silence', () => {
    const first = moveToSend(held, '');
    expect(first.send).toBe(true);
    expect(moveToSend(held, first.sig).send).toBe(true);
  });

  it('sends one stop when the keys come up, then nothing while still', () => {
    const walking = moveToSend(held, '').sig;
    const stop = moveToSend(still, walking);
    expect(stop.send).toBe(true);
    expect(moveToSend(still, stop.sig).send).toBe(false);
  });
});
