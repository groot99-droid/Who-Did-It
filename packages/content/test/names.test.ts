import { describe, expect, it } from 'vitest';
import * as content from '../src/index.js';
import { names, validateNames } from '../src/server.js';

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

  it('never reaches the client entry point', () => {
    expect(Object.keys(content)).not.toContain('names');
    expect(Object.keys(content)).not.toContain('validateNames');
  });
});
