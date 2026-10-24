import { onAudioSettings, readAudioSettings } from './audioSettings';

// Plays the M3 sound set by key. Q ships `assets/audio/manifest.json` and the files; until it exists (or for
// a key it does not list) every call is a silent no-op, so the game never waits on audio.

export const AUDIO_KEYS = [
  'footstep',
  'door_open',
  'door_close',
  'door_locked',
  'pickup',
  'scream',
  'bell',
  'ambient',
  // Round 4 (A39): the reveal stamp; silent until audio/manifest.json lists them.
  'stamp',
  'storm',
  'creak',
  'loaf_crack',
  // Round 6 (docs/round6/media.md 4): the cutscene `audio` steps name these; silent until audio/manifest.json lists them.
  'narr_bed_hollowmere',
  'sting_kill',
  'sting_meeting',
  'sting_eject',
  'sting_win_village',
  'sting_win_cabal',
  // Round 6 (docs/round6/media.md 1): the owner's field recordings for the openings and dusk.
  'train_arrive',
  'train_brake',
  'ferry_horn',
  'crows',
  // Round 8 (docs/round8/motion.md 2): creatures, resource breaks, effects and transport; owner-approved 2026-10-24.
  'mob_wolf_attack',
  'mob_hurt_wolf',
  'mob_hurt_boar',
  'mob_hurt_small',
  'mob_death',
  'break_wood',
  'break_stone',
  'break_ore',
  'break_pluck',
  'break_resin',
  'fx_hit',
  'fx_coins',
  'fx_poison',
  'fx_fall',
  'fx_knockout',
  'hatch_open',
  'ladder_climb',
  'portal_veil',
] as const;
export type AudioKey = (typeof AUDIO_KEYS)[number];

type UrlMap = Partial<Record<string, { url: string; gain: number }>>;

/** `entries: [{key, url, gain}]` is Q's shape (`url` relative to `assets/audio/`); also accepts `{entries: [{key, url}]}`, `{sounds: {key: url | {url}}}` or a bare `{key: url}` map. */
export function parseAudioManifest(raw: unknown): UrlMap {
  const out: UrlMap = {};
  const add = (key: string, v: unknown) => {
    const url = typeof v === 'string' ? v : (v as { url?: unknown } | null)?.url;
    if (typeof url !== 'string') return;
    const gain = (v as { gain?: unknown } | null)?.gain;
    out[key] = { url, gain: typeof gain === 'number' ? gain : 1 };
  };
  if (typeof raw !== 'object' || raw === null) return out;
  const r = raw as Record<string, unknown>;
  if (Array.isArray(r.entries)) {
    for (const e of r.entries as Array<Record<string, unknown>>) if (typeof e.key === 'string') add(e.key, e);
  } else {
    const map = (typeof r.sounds === 'object' && r.sounds !== null ? r.sounds : r) as Record<string, unknown>;
    for (const [k, v] of Object.entries(map)) add(k, v);
  }
  return out;
}

export class AudioBus {
  private sounds: UrlMap = {};
  private ambient: HTMLAudioElement | null = null;
  /** Looping keys other than `ambient` (the loft's `storm`), by key. */
  private readonly loops = new Map<string, HTMLAudioElement>();
  private unlocked = false;
  private muted = false;
  /** The player's SFX slider (0 to 1), `audioSettings`; every element's volume is its manifest gain times this. */
  private sfxVolume = 1;

  constructor(private readonly base = import.meta.env.BASE_URL) {
    const s = readAudioSettings();
    this.sfxVolume = s.sfx;
    this.muted = s.muted;
    onAudioSettings((next) => {
      this.setSfxVolume(next.sfx);
      this.setMuted(next.muted);
    });
  }

  /** The SFX slider of the settings panel (round 6, 6L); running loops follow it at once. */
  setSfxVolume(v: number): void {
    this.sfxVolume = Math.min(1, Math.max(0, v));
    if (this.ambient && this.sounds.ambient) this.ambient.volume = this.gainOf('ambient', 0.5);
    for (const [key, a] of this.loops) a.volume = this.gainOf(key, 0.5);
  }

  private gainOf(key: string, scale = 1): number {
    const g = this.sounds[key]?.gain ?? 1;
    return Math.min(1, Math.max(0, g)) * scale * this.sfxVolume;
  }

  /** Fetches the manifest once; a missing file leaves the bus silent. */
  async load(): Promise<void> {
    try {
      const res = await fetch(`${this.base}assets/audio/manifest.json`, { cache: 'no-cache' });
      if (!res.ok) return;
      this.sounds = parseAudioManifest(await res.json());
    } catch {
      // silent
    }
    const unlock = () => {
      this.unlocked = true;
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      if (this.ambient) void this.ambient.play().catch(() => undefined);
      for (const a of this.loops.values()) void a.play().catch(() => undefined);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  has(key: AudioKey): boolean {
    return this.sounds[key] !== undefined;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ambient) this.ambient.muted = muted;
    for (const a of this.loops.values()) a.muted = muted;
  }

  /** Starts a looping bed under the other sounds (the loft's storm); a missing key stays silent. */
  playLoop(key: AudioKey): void {
    const s = this.sounds[key];
    if (!s || this.loops.has(key)) return;
    const a = new Audio(`${this.base}assets/audio/${s.url}`);
    a.loop = true;
    a.muted = this.muted;
    a.volume = this.gainOf(key, 0.5);
    this.loops.set(key, a);
    if (this.unlocked) void a.play().catch(() => undefined);
  }

  stopLoop(key: AudioKey): void {
    this.loops.get(key)?.pause();
    this.loops.delete(key);
  }

  play(key: AudioKey): void {
    const s = this.sounds[key];
    if (!s || this.muted) return;
    if (key === 'ambient') return this.startAmbient();
    const a = new Audio(`${this.base}assets/audio/${s.url}`);
    a.volume = this.gainOf(key);
    void a.play().catch(() => undefined);
  }

  private startAmbient(): void {
    const s = this.sounds.ambient;
    if (!s || this.ambient) return;
    const a = new Audio(`${this.base}assets/audio/${s.url}`);
    a.loop = true;
    a.volume = this.gainOf('ambient', 0.5);
    this.ambient = a;
    if (this.unlocked) void a.play().catch(() => undefined);
  }

  stop(): void {
    this.ambient?.pause();
    this.ambient = null;
  }
}
