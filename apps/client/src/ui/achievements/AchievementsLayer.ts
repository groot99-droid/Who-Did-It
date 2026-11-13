import achievementsJson from '@wdi/content/data/achievements.json';
import type { AchievementsFile } from '@wdi/content';
import type { NetworkService } from '../../net/NetworkService';
import { fill } from '../copy';
import { h } from '../dom';
import { ACHV_COPY as C } from './copy';
import { markEarned } from './store';
import './achievements.css';

type Title = (id: string) => string | undefined;

/**
 * The achievement toasts (GDD 3.28): the private `achv` message, recorded on the device when an achievement is done and
 * shown as a short toast. A step shows a smaller one. The title comes from `achievements.json` through `@wdi/content`.
 */
export function mountAchievements(
  parent: HTMLElement,
  net: Pick<NetworkService, 'bus'>,
  title: Title | null = null,
  hold = 4000,
): { destroy(): void } {
  const lookup: Title =
    title ?? ((id) => (achievementsJson as unknown as AchievementsFile).achievements[id]?.title);
  const box = h('div', { class: 'wdi-achv-toasts', 'aria-live': 'polite', 'data-testid': 'achv-toasts' });
  parent.append(box);
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const onAchv = (m: { id: string; step: number; steps: number; done: boolean }) => {
    const name = lookup(m.id) ?? m.id;
    if (m.done) markEarned(m.id);
    const toast = h(
      'p',
      {
        class: `wdi-glass wdi-achv-toast${m.done ? ' wdi-achv-toast--done' : ''}`,
        'data-testid': 'achv-toast',
        'data-id': m.id,
      },
      m.done
        ? fill(C['achv.toast.done'], { title: name })
        : fill(C['achv.toast.step'], { title: name, step: m.step, steps: m.steps }),
    );
    box.append(toast);
    const t = setTimeout(() => {
      timers.delete(t);
      toast.remove();
    }, hold);
    timers.add(t);
  };
  net.bus.on('achv', onAchv);
  return {
    destroy: () => {
      net.bus.off('achv', onAchv);
      for (const t of timers) clearTimeout(t);
      box.remove();
    },
  };
}
