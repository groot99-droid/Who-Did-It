import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import balance from '@wdi/content/data/balance.json';
import { SKIP, type MeetingPlayer } from '../meeting';
import { MockMeetingFeed, mockBotVotes, tallyVotes } from './meetingMock';

const look = { height: 0, scarf: 0, hat: 0 };
const roster = ['me', 'a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({
  id,
  name: id.toUpperCase(),
  traits: look,
}));
const living = (dead: string[] = []): MeetingPlayer[] =>
  roster.map((p) => ({ ...p, look: '', alive: !dead.includes(p.id), hasVoted: false }));

describe('tallyVotes', () => {
  it('ejects the plurality, and nobody on a tie or a Skip plurality', () => {
    expect(tallyVotes({ a: 'x', b: 'x', c: 'y' }).ejectedId).toBe('x');
    expect(tallyVotes({ a: 'x', b: 'y' }).ejectedId).toBeUndefined();
    expect(tallyVotes({ a: SKIP, b: SKIP, c: 'y' }).ejectedId).toBeUndefined();
    expect(tallyVotes({ a: 'x', b: SKIP }).tally).toEqual({ x: 1, skip: 1 });
  });
});

describe('mockBotVotes', () => {
  it('piles on one suspect after a body whatever the player votes', () => {
    const bots = mockBotVotes(living(['b']), 'me', 'body');
    expect(Object.keys(bots)).not.toContain('me');
    expect(Object.keys(bots)).not.toContain('b');
    for (const pick of [...Object.values(bots), SKIP, 'a']) {
      const { ejectedId } = tallyVotes({ ...bots, me: pick });
      expect(ejectedId).toBeDefined();
      expect(ejectedId).not.toBe('b');
    }
  });

  it('skips after a bell', () => {
    const bots = mockBotVotes(living(), 'me', 'bell');
    expect(new Set(Object.values(bots))).toEqual(new Set([SKIP]));
  });
});

describe('MockMeetingFeed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', globalThis);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('runs discussion, an early reveal once everyone voted, then game over', () => {
    const phases: number[] = [];
    const done = vi.fn();
    const feed = new MockMeetingFeed(roster, 'me', { onDone: done });
    feed.bus.on('phaseChange', (e) => phases.push(e.phase));
    const result = vi.fn();
    feed.bus.on('voteResult', result);
    feed.begin({ reason: 'body', callerId: 'me', bodyOf: 'b' });
    expect(feed.started()?.reason).toBe('body');
    expect(feed.roster().find((p) => p.id === 'b')?.alive).toBe(false);

    feed.vote('a');
    expect(feed.myVote()).toBe('a');
    expect(result).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(result).toHaveBeenCalledOnce();
    expect(phases).toEqual([7, 9]);
    expect(feed.result()?.ejectedId).toBeDefined();

    vi.advanceTimersByTime(balance.phases.revealS * 1000);
    expect(phases).toContain(12);
    expect(feed.over()?.winner).toBeGreaterThan(0);
    expect(done).toHaveBeenCalledWith('gameOver');
    vi.advanceTimersByTime(5000);
    expect(phases.at(-1)).toBe(0);
    feed.dispose();
  });

  it('refuses a vote from the dead and for the dead', () => {
    const feed = new MockMeetingFeed(roster, 'me', { onDone: vi.fn() });
    feed.begin({ reason: 'body', callerId: 'me', bodyOf: 'b' });
    feed.vote('b');
    expect(feed.myVote()).toBe('');
    feed.dispose();
  });

  it('resumes the world after a reveal with nobody ejected', () => {
    const done = vi.fn();
    const feed = new MockMeetingFeed(roster, 'me', { onDone: done });
    feed.begin({ reason: 'bell', callerId: 'me' });
    feed.vote(SKIP);
    vi.advanceTimersByTime(5000 + balance.phases.revealS * 1000);
    expect(done).toHaveBeenCalledWith('resume');
    feed.dispose();
  });
});
