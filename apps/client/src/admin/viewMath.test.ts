import { describe, expect, it } from 'vitest';
import type { AdminSeat } from '@wdi/shared/protocol';
import { AnimId, StatusBit } from '../view/animIds';
import { diamondCentre, fitZoom, snapsOf } from './viewMath';

const seat = (id: string, x: number, y: number, extra: Partial<AdminSeat> = {}): AdminSeat => ({
  id,
  name: id,
  roleId: 'townsfolk',
  look: 'townsfolk',
  sceneId: 'overworld',
  x,
  y,
  dead: false,
  ...extra,
});

describe('fitZoom', () => {
  it('fits a big scene into a cell and never magnifies a small one', () => {
    expect(fitZoom({ w: 40, h: 40 }, { w: 426, h: 360 })).toBeLessThan(0.5);
    expect(fitZoom({ w: 2, h: 2 }, { w: 1280, h: 720 })).toBe(1);
  });

  it('centres on the diamond', () => {
    const c = diamondCentre({ w: 10, h: 10 });
    expect(c.x).toBeCloseTo(0);
    expect(c.y).toBeGreaterThan(0);
  });
});

describe('snapsOf', () => {
  it('draws a seat under its own id as both the roster row and the avatar', () => {
    const { players, avatars } = snapsOf([seat('a', 100, 100, { look: 'baker' })], new Map());
    expect(players[0]).toMatchObject({ id: 'a', look: 'baker', alive: true, presence: null });
    expect(avatars[0]).toMatchObject({ handle: 'a', lookOf: 'a', animId: AnimId.idle });
  });

  it('walks a seat that moved, facing the step, and keeps the facing when it stops', () => {
    const first = snapsOf([seat('a', 100, 100)], new Map());
    const moved = snapsOf([seat('a', 110, 100)], first.poses);
    expect(moved.avatars[0]?.animId).toBe(AnimId.walk);
    expect(moved.avatars[0]?.yaw).toBeCloseTo(Math.PI / 2);
    const still = snapsOf([seat('a', 110, 100)], moved.poses);
    expect(still.avatars[0]?.animId).toBe(AnimId.idle);
    expect(still.avatars[0]?.yaw).toBeCloseTo(Math.PI / 2);
  });

  it('marks a dead seat as a ghost', () => {
    const { avatars, players } = snapsOf([seat('a', 1, 1, { dead: true })], new Map());
    expect(avatars[0]?.statusBits).toBe(StatusBit.ghost);
    expect(players[0]?.alive).toBe(false);
  });
});
