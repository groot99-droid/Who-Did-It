import balance from '@wdi/content/data/balance.json';
import { Phase } from '@wdi/shared';
import { describe, expect, it } from 'vitest';
import { ghostAfter } from '../net/worldColyseus';
import { WORLD_COPY as C } from './copy/world';
import { lineCause, lineClock, lineSecondsLeft } from './OnTheLine';

/** Round 10, C1b (GDD 3.22, UI.md 14.47): the On-the-line screen's clock and line, and the ghost flag around it. */

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
  it('reads as minutes and seconds', () => {
    expect(lineClock(0)).toBe('0:00');
    expect(lineClock(65.2)).toBe('1:06');
    expect(lineClock(3725)).toBe('62:05');
  });
});

describe('the cause line', () => {
  it('names a bite or a shot, and anything else plainly', () => {
    expect(lineCause('wolf')).toBe(C['line.cause.wolf']);
    expect(lineCause('creature')).toBe(C['line.cause.creature']);
    expect(lineCause('shot')).toBe(C['line.cause.shot']);
    expect(lineCause(undefined)).toBe(C['line.cause.other']);
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
