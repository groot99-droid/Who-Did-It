// Round 9 (9W, docs/round9/admin-studio.md 8): the Overview. Every scene of the current map is a card; the portals
// are links between them. Click a card to enter it; drag a link's end onto another scene's spawn to re-target it.
import { maps, mapOf, scenes, type SceneId } from '@wdi/content';
import { fill, STUDIO_COPY as C } from '../../ui/copy';
import { h, type Screen } from '../../ui/dom';
import { spawnsOf } from '../model';
import { SaveError, type SaveApi } from '../saveApi';
import { CARD, edgesOf, layoutOf, type CardPos, type Link } from './graph';
import type { OverviewModel } from './model';

const SVG = 'http://www.w3.org/2000/svg';
const PAD = 16;

export interface OverviewDeps {
  model: OverviewModel;
  /** The scene the owner is in; its map is the one shown. */
  sceneId: string;
  api: SaveApi;
  /** A card was clicked: open that scene in the World editor (exterior) or the Room editor (interior). */
  onEnter: (sceneId: string, kind: 'exterior' | 'interior') => void;
  onClose: () => void;
}

const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

export function mountOverview(root: HTMLElement, d: OverviewDeps): Screen {
  const { model } = d;
  const mapId = mapOf(d.sceneId as SceneId);
  const map = maps[mapId];
  const ids: string[] = [...map.scenes];
  const tid = (id: string) => ({ 'data-testid': id });
  const saved = (map as { layout?: Record<string, { x: number; y: number }> }).layout;
  const layout = layoutOf(ids, map.hub, model.links(ids), saved);
  const at = new Map<string, CardPos>(layout.cards.map((c) => [c.id, c]));

  const stage = h('div', {
    class: 'wdi-overview__stage',
    style: `width:${layout.w + 2 * PAD}px;height:${layout.h + 2 * PAD}px`,
    ...tid('studio-overview-stage'),
  });
  const lines = svg('svg', {
    class: 'wdi-overview__links',
    width: layout.w + 2 * PAD,
    height: layout.h + 2 * PAD,
  });
  const list = h('ul', { class: 'wdi-overview__list', ...tid('studio-overview-list') });
  const out = h('p', { class: 'wdi-admin__status', role: 'status', ...tid('studio-overview-out') });
  const note = h('input', {
    class: 'wdi-admin__field',
    placeholder: C['studio.edit.note'],
    'aria-label': C['studio.edit.note'],
    ...tid('studio-overview-note'),
  });
  const problem = h('p', {
    class: 'wdi-admin__problem',
    role: 'alert',
    hidden: true,
    ...tid('studio-overview-problem'),
  });
  const save = h(
    'button',
    { type: 'button', class: 'wdi-admin__btn', ...tid('studio-overview-save') },
    C['studio.overview.save'],
  );
  const close = h(
    'button',
    { type: 'button', class: 'wdi-admin__btn', ...tid('studio-overview-close') },
    C['studio.overview.close'],
  );

  /** Where each link leaves its card, as drawn last. */
  const starts = new Map<Link, { x1: number; y1: number }>();
  let drag: { link: Link; line: SVGLineElement } | null = null;
  const pos = (e: PointerEvent) => {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onMove = (e: PointerEvent) => {
    if (drag === null) return;
    const p = pos(e);
    drag.line.setAttribute('x2', String(p.x));
    drag.line.setAttribute('y2', String(p.y));
  };
  const onUp = (e: PointerEvent) => {
    const d0 = drag;
    if (d0 === null) return;
    drag = null;
    // The spawn chips show only while dragging, so the drop is read before the class goes.
    const chip = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-spawn]');
    stage.classList.remove('wdi-overview--dragging');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    d0.line.remove();
    if (chip?.dataset.scene !== undefined && chip.dataset.spawn !== undefined)
      model.retarget(d0.link.scene, d0.link.portal, chip.dataset.scene, chip.dataset.spawn);
  };
  const startDrag = (link: Link, e: PointerEvent) => {
    e.preventDefault();
    const edge = starts.get(link)!;
    const p = pos(e);
    const line = svg('line', {
      x1: edge.x1 + PAD,
      y1: edge.y1 + PAD,
      x2: p.x,
      y2: p.y,
      class: 'wdi-overview__drag',
    });
    lines.append(line);
    drag = { link, line };
    stage.classList.add('wdi-overview--dragging');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const cards = layout.cards.map((c) => {
    const scene = scenes[c.id as SceneId];
    const chips = h(
      'div',
      { class: 'wdi-overview__spawns' },
      ...spawnsOf(c.id).map((s) =>
        h(
          'span',
          {
            class: 'wdi-overview__chip',
            'data-scene': c.id,
            'data-spawn': s,
            ...tid(`studio-overview-spawn-${c.id}-${s}`),
          },
          s,
        ),
      ),
    );
    const card = h(
      'div',
      {
        class: `wdi-overview__card wdi-overview__card--${scene.kind}`,
        style: `left:${c.x + PAD}px;top:${c.y + PAD}px;width:${CARD.w}px;height:${c.h}px`,
        'data-scene': c.id,
        ...tid(`studio-overview-card-${c.id}`),
      },
      h(
        'button',
        {
          type: 'button',
          class: 'wdi-admin__btn',
          'aria-label': fill(C['studio.overview.enter'], { scene: c.id }),
        },
        h('strong', {}, scene.name),
        h('small', {}, `${c.id} · ${C[`studio.overview.kind.${scene.kind}`]}`),
      ),
      chips,
    );
    card.querySelector('button')!.addEventListener('click', () => d.onEnter(c.id, scene.kind));
    return card;
  });
  stage.append(lines, ...cards);

  /** The save's answer; the next edit replaces it with the list of unsaved scenes. */
  let said = '';
  const render = (keepSaid = false) => {
    if (!keepSaid) said = '';
    lines.replaceChildren();
    list.replaceChildren();
    starts.clear();
    for (const e of edgesOf(model.links(ids), at)) {
      const l = e.link;
      starts.set(l, e);
      lines.append(
        svg('line', {
          x1: e.x1 + PAD,
          y1: e.y1 + PAD,
          x2: e.x2 + PAD,
          y2: e.y2 + PAD,
          class: 'wdi-overview__link',
        }),
      );
      const end = svg('circle', {
        cx: e.x2 + PAD,
        cy: e.y2 + PAD,
        r: 4,
        class: 'wdi-overview__end',
        'data-testid': `studio-overview-end-${l.scene}-${l.portal}`,
      });
      end.addEventListener('pointerdown', (ev) => startDrag(l, ev as PointerEvent));
      lines.append(end);
      list.append(linkRow(l));
    }
    const changed = model.changed;
    save.disabled = changed.length === 0;
    problem.hidden = model.error === '';
    problem.textContent = model.error;
    out.textContent =
      said !== ''
        ? said
        : changed.length > 0
          ? fill(C['studio.overview.changed'], { scenes: changed.join(', ') })
          : '';
  };

  /** The keyboard path to the same edit: two selects per link. */
  const linkRow = (l: Link) => {
    const to = h(
      'select',
      {
        class: 'wdi-admin__field',
        'aria-label': fill(C['studio.overview.to'], { portal: l.portal }),
        ...tid(`studio-overview-to-${l.scene}-${l.portal}`),
      },
      ...ids.map((id) => h('option', { value: id }, id)),
    );
    const spawn = h('select', {
      class: 'wdi-admin__field',
      'aria-label': fill(C['studio.overview.spawn'], { portal: l.portal }),
      ...tid(`studio-overview-spawn-${l.scene}-${l.portal}`),
    });
    const fillSpawns = () =>
      spawn.replaceChildren(...spawnsOf(to.value).map((s) => h('option', { value: s }, s)));
    to.value = l.to;
    fillSpawns();
    spawn.value = l.toSpawn;
    to.addEventListener('change', () => {
      fillSpawns();
      model.retarget(l.scene, l.portal, to.value, spawn.value);
    });
    spawn.addEventListener('change', () => model.retarget(l.scene, l.portal, to.value, spawn.value));
    return h('li', {}, h('span', {}, `${l.scene} · ${l.portal}`), to, spawn);
  };

  save.addEventListener('click', () => {
    save.disabled = true;
    out.textContent = C['studio.edit.saving'];
    model.save(d.api, note.value).then(
      (r) => {
        said = r.map((x) => fill(C['studio.edit.saved'], { number: x.number, branch: x.branch })).join(' ');
        render(true);
      },
      (e: unknown) => {
        const why = e instanceof Error ? e.message : String(e);
        const problems = e instanceof SaveError ? e.problems : [];
        said = fill(C['studio.overview.failed'], { why: [why, ...problems].join('; ') });
        render(true);
      },
    );
  });
  close.addEventListener('click', d.onClose);

  const panel = h(
    'section',
    {
      class: 'wdi-admin__controls wdi-overview',
      'aria-label': C['studio.overview'],
      ...tid('studio-overview'),
    },
    h('header', {}, h('h2', {}, fill(C['studio.overview.title'], { map: map.name })), close),
    h(
      'p',
      { class: 'wdi-admin__status', ...tid('studio-overview-layout') },
      layout.source === 'map'
        ? fill(C['studio.overview.layout.map'], { map: mapId })
        : fill(C['studio.overview.layout.auto'], { map: mapId }),
    ),
    h('p', { class: 'wdi-admin__status' }, C['studio.overview.help']),
    problem,
    h('div', { class: 'wdi-overview__scroll' }, stage),
    h('details', {}, h('summary', {}, C['studio.overview.links']), list),
    note,
    save,
    out,
  );
  root.append(panel);
  const onChange = () => render();
  model.bus.on('change', onChange);
  render();
  return {
    destroy() {
      model.bus.off('change', onChange);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      panel.remove();
    },
  };
}
