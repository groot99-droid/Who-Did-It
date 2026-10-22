import { getItem, setItem } from '../net/storage';

/**
 * The audio settings (round 6, docs/round6/cutscene-music.md 3): `localStorage['wdi:audio']`, beside `wdi:art`.
 * The settings panel writes them; the `MusicBus` and the `AudioBus` follow through `onAudioSettings`, so a slider
 * moves the sound that is already playing. A missing or damaged value reads as the defaults.
 */
export const AUDIO_SETTINGS_KEY = 'wdi:audio';

export interface AudioSettings {
  /** Music volume, 0 to 1. */
  music: number;
  /** Sound-effect and ambience volume, 0 to 1. */
  sfx: number;
  muted: boolean;
}

export const DEFAULT_AUDIO_SETTINGS: Readonly<AudioSettings> = { music: 1, sfx: 1, muted: false };

const clamp01 = (n: unknown, fallback: number): number =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;

/** Reads a stored string into settings; anything that does not parse falls back field by field. */
export function parseAudioSettings(raw: string | null): AudioSettings {
  let v: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) v = parsed as Record<string, unknown>;
  } catch {
    // damaged value: defaults
  }
  return {
    music: clamp01(v.music, DEFAULT_AUDIO_SETTINGS.music),
    sfx: clamp01(v.sfx, DEFAULT_AUDIO_SETTINGS.sfx),
    muted: v.muted === true,
  };
}

const listeners = new Set<(s: AudioSettings) => void>();

export function readAudioSettings(): AudioSettings {
  return parseAudioSettings(getItem(AUDIO_SETTINGS_KEY));
}

export function writeAudioSettings(settings: AudioSettings): void {
  const next: AudioSettings = {
    music: clamp01(settings.music, DEFAULT_AUDIO_SETTINGS.music),
    sfx: clamp01(settings.sfx, DEFAULT_AUDIO_SETTINGS.sfx),
    muted: settings.muted,
  };
  setItem(AUDIO_SETTINGS_KEY, JSON.stringify(next));
  for (const l of [...listeners]) l(next);
}

/** Calls `fn` after every write, in this tab; returns the unsubscribe. */
export function onAudioSettings(fn: (s: AudioSettings) => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
