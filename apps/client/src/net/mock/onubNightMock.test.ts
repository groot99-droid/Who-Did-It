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

describe('mock night acts', () => {
  const run = (role: string) => {
    const feed = new MockOnubFeed({ search: `?role=${role}` });
    const refusals: number[] = [];
    (feed as unknown as { opts: { onRefuse: (c: number) => void } }).opts.onRefuse = (c) => refusals.push(c);
    const reveals: unknown[][] = [];
    const wakes: unknown[] = [];
    feed.bus.on('nightReveal', (r) => reveals.push(r.entries));
    feed.bus.on('nightWake', (w) => wakes.push(w));
    toNight(feed);
    return { feed, refusals, reveals, wakes };
  };
  const into = (role: string) => {
    const r = run(role);
    // advance until the self window is open
    for (let i = 0; i < 200 && r.feed.wake() === null; i++) vi.advanceTimersByTime(1000);
    return r;
  };

  it('answers a peek with the card and closes the act list', () => {
    const { feed, reveals } = into('chef');
    const legal = feed.wake()?.view.legal.find((a) => a.act === 'onub.peekRole');
    expect(legal?.slots.length).toBe(4);
    expect(legal?.slots).not.toContain('seat.0.role');
    feed.act('onub.peekRole', ['seat.1.role']);
    expect(reveals.at(-1)).toMatchObject([{ slot: 'seat.1.role', kind: 'role' }]);
    expect(feed.wake()?.view.legal).toEqual([]);
    feed.dispose();
  });

  it('refuses a slot outside the pool with 422 and an act without a window with 425', () => {
    const a = into('chef');
    a.feed.act('onub.peekRole', ['seat.0.role']);
    expect(a.refusals).toEqual([422]);
    a.feed.dispose();
    const b = run('chef');
    b.feed.act('onub.peekRole', ['seat.1.role']);
    expect(b.refusals).toEqual([425]);
    b.feed.dispose();
  });

  it("swaps the Sous-Chef's Role card and shows the new one", () => {
    const { feed, reveals } = into('sousChef');
    feed.act('onub.rob', ['seat.1.role']);
    expect(reveals.at(-1)).toMatchObject([{ slot: 'seat.0.role', kind: 'role' }]);
    feed.dispose();
  });
});
