import Phaser from 'phaser';
import { overlayRoot, h } from '../ui/dom';
import { INTRO_COPY } from '../ui/copy/intro';
import { readAudioSettings } from '../view/audioSettings';
import {
  INTRO_STALL_MS,
  markSeen,
  introAllowed,
  parseIntroRow,
  readIntroEnv,
  type IntroRow,
} from './introPolicy';
import { getFlags } from './registry';

/** Finds the row and checks the file is really there (a dev server answers a missing file with its HTML page). */
async function resolveIntro(base: string): Promise<IntroRow | null> {
  const dir = `${base}assets/video/`;
  try {
    const res = await fetch(`${dir}manifest.json`);
    if (!res.ok) return null;
    const row = parseIntroRow(await res.json());
    if (row === null) return null;
    const head = await fetch(dir + row.url, { method: 'HEAD' });
    if (!head.ok || (head.headers.get('content-type') ?? '').startsWith('text/')) return null;
    return row;
  } catch {
    return null;
  }
}

/**
 * The opening cinematic (round 6, DECISIONS A98): `Preload` starts this scene before `Landing` (never before `Admin`).
 * It shows the poster with a "tap to begin" control (the tap unlocks audio), then the video with its own sound; Skip,
 * a tap while it plays, or Esc ends it, and `Landing` follows as it always did. It plays once per browser session and
 * never blocks the menu: any doubt (no manifest row, no file, a stalled stream) goes straight to `Landing`.
 */
export class Intro extends Phaser.Scene {
  private cleanup: (() => void) | null = null;

  constructor() {
    super('Intro');
  }

  create(): void {
    const flags = getFlags(this);
    const env = readIntroEnv(flags.mock, flags.resumeCode !== null);
    if (!introAllowed(env)) {
      this.scene.start('Landing');
      return;
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup?.());
    const base = import.meta.env.BASE_URL;
    void resolveIntro(base).then((row) => {
      if (!this.scene.isActive()) return;
      if (row === null) this.scene.start('Landing');
      else this.mount(`${base}assets/video/`, row);
    });
  }

  private mount(dir: string, row: IntroRow): void {
    let state: 'poster' | 'playing' | 'done' = 'poster';
    let stall: ReturnType<typeof setTimeout> | null = null;

    const video = h('video', {
      class: 'wdi-intro__video',
      src: dir + row.url,
      preload: 'auto',
      playsinline: true,
      hidden: true,
      'data-testid': 'intro-video',
    });
    const begin = h(
      'button',
      { class: 'wdi-btn wdi-btn--primary wdi-intro__begin', type: 'button', 'data-testid': 'intro-begin' },
      INTRO_COPY['intro.begin'],
    );
    const skip = h(
      'button',
      {
        class: 'wdi-btn wdi-btn--ghost wdi-btn--sm wdi-intro__skip',
        type: 'button',
        hidden: true,
        'data-testid': 'intro-skip',
      },
      INTRO_COPY['intro.skip'],
    );
    const root = h(
      'div',
      { class: 'wdi-intro', role: 'dialog', 'aria-label': INTRO_COPY['intro.label'], 'data-testid': 'intro' },
      row.poster === undefined
        ? null
        : h('img', { class: 'wdi-intro__poster', src: dir + row.poster, alt: '' }),
      video,
      begin,
      skip,
    );

    const finish = () => {
      if (state === 'done') return;
      state = 'done';
      markSeen();
      // Stop the sound and drop the overlay now; the scene's shutdown, which runs on a later game step, would otherwise
      // leave the video playing until then.
      this.cleanup?.();
      this.scene.start('Landing');
    };
    const play = () => {
      state = 'playing';
      markSeen();
      begin.hidden = true;
      skip.hidden = false;
      video.hidden = false;
      const s = readAudioSettings();
      video.muted = s.muted;
      video.volume = s.music;
      stall = setTimeout(finish, INTRO_STALL_MS);
      void video.play().catch(finish);
    };
    const onClick = () => (state === 'poster' ? play() : finish());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
    };
    root.addEventListener('click', onClick);
    window.addEventListener('keydown', onKey);
    video.addEventListener('playing', () => {
      if (stall !== null) clearTimeout(stall);
      stall = null;
    });
    video.addEventListener('ended', finish);
    video.addEventListener('error', finish);

    overlayRoot().append(root);
    begin.focus();
    this.cleanup = () => {
      if (stall !== null) clearTimeout(stall);
      window.removeEventListener('keydown', onKey);
      video.pause();
      video.removeAttribute('src');
      video.load(); // releases the stream and the decoder; pause alone keeps them
      root.remove();
      this.cleanup = null;
    };
  }
}
