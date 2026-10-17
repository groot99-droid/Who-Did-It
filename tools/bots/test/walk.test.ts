import { describe, expect, it } from 'vitest';
import { DIR_VECTORS, mulberry, pickVote } from '../walk';

describe('walk helpers', () => {
  it('reproduces a run from its seed', () => {
    const a = mulberry(7);
    const b = mulberry(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(mulberry(8)()).not.toBe(mulberry(7)());
  });

  it('has 8 unit direction vectors starting north (screen up)', () => {
    expect(DIR_VECTORS).toHaveLength(8);
    expect(DIR_VECTORS[0]).toEqual({ dx: 0, dy: -1 });
    expect(DIR_VECTORS[2]).toEqual({ dx: 1, dy: 0 });
    for (const v of DIR_VECTORS) expect(Math.hypot(v.dx, v.dy)).toBeCloseTo(1, 2);
  });
});

describe('pickVote', () => {
  const roster = [
    { id: 'a', name: 'Hana', alive: true },
    { id: 'b', name: 'Gus', alive: true },
    { id: 'c', name: 'Mo', alive: false },
  ];

  it('casts Skip, the leader, or a player by name', () => {
    expect(pickVote('skip', 'b', 'a', roster, mulberry(1))).toBe('skip');
    expect(pickVote('leader', 'b', 'a', roster, mulberry(1))).toBe('a');
    expect(pickVote('Gus', 'a', 'a', roster, mulberry(1))).toBe('b');
  });

  it('falls back to Skip for a dead or unknown target', () => {
    expect(pickVote('Mo', 'a', 'a', roster, mulberry(1))).toBe('skip');
    expect(pickVote('Nobody', 'a', 'a', roster, mulberry(1))).toBe('skip');
    expect(pickVote('leader', 'a', 'c', roster, mulberry(1))).toBe('skip');
  });

  it('random picks a living player other than itself, or Skip', () => {
    const rng = mulberry(3);
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) seen.add(pickVote('random', 'a', 'a', roster, rng));
    expect([...seen].sort()).toEqual(['b', 'skip']);
  });
});

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
