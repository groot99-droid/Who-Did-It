import type Phaser from 'phaser';
import type { WorldFeed } from '../../net/world';
import { fill } from '../../ui/copy';
import { SCRIP_COPY as C } from '../../ui/copy/scrip';
import { h } from '../../ui/dom';
import { readPurse } from './purseView';
import './purse.css';

/** How long a change stays beside the amount. */
const CHANGE_MS = 1500;

export interface PurseHud {
  destroy(): void;
}

/**
 * The purse counter (round 8, GDD 3.23; UI.md 14.34.2), Session 8C: the own `Private.purse` in Scrip, and each change
 * beside it for a moment (a wage, a sale, a buy). Only this client sees it; others learn a band by inspect. It reads
 * the feed on the scene's update and redraws only on a change.
 */
export function mountPurseHud(scene: Phaser.Scene, feed: WorldFeed, parent: HTMLElement): PurseHud {
  const amount = h('span', { class: 'wdi-purse__amount', 'data-testid': 'purse-amount' });
  const change = h('span', { class: 'wdi-purse__change', hidden: true, 'data-testid': 'purse-change' });
  const root = h(
    'div',
    {
      class: 'wdi-purse wdi-anim-purse',
      role: 'status',
      'aria-label': C['purse.label'],
      'data-testid': 'purse',
    },
    amount,
    change,
  );
  parent.append(root);
  let last: number | null = null;
  let changeUntil = 0;

  const onUpdate = () => {
    const now = performance.now();
    const coins = feed.purse();
    if (coins !== last) {
      const r = readPurse(last, coins);
      last = coins;
      amount.textContent = fill(C['purse.amount'], { n: r.amount });
      if (r.delta !== 0) {
        change.textContent = fill(C[r.delta > 0 ? 'purse.gain' : 'purse.loss'], { n: Math.abs(r.delta) });
        root.dataset.change = r.delta > 0 ? 'gain' : 'loss';
        change.hidden = false;
        changeUntil = now + CHANGE_MS;
      }
    }
    if (!change.hidden && now >= changeUntil) {
      change.hidden = true;
      delete root.dataset.change;
    }
  };
  scene.events.on('update', onUpdate);
  onUpdate();
  return {
    destroy() {
      scene.events.off('update', onUpdate);
      root.remove();
    },
  };
}
