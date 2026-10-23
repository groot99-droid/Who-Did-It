import type Phaser from 'phaser';
import balance from '@wdi/content/data/balance.json';
import musicJson from '@wdi/content/data/music.json';
import { h } from '../ui/dom';
import { LOADING_COPY, TIPS } from '../ui/copy/tips';
import { REG_MUSIC } from '../scenes/registry';
import type { MusicBus } from './MusicBus';

/**
 * The loading screen (round 6, docs/round6/cutscene-music.md 2): a DOM overlay with a progress bar bound to the
 * loader, shown only once a load has run past `balance.ui.loading.showAfterS`, with a tip every `tipEveryS` from
 * `ui/copy/tips.ts` (no role tells). `Preload` mounts it for the boot; a match preload mounts it with
 * `mountMatchLoadingScreen`, which also asks the `MusicBus` for the map's `loading` class.
 */
export interface LoadingHandle {
  destroy(): void;
}

/** What the controller needs from the page, so its timing is testable without a DOM. */
export interface LoadingView {
  show(): void;
  setProgress(fraction: number): void;
  setTip(text: string): void;
  remove(): void;
}

export interface LoadingHost {
  after(fn: () => void, ms: number): () => void;
  every(fn: () => void, ms: number): () => void;
  mount(): LoadingView;
}

export interface LoadingTiming {
  showAfterMs: number;
  tipEveryMs: number;
}

export interface LoadingController {
  progress(fraction: number): void;
  destroy(): void;
}

/** Starts the clock now: the view exists from `showAfterMs` on and never before. */
export function startLoading(
  host: LoadingHost,
  tips: readonly string[],
  timing: LoadingTiming,
  firstTip = 0,
): LoadingController {
  let view: LoadingView | null = null;
  let fraction = 0;
  let tip = tips.length === 0 ? 0 : firstTip % tips.length;
  let stopTips: () => void = () => undefined;
  const stopShow = host.after(() => {
    view = host.mount();
    view.setProgress(fraction);
    if (tips.length > 0) {
      view.setTip(tips[tip] ?? '');
      stopTips = host.every(() => {
        tip = (tip + 1) % tips.length;
        view?.setTip(tips[tip] ?? '');
      }, timing.tipEveryMs);
    }
    view.show();
  }, timing.showAfterMs);
  return {
    progress: (f) => {
      fraction = Math.min(1, Math.max(0, f));
      view?.setProgress(fraction);
    },
    destroy: () => {
      stopShow();
      stopTips();
      view?.remove();
      view = null;
    },
  };
}

export const loadingTiming = (): LoadingTiming => ({
  showAfterMs: balance.ui.loading.showAfterS * 1000,
  tipEveryMs: balance.ui.loading.tipEveryS * 1000,
});

function domHost(root: HTMLElement): LoadingHost {
  return {
    after: (fn, ms) => {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    },
    every: (fn, ms) => {
      const id = setInterval(fn, ms);
      return () => clearInterval(id);
    },
    mount: () => {
      const bar = h('div', {
        class: 'wdi-loading__bar',
        role: 'progressbar',
        'aria-label': LOADING_COPY['loading.progress'],
      });
      const fill = h('div', { class: 'wdi-loading__fill' });
      bar.append(fill);
      const tip = h('p', { class: 'wdi-loading__tip', 'aria-live': 'polite' });
      const el = h(
        'section',
        {
          class: 'wdi-loading',
          'data-testid': 'loading',
          hidden: true,
          'aria-label': LOADING_COPY['loading.title'],
        },
        h('h2', { class: 'wdi-display wdi-display--md' }, LOADING_COPY['loading.title']),
        bar,
        h('p', { class: 'wdi-eyebrow' }, LOADING_COPY['loading.tipLabel']),
        tip,
      );
      root.append(el);
      return {
        show: () => {
          el.hidden = false;
        },
        setProgress: (f) => {
          fill.style.transform = `scaleX(${f})`;
          bar.setAttribute('aria-valuenow', String(Math.round(f * 100)));
        },
        setTip: (text) => {
          tip.textContent = text;
        },
        remove: () => el.remove(),
      };
    },
  };
}

export function mountLoadingScreen(scene: Phaser.Scene, root: HTMLElement): LoadingHandle {
  const controller = startLoading(
    domHost(root),
    TIPS,
    loadingTiming(),
    Math.floor(Math.random() * TIPS.length),
  );
  const onProgress = (value: number) => controller.progress(value);
  scene.load.on('progress', onProgress);
  const destroy = () => {
    scene.load.off('progress', onProgress);
    controller.destroy();
  };
  scene.events.once('shutdown', destroy);
  return { destroy };
}

/** The playlist id of a map's `loading` class, or null when `music.json` has none for it. */
export function loadingPlaylistFor(mapId: string): string | null {
  const byMap = musicJson.byMap as Record<string, { loading?: string } | undefined>;
  return byMap[mapId]?.loading ?? null;
}

/**
 * A match preload (World): the same screen, torn down when the scene's `create` runs, and the map's
 * loading piece asked of the music bus. The load never waits for the piece.
 */
export function mountMatchLoadingScreen(
  scene: Phaser.Scene,
  root: HTMLElement,
  mapId: string,
): LoadingHandle {
  const handle = mountLoadingScreen(scene, root);
  scene.events.once('create', handle.destroy);
  const playlist = loadingPlaylistFor(mapId);
  if (playlist !== null) (scene.registry.get(REG_MUSIC) as MusicBus | undefined)?.crossfadeTo(playlist);
  return handle;
}
