import relations from '@wdi/content/data/relations.json';
import type { WorldFeed } from '../../net/world';
import { INSPECT_COPY, inspectLine } from '../copy/inspect';
import { type InspectCard, mountInspectCard, noticedLine } from './InspectCard';

// The World's inspect wiring (GDD 3.22 "Inspect", UI.md 14.33), Session 8B: the result opens the card, the notice and
// the hunch are toasts. The World offers "Inspect" on the nearest figure in reach when nothing else is offered.

/** The server's reach (`relations.json` `inspect.rangeTiles`); the server re-checks it. */
export const INSPECT_REACH_TILES: number = relations.inspect.rangeTiles;
export const INSPECT_PROMPT = INSPECT_COPY['prompt.inspect'];

interface Toaster {
  toast(text: string, kind: 'interact' | 'hazard' | 'warm'): void;
}

export interface InspectBinding {
  card: InspectCard;
  off(): void;
}

export function bindInspect(feed: WorldFeed, hud: Toaster, parent: HTMLElement): InspectBinding {
  const card = mountInspectCard(parent);
  const onResult = (r: Parameters<InspectCard['show']>[0]) => card.show(r);
  const onNoticed = (m: { lookId: string }) => hud.toast(noticedLine(m.lookId), 'warm');
  const onHunch = (m: { copyId: string }) => {
    const line = inspectLine(m.copyId);
    if (line !== null) hud.toast(line, 'warm');
  };
  feed.bus.on('inspect.result', onResult);
  feed.bus.on('inspect.noticed', onNoticed);
  feed.bus.on('inspect.hunch', onHunch);
  return {
    card,
    off() {
      feed.bus.off('inspect.result', onResult);
      feed.bus.off('inspect.noticed', onNoticed);
      feed.bus.off('inspect.hunch', onHunch);
      card.destroy();
    },
  };
}
