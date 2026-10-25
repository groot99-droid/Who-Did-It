import { describe, expect, it } from 'vitest';
import { clearStudioMarker, firstScene, hasStudioMarker, setStudioMarker, STUDIO_MARKER } from './route';

const memory = () => {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};

describe('firstScene', () => {
  it('starts the Studio on #/studio', () => {
    expect(firstScene({ admin: false, studio: true }, false)).toBe('Studio');
  });

  it('keeps a normal #/admin landing on Admin when the marker is missing', () => {
    expect(firstScene({ admin: true, studio: false }, false)).toBe('Admin');
  });

  it('sends the admin landing on to the Studio when the sign-in button left the marker', () => {
    expect(firstScene({ admin: true, studio: false }, true)).toBe('Studio');
  });

  it('never lets the marker change the player routes', () => {
    expect(firstScene({ admin: false, studio: false }, true)).toBe('Intro');
  });
});

describe('the marker', () => {
  it('is set, read and cleared once used', () => {
    const store = memory();
    expect(hasStudioMarker(store)).toBe(false);
    setStudioMarker(store);
    expect(store.m.get(STUDIO_MARKER)).toBe('1');
    expect(hasStudioMarker(store)).toBe(true);
    clearStudioMarker(store);
    expect(hasStudioMarker(store)).toBe(false);
    expect(firstScene({ admin: true, studio: false }, hasStudioMarker(store))).toBe('Admin');
  });

  it('survives storage that throws', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => setStudioMarker(blocked)).not.toThrow();
    expect(hasStudioMarker(blocked)).toBe(false);
    expect(() => clearStudioMarker(blocked)).not.toThrow();
  });
});
