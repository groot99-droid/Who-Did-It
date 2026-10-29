import { describe, expect, it } from 'vitest';
import { balance, cutscenes, mobs } from '../src/index.js';
import { CutsceneDeathCause } from '../src/schemas/cutscenes.js';

/** Round 10 A6 (GDD 3.15, 3.22): weaker mobs; Bleeding and Poisoned stop at 1 health. */
describe('weaker mobs (GDD 3.15)', () => {
  it('bites for 12, 9, 3 and 2', () => {
    const dmg = (id: string) => mobs.mobs[id]!.dmg;
    expect([dmg('wolf'), dmg('boar'), dmg('bat'), dmg('rat')]).toEqual([12, 9, 3, 2]);
  });

  it('softens the effect chances, keeps the bite interval, and every creature still kills', () => {
    expect(mobs.mobs.wolf!.effects).toEqual({ bleeding: 0.35 });
    expect(mobs.mobs.boar!.effects).toEqual({ bleeding: 0.2 });
    expect(mobs.mobs.bat!.effects).toEqual({});
    expect(mobs.mobs.rat!.effects).toEqual({ poisoned: 0.3 });
    expect([mobs.mobs.wolf!.attackS, mobs.mobs.boar!.attackS]).toEqual([1, 1.5]);
    for (const mob of Object.values(mobs.mobs)) expect(mob.kills).toBe(true);
  });

  it('leaves about 28% health after a whole wolf chase', () => {
    const wolf = mobs.mobs.wolf!;
    const bites = Math.floor(balance.mobs.chaseS / wolf.attackS);
    const left = (balance.body.maxHp - bites * wolf.dmg) / balance.body.maxHp;
    expect(left).toBeCloseTo(0.28, 2);
    // A second chase before healing still kills.
    expect(balance.body.maxHp - 2 * bites * wolf.dmg).toBeLessThanOrEqual(0);
  });
});

describe('effects stop at 1 health (GDD 3.22)', () => {
  it('has no death cutscene for bled or sickened', () => {
    expect(Object.keys(cutscenes.deaths).sort()).toEqual([
      'creature',
      'ejected',
      'knife',
      'poison',
      'shot',
      'wolf',
    ]);
    expect(CutsceneDeathCause.options).not.toContain('bled');
    expect(CutsceneDeathCause.options).not.toContain('sickened');
    expect(Object.keys(cutscenes.cutscenes)).not.toContain('deathBled');
    expect(Object.keys(cutscenes.cutscenes)).not.toContain('deathSickened');
  });
});
