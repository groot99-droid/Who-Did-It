import { describe, expect, it } from 'vitest';
import * as content from '../src/index.js';
import { names, validateNames } from '../src/server.js';

// The cast of WORLD.md 1 and GDD 3.11: an NPC seat that took one of these names would read as the
// landmark itself, so the pool never borrows a word from them.
const CAST = ['Aldous', 'Vane', 'Tamsin', 'Crumb', 'Grieves', 'Fennick', 'Bray', 'Mallory', 'Tuck'];

describe('the NPC name pool (GDD 3.12, A39)', () => {
  it('is valid: lobby-legal, unique, free of role tokens, enough for a full party', () => {
    expect(validateNames(names)).toEqual([]);
  });

  it('flags a duplicate, a role token and an illegal length', () => {
    const bad = { gddRef: '3.12', pool: [...names.pool, names.pool[0] as string, 'Killer Kate', 'X'] };
    const errors = validateNames(bad);
    expect(errors.some((e) => e.includes('twice'))).toBe(true);
    expect(errors.some((e) => e.includes('role token killer'))).toBe(true);
    expect(errors.some((e) => e.includes('legal lobby name'))).toBe(true);
  });

  it('keeps the 1931 register: a capitalised first name, at most one surname, letters only', () => {
    for (const name of names.pool) expect(name).toMatch(/^[A-Z][a-z]+( [A-Z][a-z]+)?$/);
  });

  it('never borrows a word from the cast of Hollowmere', () => {
    const words = new Set(names.pool.flatMap((n) => n.split(' ')));
    for (const who of CAST) expect(words.has(who)).toBe(false);
  });

  it('never reaches the client entry point', () => {
    expect(Object.keys(content)).not.toContain('names');
    expect(Object.keys(content)).not.toContain('validateNames');
  });
});
