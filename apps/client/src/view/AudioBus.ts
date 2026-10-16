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
  private unlocked = false;
  private muted = false;

  constructor(private readonly base = import.meta.env.BASE_URL) {}

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
  }

  play(key: AudioKey): void {
    const s = this.sounds[key];
    if (!s || this.muted) return;
    if (key === 'ambient') return this.startAmbient();
    const a = new Audio(`${this.base}assets/audio/${s.url}`);
    a.volume = Math.min(1, Math.max(0, s.gain));
    void a.play().catch(() => undefined);
  }

  private startAmbient(): void {
    const s = this.sounds.ambient;
    if (!s || this.ambient) return;
    const a = new Audio(`${this.base}assets/audio/${s.url}`);
    a.loop = true;
    a.volume = Math.min(1, Math.max(0, s.gain)) * 0.5;
    this.ambient = a;
    if (this.unlocked) void a.play().catch(() => undefined);
  }

  stop(): void {
    this.ambient?.pause();
    this.ambient = null;
  }
}
