import { onubBalance } from '@wdi/content';
import { TILE_PX } from '@wdi/shared';
import { describe, expect, it } from 'vitest';
import { type PropLike, claimPayload, ownPlate, planNightAct, propPx, standingSpot } from '../quick';
import { mulberry, pickVote } from '../walk';

/** The bakery as dusk seeds it for 5 seats: plates 0 to 4 owned by s0 to s4, the dead's loaves and the ledger. */
const props: PropLike[] = [
  ...[0, 1, 2, 3, 4].map((n) => ({ id: `bk.plate_${n}`, kind: 'plate', of: `s${n}` })),
  ...[0, 1, 2].map((n) => ({ id: `bk.deadloaf_${n}`, kind: 'deadLoaf', of: '' })),
  { id: 'bk.ledger', kind: 'ledger', of: '' },
  { id: 'bk.oven', kind: 'oven', of: '' },
];

describe('pickVote other', () => {
  const roster = [
    { id: 'a', name: 'Hana', alive: true },
    { id: 'b', name: 'Gus', alive: true },
    { id: 'c', name: 'Mo', alive: false },
    { id: 'd', name: 'Ola', alive: true },
  ];

  it('is a random living seat other than itself and never Skip', () => {
    const rng = mulberry(5);
    const seen = new Set<string>();
    for (let i = 0; i < 80; i++) seen.add(pickVote('other', 'a', 'a', roster, rng));
    expect([...seen].sort()).toEqual(['b', 'd']);
  });

  it('falls back to Skip only when nobody else lives', () => {
    expect(pickVote('other', 'a', 'a', [roster[0]!], mulberry(1))).toBe('skip');
  });
});

describe('quick-mode plan', () => {
  it('finds the plate whose owner is the seat', () => {
    expect(ownPlate(props, 's3')?.id).toBe('bk.plate_3');
    expect(ownPlate(props, 'nobody')).toBeUndefined();
  });

  it('locates props in world pixels from the scene content', () => {
    expect(propPx('bk.plate_0')).toEqual({ x: 6.5 * TILE_PX, y: 4.5 * TILE_PX });
    expect(propPx('bk.nope')).toBeUndefined();
  });

  it('plans a legal act for every window role, over many seeds', () => {
    for (const w of onubBalance.windows) {
      for (let seed = 1; seed <= 40; seed++) {
        const plan = planNightAct(w.role, 's2', props, mulberry(seed));
        if (w.acts.length === 0) {
          expect(plan, w.role).toBeNull();
          continue;
        }
        expect(plan, w.role).not.toBeNull();
        const alt = w.acts.find((a) => a.act === plan!.abilityId);
        expect(alt, `${w.role} ${plan!.abilityId}`).toBeDefined();
        const target = onubBalance.acts[plan!.abilityId]!.target;
        const byId = (id: string) => props.find((p) => p.id === id)!;
        const ok = (id: string) => {
          const p = byId(id);
          if (target === 'otherPlate') return p.kind === 'plate' && p.of !== 's2';
          if (target === 'ownPlate') return p.kind === 'plate' && p.of === 's2';
          return p.kind === target;
        };
        expect(ok(plan!.targetId), `${w.role} target`).toBe(true);
        if (alt!.picks === 2) {
          expect(plan!.targetId2).toBeDefined();
          expect(plan!.targetId2).not.toBe(plan!.targetId);
          expect(ok(plan!.targetId2!), `${w.role} target2`).toBe(true);
        } else expect(plan!.targetId2).toBeUndefined();
      }
    }
  });

  it('never targets its own plate with an other-plate act', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const plan = planNightAct('cutpurse', 's0', props, mulberry(seed))!;
      expect(plan.targetId).not.toBe('bk.plate_0');
      const swap = planNightAct('busybody', 's0', props, mulberry(seed))!;
      expect([swap.targetId, swap.targetId2]).not.toContain('bk.plate_0');
    }
  });

  it('skips a window that needs the bot alone when it has a teammate', () => {
    expect(planNightAct('poisoner', 's0', props, mulberry(1), 1)).toBeNull();
    expect(planNightAct('poisoner', 's0', props, mulberry(1), 0)?.abilityId).toBe('onub.peekDead');
  });

  it('picks the pair nearest the first so one standing spot reaches both', () => {
    const plan = planNightAct('busybody', 's9', props, mulberry(2))!;
    const spot = standingSpot(plan)!;
    for (const id of [plan.targetId, plan.targetId2!]) {
      const at = propPx(id)!;
      expect(Math.hypot(at.x - spot.x, at.y - spot.y)).toBeLessThanOrEqual(
        onubBalance.actRangeTiles * TILE_PX * 0.9,
      );
    }
  });

  it('plans nothing when a window has too few legal targets', () => {
    const lonely = props.filter((p) => p.kind !== 'plate' || p.of === 's0');
    expect(planNightAct('cutpurse', 's0', lonely, mulberry(1))).toBeNull();
  });
});

describe('claims', () => {
  it('claims the dealt role, with the last reveal when it named a seat', () => {
    expect(claimPayload('cutpurse')).toEqual({ roleId: 'cutpurse' });
    expect(claimPayload('cutpurse', { of: 's2', roleId: 'mourner' })).toEqual({
      roleId: 'cutpurse',
      targetId: 's2',
      sawRoleId: 'mourner',
    });
    expect(claimPayload('sinEater', { of: '', roleId: 'debtor' })).toEqual({ roleId: 'sinEater' });
  });
});
