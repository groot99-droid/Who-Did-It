import { describe, expect, it } from 'vitest';
import { TRAILER_PLAYLIST, trailerAllowed } from './landingTrailer';

const env = { reducedMotion: false, saveData: false, search: '' };

describe('trailerAllowed', () => {
  it('plays by default', () => {
    expect(trailerAllowed(env)).toBe(true);
  });

  it('skips under reduced motion', () => {
    expect(trailerAllowed({ ...env, reducedMotion: true })).toBe(false);
  });

  it('skips under the data saver', () => {
    expect(trailerAllowed({ ...env, saveData: true })).toBe(false);
  });

  it('skips with ?video=0 and plays with any other value', () => {
    expect(trailerAllowed({ ...env, search: '?mock=1&video=0' })).toBe(false);
    expect(trailerAllowed({ ...env, search: '?video=1' })).toBe(true);
  });
});

describe('TRAILER_PLAYLIST', () => {
  it('is the lobby playlist, the theme (A98)', () => {
    expect(TRAILER_PLAYLIST).toBe('lobby');
  });
});
