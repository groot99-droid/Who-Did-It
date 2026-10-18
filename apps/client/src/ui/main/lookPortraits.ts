import type { MeetingPlayer } from '../../net/meeting';
import { DECK_COPY as C, fill } from '../copy';
import { h } from '../dom';
import { lookBase, lookName } from './cards';

/**
 * Main-mode meeting portraits by public look (GDD 3.17): `ui/Meeting.ts` calls it for every main-mode seat after
 * drawing the trait portrait (height, scarf and hat stay on the roster, GDD 3.1) into `root`. The seat's look
 * is marked on it as a tag in the look's own body colour; the card portraits of the art session draw into the same
 * slot through `ui/portrait.ts` once they ship. A seat with no look yet, or a look the content lacks, is left alone.
 */
export function renderLookPortrait(root: HTMLElement, seat: MeetingPlayer): void {
  const name = lookName(seat.look);
  if (name === '') return;
  root.dataset.look = seat.look;
  root.querySelector('.wdi-look-tag')?.remove();
  root.append(
    h(
      'span',
      {
        class: `wdi-look-tag wdi-look-tag--${lookBase(seat.look)}`,
        'data-testid': `look-${seat.id}`,
        title: fill(C['look.badge'], { look: name }),
      },
      name,
    ),
  );
}

/**
 * The reveal line for an ejected seat's look, e.g. "Walking as the Baker." (GDD 3.8, 3.17); `ui/Meeting.ts` appends
 * it to the main-mode ejection line when it is not empty. '' for a seat with no known look.
 */
export function revealLookLine(look: string): string {
  const name = lookName(look);
  return name === '' ? '' : fill(C['reveal.look'], { look: name });
}
