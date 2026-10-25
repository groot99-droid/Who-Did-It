// Round 9 (9T, docs/round9/admin-studio.md 3): the editor's side panel: the palette, the selected object's fields,
// undo and redo, and the diff. It only calls the session; the view draws what the session holds.
import { SCENE_IDS } from '@wdi/content';
import { STUDIO_COPY as C, fill } from '../../ui/copy';
import { h, type Screen } from '../../ui/dom';
import { spawnsOf } from '../model';
import { GRID_CHARS, type Cell, type Tool } from './gridEdit';
import { find, KINDS, pairedPortal, type Kind } from './sceneEdit';
import { scenes, type Scene } from '@wdi/content';
import type { EditorSession } from './session';
import { templatesFor } from './templates';

export function mountEditorPanel(root: HTMLElement, s: EditorSession): Screen {
  const tid = (id: string) => ({ 'data-testid': id });
  const btn = (id: string, text: string, on: () => void) => {
    const b = h('button', { type: 'button', class: 'wdi-admin__btn', ...tid(id) }, text);
    b.addEventListener('click', on);
    return b;
  };
  const field = (id: string, label: string, el: HTMLElement) =>
    h('label', { class: 'wdi-admin__row' }, h('span', {}, label), Object.assign(el, { ...tid(id) }));

  const kindSel = h('select', { class: 'wdi-admin__field', ...tid('studio-edit-kind') });
  kindSel.append(h('option', { value: '' }, C['studio.edit.select']));
  for (const k of KINDS) kindSel.append(h('option', { value: k }, C[`studio.edit.kind.${k}`]));
  const tplSel = h('select', { class: 'wdi-admin__field', hidden: true, ...tid('studio-edit-template') });
  const name = h('input', {
    class: 'wdi-admin__field',
    placeholder: C['studio.edit.name'],
    'aria-label': C['studio.edit.name'],
    ...tid('studio-edit-name'),
  });
  name.addEventListener('input', () => s.setName(name.value));
  const choose = () => {
    const kind = kindSel.value as Kind | '';
    tplSel.replaceChildren(
      ...(kind === '' ? [] : templatesFor(kind, s.scene.id)).map((t) =>
        h('option', { value: t.label }, t.label),
      ),
    );
    tplSel.hidden = kind === '';
    s.choose(kind === '' ? null : { kind, label: tplSel.value });
  };
  kindSel.addEventListener('change', choose);
  tplSel.addEventListener('change', choose);

  const toolSel = h('select', { class: 'wdi-admin__field', ...tid('studio-edit-tool') });
  for (const t of ['objects', 'brush', 'rect', 'fill', 'gate', 'path'] as const)
    toolSel.append(h('option', { value: t }, C[`studio.edit.tool.${t}`]));
  toolSel.addEventListener('change', () => s.setTool(toolSel.value as Tool));
  const cellName = (c: Cell) =>
    c === '.'
      ? C['studio.edit.cell.floor']
      : c === '#'
        ? C['studio.edit.cell.solid']
        : C[`studio.edit.cell.${c}`];
  const cellSel = h('select', { class: 'wdi-admin__field', hidden: true, ...tid('studio-edit-cell') });
  for (const c of GRID_CHARS) cellSel.append(h('option', { value: c }, cellName(c)));
  cellSel.value = s.cell;
  cellSel.addEventListener('change', () => s.setCell(cellSel.value as Cell));
  const num = (id: string, value: number) =>
    h('input', { type: 'number', min: 1, max: 200, class: 'wdi-admin__field', value, ...tid(id) });
  const wIn = num('studio-edit-width', s.scene.size.w);
  const hIn = num('studio-edit-height', s.scene.size.h);

  const profileSel = h('select', { class: 'wdi-admin__field', ...tid('studio-edit-profile') });
  for (const p of ['small', 'medium', 'large']) profileSel.append(h('option', { value: p }, p));
  profileSel.addEventListener('change', () => s.setGateProfile(profileSel.value as 'small'));
  const pathSel = h('select', { class: 'wdi-admin__field', ...tid('studio-edit-pathkind') });
  for (const k of ['patrol', 'wolfLoop']) pathSel.append(h('option', { value: k }, k));
  pathSel.addEventListener('change', () => s.setPathKind(pathSel.value as 'patrol'));
  const pathBar = h(
    'div',
    { class: 'wdi-admin__group', hidden: true, ...tid('studio-edit-pathbar') },
    pathSel,
    btn('studio-edit-pathfinish', C['studio.edit.pathFinish'], () => s.finishPath()),
    btn('studio-edit-pathclear', C['studio.edit.pathClear'], () => s.clearDraft()),
  );
  const gateBar = h(
    'div',
    { class: 'wdi-admin__group', hidden: true },
    field('studio-edit-gateprofile', C['studio.edit.profile'], profileSel),
  );
  const routes = h('div', { ...tid('studio-edit-routes') });

  const picked = h('div', { class: 'wdi-studio__picked', ...tid('studio-edit-selected') });
  const problem = h('p', { class: 'wdi-admin__problem', role: 'alert', ...tid('studio-edit-error') });
  const undo = btn('studio-edit-undo', C['studio.edit.undo'], () => s.undo());
  const redo = btn('studio-edit-redo', C['studio.edit.redo'], () => s.redo());
  const diff = h('pre', { class: 'wdi-studio__log', ...tid('studio-edit-diff') });

  const options = (ids: readonly string[], value: string | null, none = true) => {
    const sel = h('select', { class: 'wdi-admin__field' });
    if (none) sel.append(h('option', { value: '' }, '-'));
    for (const id of ids) sel.append(h('option', { value: id }, id));
    sel.value = value ?? '';
    return sel;
  };

  const fillPicked = () => {
    const sel = s.selection === null ? undefined : find(s.scene, s.selection);
    if (s.selection === null || sel === undefined)
      return picked.replaceChildren(h('p', {}, C['studio.edit.nothing']));
    const kids: HTMLElement[] = [
      h(
        'p',
        {},
        fill(C['studio.edit.selected'], { kind: s.selection.kind, id: s.selection.id, x: sel.x, y: sel.y }),
      ),
      btn('studio-edit-duplicate', C['studio.edit.duplicate'], () => s.duplicateSelected()),
      btn('studio-edit-delete', C['studio.edit.delete'], () => s.removeSelected()),
    ];
    if (s.selection.kind === 'lights') {
      const r = h('input', {
        type: 'number',
        min: 0.5,
        max: 8,
        step: 0.5,
        class: 'wdi-admin__field',
        value: (sel as unknown as { radiusTiles: number }).radiusTiles,
      });
      r.addEventListener('change', () => s.patchSelected({ radiusTiles: Number(r.value) }));
      kids.push(field('studio-edit-radius', C['studio.edit.radius'], r));
    }
    if (s.selection.kind === 'portals') {
      const p = sel as unknown as { id: string; from: string; to: string | null; toSpawn: string | null };
      const to = options(SCENE_IDS, p.to);
      const spawn = options(p.to === null ? [] : spawnsOf(p.to), p.toSpawn);
      to.addEventListener('change', () => s.patchSelected({ to: to.value || null, toSpawn: null }));
      spawn.addEventListener('change', () => s.patchSelected({ toSpawn: spawn.value || null }));
      const pair = pairedPortal(p, scenes as unknown as Record<string, Scene>);
      kids.push(
        field('studio-edit-to', C['studio.edit.to'], to),
        field('studio-edit-tospawn', C['studio.edit.toSpawn'], spawn),
        h(
          'p',
          {},
          pair === undefined ? C['studio.edit.unpaired'] : fill(C['studio.edit.paired'], { id: pair.id }),
        ),
      );
    }
    picked.replaceChildren(...kids);
  };

  const refresh = () => {
    fillPicked();
    problem.textContent = s.error;
    problem.hidden = s.error === '';
    cellSel.hidden = !['brush', 'rect', 'fill'].includes(s.tool);
    pathBar.hidden = s.tool !== 'path';
    gateBar.hidden = s.tool !== 'gate';
    routes.replaceChildren(
      ...[...s.scene.gates, ...s.scene.paths].map((o) =>
        btn(`studio-edit-route-${o.id}`, fill(C['studio.edit.routeRemove'], { id: o.id }), () =>
          s.removeRoute(o.id),
        ),
      ),
    );
    toolSel.value = s.tool;
    if (document.activeElement !== wIn) wIn.value = String(s.scene.size.w);
    if (document.activeElement !== hIn) hIn.value = String(s.scene.size.h);
    undo.disabled = !s.canUndo;
    redo.disabled = !s.canRedo;
    diff.textContent = s.diff.length === 0 ? C['studio.edit.nodiff'] : s.diff.join('\n');
    if (s.name === '' && document.activeElement !== name) name.value = '';
  };
  const panel = h(
    'section',
    {
      class: 'wdi-admin__controls wdi-studio__editor',
      'aria-label': C['studio.edit.title'],
      ...tid('studio-editor'),
    },
    h('h2', {}, C['studio.edit.title']),
    h('div', { class: 'wdi-admin__group' }, h('span', {}, C['studio.edit.tool']), toolSel, cellSel),
    gateBar,
    pathBar,
    routes,
    h('div', { class: 'wdi-admin__group' }, h('span', {}, C['studio.edit.add']), kindSel, tplSel, name),
    h(
      'div',
      { class: 'wdi-admin__group' },
      field('studio-edit-w', C['studio.edit.width'], wIn),
      field('studio-edit-h', C['studio.edit.height'], hIn),
      btn('studio-edit-resize', C['studio.edit.resize'], () =>
        s.resizeTo(Number(wIn.value), Number(hIn.value)),
      ),
    ),
    picked,
    problem,
    h('div', { class: 'wdi-admin__group' }, undo, redo),
    h('span', {}, C['studio.edit.diff']),
    diff,
  );
  root.append(panel);
  s.bus.on('change', refresh);
  refresh();
  return {
    destroy() {
      s.bus.off('change', refresh);
      panel.remove();
    },
  };
}
