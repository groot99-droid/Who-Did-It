import { describe, expect, it } from 'vitest';
import { economy, roles } from '../src/index.js';

/**
 * Round 10, C3 (GDD 3.23; docs/round9/round10-plan.md 5): every card says what its look does in town. The schema
 * fails a card with no `townWork`; this checks that the rows agree with the shops, the altars and the covers.
 */

const owners = new Set(Object.values(economy.shops).flatMap((s) => (s.owner === undefined ? [] : [s.owner])));

describe('townWork (round10-plan.md 5)', () => {
  it('gives a stall exactly to the cards whose look owns a shop', () => {
    for (const role of Object.values(roles.roles)) {
      const owns = role.look !== null && owners.has(role.look);
      expect(role.townWork.work === 'stall', role.id).toBe(owns);
    }
  });

  it('names only altars for a faith row, and a faith row only on a card with a look', () => {
    for (const role of Object.values(roles.roles)) {
      if (role.townWork.work !== 'faith') {
        expect(role.townWork.props, role.id).toBeUndefined();
        continue;
      }
      expect(role.look, role.id).not.toBeNull();
      for (const prop of role.townWork.props ?? []) expect(economy.faith.altars, role.id).toContain(prop);
    }
  });

  it('makes every cover and Cabal card do the work of the look it wears', () => {
    for (const role of Object.values(roles.roles))
      if (role.cover || role.faction === 'cabal' || role.id === 'thief')
        expect(role.townWork.work, role.id).toBe('worn');
  });

  it('says what is not built yet on every row with no work of its own', () => {
    for (const role of Object.values(roles.roles))
      if (role.townWork.work === 'none') expect(role.townWork.nfy, role.id).toBeDefined();
  });
});
