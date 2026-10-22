// Round 6, Session 6D (docs/round6/auto-admin.md 8): the seat inspector (role, cover, inventory, notebook, the
// brain fields of `AdminSeat.brain`), the seat list that picks it, the follow button and the queue of scenes that did
// not fit the grid. It reads the admin store and only calls back into it.
import type { AdminSeat } from '@wdi/shared/protocol';
import { ADMIN_COPY as C, fill } from '../ui/copy';
import { h, type Screen } from '../ui/dom';
import type { AdminStore, InspectedSeat } from './model';

const yesNo = (b: boolean) => (b ? C['admin.inspector.yes'] : C['admin.inspector.no']);

/** The lines of the inspector for one seat: label and value, in the order they are shown. */
export function inspectorRows(seat: InspectedSeat): Array<[string, string]> {
  const list = (items: readonly string[] | undefined) =>
    items === undefined ? C['admin.inspector.unreported'] : items.length === 0 ? '-' : items.join(', ');
  return [
    [C['admin.inspector.role'], seat.roleId],
    [
      C['admin.inspector.cover'],
      seat.coverOf === undefined
        ? C['admin.inspector.cover.none']
        : fill(C['admin.inspector.cover.worn'], { look: seat.look }),
    ],
    [C['admin.inspector.scene'], seat.sceneId],
    [C['admin.inspector.position'], `${Math.round(seat.x)}, ${Math.round(seat.y)}`],
    [C['admin.inspector.state'], seat.dead ? C['admin.inspector.dead'] : C['admin.inspector.alive']],
    [
      C['admin.inspector.brain'],
      seat.brain === undefined
        ? C['admin.inspector.brain.none']
        : fill(C['admin.inspector.brain.line'], {
            mode: seat.brain.mode,
            goal: seat.brain.goal === '' ? '-' : seat.brain.goal,
            striking: yesNo(seat.brain.striking),
            flee: yesNo(seat.brain.flee),
          }),
    ],
    [C['admin.inspector.inventory'], list(seat.inventory)],
    [C['admin.inspector.notebook'], list(seat.notebook)],
  ];
}

export function mountSeatInspector(root: HTMLElement, store: AdminStore): Screen {
  const seatList = h('ul', { class: 'wdi-admin__seats', 'data-testid': 'admin-seats-list' });
  const detail = h('dl', { class: 'wdi-admin__detail', 'data-testid': 'admin-inspector-detail' });
  const follow = h('button', { type: 'button', class: 'wdi-admin__btn', 'data-testid': 'admin-follow' });
  const queue = h('div', { class: 'wdi-admin__queue', 'data-testid': 'admin-queue' });
  const panel = h(
    'aside',
    { class: 'wdi-admin__inspector', 'aria-label': C['admin.inspector'], 'data-testid': 'admin-inspector' },
    h('h2', {}, C['admin.inspector']),
    seatList,
    detail,
    follow,
    queue,
  );
  follow.addEventListener('click', () => {
    if (store.followed !== null) store.follow(null);
    else if (store.selected !== null) store.follow(store.selected);
  });
  root.append(panel);

  let listKey = '';
  let queueKey = '';
  const render = () => {
    const seats: readonly AdminSeat[] = store.snapshot?.seats ?? [];
    // The list rebuilds only when who is in it or who is picked changes, so a click is never lost to a redraw.
    const key = `${seats.map((s) => `${s.id}${s.dead ? 'x' : ''}`).join()}|${store.selected}`;
    if (key !== listKey) {
      listKey = key;
      seatList.replaceChildren(
        ...seats.map((s) =>
          h(
            'li',
            {},
            h(
              'button',
              {
                type: 'button',
                class: 'wdi-admin__seat',
                'aria-pressed': String(store.selected === s.id),
                'data-testid': `admin-seat-${s.id}`,
                onClick: () => store.select(s.id),
              },
              s.dead ? `${s.name} †` : s.name,
            ),
          ),
        ),
      );
    }
    const seat = store.seat(store.selected);
    detail.replaceChildren(
      ...(seat === null
        ? [h('dd', {}, C['admin.inspector.none'])]
        : inspectorRows(seat).flatMap(([k, v]) => [
            h('dt', {}, k),
            h('dd', { 'data-testid': `admin-detail-${k.toLowerCase()}` }, v),
          ])),
    );
    follow.textContent = store.followed !== null ? C['admin.unfollow'] : C['admin.follow'];
    follow.disabled = store.followed === null && seat === null;
    const queued = store.queuedScenes();
    // Redraw only on a change, so a click on a queue button is never lost to the next tick's render.
    if (queued.join() === queueKey) return;
    queueKey = queued.join();
    queue.replaceChildren(
      ...(queued.length === 0
        ? []
        : [
            h('h3', {}, C['admin.queue']),
            ...queued.map((id) =>
              h(
                'button',
                {
                  type: 'button',
                  class: 'wdi-admin__btn',
                  'data-testid': `admin-queue-${id}`,
                  onClick: () => store.pin(id),
                },
                fill(C['admin.queue.pick'], { scene: id }),
              ),
            ),
          ]),
    );
  };
  store.bus.on('change', render);
  render();
  return {
    destroy() {
      store.bus.off('change', render);
      panel.remove();
    },
  };
}
