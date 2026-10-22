import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUDIO_SETTINGS_KEY,
  onAudioSettings,
  parseAudioSettings,
  readAudioSettings,
  writeAudioSettings,
} from './audioSettings';

function fakeStorage() {
  const m = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  });
  return m;
}

afterEach(() => vi.unstubAllGlobals());

describe('audio settings', () => {
  it('reads the defaults from nothing, from damage and from wrong types', () => {
    const d = { music: 1, sfx: 1, muted: false };
    expect(parseAudioSettings(null)).toEqual(d);
    expect(parseAudioSettings('{nope')).toEqual(d);
    expect(parseAudioSettings('{"music":"loud","muted":"yes"}')).toEqual(d);
  });

  it('clamps stored volumes', () => {
    expect(parseAudioSettings('{"music":3,"sfx":-1,"muted":true}')).toEqual({
      music: 1,
      sfx: 0,
      muted: true,
    });
  });

  it('persists a write and reads it back', () => {
    const store = fakeStorage();
    writeAudioSettings({ music: 0.25, sfx: 0.5, muted: true });
    expect(JSON.parse(store.get(AUDIO_SETTINGS_KEY)!)).toEqual({ music: 0.25, sfx: 0.5, muted: true });
    expect(readAudioSettings()).toEqual({ music: 0.25, sfx: 0.5, muted: true });
  });

  it('survives storage that throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(readAudioSettings()).toEqual({ music: 1, sfx: 1, muted: false });
    expect(() => writeAudioSettings({ music: 0, sfx: 0, muted: true })).not.toThrow();
  });

  it('tells listeners about a write until they unsubscribe', () => {
    fakeStorage();
    const seen: number[] = [];
    const off = onAudioSettings((s) => seen.push(s.music));
    writeAudioSettings({ music: 0.5, sfx: 1, muted: false });
    off();
    writeAudioSettings({ music: 0.1, sfx: 1, muted: false });
    expect(seen).toEqual([0.5]);
  });
});
