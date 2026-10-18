import { fill } from '../../ui/copy';
import { ONUB_NIGHT_COPY as C } from '../../ui/copy/onubNight';
import { h } from '../../ui/dom';
import { pantrySlot, seatSlot } from '../../ui/onub/slots';

export interface TableSeat {
  id: string;
  name: string;
  self: boolean;
}

/** A card's remembered face: what the seat was dealt or an act showed it. */
export interface Face {
  text: string;
  /** `dealt` is memory of the deal, `seen` was shown by an act. */
  how: 'dealt' | 'seen';
}

export interface TableModel {
  seats: TableSeat[];
  pantryRoles: number;
  pantryLocs: number;
  /** Slot -> face; every other card lies face down. */
  faces: ReadonlyMap<string, Face>;
  /** Slots the seat may tap now. */
  selectable: ReadonlySet<string>;
  picked: readonly string[];
  /** The slot under the Iron Cloche, or empty. */
  cloche: string;
  /** Seats to light (the other Spore, the Spores a Levain sees). */
  glow: ReadonlySet<string>;
}

/**
 * The card table of a waker's role scene (GDD 3.11): one Role and one Location card per seat in deal order, the
 * Pantry's cards and the Iron Cloche. A slot is a button with `data-testid="slot-<slotId>"`; the count of them
 * is `2 * seats + pantry.roles + pantry.locations`. Rebuilt only when the model changes.
 */
export class CardTableView {
  readonly root: HTMLElement;
  private signature = '';

  constructor(private readonly onPick: (slot: string) => void) {
    this.root = h('div', { class: 'wdi-card-table', 'data-testid': 'card-table' });
  }

  render(model: TableModel): void {
    const sig = JSON.stringify([
      model.seats,
      model.pantryRoles,
      model.pantryLocs,
      [...model.faces],
      [...model.selectable],
      model.picked,
      model.cloche,
      [...model.glow],
    ]);
    if (sig === this.signature) return;
    this.signature = sig;

    const card = (slot: string, caption: string) => {
      const face = model.faces.get(slot);
      const can = model.selectable.has(slot);
      const classes = [
        'wdi-slot',
        face === undefined ? 'is-down' : `is-${face.how}`,
        can ? 'is-selectable' : '',
        model.picked.includes(slot) ? 'is-picked' : '',
        model.cloche === slot ? 'is-covered' : '',
      ];
      const b = h(
        'button',
        {
          type: 'button',
          class: classes.filter((c) => c !== '').join(' '),
          'data-testid': `slot-${slot}`,
          disabled: !can,
          'aria-pressed': String(model.picked.includes(slot)),
        },
        h('span', { class: 'wdi-slot__caption' }, caption),
        face !== undefined && h('span', { class: 'wdi-slot__face' }, face.text),
        model.cloche === slot &&
          h('span', { class: 'wdi-slot__cloche', 'data-testid': 'cloche-token' }, C['onub.cloche.token']),
      );
      b.addEventListener('click', () => this.onPick(slot));
      return b;
    };

    const seats = model.seats.map((s, i) =>
      h(
        'div',
        { class: `wdi-seat-cards${s.self ? ' is-self' : ''}${model.glow.has(s.id) ? ' is-glow' : ''}` },
        h('p', { class: 'wdi-seat-cards__name' }, s.self ? C['onub.night.slot.you'] : s.name),
        card(
          seatSlot(i, 'role'),
          fill(C['onub.night.slot.seatRole'], { name: s.self ? C['onub.night.slot.you'] : s.name }),
        ),
        card(
          seatSlot(i, 'loc'),
          fill(C['onub.night.slot.seatLoc'], { name: s.self ? C['onub.night.slot.you'] : s.name }),
        ),
      ),
    );
    const pantry = h(
      'div',
      { class: 'wdi-pantry-cards' },
      ...Array.from({ length: model.pantryRoles }, (_, k) =>
        card(pantrySlot(k, 'role'), fill(C['onub.night.slot.pantryRole'], { n: k + 1 })),
      ),
      ...Array.from({ length: model.pantryLocs }, (_, k) =>
        card(pantrySlot(k, 'loc'), fill(C['onub.night.slot.pantryLoc'], { n: k + 1 })),
      ),
    );
    this.root.replaceChildren(h('div', { class: 'wdi-seat-row' }, ...seats), pantry);
  }
}
