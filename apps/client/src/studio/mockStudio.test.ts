import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StudioLink, StudioSnapshot } from '../admin/StudioNet';
import { createMockStudio } from './mockStudio';

describe('mockStudio', () => {
  let link: StudioLink | null = null;
  afterEach(() => {
    link?.close();
    vi.useRealTimers();
  });

  const run = () => {
    vi.useFakeTimers();
    link = createMockStudio();
    let last: StudioSnapshot | null = null;
    const refused: string[] = [];
    link.bus.on('snapshot', (s) => (last = s));
    link.bus.on('refused', (m) => refused.push(m));
    return { link, last: () => last as StudioSnapshot | null, refused };
  };

  it('walks, flips noclip and teleports to a spawn of a scene', () => {
    const t = run();
    t.link.send('studio.move', { seq: 1, dx: 1, dy: 0 });
    t.link.send('studio.noclip', { on: true });
    vi.advanceTimersByTime(200);
    expect(t.last()?.moving).toBe(true);
    expect(t.last()?.noclip).toBe(true);
    t.link.send('studio.teleport', { sceneId: 'bakery', spawnId: 'door' });
    vi.advanceTimersByTime(50);
    expect(t.last()?.sceneId).toBe('bakery');
  });

  it('refuses a scene that does not exist', () => {
    const t = run();
    t.link.send('studio.teleport', { sceneId: 'nowhere', spawnId: 'x' });
    expect(t.refused).toEqual(['no such scene']);
  });

  it('pauses, spawns, gives and clears', () => {
    const t = run();
    t.link.send('studio.clock', { paused: true });
    t.link.send('studio.spawn', { kind: 'mob', ref: 'wolf' });
    t.link.send('studio.give', { itemId: 'knife' });
    vi.advanceTimersByTime(50);
    const frozen = t.last()?.tick;
    vi.advanceTimersByTime(200);
    expect(t.last()?.tick).toBe(frozen);
    expect(t.last()?.spawns).toHaveLength(1);
    expect(t.last()?.items).toEqual(['knife']);
    t.link.send('studio.clearSpawns', {});
    vi.advanceTimersByTime(50);
    expect(t.last()?.spawns).toEqual([]);
  });
});
