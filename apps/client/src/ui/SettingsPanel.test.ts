import { describe, expect, it } from 'vitest';
import { SETTINGS_COPY } from './copy';
import { toPercent, toVolume } from './SettingsPanel';

describe('settings panel', () => {
  it('maps a slider position to a volume and back', () => {
    expect(toVolume(0)).toBe(0);
    expect(toVolume(100)).toBe(1);
    expect(toVolume(250)).toBe(1);
    expect(toVolume(-5)).toBe(0);
    expect(toPercent(toVolume(37))).toBe(37);
  });

  it('has copy for every control', () => {
    expect(Object.keys(SETTINGS_COPY)).toEqual(
      expect.arrayContaining(['settings.open', 'settings.music', 'settings.sfx', 'settings.mute']),
    );
  });
});
