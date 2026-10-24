import type { WorldFeed } from '../../net/world';
import { loadSceneName } from '../../view/sceneNames';
import { fill } from '../copy';
import { HIVE_COPY } from '../copy/hive';

// The World's shout cue (GDD 3.12 "The body bands", UI.md 14.41), Session 8R: the private `shout` reaches the nearest
// living Detective and Doctor when an NPC finds a body; the toast names the place, never a card or a seat.

interface Toaster {
  toast(text: string, kind: 'interact' | 'hazard' | 'warm'): void;
}

/** Shows each `shout` as a hazard toast naming its scene; returns the unbind. */
export function bindShout(feed: WorldFeed, hud: Toaster): () => void {
  const onShout = (m: { sceneId: string }) => {
    void loadSceneName(m.sceneId).then((place) =>
      hud.toast(fill(HIVE_COPY['hive.shout'], { place }), 'hazard'),
    );
  };
  feed.bus.on('shout', onShout);
  return () => feed.bus.off('shout', onShout);
}
