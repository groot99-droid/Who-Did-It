// Round 6, Session 6D (docs/round6/auto-admin.md 8): the event stream and the invariant failures as red rows that
// stay until Reset. Failures sort above the events so a long stream never pushes one out of sight.
import type { InvariantFailure, SimEventWire } from '@wdi/shared/protocol';
import { ADMIN_COPY as C, fill } from '../ui/copy';
import { h, type Screen } from '../ui/dom';
import type { AdminStore } from './model';

export const failureLine = (f: InvariantFailure): string =>
  fill(C['admin.log.invariant'], { name: f.name, tick: f.tick, detail: f.detail });

export const eventLine = (e: SimEventWire): string =>
  fill(C['admin.log.event'], {
    tick: e.tick,
    kind: e.kind,
    seat: e.seat === undefined ? '' : ` (${e.seat})`,
  });

export function mountLogPane(root: HTMLElement, store: AdminStore): Screen {
  const list = h('ol', { class: 'wdi-admin__log-list', 'data-testid': 'admin-log-list' });
  const panel = h(
    'section',
    { class: 'wdi-admin__log', 'aria-label': C['admin.log'], 'data-testid': 'admin-log' },
    h('h2', {}, C['admin.log']),
    list,
  );
  root.append(panel);
  const render = () => {
    const rows = [
      ...store.failures.map((f) =>
        h(
          'li',
          {
            class: 'wdi-admin__log-row wdi-admin__log-row--fail',
            'data-testid': 'admin-log-failure',
            role: 'alert',
          },
          failureLine(f),
        ),
      ),
      ...store.events
        .slice()
        .reverse()
        .map((e) => h('li', { class: 'wdi-admin__log-row', 'data-testid': 'admin-log-event' }, eventLine(e))),
    ];
    list.replaceChildren(
      ...(rows.length === 0 ? [h('li', { class: 'wdi-admin__log-row' }, C['admin.log.empty'])] : rows),
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
