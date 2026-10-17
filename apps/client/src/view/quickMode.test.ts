import { describe, expect, it } from 'vitest';
import onubBalance from '@wdi/content/data/balance.onub.json';
import { TILE_PX } from '@wdi/shared/constants';
import {
  ACT_RANGE_PX,
  bakerySpots,
  pickAct,
  promptFor,
  revealLine,
  windowActs,
  type Spot,
} from './quickMode';

const listed = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `bk.plate_${i}`,
    kind: 'plate',
    turned: false,
    of: `seat${i}`,
  }));
const px = (t: number) => (t + 0.5) * TILE_PX;
const spots = bakerySpots(listed(6));
const at = (id: string): Spot => spots.find((s) => s.id === id)!;
const stand = (s: Spot, dx = 0) => ({ x: s.x + dx, y: s.y });

describe('bakery spots', () => {
  it('draws only the plates the server lists, at their tile centres, with the owner', () => {
    expect(spots.filter((s) => s.kind === 'plate')).toHaveLength(6);
    expect(at('bk.plate_0')).toMatchObject({ x: px(6), y: px(4), of: 'seat0' });
    expect(bakerySpots([]).some((s) => s.kind === 'plate')).toBe(false);
    expect(spots.filter((s) => s.kind === 'deadLoaf')).toHaveLength(onubBalance.deadLoaves);
  });
});

describe('window acts', () => {
  it('reads the acts, targets and holds from balance.onub.json', () => {
    expect(windowActs('cutpurse')).toEqual([
      { act: 'onub.take', picks: 1, target: 'otherPlate', holdS: onubBalance.acts['onub.take'].holdS },
    ]);
    expect(windowActs('pallbearer')).toEqual([]);
    expect(windowActs('sinEater').map((a) => a.act)).toEqual(['onub.peekPlate', 'onub.peekDead']);
  });
});

describe('pickAct', () => {
  const base = { spots, selfId: 'seat0', first: null, alone: true } as const;

  it('never offers the own plate for an otherPlate act', () => {
    const own = at('bk.plate_0');
    expect(pickAct({ ...base, role: 'cutpurse', self: stand(own) })?.prop.id).not.toBe('bk.plate_0');
    // Far from every other plate: nothing to take, and the own plate is not offered instead.
    expect(pickAct({ ...base, role: 'cutpurse', self: { x: own.x - 10 * TILE_PX, y: own.y } })).toBeNull();
  });

  it('offers the nearest legal prop within the act range, and nothing beyond it', () => {
    const p1 = at('bk.plate_1');
    expect(pickAct({ ...base, role: 'cutpurse', self: stand(p1) })?.prop.id).toBe('bk.plate_1');
    expect(pickAct({ ...base, role: 'cutpurse', self: stand(p1, ACT_RANGE_PX + TILE_PX * 4) })).toBeNull();
  });

  it('offers the lamplighter only its own plate, and the hireling only the ledger', () => {
    const own = at('bk.plate_0');
    expect(pickAct({ ...base, role: 'lamplighter', self: stand(own) })?.prop.id).toBe('bk.plate_0');
    expect(pickAct({ ...base, role: 'lamplighter', self: stand(at('bk.plate_3')) })).toBeNull();
    const ledger = at('bk.ledger');
    expect(pickAct({ ...base, role: 'hireling', self: stand(ledger) })?.prop.id).toBe('bk.ledger');
    expect(pickAct({ ...base, role: 'hireling', self: stand(own) })).toBeNull();
  });

  it('keeps the first pick out of the second and prompts for the second pick', () => {
    const p1 = at('bk.plate_1');
    const first = pickAct({ ...base, role: 'busybody', self: stand(p1) })!;
    expect(first.act.picks).toBe(2);
    expect(first.second).toBe(false);
    expect(promptFor(first)).toBe('Pick a loaf to swap');
    const second = pickAct({
      ...base,
      role: 'busybody',
      self: stand(p1),
      first: { act: first.act.act, targetId: first.prop.id },
    })!;
    expect(second.second).toBe(true);
    expect(second.prop.id).not.toBe(first.prop.id);
    expect(promptFor(second)).toBe('Pick the second loaf');
  });

  it('offers a lone-Poisoner peek only when alone, and each Sin-Eater act on its own prop kind', () => {
    const dead = at('bk.deadloaf_0');
    expect(pickAct({ ...base, role: 'poisoner', self: stand(dead) })?.act.act).toBe('onub.peekDead');
    expect(pickAct({ ...base, role: 'poisoner', self: stand(dead), alone: false })).toBeNull();
    expect(pickAct({ ...base, role: 'sinEater', self: stand(dead) })?.act.act).toBe('onub.peekDead');
    expect(pickAct({ ...base, role: 'sinEater', self: stand(at('bk.plate_2')) })?.act.act).toBe(
      'onub.peekPlate',
    );
  });

  it('offers nothing for a window without acts', () => {
    expect(pickAct({ ...base, role: 'pallbearer', self: stand(at('bk.plate_1')) })).toBeNull();
    expect(pickAct({ ...base, role: 'nobody', self: stand(at('bk.plate_1')) })).toBeNull();
  });
});

describe('revealLine', () => {
  it('names the seat for a plate and only the role for a dead loaf', () => {
    const nameOf = (id: string) => (id === 'seat2' ? 'Hana' : '?');
    expect(revealLine({ slot: 'bk.plate_2', of: 'seat2', roleId: 'sinEater' }, nameOf)).toBe(
      'Hana: Sin-Eater',
    );
    expect(revealLine({ slot: 'bk.deadloaf_1', of: '', roleId: 'mourner' }, nameOf)).toBe('Mourner');
  });
});
