import type { S2CPayloads } from '@wdi/shared/protocol';
import { fill } from '../copy';
import { INSPECT_COPY as C, healthLine, inspectLine, purseLine } from '../copy/inspect';
import { h } from '../dom';
import { lookName } from '../portrait';
import './inspect.css';

// The inspect card (GDD 3.22 "Inspect", UI.md 14.33), Session 8B: what the eye read of a figure, shown in the HUD
// until it is closed, replaced or `INSPECT_CARD_MS` passes. 8H animates `.wdi-inspect` by class.

/** How long a card stays up unless closed; a reading time, not a rule number. */
export const INSPECT_CARD_MS = 6000;

export type InspectResult = S2CPayloads['inspect.result'];

/** A look's name opens the line ("the Vicar" -> "The Vicar"). */
const capital = (line: string): string => line.charAt(0).toUpperCase() + line.slice(1);

/** The card's lines for a result: the signs (or "no sign"), then health, purse and a burning light. */
export function inspectLines(r: InspectResult): { title: string; signs: string[]; facts: string[] } {
  const signs = r.signs.map(inspectLine).filter((line): line is string => line !== null);
  const facts = [healthLine(r.health), purseLine(r.purse)];
  if (r.light) facts.push(C['inspect.light']);
  return {
    title: capital(fill(C['inspect.title'], { look: lookName(r.lookId) || r.lookId })),
    signs: signs.length > 0 ? signs : [C['inspect.signs.none']],
    facts,
  };
}

export interface InspectCard {
  show(r: InspectResult): void;
  close(): void;
  destroy(): void;
}

export function mountInspectCard(parent: HTMLElement, ms = INSPECT_CARD_MS): InspectCard {
  let el: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const close = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    el?.remove();
    el = null;
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && el) close();
  };
  window.addEventListener('keydown', onKey);
  return {
    show(r) {
      close();
      const lines = inspectLines(r);
      el = h(
        'section',
        {
          class: 'wdi-panel wdi-inspect',
          role: 'dialog',
          'aria-label': lines.title,
          'data-testid': 'inspect',
        },
        h('h2', { class: 'wdi-inspect__title' }, lines.title),
        h('ul', { class: 'wdi-inspect__signs' }, ...lines.signs.map((s) => h('li', {}, s))),
        h('ul', { class: 'wdi-inspect__facts' }, ...lines.facts.map((s) => h('li', {}, s))),
        h('button', { class: 'wdi-inspect__close', type: 'button', onclick: close }, C['inspect.close']),
      );
      parent.append(el);
      timer = setTimeout(close, ms);
    },
    close,
    destroy() {
      close();
      window.removeEventListener('keydown', onKey);
    },
  };
}

/** The toast line for `inspect.noticed`: the inspector's look, or "someone" for a look this build cannot name. */
export function noticedLine(lookId: string): string {
  const look = lookName(lookId);
  return look === '' ? C['inspect.noticed.someone'] : capital(fill(C['inspect.noticed'], { look }));
}
