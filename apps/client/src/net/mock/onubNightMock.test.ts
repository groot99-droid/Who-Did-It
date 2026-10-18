import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import onubBalance from '@wdi/content/data/balance.onub.json';
import { MockOnubFeed } from './onubMock';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', globalThis);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const toNight = (feed: MockOnubFeed) => {
  feed.start();
  vi.advanceTimersByTime(onubBalance.timers.prepS * 1000 + 1);
  vi.advanceTimersByTime(onubBalance.timers.prepRevealS * 1000 + 1);
};

describe('mock night', () => {
  it('runs every window of the deck in order and publishes the window on the board', () => {
    const feed = new MockOnubFeed({ search: '' });
    const seen: string[] = [];
    feed.bus.on('board', (b) => {
      if (seen.at(-1) !== b.window) seen.push(b.window);
    });
    toNight(feed);
    vi.advanceTimersByTime(200_000);
    const deck = onubBalance.windows.filter((w) => feed.board().deck.includes(w.role)).map((w) => w.role);
    expect(seen.filter((w) => w !== '' && deck.includes(w))).toEqual(deck);
    feed.dispose();
  });

  it('wakes the self seat in its own window only, with a legal act list and a sleep after', () => {
    const feed = new MockOnubFeed({ search: '?role=aboyeur' });
    const log: string[] = [];
    feed.bus.on('nightWake', (w) => log.push(`wake ${w.windowRole}`));
    feed.bus.on('nightSleep', () => log.push('sleep'));
    toNight(feed);
    vi.advanceTimersByTime(200_000);
    expect(log).toEqual(['wake aboyeur', 'sleep']);
    feed.dispose();
  });

  it('shows the other Spore as a mate at the Champignon window', () => {
    const feed = new MockOnubFeed({ search: '?role=champignon' });
    let mates: string[] = [];
    feed.bus.on('nightWake', (w) => (mates = w.view.mates));
    toNight(feed);
    vi.advanceTimersByTime(200_000);
    expect(mates).toHaveLength(1);
    feed.dispose();
  });
});
