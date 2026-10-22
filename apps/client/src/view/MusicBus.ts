import { onAudioSettings, readAudioSettings } from './audioSettings';

/**
 * Music playback (round 6, docs/round6/cutscene-music.md 3): two `<audio>` elements, a crossfade between the
 * playlists of `audio/music/manifest.json`, sources assigned only when a track is first needed, and a prefetch when
 * the map is picked. Created once by `Preload` under `REG_MUSIC`. Music never counts against the first load: nothing
 * is fetched before `crossfadeTo` or `prefetch` is called, and those run after Start (docs/round6/media.md 2).
 * Volume is the player's music slider times the track's manifest gain; the server sends nothing.
 */

export interface MusicTrack {
  key: string;
  /** Relative to `assets/audio/music/`. */
  url: string;
  gain: number;
  durationS: number;
  bytes: number;
  map?: string;
}

export interface MusicPlaylist {
  id: string;
  tracks: string[];
  crossfadeS: number;
  shuffle: boolean;
}

export interface MusicManifest {
  tracks: MusicTrack[];
  playlists: MusicPlaylist[];
}

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

/** Reads the manifest leniently: a damaged row is dropped, a missing file is an empty manifest. */
export function parseMusicManifest(raw: unknown): MusicManifest {
  const out: MusicManifest = { tracks: [], playlists: [] };
  if (typeof raw !== 'object' || raw === null) return out;
  const r = raw as { tracks?: unknown; playlists?: unknown };
  for (const t of Array.isArray(r.tracks) ? (r.tracks as Array<Record<string, unknown>>) : []) {
    if (typeof t?.key !== 'string' || typeof t.url !== 'string') continue;
    out.tracks.push({
      key: t.key,
      url: t.url,
      gain: Math.min(1, Math.max(0, num(t.gain, 1))),
      durationS: num(t.durationS, 0),
      bytes: num(t.bytes, 0),
      ...(typeof t.map === 'string' ? { map: t.map } : {}),
    });
  }
  for (const p of Array.isArray(r.playlists) ? (r.playlists as Array<Record<string, unknown>>) : []) {
    if (typeof p?.id !== 'string' || !Array.isArray(p.tracks)) continue;
    out.playlists.push({
      id: p.id,
      tracks: p.tracks.filter((k): k is string => typeof k === 'string'),
      crossfadeS: Math.max(0, num(p.crossfadeS, 2)),
      shuffle: p.shuffle === true,
    });
  }
  return out;
}

/** The slice of `HTMLAudioElement` the bus drives; tests pass fakes. */
export interface MusicElement {
  src: string;
  volume: number;
  loop: boolean;
  currentTime: number;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: 'ended', fn: () => void): void;
  removeEventListener(type: 'ended', fn: () => void): void;
  removeAttribute(name: 'src'): void;
}

export interface MusicBusDeps {
  base?: string;
  createElement?: () => MusicElement;
  loadManifest?: (url: string) => Promise<unknown>;
  /** Warms the HTTP cache with one file; the default is a low-priority `fetch`. */
  warm?: (url: string) => void;
  /** Called once when `play()` is refused (autoplay policy); the bus retries after the first gesture. */
  onGesture?: (fn: () => void) => void;
  random?: () => number;
}

interface Slot {
  el: MusicElement;
  /** The track playing here, if any. */
  track: MusicTrack | null;
  /** 0 to 1: how far this slot is faded in. */
  level: number;
  /** Per-second change of `level`; negative while fading out. */
  rate: number;
  endedFn: (() => void) | null;
}

export class MusicBus {
  private readonly base: string;
  private readonly make: () => MusicElement;
  private readonly fetchManifest: (url: string) => Promise<unknown>;
  private readonly warm: (url: string) => void;
  private readonly onGesture: (fn: () => void) => void;
  private readonly random: () => number;
  private manifest: MusicManifest | null = null;
  private manifestLoad: Promise<MusicManifest> | null = null;
  private slots: [Slot, Slot] | null = null;
  /** Index into `slots` of the one fading in or holding. */
  private front = 0;
  /** The playlist id asked for last (null is silence). */
  private wanted: string | null = null;
  private order: string[] = [];
  private cursor = 0;
  private volume: number;
  private muted: boolean;
  /** The crossfade seconds of the playlist in front; a fade to silence uses it. */
  private fadeS = 2;
  private blocked = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastMs = 0;
  private readonly warmed = new Set<string>();

  constructor(deps: MusicBusDeps = {}) {
    this.base = deps.base ?? import.meta.env.BASE_URL;
    this.make = deps.createElement ?? (() => new Audio() as unknown as MusicElement);
    this.fetchManifest = deps.loadManifest ?? defaultLoadManifest;
    this.warm =
      deps.warm ?? ((url) => void fetch(url, { priority: 'low' } as RequestInit).catch(() => undefined));
    this.onGesture = deps.onGesture ?? defaultOnGesture;
    this.random = deps.random ?? Math.random;
    const s = readAudioSettings();
    this.volume = s.music;
    this.muted = s.muted;
    onAudioSettings((next) => {
      this.setVolume(next.music);
      this.setMuted(next.muted);
    });
  }

  /** The playlist now wanted, or null when silent; asking for the same one again does nothing. */
  get current(): string | null {
    return this.wanted;
  }

  /** The playlist id of a track key that is playing in the front slot (tests and the director read it). */
  get playingTrack(): string | null {
    const s = this.slots?.[this.front];
    return s?.track?.key ?? null;
  }

  crossfadeTo(playlistId: string | null): void {
    if (playlistId === this.wanted) return;
    this.wanted = playlistId;
    if (playlistId === null) return this.fadeOutFront(this.fadeS);
    void this.withManifest().then((m) => {
      if (this.wanted !== playlistId) return; // a later call won while the manifest loaded
      const pl = m.playlists.find((p) => p.id === playlistId);
      if (pl === undefined || pl.tracks.length === 0) return this.fadeOutFront(this.fadeS);
      this.order = this.orderOf(pl);
      this.cursor = 0;
      this.startTrack(m, pl);
    });
  }

  prefetch(playlistId: string): void {
    void this.withManifest().then((m) => {
      const pl = m.playlists.find((p) => p.id === playlistId);
      const first = pl?.tracks.map((k) => m.tracks.find((t) => t.key === k)).find((t) => t !== undefined);
      if (first === undefined || this.warmed.has(first.key)) return;
      this.warmed.add(first.key);
      this.warm(this.urlOf(first));
    });
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    this.apply();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.apply();
  }

  /** Advances the fades by `dtMs`; the interval calls it, and tests call it directly. */
  tick(dtMs: number): void {
    if (this.slots === null) return;
    let busy = false;
    for (const s of this.slots) {
      if (s.rate === 0) continue;
      s.level = Math.min(1, Math.max(0, s.level + (s.rate * dtMs) / 1000));
      if ((s.rate > 0 && s.level >= 1) || (s.rate < 0 && s.level <= 0)) {
        if (s.rate < 0) this.release(s);
        s.rate = 0;
      } else busy = true;
    }
    this.apply();
    if (!busy) this.stopTimer();
  }

  private urlOf(t: MusicTrack): string {
    return `${this.base}assets/audio/music/${t.url}`;
  }

  private withManifest(): Promise<MusicManifest> {
    if (this.manifest !== null) return Promise.resolve(this.manifest);
    this.manifestLoad ??= this.fetchManifest(`${this.base}assets/audio/music/manifest.json`)
      .then((raw) => (this.manifest = parseMusicManifest(raw)))
      .catch(() => (this.manifest = parseMusicManifest(null)));
    return this.manifestLoad;
  }

  private orderOf(pl: MusicPlaylist): string[] {
    const keys = [...pl.tracks];
    if (!pl.shuffle) return keys;
    for (let i = keys.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [keys[i], keys[j]] = [keys[j]!, keys[i]!];
    }
    return keys;
  }

  private ensureSlots(): [Slot, Slot] {
    this.slots ??= [this.newSlot(), this.newSlot()];
    return this.slots;
  }

  private newSlot(): Slot {
    return { el: this.make(), track: null, level: 0, rate: 0, endedFn: null };
  }

  /** Starts `order[cursor]` of `pl` in the idle slot and fades it in while the old front fades out. */
  private startTrack(m: MusicManifest, pl: MusicPlaylist): void {
    const track = m.tracks.find((t) => t.key === this.order[this.cursor]);
    if (track === undefined) return this.fadeOutFront(pl.crossfadeS);
    const slots = this.ensureSlots();
    const old = slots[this.front]!;
    const next = slots[1 - this.front]!;
    this.release(next);
    this.front = 1 - this.front;
    next.track = track;
    next.el.src = this.urlOf(track); // the lazy fetch: the source is set only now
    next.el.loop = this.order.length === 1 && pl.tracks.length === 1;
    next.el.currentTime = 0;
    next.level = 0;
    this.fadeS = pl.crossfadeS;
    const fade = Math.max(0.001, pl.crossfadeS);
    next.rate = 1 / fade;
    if (old.track !== null) old.rate = -1 / fade;
    next.endedFn = () => this.onEnded(m, pl, next);
    next.el.addEventListener('ended', next.endedFn);
    this.play(next);
    this.apply();
    this.startTimer();
  }

  private onEnded(m: MusicManifest, pl: MusicPlaylist, slot: Slot): void {
    if (this.slots?.[this.front] !== slot || this.wanted !== pl.id) return;
    this.cursor = (this.cursor + 1) % this.order.length;
    if (this.cursor === 0) this.order = this.orderOf(pl);
    this.startTrack(m, pl);
  }

  private fadeOutFront(seconds: number): void {
    const s = this.slots?.[this.front];
    if (s === undefined || s.track === null) return;
    s.rate = -1 / Math.max(0.001, seconds);
    this.startTimer();
  }

  private release(s: Slot): void {
    if (s.endedFn !== null) s.el.removeEventListener('ended', s.endedFn);
    s.endedFn = null;
    s.el.pause();
    s.el.removeAttribute('src');
    s.track = null;
    s.level = 0;
    s.rate = 0;
  }

  private play(s: Slot): void {
    void s.el.play().catch(() => {
      if (this.blocked) return;
      this.blocked = true;
      this.onGesture(() => {
        this.blocked = false;
        for (const x of this.slots ?? []) if (x.track !== null) void x.el.play().catch(() => undefined);
      });
    });
  }

  private apply(): void {
    for (const s of this.slots ?? []) {
      s.el.volume =
        this.muted || s.track === null ? 0 : Math.min(1, Math.max(0, this.volume * s.track.gain * s.level));
    }
  }

  private startTimer(): void {
    if (this.timer !== null) return;
    this.lastMs = Date.now();
    this.timer = setInterval(() => {
      const now = Date.now();
      this.tick(now - this.lastMs);
      this.lastMs = now;
    }, 100);
  }

  private stopTimer(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}

async function defaultLoadManifest(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: 'no-cache' });
  return res.ok ? res.json() : null;
}

function defaultOnGesture(fn: () => void): void {
  if (typeof window === 'undefined') return;
  const once = () => {
    window.removeEventListener('pointerdown', once);
    window.removeEventListener('keydown', once);
    fn();
  };
  window.addEventListener('pointerdown', once);
  window.addEventListener('keydown', once);
}
