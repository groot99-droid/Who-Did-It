import balance from '@wdi/content/data/balance.json';
import { Phase } from '@wdi/shared';
import { describe, expect, it } from 'vitest';
import { ghostAfter } from '../net/worldColyseus';
import { WORLD_COPY as C } from './copy/world';
import { bellsNext, lineCause, lineClock, lineSecondsLeft } from './OnTheLine';

/**
 * Round 10, C1b (GDD 3.22, UI.md 14.47): the On-the-line screen's clock and line, and the ghost flag around it; y13
 * (UI.md 14.51.5): the place in the line and the last cycle's bells.
 */

const p = balance.phases;
const arrive = balance.train.arriveAtS;

describe('the time to the morning train', () => {
  it('runs through the rest of the day, the dusk and the night, then the arrival', () => {
    expect(lineSecondsLeft(Phase.day, 100)).toBe(100 + p.duskS + p.nightS + arrive);
    expect(lineSecondsLeft(Phase.dusk, 10)).toBe(10 + p.nightS + arrive);
    expect(lineSecondsLeft(Phase.night, 60)).toBe(60 + arrive);
    expect(lineSecondsLeft(Phase.grace, 5)).toBe(5 + arrive);
    expect(lineSecondsLeft(Phase.day, -3)).toBe(p.duskS + p.nightS + arrive);
  });
  it('runs through a meeting and its immunity, which open the next day', () => {
    expect(lineSecondsLeft(Phase.meetingDiscussion, 30)).toBe(
      30 + p.voteS + p.revealS + p.immunityS + arrive,
    );
    expect(lineSecondsLeft(Phase.meetingVote, 20)).toBe(20 + p.revealS + p.immunityS + arrive);
    expect(lineSecondsLeft(Phase.reveal, 4)).toBe(4 + p.immunityS + arrive);
    expect(lineSecondsLeft(Phase.immunity, 9)).toBe(9 + arrive);
  });
  it('runs to the bells on the last cycle, with no train to arrive', () => {
    expect(lineSecondsLeft(Phase.night, 60, true)).toBe(60);
    expect(lineSecondsLeft(Phase.day, 100, true)).toBe(100 + p.duskS + p.nightS);
    expect(lineSecondsLeft(Phase.meetingDiscussion, 30, true)).toBe(30 + p.voteS + p.revealS + p.immunityS);
    expect(lineSecondsLeft(Phase.immunity, 9, true)).toBe(9);
    expect(lineSecondsLeft(Phase.finalNight, 40, true)).toBe(40);
  });
  it('knows the last cycle from the day count: the day after it would be the Final Night', () => {
    const last = balance.finalNight.afterCycle;
    expect(bellsNext(last)).toBe(true);
    expect(bellsNext(last + 1)).toBe(true);
    expect(bellsNext(last - 1)).toBe(false);
    expect(bellsNext(0)).toBe(false);
  });
  it('reads as minutes and seconds', () => {
    expect(lineClock(0)).toBe('0:00');
    expect(lineClock(65.2)).toBe('1:06');
    expect(lineClock(3725)).toBe('62:05');
  });
});

describe('the cause line', () => {
  it('names a bite or a shot and where it fell, and anything else plainly', () => {
    expect(lineCause('wolf', 'HollowMere')).toBe('A wolf took you in HollowMere.');
    expect(lineCause('creature', 'The Low Woods')).toBe('Something in the dark took you in The Low Woods.');
    expect(lineCause('shot', 'HollowMere')).toBe('A shot took you in HollowMere.');
    expect(lineCause(undefined, 'HollowMere')).toBe(C['line.cause.other']);
    expect(lineCause('knife', 'HollowMere')).toBe(C['line.cause.other']);
  });
  it('keeps the plain line when no killed reached this client, so no place is known', () => {
    expect(lineCause('wolf', undefined)).toBe(C['line.cause.other']);
    expect(lineCause('wolf', '')).toBe(C['line.cause.other']);
  });
});

describe('the ghost flag around the line', () => {
  const none = { ghost: false, line: false };
  it('makes no ghost while on the line, even when a meeting flips the roster to dead', () => {
    expect(ghostAfter(none, { phase: Phase.day, alive: true, onLine: true })).toEqual({
      ghost: false,
      line: true,
    });
    expect(
      ghostAfter(
        { ghost: true, line: false },
        { phase: Phase.meetingDiscussion, alive: false, onLine: true },
      ),
    ).toEqual({ ghost: false, line: true });
  });
  it('clears the flag when the train brings the seat back', () => {
    const back = ghostAfter({ ghost: true, line: true }, { phase: Phase.day, alive: true, onLine: false });
    expect(back).toEqual({ ghost: false, line: false });
  });
  it('keeps a ghost a ghost, and the lobby clears everything', () => {
    expect(ghostAfter(none, { phase: Phase.night, alive: false, onLine: false }).ghost).toBe(true);
    expect(
      ghostAfter({ ghost: true, line: false }, { phase: Phase.day, alive: true, onLine: false }).ghost,
    ).toBe(true);
    expect(ghostAfter({ ghost: true, line: true }, { phase: 0, alive: true, onLine: false })).toEqual(none);
  });
});
