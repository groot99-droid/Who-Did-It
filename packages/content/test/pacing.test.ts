import { describe, expect, it } from 'vitest';
import { abilities, balance, clues } from '../src/index.js';

/** Round 10 A5: the day and night clocks of GDD 3.3, scaled by the factors of world-mode.md 7. */
const D = 4;
const N = 3;
const C = 3.5;

describe('pacing (GDD 3.3, 3.9)', () => {
  it('runs the day, dusk and night at the owner’s lengths', () => {
    const { dayS, duskS, nightS } = balance.phases;
    expect([dayS, duskS, nightS]).toEqual([120 * D, 10 * N, 100 * N]);
  });

  it('scales the night clocks by N', () => {
    const pairs: [number, number][] = [
      [balance.byCount[10].globalKillLockS, 15],
      [balance.finalNight.huntS, 45],
      [balance.finalNight.killCooldownS, 20],
      [balance.impersonate.durationS, 15],
      [balance.impersonate.cooldownS, 45],
      [balance.snowball.killCooldownPenaltyS, 10],
      [balance.snowball.lastKillerCooldownDeltaS, -5],
      [balance.npc.aloneKill.afterS, 30],
      [balance.vendettas.contract.offTargetRestS, 30],
      [balance.moods.fear.darkRiseS, 90],
      [abilities.abilities.plantClue!.cooldownS!, 60],
      [abilities.abilities.bandage!.cooldownS!, 60],
      [abilities.abilities.actShifty!.cooldownS!, 20],
    ];
    for (const [now, old] of pairs) expect(now).toBe(old * N);
    expect(balance.npc.night.leaveDelayS.max).toBe(15 * N);
  });

  it('scales the whole-cycle clocks by C', () => {
    const pairs: [number, number][] = [
      [balance.body.famishedAfterS, 480],
      [balance.tasks.martyrS, 600],
      [balance.vendettas.conversion.shareS, 45],
      [balance.moods.hunger.riseS, 480],
      [balance.moods.fear.fallS, 120],
      [balance.moods.anger.fallS, 180],
      [balance.moods.want.lightRiseS, 240],
      [balance.moods.want.debtRiseS, 120],
      [balance.moods.mug.cooldownS, 120],
    ];
    // The table rounds to a whole number of seconds (45 s becomes 160, not 157.5).
    for (const [now, old] of pairs) expect(Math.abs(now - old * C)).toBeLessThanOrEqual(2.5);
    const fp = clues.clues.footprints!.decay;
    expect(fp).toEqual({ kind: 'seconds', seconds: 90 * C });
    expect(clues.clues.footprints!.params?.rangerDecayS).toBe(180 * C);
  });

  it('scales the train by D and keeps the cycle counts', () => {
    expect(balance.train.arriveAtS).toBe(5 * D);
    expect(balance.train.deliveryAfterS).toBe(8 * D);
    expect(balance.finalNight.afterCycle).toBe(12);
  });

  it('keeps the strikes per night of every row (GDD 3.9)', () => {
    const old: Record<number, number> = { 4: 60, 5: 60, 6: 35, 7: 35, 8: 30, 9: 30, 10: 40 };
    const { duskS, nightS } = balance.phases;
    for (const [n, cooldown] of Object.entries(old)) {
      const row = balance.byCount[Number(n) as 4];
      expect((duskS + nightS) / row.killCooldownS).toBeCloseTo(110 / cooldown, 6);
    }
  });

  it('deals the 12-cycle task counts (followup-4 2.8)', () => {
    const each = [4, 5, 6, 7, 8, 9, 10].map((n) => balance.byCount[n as 4].tasksEach);
    expect(each).toEqual([29, 29, 38, 38, 38, 38, 48]);
  });
});
