import { describe, expect, it } from 'vitest';
import balance from '@wdi/content/data/balance.json';
import { generateLockpick, lockpickOutcome, type LockpickPublic } from '@wdi/shared/rules';
import { LockpickModel } from './lockpick';

const b = balance.minigames.lockpick;
const lock = (): LockpickPublic => ({
  pins: 3,
  setPoints: [0.3, 0.6, 0.8],
  band: b.bandFrac,
  snapAt: b.snapAt,
  minAttemptS: b.minAttemptS,
  maxAttempts: b.maxAttempts,
});

/** Lifts `pin` to `lift`, presses lightly for a moment and lets go. */
function tryPin(m: LockpickModel, pin: number, lift: number, holdS = 0.4) {
  m.select(pin);
  m.setLift(pin, lift);
  m.press();
  let clicked = false;
  for (let t = 0; t < holdS; t += 0.05) clicked = m.tick(0.05) || clicked;
  return { result: m.release(), clicked };
}

describe('lock-pick mini-game (D5b)', () => {
  it('feels a click only for a lifted pin in its band, under light tension', () => {
    const m = new LockpickModel(lock());
    expect(tryPin(m, 0, 0.9).clicked).toBe(false);
    m.tick(0.5);
    expect(tryPin(m, 1, 0.6).clicked).toBe(true);
  });

  it('sets a pin that is released inside its band and slips back otherwise', () => {
    const m = new LockpickModel(lock());
    expect(tryPin(m, 0, 0.9).result).toBe('miss');
    m.tick(0.5);
    expect(tryPin(m, 0, 0.3).result).toBe('set');
    expect(m.set.has(0)).toBe(true);
    m.setLift(0, 0.9);
    expect(m.lifts[0]).toBe(0.3); // a set pin stays where it is
  });

  it('refuses an attempt that comes sooner than minAttemptS after the last', () => {
    const m = new LockpickModel(lock());
    m.tick(1);
    expect(tryPin(m, 0, 0.3, 0).result).toBe('set');
    m.select(1);
    m.setLift(1, 0.6);
    m.press();
    expect(m.release()).toBe('wait');
    expect(m.trace).toHaveLength(1);
  });

  it('snaps the pick when the tension reaches snapAt, and is then done', () => {
    const m = new LockpickModel(lock());
    m.select(0);
    m.press();
    m.tick(0.2);
    for (let i = 0; i < 40 && !m.snapped; i++) m.tick(0.05);
    expect(m.snapped).toBe(true);
    expect(m.done).toBe(true);
    expect(m.trace.at(-1)!.tension).toBeGreaterThanOrEqual(b.snapAt);
  });

  it('records a trace the server accepts: open when every pin sets, snap when it snapped', () => {
    const pub = lock();
    const m = new LockpickModel(pub);
    for (const [pin, s] of pub.setPoints.entries()) {
      m.tick(1);
      expect(tryPin(m, pin, s).result).toBe('set');
    }
    expect(m.done).toBe(true);
    expect(lockpickOutcome(pub, m.trace)).toBe('open');

    const s = new LockpickModel(pub);
    s.tick(1);
    s.press();
    for (let i = 0; i < 60 && !s.snapped; i++) s.tick(0.05);
    expect(lockpickOutcome(pub, s.trace)).toBe('snap');
  });

  it('plays a lock the server generates, set points read from its public board', () => {
    let roll = 0;
    const pub = generateLockpick(1, 1, () => [0.2, 0.55, 0.9][roll++ % 3]!, b);
    const m = new LockpickModel(pub);
    for (const [pin, s] of pub.setPoints.entries()) {
      m.tick(1);
      tryPin(m, pin, s);
    }
    expect(lockpickOutcome(pub, m.trace)).toBe('open');
  });
});
