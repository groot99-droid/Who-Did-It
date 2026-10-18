import mitt from 'mitt';
import { describe, expect, it } from 'vitest';
import onubBalance from '@wdi/content/data/balance.onub.json';
import onubRoles from '@wdi/content/data/roles.onub.json';
import type { OnubBoardView, OnubFeed, OnubFeedEvents } from '../../net/onub';
import { narratorLine, Narrator, NightSound, type NightAudioOut } from './NightView';

const board = (window: string): OnubBoardView => ({
  seats: [],
  deck: [],
  piles: {},
  ruinWeight: 0,
  ruined: false,
  perk: false,
  cloche: '',
  window,
});

function page() {
  const bus = mitt<OnubFeedEvents>();
  const keys: string[] = [];
  const timers: Array<() => void> = [];
  let current = '';
  const feed = { bus, board: () => board(current) } as unknown as OnubFeed;
  const out: NightAudioOut = {
    play: (k) => keys.push(`play ${k}`),
    playLoop: (k) => keys.push(`loop ${k}`),
    stopLoop: (k) => keys.push(`stop ${k}`),
  };
  const sound = new NightSound(feed, out, {
    rand: () => 0.5,
    setTimer: (fn) => timers.push(fn),
    clearTimer: () => undefined,
  });
  const setWindow = (w: string) => {
    current = w;
    bus.emit('board', board(w));
  };
  return { bus, keys, sound, setWindow };
}

const SEQUENCE = onubBalance.windows.slice(0, 4).flatMap((w) => [w.role, '']);

describe('night audio (invariant O9)', () => {
  it('a nightWake, nightReveal or nightSleep starts no audio key', () => {
    const p = page();
    const before = [...p.keys];
    p.bus.emit('nightWake', {
      windowRole: 'chef',
      endsTick: 99,
      view: { mates: [], seen: [], alone: false, cloche: '', legal: [], must: false },
    });
    p.bus.emit('nightReveal', { entries: [] });
    p.bus.emit('nightSleep', {});
    expect(p.keys).toEqual(before);
  });

  it('a waking page and a sleeping page fed the same window sequence start the same keys', () => {
    const sleeper = page();
    const waker = page();
    for (const w of SEQUENCE) {
      sleeper.setWindow(w);
      if (w === 'champignon') {
        waker.bus.emit('nightWake', {
          windowRole: w,
          endsTick: 9,
          view: { mates: ['x'], seen: [], alone: false, cloche: '', legal: [], must: false },
        });
        waker.bus.emit('nightReveal', { entries: [] });
      }
      waker.setWindow(w);
      if (w === '') waker.bus.emit('nightSleep', {});
    }
    expect(waker.keys).toEqual(sleeper.keys);
    expect(sleeper.keys.filter((k) => k === 'play door_open')).toHaveLength(SEQUENCE.length / 2);
  });

  it('keeps the storm bed under the narrator and stops it on destroy', () => {
    const p = page();
    expect(p.keys[0]).toBe('loop storm');
    p.sound.destroy();
    expect(p.keys.at(-1)).toBe('stop storm');
  });
});

describe('narrator', () => {
  it('has a wake and a sleep line for every window of the deck', () => {
    for (const w of onubBalance.windows) {
      expect(narratorLine(w.role, 'wake'), w.role).toBeTruthy();
      expect(narratorLine(w.role, 'sleep'), w.role).toBeTruthy();
    }
  });

  it('names no role that has no window', () => {
    expect(narratorLine('croissant', 'wake')).toBeNull();
    expect(Object.keys(onubRoles.roles)).toContain('croissant');
  });

  it('calls the window, closes it through the fade, then goes quiet only before the first window', () => {
    const n = new Narrator();
    expect(n.line('')).toBeNull();
    expect(n.line('boulanger')).toBe(narratorLine('boulanger', 'wake'));
    expect(n.line('')).toBe(narratorLine('boulanger', 'sleep'));
    expect(n.line('')).toBe(narratorLine('boulanger', 'sleep'));
    expect(n.line('champignon')).toBe(narratorLine('champignon', 'wake'));
  });
});
