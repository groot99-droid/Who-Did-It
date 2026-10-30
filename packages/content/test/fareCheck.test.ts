import { describe, expect, it } from 'vitest';
import { balance, economy, looks, roles } from '../src/index.js';

/**
 * Round 10, C2b (GDD 3.23; followup-4 2.5, a11): the balance lab's two-day check on Owing the line, and the dear
 * stall's owners. A fare must clear within `respawn.clearTargetDays` on a normal routine. Tasks are the routine's
 * income: `byCount.<n>.tasksEach` over `finalNight.afterCycle` days at `economy.taskWage`, halved while owing, against
 * the day's rent. The Clerk's errand, held `respawn.errandS` at a ledger, clears one fare.
 */

const SEATS = ['4', '5', '6', '7', '8', '9', '10'] as const;
const days = balance.finalNight.afterCycle;
const rent = economy.rent.amount;
const fare = balance.respawn.fareDebt;

/** Days to clear one fare from the task surplus over rent, or Infinity when the surplus is not positive. */
function daysFromTasks(n: (typeof SEATS)[number]): number {
  const perDay = (balance.byCount[n].tasksEach / days) * balance.economy.taskWage * balance.respawn.wageMult;
  const surplus = perDay - rent;
  return surplus > 0 ? fare / surplus : Infinity;
}

/** Days to clear one fare with the errand: one hold of `respawn.errandS` in a day of `phases.dayS`. */
const daysWithErrand = (): number => Math.ceil(balance.respawn.errandS / balance.phases.dayS);

describe('the two-day check (followup-4 2.5)', () => {
  it('clears a fare within respawn.clearTargetDays at every seat count once the errand is open', () => {
    for (const n of SEATS) {
      expect(Math.min(daysFromTasks(n), daysWithErrand()), `${n} seats`).toBeLessThanOrEqual(
        balance.respawn.clearTargetDays,
      );
    }
  });

  it('records that tasks alone never clear it: the errand carries the target (a playtest item, not a fix)', () => {
    const table = Object.fromEntries(SEATS.map((n) => [n, daysFromTasks(n)]));
    expect(table).toEqual({
      4: Infinity,
      5: Infinity,
      6: Infinity,
      7: Infinity,
      8: Infinity,
      9: Infinity,
      10: Infinity,
    });
  });
});

describe('the dear stall’s owners (GDD 3.23)', () => {
  it('names only a look that a dealt card wears in the world, never a cover', () => {
    const worn = new Set(Object.values(roles.roles).flatMap((r) => (r.look ? [r.look] : [])));
    for (const [id, shop] of Object.entries(economy.shops)) {
      if (shop.owner === undefined) continue;
      expect(looks.looks[shop.owner], id).toBeDefined();
      expect(worn.has(shop.owner), id).toBe(true);
    }
  });
});
