import { TICK_RATE } from '@wdi/shared/constants';
import type { C2SPayloads } from '@wdi/shared/protocol';
import type { WorldFeed } from '../../net/world';
import { MUG_COPY as C, figureName, fill } from '../copy';
import { h } from '../dom';
import './mug.css';

/**
 * UI.md 14.37 the mugging prompt (Session 8E, round 8; GDD 3.24): the private `mugPrompt { muggerId, endsTick }`
 * opens a veil and a glass panel naming the mugger with the seconds left to answer, and a choice sends
 * `act.mug { choice }`. Nothing of the mugging is public: the prompt is the only wire trace, and the panel names the
 * mugger by the look its avatar wears (a figure's villager look, a seat's character), never by a seat. Part one
 * (DECISIONS A161) offers Pay; Run and Fight join the panel with the fists.
 */

/** What the target may answer (`C2S act.mug`). */
export type MugChoice = C2SPayloads['act.mug']['choice'];

/** The slice of the world feed the panel reads. */
export type MugFeed = Pick<WorldFeed, 'bus' | 'avatars' | 'snapshot' | 'clock'>;

export interface MugPrompt {
  /** True while a prompt is open. */
  open(): boolean;
  destroy(): void;
}

/** The countdown refreshes this often. */
const REFRESH_MS = 250;

/** Whole seconds left until `endsTick`, never below zero. */
export function remainingS(endsTick: number, tick: number): number {
  return Math.max(0, Math.ceil((endsTick - tick) / TICK_RATE));
}

/**
 * The mugger's nameplate from its avatar handle: a villager look reads by `figureName`, a seat's look by the
 * roster name of the character drawn; a handle no avatar wears (it left the scene) reads as a villager.
 */
export function muggerName(
  handle: string,
  avatars: ReturnType<WorldFeed['avatars']>,
  roster: ReturnType<WorldFeed['snapshot']>,
): string {
  const lookOf = avatars.find((a) => a.handle === handle)?.lookOf ?? '';
  if (lookOf === '' || lookOf.startsWith('villager')) return figureName(lookOf === '' ? 'villager' : lookOf);
  return roster.find((p) => p.id === lookOf)?.name ?? figureName('villager');
}

/** Mounts the prompt under `root`; a prompt opens it, a choice or the countdown's end closes it. */
export function mountMugPrompt(
  root: HTMLElement,
  feed: MugFeed,
  send: (choice: MugChoice) => void,
): MugPrompt {
  let veil: HTMLElement | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  const close = (): void => {
    if (timer !== null) clearInterval(timer);
    timer = null;
    veil?.remove();
    veil = null;
  };

  const show = (msg: { muggerId: string; endsTick: number }): void => {
    close();
    const timerEl = h('p', { class: 'wdi-mug__timer', 'data-testid': 'mug-timer' });
    const sync = (): void => {
      const s = remainingS(msg.endsTick, feed.clock().tick);
      timerEl.replaceChildren(fill(C['mug.timer'], { s }));
      if (s <= 0) close();
    };
    const choose = (choice: MugChoice) => (): void => {
      send(choice);
      close();
    };
    const button = (choice: MugChoice, label: string, cls: string) =>
      h(
        'button',
        { class: `wdi-btn ${cls}`, type: 'button', 'data-testid': `mug-${choice}`, onClick: choose(choice) },
        label,
      );
    veil = h(
      'div',
      { class: 'wdi-scrim wdi-mug wdi-anim-veil', 'data-testid': 'mug-prompt' },
      h(
        'section',
        {
          class: 'wdi-glass-panel wdi-mug__panel wdi-anim-panel',
          role: 'alertdialog',
          'aria-live': 'assertive',
        },
        h(
          'h2',
          { class: 'wdi-glass-panel__title', 'data-testid': 'mug-title' },
          fill(C['mug.title'], { name: muggerName(msg.muggerId, feed.avatars(), feed.snapshot()) }),
        ),
        h('p', { class: 'wdi-glass-panel__hint' }, C['mug.hint']),
        timerEl,
        h(
          'div',
          { class: 'wdi-mug__choices wdi-anim-list' },
          button('pay', C['mug.pay'], 'wdi-btn--primary'),
        ),
      ),
    );
    root.append(veil);
    sync();
    timer = setInterval(sync, REFRESH_MS);
  };

  feed.bus.on('mugPrompt', show);
  return {
    open: () => veil !== null,
    destroy: () => {
      feed.bus.off('mugPrompt', show);
      close();
    },
  };
}
