import { WORLD_COPY as C } from './copy/world';
import { h } from './dom';

/**
 * Departed (round 10, C4b; GDD 3.33, UI.md 14.51.7): the screen of a Hitman who boarded the Dusk Train. He has left
 * play: the server sends his seat no scene, no figure and no ghost view (his own `Private.departed`), so the screen
 * stands in for the world, in the On-the-line screen's night colours, until the match ends. A meeting still opens
 * for him (he may vote and speak), so the World hides the screen while it sleeps for one.
 */
export interface DepartedScreen {
  setHidden(hidden: boolean): void;
  destroy(): void;
}

export function mountDeparted(parent: HTMLElement): DepartedScreen {
  const root = h(
    'section',
    { class: 'wdi-line', 'data-testid': 'departed', role: 'dialog', 'aria-label': C['departed.title'] },
    h('header', { class: 'wdi-line__band' }, h('h2', {}, C['departed.title'])),
    h('p', { class: 'wdi-line__cause', 'data-testid': 'departed-body' }, C['departed.body']),
    h('p', { class: 'wdi-line__kept' }, C['departed.meeting']),
  );
  parent.append(root);
  return {
    setHidden(hidden) {
      root.hidden = hidden;
    },
    destroy() {
      root.remove();
    },
  };
}
