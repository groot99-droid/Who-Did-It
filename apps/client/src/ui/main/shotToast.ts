import type { S2CPayloads } from '@wdi/shared/protocol';
import { DECK_COPY as C, fill } from '../copy';
import { h } from '../dom';
import { cardName } from './cards';

/** How long the toast stays on the board (ms). */
const TOAST_MS = 7000;

/**
 * The public `shot` broadcast during a reveal (GDD 3.2): the ejected Gamekeeper's Last Shot, its target and the
 * target's role. `ui/Meeting.ts` calls it on every `shot` from the meeting feed; the toast leaves by itself.
 */
export function showShotToast(
  root: HTMLElement,
  shot: S2CPayloads['shot'],
  names: (id: string) => string,
): void {
  const toast = h(
    'div',
    { class: 'wdi-toast wdi-toast--shot', role: 'status', 'data-testid': 'shot-toast' },
    fill(C['shot.line'], {
      from: names(shot.fromId),
      target: names(shot.targetId),
      role: cardName(shot.role),
    }),
  );
  root.append(toast);
  window.setTimeout(() => toast.remove(), TOAST_MS);
}
