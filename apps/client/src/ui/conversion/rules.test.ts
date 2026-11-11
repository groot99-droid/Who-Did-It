import balance from '@wdi/content/data/balance.json';
import { Phase } from '@wdi/shared';
import { TICK_RATE } from '@wdi/shared/constants';
import { describe, expect, it } from 'vitest';
import { VICAR_LOOK, canPreach, heardLine, sermonSecondsLeft } from './rules';

const base = {
  look: VICAR_LOOK!,
  phase: Phase.day,
  dead: false,
  nearBell: true,
  tick: 10_000,
  preachedTick: -1,
};
const cool = balance.conversion.sermonCooldownS * TICK_RATE;

describe('the sermon (story I9b)', () => {
  it('is offered only to the Vicar look, by day, alive, at the bell, again after the cooldown', () => {
    expect(canPreach(base)).toBe(true);
    expect(canPreach({ ...base, look: 'baker' })).toBe(false);
    expect(canPreach({ ...base, phase: Phase.dusk })).toBe(false);
    expect(canPreach({ ...base, dead: true })).toBe(false);
    expect(canPreach({ ...base, nearBell: false })).toBe(false);
    expect(canPreach({ ...base, preachedTick: base.tick - cool + 1 })).toBe(false);
    expect(canPreach({ ...base, preachedTick: base.tick - cool })).toBe(true);
  });

  it('counts the seconds down and names a count, never a seat', () => {
    expect(sermonSecondsLeft(0, 0)).toBeGreaterThan(0);
    expect(sermonSecondsLeft(0, 1e9)).toBe(0);
    expect(heardLine(0)).toMatch(/Nobody/);
    expect(heardLine(1)).toMatch(/one soul/);
    expect(heardLine(3)).toMatch(/3 souls/);
  });
});
