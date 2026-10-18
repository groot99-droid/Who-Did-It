import { describe, expect, it } from 'vitest';
import onubBalance from '@wdi/content/data/balance.onub.json';
import onubRoles from '@wdi/content/data/roles.onub.json';
import { TICK_RATE } from '@wdi/shared/constants';
import { claimableRoles, claimLine, crustLine, crustStep, outLines } from './rushModel';

const name = (id: string) => ({ a: 'Ada', b: 'Bo' })[id] ?? id;

describe('claim form roles', () => {
  it('offers the deck roles only, once each', () => {
    const roles = claimableRoles(onubBalance.byCount['5'].deck);
    expect(new Set(roles).size).toBe(roles.length);
    expect(roles).toContain('champignon');
    expect(roles).not.toContain('tourrier');
    expect(roles.every((r) => r in onubRoles.roles)).toBe(true);
  });
});

describe('claim lines', () => {
  it('leaves out the parts a claim left out', () => {
    const line = claimLine({ from: 'a', roleId: 'chef', stationId: '', cardId: '', saw: [] }, name);
    expect(line).toBe('Ada says: dealt Le Chef de Cuisine.');
  });

  it('names station, card and sightings of a seat and of the Pantry', () => {
    const line = claimLine(
      {
        from: 'a',
        roleId: 'aboyeur',
        stationId: 'oven',
        cardId: 'oakFirewood',
        saw: [
          { targetId: 'b', roleId: '', stationId: 'mixer' },
          { targetId: 'pantry', roleId: 'levain', stationId: '' },
        ],
      },
      name,
    );
    expect(line).toContain('worked at Le Four à Pain');
    expect(line).toContain('played Oak Firewood');
    expect(line).toContain("Bo's Location card was Le Pétrin");
    expect(line).toContain('the Pantry holding Le Levain');
  });
});

describe('CRUST countdown', () => {
  it('steps Un, deux, trois, CRUST over crustCountdownS and ends', () => {
    const total = onubBalance.timers.crustCountdownS;
    expect([0, total * 0.3, total * 0.6, total * 0.9].map(crustStep)).toEqual([0, 1, 2, 3]);
    expect(crustStep(total)).toBeNull();
  });

  it('reads the step from the ticks left in CRUST', () => {
    const left = (elapsed: number) => (onubBalance.timers.voteS - elapsed) * TICK_RATE;
    expect(crustLine(left(0))).toBe('Un…');
    expect(crustLine(left(2.9))).toBe('CRUST!');
    expect(crustLine(left(5))).toBe('');
  });
});

describe('Final Bake lines', () => {
  it('names who goes in with the held role, the drag, the Pantry and the abstainers', () => {
    const l = outLines(
      {
        tally: { a: 2, pantry: 2 },
        outs: ['a', 'b'],
        hop: 'b',
        pantryOut: true,
        roles: { a: 'critique', b: 'chef' },
        abstained: ['b'],
      },
      name,
    );
    expect(l.outs).toEqual([
      'Ada goes in the oven: Le Critique Gastronomique',
      'Bo goes in the oven: Le Chef de Cuisine',
    ]);
    expect(l.hop).toContain('Bo');
    expect(l.pantry).not.toBe('');
    expect(l.abstained).toContain('Bo');
  });

  it('says nobody goes in when the oven is empty', () => {
    const l = outLines({ tally: {}, outs: [] }, name);
    expect(l.outs).toEqual(['Nobody goes in the oven.']);
    expect([l.hop, l.pantry, l.abstained]).toEqual(['', '', '']);
  });
});
