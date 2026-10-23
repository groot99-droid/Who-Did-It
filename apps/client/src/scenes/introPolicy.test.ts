import { describe, expect, it } from 'vitest';
import { introAllowed, parseIntroRow } from './introPolicy';

const env = { reducedMotion: false, saveData: false, search: '', mock: false, resuming: false, seen: false };

describe('introAllowed', () => {
  it('plays on a first visit', () => {
    expect(introAllowed(env)).toBe(true);
  });

  it('plays once per browser session', () => {
    expect(introAllowed({ ...env, seen: true })).toBe(false);
  });

  it('skips under reduced motion and the data saver', () => {
    expect(introAllowed({ ...env, reducedMotion: true })).toBe(false);
    expect(introAllowed({ ...env, saveData: true })).toBe(false);
    expect(introAllowed({ ...env, reducedMotion: true, search: '?intro=1' })).toBe(false);
  });

  it('skips with ?intro=0', () => {
    expect(introAllowed({ ...env, search: '?intro=0' })).toBe(false);
  });

  it('stays out of the mock e2e unless ?intro=1', () => {
    expect(introAllowed({ ...env, mock: true, search: '?mock=1' })).toBe(false);
    expect(introAllowed({ ...env, mock: true, search: '?mock=1&intro=1' })).toBe(true);
    expect(introAllowed({ ...env, mock: true, search: '?mock=1&intro=1', seen: true })).toBe(false);
  });

  it('does not play over a rejoin', () => {
    expect(introAllowed({ ...env, resuming: true })).toBe(false);
  });
});

describe('parseIntroRow', () => {
  it('reads the intro row with its poster', () => {
    const raw = {
      version: 1,
      entries: [
        { key: 'x', url: 'x.webm' },
        { key: 'intro', url: 'intro.webm', poster: 'intro.jpg' },
      ],
    };
    expect(parseIntroRow(raw)).toEqual({ url: 'intro.webm', poster: 'intro.jpg' });
  });

  it('copes with a row without a poster', () => {
    expect(parseIntroRow({ entries: [{ key: 'intro', url: 'intro.webm' }] })).toEqual({ url: 'intro.webm' });
  });

  it('reads a missing or damaged manifest as no intro', () => {
    expect(parseIntroRow(null)).toBeNull();
    expect(parseIntroRow({})).toBeNull();
    expect(parseIntroRow({ entries: [{ key: 'intro' }, { key: 'landing_loop', url: 'l.webm' }] })).toBeNull();
  });
});
