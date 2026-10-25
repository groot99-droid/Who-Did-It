// Round 9 (9W, N3): the NPC editor's side panel: the phase scrubber, one townsfolk kind's maps, fixed flag, ordered
// stations and holds, and Undo / Preview / Save. It only calls the model; the view draws what the model holds.
import { MAP_IDS, RoutineHold, scenes, type MapId } from '@wdi/content';
import { STUDIO_COPY as C, fill } from '../../ui/copy';
import { h, type Screen } from '../../ui/dom';
import type { SaveApi } from '../saveApi';
import type { NpcModel } from './NpcModel';
import type { NpcDraftApi } from './npcApi';
import { PHASES, phaseClassOf, stationKinds } from './routes';
import { setFixed, setHold, setMaps, setStations } from './routinesEdit';

export interface NpcPanelDeps {
  model: NpcModel;
  saveApi: SaveApi;
  draftApi: NpcDraftApi;
  roomId: string;
  /** The map of the scene the owner is in, to flag figures that do not walk it. */
  mapId: MapId | null;
  onClear: () => void;
  onClose: () => void;
}

export function mountNpcPanel(root: HTMLElement, d: NpcPanelDeps): Screen {
  const { model: m } = d;
  const tid = (id: string) => ({ 'data-testid': id });
  const btn = (id: string, text: string, on: () => void) => {
    const b = h('button', { type: 'button', class: 'wdi-admin__btn', ...tid(id) }, text);
    b.addEventListener('click', on);
    return b;
  };
  const edit = (r: Parameters<NpcModel['apply']>[0]) => void m.apply(r);
  const kinds = stationKinds(m.routines, Object.values(scenes));

  const phases = h('div', { class: 'wdi-admin__group', role: 'group', 'aria-label': C['studio.npc.title'] });
  const cls = h('span', { ...tid('studio-npc-class') });
  const figure = h('select', {
    class: 'wdi-admin__field',
    'aria-label': C['studio.npc.figure'],
    ...tid('studio-npc-figure'),
  });
  figure.addEventListener('change', () => m.select(figure.value));
  const body = h('div', { class: 'wdi-admin__group', ...tid('studio-npc-body') });
  const problems = h('ul', { class: 'wdi-studio__warn', role: 'alert', ...tid('studio-npc-problems') });
  const out = h('p', { role: 'status', ...tid('studio-npc-out') });
  const note = h('textarea', {
    class: 'wdi-admin__field',
    'aria-label': C['studio.npc.note'],
    ...tid('studio-npc-note'),
  });
  const previewing = h(
    'p',
    { hidden: true, role: 'status', ...tid('studio-npc-previewing') },
    C['studio.npc.previewing'],
  );
  const buttons = {
    undo: btn('studio-npc-undo', C['studio.npc.undo'], () => m.undo()),
    preview: btn('studio-npc-preview', C['studio.npc.preview'], () => {
      void m.preview(d.draftApi, d.roomId).then((ok) => (previewing.hidden = !ok));
    }),
    clear: btn('studio-npc-clear', C['studio.npc.preview.clear'], () => {
      d.onClear();
      previewing.hidden = true;
    }),
    save: btn('studio-npc-save', C['studio.npc.save'], () => {
      out.textContent = C['studio.npc.saving'];
      void m.save(d.saveApi, note.value.trim()).then((r) => {
        out.textContent =
          r === null ? '' : fill(C['studio.npc.saved'], { number: r.number, branch: r.branch });
      });
    }),
  };

  const stationRow = (stations: string[], i: number) => {
    const row = h(
      'li',
      { class: 'wdi-admin__group', ...tid(`studio-npc-station-${i}`) },
      h('span', {}, `${i + 1}. ${stations[i]}`),
    );
    const move = (to: number) => {
      const next = [...stations];
      next.splice(to, 0, next.splice(i, 1)[0]!);
      edit(setStations(m.routines, m.figure, next));
    };
    if (i > 0) row.append(btn(`studio-npc-up-${i}`, C['studio.npc.up'], () => move(i - 1)));
    if (i < stations.length - 1)
      row.append(btn(`studio-npc-down-${i}`, C['studio.npc.down'], () => move(i + 1)));
    row.append(
      btn(`studio-npc-remove-${i}`, C['studio.npc.remove'], () =>
        edit(
          setStations(
            m.routines,
            m.figure,
            stations.filter((_, j) => j !== i),
          ),
        ),
      ),
    );
    return row;
  };

  const render = () => {
    for (const b of phases.querySelectorAll('button'))
      b.setAttribute('aria-pressed', String(b.dataset.phase === m.phase));
    cls.textContent = fill(C['studio.npc.class'], { cls: phaseClassOf(m.phase, m.routines) });
    figure.replaceChildren(
      ...Object.entries(m.routines.townsfolk).map(([id, row]) =>
        h(
          'option',
          { value: id, selected: id === m.figure },
          d.mapId !== null && row.maps !== undefined && !row.maps.includes(d.mapId)
            ? fill(C['studio.npc.otherMap'], { id })
            : id,
        ),
      ),
    );
    const row = m.routines.townsfolk[m.figure]!;
    const fixed = h('input', { type: 'checkbox', checked: row.fixed, ...tid('studio-npc-fixed') });
    fixed.addEventListener('change', () => edit(setFixed(m.routines, m.figure, fixed.checked)));
    const maps = MAP_IDS.map((id) => {
      const box = h('input', {
        type: 'checkbox',
        checked: row.maps?.includes(id) ?? false,
        ...tid(`studio-npc-map-${id}`),
      });
      box.addEventListener('change', () => {
        const on = new Set(row.maps ?? []);
        if (box.checked) on.add(id);
        else on.delete(id);
        edit(setMaps(m.routines, m.figure, [...on]));
      });
      return h('label', {}, box, id);
    });
    const add = h(
      'select',
      { class: 'wdi-admin__field', 'aria-label': C['studio.npc.add'], ...tid('studio-npc-add') },
      h('option', { value: '' }, C['studio.npc.add']),
    );
    for (const k of kinds) add.append(h('option', { value: k }, k));
    add.addEventListener('change', () => {
      if (add.value !== '') edit(setStations(m.routines, m.figure, [...row.stations, add.value]));
    });
    const holds = h('ul', { ...tid('studio-npc-holds') });
    for (const k of kinds) {
      const sel = h(
        'select',
        { class: 'wdi-admin__field', 'aria-label': k, ...tid(`studio-npc-hold-${k}`) },
        h('option', { value: '' }, C['studio.npc.hold.none']),
      );
      for (const hold of RoutineHold.options)
        sel.append(h('option', { value: hold, selected: m.routines.holds[k] === hold }, hold));
      sel.addEventListener('change', () =>
        edit(setHold(m.routines, k, sel.value === '' ? null : (sel.value as RoutineHold))),
      );
      holds.append(h('li', {}, h('span', {}, k), sel));
    }
    body.replaceChildren(
      h('label', {}, fixed, C['studio.npc.fixed']),
      h('span', {}, `${C['studio.npc.maps']}. ${C['studio.npc.maps.all']}`),
      ...maps,
      h('span', {}, C['studio.npc.stations']),
      row.stations.length === 0
        ? h('p', {}, C['studio.npc.stations.any'])
        : h('ol', {}, ...row.stations.map((_, i) => stationRow(row.stations, i))),
      add,
      h('span', {}, C['studio.npc.holds']),
      holds,
    );
    problems.replaceChildren(...m.problems.map((p) => h('li', {}, p)));
  };

  for (const p of PHASES) {
    const b = btn(`studio-npc-phase-${p}`, C[`studio.npc.phase.${p}`], () => m.scrub(p));
    b.dataset.phase = p;
    phases.append(b);
  }
  const panel = h(
    'section',
    {
      class: 'wdi-admin__controls wdi-studio__editor',
      'aria-label': C['studio.npc.title'],
      ...tid('studio-npc-panel'),
    },
    h('h2', {}, C['studio.npc.title']),
    phases,
    cls,
    figure,
    body,
    problems,
    h('div', { class: 'wdi-admin__group' }, buttons.undo, buttons.preview, buttons.clear),
    previewing,
    note,
    buttons.save,
    out,
    btn('studio-npc-close', C['studio.npc.close'], d.onClose),
  );
  m.bus.addEventListener('change', render);
  render();
  root.append(panel);
  return {
    destroy() {
      m.bus.removeEventListener('change', render);
      panel.remove();
    },
  };
}
