import { describe, expect, it } from 'vitest';
import { MEETING_COPY } from './copy/meeting';
import { clockText, ejectionLine, factionOf, noEjectionLine, reasonLine, winnerLine } from './meetingText';

const names: Record<string, string> = { h: 'Hana', g: 'Gus' };
const nameOf = (id: string) => names[id] ?? 'Someone';

describe('meeting lines', () => {
  it('names who reported which body, or who rang the bell', () => {
    expect(reasonLine({ reason: 'body', callerId: 'h', bodyOf: 'g', missing: [] }, nameOf)).toBe(
      "Hana reported Gus's body",
    );
    expect(reasonLine({ reason: 'bell', callerId: 'h', missing: [] }, nameOf)).toBe('Hana rang the bell');
    expect(reasonLine(null, nameOf)).toBe('A meeting has been called');
  });

  it('reveals the ejected role, or says nobody left', () => {
    expect(ejectionLine({ tally: { g: 3 }, ejectedId: 'g', role: 'sin_eater' }, nameOf)).toBe(
      'Gus is ejected. Gus was the Sin Eater.',
    );
    expect(ejectionLine({ tally: { skip: 2 } }, nameOf)).toBe('The village skipped. Nobody is ejected.');
    expect(ejectionLine({ tally: { g: 1, h: 1 } }, nameOf)).toBe('A tie. Nobody is ejected.');
    expect(ejectionLine({ tally: {} }, nameOf)).toBe('No votes. Nobody is ejected.');
    expect(noEjectionLine({ tally: { g: 1, h: 1 } })).toBe('A tie. Nobody is ejected.');
  });

  it('formats the clock as m:ss from ticks', () => {
    expect(clockText(20 * 65)).toBe('1:05');
    expect(clockText(0)).toBe('0:00');
    expect(clockText(null)).toBe('-:--');
  });

  it('knows every winner id and the faction of a role', () => {
    expect(winnerLine(1)).toBe('The village wins');
    expect(winnerLine(2)).toBe('The Cabal wins');
    expect(winnerLine(99)).toBe('The match ended');
    expect(winnerLine(5)).toBe('Nobody wins');
    expect(factionOf('killer')).toBe('cabal');
    expect(factionOf('detective')).toBe('village');
    expect(factionOf('drifter')).toBe('neutral');
  });
});

describe('quick-mode lines', () => {
  it('opens on the dawn line', () => {
    expect(reasonLine({ reason: 'dawn', callerId: '', missing: [] }, nameOf)).toBe(
      MEETING_COPY['meeting.reason.dawn'],
    );
  });

  it('reads factions through the teams of roles.onub.json', () => {
    expect(factionOf('champignon', 'onub')).toBe('cabal');
    expect(factionOf('levain', 'onub')).toBe('cabal');
    expect(factionOf('croissant', 'onub')).toBe('neutral');
    expect(factionOf('chef', 'onub')).toBe('village');
    expect(factionOf('chef')).toBe('village');
  });
});
