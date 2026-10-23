import { h } from './dom';

/**
 * The landing trailer (round 6, docs/round6/cutscene-music.md 2): a muted, looping `landing_loop.webm` behind the
 * start screen, with its poster frame when the file is missing or the viewer opts out. The page decides nothing about
 * the file (6N makes it); the slot stays hidden until the poster or the first frame has arrived.
 */
export interface TrailerEnv {
  reducedMotion: boolean;
  saveData: boolean;
  search: string;
}

/** No video under reduced motion, the data saver, or `?video=0`. */
export function trailerAllowed(env: TrailerEnv): boolean {
  if (env.reducedMotion || env.saveData) return false;
  return new URLSearchParams(env.search).get('video') !== '0';
}

export function readTrailerEnv(): TrailerEnv {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return {
    reducedMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    saveData: conn?.saveData === true,
    search: location.search,
  };
}

export interface TrailerOptions {
  /** `import.meta.env.BASE_URL`. */
  base: string;
  /** The music bus: its `lobby` playlist (the theme) starts on the first tap (the autoplay policy forbids earlier). */
  music?: { crossfadeTo(playlistId: string | null): void } | undefined;
  env?: TrailerEnv;
}

/** The playlist the start screen plays in `audio/music/manifest.json`: the theme, which runs on into the lobby (A98). */
export const TRAILER_PLAYLIST = 'lobby';

export function mountTrailer(slot: HTMLElement, opts: TrailerOptions): { destroy(): void } {
  const env = opts.env ?? readTrailerEnv();
  if (!trailerAllowed(env)) return { destroy: () => undefined };
  const dir = `${opts.base}assets/video/`;
  const poster = `${dir}landing_loop.jpg`;
  const video = h('video', {
    class: 'wdi-landing__video',
    src: `${dir}landing_loop.webm`,
    poster,
    muted: true,
    loop: true,
    autoplay: true,
    playsinline: true,
    preload: 'none',
    tabindex: -1,
    'aria-hidden': 'true',
  });
  video.muted = true; // the attribute alone does not satisfy every browser's autoplay rule
  slot.append(video);
  let shown = false;
  const tap = () => {
    if (shown) opts.music?.crossfadeTo(TRAILER_PLAYLIST);
  };
  const reveal = () => {
    if (shown) return;
    shown = true;
    slot.hidden = false;
  };
  video.addEventListener('loadeddata', reveal);
  const probe = new Image();
  probe.addEventListener('load', reveal);
  probe.src = poster;
  void video.play().catch(() => undefined);
  document.addEventListener('pointerdown', tap, { once: true });
  document.addEventListener('keydown', tap, { once: true });
  return {
    destroy: () => {
      document.removeEventListener('pointerdown', tap);
      document.removeEventListener('keydown', tap);
      video.pause();
      video.removeAttribute('src');
      video.remove();
      slot.hidden = true;
    },
  };
}
