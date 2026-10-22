import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  EFFECTIVE_SCALE_TICKS,
  MAX_SIM_MS_PER_TICK,
  type SimClock,
  effectiveScale,
  stepsThisTick,
} from '../src/sim/auto/clock';

const clock = (over: Partial<SimClock> = {}): SimClock => ({
  scale: 1,
  paused: false,
  pendingSteps: 0,
  carry: 0,
  ...over,
});

describe('the sim clock (GDD 3.19)', () => {
  it('runs one step at 1x whatever the last tick cost, and never touches the carry', () => {
    const c = clock({ carry: 3 });
    for (const ms of [0, 1, 39, 40, 200]) expect(stepsThisTick(c, ms)).toBe(1);
    expect(c.carry).toBe(3);
    expect(effectiveScale(c)).toBe(5 / EFFECTIVE_SCALE_TICKS);
  });

  it('runs `scale` steps when the budget allows', () => {
    for (const scale of [2, 5, 10] as const) {
      const c = clock({ scale });
      expect(stepsThisTick(c, 1)).toBe(scale);
      expect(c.carry).toBe(0);
    }
  });

  it('caps a slow tick at the budget, carries the rest and drops the effective scale; nothing is skipped', () => {
    const c = clock({ scale: 10 });
    const perStep = MAX_SIM_MS_PER_TICK / 4; // four steps fit in the budget
    let ran = 0;
    for (let i = 0; i < EFFECTIVE_SCALE_TICKS; i++) ran += stepsThisTick(c, perStep);
    expect(ran).toBe(4 * EFFECTIVE_SCALE_TICKS);
    expect(c.carry).toBe(6 * EFFECTIVE_SCALE_TICKS);
    expect(effectiveScale(c)).toBe(4);
    // The sim speeds up again: the carry drains on top of the scale until it is gone.
    let drained = 0;
    while (c.carry > 0) drained += stepsThisTick(c, 0.01) - 10;
    expect(drained).toBe(6 * EFFECTIVE_SCALE_TICKS);
  });

  it('still runs one step when a single step costs more than the budget', () => {
    const c = clock({ scale: 5 });
    expect(stepsThisTick(c, MAX_SIM_MS_PER_TICK * 3)).toBe(1);
    expect(c.carry).toBe(4);
  });

  it('runs only the pending single steps while paused, and clears them', () => {
    const c = clock({ scale: 10, paused: true, pendingSteps: 3 });
    expect(stepsThisTick(c, 1)).toBe(3);
    expect(c.pendingSteps).toBe(0);
    expect(stepsThisTick(c, 1)).toBe(0);
    expect(c.carry).toBe(0);
  });

  it('is written only under sim/auto/: everything else only reads it through stepsThisTick', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith('.ts')) files.push(path);
      }
    };
    walk(fileURLToPath(new URL('../src', import.meta.url)));
    const uses = files
      .filter((path) => !path.includes(join('src', 'sim', 'auto')))
      .flatMap((path) =>
        readFileSync(path, 'utf8')
          .split('\n')
          .filter((line) => /clockOf\(/.test(line) && !line.trim().startsWith('*'))
          .filter((line) => !/(stepsThisTick|effectiveScale)\(clockOf\(/.test(line))
          .map((line) => `${path.slice(path.indexOf('src'))}: ${line.trim()}`),
      );
    expect(uses).toEqual([]);
  });
});
