import { describe, expect, it } from 'vitest';
import balance from '@wdi/content/data/balance.json';
import { TIPS } from '../ui/copy/tips';
import {
  loadingPlaylistFor,
  loadingTiming,
  startLoading,
  type LoadingHost,
  type LoadingView,
} from './LoadingScreen';

function fakeHost() {
  let now = 0;
  const timers: Array<{ at: number; every: number | null; fn: () => void; live: boolean }> = [];
  const log: string[] = [];
  const view: LoadingView = {
    show: () => log.push('show'),
    setProgress: (f) => log.push(`progress ${f}`),
    setTip: (t) => log.push(`tip ${t}`),
    remove: () => log.push('remove'),
  };
  const host: LoadingHost = {
    after: (fn, ms) => {
      const t = { at: now + ms, every: null, fn, live: true };
      timers.push(t);
      return () => (t.live = false);
    },
    every: (fn, ms) => {
      const t = { at: now + ms, every: ms, fn, live: true };
      timers.push(t);
      return () => (t.live = false);
    },
    mount: () => {
      log.push('mount');
      return view;
    },
  };
  const tick = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const next = timers.filter((t) => t.live && t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (next === undefined) break;
      now = next.at;
      next.fn();
      if (next.every === null) next.live = false;
      else next.at += next.every;
    }
    now = end;
  };
  return { host, tick, log };
}

const timing = { showAfterMs: 300, tipEveryMs: 4000 };

describe('startLoading', () => {
  it('never shows a load that ends under 300 ms', () => {
    const { host, tick, log } = fakeHost();
    const c = startLoading(host, TIPS, timing);
    tick(299);
    c.destroy();
    tick(10000);
    expect(log).toEqual([]);
  });

  it('shows after 300 ms with the current progress and the first tip', () => {
    const { host, tick, log } = fakeHost();
    const c = startLoading(host, ['a', 'b'], timing, 1);
    c.progress(0.4);
    tick(300);
    expect(log).toEqual(['mount', 'progress 0.4', 'tip b', 'show']);
  });

  it('changes the tip every 4 s, wrapping round, and clamps progress', () => {
    const { host, tick, log } = fakeHost();
    const c = startLoading(host, ['a', 'b'], timing);
    tick(300);
    c.progress(7);
    tick(4000);
    tick(4000);
    expect(log.filter((l) => l.startsWith('tip'))).toEqual(['tip a', 'tip b', 'tip a']);
    expect(log).toContain('progress 1');
  });

  it('stops everything on destroy', () => {
    const { host, tick, log } = fakeHost();
    const c = startLoading(host, ['a', 'b'], timing);
    tick(300);
    c.destroy();
    const n = log.length;
    tick(20000);
    expect(log.slice(n - 1)).toEqual(['remove']);
  });

  it('copes with no tips', () => {
    const { host, tick, log } = fakeHost();
    startLoading(host, [], timing);
    tick(5000);
    expect(log).toEqual(['mount', 'progress 0', 'show']);
  });
});

describe('the balance rows and the tips', () => {
  it('reads the timing from balance.ui.loading', () => {
    expect(loadingTiming()).toEqual({
      showAfterMs: balance.ui.loading.showAfterS * 1000,
      tipEveryMs: balance.ui.loading.tipEveryS * 1000,
    });
    expect(loadingTiming().showAfterMs).toBe(300);
    expect(loadingTiming().tipEveryMs).toBe(4000);
  });

  it('keeps every tip short and free of role tells', () => {
    expect(TIPS.length).toBeGreaterThanOrEqual(6);
    const banned = /\b(killer|cabal|accomplice|herbalist|vicar|impersonat|you are the)/i;
    for (const t of TIPS) {
      expect(t.length).toBeLessThanOrEqual(120);
      expect(t).not.toMatch(banned);
    }
  });

  it('names no loading playlist, so a match load never cuts off the opening piece (A101)', () => {
    expect(loadingPlaylistFor('hollowmere')).toBeNull();
    expect(loadingPlaylistFor('blackpine')).toBeNull();
    expect(loadingPlaylistFor('nowhere')).toBeNull();
  });
});
