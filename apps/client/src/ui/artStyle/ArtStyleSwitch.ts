import { ART_STYLE_COPY as C, styleName } from '../copy/artStyle';
import { fill } from '../copy';
import { h, type Screen } from '../dom';
import {
  ART_STYLES,
  RESERVED_STYLE_IDS,
  currentStyleId,
  isSwitching,
  onArtStyleChanged,
  requestArtStyle,
} from '../../view/artStyle';
import './artStyle.css';

// The segmented "8-bit | Low poly | HD" control (A79, UI.md 14.18). The options come from `style.json` `artStyles`;
// each reserved id shows disabled with a "coming later" hint. Mounted in the lobby and in the match; every copy
// follows the one pick. A radio group: arrow keys move and select, Tab leaves, Space and Enter select.

let veil: HTMLElement | null = null;
let notice: HTMLElement | null = null;
let noticeTimer: number | undefined;

function ensureLayers(): { veil: HTMLElement; notice: HTMLElement } {
  if (veil === null || !veil.isConnected) {
    veil = h(
      'div',
      { class: 'wdi-artveil', role: 'status', hidden: true, 'data-testid': 'art-veil' },
      C['artStyle.loading'],
    );
    document.body.append(veil);
  }
  if (notice === null || !notice.isConnected) {
    notice = h('div', { class: 'wdi-artnotice', role: 'alert', hidden: true, 'data-testid': 'art-notice' });
    document.body.append(notice);
  }
  return { veil, notice };
}

/** Switches with the loading veil up; a failed swap stays on the old style and says so for a few seconds. */
export async function switchWithVeil(id: string): Promise<boolean> {
  const layers = ensureLayers();
  const before = currentStyleId();
  layers.veil.hidden = false;
  document.body.setAttribute('aria-busy', 'true');
  try {
    const ok = await requestArtStyle(id);
    if (!ok) {
      layers.notice.textContent = fill(C['artStyle.failed'], {
        style: styleName(id),
        current: styleName(before),
      });
      layers.notice.hidden = false;
      window.clearTimeout(noticeTimer);
      noticeTimer = window.setTimeout(() => (layers.notice.hidden = true), 4000);
    }
    return ok;
  } finally {
    layers.veil.hidden = true;
    document.body.removeAttribute('aria-busy');
  }
}

export interface ArtStyleSwitch extends Screen {
  readonly el: HTMLElement;
}

export function mountArtStyleSwitch(root: HTMLElement, opts: { compact?: boolean } = {}): ArtStyleSwitch {
  const labelId = `art-style-label-${Math.random().toString(36).slice(2, 8)}`;
  const hintId = `${labelId}-hint`;
  const radios = new Map<string, HTMLButtonElement>();

  const sync = () => {
    const now = currentStyleId();
    for (const [id, b] of radios) {
      const on = id === now;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
      b.classList.toggle('is-on', on);
    }
  };
  // A control whose screen is gone (the lobby is rebuilt) stops listening; one not attached yet (a screen still being
  // built) does not.
  let seen = false;
  let off = () => {};
  const follow = () => {
    if (el.isConnected) seen = true;
    else if (seen) return off();
    sync();
  };

  const choose = (id: string) => {
    if (id === currentStyleId() || isSwitching()) return;
    void switchWithVeil(id).then(follow);
  };

  const options = ART_STYLES.map((s) => {
    const b = h(
      'button',
      {
        type: 'button',
        role: 'radio',
        class: 'wdi-seg__opt',
        'aria-checked': 'false',
        'aria-label': fill(C['artStyle.pick'], { style: styleName(s.id) }),
        'data-testid': `art-style-${s.id}`,
        'data-style': s.id,
      },
      styleName(s.id),
    );
    b.addEventListener('click', () => choose(s.id));
    radios.set(s.id, b);
    return b;
  });

  const reserved = RESERVED_STYLE_IDS.map((id) =>
    h(
      'button',
      {
        type: 'button',
        role: 'radio',
        class: 'wdi-seg__opt',
        disabled: true,
        'aria-checked': 'false',
        'aria-disabled': 'true',
        'aria-describedby': hintId,
        title: C['artStyle.reserved.hint'],
        'data-testid': `art-style-${id}`,
      },
      styleName(id),
    ),
  );

  const group = h(
    'div',
    { class: 'wdi-seg wdi-seg--glass', role: 'radiogroup', 'aria-labelledby': labelId },
    ...options,
    ...reserved,
  );
  group.addEventListener('keydown', (e) => {
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    if (step === 0) return;
    const ids = ART_STYLES.map((s) => s.id);
    const i = ids.indexOf(currentStyleId());
    const next = ids[(i + step + ids.length) % ids.length];
    if (next === undefined) return;
    e.preventDefault();
    radios.get(next)?.focus();
    choose(next);
  });

  const el = h(
    'div',
    {
      class: opts.compact ? 'wdi-artstyle wdi-artstyle--compact' : 'wdi-artstyle',
      'data-testid': 'art-style',
    },
    h('span', { class: 'wdi-label wdi-artstyle__label', id: labelId }, C['artStyle.label']),
    group,
    reserved.length > 0
      ? h('span', { class: 'wdi-seg__note wdi-artstyle__hint', id: hintId }, C['artStyle.reserved.hint'])
      : null,
  );
  root.append(el);
  sync();
  off = onArtStyleChanged(follow);
  return {
    el,
    destroy() {
      off();
      el.remove();
    },
  };
}

/** The in-match placement for the DOM-only quick-mode screens: a small fixed control at the bottom left. */
export function mountMatchArtSwitch(root: HTMLElement): ArtStyleSwitch {
  const wrap = h('div', { class: 'wdi-artcorner' });
  root.append(wrap);
  const sw = mountArtStyleSwitch(wrap, { compact: true });
  return {
    el: wrap,
    destroy() {
      sw.destroy();
      wrap.remove();
    },
  };
}
