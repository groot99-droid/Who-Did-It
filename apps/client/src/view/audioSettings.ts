/**
 * The audio settings (round 6, docs/round6/cutscene-music.md 3): `localStorage['wdi:audio']`, beside `wdi:art`.
 * Pre-seeded by 6Z with the defaults; Session 6L fills the persistence and the settings panel reads it.
 */
export const AUDIO_SETTINGS_KEY = 'wdi:audio';

export interface AudioSettings {
  music: number;
  sfx: number;
  muted: boolean;
}

export function readAudioSettings(): AudioSettings {
  return { music: 1, sfx: 1, muted: false }; // 6L
}

export function writeAudioSettings(_settings: AudioSettings): void {
  // 6L
}
