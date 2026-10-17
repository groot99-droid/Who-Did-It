import traits from '@wdi/content/data/traits.json';
import { ClueKind, NotebookStatus } from '@wdi/shared/constants';
import type { NotebookSnap, WorldFeed } from '../net/world';
import { WORLD_COPY as C, fill } from '../ui/copy';
import { h } from '../ui/dom';
import { formatClock } from './Hud';
import { loadSceneNames } from './sceneNames';

const BASE = import.meta.env.BASE_URL;
const icon = (path: string) => h('img', { class: 'wdi-icon', alt: '', src: `${BASE}assets/ui/${path}.svg` });

const HEIGHT_ICON = ['icon_height_short', null, 'icon_height_tall'];
const STATUS: Record<number, { label: string; cls: string }> = {
  [NotebookStatus.claimed]: { label: C['notebook.status.claimed'], cls: '' },
  [NotebookStatus.verified]: { label: C['notebook.status.verified'], cls: ' wdi-chip--verified' },
  [NotebookStatus.corroborated]: { label: C['notebook.status.corroborated'], cls: ' wdi-chip--verified' },
  [NotebookStatus.forged]: { label: C['notebook.status.forged'], cls: ' wdi-chip--danger' },
  [NotebookStatus.teaching]: { label: C['notebook.status.teaching'], cls: '' },
};
/** Stride words by height index and wool words by scarf index (UI.md 14.5). */
const STRIDE = [C['stride.short'], C['stride.mid'], C['stride.tall']];
const WOOL = [C['wool.red'], C['wool.green'], C['wool.blue']];

/** "Footprints, long stride: Tall", "Thread, red wool: Red scarf" - the clue kind and the trait value it shows. */
export function entryText(e: Pick<NotebookSnap, 'clueKind' | 'value'>): string {
  const { height, scarf, hat } = traits.axes;
  if (e.clueKind === ClueKind.footprints)
    return fill(C['notebook.entry.footprints'], {
      stride: STRIDE[e.value] ?? '?',
      height: height.values[e.value]?.label ?? '?',
    });
  if (e.clueKind === ClueKind.thread)
    return fill(C['notebook.entry.thread'], {
      wool: WOOL[e.value] ?? '?',
      scarf: scarf.values[e.value]?.label ?? '?',
    });
  if (e.clueKind === ClueKind.felt)
    return fill(C['notebook.entry.felt'], { hat: hat.values[e.value]?.label ?? '?' });
  return C['notebook.entry.other'];
}

function entryIcon(e: NotebookSnap): HTMLElement {
  if (e.clueKind === ClueKind.footprints) {
    const name = HEIGHT_ICON[e.value];
    if (name) return icon(`icons/${name}`);
  } else if (e.clueKind === ClueKind.thread) {
    const id = traits.axes.scarf.values[e.value]?.id;
    if (id) return icon(`icons/icon_scarf_${id}`);
  } else if (e.clueKind === ClueKind.felt) {
    const id = traits.axes.hat.values[e.value]?.id;
    if (id) return icon(`icons/icon_hat_${id}`);
  }
  return icon('glyphs/glyph_lens');
}

/**
 * The player's own Notebook (GDD 3.4): one row per entry with the clue icon, the trait value, where and
 * when (`m:ss` from the match start) and a status chip. Mounted in the World's sheet and, at integration,
 * in the Meeting's Notebook tab: `new NotebookPanel(parent, feed)`, `update()` each frame, `destroy()`.
 */
export class NotebookPanel {
  readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private signature = '';
  private sceneName: ((index: number) => string) | null = null;

  constructor(
    parent: HTMLElement,
    private readonly feed: WorldFeed,
  ) {
    this.list = h('div', { class: 'wdi-notebook__list' });
    this.root = h(
      'section',
      { class: 'wdi-notebook', 'data-testid': 'notebook', 'aria-label': C['notebook.title'] },
      h('h2', { class: 'wdi-eyebrow' }, C['notebook.title']),
      this.list,
    );
    parent.append(this.root);
    void loadSceneNames().then((fn) => {
      this.sceneName = fn;
      this.signature = '';
      this.update();
    });
    this.update();
  }

  update(): void {
    const entries = this.feed.notebook();
    const start = this.feed.clock().startTick;
    const sig = `${start}|${this.sceneName ? 1 : 0}|${entries.map((e) => `${e.id}:${e.status}`).join(',')}`;
    if (sig === this.signature) return;
    this.signature = sig;
    this.list.replaceChildren(
      ...(entries.length === 0
        ? [h('p', { class: 'wdi-muted' }, C['notebook.empty'])]
        : entries.map((e) => this.row(e, start))),
    );
  }

  /** Scrolls the newest entry into view and flags it (the Notebook opens on a new clue, GDD 2 step 5). */
  focusLast(): void {
    const rows = this.list.querySelectorAll('.wdi-notebook__entry');
    for (const r of rows) r.classList.remove('is-new');
    const last = rows[rows.length - 1];
    last?.classList.add('is-new');
    last?.scrollIntoView({ block: 'nearest' });
  }

  private row(e: NotebookSnap, start: number): HTMLElement {
    const status = STATUS[e.status] ?? STATUS[NotebookStatus.claimed]!;
    const where = this.sceneName ? this.sceneName(e.sceneId) : '';
    return h(
      'div',
      { class: 'wdi-notebook__entry', 'data-testid': 'notebook-entry' },
      h('span', { class: 'wdi-icon-disc' }, entryIcon(e)),
      h(
        'span',
        {},
        `${entryText(e)} · ${fill(C['notebook.meta'], { scene: where || '...', time: formatClock(Math.max(0, e.tick - start)) })}`,
      ),
      h('span', { class: `wdi-chip${status.cls}` }, status.label),
    );
  }

  destroy(): void {
    this.root.remove();
  }
}

/** The World's Notebook sheet: the panel over a scrim, opened by N or the HUD button, closed by Esc or a tap outside. */
export class NotebookSheet {
  readonly panel: NotebookPanel;
  private readonly root: HTMLElement;
  private readonly keydown = (e: KeyboardEvent) => {
    if (e.code === 'Escape' && this.isOpen) this.close();
  };

  constructor(parent: HTMLElement, feed: WorldFeed) {
    const close = h(
      'button',
      {
        type: 'button',
        class: 'wdi-btn wdi-btn--icon wdi-btn--ghost wdi-notebook-sheet__close',
        'aria-label': C['hud.notebook.close'],
      },
      icon('glyphs/glyph_close'),
    );
    const page = h('div', { class: 'wdi-notebook-sheet__page' }, close);
    this.root = h('div', { class: 'wdi-root wdi-notebook-sheet', hidden: true }, page);
    this.panel = new NotebookPanel(page, feed);
    parent.append(this.root);
    close.addEventListener('click', () => this.close());
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.close();
    });
    window.addEventListener('keydown', this.keydown);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    this.panel.update();
    this.root.hidden = false;
  }

  close(): void {
    this.root.hidden = true;
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  update(): void {
    if (this.isOpen) this.panel.update();
  }

  destroy(): void {
    window.removeEventListener('keydown', this.keydown);
    this.root.remove();
  }
}
