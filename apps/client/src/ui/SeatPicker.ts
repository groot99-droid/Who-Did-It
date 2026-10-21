import { LOOKS_COPY } from './copy';
import { h, type Screen } from './dom';
import { type PortraitLook, type PortraitTextures, drawPortrait } from './portrait';

// The list of publicly living seats, each with its name and portrait (GDD 3.17): the target picker of Impersonate,
// and of the night powers and the Last Shot aim (Session 5G plugs into it). A `target: 'seat'` ability names a seat
// id, not an avatar handle, so this list is the only way to aim one. It reads the public roster only.

export interface SeatChoice {
  id: string;
  name: string;
  /** Public look id (`Player.look`); '' draws the trait portrait. */
  look: string;
  traits: PortraitLook;
}

export interface SeatPickerOptions {
  title: string;
  seats: readonly SeatChoice[];
  textures?: PortraitTextures | null;
  onPick(id: string): void;
  onCancel(): void;
}

/** Mounts the picker into `root`; Escape or Cancel closes it with `onCancel`, a pick with `onPick`. */
export function mountSeatPicker(root: HTMLElement, opts: SeatPickerOptions): Screen {
  const close = (run: () => void) => () => {
    screen.destroy();
    run();
  };
  const rows = opts.seats.map((seat) => {
    const canvas = h('canvas', { class: 'wdi-seat__portrait', 'aria-hidden': 'true' });
    drawPortrait(canvas, opts.textures ?? null, seat.traits, seat.name, seat.look);
    return h(
      'li',
      {},
      h(
        'button',
        {
          type: 'button',
          class: 'wdi-seat',
          'data-testid': 'seat-choice',
          'data-seat': seat.id,
          onClick: close(() => opts.onPick(seat.id)),
        },
        canvas,
        h('span', { class: 'wdi-seat__name' }, seat.name),
      ),
    );
  });
  const cancel = h(
    'button',
    {
      type: 'button',
      class: 'wdi-btn wdi-btn--sm',
      'data-testid': 'seat-cancel',
      onClick: close(opts.onCancel),
    },
    LOOKS_COPY['seats.cancel'],
  );
  const panel = h(
    'div',
    { class: 'wdi-seatpicker', role: 'dialog', 'aria-label': opts.title, 'data-testid': 'seat-picker' },
    h('p', { class: 'wdi-eyebrow' }, opts.title),
    rows.length > 0
      ? h('ul', { class: 'wdi-seatpicker__list' }, ...rows)
      : h('p', { class: 'wdi-muted' }, LOOKS_COPY['seats.empty']),
    cancel,
  );
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    close(opts.onCancel)();
  };
  document.addEventListener('keydown', onKey);
  root.append(panel);
  const screen: Screen = {
    destroy: () => {
      document.removeEventListener('keydown', onKey);
      panel.remove();
    },
  };
  return screen;
}
