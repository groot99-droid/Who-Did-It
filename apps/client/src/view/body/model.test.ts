import effectsJson from '@wdi/content/data/effects.json';
import { EFFECT_KEYS, EffectId, TICK_RATE } from '@wdi/shared/constants';
import { describe, expect, it } from 'vitest';
import { bodyHudModel, effectKeyOf, effectLabel, percent, secondsLeft } from './model';

const whole = { hp: 100, maxHp: 100, stamina: 100, maxStamina: 100, effects: [] };

describe('the body HUD model (UI.md 14.32)', () => {
  it('hides on an empty row and shows on a body', () => {
    expect(bodyHudModel(null, 0).shown).toBe(false);
    expect(bodyHudModel({ ...whole, maxHp: 0 }, 0).shown).toBe(false);
    const m = bodyHudModel(whole, 0);
    expect(m).toMatchObject({
      shown: true,
      hpPct: 100,
      staminaPct: 100,
      health: 'whole',
      staminaState: 'fresh',
    });
    expect(m.effects).toEqual([]);
  });

  it('keeps a sliver of health visible and clamps the shares', () => {
    expect(percent(0, 100)).toBe(0);
    expect(percent(0.4, 100)).toBe(1);
    expect(percent(1, 100)).toBe(1);
    expect(percent(50, 100)).toBe(50);
    expect(percent(120, 100)).toBe(100);
    expect(percent(5, 0)).toBe(0);
  });

  it('reads the states from the derived effects, never from a number of its own', () => {
    const at = (key: keyof typeof EffectId) => ({ id: EffectId[key], untilTick: 0, stacks: 1 });
    expect(bodyHudModel({ ...whole, hp: 20, effects: [at('wounded')] }, 0).health).toBe('wounded');
    expect(bodyHudModel({ ...whole, hp: 20, effects: [] }, 0).health).toBe('whole');
    expect(bodyHudModel({ ...whole, hp: 0, effects: [at('knockedOut'), at('wounded')] }, 0).health).toBe(
      'down',
    );
    expect(bodyHudModel({ ...whole, stamina: 0, effects: [at('fatigued')] }, 0).staminaState).toBe(
      'fatigued',
    );
  });

  it('names every effect by its effects.json row and maps every wire id back', () => {
    for (const key of EFFECT_KEYS) {
      expect(effectKeyOf(EffectId[key])).toBe(key);
      expect(effectLabel(key)).toBe(effectsJson.effects[key].name);
    }
    expect(effectKeyOf(0)).toBeNull();
    expect(effectKeyOf(99)).toBeNull();
  });

  it('counts a timed effect down in whole seconds and puts the soonest first', () => {
    const tick = 10 * TICK_RATE;
    expect(secondsLeft(0, tick)).toBeNull();
    expect(secondsLeft(tick + 1, tick)).toBe(1);
    expect(secondsLeft(tick - 5, tick)).toBe(0);
    const m = bodyHudModel(
      {
        ...whole,
        effects: [
          { id: EffectId.bleeding, untilTick: 0, stacks: 1 },
          { id: EffectId.poisoned, untilTick: tick + 90 * TICK_RATE, stacks: 1 },
          { id: EffectId.weakened, untilTick: tick + 30 * TICK_RATE, stacks: 3 },
          { id: 99, untilTick: 0, stacks: 1 },
        ],
      },
      tick,
    );
    expect(m.effects.map((e) => [e.key, e.secondsLeft, e.stacks])).toEqual([
      ['weakened', 30, 3],
      ['poisoned', 90, 1],
      ['bleeding', null, 1],
    ]);
    expect(m.effects[0]!.label).toBe('Weakened');
  });
});
