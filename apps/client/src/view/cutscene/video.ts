import { h } from '../../ui/dom';
import { readAudioSettings } from '../audioSettings';

/**
 * The `video` step of a cutscene (round 7, 7A, DECISIONS A101; `docs/round7/map-intros.md` 2): a full-frame `<video>`
 * from a row of `assets/video/manifest.json`, under the cutscene's captions and Skip. The memorials are its first
 * users (7I's `memorial.vicar`). The video carries its own sound at the music volume, as the opening cinematic does;
 * the cutscene ends when it ends (or at `maxS`, whichever is first). Any doubt (no manifest, no row, a decode error)
 * removes the picture and the cutscene runs on over the World with its captions.
 */

export interface VideoRow {
  /** Relative to `assets/video/`. */
  url: string;
  poster?: string;
}

/** The row of `key` in the video manifest, or null when the manifest or the row is missing or damaged. */
export function parseVideoRow(raw: unknown, key: string): VideoRow | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const entries = (raw as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return null;
  for (const e of entries as Array<Record<string, unknown> | null>) {
    if (e?.key !== key || typeof e.url !== 'string' || e.url === '') continue;
    return { url: e.url, ...(typeof e.poster === 'string' && e.poster !== '' ? { poster: e.poster } : {}) };
  }
  return null;
}

let manifest: Promise<unknown> | null = null;

/** The video manifest, fetched once per page; null when it cannot be read. */
function videoManifest(dir: string): Promise<unknown> {
  manifest ??= fetch(`${dir}manifest.json`)
    .then((res) => (res.ok ? (res.json() as Promise<unknown>) : null))
    .catch(() => null);
  return manifest;
}

/** One `video` step's picture: mounted at the back of the cutscene layer, released by `destroy`. */
export class CutsceneVideo {
  readonly el: HTMLVideoElement;
  private gone = false;

  constructor(
    private readonly parent: HTMLElement,
    private readonly onEnded: () => void,
  ) {
    this.el = h('video', {
      class: 'wdi-cutscene__video',
      'data-testid': 'cutscene-video',
      playsinline: true,
    });
    // Full frame behind the captions and Skip: the layer is a positioned stacking context, so a negative z-index
    // keeps the picture under its in-flow children whatever the order.
    Object.assign(this.el.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      objectFit: 'contain',
      background: '#000',
      zIndex: '-1',
    });
    this.el.addEventListener('ended', () => {
      if (!this.gone) this.onEnded();
    });
    this.el.addEventListener('error', () => this.drop(`decode error`));
  }

  /** Resolves `key` and plays it; a failure logs and leaves the cutscene running without the picture. */
  async play(key: string, base: string): Promise<void> {
    const dir = `${base}assets/video/`;
    const row = parseVideoRow(await videoManifest(dir), key);
    if (this.gone) return;
    if (row === null) {
      this.drop(`no manifest row ${key}`);
      return;
    }
    const s = readAudioSettings();
    this.el.muted = s.muted;
    this.el.volume = s.music;
    if (row.poster !== undefined) this.el.poster = dir + row.poster;
    this.el.src = dir + row.url;
    this.parent.prepend(this.el);
    // Autoplay with sound can be refused (no gesture since load): play muted rather than lose the picture.
    await this.el.play().catch(() => {
      if (this.gone) return;
      this.el.muted = true;
      return this.el.play().catch(() => this.drop('play refused'));
    });
  }

  destroy(): void {
    if (this.gone) return;
    this.gone = true;
    this.el.pause();
    this.el.removeAttribute('src');
    this.el.load(); // releases the stream and the decoder; pause alone keeps them
    this.el.remove();
  }

  private drop(why: string): void {
    if (this.gone) return;
    console.warn(`cutscene video: ${why}`);
    this.destroy();
  }
}
