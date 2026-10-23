import { h } from './dom';
import { titleLetters } from './theme/title';

/**
 * The loop backdrop of the night screens (round 7, docs/round7/ui-reskin.md 3, docs/UI.md 6): the poster, the
 * looping `landing_loop` video of the video manifest (6N, DECISIONS A98 and A102), the veil, the vignette and the
 * scanlines, with the game's title and a status footer for the menu surfaces. One layer, mounted once as the
 * sibling just before `#overlay`, so it paints over the canvas and under every screen. It replaces the canvas
 * title and `{ok, build}` line of the old `view/Backdrop.ts`.
 */

/** The manifest key of the loop (6N writes the row; until then the backdrop is the night page alone). */
export const LOOP_KEY = 'landing_loop';

export interface LoopRow {
  /** Relative to `assets/video/`. */
  url: string;
  poster?: string;
}

/** The first `landing_loop` row of the video manifest, or null when the manifest or the row is missing or damaged. */
export function parseLoopRow(raw: unknown): LoopRow | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const entries = (raw as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return null;
  for (const e of entries as Array<Record<string, unknown>>) {
    if (e?.key !== LOOP_KEY || typeof e.url !== 'string' || e.url === '') continue;
    return { url: e.url, ...(typeof e.poster === 'string' && e.poster !== '' ? { poster: e.poster } : {}) };
  }
  return null;
}

export interface BackdropEnv {
  reducedMotion: boolean;
  saveData: boolean;
  search: string;
}

export interface BackdropPlan {
  /** The poster's URL, shown until the first frame plays, or for good. */
  poster: string | null;
  /** The video's URL, or null when it must never load. */
  video: string | null;
  /** Whether the video plays; under reduced motion it stays paused on its poster. */
  play: boolean;
}

/** `?video=0` and the data saver never load the video; reduced motion keeps it paused. */
export function backdropPlan(env: BackdropEnv, row: LoopRow | null, dir: string): BackdropPlan {
  const poster = row?.poster === undefined ? null : `${dir}${row.poster}`;
  const off = env.saveData || new URLSearchParams(env.search).get('video') === '0';
  if (row === null || off) return { poster, video: null, play: false };
  return { poster, video: `${dir}${row.url}`, play: !env.reducedMotion };
}

export function readBackdropEnv(): BackdropEnv {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return {
    reducedMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    saveData: conn?.saveData === true,
    search: location.search,
  };
}

export interface BackdropOptions {
  /** The title of the game, top left (the menu). */
  title?: boolean;
  /** The footer line: the build, or Boot's "Waking the village...". */
  status?: string;
}

interface Layer {
  el: HTMLElement;
  title: HTMLElement;
  status: HTMLElement;
}

let layer: Layer | null = null;

function mount(): Layer {
  if (layer !== null) return layer;
  const overlay = document.getElementById('overlay');
  const title = h('div', { class: 'wdi-backdrop__title', hidden: true }, titleLetters(['Who did', 'it?']));
  const status = h('p', { class: 'wdi-backdrop__status', 'data-testid': 'backdrop-status' });
  const el = h(
    'div',
    { class: 'wdi-backdrop', 'data-testid': 'backdrop', hidden: true },
    h('div', { class: 'wdi-backdrop__veil', 'aria-hidden': 'true' }),
    h('div', { class: 'wdi-backdrop__vignette', 'aria-hidden': 'true' }),
    h('div', { class: 'wdi-backdrop__scan', 'aria-hidden': 'true' }),
    title,
    status,
  );
  if (overlay === null) document.body.append(el);
  else overlay.before(el);
  layer = { el, title, status };
  void loadLoop(el);
  return layer;
}

async function loadLoop(el: HTMLElement): Promise<void> {
  const dir = `${import.meta.env.BASE_URL}assets/video/`;
  const row = await fetch(`${dir}manifest.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then(parseLoopRow, () => null);
  const plan = backdropPlan(readBackdropEnv(), row, dir);
  const veil = el.firstElementChild;
  if (plan.poster !== null) {
    el.insertBefore(
      h('img', { class: 'wdi-backdrop__poster', src: plan.poster, alt: '', 'aria-hidden': 'true' }),
      veil,
    );
  }
  if (plan.video === null) return;
  const video = h('video', {
    class: 'wdi-backdrop__video',
    src: plan.video,
    muted: true,
    loop: true,
    playsinline: true,
    preload: plan.play ? 'auto' : 'metadata',
    tabindex: -1,
    'aria-hidden': 'true',
    ...(plan.poster === null ? {} : { poster: plan.poster }),
  });
  video.muted = true; // the attribute alone does not satisfy every browser's autoplay rule
  el.insertBefore(video, veil);
  const motion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const sync = () => {
    if (motion?.matches === true || el.hidden) video.pause();
    else void video.play().catch(() => undefined);
  };
  motion?.addEventListener('change', sync);
  new MutationObserver(sync).observe(el, { attributes: true, attributeFilter: ['hidden'] });
  sync();
}

/** Shows the backdrop under the screen a menu scene mounts; the scene hides it when it shuts down. */
export function showBackdrop(opts: BackdropOptions = {}): void {
  const l = mount();
  l.title.hidden = opts.title !== true;
  l.status.textContent = opts.status ?? '';
  l.el.hidden = false;
}

export function setBackdropStatus(text: string): void {
  mount().status.textContent = text;
}

export function hideBackdrop(): void {
  if (layer !== null) layer.el.hidden = true;
}

/** The footer's build line, which the canvas used to print as `{ok, build}`. */
export function buildLine(health: { ok: boolean; build: string }): string {
  return health.ok ? `build ${health.build}` : `offline, build ${health.build}`;
}
