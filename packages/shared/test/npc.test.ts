import { describe, expect, it } from 'vitest';
import {
  HEADINGS,
  chancePerTick,
  mulberry32,
  npcDelayTicks,
  pickNpcNames,
  pickSuspect,
  pluralityOf,
  tilePath,
} from '../src/rules';

describe('pickNpcNames (GDD 3.12)', () => {
  const pool = ['Mabel', 'Wilf', 'Dora Finch', 'Alfie', 'Edith'];

  it('never hands out a name a seat already holds, whatever its case or spacing', () => {
    const names = pickNpcNames(pool, [' mabel ', 'WILF'], 3, mulberry32(7));
    expect(names).toHaveLength(3);
    expect(new Set(names.map((n) => n.toLowerCase()))).not.toContain('mabel');
    expect(names).not.toContain('Wilf');
    expect(new Set(names).size).toBe(3);
  });

  it('is seeded: the same seed gives the same order', () => {
    expect(pickNpcNames(pool, [], 5, mulberry32(3))).toEqual(pickNpcNames(pool, [], 5, mulberry32(3)));
  });

  it('throws when the pool cannot fill the seats', () => {
    expect(() => pickNpcNames(pool, ['Mabel'], 5, mulberry32(1))).toThrow(/name pool/);
  });
});

describe('NPC decision helpers (M3c)', () => {
  it('draws delays inside the range, in ticks', () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 200; i++) {
      const t = npcDelayTicks(rng, 3, 12, 20);
      expect(t).toBeGreaterThanOrEqual(60);
      expect(t).toBeLessThanOrEqual(240);
    }
  });

  it('chancePerTick compounds back to the chance per ten seconds', () => {
    for (const p of [0.25, 0.4, 0.6]) {
      const q = chancePerTick(p, 20);
      expect(1 - Math.pow(1 - q, 200)).toBeCloseTo(p, 6);
    }
    expect(chancePerTick(0, 20)).toBe(0);
    expect(chancePerTick(1, 20)).toBe(1);
  });

  it('has eight unit headings', () => {
    expect(HEADINGS).toHaveLength(8);
    for (const h of HEADINGS) expect(Math.hypot(h.dx, h.dy)).toBeCloseTo(1, 2);
    expect(HEADINGS[0]).toEqual({ dx: 0, dy: -1 });
  });

  it('pickSuspect takes the top positive score and nothing when all are zero', () => {
    const rng = mulberry32(2);
    const scores = new Map([
      ['a', 1],
      ['b', 3],
      ['c', 3],
    ]);
    const seen = new Set<string | null>();
    for (let i = 0; i < 40; i++) seen.add(pickSuspect(scores, ['a', 'b', 'c'], rng));
    expect([...seen].sort()).toEqual(['b', 'c']);
    expect(pickSuspect(scores, ['a', 'd'], rng)).toBe('a');
    expect(pickSuspect(new Map(), ['a', 'b'], rng)).toBeNull();
  });

  it('pluralityOf follows the majority and is null on no votes', () => {
    const rng = mulberry32(9);
    expect(pluralityOf(['x', 'y', 'x'], rng)).toBe('x');
    expect(pluralityOf([], rng)).toBeNull();
  });

  it('tilePath routes around walls and fails when sealed off', () => {
    const rows = ['....', '.##.', '....'];
    const solid = (x: number, y: number) => rows[y]?.[x] === '#';
    const path = tilePath(4, 3, solid, { x: 0, y: 1 }, (x, y) => x === 3 && y === 1);
    expect(path).not.toBeNull();
    expect(path?.[0]).toEqual({ x: 0, y: 1 });
    expect(path?.at(-1)).toEqual({ x: 3, y: 1 });
    for (const t of path ?? []) expect(solid(t.x, t.y)).toBe(false);
    const sealed = ['.#.', '.#.'];
    expect(
      tilePath(
        3,
        2,
        (x, y) => sealed[y]?.[x] === '#',
        { x: 0, y: 0 },
        (x) => x === 2,
      ),
    ).toBeNull();
  });
});
