import { describe, expect, it } from 'vitest';
import type { AvatarSnap } from '../net/world';
import { StatusBit } from './animIds';
import { nearestAvatar } from './targets';

const av = (handle: string, x: number, y: number, statusBits = 0): AvatarSnap => ({
  handle,
  lookOf: handle,
  height: 1,
  x,
  y,
  yaw: 0,
  animId: 0,
  statusBits,
  transitUntilTick: 0,
});

describe('nearestAvatar', () => {
  const me = av('me', 100, 100);

  it('picks the closest handle within range', () => {
    const list = [me, av('far', 400, 100), av('near', 160, 100), av('mid', 100, 220)];
    expect(nearestAvatar(list, 'me', 300)).toBe('near');
  });

  it('never picks the own handle, and null when nobody is in range', () => {
    expect(nearestAvatar([me], 'me', 300)).toBeNull();
    expect(nearestAvatar([me, av('far', 900, 100)], 'me', 300)).toBeNull();
  });

  it('skips figures in transit and ghosts', () => {
    const list = [
      me,
      av('door', 110, 100, StatusBit.transit),
      av('ghost', 120, 100, StatusBit.ghost),
      av('ok', 200, 100),
    ];
    expect(nearestAvatar(list, 'me', 300)).toBe('ok');
  });

  it('is null when the own avatar is not in the list', () => {
    expect(nearestAvatar([av('a', 0, 0)], 'me', 300)).toBeNull();
  });
});
