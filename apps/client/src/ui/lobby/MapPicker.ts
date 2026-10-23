import { onArtStyleChanged } from '../../view/artStyle';
import hollowmere from '@wdi/content/data/maps/hollowmere.json';
import blackpine from '@wdi/content/data/maps/blackpine.json';
import { readFlags } from '../../flags';
import type { LobbySnapshot, NetworkService } from '../../net/NetworkService';
import { MAP_COPY as C } from '../copy/maps';
import { fill } from '../copy';
import { h, icon } from '../dom';

export interface MapPicker {
  /** Re-reads the lobby: the mode, the leader and `settings.map`. */
  update(s: LobbySnapshot): void;
  destroy(): void;
}

/** One map as the lobby shows it: the fields of `maps/<id>.json` the row reads. */
export interface MapRow {
  id: string;
  name: string;
  blurb: string;
  modes: readonly string[];
  thumbnail: string;
}

/** The map files in lobby order (`MAP_IDS`, append-only; a test pins the two lists together). */
export const MAP_ROWS: readonly MapRow[] = [hollowmere, blackpine];

/** The maps offered in a mode: those whose `modes` lists it (none in the quick mode, which does not walk). */
export const mapsForMode = (mode: string): MapRow[] => MAP_ROWS.filter((m) => m.modes.includes(mode));

/** The row to show as chosen: `settings.map` when it is offered, else the first offered map. */
export function chosenMap(rows: readonly MapRow[], mapId: string): MapRow | undefined {
  return rows.find((m) => m.id === mapId) ?? rows[0];
}

/**
 * The lobby's map row (GDD 3.13, round-5 world schemas 9.2): the name, the blurb and the thumbnail of every map
 * whose `modes` holds the chosen mode, under the frozen test id `map-select`. The leader picks with `net.setMap`;
 * everyone else reads one line. `ui/Lobby.ts` mounts it in its own slot under the settings and hides that slot in
 * the quick mode; the row also renders nothing when no map is offered. A map whose `thumb_<mapId>` is not in the
 * manifest yet shows its name and blurb only.
 */
export function mountMapPicker(root: HTMLElement, net: NetworkService): MapPicker {
  let last: LobbySnapshot | null = null;
  let thumbs: Record<string, string> = {};
  let destroyed = false;
  const flags = readFlags(location.search, location.hash);
  // Loaded on mount, not at import: the asset module brings Phaser, which the DOM-less unit tests cannot load.
  const loadThumbs = () =>
    void import('../../view/assets')
      .then(({ manifestImageUrls }) =>
        manifestImageUrls(
          flags.art,
          import.meta.env.BASE_URL,
          MAP_ROWS.map((m) => m.thumbnail),
        ),
      )
      .then((urls) => {
        if (destroyed) return;
        thumbs = urls;
        if (last) render(last);
      });
  loadThumbs();
  // A style switch (A79) re-reads the thumbnails from the new style's manifest.
  const offArt = onArtStyleChanged(loadThumbs);

  // A map whose thumbnail is not loaded yet keeps its frame (a dark box), so the cards do not jump.
  const thumb = (m: MapRow) =>
    thumbs[m.thumbnail]
      ? h('img', { class: 'wdi-map__thumb', src: thumbs[m.thumbnail], alt: '' })
      : h('span', { class: 'wdi-map__thumb wdi-map__thumb--empty', 'aria-hidden': 'true' });
  const tick = () => h('span', { class: 'wdi-map__tick', 'aria-hidden': 'true' }, icon('glyphs/glyph_check'));
  const text = (m: MapRow, title: string) =>
    h(
      'span',
      { class: 'wdi-map__text' },
      h('span', { class: 'wdi-map__name' }, title),
      h('span', { class: 'wdi-hint wdi-lobby__note' }, m.blurb),
    );

  function render(s: LobbySnapshot): void {
    root.replaceChildren();
    const rows = mapsForMode(s.settings.mode);
    const chosen = chosenMap(rows, s.settings.map);
    if (!chosen) return;
    const row = h('div', { class: 'wdi-map', 'data-testid': 'map-select', 'data-map': chosen.id });
    if (s.selfId === s.leaderId) {
      const label = h('span', { class: 'wdi-lobby__title', id: 'map-select-label' }, C['lobby.map.label']);
      const group = h('div', {
        class: 'wdi-map__list',
        role: 'radiogroup',
        'aria-labelledby': 'map-select-label',
      });
      for (const m of rows) {
        const on = m.id === chosen.id;
        group.append(
          h(
            'button',
            {
              type: 'button',
              role: 'radio',
              class: `wdi-map__option${on ? ' is-selected' : ''}`,
              'aria-checked': on ? 'true' : 'false',
              'aria-label': fill(C['lobby.map.pick'], { name: m.name }),
              'data-map': m.id,
              onclick: () => {
                if (!on) net.setMap(m.id);
              },
            },
            thumb(m),
            text(m, m.name),
            on && tick(),
          ),
        );
      }
      row.append(label, group);
    } else {
      row.append(
        h(
          'div',
          { class: 'wdi-map__option is-selected' },
          thumb(chosen),
          text(chosen, fill(C['lobby.map.current'], { name: chosen.name })),
          tick(),
        ),
      );
    }
    root.append(row);
  }

  return {
    update(s) {
      last = s;
      render(s);
    },
    destroy() {
      destroyed = true;
      offArt();
      root.replaceChildren();
    },
  };
}
