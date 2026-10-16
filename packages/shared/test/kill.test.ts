import { describe, expect, it } from 'vitest';
import { NavGrid, type NavData } from '../src/nav';
import { ErrorCode } from '../src/protocol';
import {
  besideTile,
  evictOverCap,
  mulberry32,
  segmentBlocked,
  trailDir,
  validateKill,
  type KillInput,
} from '../src/rules';

const open = () => false;
const base = (over: Partial<KillInput> = {}): KillInput => ({
  tick: 100,
  phaseOk: true,
  actorDead: false,
  actorPlaced: true,
  busyUntilTick: 0,
  cooldownEndTick: 0,
  targetDead: false,
  targetPlaced: true,
  sameScene: true,
  targetInTransit: false,
  actorX: 0,
  actorY: 0,
  targetX: 90,
  targetY: 0,
  targetMovedPx: 0,
  rangePx: 96,
  solidBetween: open,
  ...over,
});
const code = (i: KillInput) => {
  const v = validateKill(i);
  return v.ok ? 0 : v.code;
};

describe('validateKill', () => {
  it('accepts a clear strike inside the range', () => expect(code(base())).toBe(0));
  it('refuses a ghost, an unplaced actor and a wrong phase in that order', () => {
    expect(code(base({ actorDead: true, phaseOk: false }))).toBe(ErrorCode.cannot);
    expect(code(base({ actorPlaced: false }))).toBe(ErrorCode.cannot);
    expect(code(base({ phaseOk: false, busyUntilTick: 500 }))).toBe(ErrorCode.wrongPhase);
  });
  it('refuses busy before cooldown', () => {
    expect(code(base({ busyUntilTick: 101, cooldownEndTick: 500 }))).toBe(ErrorCode.busy);
    expect(code(base({ cooldownEndTick: 101 }))).toBe(ErrorCode.cooldown);
    expect(code(base({ cooldownEndTick: 100 }))).toBe(0);
  });
  it('refuses dead, unplaced, other-scene and in-transit targets', () => {
    for (const o of [
      { targetDead: true },
      { targetPlaced: false },
      { sameScene: false },
      { targetInTransit: true },
    ]) {
      expect(code(base(o))).toBe(ErrorCode.cannot);
    }
  });
  it('adds the ring slack to the range and not a pixel more', () => {
    expect(code(base({ targetX: 97 }))).toBe(ErrorCode.outOfRange);
    expect(code(base({ targetX: 97, targetMovedPx: 1 }))).toBe(0);
    expect(code(base({ targetX: 97, targetMovedPx: 0.5 }))).toBe(ErrorCode.outOfRange);
    expect(code(base({ targetX: 97, targetMovedPx: -50 }))).toBe(ErrorCode.outOfRange);
  });
  it('refuses a strike through a wall', () => {
    expect(code(base({ solidBetween: () => true }))).toBe(ErrorCode.cannot);
  });
  it('property: reach is exactly range + slack, in any direction', () => {
    const rng = mulberry32(7);
    for (let n = 0; n < 500; n++) {
      const a = rng() * Math.PI * 2;
      const moved = rng() * 40;
      const dist = rng() * 200;
      const i = base({
        targetX: Math.cos(a) * dist,
        targetY: Math.sin(a) * dist,
        targetMovedPx: moved,
      });
      expect(code(i) === 0).toBe(dist <= 96 + moved);
    }
  });
});

const grid = (rows: string[]): NavGrid => {
  const data: NavData = {
    version: 1,
    sceneId: 't',
    tile: 64,
    w: rows[0]!.length,
    h: rows.length,
    solid: rows,
    gates: [],
  };
  return new NavGrid(data, 'small');
};

describe('segmentBlocked', () => {
  const g = grid(['00000', '00100', '00000']);
  it('sees a wall on the line and not beside it', () => {
    expect(segmentBlocked(g, 32, 96, 288, 96)).toBe(true);
    expect(segmentBlocked(g, 32, 32, 288, 32)).toBe(false);
  });
  it('is symmetric and blocks at an end point inside a wall', () => {
    const rng = mulberry32(11);
    for (let n = 0; n < 300; n++) {
      const [ax, ay, bx, by] = [rng() * 320, rng() * 192, rng() * 320, rng() * 192] as const;
      expect(segmentBlocked(g, ax, ay, bx, by)).toBe(segmentBlocked(g, bx, by, ax, ay));
    }
    expect(segmentBlocked(g, 32, 32, 160, 96)).toBe(true);
  });
});

describe('clue placement', () => {
  it('points the trail toward the target tile', () => {
    expect(trailDir(5, 5, 5, 0)).toBe(0); // n
    expect(trailDir(5, 5, 9, 5)).toBe(2); // e
    expect(trailDir(5, 5, 5, 9)).toBe(4); // s
    expect(trailDir(5, 5, 0, 5)).toBe(6); // w
  });
  it('puts the thread on a walkable neighbour, edges first, nearest to the kill', () => {
    const wall = (x: number, y: number) => !(x === 10 && y === 11) && !(x === 11 && y === 10);
    // the south edge is blocked in this fixture, so only the east and north edges and corners remain
    expect(besideTile({ x: 10, y: 10 }, { x: 14, y: 10 }, (x, y) => !wall(x, y))).toEqual({ x: 11, y: 10 });
    expect(besideTile({ x: 10, y: 10 }, { x: 0, y: 0 }, () => false)).toEqual({ x: 10, y: 10 });
  });
  it('evicts the oldest claimed clue first, then the oldest, never a kept one', () => {
    const clues = [
      { id: 'a', claimed: false, seq: 1 },
      { id: 'b', claimed: true, seq: 2 },
      { id: 'c', claimed: true, seq: 3 },
      { id: 'd', claimed: false, seq: 4 },
    ];
    expect(evictOverCap(clues, 4)).toEqual([]);
    expect(evictOverCap(clues, 3)).toEqual(['b']);
    expect(evictOverCap(clues, 1)).toEqual(['b', 'c', 'a']);
    expect(evictOverCap(clues, 3, new Set(['b']))).toEqual(['c']);
  });
});
