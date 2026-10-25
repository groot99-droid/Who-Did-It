// Round 9 (9W, N4): the people section of the NPC panel: this scene's quest givers, a quest NPC's name and look, and
// the meeting-note lines. It only calls the model; the view draws what the model holds. Looks offered are the villager
// family, never a seat's card, and no talk line is keyed by a role.
import { Direction, TalkWhen } from '@wdi/content';
import { STUDIO_COPY as C, fill } from '../../ui/copy';
import { h, type Screen } from '../../ui/dom';
import type { SaveApi } from '../saveApi';
import type { PeopleModel } from './PeopleModel';
import type { NpcDraftApi } from './npcApi';
import {
  addGiver,
  fillsOf,
  linesOf,
  LISTS,
  moveGiver,
  removeGiver,
  setLine,
  setNpc,
  villagerLooks,
  type TalkList,
} from './people';

export interface PeoplePanelDeps {
  model: PeopleModel;
  saveApi: SaveApi;
  draftApi: NpcDraftApi;
  roomId: string;
  note: () => string;
}

export function mountPeoplePanel(root: HTMLElement, d: PeoplePanelDeps): Screen {
  const { model: m } = d;
  const tid = (id: string) => ({ 'data-testid': id });
  const btn = (id: string, text: string, on: () => void) => {
    const b = h('button', { type: 'button', class: 'wdi-admin__btn', ...tid(id) }, text);
    b.addEventListener('click', on);
    return b;
  };
  const select = (
    id: string,
    label: string,
    options: Array<[string, string]>,
    value: string,
    on: (v: string) => void,
  ) => {
    const s = h('select', { class: 'wdi-admin__field', 'aria-label': label, ...tid(id) });
    for (const [v, t] of options) s.append(h('option', { value: v, selected: v === value }, t));
    s.addEventListener('change', () => on(s.value));
    return s;
  };
  const facings = Direction.options.map((f): [string, string] => [f, f]);
  const npcIds = Object.keys(m.quests.npcs);
  let npcId = npcIds[0] ?? '';
  let list: TalkList = 'notes';
  const body = h('div', { class: 'wdi-npc__body', ...tid('studio-people-body') });
  const problems = h('ul', { class: 'wdi-studio__warn', role: 'alert', ...tid('studio-people-problems') });
  const out = h('p', { role: 'status', ...tid('studio-people-out') });

  const givers = () => {
    const scene = m.scene;
    const rows = (scene?.givers ?? []).map((g) =>
      h(
        'li',
        { ...tid(`studio-giver-${g.id}`) },
        h(
          'span',
          {},
          `${m.quests.npcs[g.npc]?.name ?? g.npc} ${fill(C['studio.people.giver.at'], { x: g.x, y: g.y })}`,
        ),
        btn(`studio-giver-pick-${g.id}`, fill(C['studio.people.giver.move'], { name: g.id }), () =>
          m.select(g.id),
        ),
        select(`studio-giver-facing-${g.id}`, C['studio.people.giver.facing'], facings, g.facing, (f) =>
          m.editScene(moveGiver(scene!, g.id, g.x, g.y, f as typeof g.facing)),
        ),
        btn(`studio-giver-remove-${g.id}`, C['studio.people.giver.remove'], () =>
          m.editScene(removeGiver(scene!, g.id)),
        ),
      ),
    );
    const name = h('input', {
      class: 'wdi-admin__field',
      placeholder: C['studio.people.giver.name'],
      'aria-label': C['studio.people.giver.name'],
      ...tid('studio-giver-name'),
    });
    const x = h('input', {
      class: 'wdi-admin__field',
      type: 'number',
      value: 0,
      'aria-label': 'x',
      ...tid('studio-giver-x'),
    });
    const y = h('input', {
      class: 'wdi-admin__field',
      type: 'number',
      value: 0,
      'aria-label': 'y',
      ...tid('studio-giver-y'),
    });
    const npc = select(
      'studio-giver-npc',
      C['studio.people.giver.npc'],
      npcIds.map((i) => [i, m.quests.npcs[i]!.name]),
      npcId,
      (v) => (npcId = v),
    );
    const face = select('studio-giver-new-facing', C['studio.people.giver.facing'], facings, 's', () => {});
    return [
      h('span', {}, C['studio.people.givers']),
      rows.length === 0 ? h('p', {}, C['studio.people.givers.none']) : h('ul', {}, ...rows),
      name,
      npc,
      x,
      y,
      face,
      btn('studio-giver-add', C['studio.people.giver.add'], () => {
        if (scene !== null)
          m.editScene(
            addGiver(
              scene,
              name.value.trim(),
              npc.value,
              Number(x.value),
              Number(y.value),
              face.value as never,
            ),
          );
      }),
    ];
  };

  const npcSection = () => {
    const row = m.quests.npcs[npcId];
    if (row === undefined) return [];
    const name = h('input', {
      class: 'wdi-admin__field',
      value: row.name,
      'aria-label': C['studio.people.npc.name'],
      ...tid('studio-npc-name'),
    });
    name.addEventListener('change', () => m.editQuests(setNpc(m.quests, npcId, { name: name.value })));
    const looks = villagerLooks().map((l): [string, string] => [l.id, l.name]);
    return [
      h('span', {}, C['studio.people.npc']),
      select(
        'studio-npc-pick',
        C['studio.people.npc'],
        npcIds.map((i) => [i, m.quests.npcs[i]!.name]),
        npcId,
        (v) => {
          npcId = v;
          render();
        },
      ),
      name,
      select('studio-npc-look', C['studio.people.npc.look'], looks, row.look, (v) =>
        m.editQuests(setNpc(m.quests, npcId, { look: v })),
      ),
    ];
  };

  const talk = () => {
    const lines = linesOf(m.talk, list);
    const rows = lines.map((l, i) => {
      const text = h('input', {
        class: 'wdi-admin__field',
        value: l.text,
        'aria-label': `${i + 1}`,
        ...tid(`studio-line-${i}`),
      });
      text.addEventListener('change', () => m.editTalk(setLine(m.talk, list, i, { ...l, text: text.value })));
      const kids: HTMLElement[] = [text];
      if (list !== 'smallTalk')
        kids.push(
          select(
            `studio-line-when-${i}`,
            C['studio.people.talk.when'],
            [['', C['studio.people.talk.when']], ...TalkWhen.options.map((w): [string, string] => [w, w])],
            l.when ?? '',
            (v) =>
              m.editTalk(
                setLine(m.talk, list, i, { text: l.text, ...(v === '' ? {} : { when: v as TalkWhen }) }),
              ),
          ),
        );
      kids.push(
        btn(`studio-line-remove-${i}`, C['studio.people.talk.remove'], () =>
          m.editTalk(setLine(m.talk, list, i, null)),
        ),
      );
      return h('li', {}, ...kids);
    });
    const add = h('input', {
      class: 'wdi-admin__field',
      'aria-label': C['studio.people.talk.add'],
      ...tid('studio-line-new'),
    });
    return [
      h('span', {}, C['studio.people.talk']),
      select(
        'studio-talk-list',
        C['studio.people.talk'],
        LISTS.map((l): [string, string] => [l, C[`studio.people.talk.list.${l}`]]),
        list,
        (v) => {
          list = v as TalkList;
          render();
        },
      ),
      h('p', {}, fill(C['studio.people.talk.fills'], { fills: fillsOf(list).join(', ') || '-' })),
      h('ol', {}, ...rows),
      add,
      btn('studio-line-add', C['studio.people.talk.add'], () => {
        if (add.value.trim() !== '') m.editTalk(setLine(m.talk, list, lines.length, { text: add.value }));
      }),
    ];
  };

  const render = () => {
    body.replaceChildren(...givers(), ...npcSection(), ...talk());
    problems.replaceChildren(...m.problems.map((p) => h('li', {}, p)));
  };

  const panel = h(
    'section',
    { 'aria-label': C['studio.people.title'], ...tid('studio-people-panel') },
    h('h3', {}, C['studio.people.title']),
    body,
    problems,
    h(
      'div',
      { class: 'wdi-admin__group' },
      btn('studio-people-undo', C['studio.people.undo'], () => m.undo()),
      btn('studio-people-preview', C['studio.people.preview'], () => void m.preview(d.draftApi, d.roomId)),
      btn('studio-people-save', C['studio.people.save'], () => {
        void m
          .save(d.saveApi, d.note())
          .then(
            (r) => (out.textContent = r.length === 0 ? '' : fill(C['studio.people.saved'], { n: r.length })),
          );
      }),
    ),
    out,
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
