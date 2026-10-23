import { describe, expect, it } from 'vitest';
import { parseSeeds, setupPayload, statusLine } from './Controls';

describe('seed words', () => {
  it('parses one stream per line', () => {
    expect(parseSeeds('world 1 2 3 4\nnpc, 5, 6, 7, 8')).toEqual({
      ok: true,
      seeds: { world: [1, 2, 3, 4], npc: [5, 6, 7, 8] },
    });
    expect(parseSeeds('  \n')).toEqual({ ok: true, seeds: undefined });
  });

  it('names the line it cannot read', () => {
    expect(parseSeeds('world 1 2 3')).toEqual({ ok: false, line: 'world 1 2 3' });
    expect(parseSeeds('world 1 2 x 4')).toEqual({ ok: false, line: 'world 1 2 x 4' });
    expect(parseSeeds('world 1 2 3 -4')).toEqual({ ok: false, line: 'world 1 2 3 -4' });
  });
});

describe('setup payload', () => {
  const form = {
    map: 'hollowmere',
    seats: 6,
    difficulty: 'hard',
    deck: '',
    seeds: undefined,
  } as const;

  it('omits an empty deck and absent seeds', () => {
    expect(setupPayload(form)).toEqual({ map: 'hollowmere', mode: 'main', seats: 6, difficulty: 'hard' });
  });

  it('carries the deck and seeds and clamps the seats', () => {
    const p = setupPayload({
      ...form,
      seats: 40,
      deck: 'killer, detective ,',
      seeds: { world: [1, 2, 3, 4] },
    });
    expect(p).toMatchObject({ seats: 10, deck: ['killer', 'detective'], seeds: { world: [1, 2, 3, 4] } });
    expect(setupPayload({ ...form, seats: 1 }).seats).toBe(4);
  });
});

describe('status line', () => {
  it('reads the effective speed or the pause', () => {
    expect(statusLine({ tick: 9, phase: 1, paused: false, effectiveScale: 4.96 })).toBe(
      'Tick 9, phase 1, speed 5x',
    );
    expect(statusLine({ tick: 9, phase: 1, paused: true, effectiveScale: 0 })).toBe(
      'Tick 9, phase 1, paused',
    );
  });
});
