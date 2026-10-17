import { describe, expect, it } from 'vitest';
import { MEETING_COPY } from './copy/meeting';
import { fill } from './copy';
import onubBalance from '@wdi/content/data/balance.onub.json';
import {
  abstainedLine,
  claimLine,
  claimRoleIds,
  clockText,
  ejectionLine,
  ejectionLines,
  factionOf,
  isRevealingRole,
  noEjectionLine,
  reasonLine,
  swapLogLine,
  voteLines,
  winnerLine,
} from './meetingText';
import type { OnubGameOver } from '../net/meeting';

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
    expect(noEjectionLine({ tally: { g: 2 } }, 'onub')).toBe('Nobody is turned out.');
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

  it('names every seat turned out with their final role, and the abstainers', () => {
    const result = {
      tally: { g: 2, h: 2 },
      outs: ['g', 'h'],
      roles: { g: 'sinEater', h: 'poisoner' },
      abstained: ['x'],
    };
    expect(ejectionLines(result, nameOf, 'onub')).toEqual([
      'Gus and Hana are turned out.',
      'Gus was the Sin-Eater.',
      'Hana was the Poisoner.',
    ]);
    expect(ejectionLines({ ...result, outs: ['g'] }, nameOf, 'onub')[0]).toBe('Gus is turned out.');
    expect(abstainedLine(result, nameOf)).toBe('Did not vote: Someone');
    expect(abstainedLine({ ...result, abstained: [] }, nameOf)).toBeNull();
    expect(abstainedLine({ tally: {} }, nameOf)).toBeNull();
  });

  it('reads factions and titles from roles.onub.json', () => {
    expect(factionOf('poisoner', 'onub')).toBe('cabal');
    expect(factionOf('hireling', 'onub')).toBe('cabal');
    expect(factionOf('debtor', 'onub')).toBe('neutral');
    expect(factionOf('sinEater', 'onub')).toBe('village');
  });

  it('offers a claim chip per V1 role and pickers only for the roles that look at something', () => {
    const ids = claimRoleIds();
    expect(ids).toContain('sinEater');
    expect(ids).not.toContain('pallbearer');
    expect(ids).not.toContain('gamekeeper');
    expect(isRevealingRole('sinEater')).toBe(true);
    expect(isRevealingRole('cutpurse')).toBe(true);
    expect(isRevealingRole('lamplighter')).toBe(true);
    expect(isRevealingRole('busybody')).toBe(false);
    expect(isRevealingRole('mourner')).toBe(false);
    // Every window of the balance file with a revealing act is a role that has a chip.
    for (const w of onubBalance.windows)
      if (isRevealingRole(w.role)) expect(ids.includes(w.role) || w.role === 'pallbearer').toBe(true);
  });

  it('writes a claim as the sentence players say', () => {
    expect(claimLine({ from: 'h', roleId: 'mourner', targetId: '', sawRoleId: '' }, nameOf)).toBe(
      'I was the Mourner',
    );
    expect(claimLine({ from: 'h', roleId: 'sinEater', targetId: 'g', sawRoleId: 'mourner' }, nameOf)).toBe(
      "I was the Sin-Eater: Gus's loaf was Mourner",
    );
    expect(claimLine({ from: 'h', roleId: 'sinEater', targetId: '', sawRoleId: 'poisoner' }, nameOf)).toBe(
      'I was the Sin-Eater: I saw Poisoner',
    );
  });

  const onub: OnubGameOver = {
    dealt: { h: 'cutpurse', g: 'poisoner', b: 'busybody', m: 'mourner' },
    final: { h: 'poisoner', g: 'cutpurse', b: 'busybody', m: 'mourner' },
    center: ['mourner', 'mourner', 'sinEater'],
    swapLog: [],
    votes: { h: 'g', g: 'h' },
    outs: [],
    plates: { 'bk.plate_0': 'h', 'bk.plate_1': 'g', 'bk.plate_2': 'b', 'bk.plate_3': 'm' },
    rowId: 'cleanTable',
    winnerIds: [],
  };

  it('turns the swap log into sentences through the plate map', () => {
    const take = { order: 1, roleId: 'cutpurse', act: 'onub.take', slots: ['bk.plate_0', 'bk.plate_1'] };
    // The order of the slots does not matter: the actor's own plate is the Cutpurse's seat's.
    expect(swapLogLine(take, onub, nameOf)).toBe("The Cutpurse took Gus's loaf");
    const names = (id: string) => ({ h: 'Hana', g: 'Gus', b: 'Bo', m: 'Mo' })[id] ?? 'Someone';
    expect(swapLogLine(take, onub, names)).toBe("The Cutpurse took Gus's loaf");
    expect(swapLogLine({ ...take, slots: ['bk.plate_1', 'bk.plate_0'] }, onub, names)).toBe(
      "The Cutpurse took Gus's loaf",
    );
    expect(
      swapLogLine(
        { order: 2, roleId: 'busybody', act: 'onub.swapPlates', slots: ['bk.plate_1', 'bk.plate_3'] },
        onub,
        names,
      ),
    ).toBe("The Busybody swapped Gus's and Mo's loaves");
    expect(
      swapLogLine(
        { order: 3, roleId: 'sot', act: 'onub.swapDead', slots: ['bk.plate_2', 'bk.deadloaf_1'] },
        onub,
        names,
      ),
    ).toBe("The Sot swapped Bo's loaf with a dead loaf");
  });

  it('lists one vote line per seat', () => {
    expect(voteLines(onub, ['h', 'g', 'b'], nameOf)).toEqual([
      'Hana voted Gus',
      'Gus voted Hana',
      'Someone did not vote',
    ]);
    expect(fill(MEETING_COPY['over.votes.line'], { from: 'A', to: 'B' })).toBe('A voted B');
  });
});
