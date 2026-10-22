// Round 6, Session 6D (docs/round6/auto-admin.md 8): the DOM controls (1x/2x/5x/10x, pause, step, the seed words,
// map, mode, deck, difficulty, seats, Start, Reset). Every button sends one admin message; the server queues it into
// the step, so nothing here changes the match by itself.
import type { AdminC2SPayloads, AdminC2SType, ClockScale } from '@wdi/shared/protocol';
import { ADMIN_COPY as C, fill } from '../ui/copy';
import { h, type Screen } from '../ui/dom';
import { MAP_ROWS } from '../ui/lobby/MapPicker';
import type { AdminStore } from './model';

export const SCALES: readonly ClockScale[] = [1, 2, 5, 10];
export const DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
/** The server accepts 4 to 10 seats of a match (GDD 3); the control stays inside that. */
export const SEAT_RANGE = { min: 4, max: 10 } as const;

/** The seed words of `admin.setup`: a stream name to four 32-bit words. */
export type FixedSeeds = NonNullable<AdminC2SPayloads['admin.setup']['seeds']>;

export type Send = <K extends AdminC2SType>(type: K, payload: AdminC2SPayloads[K]) => void;

export type SeedParse = { ok: true; seeds: FixedSeeds | undefined } | { ok: false; line: string };

/** One stream per line: `world 1 2 3 4`. Blank text means no fixed seeds. */
export function parseSeeds(text: string): SeedParse {
  const seeds: Record<string, readonly [number, number, number, number]> = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    const parts = line.split(/[\s,]+/);
    const [name, ...words] = parts;
    const nums = words.map(Number);
    if (
      name === undefined ||
      !/^[A-Za-z]\w*$/.test(name) ||
      nums.length !== 4 ||
      !nums.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff)
    ) {
      return { ok: false, line };
    }
    seeds[name] = nums as unknown as readonly [number, number, number, number];
  }
  return { ok: true, seeds: Object.keys(seeds).length === 0 ? undefined : seeds };
}

export interface SetupForm {
  map: string;
  mode: 'main' | 'onub';
  seats: number;
  difficulty: (typeof DIFFICULTIES)[number];
  deck: string;
  seeds: FixedSeeds | undefined;
}

/** The `admin.setup` payload of a form: the deck is the comma list of role ids, omitted when empty. */
export function setupPayload(f: SetupForm): AdminC2SPayloads['admin.setup'] {
  const deck = f.deck
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  const seats = Math.max(SEAT_RANGE.min, Math.min(SEAT_RANGE.max, Math.round(f.seats) || SEAT_RANGE.min));
  return {
    map: f.map,
    mode: f.mode,
    seats,
    difficulty: f.difficulty,
    ...(deck.length > 0 ? { deck } : {}),
    ...(f.seeds !== undefined ? { seeds: f.seeds } : {}),
  };
}

export function statusLine(
  snap: { tick: number; phase: number; paused: boolean; effectiveScale: number } | null,
): string {
  if (snap === null) return C['admin.empty'];
  const base = { tick: snap.tick, phase: snap.phase };
  return snap.paused
    ? fill(C['admin.status.paused'], base)
    : fill(C['admin.status'], { ...base, effective: Math.round(snap.effectiveScale * 10) / 10 });
}

export function mountControls(
  root: HTMLElement,
  send: Send,
  store: AdminStore,
  onSignOut: () => void,
): Screen {
  const tid = (id: string) => ({ 'data-testid': id });
  const scaleButtons = SCALES.map((scale) =>
    h(
      'button',
      {
        type: 'button',
        class: 'wdi-admin__btn',
        ...tid(`admin-scale-${scale}`),
        'aria-pressed': 'false',
        onClick: () => send('admin.clock', { scale }),
      },
      fill(C['admin.scale.pick'], { scale }),
    ),
  );
  const pause = h(
    'button',
    { type: 'button', class: 'wdi-admin__btn', ...tid('admin-pause') },
    C['admin.pause'],
  );
  pause.addEventListener('click', () => send('admin.clock', { paused: !(store.snapshot?.paused ?? false) }));
  const stepCount = h('input', {
    type: 'number',
    min: 1,
    max: 600,
    value: 1,
    class: 'wdi-admin__num',
    'aria-label': C['admin.step.count'],
    ...tid('admin-step-count'),
  });
  const step = h(
    'button',
    { type: 'button', class: 'wdi-admin__btn', ...tid('admin-step') },
    C['admin.step'],
  );
  step.addEventListener('click', () => {
    const n = Math.max(1, Math.min(600, Math.round(Number(stepCount.value)) || 1));
    send('admin.clock', { paused: true, step: n });
  });

  const select = (id: string, label: string, options: Array<[string, string]>, value: string) => {
    const el = h('select', { class: 'wdi-admin__field', id: `admin-${id}`, ...tid(`admin-${id}`) });
    for (const [v, text] of options) el.append(h('option', { value: v }, text));
    el.value = value;
    return { el, row: h('label', { class: 'wdi-admin__row', for: `admin-${id}` }, h('span', {}, label), el) };
  };
  const map = select(
    'map',
    C['admin.map'],
    MAP_ROWS.map((m) => [m.id, m.name]),
    MAP_ROWS[0]?.id ?? '',
  );
  const mode = select(
    'mode',
    C['admin.mode'],
    [
      ['main', C['admin.mode.main']],
      ['onub', C['admin.mode.onub']],
    ],
    'main',
  );
  const difficulty = select(
    'difficulty',
    C['admin.difficulty'],
    DIFFICULTIES.map((d) => [d, C[`admin.difficulty.${d}`]]),
    'normal',
  );
  const seats = h('input', {
    type: 'number',
    min: SEAT_RANGE.min,
    max: SEAT_RANGE.max,
    value: 6,
    id: 'admin-seats',
    class: 'wdi-admin__num',
    ...tid('admin-seats'),
  });
  const deck = h('input', {
    type: 'text',
    id: 'admin-deck',
    class: 'wdi-admin__field',
    ...tid('admin-deck'),
  });
  const seeds = h('textarea', {
    id: 'admin-seeds',
    class: 'wdi-admin__field wdi-admin__seeds',
    rows: 2,
    placeholder: C['admin.seeds.hint'],
    ...tid('admin-seeds'),
  });
  const problem = h('p', {
    class: 'wdi-admin__problem',
    role: 'alert',
    hidden: true,
    ...tid('admin-seeds-error'),
  });

  const start = h(
    'button',
    { type: 'button', class: 'wdi-admin__btn wdi-admin__btn--go', ...tid('admin-start') },
    C['admin.start'],
  );
  start.addEventListener('click', () => {
    const parsed = parseSeeds(seeds.value);
    problem.hidden = parsed.ok;
    if (!parsed.ok) {
      problem.textContent = fill(C['admin.seeds.invalid'], { line: parsed.line });
      return;
    }
    store.mapId = map.el.value;
    send(
      'admin.setup',
      setupPayload({
        map: map.el.value,
        mode: mode.el.value === 'onub' ? 'onub' : 'main',
        seats: Number(seats.value),
        difficulty: DIFFICULTIES.find((d) => d === difficulty.el.value) ?? 'normal',
        deck: deck.value,
        seeds: parsed.seeds,
      }),
    );
    send('admin.start', {});
  });
  const reset = h(
    'button',
    { type: 'button', class: 'wdi-admin__btn', ...tid('admin-reset') },
    C['admin.reset'],
  );
  reset.addEventListener('click', () => {
    send('admin.reset', {});
    store.reset();
  });
  const signOut = h(
    'button',
    { type: 'button', class: 'wdi-admin__btn', ...tid('admin-signout') },
    C['admin.signout'],
  );
  signOut.addEventListener('click', onSignOut);

  const status = h('p', { class: 'wdi-admin__status', role: 'status', ...tid('admin-status') });
  const setup = h(
    'details',
    { class: 'wdi-admin__setup', ...tid('admin-setup') },
    h('summary', {}, C['admin.controls']),
    map.row,
    mode.row,
    difficulty.row,
    h('label', { class: 'wdi-admin__row', for: 'admin-seats' }, h('span', {}, C['admin.seatCount']), seats),
    h('label', { class: 'wdi-admin__row', for: 'admin-deck' }, h('span', {}, C['admin.deck']), deck),
    h('label', { class: 'wdi-admin__row', for: 'admin-seeds' }, h('span', {}, C['admin.seeds.label']), seeds),
    problem,
  );
  const bar = h(
    'section',
    { class: 'wdi-admin__controls', 'aria-label': C['admin.controls'], ...tid('admin-controls') },
    h(
      'div',
      { class: 'wdi-admin__group', role: 'group', 'aria-label': C['admin.scale.label'] },
      ...scaleButtons,
    ),
    pause,
    stepCount,
    step,
    start,
    reset,
    status,
    signOut,
    setup,
  );
  root.append(bar);

  const refresh = () => {
    const snap = store.snapshot;
    status.textContent = statusLine(snap);
    pause.textContent = snap?.paused ? C['admin.resume'] : C['admin.pause'];
    scaleButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(snap?.scale === SCALES[i])));
  };
  store.bus.on('change', refresh);
  refresh();
  return {
    destroy() {
      store.bus.off('change', refresh);
      bar.remove();
    },
  };
}
