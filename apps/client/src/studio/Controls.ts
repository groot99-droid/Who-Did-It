// Round 9 (9T, docs/round9/admin-studio.md 2): the creative-mode HUD. Every control sends one `studio.*` message;
// the room queues it into its step, so nothing here changes the world by itself.
import type { StudioC2SPayloads, StudioC2SType, StudioDayPhase, StudioSpawnKind } from '@wdi/shared/protocol';
import { STUDIO_DAY_PHASES } from '@wdi/shared/protocol';
import { fill, STUDIO_COPY as C } from '../ui/copy';
import { h, type Screen } from '../ui/dom';
import { ART_STYLES, currentStyleId } from '../view/artStyle';
import { OVERLAYS } from './overlayData';
import { CLOCK_SCALES, filterIds, spawnsOf, STUDIO_LISTS, statusOf, type StudioStore } from './model';

export type StudioSend = <K extends StudioC2SType>(type: K, payload: StudioC2SPayloads[K]) => void;

const SPAWN_KINDS: readonly StudioSpawnKind[] = ['mob', 'townsfolk', 'look'];
const PROFILES = ['small', 'medium', 'large'] as const;

export interface ControlDeps {
  send: StudioSend;
  store: StudioStore;
  onSignOut: () => void;
  /** Switches the art style live (the Studio may; the game itself does not). */
  onStyle: (id: string) => void;
  onReport: () => void;
  onInbox: () => void;
}

export function mountControls(root: HTMLElement, d: ControlDeps): Screen {
  const { send, store } = d;
  const tid = (id: string) => ({ 'data-testid': id });
  const btn = (id: string, text: string, onClick: () => void, cls = '') => {
    const b = h('button', { type: 'button', class: `wdi-admin__btn ${cls}`.trim(), ...tid(id) }, text);
    b.addEventListener('click', onClick);
    return b;
  };
  const select = (id: string, options: Array<[string, string]>) => {
    const el = h('select', { class: 'wdi-admin__field', ...tid(id) });
    for (const [v, text] of options) el.append(h('option', { value: v }, text));
    return el;
  };

  // Scenes: a search box over a list; a click picks the scene, "Go" teleports to one of its spawns.
  let picked = '';
  const search = h('input', {
    type: 'search',
    class: 'wdi-admin__field',
    placeholder: C['studio.scene.search'],
    'aria-label': C['studio.scene.search'],
    ...tid('studio-scene-search'),
  });
  const sceneList = h('ul', { class: 'wdi-studio__scenes', ...tid('studio-scenes') });
  const fillScenes = () => {
    sceneList.replaceChildren(
      ...filterIds(STUDIO_LISTS.scenes, search.value).map((id) => {
        const b = btn(`studio-scene-${id}`, id, () => pick(id));
        b.setAttribute('aria-current', String(store.snapshot?.sceneId === id));
        return h('li', {}, b);
      }),
    );
  };
  search.addEventListener('input', fillScenes);
  const spawnPick = select('studio-teleport-spawn', []);
  const pick = (id: string) => {
    picked = id;
    spawnPick.replaceChildren(...spawnsOf(id).map((s) => h('option', { value: s }, s)));
  };
  const go = btn('studio-teleport', C['studio.teleport'], () => {
    if (picked !== '' && spawnPick.value !== '') {
      send('studio.teleport', { sceneId: picked, spawnId: spawnPick.value });
    }
  });

  const noclip = btn('studio-noclip', C['studio.noclip'], () =>
    send('studio.noclip', { on: !(store.snapshot?.noclip ?? false) }),
  );
  const phaseButtons = STUDIO_DAY_PHASES.map((phase: StudioDayPhase) =>
    btn(`studio-time-${phase}`, C[`studio.time.${phase}`], () => send('studio.time', { phase })),
  );
  const scrub = h('input', {
    type: 'range',
    min: 0,
    max: 100,
    value: 50,
    'aria-label': C['studio.time'],
    ...tid('studio-time-t'),
  });
  scrub.addEventListener('change', () => {
    const phase = store.snapshot?.time.phase ?? 'day';
    send('studio.time', { phase, t: Number(scrub.value) / 100 });
  });
  const scaleButtons = CLOCK_SCALES.map((scale) =>
    btn(`studio-scale-${scale}`, fill(C['studio.speed.pick'], { scale }), () =>
      send('studio.clock', { scale }),
    ),
  );
  const pause = btn('studio-pause', C['studio.pause'], () =>
    send('studio.clock', { paused: !(store.snapshot?.paused ?? false) }),
  );
  const step = btn('studio-step', C['studio.step'], () => send('studio.clock', { paused: true, step: 1 }));
  const profileButtons = PROFILES.map((profile) =>
    btn(`studio-profile-${profile}`, C[`studio.profile.${profile}`], () =>
      send('studio.profile', { profile }),
    ),
  );

  const style = select(
    'studio-style',
    ART_STYLES.map((s) => [s.id, s.id]),
  );
  style.value = currentStyleId();
  style.addEventListener('change', () => d.onStyle(style.value));

  const kind = select(
    'studio-spawn-kind',
    SPAWN_KINDS.map((k) => [k, C[`studio.spawn.kind.${k}`]]),
  );
  const ref = select('studio-spawn-ref', []);
  const fillRefs = () => {
    ref.replaceChildren(
      ...STUDIO_LISTS[kind.value as StudioSpawnKind].map((id) => h('option', { value: id }, id)),
    );
  };
  kind.addEventListener('change', fillRefs);
  const spawn = btn('studio-spawn', C['studio.spawn.add'], () => {
    if (ref.value !== '') send('studio.spawn', { kind: kind.value as StudioSpawnKind, ref: ref.value });
  });
  const clear = btn('studio-clear', C['studio.spawn.clear'], () => send('studio.clearSpawns', {}));
  const item = select(
    'studio-give-item',
    STUDIO_LISTS.items.map((id) => [id, id]),
  );
  const give = btn('studio-give', C['studio.give.add'], () => {
    if (item.value !== '') send('studio.give', { itemId: item.value });
  });
  const holding = h('p', { class: 'wdi-admin__status', ...tid('studio-items') });

  const overlayBoxes = OVERLAYS.map((id) => {
    const box = h('input', { type: 'checkbox', ...tid(`studio-overlay-${id}`) });
    box.addEventListener('change', () => store.toggleOverlay(id));
    return {
      id,
      box,
      row: h('label', { class: 'wdi-admin__row' }, box, h('span', {}, C[`studio.overlay.${id}`])),
    };
  });
  const status = h('p', { class: 'wdi-admin__status', role: 'status', ...tid('studio-status') });
  const problem = h('p', {
    class: 'wdi-admin__problem',
    role: 'alert',
    hidden: true,
    ...tid('studio-refused'),
  });
  const log = h('pre', { class: 'wdi-studio__log', ...tid('studio-log') });
  const group = (label: string, ...kids: Array<HTMLElement>) =>
    h(
      'div',
      { class: 'wdi-admin__group', role: 'group', 'aria-label': label },
      h('span', {}, label),
      ...kids,
    );

  const bar = h(
    'section',
    { class: 'wdi-admin__controls wdi-studio', 'aria-label': C['studio.title'], ...tid('studio-controls') },
    status,
    problem,
    group(C['studio.scene'], search, sceneList, spawnPick, go),
    noclip,
    group(C['studio.time'], ...phaseButtons, scrub),
    group(C['studio.speed'], ...scaleButtons, pause, step),
    group(C['studio.profile'], ...profileButtons),
    group(C['studio.overlays'], ...overlayBoxes.map((o) => o.row)),
    group(C['studio.style'], style),
    group(C['studio.spawn'], kind, ref, spawn, clear),
    group(C['studio.give'], item, give, holding),
    group(
      C['studio.report'],
      btn('studio-report-open', C['studio.report'], d.onReport),
      btn('studio-inbox-open', C['studio.inbox'], d.onInbox),
    ),
    btn('studio-signout', C['studio.signout'], d.onSignOut),
    h('details', {}, h('summary', {}, C['studio.log']), log),
  );
  root.append(bar);

  const refresh = () => {
    const s = store.snapshot;
    status.textContent = statusOf(s, C['studio.status']);
    noclip.setAttribute('aria-pressed', String(s?.noclip ?? false));
    pause.textContent = s?.paused ? C['studio.resume'] : C['studio.pause'];
    scaleButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(s?.scale === CLOCK_SCALES[i])));
    phaseButtons.forEach((b, i) =>
      b.setAttribute('aria-pressed', String(s?.time.phase === STUDIO_DAY_PHASES[i])),
    );
    profileButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(s?.profile === PROFILES[i])));
    holding.textContent =
      s === null || s.items.length === 0
        ? C['studio.items.none']
        : fill(C['studio.items'], { items: s.items.join(', ') });
    for (const o of overlayBoxes) o.box.checked = store.overlays.has(o.id);
    problem.hidden = store.refused === '';
    problem.textContent = store.refused;
    log.textContent = store.log.join('\n');
    for (const li of sceneList.querySelectorAll('button')) {
      li.setAttribute('aria-current', String(li.dataset.testid === `studio-scene-${s?.sceneId}`));
    }
  };
  store.bus.on('change', refresh);
  fillScenes();
  fillRefs();
  refresh();
  return {
    destroy() {
      store.bus.off('change', refresh);
      bar.remove();
    },
  };
}
