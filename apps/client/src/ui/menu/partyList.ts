import { MENU_COPY as C, fill } from '../copy';
import { h } from '../dom';
import { LIST_REFRESH_MS, mapName, type ListParties } from './partyListModel';
import type { PartyListing } from '../../net/protocol';

export interface PartyListOptions {
  /** The device's profile code, so the server adds the private parties that invited it; null for a guest. */
  profile: string | null;
  list: ListParties;
  onPick(party: PartyListing): void;
  /** Test hook: the refresh period; defaults to `party.listRefreshS`. */
  refreshMs?: number;
}

/** The rows of the party list: leader, players / max, map, and a tag for a private party (a friend's). */
export function mountPartyList(host: HTMLElement, opts: PartyListOptions): { destroy(): void } {
  const list = h('ul', { class: 'wdi-menu-parties', 'data-testid': 'party-list' });
  const empty = h('p', { class: 'wdi-field__msg', 'data-testid': 'party-list-empty' }, C['parties.empty']);
  host.append(h('h3', { class: 'wdi-label' }, C['parties.title']), list, empty);

  const row = (p: PartyListing) => {
    const button = h(
      'button',
      {
        type: 'button',
        class: 'wdi-menu-parties__row',
        'data-testid': 'party-row',
        'data-code': p.code,
        'aria-label': fill(C['parties.row.label'], {
          leader: p.leader,
          n: p.players,
          max: p.max,
          map: mapName(p.map),
        }),
      },
      h('span', { class: 'wdi-menu-parties__leader' }, p.leader),
      h('span', {}, fill(C['parties.players'], { n: p.players, max: p.max })),
      h('span', { class: 'wdi-menu-parties__meta' }, mapName(p.map)),
      p.visibility === 'private' && h('span', { class: 'wdi-tag' }, C['parties.tag.friend']),
    );
    button.addEventListener('click', () => opts.onPick(p));
    return h('li', {}, button);
  };

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    const parties = await opts.list(opts.profile).catch(() => []);
    if (stopped) return;
    list.replaceChildren(...parties.map(row));
    empty.hidden = parties.length > 0;
    timer = setTimeout(() => void tick(), opts.refreshMs ?? LIST_REFRESH_MS);
  };
  void tick();
  return {
    destroy() {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      list.remove();
      empty.remove();
    },
  };
}
