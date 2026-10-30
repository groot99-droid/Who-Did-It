import { describe, expect, it } from 'vitest';
import { checkMinigame, generateLockpick, lockpickOutcome, mulberry32, type LockAttempt } from '../src/index';

// Round 10 (D5; GDD 3.29): the lock-pick's pure rules.

const b = {
  pinsByTier: [3, 4, 5],
  bandFrac: 0.12,
  lowerTierBandMult: 0.6,
  snapAt: 0.85,
  minAttemptS: 0.3,
  maxAttempts: 40,
};
const lock = generateLockpick(2, 2, mulberry32(7), b);
const honest = (): LockAttempt[] =>
  lock.setPoints.map((s, pin) => ({ t: 1 + pin, pin, lift: s, tension: 0.3 }));

describe('the lock-pick rules', () => {
  it('gives a lock the pins of its tier and a narrower band to a lower-tier pick', () => {
    expect(generateLockpick(1, 1, mulberry32(1), b).pins).toBe(3);
    expect(lock.pins).toBe(4);
    expect(generateLockpick(3, 3, mulberry32(1), b).pins).toBe(5);
    expect(generateLockpick(2, 1, mulberry32(1), b).band).toBeLessThan(lock.band);
    expect(lock.setPoints.every((s) => s >= 0.1 && s <= 0.9)).toBe(true);
  });

  it('opens on every pin set under the snap tension', () => {
    expect(lockpickOutcome(lock, honest())).toBe('open');
    expect(checkMinigame({ kind: 'lockpick', public: lock, solution: lock }, { trace: honest() })).toBe(true);
  });

  it('snaps at the snap tension, even with every pin set before it', () => {
    const trace = [...honest(), { t: 9, pin: 0, lift: 0, tension: 0.9 }];
    expect(lockpickOutcome(lock, trace)).toBe('snap');
  });

  it('is incomplete when a pin is missed or lifted off its set point', () => {
    expect(lockpickOutcome(lock, honest().slice(1))).toBe('incomplete');
    const off = honest().map((a, i) => (i === 0 ? { ...a, lift: a.lift + 0.3 } : a));
    expect(lockpickOutcome(lock, off)).toBe('incomplete');
  });

  it('refuses a trace no hand could make or that is malformed', () => {
    const fast = honest().map((a, i) => ({ ...a, t: i * 0.1 }));
    expect(lockpickOutcome(lock, fast)).toBe('invalid');
    expect(lockpickOutcome(lock, [])).toBe('invalid');
    expect(lockpickOutcome(lock, 'open')).toBe('invalid');
    expect(lockpickOutcome(lock, [{ t: 1, pin: 9, lift: 0.5, tension: 0.1 }])).toBe('invalid');
    expect(lockpickOutcome(lock, [{ t: 1, pin: 0, lift: 2, tension: 0.1 }])).toBe('invalid');
    expect(
      lockpickOutcome(
        lock,
        Array.from({ length: 41 }, (_, i) => ({ t: i, pin: 0, lift: 0, tension: 0 })),
      ),
    ).toBe('invalid');
  });
});
