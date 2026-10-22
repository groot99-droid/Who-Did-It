import { describe, expect, it } from 'vitest';
import { isValidCode, readFlags } from './index';

describe('readFlags', () => {
  it('defaults to no flags', () => {
    expect(readFlags('', '')).toEqual({
      art: 'default',
      mock: false,
      mode: 'main',
      onub: false,
      joinCode: null,
      resumeCode: null,
      admin: false,
    });
  });

  it('reads the quick-mode flag for the mocks', () => {
    expect(readFlags('?mode=onub', '').mode).toBe('onub');
    expect(readFlags('?mode=other', '').mode).toBe('main');
  });

  it('offers the live quick-mode toggle only with onub=1', () => {
    expect(readFlags('?onub=1', '').onub).toBe(true);
    expect(readFlags('?onub=0', '').onub).toBe(false);
    expect(readFlags('?mode=onub', '').onub).toBe(false);
  });

  it('reads art and mock query flags', () => {
    const f = readFlags('?art=placeholder&mock=1', '');
    expect(f.art).toBe('placeholder');
    expect(f.mock).toBe(true);
  });

  it('ignores unknown art values and mock=0', () => {
    const f = readFlags('?art=final&mock=0', '');
    expect(f.art).toBe('default');
    expect(f.mock).toBe(false);
  });

  it('upper-cases the deep link code', () => {
    expect(readFlags('', '#/join/k7m2p').joinCode).toBe('K7M2P');
  });

  it('rejects malformed codes', () => {
    expect(readFlags('', '#/join/abc').joinCode).toBeNull();
    expect(readFlags('', '#/join/abcdef').joinCode).toBeNull();
    expect(isValidCode('ab-de')).toBe(false);
  });

  it('reads the lobby resume route', () => {
    expect(readFlags('', '#/lobby/K7M2P').resumeCode).toBe('K7M2P');
    expect(readFlags('', '#/admin').admin).toBe(true);
    expect(readFlags('', '#/lobby/K7M2P').admin).toBe(false);
  });
});
